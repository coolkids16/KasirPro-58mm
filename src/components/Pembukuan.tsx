import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CustomSelect } from './CustomSelect';
import { BukuUtang } from './BukuUtang';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  BookOpen, 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ArrowUpRight, 
  ArrowDownLeft, 
  DollarSign, 
  Filter, 
  X, 
  Check, 
  Calendar, 
  User, 
  Phone, 
  FileText, 
  Coins, 
  CreditCard, 
  Share2,
  RefreshCw,
  ExternalLink,
  Percent,
  Receipt,
  RotateCcw,
  AlertTriangle,
  Truck,
  ShoppingBag
} from 'lucide-react';
import { db } from '../db/db';
import { CashFlowRecord, CustomerDebt, DebtPayment, DebtMutation, StoreSettings, Transaction } from '../types';
import { formatRupiah, padCenter, padRow, padSeparator, EscPosEncoder } from '../utils/escpos';
import { printerService } from '../services/printerService';
import { sounds } from '../utils/audio';
import { 
  auth,
  saveCashFlowToFirestore, 
  deleteCashFlowFromFirestore, 
  saveDebtToFirestore, 
  updateDebtInFirestore, 
  deleteDebtFromFirestore,
  deleteDebtsByCustomerFromFirestore,
  subscribeCashFlows,
  subscribeDebts,
  subscribeTransactions,
  subscribeToAuthState,
  deleteAllCashFlowsFromFirestore,
  deleteAllTransactionsFromFirestore,
  deleteAllDebtsFromFirestore,
  setActiveStoreId
} from '../services/firebase';

interface PembukuanProps {
  settings: StoreSettings;
  storeId?: string | null;
  runtimeEnv?: 'tauri' | 'capacitor' | 'browser';
  onNavigateToPos?: () => void;
  onSelectTransactionToPrint?: (tx: Transaction) => void;
}

type PeriodFilter = 'today' | 'this_month' | 'all' | 'custom';
type PembukuanSubTab = 'dashboard' | 'income' | 'expense' | 'debts';

export const Pembukuan: React.FC<PembukuanProps> = ({
  settings,
  storeId,
  runtimeEnv,
  onNavigateToPos,
  onSelectTransactionToPrint
}) => {
  const [activeSubTab, setActiveSubTab] = useState<PembukuanSubTab>('dashboard');
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Data states from Dexie
  const [cashFlows, setCashFlows] = useState<CashFlowRecord[]>([]);
  const [debts, setDebts] = useState<CustomerDebt[]>([]);
  const [posTransactions, setPosTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search & Filter queries
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [debtStatusFilter, setDebtStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');

  // Filter for Arus Transaksi Keuangan Terbaru: 'all' | 'pos' | 'income' | 'expense'
  const [dashboardFilter, setDashboardFilter] = useState<'all' | 'pos' | 'income' | 'expense'>('all');

  // Filter for Pemasukan tab: 'all' | 'pos' | 'manual'
  const [incomeSourceFilter, setIncomeSourceFilter] = useState<'all' | 'pos' | 'manual'>('all');

  // Modal states
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState<boolean>(false);
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState<boolean>(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState<boolean>(false);
  const [isDebtModalOpen, setIsDebtModalOpen] = useState<boolean>(false);
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState<boolean>(false);
  
  // Active editing & delete items
  const [editingCashFlow, setEditingCashFlow] = useState<CashFlowRecord | null>(null);
  const [editingDebt, setEditingDebt] = useState<CustomerDebt | null>(null);
  const [debtAddAmount, setDebtAddAmount] = useState<string>('');
  const [debtAddDescription, setDebtAddDescription] = useState<string>('');
  const [activeDebtForInstallment, setActiveDebtForInstallment] = useState<CustomerDebt | null>(null);
  const [installmentAmount, setInstallmentAmount] = useState<string>('');
  const [installmentNote, setInstallmentNote] = useState<string>('Cicilan');

  // Custom confirmation modals for deleting
  const [cashFlowToDelete, setCashFlowToDelete] = useState<CashFlowRecord | null>(null);
  const [debtToDelete, setDebtToDelete] = useState<CustomerDebt | null>(null);
  const [debtToPayoff, setDebtToPayoff] = useState<CustomerDebt | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isConfirmClearAllOpen, setIsConfirmClearAllOpen] = useState<boolean>(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const executeClearAllData = async () => {
    setIsDeleting(true);
    try {
      await db.cashFlows.clear();
      await db.transactions.clear();
      await db.debts.clear();
      if (auth.currentUser) {
        await Promise.allSettled([
          deleteAllCashFlowsFromFirestore(storeId || undefined),
          deleteAllTransactionsFromFirestore(storeId || undefined),
          deleteAllDebtsFromFirestore(storeId || undefined)
        ]);
      }
      setCashFlows([]);
      setDebts([]);
      setPosTransactions([]);
      await loadData();
      setIsConfirmClearAllOpen(false);
      showToast("Semua data transaksi dan arus kas berhasil dihapus");
    } catch (err: any) {
      console.error('Error clearing data:', err);
      showToast("Gagal menghapus beberapa data: " + (err?.message || 'Error'));
    } finally {
      setIsDeleting(false);
    }
  };


  // Helper to safely parse any timestamp (numeric, string, or Firestore Timestamp)
  const parseTimestamp = useCallback((val: any): number => {
    if (!val) return Date.now();
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = Date.parse(val);
      if (!isNaN(parsed)) return parsed;
    }
    if (typeof val?.toMillis === 'function') return val.toMillis();
    if (typeof val?.seconds === 'number') return val.seconds * 1000;
    return Date.now();
  }, []);

  // 1. Fetch data from Dexie
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cfList, debtList, txList] = await Promise.all([
        db.cashFlows.toArray(),
        db.debts.toArray(),
        db.transactions.toArray()
      ]);
      setCashFlows(
        cfList
          .map(cf => ({ ...cf, timestamp: parseTimestamp(cf.timestamp) }))
          .sort((a, b) => b.timestamp - a.timestamp)
      );
      setDebts(debtList.sort((a, b) => b.createdAt - a.createdAt));
      setPosTransactions(
        txList
          .map(tx => ({ ...tx, timestamp: parseTimestamp(tx.timestamp) }))
          .sort((a, b) => b.timestamp - a.timestamp)
      );
    } catch (err) {
      console.error('Failed to load pembukuan data from Dexie:', err);
    } finally {
      setIsLoading(false);
    }
  }, [parseTimestamp]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time listener for Firestore when user is signed in
  useEffect(() => {
    setActiveStoreId(storeId || null);
  }, [storeId]);

  useEffect(() => {
    let unsubCf: (() => void) | null = null;
    let unsubDebts: (() => void) | null = null;
    let unsubTx: (() => void) | null = null;

    const unsubAuth = subscribeToAuthState((user) => {
      // Unsubscribe previous listeners
      if (unsubCf) { unsubCf(); unsubCf = null; }
      if (unsubDebts) { unsubDebts(); unsubDebts = null; }
      if (unsubTx) { unsubTx(); unsubTx = null; }

      if (user) {
        unsubCf = subscribeCashFlows(
          async (remoteList) => {
            if (remoteList) {
              const mapped = (remoteList || [])
                .map(cf => ({ ...cf, timestamp: parseTimestamp(cf.timestamp) }))
                .sort((a, b) => b.timestamp - a.timestamp);
              setCashFlows(mapped);
              try {
                await db.cashFlows.clear();
                if (mapped.length > 0) {
                  await db.cashFlows.bulkAdd(mapped);
                }
              } catch (e) {
                console.warn('Mirror cashflows error:', e);
              }
            }
          },
          undefined,
          storeId || undefined
        );

        unsubDebts = subscribeDebts(
          async (remoteDebts) => {
            if (remoteDebts) {
              const sorted = (remoteDebts || []).sort((a, b) => b.createdAt - a.createdAt);
              setDebts(sorted);
              try {
                await db.debts.clear();
                if (sorted.length > 0) {
                  await db.debts.bulkAdd(sorted);
                }
              } catch (e) {
                console.warn('Mirror debts error:', e);
              }
            }
          },
          undefined,
          storeId || undefined
        );

        unsubTx = subscribeTransactions(
          async (remoteList) => {
            if (remoteList) {
              const mapped = (remoteList || [])
                .map(tx => ({ ...tx, timestamp: parseTimestamp(tx.timestamp) }))
                .sort((a, b) => b.timestamp - a.timestamp);
              setPosTransactions(mapped);
              try {
                await db.transactions.clear();
                if (mapped.length > 0) {
                  await db.transactions.bulkAdd(mapped);
                }
              } catch (e) {
                console.warn('Mirror transactions error:', e);
              }
            }
          },
          undefined,
          storeId || undefined
        );
      } else {
        // Fallback to local Dexie data
        loadData();
      }
    });

    return () => {
      unsubAuth();
      if (unsubCf) unsubCf();
      if (unsubDebts) unsubDebts();
      if (unsubTx) unsubTx();
    };
  }, [storeId, loadData, parseTimestamp]);

  // Form states for Income / Expense
  const [formType, setFormType] = useState<'income' | 'expense'>('income');
  const [formCategory, setFormCategory] = useState<string>('Transfer Uang');
  const [formCustomerName, setFormCustomerName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formDpAmount, setFormDpAmount] = useState<string>('');
  const [formCost, setFormCost] = useState<string>('');
  const [formStatus, setFormStatus] = useState<'lunas' | 'belum_lunas'>('lunas');
  const [formPaymentMethod, setFormPaymentMethod] = useState<string>('Tunai');
  const [formDate, setFormDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Helper to parse date string in local timezone
  const parseLocalDateTime = useCallback((dateStr: string): number => {
    if (!dateStr) return Date.now();
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const now = new Date();
      return new Date(year, month, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).getTime();
    }
    const parsed = Date.parse(dateStr);
    return isNaN(parsed) ? Date.now() : parsed;
  }, []);

  const formatShortDateTime = useCallback((timestamp: any): string => {
    const timeNum = Number(timestamp) || Date.now();
    const datePart = new Date(timeNum).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short'
    });
    const timePart = new Date(timeNum).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${datePart}, ${timePart}`;
  }, []);

  const formatDetailDateTime = useCallback((timestamp: any): string => {
    const timeNum = Number(timestamp) || Date.now();
    const datePart = new Date(timeNum).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const timePart = new Date(timeNum).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${datePart} • ${timePart}`;
  }, []);

  // Form states for Debt (Buku Piutang / Bon Pelanggan Murni)
  const [debtCustomerName, setDebtCustomerName] = useState<string>('');
  const [debtCustomerPhone, setDebtCustomerPhone] = useState<string>('');
  const [debtDescription, setDebtDescription] = useState<string>('');
  const [debtTotalAmount, setDebtTotalAmount] = useState<string>('');
  const [debtPaidInitial, setDebtPaidInitial] = useState<string>('0');
  const [debtDueDate, setDebtDueDate] = useState<string>('');

  // Income category presets
  const incomeCategories = [
    'Transfer Uang',
    'Tarik Tunai',
    'Top-Up E-Wallet',
    'Token Listrik & PLN',
    'Pulsa & Paket Data',
    'Voucher Game',
    'Jasa Antar / Ongkir',
    'Jasa Servis / Ketik',
    'Lainnya'
  ];

  // Expense category presets
  const expenseCategories = [
    'Top-Up Saldo Server Pulsa',
    'Belanja Stok Aksesoris / HP',
    'Operasional & Listrik Toko',
    'Kertas Struk Thermal & ATK',
    'Gaji / Konsumsi Karyawan',
    'Sewa Tempat & Internet',
    'Lainnya'
  ];

  // Date filtering logic
  const isDateInPeriod = useCallback((timestamp: any): boolean => {
    const timeNum = parseTimestamp(timestamp);
    const recordDate = new Date(timeNum);
    const now = new Date();

    if (period === 'today') {
      return (
        recordDate.getDate() === now.getDate() &&
        recordDate.getMonth() === now.getMonth() &&
        recordDate.getFullYear() === now.getFullYear()
      );
    }
    if (period === 'this_month') {
      return (
        recordDate.getMonth() === now.getMonth() &&
        recordDate.getFullYear() === now.getFullYear()
      );
    }
    if (period === 'custom') {
      const start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
      return timeNum >= start.getTime() && timeNum <= end.getTime();
    }
    return true; // 'all'
  }, [period, customStartDate, customEndDate, parseTimestamp]);

  // Filtered Cashflows
  const filteredCashFlows = useMemo(() => {
    return cashFlows.filter(cf => {
      if (!isDateInPeriod(cf.timestamp)) return false;
      if (selectedCategoryFilter !== 'all' && cf.category !== selectedCategoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = cf.description.toLowerCase().includes(q);
        const matchCat = cf.category.toLowerCase().includes(q);
        if (!matchDesc && !matchCat) return false;
      }
      return true;
    });
  }, [cashFlows, isDateInPeriod, selectedCategoryFilter, searchQuery]);

  // Filtered POS Transactions
  const filteredPosTransactions = useMemo(() => {
    return posTransactions.filter(tx => isDateInPeriod(tx.timestamp));
  }, [posTransactions, isDateInPeriod]);

  // Financial Metrics Calculation
  const metrics = useMemo(() => {
    // 1. POS Sales Revenue & Profit
    const posTotalRevenue = filteredPosTransactions.reduce((acc, tx) => acc + (tx.total || 0), 0);

    // 2. Manual Income (Luar Kasir)
    const incomeRecords = filteredCashFlows.filter(cf => cf.type === 'income');
    const manualIncomeTotal = incomeRecords.reduce((acc, cf) => acc + (cf.amount || 0), 0);
    const manualProfitTotal = incomeRecords.reduce((acc, cf) => acc + (cf.profit !== undefined ? cf.profit : (cf.amount - (cf.cost || 0))), 0);
    const manualCostTotal = incomeRecords.reduce((acc, cf) => acc + (cf.cost || 0), 0);

    // 3. Store Expenses & Capital Cost
    const expenseRecords = filteredCashFlows.filter(cf => cf.type === 'expense');
    const operationalExpenses = expenseRecords.reduce((acc, cf) => acc + (cf.amount || 0), 0);
    const totalExpenses = operationalExpenses + manualCostTotal;

    // 4. Combined Metrics
    const totalGrossRevenue = posTotalRevenue + manualIncomeTotal;
    const netProfit = totalGrossRevenue - totalExpenses; // Kas Masuk dikurangi Pengeluaran = Laba

    // 5. Debt metrics (All unpaid)
    const totalUnpaidDebts = debts
      .filter(d => d.status !== 'lunas')
      .reduce((acc, d) => acc + (d.remainingAmount || 0), 0);
    const countUnpaidDebts = debts.filter(d => d.status !== 'lunas').length;

    return {
      posTotalRevenue,
      manualIncomeTotal,
      manualProfitTotal,
      operationalExpenses,
      manualCostTotal,
      totalExpenses,
      totalGrossRevenue,
      netProfit,
      totalUnpaidDebts,
      countUnpaidDebts,
      countIncome: incomeRecords.length,
      countExpense: expenseRecords.length,
      countPos: filteredPosTransactions.length
    };
  }, [filteredCashFlows, filteredPosTransactions, debts]);

  // Unified recent activities for "Arus Transaksi Keuangan Terbaru"
  const unifiedRecentTransactions = useMemo(() => {
    const list: Array<{
      id: string;
      source: 'pos' | 'manual';
      type: 'income' | 'expense';
      category: string;
      description: string;
      amount: number;
      cost?: number;
      profit?: number;
      status: 'lunas' | 'belum_lunas';
      paymentMethod?: string;
      timestamp: number;
      dateString: string;
      cashFlowRecord?: CashFlowRecord;
      posTransaction?: Transaction;
    }> = [];

    // 1. Manual CashFlows (Income and Expense)
    if (dashboardFilter !== 'pos') {
      for (const cf of filteredCashFlows) {
        if (dashboardFilter === 'income' && cf.type !== 'income') continue;
        if (dashboardFilter === 'expense' && cf.type !== 'expense') continue;

        list.push({
          id: `cf-${cf.id || cf.timestamp}`,
          source: 'manual',
          type: cf.type,
          category: cf.category,
          description: cf.description,
          amount: cf.amount,
          cost: cf.cost,
          profit: cf.profit,
          status: cf.status,
          paymentMethod: cf.paymentMethod,
          timestamp: cf.timestamp,
          dateString: formatShortDateTime(cf.timestamp),
          cashFlowRecord: cf
        });
      }
    }

    // 2. POS Transactions (Automatic Sales Income from POS Register)
    if (dashboardFilter !== 'expense') {
      for (const tx of filteredPosTransactions) {
        const items = Array.isArray(tx.items) ? tx.items : [];
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchInv = (tx.invoiceNumber || '').toLowerCase().includes(q);
          const matchItem = items.some(i => (i?.product?.name || '').toLowerCase().includes(q));
          const matchCashier = (tx.cashierName || '').toLowerCase().includes(q);
          if (!matchInv && !matchItem && !matchCashier) continue;
        }

        const itemsSummary = items.map(i => `${i?.product?.name || 'Produk'} (${i?.quantity || 1}x)`).join(', ');
        const desc = itemsSummary 
          ? `Penjualan Kasir #${tx.invoiceNumber}: ${itemsSummary}` 
          : `Penjualan Kasir #${tx.invoiceNumber}`;

        const methodLabel = tx.paymentMethod === 'cash' ? 'Tunai' : (tx.paymentMethod === 'qris' ? 'QRIS' : 'Transfer');

        list.push({
          id: `pos-${tx.id || tx.firestoreId || tx.invoiceNumber}`,
          source: 'pos',
          type: 'income',
          category: 'Kasir POS',
          description: desc,
          amount: tx.total,
          status: 'lunas',
          paymentMethod: methodLabel,
          timestamp: tx.timestamp,
          dateString: formatShortDateTime(tx.timestamp),
          posTransaction: tx
        });
      }
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [filteredCashFlows, filteredPosTransactions, dashboardFilter, searchQuery]);

  // Combined Income (POS + Manual) for Sub-Tab Pemasukan
  const combinedIncomeRecords = useMemo(() => {
    const list: Array<{
      id: string;
      source: 'pos' | 'manual';
      category: string;
      description: string;
      cost: number;
      amount: number;
      profit: number;
      status: 'lunas' | 'belum_lunas';
      paymentMethod: string;
      timestamp: number;
      dateString: string;
      cashFlowRecord?: CashFlowRecord;
      posTransaction?: Transaction;
    }> = [];

    // 1. Manual Income Records
    if (incomeSourceFilter !== 'pos') {
      const manualIncome = filteredCashFlows.filter(cf => cf.type === 'income');
      for (const cf of manualIncome) {
        list.push({
          id: `cf-${cf.id || cf.timestamp}`,
          source: 'manual',
          category: cf.category,
          description: cf.description,
          cost: cf.cost || 0,
          amount: cf.amount,
          profit: cf.profit || 0,
          status: cf.status,
          paymentMethod: cf.paymentMethod || 'Tunai',
          timestamp: cf.timestamp,
          dateString: formatShortDateTime(cf.timestamp),
          cashFlowRecord: cf
        });
      }
    }

    // 2. POS Sales Records
    if (incomeSourceFilter !== 'manual') {
      for (const tx of filteredPosTransactions) {
        const items = Array.isArray(tx.items) ? tx.items : [];
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchInv = (tx.invoiceNumber || '').toLowerCase().includes(q);
          const matchItem = items.some(i => (i?.product?.name || '').toLowerCase().includes(q));
          const matchCashier = (tx.cashierName || '').toLowerCase().includes(q);
          if (!matchInv && !matchItem && !matchCashier) continue;
        }

        const itemsSummary = items.map(i => `${i?.product?.name || 'Produk'} (${i?.quantity || 1}x)`).join(', ');
        const methodLabel = tx.paymentMethod === 'cash' ? 'Tunai' : (tx.paymentMethod === 'qris' ? 'QRIS' : 'Transfer');

        list.push({
          id: `pos-${tx.id || tx.firestoreId || tx.invoiceNumber}`,
          source: 'pos',
          category: 'Kasir POS',
          description: itemsSummary ? `Penjualan Kasir #${tx.invoiceNumber}: ${itemsSummary}` : `Penjualan Kasir #${tx.invoiceNumber}`,
          cost: 0,
          amount: tx.total,
          profit: tx.total,
          status: 'lunas',
          paymentMethod: methodLabel,
          timestamp: tx.timestamp,
          dateString: formatShortDateTime(tx.timestamp),
          posTransaction: tx
        });
      }
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [filteredCashFlows, filteredPosTransactions, incomeSourceFilter, searchQuery]);

  // Filtered Debts
  const filteredDebts = useMemo(() => {
    return debts.filter(d => {
      if (debtStatusFilter === 'unpaid' && d.status !== 'belum_lunas') return false;
      if (debtStatusFilter === 'partial' && d.status !== 'cicilan') return false;
      if (debtStatusFilter === 'paid' && d.status !== 'lunas') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = d.customerName.toLowerCase().includes(q);
        const matchPhone = d.customerPhone?.toLowerCase().includes(q) || false;
        const matchDesc = d.description.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchDesc) return false;
      }
      return true;
    });
  }, [debts, debtStatusFilter, searchQuery]);

  // Open Modal Helpers
  const handleOpenIncomeModal = (item?: CashFlowRecord) => {
    setFormType('income');
    if (item) {
      setEditingCashFlow(item);
      setFormCategory(item.category);
      setFormDescription(item.description);
      setFormAmount(item.amount.toString());
      setFormCost((item.cost || 0).toString());
      setFormStatus(item.status);
      setFormPaymentMethod(item.paymentMethod || 'Tunai');
      setFormDate(item.dateString);
    } else {
      setEditingCashFlow(null);
      setFormCategory('Transfer Uang');
      setFormDescription('');
      setFormAmount('');
      setFormDpAmount('');
      setFormCost('');
      setFormStatus('lunas');
      setFormPaymentMethod('Tunai');
      setFormDate(new Date().toISOString().split('T')[0]);
    }
    setFormCustomerName('');
    setIsAddingNewCustomer(false);
    setIsIncomeModalOpen(true);
  };

  const handleOpenExpenseModal = (item?: CashFlowRecord) => {
    setFormType('expense');
    if (item) {
      setEditingCashFlow(item);
      setFormCategory(item.category);
      setFormDescription(item.description);
      setFormAmount(item.amount.toString());
      setFormCost('');
      setFormStatus('lunas');
      setFormPaymentMethod(item.paymentMethod || 'Kas Toko');
      setFormDate(item.dateString);
    } else {
      setEditingCashFlow(null);
      setFormCategory('Top-Up Saldo Server Pulsa');
      setFormDescription('');
      setFormAmount('');
      setFormCost('');
      setFormStatus('lunas');
      setFormPaymentMethod('Kas Toko');
      setFormDate(new Date().toISOString().split('T')[0]);
    }
    setIsExpenseModalOpen(true);
  };

  const handleOpenDebtModal = (debt?: CustomerDebt) => {
    if (debt) {
      setEditingDebt(debt);
      setDebtCustomerName(debt.customerName || '');
      setDebtCustomerPhone(debt.customerPhone || '');
      setDebtDescription(debt.description || '');
      setDebtTotalAmount(debt.totalAmount.toString());
      setDebtPaidInitial(debt.paidAmount.toString());
      setDebtDueDate(debt.dueDate || '');
      setDebtAddAmount('');
      setDebtAddDescription('');
    } else {
      setEditingDebt(null);
      setDebtCustomerName('');
      setDebtCustomerPhone('');
      setDebtDescription('');
      setDebtTotalAmount('');
      setDebtPaidInitial('0');
      setDebtDueDate('');
      setDebtAddAmount('');
      setDebtAddDescription('');
    }
    setIsDebtModalOpen(true);
  };

  // Save Income / Expense
  const handleSaveCashFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(formAmount) || 0;
    const costNum = parseFloat(formCost) || 0;
    const profitNum = formType === 'income' ? Math.max(0, amountNum - costNum) : 0;

    if (amountNum <= 0) {
      alert('Nominal harus lebih dari 0');
      return;
    }

    // Handle debt creation for unpaid income (Buku Bon / Piutang) with optional DP AND record profit immediately
    if (formType === 'income' && formStatus === 'belum_lunas') {
      const customerName = formCustomerName.trim() || 'Pelanggan Umum';
      const dpNum = parseFloat(formDpAmount) || 0;
      const remainingDebt = Math.max(0, amountNum - dpNum);

      try {
        // 1. Save to cashFlows so profit is immediately acknowledged in today's profit report.
        // Cash received in cash drawer today is dpNum (Uang Muka / Dibayar Sekarang).
        const cfPayload: CashFlowRecord = {
          type: formType,
          category: formCategory,
          description: formDescription.trim() || `${formCategory} (Bon a.n ${customerName})`,
          amount: amountNum, // Total Harga Jual transaksi
          paidAmount: dpNum, // Uang Muka / DP
          dpAmount: dpNum,
          status: remainingDebt === 0 ? 'lunas' : 'belum_lunas',
          paymentMethod: formPaymentMethod,
          timestamp: editingCashFlow?.timestamp || (formDate ? parseLocalDateTime(formDate) : Date.now()),
          dateString: formDate || new Date().toISOString().split('T')[0],
          storeId: storeId || undefined,
          createdAt: editingCashFlow?.createdAt || new Date().toISOString(),
          cost: Number(costNum) || 0,
          profit: Number(profitNum) || 0 // KEUNTUNGAN DICATAT UTUH DI AWAL!
        };

        if (editingCashFlow?.id) {
          const { id: _, ...updateFields } = cfPayload;
          await db.cashFlows.update(editingCashFlow.id, updateFields);
          if (auth.currentUser) {
            saveCashFlowToFirestore({ ...cfPayload, id: editingCashFlow.id }, storeId || undefined).catch(console.warn);
          }
        } else {
          const localCfId = await db.cashFlows.add(cfPayload);
          if (auth.currentUser) {
            saveCashFlowToFirestore({ ...cfPayload, id: localCfId }, storeId || undefined).catch(console.warn);
          }
        }

        // 2. Add remaining debt to Buku Bon (db.debts) if remainingDebt > 0
        if (remainingDebt > 0) {
          const normalizedName = customerName.toLowerCase();
          const existingDebt = await db.debts
            .filter(d => (d.customerName || '').trim().toLowerCase() === normalizedName)
            .first();

          const debtDate = formDate || new Date().toISOString().split('T')[0];
          const debtTimestamp = parseLocalDateTime(debtDate);
          const noteText = formDescription.trim() 
            ? `${formDescription.trim()} (Total: Rp ${formatRupiah(amountNum)}, DP: Rp ${formatRupiah(dpNum)})`
            : `${formCategory} - Sisa Bon (Total: Rp ${formatRupiah(amountNum)}, DP: Rp ${formatRupiah(dpNum)})`;

          const newMutation: DebtMutation = {
            id: 'mut-' + Date.now(),
            type: 'give',
            amount: remainingDebt,
            note: noteText,
            timestamp: debtTimestamp,
            dateString: debtDate
          };

          if (existingDebt && existingDebt.id) {
            const existingMutations = existingDebt.mutations || [];
            const updatedMutations = [newMutation, ...existingMutations];
            const newTotal = (existingDebt.totalAmount || 0) + remainingDebt;
            const currentPaid = existingDebt.paidAmount || 0;
            const newRemaining = Math.max(0, newTotal - currentPaid);
            const newStatus: 'belum_lunas' | 'cicilan' | 'lunas' = newRemaining === 0 ? 'lunas' : (currentPaid > 0 ? 'cicilan' : 'belum_lunas');
            const desc = existingDebt.description ? `${existingDebt.description}, ${noteText}` : noteText;

            const updateDebtPayload: Partial<CustomerDebt> = {
              totalAmount: newTotal,
              remainingAmount: newRemaining,
              status: newStatus,
              description: desc,
              mutations: updatedMutations,
              updatedAt: Date.now()
            };

            await db.debts.update(existingDebt.id, updateDebtPayload);
            if (auth.currentUser) {
              await updateDebtInFirestore(
                existingDebt.firestoreId || existingDebt.id,
                updateDebtPayload,
                existingDebt.createdAt
              );
            }
          } else {
            const debtPayload: CustomerDebt = {
              customerName: customerName,
              description: noteText,
              totalAmount: remainingDebt,
              paidAmount: 0,
              remainingAmount: remainingDebt,
              status: 'belum_lunas',
              debtCategory: 'pelanggan',
              createdAt: debtTimestamp,
              updatedAt: Date.now(),
              payments: [],
              mutations: [newMutation],
              storeId: storeId || undefined
            };

            const localDebtId = await db.debts.add(debtPayload);
            if (auth.currentUser) {
              const firestoreId = await saveDebtToFirestore({ ...debtPayload, id: localDebtId }, storeId || undefined);
              await db.debts.update(localDebtId, { firestoreId });
            }
          }
        }

        sounds.playSuccess();
        showToast(`✓ Keuntungan Rp ${formatRupiah(profitNum)} dicatat & bon "${customerName}" tersimpan!`);
        setIsIncomeModalOpen(false);
        setEditingCashFlow(null);
        loadData();
      } catch (err: any) {
        console.error('Error saving unpaid income / debt:', err);
        alert('Gagal menyimpan transaksi: ' + err.message);
      }
      return;
    }

    const payload: CashFlowRecord = {
      type: formType,
      category: formCategory,
      description: formDescription.trim() || formCategory,
      amount: amountNum,
      status: formStatus,
      paymentMethod: formPaymentMethod,
      timestamp: editingCashFlow?.timestamp || (formDate ? parseLocalDateTime(formDate) : Date.now()),
      dateString: formDate || new Date().toISOString().split('T')[0],
      storeId: storeId || undefined,
      createdAt: editingCashFlow?.createdAt || new Date().toISOString()
    };
    if (formType === 'income') {
      payload.cost = Number(costNum) || 0;
      payload.profit = Number(profitNum) || 0;
    }

    try {
      if (editingCashFlow?.id) {
        const { id: _, ...updateFields } = payload;
        await db.cashFlows.update(editingCashFlow.id, updateFields);
        if (auth.currentUser) {
          saveCashFlowToFirestore({ ...payload, id: editingCashFlow.id }, storeId || undefined).catch(console.warn);
        }
        showToast(`✓ Catatan ${formType === 'income' ? 'pemasukan' : 'pengeluaran'} diperbarui!`);
      } else {
        const localId = await db.cashFlows.add(payload);
        if (auth.currentUser) {
          saveCashFlowToFirestore({ ...payload, id: localId }, storeId || undefined).catch(console.warn);
        }
        showToast(`✓ Berhasil mencatat ${formType === 'income' ? 'kas masuk' : 'kas keluar'}!`);
      }
      sounds.playSuccess();
      setIsIncomeModalOpen(false);
      setIsExpenseModalOpen(false);
      loadData();
    } catch (err: any) {
      console.error('Error saving cashflow:', err);
      alert('Gagal menyimpan data: ' + err.message);
    }
  };

  // Execute Delete Cash Flow Record (no window.confirm, safe for iframes)
  const executeDeleteCashFlow = async (item: CashFlowRecord) => {
    setIsDeleting(true);
    try {
      if (item.id) {
        await db.cashFlows.delete(item.id);
      }
      if (auth.currentUser) {
        await deleteCashFlowFromFirestore(item);
      }
      sounds.playScanBeep();
      showToast(`✓ Catatan ${item.type === 'income' ? 'pemasukan' : 'pengeluaran'} "${item.description}" berhasil dihapus!`);
      setCashFlowToDelete(null);
      setIsIncomeModalOpen(false);
      setIsExpenseModalOpen(false);
      loadData();
    } catch (err: any) {
      console.error('Failed to delete cash flow:', err);
      showToast('Gagal menghapus: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Save or Update Customer Debt (Buku Bon / Piutang)
  const handleSaveDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalNum = parseFloat(debtTotalAmount) || 0;
    const paidNum = parseFloat(debtPaidInitial) || 0;
    const remainingNum = Math.max(0, totalNum - paidNum);

    if (totalNum <= 0) {
      alert('Total nominal hutang harus lebih dari 0');
      return;
    }

    let initialStatus: 'belum_lunas' | 'cicilan' | 'lunas' = 'belum_lunas';
    if (remainingNum === 0) {
      initialStatus = 'lunas';
    } else if (paidNum > 0) {
      initialStatus = 'cicilan';
    }

    // Editing Existing Debt
    if (editingDebt && editingDebt.id) {
      const addAmountNum = parseFloat(debtAddAmount) || 0;
      const finalTotal = totalNum + addAmountNum;
      const finalRemaining = Math.max(0, finalTotal - (editingDebt.paidAmount || 0));
      const finalStatus: 'belum_lunas' | 'cicilan' | 'lunas' = finalRemaining === 0 ? 'lunas' : (editingDebt.paidAmount > 0 ? 'cicilan' : 'belum_lunas');

      const desc = debtDescription.trim() || 'Bon Belanja';
      const updatedDescription = debtAddDescription.trim() ? `${desc} + ${debtAddDescription.trim()}` : desc;

      const updatedPayload: Partial<CustomerDebt> = {
        customerName: debtCustomerName.trim() || 'Pelanggan Umum',
        description: updatedDescription,
        totalAmount: finalTotal,
        remainingAmount: finalRemaining,
        status: finalStatus,
        updatedAt: Date.now()
      };
      if (debtCustomerPhone.trim()) updatedPayload.customerPhone = debtCustomerPhone.trim();
      if (debtDueDate) updatedPayload.dueDate = debtDueDate;

      try {
        await db.debts.update(editingDebt.id, updatedPayload);
        if (auth.currentUser) {
          await updateDebtInFirestore(editingDebt.firestoreId || editingDebt.id, updatedPayload, editingDebt.createdAt);
        }

        sounds.playSuccess();
        showToast(`✓ Catatan bon "${updatedPayload.customerName}" berhasil diperbarui!`);
        setIsDebtModalOpen(false);
        setEditingDebt(null);
        loadData();
      } catch (err: any) {
        console.error('Error updating debt:', err);
        alert('Gagal memperbarui catatan hutang: ' + err.message);
      }
      return;
    }

    // Creating New Debt
    const initialPayments: DebtPayment[] = [];
    if (paidNum > 0) {
      initialPayments.push({
        id: 'dp-' + Date.now(),
        amount: paidNum,
        timestamp: Date.now(),
        note: 'Uang Muka / DP'
      });
    }

    const payload: CustomerDebt = {
      customerName: debtCustomerName.trim() || 'Pelanggan Umum',
      description: debtDescription.trim() || 'Bon Belanja',
      totalAmount: totalNum,
      paidAmount: paidNum,
      remainingAmount: remainingNum,
      status: initialStatus,
      createdAt: Date.now(),
      payments: initialPayments,
      storeId: storeId || undefined,
      updatedAt: Date.now()
    };
    if (debtCustomerPhone.trim()) payload.customerPhone = debtCustomerPhone.trim();
    if (debtDueDate) payload.dueDate = debtDueDate;

    try {
      // Hapus catatan bon lama yang menggunakan nama yang sama
      const normalizedName = payload.customerName.trim().toLowerCase();
      const oldDebts = await db.debts
        .filter(d => (d.customerName || '').trim().toLowerCase() === normalizedName)
        .toArray();

      for (const oldDebt of oldDebts) {
        if (oldDebt.id) {
          await db.debts.delete(oldDebt.id);
        }
        if (auth.currentUser) {
          await deleteDebtFromFirestore(oldDebt);
        }
      }
      if (auth.currentUser) {
        await deleteDebtsByCustomerFromFirestore(payload.customerName, storeId || undefined);
      }
      setDebts(prev => prev.filter(d => (d.customerName || '').trim().toLowerCase() !== normalizedName));

      const localId = await db.debts.add(payload);
      if (auth.currentUser) {
        const firestoreId = await saveDebtToFirestore({ ...payload, id: localId }, storeId || undefined);
        payload.firestoreId = firestoreId;
        await db.debts.update(localId, { firestoreId });
      }

      // Jika ada uang muka atau pembayaran awal saat bon dibuat, masukkan uang fisik ke Arus Kas
      if (paidNum > 0) {
        const cfPayload: CashFlowRecord = {
          type: 'income',
          category: 'Pelunasan Bon Pelanggan',
          description: `Uang Muka / DP Bon: ${payload.customerName}`,
          amount: paidNum,
          status: 'lunas',
          paymentMethod: 'Tunai',
          timestamp: Date.now(),
          dateString: new Date().toISOString().split('T')[0],
          storeId: storeId || undefined
        };
        const cfId = await db.cashFlows.add(cfPayload);
        if (auth.currentUser) {
          saveCashFlowToFirestore({ ...cfPayload, id: cfId }, storeId || undefined).catch(console.warn);
        }
      }

      sounds.playSuccess();
      showToast(`✓ Catatan bon untuk "${payload.customerName}" tersimpan (bon lama dihapus)!`);
      setIsDebtModalOpen(false);
      setEditingDebt(null);
      loadData();
    } catch (err: any) {
      console.error('Error saving debt:', err);
      alert('Gagal menyimpan catatan hutang: ' + err.message);
    }
  };

  // Installment (Cicilan Hutang)
  const handleOpenInstallmentModal = (debt: CustomerDebt) => {
    setActiveDebtForInstallment(debt);
    setInstallmentAmount('');
    setInstallmentNote('Cicilan');
    setIsInstallmentModalOpen(true);
  };

  const handleSaveInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDebtForInstallment || !activeDebtForInstallment.id) return;
    const payNum = parseFloat(installmentAmount) || 0;

    if (payNum <= 0) {
      alert('Nominal pembayaran cicilan harus lebih dari 0!');
      return;
    }

    const currentRemaining = activeDebtForInstallment.remainingAmount;
    const paymentToRecord = Math.min(payNum, currentRemaining);

    const newPaid = activeDebtForInstallment.paidAmount + paymentToRecord;
    const newRemaining = Math.max(0, activeDebtForInstallment.totalAmount - newPaid);
    const newStatus: 'belum_lunas' | 'cicilan' | 'lunas' = newRemaining <= 0 ? 'lunas' : 'cicilan';

    const newPaymentEntry: DebtPayment = {
      id: 'dp-' + Date.now(),
      amount: paymentToRecord,
      timestamp: Date.now(),
      note: installmentNote.trim() || 'Cicilan'
    };

    const updatedPayments = [...(activeDebtForInstallment.payments || []), newPaymentEntry];

    try {
      await db.debts.update(activeDebtForInstallment.id, {
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        status: newStatus,
        payments: updatedPayments,
        updatedAt: Date.now()
      });

      if (auth.currentUser) {
        await updateDebtInFirestore(
          activeDebtForInstallment.firestoreId || activeDebtForInstallment.id, 
          {
            paidAmount: newPaid,
            remainingAmount: newRemaining,
            status: newStatus,
            payments: updatedPayments,
            updatedAt: Date.now()
          },
          activeDebtForInstallment.createdAt
        );
      }

      // Catat uang fisik kas masuk ke KasFlow
      const cfPayload: CashFlowRecord = {
        type: 'income',
        category: 'Pelunasan Bon Pelanggan',
        description: `Bayar bon: ${activeDebtForInstallment.customerName} (${installmentNote.trim() || 'Cicilan'})`,
        amount: paymentToRecord,
        status: 'lunas',
        paymentMethod: 'Tunai',
        timestamp: Date.now(),
        dateString: new Date().toISOString().split('T')[0],
        storeId: storeId || undefined
      };
      const cfId = await db.cashFlows.add(cfPayload);
      if (auth.currentUser) {
        saveCashFlowToFirestore({ ...cfPayload, id: cfId }, storeId || undefined).catch(console.warn);
      }

      sounds.playSuccess();
      showToast(`✓ Pembayaran cicilan Rp ${formatRupiah(paymentToRecord)} dari "${activeDebtForInstallment.customerName}" berhasil dicatat!`);
      setIsInstallmentModalOpen(false);
      loadData();
    } catch (err: any) {
      console.error(err);
      alert('Gagal mencatat cicilan: ' + err.message);
    }
  };

  // Instant Payoff (Lunasi Sekaligus)
  const handleQuickPayoffDebt = (debt: CustomerDebt) => {
    setDebtToPayoff(debt);
  };

  const executePayoffDebt = async (debt: CustomerDebt) => {
    setDebtToPayoff(null);
    if (!debt.id) return;
    try {
      const fullAmount = debt.remainingAmount;

      const newPayment: DebtPayment = {
        id: 'dp-' + Date.now(),
        amount: fullAmount,
        timestamp: Date.now(),
        note: 'Pelunasan Total'
      };

      const updatedPayments = [...(debt.payments || []), newPayment];

      await db.debts.update(debt.id, {
        paidAmount: debt.totalAmount,
        remainingAmount: 0,
        status: 'lunas',
        payments: updatedPayments,
        updatedAt: Date.now()
      });

      if (auth.currentUser) {
        await updateDebtInFirestore(
          debt.firestoreId || debt.id,
          {
            paidAmount: debt.totalAmount,
            remainingAmount: 0,
            status: 'lunas',
            payments: updatedPayments,
            updatedAt: Date.now()
          },
          debt.createdAt
        );
      }

      // Catat uang fisik kas masuk ke KasFlow
      const cfPayload: CashFlowRecord = {
        type: 'income',
        category: 'Pelunasan Bon Pelanggan',
        description: `Pelunasan total bon: ${debt.customerName}`,
        amount: fullAmount,
        status: 'lunas',
        paymentMethod: 'Tunai',
        timestamp: Date.now(),
        dateString: new Date().toISOString().split('T')[0],
        storeId: storeId || undefined
      };
      const cfId = await db.cashFlows.add(cfPayload);
      if (auth.currentUser) {
        saveCashFlowToFirestore({ ...cfPayload, id: cfId }, storeId || undefined).catch(console.warn);
      }

      sounds.playSuccess();
      showToast(`✓ Bon "${debt.customerName}" sebesar Rp ${formatRupiah(fullAmount)} telah LUNAS!`);
      loadData();
    } catch (err: any) {
      console.error(err);
      alert('Gagal melunasi: ' + err.message);
    }
  };

  // Execute Delete Debt Record (no window.confirm, safe for iframes)
  const executeDeleteDebt = async (debt: CustomerDebt) => {
    setIsDeleting(true);
    try {
      if (debt.id) {
        await db.debts.delete(debt.id);
      }
      if (auth.currentUser) {
        await deleteDebtFromFirestore(debt);
      }
      sounds.playScanBeep();
      showToast(`✓ Catatan bon untuk "${debt.customerName}" berhasil dihapus!`);
      setDebtToDelete(null);
      loadData();
    } catch (err: any) {
      console.error('Failed to delete debt:', err);
      showToast('Gagal menghapus: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Print Thermal 58mm Receipt for Debt (Nota Bon)
  const handlePrintDebtReceipt = async (debt: CustomerDebt) => {
    const W = settings.paperWidthChars || 32;
    const encoder = new EscPosEncoder();
    encoder.init();
    encoder.kickDrawer();

    // Store Header
    encoder.align('center');
    encoder.bold(true);
    encoder.textLine(settings.storeName.toUpperCase());
    encoder.bold(false);
    if (settings.address) encoder.textLine(settings.address.substring(0, W));
    if (settings.phone) encoder.textLine('Telp: ' + settings.phone);
    encoder.separator('=', W);

    // Title
    encoder.bold(true);
    encoder.textLine('NOTA CATATAN BON / HUTANG');
    encoder.bold(false);
    encoder.separator('-', W);

    // Customer Info
    encoder.align('left');
    encoder.twoColumn('Pelanggan', debt.customerName.substring(0, W - 11), W);
    if (debt.customerPhone) {
      encoder.twoColumn('No. HP', debt.customerPhone, W);
    }
    const dObj = new Date(debt.createdAt);
    const dateFormatted = dObj.toLocaleDateString('id-ID') + ' ' + dObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    encoder.twoColumn('Tanggal', dateFormatted, W);
    if (debt.dueDate) {
      encoder.twoColumn('Jatuh Tempo', debt.dueDate, W);
    }
    encoder.separator('-', W);

    // Description
    encoder.textLine('Keperluan:');
    encoder.textLine(' ' + debt.description.substring(0, W - 1));
    encoder.separator('-', W);

    // Amount Breakdown
    encoder.twoColumn('Total Bon', `Rp ${formatRupiah(debt.totalAmount)}`, W);
    encoder.twoColumn('Sudah Bayar', `Rp ${formatRupiah(debt.paidAmount)}`, W);
    encoder.separator('=', W);

    // Remaining Debt
    encoder.bold(true);
    encoder.twoColumn('SISA HUTANG', `Rp ${formatRupiah(debt.remainingAmount)}`, W);
    encoder.bold(false);
    encoder.twoColumn('Status', debt.status === 'lunas' ? 'LUNAS' : debt.status === 'cicilan' ? 'DICICIL' : 'BELUM LUNAS', W);
    if (debt.debtType === 'jasa_antar' || debt.usesCapital === false) {
      encoder.twoColumn('Jenis Bon', 'JASA ANTAR', W);
    } else if (debt.debtType === 'kasbon') {
      encoder.twoColumn('Jenis Bon', 'PINJAMAN KASBON', W);
    }
    encoder.separator('=', W);

    // Payments History if any
    if (debt.payments && debt.payments.length > 0) {
      encoder.align('center');
      encoder.textLine('Riwayat Pembayaran:');
      encoder.align('left');
      debt.payments.forEach((p, idx) => {
        const pDate = new Date(p.timestamp).toLocaleDateString('id-ID');
        encoder.twoColumn(`${idx + 1}. ${pDate}`, `Rp ${formatRupiah(p.amount)}`, W);
      });
      encoder.separator('-', W);
    }

    // Footer
    encoder.align('center');
    encoder.textLine('Harap disimpan sebagai bukti.');
    encoder.textLine('Terima kasih atas kerja samanya.');
    encoder.feed(settings.feedLines || 1);

    const binary = encoder.encode();

    try {
      const result = await printerService.printUnified(
        binary,
        `Nota Bon: ${debt.customerName}`,
        runtimeEnv === 'tauri' ? 'tauri_raw' : 'simulator',
        settings.linuxDevicePath || '/dev/usb/lp0'
      );
      showToast(result.message || 'Berhasil mencetak nota bon!');
    } catch (err: any) {
      alert('Gagal mencetak: ' + err.message);
    }
  };

  // WhatsApp reminder message
  const handleSendWhatsAppReminder = (debt: CustomerDebt) => {
    if (!debt.customerPhone) {
      alert('Pelanggan ini belum memiliki nomor telepon / WhatsApp.');
      return;
    }
    let cleanPhone = debt.customerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    }
    const message = encodeURIComponent(
      `Halo Kak ${debt.customerName}, salam dari *${settings.storeName}*.\n\nMengingatkan kembali untuk catatan bon/tagihan:\n- Keperluan: ${debt.description}\n- Total: Rp ${formatRupiah(debt.totalAmount)}\n- Sisa Belum Lunas: *Rp ${formatRupiah(debt.remainingAmount)}*\n\nBisa dibayarkan langsung ke toko ya kak. Terima kasih banyak! 🙏`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Floating Action Toast */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-[100] max-w-sm p-4 bg-slate-900 border border-emerald-500/30 text-emerald-300 rounded-2xl text-xs flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="font-bold text-white">Sukses</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{toastMessage}</p>
          </div>
        </div>
      )}

      {/* Top Banner / Store Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-extrabold shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
              Pembukuan & Arus Kas
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Pencatatan keuangan harian, pengeluaran operasional, dan buku bon pelanggan {settings.storeName || 'Cool Kids Cell'}.
            </p>
          </div>
        </div>

        {/* Action Buttons: Clean & Direct */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => handleOpenIncomeModal()}
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition cursor-pointer"
          >
            <TrendingUp className="w-4 h-4" />
            + Kas Masuk
          </button>

          <button
            onClick={() => handleOpenExpenseModal()}
            className="px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <TrendingDown className="w-4 h-4" />
            + Kas Keluar
          </button>

          <button
            onClick={() => setActiveSubTab('debts')}
            className="px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            Buku Utang
          </button>
        </div>
      </div>

      {/* Primary Sub-Tabs Navigation */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeSubTab === 'dashboard'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            Buku Kas (Arus Kas)
          </button>

          <button
            onClick={() => setActiveSubTab('income')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeSubTab === 'income'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Kas Masuk ({metrics.countIncome})
          </button>

          <button
            onClick={() => setActiveSubTab('expense')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeSubTab === 'expense'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            Kas Keluar ({metrics.countExpense})
          </button>

          <button
            onClick={() => setActiveSubTab('debts')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeSubTab === 'debts'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Buku Utang ({metrics.countUnpaidDebts} Belum Lunas)
          </button>
        </div>

        {/* Time Period Filter Pill Buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setIsConfirmClearAllOpen(true)}
            className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/80 text-rose-300 rounded-xl text-xs font-bold transition mr-2 flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Hapus Semua Data
          </button>
          <span className="text-[11px] text-slate-500 hidden lg:inline mr-1">Periode:</span>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setPeriod('today')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                period === 'today' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => setPeriod('this_month')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                period === 'this_month' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Bulan Ini
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                period === 'all' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- 1. SUB-TAB: RINGKASAN & ARUS KAS (DASHBOARD) ---------------- */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* 4 Financial Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* 1. Total Pemasukan Kotor */}
            <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Kas Masuk</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-white">
                Rp {formatRupiah(metrics.totalGrossRevenue)}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>POS: Rp {formatRupiah(metrics.posTotalRevenue)}</span>
                <span>Luar Kasir: Rp {formatRupiah(metrics.manualIncomeTotal)}</span>
              </div>
            </div>

            {/* 2. Total Pengeluaran */}
            <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Pengeluaran</span>
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-rose-400">
                Rp {formatRupiah(metrics.totalExpenses)}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>Ops: Rp {formatRupiah(metrics.operationalExpenses)} | Modal: Rp {formatRupiah(metrics.manualCostTotal)}</span>
                <span className="font-mono">{metrics.countExpense} ops</span>
              </div>
            </div>

            {/* 3. Laba Bersih (Keuntungan) */}
            <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Keuntungan / Laba</span>
                <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
                  <Coins className="w-4 h-4" />
                </div>
              </div>
              <div className={`text-2xl font-black ${metrics.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                Rp {formatRupiah(metrics.netProfit)}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>Margin Penjualan Bersih</span>
                <span className="text-emerald-400 font-bold">Surplus</span>
              </div>
            </div>

            {/* 4. Buku Bon / Piutang Belum Lunas */}
            <div 
              onClick={() => setActiveSubTab('debts')}
              className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-4.5 rounded-2xl shadow-sm space-y-2 cursor-pointer transition group"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider group-hover:text-amber-400 transition">Utang Pelanggan (Piutang)</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-400">
                Rp {formatRupiah(metrics.totalUnpaidDebts)}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>Klik untuk buka Buku Utang</span>
                <span className="text-amber-400 font-bold">{metrics.countUnpaidDebts} Orang</span>
              </div>
            </div>
          </div>

          {/* Quick Flow Breakdown & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Arus Kas Terbaru */}
            <div id="arus-transaksi-keuangan" className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm scroll-mt-20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      Arus Transaksi Keuangan Terbaru
                    </h3>
                    {metrics.countPos > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        {metrics.countPos} Kasir POS Terhubung
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Daftar seluruh transaksi Kasir POS, pemasukan kas, & pengeluaran yang tercatat secara real-time.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadData}
                    className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white rounded-xl transition"
                    title="Muat ulang data"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Notice when transactions exist in other periods */}
              {period === 'today' && filteredPosTransactions.length === 0 && posTransactions.length > 0 && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <Receipt className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>
                      Ada <strong>{posTransactions.length} transaksi Kasir POS</strong> di riwayat toko Anda (di luar hari ini).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPeriod('all')}
                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-[11px] whitespace-nowrap transition shadow-sm"
                  >
                    Tampilkan Semua Periode
                  </button>
                </div>
              )}

              {/* Quick Filter Tabs: Semua / Kasir POS / Pemasukan Manual / Pengeluaran */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
                <button
                  type="button"
                  onClick={() => setDashboardFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                    dashboardFilter === 'all'
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
                  }`}
                >
                  <span>Semua</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${dashboardFilter === 'all' ? 'bg-black/20 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400'}`}>
                    {metrics.countPos + metrics.countIncome + metrics.countExpense}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDashboardFilter('pos')}
                  className={`px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                    dashboardFilter === 'pos'
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Kasir POS (Sinkron)</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-950 text-emerald-300 font-bold border border-emerald-500/30">
                    {metrics.countPos}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDashboardFilter('income')}
                  className={`px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                    dashboardFilter === 'income'
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
                  }`}
                >
                  <span>Pemasukan (Semua)</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${dashboardFilter === 'income' ? 'bg-black/20 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400'}`}>
                    {metrics.countPos + metrics.countIncome}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDashboardFilter('expense')}
                  className={`px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                    dashboardFilter === 'expense'
                      ? 'bg-rose-600 text-white font-bold shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
                  }`}
                >
                  <span>Pengeluaran</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${dashboardFilter === 'expense' ? 'bg-black/20 text-white font-bold' : 'bg-slate-900 text-slate-400'}`}>
                    {metrics.countExpense}
                  </span>
                </button>
              </div>

              <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
                {unifiedRecentTransactions.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    {dashboardFilter === 'pos'
                      ? 'Belum ada transaksi penjualan Kasir POS di periode ini.'
                      : dashboardFilter === 'expense'
                      ? 'Belum ada catatan pengeluaran di periode ini.'
                      : dashboardFilter === 'income'
                      ? 'Belum ada catatan pemasukan kasir atau luar kasir di periode ini.'
                      : 'Belum ada catatan keuangan atau transaksi kasir di periode ini.'}
                  </div>
                ) : (
                  unifiedRecentTransactions.slice(0, 30).map(item => {
                    const isPos = item.source === 'pos';
                    const isIncome = item.type === 'income';

                    return (
                      <div
                        key={item.id}
                        className={`p-3 bg-slate-950 border rounded-xl flex items-center justify-between gap-3 text-xs transition ${
                          isPos
                            ? 'border-emerald-500/25 hover:border-emerald-500/50 bg-emerald-950/10'
                            : 'border-slate-800 hover:border-slate-750'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isPos
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : isIncome 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {isPos ? (
                              <Receipt className="w-4 h-4" />
                            ) : isIncome ? (
                              <ArrowDownLeft className="w-4 h-4" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white truncate max-w-[280px]">
                                {item.description}
                              </span>
                              {isPos && (
                                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                  KASIR POS
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded text-[10px]">
                                {item.category}
                              </span>
                              {item.paymentMethod && (
                                <span className="bg-slate-850 text-slate-300 px-1.5 py-0.2 rounded text-[10px] font-medium">
                                  {item.paymentMethod}
                                </span>
                              )}
                              <span>• {item.dateString}</span>
                              {item.profit !== undefined && item.profit > 0 && !isPos && (
                                <span className="text-emerald-400 font-medium">Untung: Rp {formatRupiah(item.profit)}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className={`font-mono font-bold text-sm ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isIncome ? '+' : '-'} Rp {formatRupiah(item.amount)}
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              item.status === 'lunas' ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'
                            }`}>
                              {item.status.toUpperCase()}
                            </span>
                          </div>

                          {/* Quick Action Buttons on Dashboard */}
                          <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
                            {isPos ? (
                              onSelectTransactionToPrint && item.posTransaction && (
                                <button
                                  type="button"
                                  onClick={() => onSelectTransactionToPrint(item.posTransaction!)}
                                  className="p-1.5 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 rounded-lg transition"
                                  title="Lihat & Cetak Struk 58mm"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              )
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => item.cashFlowRecord && (isIncome ? handleOpenIncomeModal(item.cashFlowRecord) : handleOpenExpenseModal(item.cashFlowRecord))}
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                                  title="Edit Transaksi"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => item.cashFlowRecord && setCashFlowToDelete(item.cashFlowRecord)}
                                  className="p-1.5 bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 rounded-lg transition"
                                  title="Hapus Transaksi untuk Koreksi"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right 1 Col: Quick Tips & Shortcut Bon Belum Lunas */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-400" />
                    Hutang Belum Lunas
                  </h3>
                  <button
                    onClick={() => setActiveSubTab('debts')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    Buka Bon →
                  </button>
                </div>
                <p className="text-xs text-slate-400 mb-3">Pelanggan yang masih memiliki sisa bon belanja.</p>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {debts.filter(d => d.status !== 'lunas').length === 0 ? (
                    <div className="py-8 text-center text-slate-500 text-xs">
                      🎉 Tidak ada hutang pelanggan yang belum lunas.
                    </div>
                  ) : (
                    debts.filter(d => d.status !== 'lunas').slice(0, 5).map(d => (
                      <div
                        key={d.id}
                        className="p-3 bg-slate-950 border border-amber-500/20 rounded-xl space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-xs">{d.customerName}</span>
                          <span className="font-mono text-xs font-bold text-amber-400">
                            Rp {formatRupiah(d.remainingAmount)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">{d.description}</p>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
                          <span className="text-slate-500">{new Date(d.createdAt).toLocaleDateString('id-ID')}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenDebtModal(d)}
                              className="text-amber-400 hover:text-amber-300 font-bold"
                              title="Edit bon atau tambah hutang pelanggan"
                            >
                              Edit Bon
                            </button>
                            <button
                              onClick={() => handleOpenInstallmentModal(d)}
                              className="text-emerald-400 hover:text-emerald-300 font-bold"
                            >
                              + Cicilan
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* POS Shortcut with Live Synced Metrics */}
              <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl space-y-2.5 mt-4">
                <div className="flex items-center justify-between text-emerald-300 font-bold text-xs">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-400" />
                    <span>Sinkronisasi Kasir POS Aktif</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                    {metrics.countPos} Transaksi
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {metrics.countPos > 0 ? (
                    <>Tercatat omzet kasir <strong className="text-emerald-300 font-mono">Rp {formatRupiah(metrics.posTotalRevenue)}</strong> otomatis terhubung dan tampil di daftar <strong>Arus Transaksi Keuangan Terbaru</strong> di sebelah kiri.</>
                  ) : (
                    <>Setiap transaksi penjualan dari kasir otomatis terhubung dan ditampilkan di daftar Arus Transaksi Keuangan Terbaru.</>
                  )}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDashboardFilter('pos');
                      const el = document.getElementById('arus-transaksi-keuangan');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="flex-1 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Tampilkan di Arus Kas ({metrics.countPos})
                  </button>
                  {onNavigateToPos && (
                    <button
                      type="button"
                      onClick={onNavigateToPos}
                      className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition shadow-sm whitespace-nowrap"
                    >
                      Buka Kasir
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 2. SUB-TAB: PEMASUKAN TOKO & KASIR ---------------- */}
      {activeSubTab === 'income' && (
        <div className="space-y-4">
          {/* Source Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setIncomeSourceFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                incomeSourceFilter === 'all'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>Semua Pemasukan</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${incomeSourceFilter === 'all' ? 'bg-black/20 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'}`}>
                {metrics.countPos + metrics.countIncome}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIncomeSourceFilter('pos')}
              className={`px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                incomeSourceFilter === 'pos'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              <span>Penjualan Kasir POS</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-950 text-emerald-300 font-bold border border-emerald-500/30">
                {metrics.countPos}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIncomeSourceFilter('manual')}
              className={`px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                incomeSourceFilter === 'manual'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>Pemasukan Luar Kasir</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${incomeSourceFilter === 'manual' ? 'bg-black/20 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'}`}>
                {metrics.countIncome}
              </span>
            </button>
          </div>

          {/* POS Sync Info Banner */}
          {incomeSourceFilter !== 'manual' && metrics.countPos > 0 && (
            <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-300">
                <Receipt className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Sinkronisasi Kasir POS Aktif:</strong> {metrics.countPos} transaksi penjualan (Total Rp {formatRupiah(metrics.posTotalRevenue)}) otomatis tercatat di bawah.
                </span>
              </div>
              {onNavigateToPos && (
                <button
                  type="button"
                  onClick={onNavigateToPos}
                  className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-[11px] whitespace-nowrap transition"
                >
                  Buka Kasir
                </button>
              )}
            </div>
          )}

          {/* Search & Actions Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari transaksi pemasukan / no struk..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto min-w-[160px]">
              <CustomSelect
                value={selectedCategoryFilter}
                onChange={val => setSelectedCategoryFilter(val)}
                options={[
                  { label: 'Semua Kategori', value: 'all' },
                  ...incomeCategories.map(c => ({ label: c, value: c }))
                ]}
              />

              <button
                onClick={() => handleOpenIncomeModal()}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition whitespace-nowrap shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Catat Pemasukan
              </button>
            </div>
          </div>

          {/* Income Records Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Kategori & Deskripsi</th>
                    <th className="py-3 px-4 text-right">Modal</th>
                    <th className="py-3 px-4 text-right">Pemasukan</th>
                    <th className="py-3 px-4 text-right">Untung (Laba)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {combinedIncomeRecords.map(item => {
                    const isPos = item.source === 'pos';

                    return (
                      <tr 
                        key={item.id} 
                        className={`transition ${isPos ? 'bg-emerald-950/5 hover:bg-emerald-950/15' : 'hover:bg-slate-850/50'}`}
                      >
                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          {item.dateString}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white flex items-center gap-1.5 flex-wrap">
                            <span>{item.description}</span>
                            {isPos && (
                              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                KASIR POS
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-medium inline-block mt-0.5">
                            {item.category} • {item.paymentMethod || 'Tunai'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400 whitespace-nowrap">
                          {isPos ? '-' : `Rp ${formatRupiah(item.cost || 0)}`}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white whitespace-nowrap">
                          Rp {formatRupiah(item.amount)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                          Rp {formatRupiah(item.profit || 0)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'lunas' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {item.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPos ? (
                              onSelectTransactionToPrint && item.posTransaction && (
                                <button
                                  type="button"
                                  onClick={() => onSelectTransactionToPrint(item.posTransaction!)}
                                  className="p-1.5 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 rounded-lg transition"
                                  title="Lihat & Cetak Struk 58mm"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              )
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => item.cashFlowRecord && handleOpenIncomeModal(item.cashFlowRecord)}
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                                  title="Edit"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => item.cashFlowRecord && setCashFlowToDelete(item.cashFlowRecord)}
                                  className="p-1.5 bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 rounded-lg transition"
                                  title="Hapus Catatan Pemasukan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {combinedIncomeRecords.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        {incomeSourceFilter === 'pos'
                          ? 'Tidak ada transaksi penjualan Kasir POS di periode ini.'
                          : incomeSourceFilter === 'manual'
                          ? 'Tidak ada transaksi pemasukan luar kasir di periode ini.'
                          : 'Tidak ada transaksi pemasukan kasir maupun luar kasir di periode ini.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 3. SUB-TAB: PENGELUARAN OPERASIONAL ---------------- */}
      {activeSubTab === 'expense' && (
        <div className="space-y-4">
          {/* Search & Actions Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari pengeluaran toko..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto min-w-[160px]">
              <CustomSelect
                value={selectedCategoryFilter}
                onChange={val => setSelectedCategoryFilter(val)}
                options={[
                  { label: 'Semua Kategori', value: 'all' },
                  ...expenseCategories.map(c => ({ label: c, value: c }))
                ]}
              />

              <button
                onClick={() => handleOpenExpenseModal()}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition whitespace-nowrap shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Catat Pengeluaran
              </button>
            </div>
          </div>

          {/* Expense Records Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Kategori & Keterangan</th>
                    <th className="py-3 px-4">Sumber Dana</th>
                    <th className="py-3 px-4 text-right">Nominal Pengeluaran</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredCashFlows.filter(cf => cf.type === 'expense').map(item => (
                    <tr key={item.id} className="hover:bg-slate-850/50 transition">
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {item.dateString}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{item.description}</div>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-medium">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {item.paymentMethod || 'Kas Toko'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-400 text-sm">
                        Rp {formatRupiah(item.amount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenExpenseModal(item)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setCashFlowToDelete(item)}
                            className="p-1.5 bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 rounded-lg transition"
                            title="Hapus Catatan Pengeluaran"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredCashFlows.filter(cf => cf.type === 'expense').length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        Tidak ada pengeluaran operasional di periode ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 4. SUB-TAB: BUKU UTANG & PIUTANG (BUKU WARUNG STYLE) ---------------- */}
      {activeSubTab === 'debts' && (
        <BukuUtang
          debts={debts}
          onRefresh={loadData}
          settings={settings}
          storeId={storeId}
          sounds={sounds}
        />
      )}

      {/* ================= MODAL: TAMBAH / EDIT PEMASUKAN ================= */}
      {isIncomeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingCashFlow ? 'Edit Pemasukan' : 'Catat Pemasukan Luar Kasir'}
                  </h3>
                  <p className="text-[11px] text-slate-400">Transfer uang, tarik tunai, top-up e-wallet, dll.</p>
                </div>
              </div>
              <button
                onClick={() => setIsIncomeModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCashFlow} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Kategori Transaksi</label>
                <CustomSelect
                  value={formCategory}
                  onChange={val => setFormCategory(val)}
                  options={incomeCategories.map(c => ({ label: c, value: c }))}
                />
              </div>

              {formStatus === 'belum_lunas' && formType === 'income' && (
                <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Nama Pelanggan</label>
                    <CustomSelect
                      value={isAddingNewCustomer ? 'new' : formCustomerName}
                      onChange={(val) => {
                        if (val === 'new') {
                          setIsAddingNewCustomer(true);
                          setFormCustomerName('');
                        } else {
                          setIsAddingNewCustomer(false);
                          setFormCustomerName(val);
                        }
                      }}
                      options={[
                        ...Array.from(new Set(debts.map(d => d.customerName))).map(name => ({ label: name, value: name })),
                        { label: '+ Tambah Pelanggan Baru', value: 'new' }
                      ]}
                    />
                    {isAddingNewCustomer && (
                      <input
                        type="text"
                        required
                        placeholder="Masukkan nama baru"
                        value={formCustomerName}
                        onChange={e => setFormCustomerName(e.target.value)}
                        className="w-full mt-2 px-3 py-2 bg-slate-950 border border-emerald-500/60 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-semibold"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Uang Muka / DP yang Dibayar (Rp)</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="Contoh: 50000 (0 jika belum bayar sama sekali)"
                      value={formDpAmount}
                      onChange={e => setFormDpAmount(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-amber-500/60 rounded-xl text-amber-400 font-mono font-bold focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Uang kas masuk hari ini. Sisa otomatis dicatat sebagai bon di Buku Bon.</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Keterangan (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Kirim uang BCA a.n Budi 100rb (Opsional)"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Biaya Modal (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Contoh: 100000"
                    value={formCost}
                    onChange={e => setFormCost(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-slate-300 font-mono focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Modal / HPP</p>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">
                    {formStatus === 'belum_lunas' ? 'Total Harga Jual (Rp)' : 'Pemasukan Diterima (Rp)'}
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    placeholder={formStatus === 'belum_lunas' ? 'Contoh: 150000' : 'Contoh: 105000'}
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-emerald-500/60 rounded-xl text-emerald-400 font-mono font-bold focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {formStatus === 'belum_lunas' ? 'Total nilai transaksi keseluruhan' : 'Uang dari pelanggan'}
                  </p>
                </div>
              </div>

              {/* Live Profit & Bon Preview */}
              <div className="p-3 bg-slate-950 rounded-xl space-y-1.5 text-xs border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Estimasi Keuntungan Bersih (Masuk Laba):</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    Rp {formatRupiah(Math.max(0, (parseFloat(formAmount) || 0) - (parseFloat(formCost) || 0)))}
                  </span>
                </div>
                {formStatus === 'belum_lunas' && formType === 'income' && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                    <span className="text-slate-400">Sisa Bon (Masuk Buku Bon):</span>
                    <span className="font-bold text-amber-400 font-mono text-sm">
                      Rp {formatRupiah(Math.max(0, (parseFloat(formAmount) || 0) - (parseFloat(formDpAmount) || 0)))}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Metode Pembayaran</label>
                  <CustomSelect
                    value={formPaymentMethod}
                    onChange={val => setFormPaymentMethod(val)}
                    options={[
                      { label: 'Tunai', value: 'Tunai' },
                      { label: 'Transfer Bank', value: 'Transfer Bank' },
                      { label: 'QRIS', value: 'QRIS' }
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Status Pembayaran</label>
                  <CustomSelect
                    value={formStatus}
                    onChange={val => setFormStatus(val)}
                    options={[
                      { label: 'Lunas', value: 'lunas' },
                      { label: 'Belum Lunas', value: 'belum_lunas' }
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Tanggal</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                {editingCashFlow ? (
                  <button
                    type="button"
                    onClick={() => setCashFlowToDelete(editingCashFlow)}
                    className="px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 font-semibold rounded-xl flex items-center gap-1.5 transition text-xs"
                    title="Hapus transaksi ini untuk mengoreksi kesalahan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Catatan Ini</span>
                  </button>
                ) : <div />}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsIncomeModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-md transition"
                  >
                    Simpan Pemasukan
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: TAMBAH / EDIT PENGELUARAN ================= */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingCashFlow ? 'Edit Pengeluaran' : 'Catat Pengeluaran Toko'}
                  </h3>
                  <p className="text-[11px] text-slate-400">Pembelian stok server pulsa, ATK, operasional.</p>
                </div>
              </div>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCashFlow} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Kategori Pengeluaran</label>
                <CustomSelect
                  value={formCategory}
                  onChange={val => setFormCategory(val)}
                  options={expenseCategories.map(c => ({ label: c, value: c }))}
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Deskripsi / Keperluan (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Isi saldo server Digipos Telkomsel 500rb (Opsional)"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-rose-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Nominal Pengeluaran (Rp)</label>
                <input
                  type="number"
                  required
                  min={0}
                  placeholder="Contoh: 500000"
                  value={formAmount}
                  onChange={e => setFormAmount(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-rose-500/60 rounded-xl text-rose-400 font-mono font-bold text-sm focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Sumber Dana</label>
                  <CustomSelect
                    value={formPaymentMethod}
                    onChange={val => setFormPaymentMethod(val)}
                    options={[
                      { label: 'Kas Toko (Laci Kasir)', value: 'Kas Toko' },
                      { label: 'Rekening Bank', value: 'Rekening Bank' },
                      { label: 'Pribadi / Owner', value: 'Pribadi / Owner' }
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Tanggal</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                {editingCashFlow ? (
                  <button
                    type="button"
                    onClick={() => setCashFlowToDelete(editingCashFlow)}
                    className="px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 font-semibold rounded-xl flex items-center gap-1.5 transition text-xs"
                    title="Hapus transaksi ini untuk mengoreksi kesalahan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Catatan Ini</span>
                  </button>
                ) : <div />}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsExpenseModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-md transition"
                  >
                    Simpan Pengeluaran
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: KONFIRMASI HAPUS TRANSAKSI PEMBUKUAN ================= */}
      {cashFlowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/40 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Hapus Catatan {cashFlowToDelete.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}?
                  </h3>
                  <p className="text-[11px] text-slate-400">Koreksi kesalahan pencatatan keuangan toko.</p>
                </div>
              </div>
              <button
                onClick={() => setCashFlowToDelete(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus catatan ini? Saldo dan perhitungan laba toko akan otomatis dikoreksi kembali.
            </p>

            {/* Detail Box */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between items-start">
                <span className="text-slate-400">Keterangan:</span>
                <span className="font-bold text-white text-right max-w-[65%] truncate">{cashFlowToDelete.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Kategori:</span>
                <span className="text-slate-300">{cashFlowToDelete.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tanggal:</span>
                <span className="font-mono text-slate-300">{cashFlowToDelete.dateString}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-850">
                <span className="text-slate-400 font-medium">Nominal:</span>
                <span className={`font-mono font-bold text-base ${
                  cashFlowToDelete.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  Rp {formatRupiah(cashFlowToDelete.amount)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setCashFlowToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium rounded-xl text-xs transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => executeDeleteCashFlow(cashFlowToDelete)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-rose-600/30 transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus Catatan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: KONFIRMASI HAPUS SEMUA DATA ================= */}
      {isConfirmClearAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/40 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Hapus Semua Data Pembukuan?
                  </h3>
                  <p className="text-[11px] text-slate-400">Pembersihan total data pembukuan & kas.</p>
                </div>
              </div>
              <button
                onClick={() => setIsConfirmClearAllOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus <strong className="text-white">SEMUA</strong> data pembukuan? 
              Catatan arus kas, riwayat transaksi POS, dan buku bon hutang pelanggan akan dihapus permanen.
            </p>

            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>Tindakan ini <strong>tidak dapat dibatalkan</strong>. Data yang telah dihapus tidak dapat dipulihkan.</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsConfirmClearAllOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium rounded-xl text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={executeClearAllData}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-rose-600/30 transition cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Menghapus Semua...' : 'Ya, Hapus Semua Data'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pembukuan;
