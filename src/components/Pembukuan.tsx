import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CustomSelect } from './CustomSelect';
import { CapitalModal } from './CapitalModal';
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
import { CashFlowRecord, CustomerDebt, DebtPayment, StoreSettings, Transaction, CapitalRecord } from '../types';
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
  subscribeCapital,
  subscribeToAuthState,
  saveCapitalRecordToFirestore,
  deleteAllCashFlowsFromFirestore,
  deleteAllTransactionsFromFirestore,
  deleteAllDebtsFromFirestore,
  deleteAllCapitalFromFirestore,
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
  const [capitalRecords, setCapitalRecords] = useState<CapitalRecord[]>([]);
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
  const [isCapitalModalOpen, setIsCapitalModalOpen] = useState<boolean>(false);
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState<boolean>(false);
  
  // Active editing & delete items
  const [editingCashFlow, setEditingCashFlow] = useState<CashFlowRecord | null>(null);
  const [editingDebt, setEditingDebt] = useState<CustomerDebt | null>(null);
  const [debtAddAmount, setDebtAddAmount] = useState<string>('');
  const [debtAddCost, setDebtAddCost] = useState<string>('');
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
  const [isConfirmResetCapitalOpen, setIsConfirmResetCapitalOpen] = useState<boolean>(false);
  const [isResettingCapital, setIsResettingCapital] = useState<boolean>(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const executeResetCapital = async () => {
    setIsResettingCapital(true);
    try {
      await db.capital.clear();
      if (auth.currentUser) {
        await deleteAllCapitalFromFirestore(storeId || undefined);
      }
      setCapitalRecords([]);
      await loadData();
      setIsConfirmResetCapitalOpen(false);
      showToast("Seluruh saldo modal berhasil direset ke Rp 0");
    } catch (err: any) {
      console.error('Failed to reset capital:', err);
      showToast("Gagal mereset modal: " + (err?.message || 'Error'));
    } finally {
      setIsResettingCapital(false);
    }
  };

  const executeClearAllData = async () => {
    setIsDeleting(true);
    try {
      await db.cashFlows.clear();
      await db.transactions.clear();
      await db.debts.clear();
      await db.capital.clear();
      if (auth.currentUser) {
        await Promise.allSettled([
          deleteAllCashFlowsFromFirestore(storeId || undefined),
          deleteAllTransactionsFromFirestore(storeId || undefined),
          deleteAllDebtsFromFirestore(storeId || undefined),
          deleteAllCapitalFromFirestore(storeId || undefined)
        ]);
      }
      setCashFlows([]);
      setDebts([]);
      setPosTransactions([]);
      setCapitalRecords([]);
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
      const [cfList, debtList, txList, capList] = await Promise.all([
        db.cashFlows.toArray(),
        db.debts.toArray(),
        db.transactions.toArray(),
        db.capital.toArray()
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
      setCapitalRecords(capList.sort((a, b) => b.timestamp - a.timestamp));
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
    let unsubCapital: (() => void) | null = null;

    const unsubAuth = subscribeToAuthState((user) => {
      // Unsubscribe previous listeners
      if (unsubCf) { unsubCf(); unsubCf = null; }
      if (unsubDebts) { unsubDebts(); unsubDebts = null; }
      if (unsubTx) { unsubTx(); unsubTx = null; }
      if (unsubCapital) { unsubCapital(); unsubCapital = null; }

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

        unsubCapital = subscribeCapital(
          async (remoteCapital) => {
            if (remoteCapital) {
              const sorted = (remoteCapital || []).sort((a, b) => b.timestamp - a.timestamp);
              setCapitalRecords(sorted);
              try {
                await db.capital.clear();
                if (sorted.length > 0) {
                  await db.capital.bulkAdd(sorted);
                }
              } catch (e) {
                console.warn('Mirror capital error:', e);
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
      if (unsubCapital) unsubCapital();
    };
  }, [storeId, loadData, parseTimestamp]);

  // Form states for Income / Expense
  const [formType, setFormType] = useState<'income' | 'expense'>('income');
  const [formCategory, setFormCategory] = useState<string>('Transfer Uang');
  const [formCustomerName, setFormCustomerName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formCost, setFormCost] = useState<string>('');
  const [formStatus, setFormStatus] = useState<'lunas' | 'belum_lunas'>('lunas');
  const [formPaymentMethod, setFormPaymentMethod] = useState<string>('Tunai');
  const [formDate, setFormDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Form states for Debt
  const [debtCustomerName, setDebtCustomerName] = useState<string>('');
  const [debtCustomerPhone, setDebtCustomerPhone] = useState<string>('');
  const [debtDescription, setDebtDescription] = useState<string>('');
  const [debtTotalAmount, setDebtTotalAmount] = useState<string>('');
  const [debtCost, setDebtCost] = useState<string>('');
  const [debtProfit, setDebtProfit] = useState<string>('');
  const [debtType, setDebtType] = useState<'standard' | 'kasbon' | 'jasa_antar'>('standard');
  const [debtIsLoanWithoutProfit, setDebtIsLoanWithoutProfit] = useState<boolean>(false);
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

    // 3. Store Expenses
    const expenseRecords = filteredCashFlows.filter(cf => cf.type === 'expense');
    const totalExpenses = expenseRecords.reduce((acc, cf) => acc + (cf.amount || 0), 0);

    // 4. Combined Metrics
    const totalGrossRevenue = posTotalRevenue + manualIncomeTotal;
    const netProfit = manualProfitTotal + posTotalRevenue - totalExpenses; // Estimasi laba bersih

    // 5. Debt metrics (All unpaid)
    const totalUnpaidDebts = debts
      .filter(d => d.status !== 'lunas')
      .reduce((acc, d) => acc + (d.remainingAmount || 0), 0);
    const countUnpaidDebts = debts.filter(d => d.status !== 'lunas').length;

    return {
      posTotalRevenue,
      manualIncomeTotal,
      manualProfitTotal,
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

  const totalCapital = useMemo(() => capitalRecords.reduce((sum, c) => c.type === 'add' ? sum + c.amount : sum - c.amount, 0), [capitalRecords]);

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
          dateString: cf.dateString || new Date(cf.timestamp).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          }),
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
          dateString: new Date(tx.timestamp).toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          }),
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
          dateString: cf.dateString || new Date(cf.timestamp).toLocaleDateString('id-ID'),
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
          dateString: new Date(tx.timestamp).toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          }),
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
      const effCost = debt.cost !== undefined ? debt.cost : (debt.modal !== undefined ? debt.modal : '');
      const effProfit = debt.profit !== undefined ? debt.profit : (debt.keuntunganBersih !== undefined ? debt.keuntunganBersih : '');
      setDebtCost(effCost !== '' ? effCost.toString() : '');
      setDebtProfit(effProfit !== '' ? effProfit.toString() : '');
      const detectedType = debt.debtType || (debt.usesCapital === false ? 'jasa_antar' : (effProfit === 0 || (effCost !== '' && Number(effCost) === debt.totalAmount) ? 'kasbon' : 'standard'));
      setDebtType(detectedType);
      setDebtIsLoanWithoutProfit(detectedType === 'kasbon');
      setDebtPaidInitial(debt.paidAmount.toString());
      setDebtDueDate(debt.dueDate || '');
      setDebtAddAmount('');
      setDebtAddCost('');
      setDebtAddDescription('');
    } else {
      setEditingDebt(null);
      setDebtCustomerName('');
      setDebtCustomerPhone('');
      setDebtDescription('');
      setDebtTotalAmount('');
      setDebtCost('');
      setDebtProfit('');
      setDebtType('standard');
      setDebtIsLoanWithoutProfit(false);
      setDebtPaidInitial('0');
      setDebtDueDate('');
      setDebtAddAmount('');
      setDebtAddCost('');
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

    // Handle debt creation for unpaid income
    if (formType === 'income' && formStatus === 'belum_lunas') {
      const customerName = formCustomerName.trim() || 'Pelanggan Umum';

      try {
        // Hapus semua catatan bon lama yang menggunakan nama yang sama
        const normalizedName = customerName.toLowerCase();
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
          await deleteDebtsByCustomerFromFirestore(customerName, storeId || undefined);
        }
        setDebts(prev => prev.filter(d => (d.customerName || '').trim().toLowerCase() !== normalizedName));

        // Cek apakah kategori adalah Jasa Antar / Ongkir (tanpa modal & tanpa laba)
        const isJasaAntar = formCategory === 'Jasa Antar / Ongkir';
        const usesCapital = !isJasaAntar;

        // Untuk bon tanpa laba atau pinjaman kasbon, modal yang terpotong adalah seluruh nominal jika modal belum diinput
        const effectiveCost = isJasaAntar ? 0 : (costNum > 0 ? costNum : (profitNum === 0 ? amountNum : 0));
        const effectiveProfit = isJasaAntar ? 0 : Math.max(0, amountNum - effectiveCost);

        // Buatkan catatan bon baru yang segar dan bersih
        const debtPayload: CustomerDebt = {
          customerName: customerName,
          description: formDescription.trim() || (isJasaAntar ? 'Jasa Antar Langganan (Bayar 1 Bulan Sekali)' : 'Bon Belanja'),
          totalAmount: amountNum,
          cost: effectiveCost,
          profit: effectiveProfit,
          modal: effectiveCost,
          keuntunganBersih: effectiveProfit,
          paidAmount: 0,
          remainingAmount: amountNum,
          status: 'belum_lunas',
          debtType: isJasaAntar ? 'jasa_antar' : (effectiveProfit === 0 ? 'kasbon' : 'standard'),
          usesCapital: usesCapital,
          createdAt: Date.now(),
          payments: [],
          storeId: storeId || undefined,
          updatedAt: Date.now()
        };

        const localId = await db.debts.add(debtPayload);
        if (auth.currentUser) {
          const firestoreId = await saveDebtToFirestore({ ...debtPayload, id: localId }, storeId || undefined);
          await db.debts.update(localId, { firestoreId });
        }
        showToast(`✓ Catatan bon baru untuk "${customerName}" tersimpan (bon lama dihapus)!`);

        // Pengurangan modal dari Total Modal HANYA jika usesCapital === true
        if (usesCapital && effectiveCost > 0) {
          const capitalCostPayload: CapitalRecord = {
            type: 'subtract',
            amount: effectiveCost,
            description: effectiveProfit === 0
              ? `Pinjaman Kasbon: ${customerName}`
              : `Biaya Modal: ${formDescription.trim() || formCategory}`,
            timestamp: Date.now(),
            storeId: storeId || undefined
          };
          const capCostLocalId = await db.capital.add(capitalCostPayload);
          if (auth.currentUser) {
            const firestoreId = await saveCapitalRecordToFirestore({ ...capitalCostPayload, id: capCostLocalId }, storeId || undefined);
            await db.capital.update(capCostLocalId, { firestoreId });
          }
        }

        sounds.playSuccess();
        setIsIncomeModalOpen(false);
        loadData();
      } catch (err: any) {
        console.error('Error saving debt:', err);
        alert('Gagal menyimpan catatan hutang: ' + err.message);
      }
      return;
    }

    const payload: CashFlowRecord = {
      type: formType,
      category: formCategory,
      description: formDescription.trim() || formCategory,
      amount: amountNum,
      cost: formType === 'income' ? costNum : undefined,
      profit: formType === 'income' ? profitNum : undefined,
      status: formStatus,
      paymentMethod: formPaymentMethod,
      timestamp: editingCashFlow?.timestamp || Date.now(),
      dateString: formDate || new Date().toISOString().split('T')[0],
      storeId: storeId || undefined,
      createdAt: editingCashFlow?.createdAt || new Date().toISOString()
    };

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
        
        // Add CapitalRecord automatically
        const capitalPayload: CapitalRecord = {
          type: formType === 'income' ? 'add' : 'subtract',
          amount: amountNum,
          description: `Arus Kas: ${formDescription.trim() || formCategory}`,
          timestamp: Date.now(),
          storeId: storeId || undefined
        };
        const capLocalId = await db.capital.add(capitalPayload);
        if (auth.currentUser) {
          const firestoreId = await saveCapitalRecordToFirestore({ ...capitalPayload, id: capLocalId }, storeId || undefined);
          await db.capital.update(capLocalId, { firestoreId });
        }

        // Subtract Capital Cost if income
        if (formType === 'income' && costNum > 0) {
          const capitalCostPayload: CapitalRecord = {
            type: 'subtract',
            amount: costNum,
            description: `Biaya Modal: ${formDescription.trim() || formCategory}`,
            timestamp: Date.now(),
            storeId: storeId || undefined
          };
          const capCostLocalId = await db.capital.add(capitalCostPayload);
          if (auth.currentUser) {
            const firestoreId = await saveCapitalRecordToFirestore({ ...capitalCostPayload, id: capCostLocalId }, storeId || undefined);
            await db.capital.update(capCostLocalId, { firestoreId });
          }
        }
        
        showToast(`✓ Berhasil mencatat ${formType === 'income' ? 'pemasukan' : 'pengeluaran'}!`);
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

  // Save or Update Customer Debt (Buku Bon)
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

    // Determine cost, profit, and capital usage
    const isJasaAntar = debtType === 'jasa_antar';
    const usesCapital = !isJasaAntar; // Jasa Antar TANPA menggunakan Total Modal

    let costNum = 0;
    let profitNum = 0;
    if (isJasaAntar) {
      costNum = 0;
      profitNum = 0;
    } else if (debtType === 'kasbon' || debtIsLoanWithoutProfit) {
      costNum = totalNum;
      profitNum = 0;
    } else {
      const parsedCost = parseFloat(debtCost);
      const parsedProfit = parseFloat(debtProfit);
      if (!isNaN(parsedCost) && !isNaN(parsedProfit)) {
        costNum = Math.max(0, parsedCost);
        profitNum = Math.max(0, parsedProfit);
      } else if (!isNaN(parsedCost)) {
        costNum = Math.max(0, parsedCost);
        profitNum = Math.max(0, totalNum - costNum);
      } else if (!isNaN(parsedProfit)) {
        profitNum = Math.max(0, parsedProfit);
        costNum = Math.max(0, totalNum - profitNum);
      } else {
        // Jika keduanya kosong, anggap modal pokok = totalNum (laba Rp0) demi keamanan data
        costNum = totalNum;
        profitNum = 0;
      }
    }

    // Editing Existing Debt
    if (editingDebt && editingDebt.id) {
      const updatedPayload: Partial<CustomerDebt> = {
        customerName: debtCustomerName.trim() || 'Pelanggan Umum',
        description: debtDescription.trim() || (isJasaAntar ? 'Jasa Antar Langganan (Bayar 1 Bulan Sekali)' : 'Bon Belanja'),
        totalAmount: totalNum,
        cost: costNum,
        profit: profitNum,
        modal: costNum,
        keuntunganBersih: profitNum,
        paidAmount: paidNum,
        remainingAmount: remainingNum,
        status: initialStatus,
        debtType: debtType,
        usesCapital: usesCapital,
        updatedAt: Date.now()
      };
      if (debtCustomerPhone.trim()) updatedPayload.customerPhone = debtCustomerPhone.trim();
      if (debtDueDate) updatedPayload.dueDate = debtDueDate;

      try {
        await db.debts.update(editingDebt.id, updatedPayload);
        if (auth.currentUser) {
          await updateDebtInFirestore(editingDebt.firestoreId || editingDebt.id, updatedPayload, editingDebt.createdAt);
        }

        // Jika ada penambahan modal tambahan di Form Edit Bon, potong dari Total Modal (hanya jika usesCapital)
        const addCostNum = parseFloat(debtAddCost) || 0;
        const addAmountNum = parseFloat(debtAddAmount) || 0;
        const effectiveAddCost = addCostNum > 0
          ? addCostNum
          : ((debtType === 'kasbon' || profitNum === 0) && addAmountNum > 0 && usesCapital ? addAmountNum : 0);

        if (usesCapital && effectiveAddCost > 0) {
          const capitalCostPayload: CapitalRecord = {
            type: 'subtract',
            amount: effectiveAddCost,
            description: `Modal Tambahan Bon: ${updatedPayload.customerName}`,
            timestamp: Date.now(),
            storeId: storeId || undefined
          };
          const capCostLocalId = await db.capital.add(capitalCostPayload);
          if (auth.currentUser) {
            const firestoreId = await saveCapitalRecordToFirestore({ ...capitalCostPayload, id: capCostLocalId }, storeId || undefined);
            await db.capital.update(capCostLocalId, { firestoreId });
          }
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
        note: 'Uang Muka / Pembayaran Awal'
      });
    }

    const payload: CustomerDebt = {
      customerName: debtCustomerName.trim() || 'Pelanggan Umum',
      description: debtDescription.trim() || (isJasaAntar ? 'Jasa Antar Langganan (Bayar 1 Bulan Sekali)' : 'Bon Belanja'),
      totalAmount: totalNum,
      cost: costNum,
      profit: profitNum,
      modal: costNum,
      keuntunganBersih: profitNum,
      paidAmount: paidNum,
      remainingAmount: remainingNum,
      status: initialStatus,
      debtType: debtType,
      usesCapital: usesCapital,
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

      // Pengurangan modal dari Total Modal HANYA jika usesCapital === true
      if (usesCapital && costNum > 0) {
        const capitalCostPayload: CapitalRecord = {
          type: 'subtract',
          amount: costNum,
          description: (debtType === 'kasbon' || profitNum === 0)
            ? `Pinjaman Kasbon: ${payload.customerName}`
            : `Modal Bon: ${payload.customerName} (${payload.description})`,
          timestamp: Date.now(),
          storeId: storeId || undefined
        };
        const capCostLocalId = await db.capital.add(capitalCostPayload);
        if (auth.currentUser) {
          const firestoreId = await saveCapitalRecordToFirestore({ ...capitalCostPayload, id: capCostLocalId }, storeId || undefined);
          await db.capital.update(capCostLocalId, { firestoreId });
        }
      }

      // Jika ada uang muka atau pembayaran awal saat bon dibuat (hanya masuk modal jika usesCapital)
      if (usesCapital && paidNum > 0) {
        const capitalPayPayload: CapitalRecord = {
          type: 'add',
          amount: paidNum,
          description: `Uang Muka Bon: ${payload.customerName}`,
          timestamp: Date.now(),
          storeId: storeId || undefined
        };
        const capPayLocalId = await db.capital.add(capitalPayPayload);
        if (auth.currentUser) {
          const firestoreId = await saveCapitalRecordToFirestore({ ...capitalPayPayload, id: capPayLocalId }, storeId || undefined);
          await db.capital.update(capPayLocalId, { firestoreId });
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
    let roundingAdjustment = 0;
    let paymentToRecord = payNum;

    if (payNum > currentRemaining) {
      roundingAdjustment = payNum - currentRemaining;
      paymentToRecord = currentRemaining;
    }

    const newPaid = activeDebtForInstallment.paidAmount + paymentToRecord;
    const newRemaining = Math.max(0, activeDebtForInstallment.totalAmount - newPaid);
    const newStatus: 'belum_lunas' | 'cicilan' | 'lunas' = newRemaining <= 0 ? 'lunas' : 'cicilan';

    // Calculate profit and cost breakdown for this installment
    const totalDebtAmount = activeDebtForInstallment.totalAmount || paymentToRecord;
    const debtCost = activeDebtForInstallment.cost !== undefined 
      ? activeDebtForInstallment.cost 
      : (activeDebtForInstallment.modal !== undefined ? activeDebtForInstallment.modal : 0);
    const debtProfit = activeDebtForInstallment.profit !== undefined 
      ? activeDebtForInstallment.profit 
      : (activeDebtForInstallment.keuntunganBersih !== undefined ? activeDebtForInstallment.keuntunganBersih : 0);

    // Hitung seluruh laba yang sudah diakui dari cicilan-cicilan sebelumnya
    const previouslyRecognizedProfit = (activeDebtForInstallment.payments || []).reduce((sum, p) => {
      if (typeof p.profitPortion === 'number') return sum + p.profitPortion;
      const ratio = totalDebtAmount > 0 ? debtProfit / totalDebtAmount : 0;
      return sum + Math.round(p.amount * ratio);
    }, 0);

    const remainingUnrecognizedProfit = Math.max(0, debtProfit - previouslyRecognizedProfit);

    let profitPortion = 0;
    let costPortion = paymentToRecord;

    if (debtProfit > 0) {
      if (newRemaining <= 0) {
        // Pelunasan akhir: sisa seluruh keuntungan yang belum diakui (tidak boleh melebihi sisa laba bon)
        profitPortion = Math.min(paymentToRecord, remainingUnrecognizedProfit);
        costPortion = Math.max(0, paymentToRecord - profitPortion);
      } else {
        // Cicilan bertahap: proporsional
        const propProfit = Math.round((paymentToRecord / totalDebtAmount) * debtProfit);
        profitPortion = Math.min(propProfit, remainingUnrecognizedProfit);
        costPortion = Math.max(0, paymentToRecord - profitPortion);
      }
    }

    const newPaymentEntry: DebtPayment = {
      id: 'dp-' + Date.now(),
      amount: paymentToRecord,
      costPortion: costPortion,
      profitPortion: profitPortion,
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

      // Record as cash income in CashFlow (profit strictly reflects actual profitPortion!)
      const cfPayload: CashFlowRecord = {
        type: 'income',
        category: 'Pelunasan Bon Pelanggan',
        description: `Bayar bon: ${activeDebtForInstallment.customerName} (${installmentNote})`,
        amount: paymentToRecord,
        cost: costPortion,
        profit: profitPortion,
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

      // Add CapitalRecord automatically HANYA jika bon menggunakan modal toko
      if (activeDebtForInstallment.usesCapital !== false) {
        const capitalPayload: CapitalRecord = {
          type: 'add',
          amount: paymentToRecord,
          description: `Pelunasan Bon: ${activeDebtForInstallment.customerName}`,
          timestamp: Date.now(),
          storeId: storeId || undefined
        };
        const capLocalId = await db.capital.add(capitalPayload);
        if (auth.currentUser) {
          const firestoreId = await saveCapitalRecordToFirestore({ ...capitalPayload, id: capLocalId }, storeId || undefined);
          await db.capital.update(capLocalId, { firestoreId });
        }
      }

      // Handle rounding adjustment as capital
      if (roundingAdjustment > 0) {
        const roundCapitalPayload: CapitalRecord = {
          type: 'add',
          amount: roundingAdjustment,
          description: `Penyesuaian Pembulatan Bon: ${activeDebtForInstallment.customerName}`,
          timestamp: Date.now(),
          storeId: storeId || undefined
        };
        const roundCapLocalId = await db.capital.add(roundCapitalPayload);
        if (auth.currentUser) {
          const firestoreId = await saveCapitalRecordToFirestore({ ...roundCapitalPayload, id: roundCapLocalId }, storeId || undefined);
          await db.capital.update(roundCapLocalId, { firestoreId });
        }
      }

      sounds.playSuccess();
      showToast(`✓ Pembayaran cicilan Rp ${formatRupiah(paymentToRecord)} berhasil dicatat! (Laba: Rp ${formatRupiah(profitPortion)}, Modal Kembali: Rp ${formatRupiah(costPortion)})${roundingAdjustment > 0 ? ` [Pembulatan: Rp ${formatRupiah(roundingAdjustment)}]` : ''}`);
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
      const totalDebtAmount = debt.totalAmount || fullAmount;
      const debtCost = debt.cost !== undefined ? debt.cost : (debt.modal !== undefined ? debt.modal : 0);
      const debtProfit = debt.profit !== undefined ? debt.profit : (debt.keuntunganBersih !== undefined ? debt.keuntunganBersih : 0);

      // Hitung seluruh laba yang sudah diakui dari cicilan-cicilan sebelumnya
      const previouslyRecognizedProfit = (debt.payments || []).reduce((sum, p) => {
        if (typeof p.profitPortion === 'number') return sum + p.profitPortion;
        const ratio = totalDebtAmount > 0 ? debtProfit / totalDebtAmount : 0;
        return sum + Math.round(p.amount * ratio);
      }, 0);

      const remainingUnrecognizedProfit = Math.max(0, debtProfit - previouslyRecognizedProfit);

      let profitPortion = 0;
      let costPortion = fullAmount;

      if (debtProfit > 0) {
        profitPortion = Math.min(fullAmount, remainingUnrecognizedProfit);
        costPortion = Math.max(0, fullAmount - profitPortion);
      }

      const newPayment: DebtPayment = {
        id: 'dp-' + Date.now(),
        amount: fullAmount,
        costPortion: costPortion,
        profitPortion: profitPortion,
        timestamp: Date.now(),
        note: 'Pelunasan Total'
      };

      await db.debts.update(debt.id, {
        paidAmount: debt.totalAmount,
        remainingAmount: 0,
        status: 'lunas',
        payments: [...(debt.payments || []), newPayment],
        updatedAt: Date.now()
      });

      if (auth.currentUser) {
        await updateDebtInFirestore(
          debt.firestoreId || debt.id,
          {
            paidAmount: debt.totalAmount,
            remainingAmount: 0,
            status: 'lunas',
            payments: [...(debt.payments || []), newPayment],
            updatedAt: Date.now()
          },
          debt.createdAt
        );
      }

      // Record as cash flow (profit is ONLY profitPortion, NOT fullAmount!)
      const cfPayload: CashFlowRecord = {
        type: 'income',
        category: 'Pelunasan Bon Pelanggan',
        description: `Pelunasan total bon: ${debt.customerName}`,
        amount: fullAmount,
        cost: costPortion,
        profit: profitPortion,
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

      // Add CapitalRecord automatically HANYA jika bon menggunakan modal toko
      if (debt.usesCapital !== false) {
        const capitalPayload: CapitalRecord = {
          type: 'add',
          amount: fullAmount,
          description: `Pelunasan Bon: ${debt.customerName}`,
          timestamp: Date.now(),
          storeId: storeId || undefined
        };
        const capLocalId = await db.capital.add(capitalPayload);
        if (auth.currentUser) {
          const firestoreId = await saveCapitalRecordToFirestore({ ...capitalPayload, id: capLocalId }, storeId || undefined);
          await db.capital.update(capLocalId, { firestoreId });
        }
      }

      sounds.playSuccess();
      showToast(`✓ Bon ${debt.customerName} telah LUNAS! (Laba: Rp ${formatRupiah(profitPortion)}, Modal: Rp ${formatRupiah(costPortion)})`);
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

        {/* Total Modal & Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl flex items-center justify-between sm:justify-center gap-3 w-full sm:w-auto">
            <div 
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition"
              onClick={() => setIsCapitalModalOpen(true)}
              title="Klik untuk Kelola Modal"
            >
              <div className="flex items-center gap-1.5 text-slate-400">
                <Coins className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold uppercase tracking-wider">Total Modal</span>
              </div>
              <div className="text-base font-black text-white whitespace-nowrap">
                Rp {formatRupiah(totalCapital)}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsConfirmResetCapitalOpen(true);
              }}
              title="Reset Modal ke Rp 0"
              className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => handleOpenIncomeModal()}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition"
            >
              <TrendingUp className="w-4 h-4" />
              + Pemasukan
            </button>

            <button
              onClick={() => handleOpenExpenseModal()}
              className="px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
            >
              <TrendingDown className="w-4 h-4" />
              + Pengeluaran
            </button>

            <button
              onClick={() => handleOpenDebtModal()}
              className="px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
            >
              <BookOpen className="w-4 h-4" />
              + Bon Pelanggan
            </button>
          </div>
        </div>
      </div>
      
      {/* (Middle: Total Modal removed) */}

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
            Ringkasan Keuangan
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
            Pemasukan ({metrics.countIncome})
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
            Pengeluaran ({metrics.countExpense})
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
            Buku Bon ({metrics.countUnpaidDebts} Belum Lunas)
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
                <span>Stok, Pulsa, & Operasional</span>
                <span className="font-mono">{metrics.countExpense} transaksi</span>
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

             {/* 5. Total Modal (Removed from here, moved to header) */}

            {/* 4. Buku Bon / Piutang Belum Lunas */}
            <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Piutang / Bon</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-400">
                Rp {formatRupiah(metrics.totalUnpaidDebts)}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>Uang tertahan di pelanggan</span>
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

      {/* ---------------- 4. SUB-TAB: BUKU BON (HUTANG PELANGGAN) ---------------- */}
      {activeSubTab === 'debts' && (
        <div className="space-y-4">
          
          {/* Header Filter & Add */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama pelanggan / bon..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setDebtStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    debtStatusFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setDebtStatusFilter('unpaid')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    debtStatusFilter === 'unpaid' ? 'bg-slate-800 text-rose-400 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Belum Lunas
                </button>
                <button
                  onClick={() => setDebtStatusFilter('partial')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    debtStatusFilter === 'partial' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Dicicil
                </button>
                <button
                  onClick={() => setDebtStatusFilter('paid')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    debtStatusFilter === 'paid' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Lunas
                </button>
              </div>

              <button
                onClick={() => handleOpenDebtModal()}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition whitespace-nowrap shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Catat Bon Baru
              </button>
            </div>
          </div>

          {/* Cards Grid for Debts */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDebts.map(debt => {
              const isPaid = debt.status === 'lunas';
              const isPartial = debt.status === 'cicilan';
              const percentPaid = Math.min(100, Math.round((debt.paidAmount / debt.totalAmount) * 100));

              return (
                <div
                  key={debt.id}
                  className={`bg-slate-900 border rounded-2xl p-4.5 space-y-3.5 shadow-sm transition hover:border-slate-700 ${
                    isPaid ? 'border-emerald-500/30' : isPartial ? 'border-amber-500/40' : 'border-rose-500/30'
                  }`}
                >
                  {/* Customer Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        isPaid ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-amber-400'
                      }`}>
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="font-extrabold text-sm text-white truncate">{debt.customerName}</div>
                          {debt.debtType === 'jasa_antar' || debt.usesCapital === false ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800/60 flex items-center gap-1">
                              <Truck className="w-2.5 h-2.5" />
                              <span>Jasa Antar</span>
                            </span>
                          ) : debt.debtType === 'kasbon' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-800/60 flex items-center gap-1">
                              <Coins className="w-2.5 h-2.5" />
                              <span>Kasbon</span>
                            </span>
                          ) : null}
                        </div>
                        {debt.customerPhone ? (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-emerald-400" />
                            <span>{debt.customerPhone}</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-500">Tanpa nomor kontak</div>
                        )}
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      isPaid 
                        ? 'bg-emerald-500/20 text-emerald-300' 
                        : isPartial 
                        ? 'bg-amber-500/20 text-amber-300' 
                        : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {isPaid ? 'LUNAS' : isPartial ? 'DICICIL' : 'BELUM LUNAS'}
                    </span>
                  </div>

                  {/* Description */}
                  <div className="p-2.5 bg-slate-950 rounded-xl text-xs text-slate-300 space-y-1">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Keperluan Bon:</div>
                    <p className="line-clamp-2 leading-relaxed">{debt.description}</p>
                  </div>

                  {/* Amount & Progress */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Total Hutang:</span>
                      <span className="font-mono font-bold text-white">Rp {formatRupiah(debt.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-400">
                      <span>Modal Pokok:</span>
                      <span className="font-mono text-slate-300">
                        {debt.usesCapital === false || debt.debtType === 'jasa_antar' 
                          ? 'Rp 0 (Tanpa Modal Usaha)' 
                          : `Rp ${formatRupiah(debt.cost ?? debt.modal ?? 0)}`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">Target Laba:</span>
                      <span className={`font-mono font-semibold ${((debt.profit ?? debt.keuntunganBersih ?? 0) > 0) ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {(debt.profit ?? debt.keuntunganBersih ?? 0) > 0 
                          ? `+Rp ${formatRupiah(debt.profit ?? debt.keuntunganBersih ?? 0)}` 
                          : (debt.debtType === 'jasa_antar' || debt.usesCapital === false ? 'Rp 0 (Jasa Antar)' : 'Rp 0 (Pinjaman)')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Sudah Terbayar:</span>
                      <span className="font-mono text-emerald-400 font-semibold">Rp {formatRupiah(debt.paidAmount)}</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          isPaid ? 'bg-emerald-500' : isPartial ? 'bg-amber-500' : 'bg-rose-500'
                        }`} 
                        style={{ width: `${percentPaid}%` }} 
                      />
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
                      <span className="font-bold text-white">Sisa Tagihan:</span>
                      <span className={`font-mono font-black text-sm ${isPaid ? 'text-slate-500' : 'text-amber-400'}`}>
                        Rp {formatRupiah(debt.remainingAmount)}
                      </span>
                    </div>
                  </div>

                  {/* Actions Area */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1">
                      {/* Edit Bon / Tambah Hutang */}
                      <button
                        onClick={() => handleOpenDebtModal(debt)}
                        className="px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl transition flex items-center gap-1 text-xs font-bold"
                        title="Edit Catatan Bon / Tambah Hutang Pelanggan"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Bon</span>
                      </button>

                      {/* Print Receipt */}
                      <button
                        onClick={() => handlePrintDebtReceipt(debt)}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                        title="Cetak Nota Bon ke Printer 58mm"
                      >
                        <Printer className="w-3.5 h-3.5 text-emerald-400" />
                      </button>

                      {/* WhatsApp Reminder */}
                      {debt.customerPhone && !isPaid && (
                        <button
                          onClick={() => handleSendWhatsAppReminder(debt)}
                          className="p-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-500/30 rounded-xl transition"
                          title="Kirim Pengingat Tagihan via WhatsApp"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={() => setDebtToDelete(debt)}
                        className="p-2 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded-xl transition"
                        title="Hapus Catatan Bon"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                      {/* Pay buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenInstallmentModal(debt)}
                          className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition"
                        >
                          Cicil
                        </button>
                        <button
                          onClick={() => handleQuickPayoffDebt(debt)}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition shadow-sm"
                        >
                          Lunasi
                        </button>
                      </div>
                  </div>
                </div>
              );
            })}

            {filteredDebts.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
                <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-semibold">Tidak ada data catatan bon.</p>
                <p className="text-xs text-slate-600 mt-0.5">Klik "+ Catat Bon Baru" untuk mencatat hutang pelanggan.</p>
              </div>
            )}
          </div>
        </div>
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
                  {formCustomerName.trim() && debts.some(d => (d.customerName || '').trim().toLowerCase() === formCustomerName.trim().toLowerCase()) && (
                    <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1 font-medium">
                      <span>ℹ️ Bon lama pelanggan "{formCustomerName.trim()}" akan otomatis dihapus dan digantikan bon baru ini.</span>
                    </p>
                  )}
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
                  <p className="text-[10px] text-slate-500 mt-0.5">Saldo terpotong</p>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Pemasukan Diterima (Rp)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    placeholder="Contoh: 105000"
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-emerald-500/60 rounded-xl text-emerald-400 font-mono font-bold focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Uang dari pelanggan</p>
                </div>
              </div>

              {/* Live Profit Preview */}
              <div className="p-2.5 bg-slate-950 rounded-xl flex items-center justify-between text-xs border border-slate-800">
                <span className="text-slate-400">Estimasi Keuntungan Bersih:</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">
                  Rp {formatRupiah(Math.max(0, (parseFloat(formAmount) || 0) - (parseFloat(formCost) || 0)))}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
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

      {/* ================= MODAL: CATAT / EDIT BON PELANGGAN ================= */}
      {isDebtModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  {editingDebt ? <Edit3 className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingDebt ? `Edit Bon: ${editingDebt.customerName}` : 'Catat Bon Pelanggan Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {editingDebt
                      ? 'Perbarui data bon atau tambah nominal hutang belanja baru untuk pelanggan ini.'
                      : 'Catat hutang barang / pulsa / jasa pelanggan warung atau toko.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsDebtModalOpen(false);
                  setEditingDebt(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Editing Helper Banner & Quick Add Debt Feature */}
            {editingDebt && (
              <div className="p-3.5 bg-amber-950/30 border border-amber-500/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Total Bon Sebelumnya:</span>
                  <span className="font-mono font-bold text-white">Rp {formatRupiah(editingDebt.totalAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Sudah Dicicil:</span>
                  <span className="font-mono font-semibold text-emerald-400">Rp {formatRupiah(editingDebt.paidAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-amber-500/20">
                  <span className="text-amber-300 font-bold">Sisa Hutang Berjalan:</span>
                  <span className="font-mono font-black text-amber-400">Rp {formatRupiah(editingDebt.remainingAmount)}</span>
                </div>

                {/* Instant Add-to-Debt shortcut */}
                <div className="p-2.5 bg-slate-950/70 border border-amber-500/40 rounded-lg space-y-2 mt-2">
                  <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Orang Sama Menambah Hutang Belanja:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Tambah Tagihan (Rp):</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="+ Tagihan (misal: 23000)"
                        value={debtAddAmount}
                        onChange={e => {
                          const addVal = e.target.value;
                          setDebtAddAmount(addVal);
                          const addNum = parseFloat(addVal) || 0;
                          const newTotal = editingDebt.totalAmount + addNum;
                          setDebtTotalAmount(newTotal.toString());

                          const addCostNum = parseFloat(debtAddCost) || 0;
                          const baseCost = editingDebt.cost !== undefined ? editingDebt.cost : (editingDebt.modal !== undefined ? editingDebt.modal : 0);
                          const newCost = baseCost + addCostNum;
                          setDebtCost(newCost > 0 ? newCost.toString() : '');
                          setDebtProfit(Math.max(0, newTotal - newCost).toString());
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-amber-500/60 rounded-lg text-amber-300 font-mono text-xs focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Modal Tambahan (Rp):</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="+ Modal (misal: 20000)"
                        value={debtAddCost}
                        onChange={e => {
                          const addCostVal = e.target.value;
                          setDebtAddCost(addCostVal);
                          const addCostNum = parseFloat(addCostVal) || 0;
                          const addTotNum = parseFloat(debtAddAmount) || 0;
                          const baseCost = editingDebt.cost !== undefined ? editingDebt.cost : (editingDebt.modal !== undefined ? editingDebt.modal : 0);
                          const newCost = baseCost + addCostNum;
                          const newTotal = editingDebt.totalAmount + addTotNum;
                          setDebtCost(newCost > 0 ? newCost.toString() : '');
                          setDebtProfit(Math.max(0, newTotal - newCost).toString());
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-emerald-400 font-mono text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Catatan Barang (Opsional):</label>
                      <input
                        type="text"
                        placeholder="misal: + Beras 5kg"
                        value={debtAddDescription}
                        onChange={e => {
                          const addDesc = e.target.value;
                          setDebtAddDescription(addDesc);
                          if (addDesc.trim()) {
                            setDebtDescription(editingDebt.description ? `${editingDebt.description} + ${addDesc}` : addDesc);
                          } else {
                            setDebtDescription(editingDebt.description);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-slate-500"
                      />
                    </div>
                  </div>
                  {parseFloat(debtAddAmount) > 0 && (
                    <div className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 px-2 py-1 rounded border border-emerald-500/20">
                      ✓ Total hutang baru otomatis menjadi: Rp {formatRupiah((editingDebt.totalAmount + (parseFloat(debtAddAmount) || 0)))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveDebt} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Nama Pelanggan *</label>
                  <input
                    type="text"
                    required
                    list="debt-customer-suggestions"
                    placeholder="Contoh: Pak RT / Budi"
                    value={debtCustomerName}
                    onChange={e => setDebtCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-semibold focus:outline-none focus:border-amber-500"
                  />
                  <datalist id="debt-customer-suggestions">
                    {Array.from(new Set(debts.map(d => d.customerName).filter(Boolean))).map(name => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  {!editingDebt && debtCustomerName.trim() && debts.some(d => (d.customerName || '').trim().toLowerCase() === debtCustomerName.trim().toLowerCase()) && (
                    <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1 font-medium bg-amber-950/40 p-2 rounded-lg border border-amber-500/30">
                      <span>⚠️ Bon lama pelanggan "{debtCustomerName.trim()}" akan otomatis dihapus dan digantikan bon baru ini.</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">No. WhatsApp / HP (Opsional)</label>
                  <input
                    type="text"
                    placeholder="08123456789"
                    value={debtCustomerPhone}
                    onChange={e => setDebtCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Rincian Barang / Keperluan Bon</label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Paket Data Telkomsel 50rb & Rokok Surya 1 bks"
                  value={debtDescription}
                  onChange={e => setDebtDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">
                    Total Hutang (Rp) * {editingDebt && <span className="text-amber-400 font-normal">(Dapat Diubah)</span>}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="Contoh: 75000"
                    value={debtTotalAmount}
                    onChange={e => setDebtTotalAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-amber-500/60 rounded-xl text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-400 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">
                    {editingDebt ? 'Sudah Dibayar / Cicilan (Rp)' : 'Bayar Awal / DP (Rp)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={debtPaidInitial}
                    onChange={e => setDebtPaidInitial(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-emerald-400 font-mono font-bold focus:outline-none"
                  />
                </div>
              </div>

              {/* Pilihan Tipe Bon & Rincian Modal */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Tipe Bon / Keperluan:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDebtType('standard');
                        setDebtIsLoanWithoutProfit(false);
                        const tot = parseFloat(debtTotalAmount) || 0;
                        if (debtCost === '0') setDebtCost('');
                        if (debtProfit === '0') setDebtProfit(tot > 0 ? tot.toString() : '');
                      }}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        debtType === 'standard'
                          ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-400 mb-1">
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Bon Belanja</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">Dengan modal barang & margin laba</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDebtType('kasbon');
                        setDebtIsLoanWithoutProfit(true);
                        setDebtCost(debtTotalAmount);
                        setDebtProfit('0');
                      }}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        debtType === 'kasbon'
                          ? 'bg-amber-950/50 border-amber-500 text-white shadow-sm shadow-amber-500/20'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-amber-400 mb-1">
                        <Coins className="w-3.5 h-3.5" />
                        <span>Pinjaman Kasbon</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">Laba Rp 0, <strong>potong</strong> Total Modal</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDebtType('jasa_antar');
                        setDebtIsLoanWithoutProfit(false);
                        setDebtCost('0');
                        setDebtProfit('0');
                        if (!debtDescription.trim()) {
                          setDebtDescription('Jasa Antar Langganan (Bayar 1 Bulan Sekali)');
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        debtType === 'jasa_antar'
                          ? 'bg-cyan-950/50 border-cyan-500 text-white shadow-sm shadow-cyan-500/20'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-cyan-400 mb-1">
                        <Truck className="w-3.5 h-3.5" />
                        <span>Jasa Antar</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">Laba Rp 0, <strong>tanpa</strong> Total Modal</p>
                    </button>
                  </div>
                </div>

                {debtType === 'standard' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">
                        Biaya Modal Toko (Rp)
                      </label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Contoh: 20000"
                        value={debtCost}
                        onChange={e => {
                          const val = e.target.value;
                          setDebtCost(val);
                          const tot = parseFloat(debtTotalAmount) || 0;
                          const c = parseFloat(val) || 0;
                          if (val !== '' && tot > 0) {
                            setDebtProfit(Math.max(0, tot - c).toString());
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-750 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">
                        Keuntungan / Margin Bersih (Rp)
                      </label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Contoh: 3000"
                        value={debtProfit}
                        onChange={e => {
                          const val = e.target.value;
                          setDebtProfit(val);
                          const tot = parseFloat(debtTotalAmount) || 0;
                          const p = parseFloat(val) || 0;
                          if (val !== '' && tot > 0) {
                            setDebtCost(Math.max(0, tot - p).toString());
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-750 rounded-lg text-emerald-400 font-mono font-bold text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {debtType === 'kasbon' && (
                  <div className="p-2.5 bg-amber-950/40 border border-amber-800/50 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center justify-between text-amber-300 font-bold text-[11px]">
                      <span>💸 Kasbon / Pinjaman Kas:</span>
                      <span className="font-mono text-emerald-400 font-semibold">Laba Bersih = Rp 0</span>
                    </div>
                    <p className="text-[10px] text-slate-300">
                      Uang kas diambil langsung dari <strong>Total Modal</strong> toko. Saat dilunasi, uang kembali ke Total Modal tanpa menambah laba.
                    </p>
                  </div>
                )}

                {debtType === 'jasa_antar' && (
                  <div className="p-2.5 bg-cyan-950/40 border border-cyan-800/50 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center justify-between text-cyan-300 font-bold text-[11px]">
                      <span>🚚 Jasa Antar / Ongkir (Bayar 1 Bulan Sekali):</span>
                      <span className="font-mono text-cyan-300 font-semibold">Laba Bersih = Rp 0</span>
                    </div>
                    <p className="text-[10px] text-slate-300">
                      Tagihan jasa antar langganan bulanan. <strong>Tidak menggunakan maupun memotong Total Modal toko</strong> saat dicatat maupun saat dilunasi.
                    </p>
                  </div>
                )}
              </div>

              {/* Calculated remaining indicator */}
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Sisa Tagihan Setelah Disimpan:</span>
                <span className="font-mono font-black text-amber-400 text-sm">
                  Rp {formatRupiah(Math.max(0, (parseFloat(debtTotalAmount) || 0) - (parseFloat(debtPaidInitial) || 0)))}
                </span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Jatuh Tempo / Janji Bayar (Opsional)</label>
                <input
                  type="date"
                  value={debtDueDate}
                  onChange={e => setDebtDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-slate-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDebtModalOpen(false);
                    setEditingDebt(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-md transition"
                >
                  {editingDebt ? 'Simpan Perubahan Bon' : 'Simpan Catatan Bon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: BAYAR CICILAN BON ================= */}
      {isInstallmentModalOpen && activeDebtForInstallment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Bayar Cicilan Bon</h3>
                  <p className="text-[11px] text-slate-400">{activeDebtForInstallment.customerName}</p>
                </div>
              </div>
              <button
                onClick={() => setIsInstallmentModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl text-xs space-y-1.5 border border-slate-800">
              <div className="flex justify-between text-slate-400">
                <span>Total Bon:</span>
                <span className="font-mono text-white">Rp {formatRupiah(activeDebtForInstallment.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Sudah Dicicil:</span>
                <span className="font-mono text-emerald-400">Rp {formatRupiah(activeDebtForInstallment.paidAmount)}</span>
              </div>
              <div className="flex justify-between font-bold pt-1 border-t border-slate-800">
                <span className="text-white">Sisa Yang Harus Dibayar:</span>
                <span className="font-mono text-amber-400">Rp {formatRupiah(activeDebtForInstallment.remainingAmount)}</span>
              </div>
              <div className="flex justify-between text-[11px] pt-1 border-t border-slate-800/80 text-slate-400">
                <span>Modal Barang/Jasa:</span>
                <span className="font-mono text-slate-300">Rp {formatRupiah(activeDebtForInstallment.cost ?? activeDebtForInstallment.modal ?? 0)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Total Keuntungan Bersih:</span>
                <span className={`font-mono font-semibold ${((activeDebtForInstallment.profit ?? activeDebtForInstallment.keuntunganBersih ?? 0) > 0) ? 'text-emerald-400' : 'text-slate-400'}`}>
                  Rp {formatRupiah(activeDebtForInstallment.profit ?? activeDebtForInstallment.keuntunganBersih ?? 0)}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveInstallment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Nominal Cicilan Yang Diterima (Rp) *</label>
                <input
                  type="number"
                  required
                  autoFocus
                  min={1}
                  placeholder="Contoh: 20000"
                  value={installmentAmount}
                  onChange={e => setInstallmentAmount(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-emerald-500/60 rounded-xl text-emerald-400 font-mono font-bold text-sm focus:outline-none"
                />
              </div>

              {parseFloat(installmentAmount) > 0 && (() => {
                const payVal = parseFloat(installmentAmount) || 0;
                const cappedPay = Math.min(payVal, activeDebtForInstallment.remainingAmount);
                const totDebt = activeDebtForInstallment.totalAmount || cappedPay;
                const dProfit = activeDebtForInstallment.profit ?? activeDebtForInstallment.keuntunganBersih ?? 0;

                const previouslyRecognizedProfit = (activeDebtForInstallment.payments || []).reduce((sum, p) => {
                  if (typeof p.profitPortion === 'number') return sum + p.profitPortion;
                  const ratio = totDebt > 0 ? dProfit / totDebt : 0;
                  return sum + Math.round(p.amount * ratio);
                }, 0);
                const remainingUnrecognizedProfit = Math.max(0, dProfit - previouslyRecognizedProfit);

                let estProfit = 0;
                if (dProfit > 0) {
                  if (cappedPay >= activeDebtForInstallment.remainingAmount) {
                    estProfit = Math.min(cappedPay, remainingUnrecognizedProfit);
                  } else {
                    const propProfit = Math.round((cappedPay / totDebt) * dProfit);
                    estProfit = Math.min(propProfit, remainingUnrecognizedProfit);
                  }
                }
                const estCost = Math.max(0, cappedPay - estProfit);
                const estRounding = Math.max(0, payVal - activeDebtForInstallment.remainingAmount);

                return (
                  <div className="p-2.5 bg-slate-950/90 rounded-xl border border-emerald-500/30 space-y-1 text-[11px]">
                    <div className="text-slate-400 font-medium">Alokasi Pembayaran Ini:</div>
                    <div className="flex justify-between text-slate-300">
                      <span>• Pengembalian Modal/Kas:</span>
                      <span className="font-mono font-bold text-white">Rp {formatRupiah(estCost)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400 font-semibold">
                      <span>• Masuk ke Laba/Keuntungan:</span>
                      <span className="font-mono font-bold">{estProfit > 0 ? `+Rp ${formatRupiah(estProfit)}` : 'Rp 0'}</span>
                    </div>
                    {estRounding > 0 && (
                      <div className="flex justify-between text-amber-300 text-[10px] pt-0.5 border-t border-slate-800">
                        <span>• Penyesuaian Pembulatan (Modal):</span>
                        <span className="font-mono">+Rp {formatRupiah(estRounding)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Catatan / Keterangan</label>
                <input
                  type="text"
                  placeholder="Contoh: Titip lewat tetangga / Cicilan ke-2"
                  value={installmentNote}
                  onChange={e => setInstallmentNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsInstallmentModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-md transition"
                >
                  Simpan Cicilan
                </button>
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

      {/* ================= MODAL: KONFIRMASI HAPUS BUKU BON ================= */}
      {debtToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/40 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Hapus Catatan Bon Pelanggan?</h3>
                  <p className="text-[11px] text-slate-400">Hapus data hutang secara permanen.</p>
                </div>
              </div>
              <button
                onClick={() => setDebtToDelete(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus data bon untuk <strong className="text-white">{debtToDelete.customerName}</strong>?
            </p>

            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Bon:</span>
                <span className="font-mono font-bold text-white">Rp {formatRupiah(debtToDelete.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Sisa Tagihan:</span>
                <span className="font-mono font-bold text-amber-400">Rp {formatRupiah(debtToDelete.remainingAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Keperluan:</span>
                <span className="text-slate-300 truncate max-w-[65%]">{debtToDelete.description}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDebtToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium rounded-xl text-xs transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => executeDeleteDebt(debtToDelete)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-rose-600/30 transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus Bon'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {debtToPayoff && (() => {
        const fullAmount = debtToPayoff.remainingAmount;
        const totDebt = debtToPayoff.totalAmount || fullAmount;
        const dProfit = debtToPayoff.profit ?? debtToPayoff.keuntunganBersih ?? 0;

        const previouslyRecognizedProfit = (debtToPayoff.payments || []).reduce((sum, p) => {
          if (typeof p.profitPortion === 'number') return sum + p.profitPortion;
          const ratio = totDebt > 0 ? dProfit / totDebt : 0;
          return sum + Math.round(p.amount * ratio);
        }, 0);
        const remainingUnrecognizedProfit = Math.max(0, dProfit - previouslyRecognizedProfit);
        const estProfit = dProfit > 0 ? Math.min(fullAmount, remainingUnrecognizedProfit) : 0;
        const estCost = Math.max(0, fullAmount - estProfit);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-emerald-500/40 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white">Konfirmasi Pelunasan</h3>
              <p className="text-slate-400 text-xs">
                Yakin ingin melunasi seluruh sisa hutang <strong className="text-white">Rp {formatRupiah(debtToPayoff.remainingAmount)}</strong> untuk <strong className="text-white">{debtToPayoff.customerName}</strong>?
              </p>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Pengembalian Modal:</span>
                  <span className="font-mono font-bold text-white">
                    {debtToPayoff.usesCapital === false || debtToPayoff.debtType === 'jasa_antar' 
                      ? 'Rp 0 (Tanpa Modal Usaha)' 
                      : `Rp ${formatRupiah(estCost)}`}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span>Masuk ke Laba Bersih:</span>
                  <span className="font-mono font-bold">
                    {estProfit > 0 
                      ? `+Rp ${formatRupiah(estProfit)}` 
                      : (debtToPayoff.debtType === 'jasa_antar' || debtToPayoff.usesCapital === false ? 'Rp 0 (Jasa Antar)' : 'Rp 0 (Pinjaman)')}
                  </span>
                </div>
                <div className="pt-1.5 border-t border-slate-850 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const d = debtToPayoff;
                      setDebtToPayoff(null);
                      handleOpenDebtModal(d);
                    }}
                    className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 font-medium"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Koreksi Modal & Laba Bon</span>
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDebtToPayoff(null)}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl transition text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  onClick={() => executePayoffDebt(debtToPayoff)}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition text-xs font-bold shadow-md shadow-emerald-500/20"
                >
                  Ya, Lunasi
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
              Catatan arus kas, riwayat transaksi POS, buku bon hutang pelanggan, dan data modal akan dihapus permanen.
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

      {/* ================= MODAL: KONFIRMASI RESET MODAL ================= */}
      {isConfirmResetCapitalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/40 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Reset Total Modal ke Rp 0?
                  </h3>
                  <p className="text-[11px] text-slate-400">Atur ulang saldo modal usaha toko.</p>
                </div>
              </div>
              <button
                onClick={() => setIsConfirmResetCapitalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Semua catatan riwayat modal usaha akan dihapus dan nominal <strong className="text-white">Total Modal</strong> akan kembali menjadi <strong className="text-emerald-400 font-mono">Rp 0</strong>.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isResettingCapital}
                onClick={() => setIsConfirmResetCapitalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium rounded-xl text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isResettingCapital}
                onClick={executeResetCapital}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-rose-600/30 transition cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isResettingCapital ? 'Mereset...' : 'Ya, Reset Modal'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isCapitalModalOpen && (
        <CapitalModal
          isOpen={isCapitalModalOpen}
          onClose={() => setIsCapitalModalOpen(false)}
          onSuccess={loadData}
          storeId={storeId}
        />
      )}
    </div>
  );
};

export default Pembukuan;
