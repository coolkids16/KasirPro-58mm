import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  Bluetooth, 
  Usb, 
  Terminal, 
  Scissors, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  Send, 
  Zap, 
  Cpu, 
  ShieldCheck, 
  RefreshCw 
} from 'lucide-react';
import { 
  PrinterDeviceStatus, 
  PrinterConnectionType, 
  LinuxPrinterInfo 
} from '../types';
import { EscPosEncoder, padRow, padCenter, padSeparator } from '../utils/escpos';
import { printerService } from '../services/printerService';

export interface PrinterTesterProps {
  printerStatus: PrinterDeviceStatus;
  setPrinterStatus: (status: PrinterDeviceStatus) => void;
  runtimeEnv: 'tauri' | 'capacitor' | 'browser';
}

export const PrinterTester: React.FC<PrinterTesterProps> = ({
  printerStatus,
  setPrinterStatus,
  runtimeEnv
}) => {
  const [customText, setCustomText] = useState(
    'WARUNG KASIRPRO 58MM\nJl. Merdeka No. 45\n================================\nKopi Susu Aren         18.000\nEs Teh Manis            6.000\n--------------------------------\nTOTAL                  24.000\n================================\nTerima Kasih!'
  );
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [devicePathInput, setDevicePathInput] = useState('/dev/usb/lp0');
  const [linuxInfo, setLinuxInfo] = useState<LinuxPrinterInfo | null>(null);

  // Set default method based on runtime
  const [selectedMethod, setSelectedMethod] = useState<PrinterConnectionType>(
    runtimeEnv === 'tauri' ? 'tauri_raw' : 'tauri_raw'
  );

  // Cek otomatis device Linux saat komponen dibuka
  useEffect(() => {
    checkLinuxPort();
  }, []);

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

  const handleConnectSerial = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const status = await printerService.connectWebSerial();
      setPrinterStatus(status);
      setSelectedMethod('web_serial');
      setTestResult({
        success: true,
        msg: `Terhubung ke port USB/Serial printer.`
      });
    } catch (err: any) {
      setTestResult({ success: false, msg: err.message || 'Gagal konek Web Serial' });
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
    encoder.cut();

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
    encoder.newline(3);
    encoder.cut(true);
    executePrintData(encoder, '[Perintah GS V 0: Potong Kertas]', 'Potong Kertas');
  };

  // Test 4: Custom Text
  const handlePrintCustom = () => {
    const encoder = new EscPosEncoder();
    const lines = customText.split('\n');
    for (const l of lines) {
      encoder.textLine(l.substring(0, 32));
    }
    encoder.newline(2);
    encoder.cut();
    executePrintData(encoder, customText, 'Cetak Teks Kustom');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Printer className="w-5 h-5 text-emerald-400" />
              Laboratorium & Uji Printer Thermal 58mm
            </h2>
            <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold">
              Linux CachyOS
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Uji komunikasi langsung ke port <code className="text-cyan-300 font-mono">/dev/usb/lp0</code> (Vendor: 28e9, PID: 0289) via Tauri v2 Rust IPC.
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

      {/* Linux Hardware Target Card (Primary Feature for CachyOS) */}
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
              Printer thermal terdeteksi di Linux CachyOS pada device character <code className="text-cyan-300 font-mono">/dev/usb/lp0</code>.
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
                Rekomendasi CachyOS
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
          selectedMethod === 'web_bluetooth' 
            ? 'bg-slate-900 border-blue-500' 
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">
                <Bluetooth className="w-5 h-5" />
              </span>
              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                Android / BLE
              </span>
            </div>
            <h4 className="font-bold text-white text-sm">Web Bluetooth API</h4>
            <p className="text-xs text-slate-400 mt-1">
              Untuk printer thermal saku portabel Bluetooth di Android / Chrome.
            </p>
          </div>

          <button
            onClick={handleConnectBluetooth}
            disabled={loading}
            className="mt-4 w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
          >
            <Bluetooth className="w-3.5 h-3.5" />
            Cari Printer Bluetooth
          </button>
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

      {/* Main Testing Workstation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Quick Action Test Buttons */}
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
                encoder.newline(2);
                encoder.cut();
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

          {/* Quick Target Dispatcher Selector */}
          <div className="pt-3 border-t border-slate-800">
            <label className="text-xs text-slate-400 block mb-1.5 font-medium">
              Target Metode Eksekusi Cetak:
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => setSelectedMethod('tauri_raw')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition text-center ${
                  selectedMethod === 'tauri_raw'
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                Tauri Raw
              </button>
              <button
                onClick={() => setSelectedMethod('simulator')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition text-center ${
                  selectedMethod === 'simulator'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                Simulator
              </button>
              <button
                onClick={() => setSelectedMethod('web_bluetooth')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition text-center ${
                  selectedMethod === 'web_bluetooth'
                    ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                Bluetooth
              </button>
              <button
                onClick={() => setSelectedMethod('web_serial')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition text-center ${
                  selectedMethod === 'web_serial'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                Web Serial
              </button>
            </div>
          </div>
        </div>

        {/* Custom Text & 32-character Live Editor */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                Editor Teks Struk Bebas (Maks 32 Karakter/Baris)
              </h3>
            </div>

            <div className="mt-3">
              <label className="text-[11px] text-slate-400 flex items-center justify-between mb-1.5 font-mono">
                <span>Ruler 32 Karakter:</span>
                <span className="text-cyan-400">|..5...10...15...20...25...30.32|</span>
              </label>

              <textarea
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                rows={9}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-white leading-relaxed focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <button
            onClick={handlePrintCustom}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition"
          >
            <Send className="w-4 h-4" />
            {loading ? 'Mengirim Data...' : `Cetak Teks Kustom ke ${devicePathInput}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrinterTester;
