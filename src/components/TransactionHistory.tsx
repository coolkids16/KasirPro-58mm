import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Printer, 
  Search, 
  TrendingUp, 
  Calendar, 
  CreditCard, 
  Banknote, 
  QrCode,
  ArrowRight
} from 'lucide-react';
import { Transaction, StoreSettings } from '../types';
import { db } from '../db/db';
import { formatRupiah } from '../utils/escpos';

interface TransactionHistoryProps {
  settings: StoreSettings;
  onSelectTransactionToPrint: (tx: Transaction) => void;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  settings,
  onSelectTransactionToPrint
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const loadTransactions = async () => {
    try {
      const list = await db.transactions.reverse().toArray();
      setTransactions(list);
    } catch (err) {
      console.error('Error loading transactions:', err);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const filtered = transactions.filter(t => 
    t.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    t.cashierName.toLowerCase().includes(search.toLowerCase())
  );

  const totalOmzet = transactions.reduce((sum, t) => sum + t.total, 0);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Total Penjualan</div>
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

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Penyimpanan</div>
            <div className="text-sm font-bold text-white">
              IndexedDB Lokal
            </div>
            <div className="text-[11px] text-slate-500">Offline-first (Dexie.js)</div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Cari berdasarkan nomor invoice atau kasir..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Transactions Table & Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              Daftar Riwayat Penjualan
            </h3>
            <span className="text-xs text-slate-400">{filtered.length} transaksi</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono uppercase">
                <tr>
                  <th className="py-3 px-4">No. Invoice</th>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Metode</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(tx => {
                  const dateStr = new Date(tx.timestamp).toLocaleString('id-ID', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  });

                  return (
                    <tr 
                      key={tx.id || tx.invoiceNumber}
                      onClick={() => setSelectedTx(tx)}
                      className={`hover:bg-slate-850/50 cursor-pointer transition ${
                        selectedTx?.invoiceNumber === tx.invoiceNumber ? 'bg-slate-850' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                        {tx.invoiceNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {dateStr}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300">
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTransactionToPrint(tx);
                          }}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition"
                          title="Cetak ulang struk"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Cetak Ulang</span>
                        </button>
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
                <span className="font-mono text-xs text-emerald-400">{selectedTx.invoiceNumber}</span>
              )}
            </h4>

            {selectedTx ? (
              <div className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Waktu</span>
                  <span className="text-white">
                    {new Date(selectedTx.timestamp).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Kasir</span>
                  <span className="text-white">{selectedTx.cashierName}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Metode Bayar</span>
                  <span className="text-white uppercase font-bold">{selectedTx.paymentMethod}</span>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <div className="text-slate-400 font-semibold mb-2">Item Belanja:</div>
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
                    <span>Total</span>
                    <span>Rp {formatRupiah(selectedTx.total)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Bayar</span>
                    <span>Rp {formatRupiah(selectedTx.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Kembali</span>
                    <span>Rp {formatRupiah(selectedTx.changeAmount)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-500 text-xs">
                Klik salah satu baris transaksi untuk melihat rincian lengkap struk.
              </div>
            )}
          </div>

          {selectedTx && (
            <button
              onClick={() => onSelectTransactionToPrint(selectedTx)}
              className="mt-6 w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition"
            >
              <Printer className="w-4 h-4" />
              Buka & Cetak Struk 58mm
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
