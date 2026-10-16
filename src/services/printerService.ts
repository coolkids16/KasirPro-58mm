import { 
  PrinterConnectionType, 
  PrinterDeviceStatus, 
  LinuxPrinterInfo,
  BluetoothDeviceOption
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
    if (typeof window === 'undefined') {
      this.lastStatus = {
        connected: false,
        type: 'simulator',
        deviceName: 'Simulator Thermal 58mm',
        devicePath: this.defaultLinuxPath
      };
      return;
    }

    const w = window as any;
    const tauriDetected = Boolean(
      w.__TAURI_INTERNALS__ || 
      w.__TAURI__ || 
      w.__TAURI_METADATA__ ||
      w.__TAURI_PATTERN__ !== undefined
    );

    if (tauriDetected) {
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
    } else {
      const savedBt = this.getSavedBluetoothPrinter();
      if (savedBt) {
        this.lastStatus = {
          connected: false,
          type: 'capacitor_bluetooth',
          deviceName: savedBt.name,
          devicePath: savedBt.address,
          bluetoothDevice: savedBt
        };
      }
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
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform) {
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
   * Helper Bluetooth & PPOB Direct Printing
   */
  isBluetoothSerialAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean((window as any).bluetoothSerial);
  }

  isWebBluetoothAvailable(): boolean {
    return typeof navigator !== 'undefined' && Boolean((navigator as any).bluetooth);
  }

  getSavedBluetoothPrinter(): BluetoothDeviceOption | null {
    try {
      const saved = localStorage.getItem('kasirpro_bt_printer');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  }

  saveBluetoothPrinter(device: BluetoothDeviceOption) {
    try {
      localStorage.setItem('kasirpro_bt_printer', JSON.stringify(device));
      this.lastStatus = {
        connected: true,
        type: 'capacitor_bluetooth',
        deviceName: device.name,
        devicePath: device.address,
        bluetoothDevice: device
      };
    } catch {
      // ignore
    }
  }

  clearSavedBluetoothPrinter() {
    try {
      localStorage.removeItem('kasirpro_bt_printer');
      if (this.lastStatus.type === 'capacitor_bluetooth') {
        this.lastStatus = {
          connected: false,
          type: 'simulator',
          deviceName: 'Simulator Thermal 58mm',
          devicePath: this.defaultLinuxPath
        };
      }
    } catch {
      // ignore
    }
  }

  /**
   * Mengambil daftar printer Bluetooth yang sudah dipasangkan (paired) di HP Android
   */
  async listPairedBluetoothDevices(): Promise<BluetoothDeviceOption[]> {
    if (this.isBluetoothSerialAvailable()) {
      const bt = (window as any).bluetoothSerial;
      return new Promise((resolve, reject) => {
        bt.list(
          (devices: any[]) => {
            const mapped: BluetoothDeviceOption[] = (devices || []).map((d: any) => ({
              name: d.name || 'Printer Bluetooth 58mm',
              address: d.address || d.id || ''
            }));
            resolve(mapped);
          },
          (err: any) => {
            reject(new Error(err || 'Gagal membaca daftar perangkat Bluetooth yang terpasang di HP.'));
          }
        );
      });
    }

    return [];
  }

  /**
   * Sambungkan ke Printer Bluetooth Serial (SPP) secara langsung (Mode PPOB)
   */
  async connectBluetoothSerial(address: string, name = 'Printer Thermal 58mm'): Promise<PrinterDeviceStatus> {
    if (!this.isBluetoothSerialAvailable()) {
      throw new Error(
        'Plugin Bluetooth Serial belum aktif di runtime ini. Di Android Studio/Capacitor, pastikan plugin terpasang.'
      );
    }

    const bt = (window as any).bluetoothSerial;

    return new Promise((resolve, reject) => {
      // Putuskan koneksi sebelumnya agar fresh
      bt.disconnect(() => {}, () => {});

      // Sambungkan via RFCOMM / Insecure SPP (standar printer thermal PPOB)
      bt.connectInsecure(
        address,
        () => {
          this.saveBluetoothPrinter({ name, address });
          resolve(this.lastStatus);
        },
        (err: any) => {
          // Fallback ke connect biasa
          bt.connect(
            address,
            () => {
              this.saveBluetoothPrinter({ name, address });
              resolve(this.lastStatus);
            },
            (err2: any) => {
              reject(new Error(err2 || err || `Gagal menyambungkan ke ${name} (${address}). Pastikan printer menyala dan Bluetooth aktif.`));
            }
          );
        }
      );
    });
  }

  /**
   * Putuskan koneksi Bluetooth
   */
  async disconnectBluetooth(): Promise<void> {
    if (this.isBluetoothSerialAvailable()) {
      try {
        (window as any).bluetoothSerial.disconnect();
      } catch {
        // ignore
      }
    }
    if (this.bluetoothDevice?.gatt?.connected) {
      this.bluetoothDevice.gatt.disconnect();
    }
    this.lastStatus.connected = false;
  }

  /**
   * Cetak Langsung via Bluetooth (Mode PPOB)
   * Mengirim biner ESC/POS langsung ke printer Bluetooth tanpa aplikasi perantara
   */
  async printViaDirectBluetooth(data: Uint8Array): Promise<PrintResult> {
    // 1. Prioritas Utama: Bluetooth Serial SPP (Capacitor Android APK)
    if (this.isBluetoothSerialAvailable()) {
      const bt = (window as any).bluetoothSerial;
      const saved = this.getSavedBluetoothPrinter();

      // Cek apakah sudah terhubung
      const isConnected = await new Promise<boolean>((resolve) => {
        bt.isConnected(
          () => resolve(true),
          () => resolve(false)
        );
      });

      if (!isConnected) {
        if (!saved?.address) {
          throw new Error('Belum ada printer Bluetooth yang dipilih. Silakan pilih printer Bluetooth Anda terlebih dahulu.');
        }
        await this.connectBluetoothSerial(saved.address, saved.name);
      }

      // Kirim biner ESC/POS langsung ke printer thermal
      return new Promise<PrintResult>((resolve, reject) => {
        bt.write(
          data.buffer,
          () => {
            resolve({
              success: true,
              message: `Berhasil mencetak ke ${saved?.name || 'Printer Bluetooth'} via Bluetooth Langsung (Mode PPOB)!`,
              bytesCount: data.length
            });
          },
          (err: any) => {
            reject(new Error(err || 'Gagal mengirim data cetak ke printer Bluetooth.'));
          }
        );
      });
    }

    // 2. Web Bluetooth API (Google Chrome di Android / Desktop)
    if (this.isWebBluetoothAvailable()) {
      return await this.printViaWebBluetooth(data);
    }

    // 3. Mode Simulasi / Preview
    return {
      success: true,
      message: `Simulasi Bluetooth PPOB: Berhasil mengirim ${data.length} bytes ke printer thermal.`,
      bytesCount: data.length
    };
  }

  /**
   * Bagikan Struk ke Sistem Android / Aplikasi Lain (Thermer, WhatsApp, RawBT, dll)
   */
  async shareReceiptViaSystem(textData: string, title = 'Struk KasirPro'): Promise<PrintResult> {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title,
          text: textData
        });
        return {
          success: true,
          message: 'Dialog bagikan struk berhasil dibuka.'
        };
      } else {
        await navigator.clipboard.writeText(textData);
        return {
          success: true,
          message: 'Teks struk disalin ke clipboard.'
        };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return {
          success: false,
          message: 'Berbagi struk dibatalkan.'
        };
      }
      throw new Error(err?.message || 'Gagal membagikan struk.');
    }
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

    // 2. Direct Bluetooth Thermal (Mode PPOB Langsung)
    if (
      preferredMethod === 'capacitor_bluetooth' || 
      preferredMethod === 'web_bluetooth' ||
      (env === 'capacitor' && preferredMethod !== 'browser_print' && preferredMethod !== 'simulator' && preferredMethod !== 'android_thermer')
    ) {
      return await this.printViaDirectBluetooth(binaryData);
    }

    // 2.5 Thermer Android App Link jika dipilih secara spesifik
    if (preferredMethod === 'android_thermer') {
      try {
        return await this.printViaThermer(binaryData);
      } catch {
        return await this.shareReceiptViaSystem(textData, 'Struk KasirPro');
      }
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
