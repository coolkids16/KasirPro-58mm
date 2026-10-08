import React, { useState, useEffect } from 'react';
import { CustomSelect } from './CustomSelect';
import { 
  Printer,
  Bluetooth, 
  Terminal, 
  Scissors, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  Cpu, 
  ShieldCheck, 
  RefreshCw,
  Save,
  FileText,
  Receipt,
  Settings2
} from 'lucide-react';
import { 
  PrinterDeviceStatus, 
  PrinterConnectionType, 
  LinuxPrinterInfo,
  StoreSettings,
  BluetoothDeviceOption
} from '../types';
import { EscPosEncoder, padRow, padCenter, padSeparator, loadLogoRasterBytes } from '../utils/escpos';
import { printerService } from '../services/printerService';
import { saveStoreSettingsToFirestore, auth } from '../services/firebase';
import { db } from '../db/db';

export interface PrinterTesterProps {
  printerStatus: PrinterDeviceStatus;
  setPrinterStatus: (status: PrinterDeviceStatus) => void;
  runtimeEnv: 'tauri' | 'capacitor' | 'browser';
  settings: StoreSettings;
  onUpdateSettings: (settings: StoreSettings) => void;
}

export const PrinterTester: React.FC<PrinterTesterProps> = ({
  printerStatus,
  setPrinterStatus,
  runtimeEnv,
  settings,
  onUpdateSettings
}) => {
  const [formData, setFormData] = useState<StoreSettings>({ ...settings });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [devicePathInput, setDevicePathInput] = useState(settings.linuxDevicePath || '/dev/usb/lp0');
  const [linuxInfo, setLinuxInfo] = useState<LinuxPrinterInfo | null>(null);

  // Set default method based on runtime
  const [selectedMethod, setSelectedMethod] = useState<PrinterConnectionType>(
    runtimeEnv === 'tauri' ? 'tauri_raw' : 'capacitor_bluetooth'
  );

  const [savedBtPrinter, setSavedBtPrinter] = useState<BluetoothDeviceOption | null>(() => printerService.getSavedBluetoothPrinter());
  const [pairedBtDevices, setPairedBtDevices] = useState<BluetoothDeviceOption[]>([]);
  const [isScanningBt, setIsScanningBt] = useState(false);
  const [showBtDeviceList, setShowBtDeviceList] = useState(false);

  // Sync formData whenever settings prop changes
  useEffect(() => {
    setFormData({ ...settings });
    if (settings.linuxDevicePath) {
      setDevicePathInput(settings.linuxDevicePath);
    }
  }, [settings]);

  // Cek otomatis device Linux saat komponen dibuka
  useEffect(() => {
    checkLinuxPort();
  }, [devicePathInput]);

  const checkLinuxPort = async () => {
    try {
      const info = await printerService.checkLinuxPrinter(devicePathInput);
      setLinuxInfo(info);
      if (info.exists && info.writable) {
        setPrinterStatus({
          connected: true,
          type: 'tauri_raw',
          deviceName: `Linux ${devicePathInput} (28e9:0289)`,
          devicePath: devicePathInput,
          linuxInfo: info
        });
      }
    } catch (err: any) {
      console.warn('Gagal cek device port:', err);
    }
  };

  const handleScanBtDevices = async () => {
    setIsScanningBt(true);
    setShowBtDeviceList(true);
    setTestResult(null);
    try {
      if (printerService.isBluetoothSerialAvailable()) {
        const devices = await printerService.listPairedBluetoothDevices();
        setPairedBtDevices(devices);
        if (devices.length === 0) {
          setTestResult({
            success: false,
            msg: 'Tidak ada printer Bluetooth yang terpasang (paired). Silakan buka Pengaturan Bluetooth HP Anda, cari & pasangkan printer Anda terlebih dahulu (PIN: 0000 atau 1234).'
          });
        }
      } else if (printerService.isWebBluetoothAvailable()) {
        await handleConnectBluetooth();
      } else {
        setTestResult({
          success: false,
          msg: 'Bluetooth belum aktif di runtime ini. Pastikan Anda menjalankan aplikasi di HP Android (APK).'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        msg: err.message || 'Gagal memindai perangkat Bluetooth.'
      });
    } finally {
      setIsScanningBt(false);
    }
  };

  const handleSelectBtDevice = async (device: BluetoothDeviceOption) => {
    setLoading(true);
    setTestResult(null);
    try {
      const status = await printerService.connectBluetoothSerial(device.address, device.name);
      setPrinterStatus(status);
      setSavedBtPrinter(device);
      setSelectedMethod('capacitor_bluetooth');
      setShowBtDeviceList(false);
      setTestResult({
        success: true,
        msg: `Berhasil terhubung ke ${device.name} (${device.address}) via Bluetooth Langsung (Mode PPOB)!`
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        msg: err.message || `Gagal menyambung ke ${device.name}`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectBtDevice = async () => {
    await printerService.disconnectBluetooth();
    printerService.clearSavedBluetoothPrinter();
    setSavedBtPrinter(null);
    setPrinterStatus({
      connected: false,
      type: 'simulator',
      deviceName: 'Simulator Thermal 58mm',
      devicePath: '/dev/usb/lp0'
    });
    setTestResult({
      success: true,
      msg: 'Koneksi printer Bluetooth telah diputus.'
    });
  };

  const handleConnectBluetooth = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const status = await printerService.connectWebBluetooth();
      setPrinterStatus(status);
      setSelectedMethod('web_bluetooth');
      setTestResult({
        success: true,
        msg: `Terhubung ke printer Bluetooth: ${status.deviceName}`
      });
    } catch (err: any) {
      setTestResult({ success: false, msg: err.message || 'Gagal konek Bluetooth' });
    } finally {
      setLoading(false);
    }
  };

  const executePrintData = async (encoder: EscPosEncoder, plainText: string, actionName: string) => {
    setLoading(true);
    setTestResult(null);
    try {
      const binary = encoder.encode();
      const res = await printerService.printUnified(
        binary, 
        plainText, 
        selectedMethod, 
        devicePathInput
      );
      setTestResult({
        success: true,
        msg: `${actionName}: Berhasil! (${res.message})`
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        msg: `${actionName}: Gagal! (${err.message})`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReceiptFormat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const updated = {
        ...formData,
        linuxDevicePath: devicePathInput
      };

      try {
        localStorage.setItem('kasirpro_settings', JSON.stringify(updated));
      } catch (e) {}

      await db.settings.put({ ...updated, id: 'main' });

      if (auth.currentUser) {
        await saveStoreSettingsToFirestore(updated);
      }

      onUpdateSettings(updated);
      printerService.setDevicePath(devicePathInput);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save receipt format:', err);
      const updated = { ...formData, linuxDevicePath: devicePathInput };
      try {
        localStorage.setItem('kasirpro_settings', JSON.stringify(updated));
      } catch (e) {}
      await db.settings.put({ ...updated, id: 'main' });
      onUpdateSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Test Sample Struk Toko dengan Pengaturan Aktual
  const handleTestPrintSample = async () => {
    const W = formData.paperWidthChars || 32;
    const feedCount = formData.feedLines !== undefined ? formData.feedLines : 1;
    const encoder = new EscPosEncoder();
    encoder.init();
    encoder.kickDrawer();

    if (formData.logoUrl) {
      try {
        const logoRasterBytes = await loadLogoRasterBytes(formData.logoUrl, 240);
        if (logoRasterBytes && logoRasterBytes.length > 0) {
          encoder.align('center');
          encoder.rasterImage(logoRasterBytes);
        }
      } catch (e) {
        console.warn('Failed to load logo raster in test print:', e);
      }
    }

    encoder.align('center');
    encoder.bold(true);
    encoder.doubleHeight(true);
    encoder.textLine(formData.storeName.toUpperCase());
    encoder.doubleHeight(false);
    encoder.bold(false);

    if (formData.address) {
      encoder.textLine(formData.address.substring(0, W));
    }
    if (formData.phone) {
      encoder.textLine('Telp: ' + formData.phone.substring(0, W - 6));
    }
    encoder.separator('=', W);
    encoder.align('left');
    encoder.twoColumn('No: INV-TEST-001', '05/10/26 12:30', W);
    encoder.twoColumn(`Kasir: ${formData.cashierName || 'Kasir 01'}`, 'Metode: TUNAI', W);
    encoder.separator('-', W);
    
    // Sample items
    encoder.textLine('Kopi Susu Aren Gula Asli');
    encoder.twoColumn('  2 x 18.000', `${formData.currencyPrefix || 'Rp'} 36.000`, W);
    encoder.textLine('Roti Bakar Cokelat Keju');
    encoder.twoColumn('  1 x 16.000', `${formData.currencyPrefix || 'Rp'} 16.000`, W);
    encoder.separator('-', W);
    
    encoder.twoColumn('Subtotal', `${formData.currencyPrefix || 'Rp'} 52.000`, W);
    encoder.separator('=', W);

    encoder.bold(true);
    encoder.doubleHeight(true);
    encoder.twoColumn('TOTAL', `${formData.currencyPrefix || 'Rp'} 52.000`, W);
    encoder.doubleHeight(false);
    encoder.bold(false);

    encoder.twoColumn('BAYAR', `${formData.currencyPrefix || 'Rp'} 100.000`, W);
    encoder.twoColumn('KEMBALI', `${formData.currencyPrefix || 'Rp'} 48.000`, W);
    encoder.separator('=', W);

    if (formData.footerMessage) {
      encoder.align('center');
      const lines = formData.footerMessage.split('\n');
      for (const l of lines) {
        encoder.textLine(l.substring(0, W));
      }
    }

    if (formData.enableAutoCut) {
      encoder.cut(false, feedCount);
    } else {
      encoder.feed(feedCount);
    }

    const plainLines = [
      padCenter(formData.storeName.toUpperCase(), W),
      formData.address ? padCenter(formData.address, W) : '',
      formData.phone ? padCenter('Telp: ' + formData.phone, W) : '',
      padSeparator('=', W),
      padRow('No: INV-TEST-001', '05/10/26 12:30', W),
      padRow(`Kasir: ${formData.cashierName || 'Kasir 01'}`, 'Metode: TUNAI', W),
      padSeparator('-', W),
      'Kopi Susu Aren Gula Asli',
      padRow('  2 x 18.000', `${formData.currencyPrefix || 'Rp'} 36.000`, W),
      'Roti Bakar Cokelat Keju',
      padRow('  1 x 16.000', `${formData.currencyPrefix || 'Rp'} 16.000`, W),
      padSeparator('-', W),
      padRow('Subtotal', `${formData.currencyPrefix || 'Rp'} 52.000`, W),
      padSeparator('=', W),
      padRow('TOTAL', `${formData.currencyPrefix || 'Rp'} 52.000`, W),
      padRow('BAYAR', `${formData.currencyPrefix || 'Rp'} 100.000`, W),
      padRow('KEMBALI', `${formData.currencyPrefix || 'Rp'} 48.000`, W),
      padSeparator('=', W)
    ];
    if (formData.footerMessage) {
      const fLines = formData.footerMessage.split('\n');
      for (const fl of fLines) plainLines.push(padCenter(fl, W));
    }
    for (let i = 0; i < feedCount; i++) plainLines.push('');

    await executePrintData(encoder, plainLines.join('\n'), 'Uji Cetak Sampel Toko');
  };

  // Test 1: 32 Karakter Grid Test
  const handleTest32Chars = () => {
    const encoder = new EscPosEncoder();
    encoder.align('center');
    encoder.bold(true);
    encoder.textLine('TEST BATAS 32 KARAKTER 58MM');
    encoder.bold(false);
    encoder.separator('=', 32);
    encoder.textLine('12345678901234567890123456789012');
    encoder.textLine('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456');
    encoder.separator('-', 32);
    encoder.twoColumn('KOLOM KIRI', 'KOLOM KANAN', 32);
    encoder.twoColumn('1 x Kopi Susu', 'Rp 18.000', 32);
    encoder.separator('=', 32);
    encoder.feed(formData.feedLines ?? 1);

    const plain = [
      padCenter('TEST BATAS 32 KARAKTER 58MM', 32),
      padSeparator('=', 32),
      '12345678901234567890123456789012',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
      padSeparator('-', 32),
      padRow('KOLOM KIRI', 'KOLOM KANAN', 32),
      padRow('1 x Kopi Susu', 'Rp 18.000', 32),
      padSeparator('=', 32),
      ''
    ].join('\n');

    executePrintData(encoder, plain, 'Uji Lebar 32 Karakter');
  };

  // Test 2: Buka Laci Kasir (Cash Drawer Kick)
  const handleKickDrawer = () => {
    const encoder = new EscPosEncoder();
    encoder.kickDrawer();
    executePrintData(encoder, '[Perintah ESC p 0 25 250: Buka Laci]', 'Buka Laci Kasir');
  };

  // Test 3: Potong Kertas (Paper Cut)
  const handleCutPaper = () => {
    const encoder = new EscPosEncoder();
    encoder.cut(true, formData.feedLines ?? 1);
    executePrintData(encoder, '[Perintah GS V 0: Potong Kertas]', 'Potong Kertas');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Printer className="w-5 h-5 text-emerald-400" />
              Laboratorium & Format Struk 58mm
            </h2>
            <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold">
              Linux OS
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Konfigurasi layout struk belanja, hemat kertas, dan uji driver hardware <code className="text-cyan-300 font-mono">/dev/usb/lp0</code>.
          </p>
        </div>

        {/* Runtime info badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Environment:</span>
          <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-xl text-xs font-mono uppercase font-bold flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5" />
            {runtimeEnv === 'tauri' ? 'Tauri v2 Desktop' : 'Web Preview / Browser'}
          </span>
        </div>
      </div>

      {/* Linux Hardware Target Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-cyan-500/30 p-6 rounded-2xl shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-white text-base">
                Driver Port Linux Desktop: {devicePathInput}
              </h3>
              <span className="text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded">
                VID: 28e9 • PID: 0289
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Jalur device printer thermal di Linux pada <code className="text-cyan-300 font-mono">/dev/usb/lp0</code>.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto">
            <input
              type="text"
              value={devicePathInput}
              onChange={(e) => {
                setDevicePathInput(e.target.value);
                printerService.setDevicePath(e.target.value);
              }}
              className="px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-xs font-mono text-cyan-300 w-44 focus:outline-none focus:border-cyan-500"
              placeholder="/dev/usb/lp0"
            />
            <button
              onClick={checkLinuxPort}
              className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition shrink-0"
              title="Periksa izin dan status ketersediaan port di sistem operasi"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Cek Port
            </button>
          </div>
        </div>

        {/* Linux Port Inspection Result */}
        {linuxInfo && (
          <div className="mt-4 p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className={`w-5 h-5 ${linuxInfo.writable ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div>
                <div className="font-bold text-white flex items-center gap-2">
                  <span>Status Device:</span>
                  <span className={linuxInfo.writable ? 'text-emerald-400' : 'text-amber-400'}>
                    {linuxInfo.writable ? 'Siap Ditulis (Ready)' : 'Izin Akses Perlu Diatur'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {linuxInfo.details}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setSelectedMethod('tauri_raw');
                handleTest32Chars();
              }}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition shrink-0 shadow-lg shadow-emerald-500/20"
            >
              <Zap className="w-3.5 h-3.5" />
              Test Cetak ke {devicePathInput}
            </button>
          </div>
        )}
      </div>

      {/* Connection Drivers Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`border p-5 rounded-2xl flex flex-col justify-between transition ${
          selectedMethod === 'tauri_raw' 
            ? 'bg-slate-900 border-cyan-500 shadow-md shadow-cyan-500/10' 
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl">
                <Cpu className="w-5 h-5" />
              </span>
              <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded font-bold">
                Rekomendasi Linux
              </span>
            </div>
            <h4 className="font-bold text-white text-sm">Tauri Raw (/dev/usb/lp0)</h4>
            <p className="text-xs text-slate-400 mt-1">
              Backend Rust menulis biner ESC/POS langsung ke file device printer thermal di Linux.
            </p>
          </div>

          <button
            onClick={() => {
              setSelectedMethod('tauri_raw');
              setTestResult({
                success: true,
                msg: `Metode aktif: Tauri Raw -> ${devicePathInput}`
              });
            }}
            className={`mt-4 w-full py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              selectedMethod === 'tauri_raw'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
            }`}
          >
            {selectedMethod === 'tauri_raw' ? '✓ Mode Aktif' : 'Pilih Tauri Raw'}
          </button>
        </div>

        <div className={`border p-5 rounded-2xl flex flex-col justify-between transition ${
          selectedMethod === 'capacitor_bluetooth' || selectedMethod === 'web_bluetooth'
            ? 'bg-slate-900 border-blue-500 shadow-md shadow-blue-500/10' 
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">
                <Bluetooth className="w-5 h-5" />
              </span>
              <span className="text-[10px] font-mono bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-bold">
                Rekomendasi Android (PPOB)
              </span>
            </div>
            <h4 className="font-bold text-white text-sm">Bluetooth Thermal (PPOB)</h4>
            <p className="text-xs text-slate-400 mt-1">
              Mencetak langsung via Bluetooth ke printer thermal 58mm persis seperti aplikasi PPOB tanpa aplikasi pihak ketiga!
            </p>

            {/* Saved / Connected Device Badge */}
            {savedBtPrinter ? (
              <div className="mt-3 p-2.5 bg-slate-950 border border-blue-500/30 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-xs font-bold text-white truncate max-w-[130px]">{savedBtPrinter.name}</span>
                  </div>
                  <button
                    onClick={handleDisconnectBtDevice}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-medium"
                    title="Putuskan printer"
                  >
                    Putus
                  </button>
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">{savedBtPrinter.address}</div>
              </div>
            ) : (
              <div className="mt-3 p-2 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                Belum ada printer Bluetooth terhubung
              </div>
            )}

            {/* Paired Device List Selector */}
            {showBtDeviceList && pairedBtDevices.length > 0 && (
              <div className="mt-3 p-2 bg-slate-950 border border-slate-750 rounded-xl space-y-1.5 max-h-36 overflow-y-auto">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Pilih Printer Paired di HP:
                </div>
                {pairedBtDevices.map((dev) => (
                  <button
                    key={dev.address}
                    onClick={() => handleSelectBtDevice(dev)}
                    className="w-full text-left p-1.5 hover:bg-blue-600/20 rounded-lg text-xs font-mono text-cyan-300 flex items-center justify-between transition"
                  >
                    <span className="font-bold truncate">{dev.name}</span>
                    <span className="text-[10px] text-slate-500 shrink-0 ml-1">{dev.address}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <button
              onClick={handleScanBtDevices}
              disabled={isScanningBt || loading}
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
            >
              <Bluetooth className="w-3.5 h-3.5" />
              {isScanningBt ? 'Memindai Perangkat...' : savedBtPrinter ? 'Ganti Printer Bluetooth' : 'Pilih Printer Bluetooth (PPOB)'}
            </button>

            <button
              onClick={() => {
                setSelectedMethod('capacitor_bluetooth');
                setTestResult({
                  success: true,
                  msg: savedBtPrinter 
                    ? `Mode aktif: Bluetooth PPOB -> ${savedBtPrinter.name}`
                    : 'Pilih printer Bluetooth Anda terlebih dahulu untuk mencetak langsung mode PPOB.'
                });
              }}
              className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                selectedMethod === 'capacitor_bluetooth' || selectedMethod === 'web_bluetooth'
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
              }`}
            >
              {selectedMethod === 'capacitor_bluetooth' || selectedMethod === 'web_bluetooth' ? '✓ Mode PPOB Aktif' : 'Pilih Mode Ini'}
            </button>
          </div>
        </div>

        <div className={`border p-5 rounded-2xl flex flex-col justify-between transition ${
          selectedMethod === 'simulator' 
            ? 'bg-slate-900 border-emerald-500' 
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <Terminal className="w-5 h-5" />
              </span>
              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                Simulasi UI
              </span>
            </div>
            <h4 className="font-bold text-white text-sm">Simulator 58mm</h4>
            <p className="text-xs text-slate-400 mt-1">
              Simulasi virtual pengiriman biner ESC/POS tanpa ketergantungan perangkat keras.
            </p>
          </div>

          <button
            onClick={() => {
              setSelectedMethod('simulator');
              setTestResult({
                success: true,
                msg: 'Beralih ke mode simulator virtual 58mm.'
              });
            }}
            className={`mt-4 w-full py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              selectedMethod === 'simulator'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
            }`}
          >
            {selectedMethod === 'simulator' ? '✓ Mode Aktif' : 'Pilih Simulator'}
          </button>
        </div>
      </div>

      {/* Status banner */}
      {testResult && (
        <div className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          testResult.success
            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
        }`}>
          <div className="flex items-center gap-3">
            {testResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="font-medium leading-relaxed">{testResult.msg}</span>
          </div>

          {!testResult.success && (
            <button
              onClick={() => {
                setSelectedMethod('simulator');
                setTestResult({
                  success: true,
                  msg: 'Beralih ke Simulator 58mm: Siap menguji perintah ESC/POS tanpa hardware fisik.'
                });
              }}
              className="shrink-0 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition"
            >
              Aktifkan Mode Simulator
            </button>
          )}
        </div>
      )}

      {/* Main Workstation: Uji Cepat & Format Struk 58mm */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Quick Action Test Buttons */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 pb-3 border-b border-slate-800">
            <Zap className="w-4 h-4 text-emerald-400" />
            Tombol Uji Perintah ESC/POS Cepat
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleTest32Chars}
              disabled={loading}
              className="p-4 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition group"
            >
              <div className="font-bold text-white text-xs group-hover:text-cyan-400 flex items-center justify-between">
                <span>1. Uji Lebar 32 Kolom</span>
                <span className="font-mono text-[10px] text-slate-500">58mm</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Mencetak ruler karakter angka 1 s/d 32 untuk memastikan margin pas dan tidak terpotong.
              </p>
            </button>

            <button
              onClick={handleKickDrawer}
              disabled={loading}
              className="p-4 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition group"
            >
              <div className="font-bold text-white text-xs group-hover:text-emerald-400 flex items-center justify-between">
                <span>2. Buka Laci Kasir</span>
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Mengirim sinyal pulsa solenoid <code className="text-cyan-400">ESC p 0 25 250</code> ke pin RJ11 drawer.
              </p>
            </button>

            <button
              onClick={handleCutPaper}
              disabled={loading}
              className="p-4 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition group"
            >
              <div className="font-bold text-white text-xs group-hover:text-indigo-400 flex items-center justify-between">
                <span>3. Uji Potong Kertas</span>
                <Scissors className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Mengirim perintah autocutter <code className="text-cyan-400">GS V 66 0</code> (jika printer mendukung pisau cutter).
              </p>
            </button>

            <button
              onClick={() => {
                const encoder = new EscPosEncoder();
                encoder.init();
                encoder.align('center');
                encoder.bold(true);
                encoder.doubleSize(true);
                encoder.textLine('DOUBLE SIZE');
                encoder.doubleSize(false);
                encoder.doubleHeight(true);
                encoder.textLine('DOUBLE HEIGHT');
                encoder.doubleHeight(false);
                encoder.bold(false);
                encoder.textLine('Normal Text 12x24');
                encoder.feed(formData.feedLines ?? 1);
                executePrintData(encoder, 'DOUBLE SIZE\nDOUBLE HEIGHT\nNormal Text', 'Uji Format Font');
              }}
              disabled={loading}
              className="p-4 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition group"
            >
              <div className="font-bold text-white text-xs group-hover:text-cyan-400 flex items-center justify-between">
                <span>4. Format Font & Bold</span>
                <span className="font-mono text-[10px] text-cyan-400">GS ! / ESC E</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Menguji variasi ukuran huruf header, tebal (bold), dan tinggi ganda.
              </p>
            </button>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleTestPrintSample}
              disabled={loading}
              className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-750 text-emerald-400 font-bold border border-emerald-500/30 rounded-xl text-xs flex items-center justify-center gap-2 transition"
            >
              <FileText className="w-4 h-4" />
              Cetak Sampel Struk Lengkap (Format Toko Anda)
            </button>
          </div>
        </div>

        {/* Right Column: FORMAT STRUK 58MM CONFIGURATION (Migrated & Integrated) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              Konfigurasi Format Struk 58mm
            </h3>
            {saveSuccess && (
              <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Format Tersimpan
              </span>
            )}
          </div>

          <form onSubmit={handleSaveReceiptFormat} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Lebar Kolom Kertas
                </label>
                <CustomSelect
                  value={formData.paperWidthChars}
                  onChange={val => setFormData({ ...formData, paperWidthChars: Number(val) })}
                  options={[
                    { label: '32 Karakter (Standar 58mm)', value: 32 },
                    { label: '42 Karakter (Font B 58mm)', value: 42 },
                    { label: '48 Karakter (Thermal 80mm)', value: 48 }
                  ]}
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Awalan Mata Uang
                </label>
                <input
                  type="text"
                  value={formData.currencyPrefix}
                  onChange={e => setFormData({ ...formData, currencyPrefix: e.target.value })}
                  placeholder="Rp"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono font-bold"
                />
              </div>
            </div>

            {/* Pengaturan Hemat Kertas & Feed Lines */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-slate-200 font-medium text-xs">
                    Jarak Spasi Kertas Bawah (Feed Lines)
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Jumlah baris kosong yang digulung di akhir struk.
                  </p>
                </div>
                <div className="w-48">
                  <CustomSelect
                    value={formData.feedLines !== undefined ? formData.feedLines : 1}
                    onChange={val => setFormData({ ...formData, feedLines: Number(val) })}
                    options={[
                      { label: '0 Baris (Ultra Hemat)', value: 0 },
                      { label: '1 Baris (Rekomendasi)', value: 1 },
                      { label: '2 Baris (Normal)', value: 2 },
                      { label: '3 Baris (Lebar)', value: 3 }
                    ]}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="text-slate-200 font-medium text-xs">
                    Perintah Auto-Cutter (Potong Kertas)
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Nonaktifkan untuk printer 58mm sobek manual agar tidak keluar kertas berlebih.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.enableAutoCut || false}
                  onChange={e => setFormData({ ...formData, enableAutoCut: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Pesan Catatan Kaki (Footer Struk)
              </label>
              <textarea
                rows={2}
                value={formData.footerMessage}
                onChange={e => setFormData({ ...formData, footerMessage: e.target.value })}
                placeholder="Terima kasih atas kunjungan Anda!&#10;Barang yang dibeli tidak dapat ditukar."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Menyimpan...' : 'Simpan Format Struk'}
              </button>

              <button
                type="button"
                onClick={handleTestPrintSample}
                disabled={loading}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
              >
                <Printer className="w-3.5 h-3.5 text-cyan-400" />
                Uji Cetak
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PrinterTester;
