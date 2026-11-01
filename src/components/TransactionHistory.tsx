import React, { useState, useMemo } from 'react';
import { 
  Receipt, 
  Printer, 
  Search, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  RotateCcw,
  CloudCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Banknote,
  QrCode,
  CreditCard,
  TrendingUp
} from 'lucide-react';
import { Transaction, StoreSettings } from '../types';
import { db } from '../db/db';
import { deleteTransactionFromFirestore } from '../services/firebase';
import { formatRupiah } from '../utils/escpos';
import { 
  formatTransactionTableDateTime, 
  formatTransactionDetailDateTime, 
  getTimezoneAbbr,
  getTimezoneOption
} from '../utils/timezone';

interface TransactionHistoryProps {
  settings: StoreSettings;
  transactions: Transaction[];
  onSelectTransactionToPrint: (tx: Transaction) => void;
  onOpenBackupModal?: () => void;
  storeId?: string | null;
}

type HistoryPeriod = 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'last_month' | 'custom';

const HISTORY_PERIOD_LABELS: Record<HistoryPeriod, string> = {
  today: 'Hari Ini',
  yesterday: 'Kemarin',
  last7: '7 Hari Terakhir',
  last30: '30 Hari Terakhir',
  this_month: 'Bulan Ini',
  last_month: 'Bulan Lalu',
  custom: 'Rentang Kustom'
};

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  settings,
  transactions,
  onSelectTransactionToPrint,
  onOpenBackupModal,
  storeId
}) => {
  const [search, setSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('this_month');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  // In-app delete confirmation states
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const periodTransactions = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    if (historyPeriod === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setTime(start.getTime() + 24 * 60 * 60 * 1000);
    } else if (historyPeriod === 'last7') {
      start.setDate(start.getDate() - 6);
    } else if (historyPeriod === 'last30') {
      start.setDate(start.getDate() - 29);
    } else if (historyPeriod === 'this_month') {
      start.setDate(1);
    } else if (historyPeriod === 'last_month') {
      start.setMonth(start.getMonth() - 1, 1);
      end.setDate(1);
    } else if (historyPeriod === 'custom') {
      const startParts = customStartDate.split('-').map(Number);
      const endParts = customEndDate.split('-').map(Number);
      start.setFullYear(startParts[0], startParts[1] - 1, startParts[2]);
      end.setFullYear(endParts[0], endParts[1] - 1, endParts[2] + 1);
    }

    const startTime = start.getTime();
    const endTime = end.getTime();
    return transactions.filter(transaction => {
      const timestamp = Number(transaction.timestamp);
      return timestamp >= startTime && timestamp < endTime;
    });
  }, [transactions, historyPeriod, customStartDate, customEndDate]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return periodTransactions.filter(transaction =>
      transaction.invoiceNumber.toLowerCase().includes(query)
      || transaction.cashierName.toLowerCase().includes(query)
    );
  }, [periodTransactions, search]);

  const totalOmzet = periodTransactions.reduce((sum, transaction) => sum + transaction.total, 0);
  const periodLabel = HISTORY_PERIOD_LABELS[historyPeriod];

  // Safe In-App Delete Handler for a Single Transaction
  const confirmDeleteTransaction = async () => {
    if (!txToDelete) return;

    try {
      // 1. Delete from Dexie Local DB
      const localMatch = await db.transactions
        .where('invoiceNumber')
        .equals(txToDelete.invoiceNumber)
        .first();
      
      if (localMatch?.id) {
        await db.transactions.delete(localMatch.id);
      }

      // 2. Delete from Firebase Firestore
      if (txToDelete.id || txToDelete.invoiceNumber) {
        await deleteTransactionFromFirestore(txToDelete.id || txToDelete.invoiceNumber, txToDelete.invoiceNumber, storeId || undefined);
      }

      showToast(`Transaksi #${txToDelete.invoiceNumber} berhasil dihapus.`);
      if (selectedTx?.invoiceNumber === txToDelete.invoiceNumber) {
        setSelectedTx(null);
      }
    } catch (err: any) {
      console.error('Failed to delete transaction:', err);
      showToast('Gagal menghapus transaksi: ' + (err.message || 'Error'));
    } finally {
      setTxToDelete(null);
    }
  };

  // Safe In-App Clear All Transactions Handler
  const confirmClearAllTransactions = async () => {
    try {
      // Clear Dexie
      await db.transactions.clear();

      // Clear Firestore
      for (const t of transactions) {
        if (t.id || t.invoiceNumber) {
          try {
            await deleteTransactionFromFirestore(t.id || t.invoiceNumber, t.invoiceNumber, storeId || undefined);
          } catch (e) {
            // ignore
          }
        }
      }

      setSelectedTx(null);
      showToast('Seluruh riwayat transaksi telah dihapus.');
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsClearAllOpen(false);
    }
  };

  return (
    <div className="w-full max-w-full mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="p-3.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 [@media(orientation:portrait)]:grid-cols-1 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Total Penjualan ({periodLabel})</div>
            <div className="text-xl font-extrabold text-white">
              Rp {formatRupiah(totalOmzet)}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Total Transaksi ({periodLabel})</div>
            <div className="text-xl font-extrabold text-white">
              {periodTransactions.length} Struk
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <CloudCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Sinkronisasi Cloud</div>
              <div className="text-sm font-bold text-white">
                Firestore & Lokal
              </div>
              <div className="text-[11px] text-slate-500">Real-time sync aktif</div>
            </div>
          </div>

          {transactions.length > 0 && (
            <button
              onClick={() => setIsClearAllOpen(true)}
              className="p-2 bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-xl text-xs transition"
              title="Hapus semua riwayat transaksi"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search & Actions Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nomor invoice (INV-...) atau kasir..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <select
            value={historyPeriod}
            onChange={e => setHistoryPeriod(e.target.value as HistoryPeriod)}
            aria-label="Filter periode riwayat"
            className="px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="today">Hari ini</option>
            <option value="yesterday">Kemarin</option>
            <option value="last7">7 Hari lalu</option>
            <option value="last30">30 Hari lalu</option>
            <option value="this_month">Bulan ini</option>
            <option value="last_month">Bulan lalu</option>
            <option value="custom">Custom range Tanggal</option>
          </select>
          {historyPeriod === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                aria-label="Tanggal mulai riwayat"
                className="min-w-0 px-2.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              <span className="text-slate-500 text-xs">s.d.</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                aria-label="Tanggal akhir riwayat"
                className="min-w-0 px-2.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400">
            <span className="text-slate-500">Zona:</span>
            <span className="font-mono font-bold text-emerald-400">{getTimezoneAbbr(settings?.timezone)}</span>
            <span className="text-[10px] text-slate-500">({getTimezoneOption(settings?.timezone).offset})</span>
          </div>

          {transactions.length > 0 && (
            <button
              onClick={() => setIsClearAllOpen(true)}
              className="px-3.5 py-2 bg-slate-900 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bersihkan Riwayat</span>
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Invoice</th>
                <th className="py-3.5 px-4">
                  Waktu <span className="text-emerald-400 font-mono text-[9px] lowercase font-normal">({getTimezoneAbbr(settings?.timezone)})</span>
                </th>
                <th className="py-3.5 px-4">Metode</th>
                <th className="py-3.5 px-4">Total</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(tx => {
                  const isSelected = selectedTx?.invoiceNumber === tx.invoiceNumber;
                  const dateFormatted = formatTransactionTableDateTime(tx.timestamp, settings?.timezone);

                  return (
                    <tr
                      key={String(tx.id || tx.invoiceNumber)}
                      onClick={() => setSelectedTx(tx)}
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-emerald-500/10' : 'hover:bg-slate-850/50'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-white text-sm">
                          #{tx.invoiceNumber}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Kasir: {tx.cashierName}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                        {dateFormatted}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 uppercase font-mono text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                          {tx.paymentMethod === 'cash' ? <Banknote className="w-3 h-3 text-emerald-400" /> : null}
                          {tx.paymentMethod === 'qris' ? <QrCode className="w-3 h-3 text-cyan-400" /> : null}
                          {tx.paymentMethod === 'transfer' ? <CreditCard className="w-3 h-3 text-indigo-400" /> : null}
                          {tx.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-white">
                        Rp {formatRupiah(tx.total)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectTransactionToPrint(tx);
                            }}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition"
                            title="Cetak ulang struk"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Cetak</span>
                          </button>
                          
                          {/* Tombol Hapus Transaksi */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTxToDelete(tx);
                            }}
                            className="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-lg transition"
                            title="Hapus transaksi ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      Belum ada transaksi tersimpan. Lakukan transaksi pertama di tab Kasir.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Selected Transaction Summary Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-white text-sm pb-3 border-b border-slate-800 flex items-center justify-between">
              <span>Detail Transaksi</span>
              {selectedTx && (
                <span className="font-mono text-xs text-emerald-400">#{selectedTx.invoiceNumber}</span>
              )}
            </h4>

            {selectedTx ? (
              <div className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Waktu Transaksi</span>
                  <span className="text-white font-mono">
                    {formatTransactionDetailDateTime(selectedTx.timestamp, settings?.timezone)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Kasir Bertugas</span>
                  <span className="text-white">{selectedTx.cashierName}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Metode Pembayaran</span>
                  <span className="text-white uppercase font-bold">{selectedTx.paymentMethod}</span>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <div className="text-slate-400 font-semibold mb-2">Item Belanja ({selectedTx.items.length}):</div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {selectedTx.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-[11px] bg-slate-950 p-2 rounded-lg">
                        <div>
                          <div className="text-white font-medium">{item.product.name}</div>
                          <div className="text-slate-500">{item.quantity} x Rp {formatRupiah(item.product.price)}</div>
                        </div>
                        <div className="font-bold text-slate-200">
                          Rp {formatRupiah(item.quantity * item.product.price)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span>Rp {formatRupiah(selectedTx.subtotal)}</span>
                  </div>
                  {selectedTx.discount > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>Diskon</span>
                      <span>-Rp {formatRupiah(selectedTx.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-emerald-400 pt-1 border-t border-slate-800">
                    <span>Total Pembayaran</span>
                    <span>Rp {formatRupiah(selectedTx.total)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Nominal Diterima</span>
                    <span>Rp {formatRupiah(selectedTx.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Kembalian</span>
                    <span className="text-slate-200">Rp {formatRupiah(selectedTx.changeAmount)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-500 text-xs">
                Klik salah satu baris transaksi untuk melihat rincian item & kalkulasi.
              </div>
            )}
          </div>

          {selectedTx && (
            <div className="mt-6 pt-3 border-t border-slate-800 flex items-center gap-2">
              <button
                onClick={() => onSelectTransactionToPrint(selectedTx)}
                className="w-full sm:w-auto flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition"
              >
                <Printer className="w-4 h-4" />
                Cetak Struk 58mm
              </button>
              <button
                onClick={() => setTxToDelete(selectedTx)}
                className="p-2.5 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl text-xs transition"
                title="Hapus transaksi ini"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

      {/* IN-APP CONFIRMATION MODAL: DELETE SINGLE TRANSACTION */}
      {txToDelete && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh] p-3 sm:p-4 lg:p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Hapus Transaksi Ini?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Transaksi <strong className="text-white">#{txToDelete.invoiceNumber}</strong> senilai <span className="text-emerald-400 font-bold">Rp {formatRupiah(txToDelete.total)}</span> akan dihapus dari riwayat penjualan & database Firestore.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTxToDelete(null)}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteTransaction}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL: CLEAR ALL TRANSACTIONS */}
      {isClearAllOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh] p-3 sm:p-4 lg:p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Hapus Semua Riwayat?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Semua {transactions.length} data riwayat transaksi penjualan akan dihapus bersih dari sistem dan Firebase Firestore.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsClearAllOpen(false)}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmClearAllTransactions}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
