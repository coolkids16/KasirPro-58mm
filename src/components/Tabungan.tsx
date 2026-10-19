import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  ArrowLeft, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Phone, 
  Calendar, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  User, 
  X, 
  ChevronRight, 
  Coins, 
  RefreshCw,
  PiggyBank,
  Wallet,
  TrendingUp,
  Receipt
} from 'lucide-react';
import { db } from '../db/db';
import { auth, saveSavingsToFirestore, updateSavingsInFirestore, deleteSavingsFromFirestore } from '../services/firebase';
import { TabunganRecord, TabunganMutation, StoreSettings } from '../types';
import { getLocalDateString } from '../utils/timezone';
import { DatePicker } from './DatePicker';

interface TabunganProps {
  savings: TabunganRecord[];
  onRefresh: () => void;
  settings: StoreSettings;
  storeId?: string | null;
  sounds: {
    playScanBeep: () => void;
    playSuccess: () => void;
  };
}

export const Tabungan: React.FC<TabunganProps> = ({
  savings,
  onRefresh,
  settings,
  storeId,
  sounds
}) => {
  // Navigation State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | number | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'active' | 'zero'>('all');

  // Modals
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formInitialDeposit, setFormInitialDeposit] = useState('');
  const [formInitialDepositDate, setFormInitialDepositDate] = useState(() => getLocalDateString());
  const [formNote, setFormNote] = useState('');

  // Transaction form states
  const [trxAmount, setTrxAmount] = useState('');
  const [trxNote, setTrxNote] = useState('');
  const [trxDate, setTrxDate] = useState(() => getLocalDateString());

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const formatRupiah = (num: number) => {
    return Math.round(num || 0).toLocaleString('id-ID');
  };

  // Find selected customer
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return savings.find(s => (s.id === selectedCustomerId || s.firestoreId === selectedCustomerId)) || null;
  }, [savings, selectedCustomerId]);

  // Metrics calculation
  const metrics = useMemo(() => {
    let totalSavings = 0;
    let activeAccounts = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;

    savings.forEach(s => {
      const balance = s.totalBalance || 0;
      totalSavings += balance;
      if (balance > 0) activeAccounts++;

      s.mutations?.forEach(m => {
        if (m.type === 'deposit') totalDeposits += m.amount;
        if (m.type === 'withdrawal') totalWithdrawals += m.amount;
      });
    });

    return {
      totalSavings,
      totalAccounts: savings.length,
      activeAccounts,
      totalDeposits,
      totalWithdrawals
    };
  }, [savings]);

  // Filtered customer list
  const filteredSavings = useMemo(() => {
    return savings.filter(s => {
      const matchSearch = s.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (s.customerPhone && s.customerPhone.includes(searchQuery));
      if (!matchSearch) return false;

      if (balanceFilter === 'active') return (s.totalBalance || 0) > 0;
      if (balanceFilter === 'zero') return (s.totalBalance || 0) === 0;

      return true;
    });
  }, [savings, searchQuery, balanceFilter]);

  // Save new account
  const handleSaveNewAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const initDeposit = parseFloat(formInitialDeposit) || 0;

    if (!name) {
      alert('Nama nasabah harus diisi');
      return;
    }

    const mutations: TabunganMutation[] = [];
    if (initDeposit > 0) {
      mutations.push({
        id: 'mut-' + Date.now(),
        type: 'deposit',
        amount: initDeposit,
        note: formNote.trim() || 'Setoran Awal',
        timestamp: Date.now(),
        dateString: formInitialDepositDate || getLocalDateString()
      });
    }

    const newRecord: TabunganRecord = {
      customerName: name,
      customerPhone: formPhone.trim() || undefined,
      description: formNote.trim() || 'Buku Tabungan',
      totalBalance: initDeposit,
      depositCount: initDeposit > 0 ? 1 : 0,
      withdrawalCount: 0,
      lastActivityTimestamp: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mutations,
      storeId: storeId || undefined
    };

    try {
      const localId = await db.savings.add(newRecord);
      newRecord.id = localId;

      if (auth.currentUser) {
        const firestoreId = await saveSavingsToFirestore(newRecord, storeId || undefined);
        await db.savings.update(localId, { firestoreId });
        newRecord.firestoreId = firestoreId;
      }

      sounds.playSuccess();
      showToast(`✓ Tabungan "${name}" berhasil dibuat!`);
      
      setFormName('');
      setFormPhone('');
      setFormInitialDeposit('');
      setFormInitialDepositDate(getLocalDateString());
      setFormNote('');
      setIsNewAccountModalOpen(false);

      onRefresh();
      setSelectedCustomerId(localId);
    } catch (err: any) {
      console.error(err);
      alert('Gagal menyimpan: ' + err.message);
    }
  };

  // Handle deposit
  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amt = parseFloat(trxAmount) || 0;
    if (amt <= 0) {
      alert('Nominal setoran harus lebih dari 0');
      return;
    }

    const newMutation: TabunganMutation = {
      id: 'mut-' + Date.now(),
      type: 'deposit',
      amount: amt,
      note: trxNote.trim() || 'Setoran Tabungan',
      timestamp: Date.now(),
      dateString: trxDate || getLocalDateString()
    };

    const updatedMutations = [newMutation, ...(selectedCustomer.mutations || [])];
    const newBalance = (selectedCustomer.totalBalance || 0) + amt;
    const newDepositCount = (selectedCustomer.depositCount || 0) + 1;

    const updatePayload: Partial<TabunganRecord> = {
      totalBalance: newBalance,
      depositCount: newDepositCount,
      lastActivityTimestamp: Date.now(),
      mutations: updatedMutations,
      updatedAt: Date.now()
    };

    try {
      if (selectedCustomer.id) {
        await db.savings.update(selectedCustomer.id, updatePayload);
      }
      if (auth.currentUser) {
        await updateSavingsInFirestore(
          selectedCustomer.firestoreId || selectedCustomer.id,
          updatePayload,
          selectedCustomer.createdAt
        );
      }

      sounds.playSuccess();
      showToast(`✓ Setoran Rp ${formatRupiah(amt)} berhasil dicatat!`);
      setTrxAmount('');
      setTrxNote('');
      setIsDepositModalOpen(false);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert('Gagal mencatat setoran: ' + err.message);
    }
  };

  // Handle withdrawal
  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amt = parseFloat(trxAmount) || 0;
    const currentBalance = selectedCustomer.totalBalance || 0;

    if (amt <= 0) {
      alert('Nominal penarikan harus lebih dari 0');
      return;
    }

    if (amt > currentBalance) {
      alert(`Saldo tidak mencukupi. Saldo saat ini: Rp ${formatRupiah(currentBalance)}`);
      return;
    }

    const newMutation: TabunganMutation = {
      id: 'mut-' + Date.now(),
      type: 'withdrawal',
      amount: amt,
      note: trxNote.trim() || 'Penarikan Tabungan',
      timestamp: Date.now(),
      dateString: trxDate || getLocalDateString()
    };

    const updatedMutations = [newMutation, ...(selectedCustomer.mutations || [])];
    const newBalance = Math.max(0, currentBalance - amt);
    const newWithdrawalCount = (selectedCustomer.withdrawalCount || 0) + 1;

    const updatePayload: Partial<TabunganRecord> = {
      totalBalance: newBalance,
      withdrawalCount: newWithdrawalCount,
      lastActivityTimestamp: Date.now(),
      mutations: updatedMutations,
      updatedAt: Date.now()
    };

    try {
      if (selectedCustomer.id) {
        await db.savings.update(selectedCustomer.id, updatePayload);
      }
      if (auth.currentUser) {
        await updateSavingsInFirestore(
          selectedCustomer.firestoreId || selectedCustomer.id,
          updatePayload,
          selectedCustomer.createdAt
        );
      }

      sounds.playSuccess();
      showToast(`✓ Penarikan Rp ${formatRupiah(amt)} berhasil dicatat!`);
      setTrxAmount('');
      setTrxNote('');
      setIsWithdrawModalOpen(false);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert('Gagal mencatat penarikan: ' + err.message);
    }
  };

  // Delete account
  const handleDeleteAccount = async () => {
    if (!selectedCustomer) return;

    try {
      if (selectedCustomer.id) {
        await db.savings.delete(selectedCustomer.id);
      }
      if (auth.currentUser) {
        await deleteSavingsFromFirestore(selectedCustomer);
      }

      sounds.playSuccess();
      showToast(`✓ Rekening ${selectedCustomer.customerName} berhasil dihapus.`);
      setIsDeleteModalOpen(false);
      setSelectedCustomerId(null);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert('Gagal menghapus: ' + err.message);
    }
  };

  // Avatar helper
  const getInitials = (name: string) => {
    if (!name) return 'TB';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2 animate-fade-in">
          <CheckCircle2 className="w-5 h-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* HEADER & REKAP */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <PiggyBank className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-white">Tabungan</h1>
              <p className="text-xs text-slate-500">Kelola simpanan & rekap tabungan bersama</p>
            </div>
          </div>
          <button
            onClick={() => setIsNewAccountModalOpen(true)}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Rekening</span>
          </button>
        </div>

        {/* METRICS DASHBOARD */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-medium">Total Saldo</span>
              <Wallet className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              Rp {formatRupiah(metrics.totalSavings)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {metrics.activeAccounts} rekening aktif
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-medium">Total Nasabah</span>
              <User className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-lg font-bold text-slate-800 dark:text-white">
              {metrics.totalAccounts}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Semua terdaftar
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-medium">Total Masuk</span>
              <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-lg font-bold text-slate-800 dark:text-white">
              Rp {formatRupiah(metrics.totalDeposits)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Akumulasi setoran
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-medium">Total Ditarik</span>
              <ArrowUpRight className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-lg font-bold text-slate-800 dark:text-white">
              Rp {formatRupiah(metrics.totalWithdrawals)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Akumulasi penarikan
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: CUSTOMER LIST */}
        <div className={`w-full md:w-80 lg:w-96 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800 ${selectedCustomerId ? 'hidden md:flex' : 'flex'}`}>
          {/* SEARCH & FILTER */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-700 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama nasabah..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="flex space-x-1">
              {(['all', 'active', 'zero'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setBalanceFilter(tab)}
                  className={`flex-1 py-1 text-xs rounded-md transition-colors ${
                    balanceFilter === tab
                      ? 'bg-emerald-600 text-white font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {tab === 'all' ? 'Semua' : tab === 'active' ? 'Ada Saldo' : 'Nol'}
                </button>
              ))}
            </div>
          </div>

          {/* LIST */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
            {filteredSavings.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <PiggyBank className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Belum ada data tabungan</p>
              </div>
            ) : (
              filteredSavings.map(s => {
                const isSelected = s.id === selectedCustomerId || s.firestoreId === selectedCustomerId;
                return (
                  <div
                    key={s.id || s.firestoreId}
                    onClick={() => setSelectedCustomerId(s.id || s.firestoreId)}
                    className={`p-3.5 cursor-pointer transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-600'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs">
                        {getInitials(s.customerName)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-white">
                          {s.customerName}
                        </div>
                        <div className="text-xs text-slate-400">
                          {s.customerPhone || 'Tidak ada no hp'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        Rp {formatRupiah(s.totalBalance || 0)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {s.mutations?.length || 0} transaksi
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: LEDGER / DETAIL */}
        <div className={`flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 ${!selectedCustomerId ? 'hidden md:flex' : 'flex'}`}>
          {selectedCustomer ? (
            <>
              {/* LEDGER HEADER */}
              <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setSelectedCustomerId(null)}
                    className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="text-base font-bold text-slate-800 dark:text-white">
                      {selectedCustomer.customerName}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {selectedCustomer.customerPhone || 'Tanpa no. telepon'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"
                    title="Hapus Rekening"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsWithdrawModalOpen(true)}
                    className="flex items-center space-x-1.5 bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Tarik</span>
                  </button>
                  <button
                    onClick={() => setIsDepositModalOpen(true)}
                    className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    <span>Setor</span>
                  </button>
                </div>
              </div>

              {/* BALANCE SUMMARY CARD */}
              <div className="p-4">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-xl p-4 text-white shadow">
                  <div className="text-xs text-emerald-100 font-medium mb-1">Saldo Tabungan Saat Ini</div>
                  <div className="text-2xl font-bold">
                    Rp {formatRupiah(selectedCustomer.totalBalance || 0)}
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-emerald-500/30 text-xs">
                    <div>
                      <span className="opacity-75">Total Setoran: </span>
                      <span className="font-semibold">{selectedCustomer.depositCount || 0}x</span>
                    </div>
                    <div>
                      <span className="opacity-75">Total Tarikan: </span>
                      <span className="font-semibold">{selectedCustomer.withdrawalCount || 0}x</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* MUTATIONS LIST */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="p-3 border-b border-slate-200 dark:border-slate-700 font-semibold text-xs text-slate-600 dark:text-slate-300">
                    Riwayat Transaksi Tabungan
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {(!selectedCustomer.mutations || selectedCustomer.mutations.length === 0) ? (
                      <div className="p-6 text-center text-slate-400 text-xs">
                        Belum ada mutasi
                      </div>
                    ) : (
                      selectedCustomer.mutations.map(m => {
                        const isDep = m.type === 'deposit';
                        return (
                          <div key={m.id} className="p-3 flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                isDep ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                              }`}>
                                {isDep ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-slate-800 dark:text-white">
                                  {m.note || (isDep ? 'Setoran Tabungan' : 'Penarikan')}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {m.dateString || new Date(m.timestamp).toLocaleDateString('id-ID')}
                                </div>
                              </div>
                            </div>
                            <div className={`text-xs font-bold ${
                              isDep ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {isDep ? '+' : '-'} Rp {formatRupiah(m.amount)}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <PiggyBank className="w-12 h-12 mb-2 opacity-50" />
              <p className="text-sm font-medium">Pilih nasabah untuk melihat detail buku tabungan</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: TAMBAH REKENING */}
      {isNewAccountModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-sm w-full p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Buka Rekening Tabungan Baru</h3>
              <button onClick={() => setIsNewAccountModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveNewAccount} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Nama Nasabah *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Pak Budi"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Nomor HP</label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="081234..."
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Setoran Awal (Rp)</label>
                <input
                  type="number"
                  min="0"
                  value={formInitialDeposit}
                  onChange={(e) => setFormInitialDeposit(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Tanggal Setoran</label>
                <DatePicker
                  value={formInitialDepositDate}
                  onChange={setFormInitialDepositDate}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Keterangan / Catatan</label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Tabungan Qurban, dll"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewAccountModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SETOR */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-sm w-full p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Setor Tabungan</h3>
              <button onClick={() => setIsDepositModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleDeposit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Nominal Setoran (Rp) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={trxAmount}
                  onChange={(e) => setTrxAmount(e.target.value)}
                  placeholder="50000"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Catatan</label>
                <input
                  type="text"
                  value={trxNote}
                  onChange={(e) => setTrxNote(e.target.value)}
                  placeholder="Setoran harian"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Tanggal</label>
                <DatePicker
                  value={trxDate}
                  onChange={setTrxDate}
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                >
                  Setor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TARIK */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-sm w-full p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Tarik Tabungan</h3>
              <button onClick={() => setIsWithdrawModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleWithdrawal} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">
                  Nominal Penarikan (Rp) * (Maks: Rp {formatRupiah(selectedCustomer?.totalBalance || 0)})
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedCustomer?.totalBalance || 0}
                  required
                  value={trxAmount}
                  onChange={(e) => setTrxAmount(e.target.value)}
                  placeholder="50000"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Catatan</label>
                <input
                  type="text"
                  value={trxNote}
                  onChange={(e) => setTrxNote(e.target.value)}
                  placeholder="Kebutuhan mendesak"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Tanggal</label>
                <DatePicker
                  value={trxDate}
                  onChange={setTrxDate}
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold"
                >
                  Tarik
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: HAPUS */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-sm w-full p-4 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-slate-800 dark:text-white text-sm mb-2">Hapus Rekening?</h3>
            <p className="text-xs text-slate-500 mb-4">
              Apakah Anda yakin ingin menghapus rekening <strong>{selectedCustomer?.customerName}</strong>? Semua riwayat mutasi akan ikut terhapus.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};