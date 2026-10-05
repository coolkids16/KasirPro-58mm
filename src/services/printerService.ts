import { 
  PrinterConnectionType, 
  PrinterDeviceStatus, 
  LinuxPrinterInfo 
} from '../types';

export interface PrintResult {
  success: boolean;
  message: string;
  bytesCount?: number;
  hexDump?: string;
  devicePath?: string;
}

// Common Bluetooth Printer GATT Services & Characteristics
const BLE_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Chinese 58mm POS
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  0xffe0, // Standard BLE Serial Service
];

const BLE_PRINTER_CHARS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  0xffe1, // Standard BLE Serial Characteristic
];

/**
 * Helper to safely invoke Tauri v1 & v2 IPC commands without white-screen crash
 */
export async function invokeTauri<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  if (typeof window === 'undefined') {
    throw new Error('Window environment tidak tersedia.');
  }

  const w = window as any;

  // 1. Tauri v2 Internal Invoke
  if (w.__TAURI_INTERNALS__?.invoke) {
    return await w.__TAURI_INTERNALS__.invoke(cmd, args);
  }

  // 2. Tauri v2 Core API (window.__TAURI__.core.invoke)
  if (w.__TAURI__?.core?.invoke) {
    return await w.__TAURI__.core.invoke(cmd, args);
  }

  // 3. Tauri v1 API (window.__TAURI__.invoke)
  if (typeof w.__TAURI__?.invoke === 'function') {
    return await w.__TAURI__.invoke(cmd, args);
  }

  throw new Error('Tauri API tidak terdeteksi. Aplikasi sedang berjalan di browser biasa.');
}

/**
 * Deteksi apakah runtime sedang berjalan di dalam desktop Tauri Linux
 */
export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return Boolean(
    w.__TAURI_INTERNALS__ || 
    w.__TAURI__ || 
    w.__TAURI_METADATA__ ||
    w.__TAURI_PATTERN__ !== undefined
  );
}

class ThermalPrinterService {
  private bluetoothDevice: any = null;
  private bluetoothCharacteristic: any = null;
  private serialPort: any = null;
  private defaultLinuxPath = '/dev/usb/lp0';

  private lastStatus: PrinterDeviceStatus = {
    connected: false,
    type: 'simulator',
    deviceName: 'Simulator Thermal 58mm',
    devicePath: '/dev/usb/lp0'
  };

  constructor() {
    if (isTauriEnvironment()) {
      this.lastStatus = {
        connected: true,
        type: 'tauri_raw',
        deviceName: 'Linux Desktop /dev/usb/lp0',
        devicePath: '/dev/usb/lp0',
        linuxInfo: {
          path: '/dev/usb/lp0',
          exists: true,
          writable: true,
          vendorId: '28e9',
          productId: '0289',
          details: 'Printer Thermal 58mm di Linux (/dev/usb/lp0)'
        }
      };
    }
  }

  getStatus(): PrinterDeviceStatus {
    return { ...this.lastStatus };
  }

  setDevicePath(path: string) {
    this.defaultLinuxPath = path;
    this.lastStatus.devicePath = path;
  }

  /**
   * Deteksi Environment saat ini
   */
  getRuntimeEnv(): 'tauri' | 'capacitor' | 'browser' {
    if (isTauriEnvironment()) {
      return 'tauri';
    }
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
      return 'capacitor';
    }
    return 'browser';
  }

  /**
   * Cek status port printer Linux (/dev/usb/lp0)
   */
  async checkLinuxPrinter(devicePath = this.defaultLinuxPath): Promise<LinuxPrinterInfo> {
    if (isTauriEnvironment()) {
      try {
        const info = await invokeTauri<LinuxPrinterInfo>('check_printer_device', {
          devicePath,
          device_path: devicePath
        });
        this.lastStatus.linuxInfo = info;
        this.lastStatus.connected = info.exists && info.writable;
        return info;
      } catch (err: any) {
        return {
          path: devicePath,
          exists: false,
          writable: false,
          details: err?.message || 'Gagal memeriksa device via Tauri IPC'
        };
      }
    }

    // Simulasi respons untuk preview browser
    const simulatedInfo: LinuxPrinterInfo = {
      path: devicePath,
      exists: true,
      writable: true,
      vendorId: '28e9',
      productId: '0289',
      details: 'Mode Simulasi Linux: /dev/usb/lp0 siap (Vendor: 28e9, PID: 0289)'
    };
    this.lastStatus.linuxInfo = simulatedInfo;
    return simulatedInfo;
  }

  /**
   * 1. Cetak Langsung Linux Desktop via Tauri IPC (/dev/usb/lp0)
   */
  async printViaTauri(data: Uint8Array, devicePath = this.defaultLinuxPath): Promise<PrintResult> {
    const bytesArray = Array.from(data);

    if (isTauriEnvironment()) {
      try {
        // Kirim argumen dengan nama snake_case dan camelCase untuk kompatibilitas penuh Rust
        const resultMsg = await invokeTauri<string>('tauri_raw', {
          bytes: bytesArray,
          device_path: devicePath,
          devicePath
        });

        this.lastStatus = {
          connected: true,
          type: 'tauri_raw',
          deviceName: `Linux ${devicePath} (28e9:0289)`,
          devicePath
        };

        return {
          success: true,
          message: resultMsg || `Berhasil dikirim ke ${devicePath}`,
          bytesCount: data.length,
          devicePath
        };
      } catch (err: any) {
        throw new Error(err || `Gagal menulis ke ${devicePath}`);
      }
    }

    // Jika dipanggil saat pengujian di browser, simulasikan alur tauri_raw tanpa error
    const hex = bytesArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    return {
      success: true,
      message: `Simulator Tauri Linux: Berhasil mengirim ${data.length} bytes ke ${devicePath} (Vendor: 28e9, PID: 0289)`,
      bytesCount: data.length,
      hexDump: hex + (data.length > 16 ? ' ...' : ''),
      devicePath
    };
  }

  /**
   * 2. Cetak via Web Bluetooth API (Android / Chrome Desktop)
   */
  async connectWebBluetooth(): Promise<PrinterDeviceStatus> {
    if (!('bluetooth' in navigator) || !navigator.bluetooth) {
      throw new Error('Web Bluetooth tidak didukung pada browser ini. Gunakan Google Chrome di Android atau Desktop.');
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_PRINTER_SERVICES
      });

      const server = await device.gatt?.connect();
      if (!server) throw new Error('Gagal terhubung ke GATT Server printer Bluetooth.');

      let characteristic = null;
      for (const serviceUuid of BLE_PRINTER_SERVICES) {
        try {
          const service = await server.getPrimaryService(serviceUuid);
          for (const charUuid of BLE_PRINTER_CHARS) {
            try {
              characteristic = await service.getCharacteristic(charUuid);
              if (characteristic) break;
            } catch {
              // try next
            }
          }
          if (characteristic) break;
        } catch {
          // try next
        }
      }

      if (!characteristic) {
        const services = await server.getPrimaryServices();
        for (const s of services) {
          const chars = await s.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              characteristic = c;
              break;
            }
          }
          if (characteristic) break;
        }
      }

      this.bluetoothDevice = device;
      this.bluetoothCharacteristic = characteristic;
      this.lastStatus = {
        connected: true,
        type: 'web_bluetooth',
        deviceName: device.name || 'Printer Bluetooth 58mm'
      };

      device.addEventListener('gattserverdisconnected', () => {
        this.lastStatus = {
          connected: false,
          type: 'web_bluetooth',
          deviceName: undefined,
          error: 'Printer terputus.'
        };
      });

      return this.lastStatus;
    } catch (err: any) {
      if (
        err?.name === 'SecurityError' ||
        err?.message?.includes('permissions policy') ||
        err?.message?.includes('disallowed')
      ) {
        throw new Error(
          'Web Bluetooth dibatasi oleh Permissions Policy browser/iframe. Gunakan Tauri Desktop Linux (/dev/usb/lp0) atau simulator.'
        );
      }
      if (err?.name === 'NotFoundError' || err?.message?.includes('cancelled')) {
        throw new Error('Pemilihan printer Bluetooth dibatalkan oleh pengguna.');
      }
      throw new Error(err?.message || 'Gagal menyambungkan Bluetooth.');
    }
  }

  async printViaWebBluetooth(data: Uint8Array): Promise<PrintResult> {
    if (!this.bluetoothCharacteristic) {
      await this.connectWebBluetooth();
    }

    if (!this.bluetoothCharacteristic) {
      throw new Error('Karakteristik Bluetooth printer tidak ditemukan.');
    }

    const CHUNK_SIZE = 50;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      if (this.bluetoothCharacteristic.writeValueWithoutResponse) {
        await this.bluetoothCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.bluetoothCharacteristic.writeValue(chunk);
      }
      await new Promise(res => setTimeout(res, 20));
    }

    return {
      success: true,
      message: `Berhasil mengirim ${data.length} bytes ke ${this.lastStatus.deviceName}`,
      bytesCount: data.length
    };
  }

  /**
   * 2.5 Cetak via Thermer / Bluetooth Print Android App (Deep Link / No Plugins)
   */
  async printViaThermer(data: Uint8Array): Promise<PrintResult> {
    try {
      let binaryString = '';
      const len = data.byteLength;
      for (let i = 0; i < len; i++) {
        binaryString += String.fromCharCode(data[i]);
      }
      const base64Data = window.btoa(binaryString);
      // Thermer / Bluetooth Print app custom URL scheme
      window.location.href = `bluetoothprint://base64/${base64Data}`;
      return {
        success: true,
        message: 'Dikirim ke aplikasi printer Thermer Android.'
      };
    } catch (err: any) {
      throw new Error(err?.message || 'Gagal memproses cetak Thermer.');
    }
  }

  /**
   * 3. Cetak via Web Serial API
   */
  async connectWebSerial(): Promise<PrinterDeviceStatus> {
    if (!('serial' in navigator) || !(navigator as any).serial) {
      throw new Error('Web Serial API tidak didukung pada browser ini.');
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      this.serialPort = port;
      this.lastStatus = {
        connected: true,
        type: 'web_serial',
        deviceName: 'USB/Serial Thermal 58mm'
      };
      return this.lastStatus;
    } catch (err: any) {
      if (
        err?.name === 'SecurityError' ||
        err?.message?.includes('permissions policy') ||
        err?.message?.includes('disallowed')
      ) {
        throw new Error(
          'Web Serial dibatasi pada lingkungan pratinjau browser. Gunakan Tauri Linux (/dev/usb/lp0).'
        );
      }
      if (err?.name === 'NotFoundError' || err?.message?.includes('cancelled')) {
        throw new Error('Pemilihan port USB/Serial dibatalkan oleh pengguna.');
      }
      throw new Error(err?.message || 'Gagal membuka port serial printer.');
    }
  }

  async printViaWebSerial(data: Uint8Array): Promise<PrintResult> {
    if (!this.serialPort) {
      await this.connectWebSerial();
    }
    const writer = this.serialPort.writable.getWriter();
    await writer.write(data);
    writer.releaseLock();

    return {
      success: true,
      message: `Berhasil mengirim ${data.length} bytes via Web Serial.`,
      bytesCount: data.length
    };
  }

  /**
   * 4. Dialog Cetak Standar Browser
   */
  printViaBrowser(receiptText: string): void {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Struk Pembayaran 58mm</title>
          <style>
            @page {
              size: 58mm auto;
              margin: 0;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              line-height: 1.25;
              width: 48mm;
              margin: 0 auto;
              padding: 4mm 1mm;
              white-space: pre-wrap;
              color: #000;
              background: #fff;
            }
          </style>
        </head>
        <body>${receiptText}</body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }

  /**
   * Dispatcher Eksekusi Cetak Terpadu
   * Otomatis mengarahkan ke tauri_raw jika di Linux Desktop
   */
  async printUnified(
    binaryData: Uint8Array,
    textData: string,
    preferredMethod?: PrinterConnectionType,
    devicePath = this.defaultLinuxPath
  ): Promise<PrintResult> {
    const env = this.getRuntimeEnv();

    // 1. Jika di environment Tauri atau user memilih tauri_raw
    if (preferredMethod === 'tauri_raw' || (env === 'tauri' && preferredMethod !== 'browser_print')) {
      return await this.printViaTauri(binaryData, devicePath);
    }

    // 2. Web Bluetooth jika dipilih secara spesifik
    if (preferredMethod === 'web_bluetooth') {
      return await this.printViaWebBluetooth(binaryData);
    }

    // 2.5 Thermer Android App Link jika dipilih secara spesifik
    if (preferredMethod === 'android_thermer') {
      return await this.printViaThermer(binaryData);
    }

    // 3. Web Serial jika dipilih secara spesifik
    if (preferredMethod === 'web_serial') {
      return await this.printViaWebSerial(binaryData);
    }

    // 4. Browser Print
    if (preferredMethod === 'browser_print') {
      this.printViaBrowser(textData);
      return {
        success: true,
        message: 'Dialog cetak browser 58mm dibuka.'
      };
    }

    // 5. Default Simulator
    const hex = Array.from(binaryData.slice(0, 24))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ') + (binaryData.length > 24 ? ' ...' : '');

    return {
      success: true,
      message: `Simulator 58mm: Data struk (${binaryData.length} bytes) siap dikirim ke printer fisik Linux!`,
      bytesCount: binaryData.length,
      hexDump: hex
    };
  }
}

export const printerService = new ThermalPrinterService();
export default printerService;
