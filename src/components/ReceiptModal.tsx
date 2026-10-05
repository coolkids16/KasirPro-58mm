import React, { useState } from 'react';
import { 
  Printer, 
  X, 
  Bluetooth, 
  Usb, 
  CheckCircle2, 
  Code, 
  Copy, 
  Check, 
  FileText
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Transaction, StoreSettings, PrinterConnectionType } from '../types';
import { generateReceiptText, generateEscPosBinary } from '../utils/escpos';
import { printerService } from '../services/printerService';

interface ReceiptModalProps {
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

  if (!isOpen) return null;

  const receiptPlainText = generateReceiptText(transaction, settings);
  const escPosBinary = generateEscPosBinary(transaction, settings);
  const hexDump = Array.from(escPosBinary)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');

  const handlePrint = async (method?: PrinterConnectionType) => {
    setIsPrinting(true);
    setPrintSuccessMessage(null);
    setPrintErrorMessage(null);

    try {
      const result = await printerService.printUnified(
        escPosBinary,
        receiptPlainText,
        method
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
                  Cetak Struk Thermal
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

            {/* Primary Print Button */}
            <div className="mt-5 space-y-2.5">
              <button
                onClick={() => handlePrint()}
                disabled={isPrinting}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 text-sm transition-all disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                {isPrinting ? 'Mengirim Data ke Printer...' : 'Cetak Cepat (ESC/POS)'}
              </button>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => handlePrint('web_bluetooth')}
                  disabled={isPrinting}
                  className="p-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl flex items-center justify-center gap-2 font-medium transition"
                  title="Cari & Cetak ke Printer Bluetooth 58mm Android/Desktop"
                >
                  <Bluetooth className="w-3.5 h-3.5 text-blue-400" />
                  Web Bluetooth
                </button>

                <button
                  onClick={() => handlePrint('web_serial')}
                  disabled={isPrinting}
                  className="p-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl flex items-center justify-center gap-2 font-medium transition"
                  title="Kirim ke Printer USB Linux (/dev/ttyUSB0 / Virtual COM)"
                >
                  <Usb className="w-3.5 h-3.5 text-amber-400" />
                  Web Serial (USB)
                </button>
              </div>

              <button
                onClick={() => handlePrint('browser_print')}
                className="w-full py-2 px-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl flex items-center justify-center gap-2 text-xs font-medium transition"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                Dialog Cetak Sistem (Print via Browser / PDF)
              </button>
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
                <div className="mt-2.5 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-mono text-cyan-300 max-h-36 overflow-y-auto break-all">
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
          <div className="pt-4 border-t border-slate-800 mt-6 flex items-center gap-2">
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
