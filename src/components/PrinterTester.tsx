import React, { useState } from 'react';
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
  RefreshCw,
  Zap,
  Info
} from 'lucide-react';
import { PrinterDeviceStatus, PrinterConnectionType } from '../types';
import { EscPosEncoder, padRow, padCenter, padSeparator } from '../utils/escpos';
import { printerService } from '../services/printerService';

interface PrinterTesterProps {
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
  const [selectedMethod, setSelectedMethod] = useState<PrinterConnectionType>('simulator');

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
      const res = await printerService.printUnified(binary, plainText, selectedMethod);
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
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Printer className="w-5 h-5 text-emerald-400" />
            Laboratorium & Uji Printer Thermal 58mm
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Uji kompatibilitas perintah biner ESC/POS, koneksi Web Bluetooth (Android/Chrome) dan Web Serial (Linux USB).
          </p>
        </div>

        {/* Runtime info badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Environment:</span>
          <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-xl text-xs font-mono uppercase font-bold">
            {runtimeEnv}
          </span>
        </div>
      </div>

      {/* Connection Drivers Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
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
              Hubungkan langsung ke printer thermal portabel Bluetooth (SPP / GATT 0xFFE0 / 0x18F0).
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

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl">
                <Usb className="w-5 h-5" />
              </span>
              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                Linux Desktop
              </span>
            </div>
            <h4 className="font-bold text-white text-sm">Web Serial / USB COM</h4>
            <p className="text-xs text-slate-400 mt-1">
              Akses kabel USB printer di Linux (/dev/ttyUSB*, /dev/ttyACM*) via Chrome Serial API.
            </p>
          </div>

          <button
            onClick={handleConnectSerial}
            disabled={loading}
            className="mt-4 w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/20"
          >
            <Usb className="w-3.5 h-3.5" />
            Buka Port USB/Serial
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <Terminal className="w-5 h-5" />
              </span>
              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                Native Wrapper
              </span>
            </div>
            <h4 className="font-bold text-white text-sm">Tauri & Capacitor Bridge</h4>
            <p className="text-xs text-slate-400 mt-1">
              Mode runtime native: Tauri Linux direct socket/raw USB atau Capacitor Android native plugin.
            </p>
          </div>

          <div className="mt-4 p-2 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400 text-center font-mono">
            {printerStatus.connected ? `Terhubung: ${printerStatus.deviceName}` : 'Siap Beroperasi'}
          </div>
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
              <div className="font-bold text-white text-xs group-hover:text-emerald-400 flex items-center justify-between">
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
              <div className="font-bold text-white text-xs group-hover:text-emerald-400 flex items-center justify-between">
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
              <div className="font-bold text-white text-xs group-hover:text-emerald-400 flex items-center justify-between">
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
              Metode Eksekusi Cetak Aktif:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setSelectedMethod('simulator')}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
                  selectedMethod === 'simulator'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                Simulator Web
              </button>
              <button
                onClick={() => setSelectedMethod('web_bluetooth')}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
                  selectedMethod === 'web_bluetooth'
                    ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                Web Bluetooth
              </button>
              <button
                onClick={() => setSelectedMethod('web_serial')}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
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
            {loading ? 'Mengirim Data...' : 'Cetak Teks Kustom ke Printer 58mm'}
          </button>
        </div>
      </div>

      {/* ESC/POS Command Reference Reference Sheet */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h4 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-emerald-400" />
          Kamus Perintah Biner Standar ESC/POS untuk Kertas 58mm
        </h4>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Fungsi</th>
                <th className="py-2.5 px-3">Kode Biner (Hex)</th>
                <th className="py-2.5 px-3">Kode ASCII</th>
                <th className="py-2.5 px-3">Deskripsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-white">Reset/Init Printer</td>
                <td className="py-2.5 px-3 text-cyan-400">1B 40</td>
                <td className="py-2.5 px-3 text-emerald-400">ESC @</td>
                <td className="py-2.5 px-3 font-sans text-slate-400">Mengembalikan printer ke status awal (clear buffer).</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-white">Rata Kiri / Tengah / Kanan</td>
                <td className="py-2.5 px-3 text-cyan-400">1B 61 00 / 01 / 02</td>
                <td className="py-2.5 px-3 text-emerald-400">ESC a 0 / 1 / 2</td>
                <td className="py-2.5 px-3 font-sans text-slate-400">Menentukan alignment teks horizontal baris berikutnya.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-white">Teks Tebal (Bold On/Off)</td>
                <td className="py-2.5 px-3 text-cyan-400">1B 45 01 / 00</td>
                <td className="py-2.5 px-3 text-emerald-400">ESC E 1 / 0</td>
                <td className="py-2.5 px-3 font-sans text-slate-400">Mengaktifkan/mematikan penekanan cetak huruf tebal.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-white">Ukuran Dobel (Header)</td>
                <td className="py-2.5 px-3 text-cyan-400">1D 21 11</td>
                <td className="py-2.5 px-3 text-emerald-400">GS ! 0x11</td>
                <td className="py-2.5 px-3 font-sans text-slate-400">Memperbesar font 2x tinggi & 2x lebar untuk nama toko.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-white">Buka Laci Kasir (Cash Drawer)</td>
                <td className="py-2.5 px-3 text-cyan-400">1B 70 00 19 FA</td>
                <td className="py-2.5 px-3 text-emerald-400">ESC p 0 25 250</td>
                <td className="py-2.5 px-3 font-sans text-slate-400">Menembakkan pulsa tegangan ke port RJ11 laci kasir.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-white">Potong Kertas (Auto Cut)</td>
                <td className="py-2.5 px-3 text-cyan-400">1D 56 42 00</td>
                <td className="py-2.5 px-3 text-emerald-400">GS V 66 0</td>
                <td className="py-2.5 px-3 font-sans text-slate-400">Mengaktifkan pisau pemotong kertas otomatis.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
