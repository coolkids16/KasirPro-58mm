import React, { useState, useEffect, useMemo } from 'react';
import { 
  Receipt, 
  Printer, 
  Search, 
  TrendingUp, 
  Calendar, 
  CreditCard, 
  Banknote, 
  QrCode, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  RotateCcw,
  CloudCheck,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  CalendarDays,
  Sparkles,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';
import { Transaction, StoreSettings } from '../types';
import { db } from '../db/db';
import { deleteTransactionFromFirestore, subscribeTransactions } from '../services/firebase';
import { formatRupiah } from '../utils/escpos';

interface TransactionHistoryProps {
  settings: StoreSettings;
  onSelectTransactionToPrint: (tx: Transaction) => void;
  onOpenBackupModal?: () => void;
}

interface DailySalesData {
  day: number;
  formattedDate: string;
  totalSales: number;
  txCount: number;
  cashSales: number;
  qrisSales: number;
  transferSales: number;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  settings,
  onSelectTransactionToPrint,
  onOpenBackupModal
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  
  // Date filtering state for Recharts
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth()); // 0-11
  const [isChartVisible, setIsChartVisible] = useState<boolean>(true);
  const [onlyActiveDays, setOnlyActiveDays] = useState<boolean>(false);

  // In-app delete confirmation states
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadTransactionsLocal = async () => {
    try {
      const list = await db.transactions.reverse().toArray();
      setTransactions(list);
    } catch (err) {
      console.error('Error loading transactions from Dexie:', err);
    }
  };

  useEffect(() => {
    loadTransactionsLocal();

    // Subscribe to Firestore transactions in real time
    const unsub = subscribeTransactions(
      (firestoreTxs) => {
        if (firestoreTxs && firestoreTxs.length > 0) {
          setTransactions(firestoreTxs);
        } else {
          loadTransactionsLocal();
        }
      },
      () => {
        loadTransactionsLocal();
      }
    );

    return () => unsub();
  }, []);

  const filtered = transactions.filter(t => 
    t.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    t.cashierName.toLowerCase().includes(search.toLowerCase())
  );

  const totalOmzet = transactions.reduce((sum, t) => sum + t.total, 0);

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const handleCurrentMonth = () => {
    const cur = new Date();
    setSelectedYear(cur.getFullYear());
    setSelectedMonth(cur.getMonth());
  };

  // Recharts Daily Sales calculation for selected month
  const { chartData, monthTotalSales, monthTxCount, dailyAverage, peakDay } = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const map: { [day: number]: DailySalesData } = {};

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(selectedYear, selectedMonth, day);
      const dayFormatted = `${day} ${MONTH_NAMES[selectedMonth].slice(0, 3)}`;
      map[day] = {
        day,
        formattedDate: dayFormatted,
        totalSales: 0,
        txCount: 0,
        cashSales: 0,
        qrisSales: 0,
        transferSales: 0
      };
    }

    transactions.forEach(t => {
      const d = new Date(t.timestamp);
      if (d.getFullYear() === selectedYear && d.getMonth() === selectedMonth) {
        const day = d.getDate();
        if (map[day]) {
          map[day].totalSales += t.total;
          map[day].txCount += 1;
          if (t.paymentMethod === 'cash') map[day].cashSales += t.total;
          if (t.paymentMethod === 'qris') map[day].qrisSales += t.total;
          if (t.paymentMethod === 'transfer') map[day].transferSales += t.total;
        }
      }
    });

    const allDays = Object.values(map);
    const dataToDisplay = onlyActiveDays ? allDays.filter(d => d.totalSales > 0) : allDays;

    const mTotal = allDays.reduce((acc, d) => acc + d.totalSales, 0);
    const mCount = allDays.reduce((acc, d) => acc + d.txCount, 0);
    const activeDaysCount = allDays.filter(d => d.totalSales > 0).length;
    const avg = activeDaysCount > 0 ? Math.round(mTotal / activeDaysCount) : 0;
    const peak = allDays.reduce((max, d) => (d.totalSales > max.totalSales ? d : max), {
      day: 0,
      formattedDate: '-',
      totalSales: 0,
      txCount: 0,
      cashSales: 0,
      qrisSales: 0,
      transferSales: 0
    });

    return {
      chartData: dataToDisplay,
      monthTotalSales: mTotal,
      monthTxCount: mCount,
      dailyAverage: avg,
      peakDay: peak
    };
  }, [transactions, selectedYear, selectedMonth, onlyActiveDays]);

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
        await deleteTransactionFromFirestore(txToDelete.id || txToDelete.invoiceNumber, txToDelete.invoiceNumber);
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
      loadTransactionsLocal();
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
            await deleteTransactionFromFirestore(t.id || t.invoiceNumber, t.invoiceNumber);
          } catch (e) {
            // ignore
          }
        }
      }

      setSelectedTx(null);
      setTransactions([]);
      showToast('Seluruh riwayat transaksi telah dihapus.');
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsClearAllOpen(false);
      loadTransactionsLocal();
    }
  };

  // Custom Tooltip component for Recharts
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as DailySalesData;
      return (
        <div className="bg-slate-900/95 border border-slate-700/80 p-3 rounded-xl shadow-2xl backdrop-blur-md text-xs space-y-1.5 min-w-44 z-50">
          <div className="font-bold text-white flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="text-emerald-400 font-semibold">{data.formattedDate} {selectedYear}</span>
            <span className="text-slate-400 font-mono text-[10px]">{data.txCount} Transaksi</span>
          </div>
          <div className="flex justify-between items-center text-slate-300">
            <span>Total Omzet:</span>
            <span className="font-extrabold text-emerald-400 text-sm">
              Rp {formatRupiah(data.totalSales)}
            </span>
          </div>
          {data.totalSales > 0 && (
            <div className="text-[10px] text-slate-400 pt-1 space-y-0.5 border-t border-slate-800/60 font-mono">
              {data.cashSales > 0 && <div className="text-emerald-300">• Tunai: Rp {formatRupiah(data.cashSales)}</div>}
              {data.qrisSales > 0 && <div className="text-cyan-300">• QRIS: Rp {formatRupiah(data.qrisSales)}</div>}
              {data.transferSales > 0 && <div className="text-indigo-300">• Transfer: Rp {formatRupiah(data.transferSales)}</div>}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="p-3.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Total Semua Penjualan</div>
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
            <div className="text-xs text-slate-400">Total Transaksi</div>
            <div className="text-xl font-extrabold text-white">
              {transactions.length} Struk
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

      {/* RECHARTS DAILY SALES LINE CHART SECTION */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        {/* Chart Header & Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                Grafik Penjualan Harian
                <span className="text-emerald-400 font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  {MONTH_NAMES[selectedMonth]} {selectedYear}
                </span>
              </h3>
              <p className="text-xs text-slate-400">Visualisasi tren omzet per hari bulan ini via Recharts</p>
            </div>
          </div>

          {/* Month Selector & Controls */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {/* Prev / Current / Next Month */}
            <div className="inline-flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={handlePrevMonth}
                title="Bulan sebelumnya"
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <button
                onClick={handleCurrentMonth}
                title="Kembali ke bulan ini"
                className="px-2.5 py-1 text-slate-200 hover:text-emerald-400 font-medium font-mono text-xs"
              >
                Bulan Ini
              </button>

              <button
                onClick={handleNextMonth}
                title="Bulan berikutnya"
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Toggle Active Days vs All Days */}
            <button
              onClick={() => setOnlyActiveDays(!onlyActiveDays)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition ${
                onlyActiveDays
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Tampilkan hanya hari dengan transaksi"
            >
              {onlyActiveDays ? 'Hari Ada Penjualan' : 'Semua Tanggal'}
            </button>

            {/* Toggle Hide/Show Chart */}
            <button
              onClick={() => setIsChartVisible(!isChartVisible)}
              className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition"
              title={isChartVisible ? 'Sembunyikan grafik' : 'Tampilkan grafik'}
            >
              {isChartVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Monthly Summary Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl">
            <span className="text-slate-400 text-[11px] block">Penjualan Bulan Ini</span>
            <strong className="text-emerald-400 font-bold text-sm sm:text-base font-mono">
              Rp {formatRupiah(monthTotalSales)}
            </strong>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl">
            <span className="text-slate-400 text-[11px] block">Total Transaksi</span>
            <strong className="text-white font-bold text-sm sm:text-base font-mono">
              {monthTxCount} Struk
            </strong>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl">
            <span className="text-slate-400 text-[11px] block">Rata-rata Penjualan Harian</span>
            <strong className="text-cyan-400 font-bold text-sm sm:text-base font-mono">
              Rp {formatRupiah(dailyAverage)}
            </strong>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl">
            <span className="text-slate-400 text-[11px] block">Puncak Tertinggi ({peakDay.formattedDate})</span>
            <strong className="text-amber-400 font-bold text-sm sm:text-base font-mono">
              Rp {formatRupiah(peakDay.totalSales)}
            </strong>
          </div>
        </div>

        {/* Recharts Canvas */}
        {isChartVisible && (
          <div className="w-full pt-2">
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 15, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis 
                    dataKey="formattedDate" 
                    stroke="#64748B" 
                    fontSize={11} 
                    tickLine={false}
                    interval={chartData.length > 20 ? 2 : 0}
                  />
                  <YAxis 
                    stroke="#64748B" 
                    fontSize={10} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `Rp ${v >= 1000000 ? (v / 1000000).toFixed(1) + 'jt' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="totalSales" 
                    name="Penjualan Harian" 
                    stroke="#10B981" 
                    strokeWidth={3} 
                    dot={{ fill: '#10B981', r: 3, strokeWidth: 1, stroke: '#064E3B' }} 
                    activeDot={{ fill: '#34D399', r: 6, stroke: '#ffffff', strokeWidth: 2 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center text-[11px] text-slate-500 pt-1">
              * Arahkan kursor atau sentuh titik tanggal untuk melihat rincian omzet & metode bayar
            </div>
          </div>
        )}
      </div>

      {/* Search & Actions Toolbar */}
      <div className="flex items-center justify-between gap-4">
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

        <div className="flex items-center gap-2">
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

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transactions Table (Left 2 Columns) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Invoice</th>
                  <th className="py-3.5 px-4">Waktu</th>
                  <th className="py-3.5 px-4">Metode</th>
                  <th className="py-3.5 px-4">Total</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(tx => {
                  const isSelected = selectedTx?.invoiceNumber === tx.invoiceNumber;
                  const dateFormatted = new Date(tx.timestamp).toLocaleString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

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
                  <span className="text-white">
                    {new Date(selectedTx.timestamp).toLocaleString('id-ID')}
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
                    <span>Rp {formatRupiah(selectedTx.changeAmount)}</span>
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
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition"
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
      </div>

      {/* IN-APP CONFIRMATION MODAL: DELETE SINGLE TRANSACTION */}
      {txToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center space-y-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center space-y-4">
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
