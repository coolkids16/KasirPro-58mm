import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  X, 
  Bluetooth, 
  Usb, 
  CheckCircle2, 
  Code, 
  Copy, 
  Check, 
  FileText,
  Cpu,
  Share2,
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Transaction, StoreSettings, PrinterConnectionType, BluetoothDeviceOption } from '../types';
import { generateReceiptText, generateEscPosBinary, generateEscPosBinaryAsync } from '../utils/escpos';
import { printerService } from '../services/printerService';

export interface ReceiptModalProps {
  transaction: Transaction;
  settings: StoreSettings;
  isOpen: boolean;
  onClose: () => void;
  onNewTransaction?: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  transaction,
  settings,
  isOpen,
  onClose,
  onNewTransaction
}) => {
  const [showHex, setShowHex] = useState(false);
  const [copiedHex, setCopiedHex] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSuccessMessage, setPrintSuccessMessage] = useState<string | null>(null);
  const [printErrorMessage, setPrintErrorMessage] = useState<string | null>(null);
  const [escPosBinary, setEscPosBinary] = useState<Uint8Array>(() => generateEscPosBinary(transaction, settings));
  const [savedBtPrinter, setSavedBtPrinter] = useState<BluetoothDeviceOption | null>(() => printerService.getSavedBluetoothPrinter());
  const [showBtPicker, setShowBtPicker] = useState(false);
  const [pairedBtDevices, setPairedBtDevices] = useState<BluetoothDeviceOption[]>([]);
  const [isLoadingBt, setIsLoadingBt] = useState(false);

  // Asynchronously generate rasterized binary containing custom logo if available
  useEffect(() => {
    let isMounted = true;
    generateEscPosBinaryAsync(transaction, settings).then((binary) => {
      if (isMounted) {
        setEscPosBinary(binary);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [transaction, settings]);

  useEffect(() => {
    if (isOpen) {
      setSavedBtPrinter(printerService.getSavedBluetoothPrinter());
      setShowBtPicker(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isTauri = printerService.getRuntimeEnv() === 'tauri';
  const linuxPath = settings.linuxDevicePath || '/dev/usb/lp0';

  const handleOpenBtPicker = async () => {
    setShowBtPicker(true);
    setIsLoadingBt(true);
    setPrintErrorMessage(null);
    try {
      if (printerService.isBluetoothSerialAvailable()) {
        const devices = await printerService.listPairedBluetoothDevices();
        setPairedBtDevices(devices);
        if (devices.length === 0) {
          setPrintErrorMessage('Tidak ada printer Bluetooth terpasang. Buka Pengaturan Bluetooth HP, cari & pasangkan printer Anda terlebih dahulu (PIN: 0000 / 1234).');
        }
      } else if (printerService.isWebBluetoothAvailable()) {
        await handlePrint('web_bluetooth');
        setShowBtPicker(false);
      } else {
        setPrintErrorMessage('Bluetooth tidak aktif di runtime ini. Jalankan di HP Android APK untuk mode PPOB.');
      }
    } catch (err: any) {
      setPrintErrorMessage(err.message || 'Gagal memuat printer Bluetooth.');
    } finally {
      setIsLoadingBt(false);
    }
  };

  const handleSelectBtDevice = async (device: BluetoothDeviceOption) => {
    setIsPrinting(true);
    setPrintErrorMessage(null);
    setPrintSuccessMessage(null);
    try {
      await printerService.connectBluetoothSerial(device.address, device.name);
      setSavedBtPrinter(device);
      setShowBtPicker(false);
      // Langsung cetak struk seketika
      const result = await printerService.printViaDirectBluetooth(escPosBinary);
      setPrintSuccessMessage(result.message);
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.8 }
      });
    } catch (err: any) {
      setPrintErrorMessage(err?.message || `Gagal mencetak ke ${device.name}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDirectPrintBluetooth = async () => {
    if (!savedBtPrinter && printerService.isBluetoothSerialAvailable()) {
      await handleOpenBtPicker();
      return;
    }
    await handlePrint('capacitor_bluetooth');
  };

  const handleShareReceipt = async () => {
    setIsPrinting(true);
    setPrintErrorMessage(null);
    try {
      const res = await printerService.shareReceiptViaSystem(receiptPlainText, `Struk ${transaction.invoiceNumber}`);
      setPrintSuccessMessage(res.message);
    } catch (err: any) {
      setPrintErrorMessage(err.message || 'Gagal membagikan struk.');
    } finally {
      setIsPrinting(false);
    }
  };

  const receiptPlainText = generateReceiptText(transaction, settings);
  const hexDump = Array.from(escPosBinary)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');

  const handlePrint = async (method?: PrinterConnectionType) => {
    setIsPrinting(true);
    setPrintSuccessMessage(null);
    setPrintErrorMessage(null);

    // Otomatis arahkan ke tauri_raw jika method tidak ditentukan dan runtime adalah Tauri
    const chosenMethod = method || (isTauri ? 'tauri_raw' : 'simulator');

    try {
      const result = await printerService.printUnified(
        escPosBinary,
        receiptPlainText,
        chosenMethod,
        linuxPath
      );

      if (result.success) {
        setPrintSuccessMessage(result.message);
        confetti({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.8 }
        });
      }
    } catch (err: any) {
      setPrintErrorMessage(err.message || 'Gagal mencetak struk.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleCopyHex = () => {
    navigator.clipboard.writeText(hexDump);
    setCopiedHex(true);
    setTimeout(() => setCopiedHex(false), 2000);
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(receiptPlainText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col md:flex-row">
        
        {/* Left Side: Realistic 58mm Thermal Paper Simulator */}
        <div className="bg-slate-950 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-800">
          <div className="text-xs text-slate-400 mb-2 flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Simulasi Kertas Thermal 58mm (32 Karakter)
          </div>

          {/* Paper Container */}
          <div className="w-[280px] bg-[#fdfdf9] text-zinc-900 shadow-2xl rounded-sm p-4 relative font-mono text-[11px] leading-snug border-t-8 border-b-8 border-dashed border-zinc-300">
            {/* 32-character boundary ruler hint */}
            <div className="text-[9px] text-zinc-400 text-center border-b border-zinc-200 pb-1 mb-2 font-mono select-none">
              |..5...10...15...20...25...30.32|
            </div>

            {settings.logoUrl && (
              <div className="flex justify-center mb-2 pb-2 border-b border-zinc-200">
                <img 
                  src={settings.logoUrl} 
                  alt="Logo Toko" 
                  className="max-h-12 max-w-[120px] object-contain filter grayscale contrast-125"
                />
              </div>
            )}

            <pre className="whitespace-pre-wrap font-mono font-medium tracking-tight text-zinc-800 break-words select-all">
              {receiptPlainText}
            </pre>

            {/* Jagged Bottom Thermal Tear Effect */}
            <div className="absolute -bottom-2 left-0 right-0 h-2 bg-[radial-gradient(circle_at_50%_0%,_transparent_4px,#fdfdf9_4px)] bg-[length:10px_10px] transform rotate-180 opacity-90" />
          </div>

          <div className="text-[11px] text-slate-500 mt-3 text-center">
            Format: Font A (12x24 dots) • 32 char/baris • ESC/POS
          </div>
        </div>

        {/* Right Side: Printing Actions & Drivers */}
        <div className="p-6 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Printer className="w-5 h-5 text-emerald-400" />
                  Cetak Struk Thermal 58mm
                </h3>
                <p className="text-xs text-slate-400">Invoice: #{transaction.invoiceNumber}</p>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Linux Hardware Target Badge */}
            <div className="mt-3 p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                <Cpu className="w-4 h-4 text-cyan-400" />
                Target Port: <code className="font-mono text-cyan-300">{linuxPath}</code>
              </span>
              <span className="font-mono text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                VID: 28e9 PID: 0289
              </span>
            </div>

            {/* Notification messages */}
            {printSuccessMessage && (
              <div className="mt-3 p-3 bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{printSuccessMessage}</span>
              </div>
            )}

            {printErrorMessage && (
              <div className="mt-3 p-3 bg-rose-950/60 border border-rose-500/30 text-rose-300 rounded-xl text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <X className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{printErrorMessage}</span>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-rose-500/20">
                  <button
                    onClick={() => handlePrint('simulator')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold transition"
                  >
                    Gunakan Simulator 58mm
                  </button>
                  <button
                    onClick={() => handlePrint('browser_print')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold transition"
                  >
                    Cetak Dialog Browser (PDF)
                  </button>
                </div>
              </div>
            )}

            {/* Primary Print Action Area */}
            <div className="mt-4 space-y-2.5">
              {isTauri ? (
                /* Desktop Linux Primary Button */
                <>
                  <button
                    onClick={() => handlePrint('tauri_raw')}
                    disabled={isPrinting}
                    className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 text-sm transition-all disabled:opacity-50"
                  >
                    <Cpu className="w-4 h-4" />
                    {isPrinting ? 'Mengirim Data ke Printer...' : `Cetak ke ${linuxPath} (Tauri Linux)`}
                  </button>

                  <button
                    onClick={handleDirectPrintBluetooth}
                    disabled={isPrinting}
                    className="w-full py-2.5 px-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <Bluetooth className="w-3.5 h-3.5 text-blue-400" />
                    Cetak Bluetooth (Mode PPOB)
                  </button>
                </>
              ) : (
                /* Mobile Android Primary Button (Direct Bluetooth PPOB) */
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDirectPrintBluetooth}
                      disabled={isPrinting}
                      className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 text-sm transition-all disabled:opacity-50"
                    >
                      <Bluetooth className="w-4 h-4 text-cyan-300" />
                      {isPrinting
                        ? 'Mengirim ke Printer...'
                        : savedBtPrinter
                        ? `⚡ Cetak Langsung: ${savedBtPrinter.name}`
                        : '⚡ Hubungkan & Cetak Bluetooth (PPOB)'}
                    </button>

                    <button
                      onClick={handleOpenBtPicker}
                      disabled={isPrinting}
                      className="p-3 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-750 rounded-xl transition shrink-0"
                      title="Pilih atau ganti printer Bluetooth yang dipasangkan di HP"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingBt ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Inline Paired Devices Selector */}
                  {showBtPicker && (
                    <div className="p-3 bg-slate-950 border border-blue-500/30 rounded-xl space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between text-xs font-bold text-white">
                        <span className="flex items-center gap-1.5 text-cyan-300">
                          <Bluetooth className="w-3.5 h-3.5" />
                          Pilih Printer Paired di HP:
                        </span>
                        <button
                          onClick={() => setShowBtPicker(false)}
                          className="text-slate-400 hover:text-white text-xs"
                        >
                          ✕ Tutup
                        </button>
                      </div>

                      {isLoadingBt ? (
                        <div className="text-center py-2.5 text-xs text-slate-400">
                          Membaca daftar printer Bluetooth di HP...
                        </div>
                      ) : pairedBtDevices.length > 0 ? (
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {pairedBtDevices.map((dev) => (
                            <button
                              key={dev.address}
                              onClick={() => handleSelectBtDevice(dev)}
                              className="w-full text-left p-2 hover:bg-blue-600/20 border border-slate-800 hover:border-blue-500/40 rounded-lg text-xs font-mono text-cyan-300 flex items-center justify-between transition"
                            >
                              <span className="font-bold truncate">{dev.name}</span>
                              <span className="text-[10px] text-slate-500 ml-2">{dev.address}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 text-center py-2">
                          Tidak ada printer Bluetooth terpasang. Silakan pair printer di Pengaturan Bluetooth HP (PIN: 0000 / 1234).
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Secondary Options */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => handlePrint('simulator')}
                  disabled={isPrinting}
                  className="p-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl flex items-center justify-center gap-2 font-medium transition"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  Uji Simulator
                </button>

                <button
                  onClick={() => handlePrint('browser_print')}
                  disabled={isPrinting}
                  className="p-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl flex items-center justify-center gap-2 font-medium transition"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  Cetak Browser / PDF
                </button>
              </div>

              {/* Universal Share / External App Option */}
              <div className="w-full text-xs">
                <button
                  onClick={handleShareReceipt}
                  disabled={isPrinting}
                  className="w-full p-2 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-medium transition"
                  title="Bagikan struk via WhatsApp, Thermer, atau aplikasi lain"
                >
                  <Share2 className="w-3.5 h-3.5 text-slate-400" />
                  Bagikan Struk / Aplikasi Lain
                </button>
              </div>
            </div>

            {/* Raw ESC/POS Command Hex Inspector */}
            <div className="mt-4 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowHex(!showHex)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition"
              >
                <Code className="w-3.5 h-3.5 text-cyan-400" />
                {showHex ? 'Sembunyikan Hex Buffer ESC/POS' : 'Inspeksi Byte Buffer ESC/POS (Binary)'}
              </button>

              {showHex && (
                <div className="mt-2.5 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-mono text-cyan-300 max-h-32 overflow-y-auto break-all">
                  <div className="flex items-center justify-between text-slate-400 mb-1 pb-1 border-b border-slate-800 font-sans">
                    <span>Ukuran Buffer: {escPosBinary.length} Bytes</span>
                    <button
                      onClick={handleCopyHex}
                      className="hover:text-white flex items-center gap-1 text-[11px]"
                    >
                      {copiedHex ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      Salin Hex
                    </button>
                  </div>
                  {hexDump}
                </div>
              )}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="pt-4 border-t border-slate-800 mt-4 flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="py-2 px-3 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center gap-1.5 transition"
            >
              {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              Salin Teks
            </button>

            {onNewTransaction && (
              <button
                onClick={() => {
                  onClose();
                  onNewTransaction();
                }}
                className="flex-1 py-2 px-3 text-xs bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition text-center"
              >
                Transaksi Baru
              </button>
            )}

            <button
              onClick={onClose}
              className="py-2 px-4 text-xs bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
