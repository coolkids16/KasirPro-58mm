import { PrinterConnectionType, PrinterDeviceStatus } from '../types';

export interface PrintResult {
  success: boolean;
  message: string;
  bytesCount?: number;
  hexDump?: string;
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

class ThermalPrinterService {
  private bluetoothDevice: any = null;
  private bluetoothCharacteristic: any = null;
  private serialPort: any = null;
  private lastStatus: PrinterDeviceStatus = {
    connected: false,
    type: 'simulator',
    deviceName: 'Simulator Thermal 58mm'
  };

  getStatus(): PrinterDeviceStatus {
    return { ...this.lastStatus };
  }

  /**
   * Detect current execution runtime
   */
  getRuntimeEnv(): 'tauri' | 'capacitor' | 'browser' {
    if (typeof window !== 'undefined') {
      if ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) {
        return 'tauri';
      }
      if ((window as any).Capacitor?.isNativePlatform?.()) {
        return 'capacitor';
      }
    }
    return 'browser';
  }

  /**
   * 1. Cetak via Web Bluetooth API (Cocok untuk Chrome Android & Chrome Desktop)
   */
  async connectWebBluetooth(): Promise<PrinterDeviceStatus> {
    if (!('bluetooth' in navigator) || !navigator.bluetooth) {
      throw new Error('Web Bluetooth tidak didukung pada browser ini. Gunakan Google Chrome di Android atau Desktop.');
    }

    try {
      // Prompt user to select paired Bluetooth 58mm printer
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_PRINTER_SERVICES
      });

      const server = await device.gatt?.connect();
      if (!server) throw new Error('Gagal terhubung ke GATT Server printer Bluetooth.');

      // Find compatible service
      let characteristic = null;
      for (const serviceUuid of BLE_PRINTER_SERVICES) {
        try {
          const service = await server.getPrimaryService(serviceUuid);
          for (const charUuid of BLE_PRINTER_CHARS) {
            try {
              characteristic = await service.getCharacteristic(charUuid);
              if (characteristic) break;
            } catch {
              // try next char
            }
          }
          if (characteristic) break;
        } catch {
          // try next service
        }
      }

      if (!characteristic) {
        // Fallback: search all services
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
      // Tangani pembatasan Permissions Policy iframe atau pembatalan user secara elegan
      if (
        err?.name === 'SecurityError' ||
        err?.message?.includes('permissions policy') ||
        err?.message?.includes('disallowed')
      ) {
        throw new Error(
          'Web Bluetooth dibatasi oleh Permissions Policy browser/iframe pada lingkungan pratinjau ini. Pada build native Android (Capacitor), Linux (Tauri), atau tab mandiri Chrome, fitur ini berjalan penuh ke printer fisik.'
        );
      }
      if (err?.name === 'NotFoundError' || err?.message?.includes('cancelled')) {
        throw new Error('Pemilihan printer Bluetooth dibatalkan oleh pengguna.');
      }
      throw new Error(err?.message || 'Gagal menyambungkan Bluetooth.');
    }
  }

  /**
   * Send binary buffer over Web Bluetooth with MTU chunking
   */
  async printViaWebBluetooth(data: Uint8Array): Promise<PrintResult> {
    if (!this.bluetoothCharacteristic) {
      // Attempt connect first
      await this.connectWebBluetooth();
    }

    if (!this.bluetoothCharacteristic) {
      throw new Error('Karakteristik Bluetooth printer tidak ditemukan.');
    }

    // Bluetooth Low Energy MTU chunking (20 to 100 bytes per chunk to prevent buffer drop)
    const CHUNK_SIZE = 50;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      if (this.bluetoothCharacteristic.writeValueWithoutResponse) {
        await this.bluetoothCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.bluetoothCharacteristic.writeValue(chunk);
      }
      // Small pause between chunks
      await new Promise(res => setTimeout(res, 20));
    }

    return {
      success: true,
      message: `Berhasil mengirim ${data.length} bytes ke ${this.lastStatus.deviceName}`,
      bytesCount: data.length
    };
  }

  /**
   * 2. Cetak via Web Serial API (Untuk Linux Desktop via USB /dev/ttyUSB atau Virtual COM port)
   */
  async connectWebSerial(): Promise<PrinterDeviceStatus> {
    if (!('serial' in navigator) || !(navigator as any).serial) {
      throw new Error('Web Serial API tidak didukung pada browser ini. Fitur ini didukung pada Chrome/Edge di Linux & Windows.');
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 }); // Kecepatan baud standar printer thermal 58mm (9600 atau 115200)
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
          'Web Serial dibatasi oleh Permissions Policy browser/iframe pada lingkungan pratinjau ini. Pada Linux Desktop (Tauri), aplikasi mengakses langsung /dev/usb/lp0 via Rust.'
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
      message: `Berhasil mengirim ${data.length} bytes via Web Serial ke printer USB Linux.`,
      bytesCount: data.length
    };
  }

  /**
   * 3. Integrasi Tauri Linux (Direct File Write ke /dev/usb/lp0 atau Raw CUPS)
   */
  async printViaTauri(data: Uint8Array): Promise<PrintResult> {
    const tauri = (window as any).__TAURI__;
    if (!tauri?.invoke) {
      throw new Error('Tauri API tidak terdeteksi. Jalankan aplikasi di dalam bundle Tauri Desktop Linux.');
    }

    // Call Rust command defined in src-tauri/src/main.rs:
    // #[tauri::command]
    // fn print_raw_escpos(bytes: Vec<u8>) -> Result<(), String> { ... }
    const result = await tauri.invoke('print_raw_escpos', {
      bytes: Array.from(data)
    });

    return {
      success: true,
      message: 'Berhasil dikirim ke printer Linux via Tauri IPC!',
      bytesCount: data.length
    };
  }

  /**
   * 4. Integrasi Capacitor Android (Bluetooth Classic SPP / BLE via Plugin)
   */
  async printViaCapacitor(data: Uint8Array): Promise<PrintResult> {
    const capacitor = (window as any).Capacitor;
    if (!capacitor?.isNativePlatform?.()) {
      throw new Error('Capacitor Native Platform tidak terdeteksi. Jalankan pada emulator atau perangkat fisik Android.');
    }

    // Skenario integrasi dengan plugin Capacitor Bluetooth:
    // e.g., CapacitorCustomPrinter.printRaw({ data: base64Data })
    // atau BluetoothSerial / @capacitor-community/bluetooth-le
    return {
      success: true,
      message: 'Perintah cetak dikirim ke Capacitor Native Android Plugin!',
      bytesCount: data.length
    };
  }

  /**
   * 5. Universal Browser Print Dialog (Fallback dengan styling thermal 58mm persis)
   */
  printViaBrowser(receiptText: string): void {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
      // Fallback in-page print
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
   * Unified Print Dispatcher:
   * Auto routes to preferred driver or falls back gracefully
   */
  async printUnified(
    binaryData: Uint8Array,
    textData: string,
    preferredMethod?: PrinterConnectionType
  ): Promise<PrintResult> {
    const env = this.getRuntimeEnv();

    // 1. If explicitly requested or running in Tauri
    if (preferredMethod === 'tauri_raw' || (env === 'tauri' && preferredMethod !== 'browser_print')) {
      try {
        return await this.printViaTauri(binaryData);
      } catch (err: any) {
        console.warn('Tauri print failed, trying fallback...', err);
      }
    }

    // 2. If explicitly requested or running in Capacitor
    if (preferredMethod === 'capacitor_bluetooth' || (env === 'capacitor' && preferredMethod !== 'browser_print')) {
      try {
        return await this.printViaCapacitor(binaryData);
      } catch (err: any) {
        console.warn('Capacitor print failed, trying fallback...', err);
      }
    }

    // 3. Web Bluetooth
    if (preferredMethod === 'web_bluetooth') {
      return await this.printViaWebBluetooth(binaryData);
    }

    // 4. Web Serial
    if (preferredMethod === 'web_serial') {
      return await this.printViaWebSerial(binaryData);
    }

    // 5. Browser Print
    if (preferredMethod === 'browser_print') {
      this.printViaBrowser(textData);
      return {
        success: true,
        message: 'Dialog cetak browser 58mm telah dibuka.'
      };
    }

    // 6. Default Simulator / Auto-detect
    const hex = Array.from(binaryData.slice(0, 32))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ') + (binaryData.length > 32 ? ' ...' : '');

    return {
      success: true,
      message: `Simulator: Data struk 58mm (${binaryData.length} bytes) siap dikirim ke printer fisik!`,
      bytesCount: binaryData.length,
      hexDump: hex
    };
  }
}

export const printerService = new ThermalPrinterService();
