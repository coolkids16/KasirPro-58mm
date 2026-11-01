import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Calendar,
  Clock,
  Award,
  PieChart,
  Activity,
  ChevronDown,
  RefreshCw,
  ArrowLeftRight,
  Globe,
  Building2,
  PlusCircle,
  ExternalLink
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Transaction, StoreSettings, CashFlowRecord, Product } from '../types';
import { db } from '../db/db';
import { subscribeCashFlows } from '../services/firebase';
import { formatRupiah } from '../utils/escpos';

export interface DashboardAnalyticsProps {
  settings: StoreSettings;
  transactions: Transaction[];
  storeId?: string | null;
}

type TimePeriod = 'today' | 'week' | 'month' | 'year' | 'custom';

interface DashboardMetrics {
  periodSales: number;
  periodTxCount: number;
  prevPeriodSales: number;
  avgDailySales: number;
  growthVsPrevPeriod: number;
  aov: number;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface PaymentMethodStat {
  name: string;
  value: number;
  color: string;
}

interface HourlyStat {
  hour: string;
  sales: number;
  txCount: number;
}

interface DailyStat {
  date: string;
  sales: number;
  txCount: number;
}

interface ExternalPOSData {
  source: string;
  sales: number;
  txCount: number;
  period: string;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const PERIOD_LABELS: Record<TimePeriod, string> = {
  today: 'Hari Ini',
  week: '7 Hari Terakhir',
  month: 'Bulan Ini',
  year: 'Tahun Ini',
  custom: 'Kustom'
};

const PERIOD_ICONS: Record<TimePeriod, typeof Calendar> = {
  today: Calendar,
  week: Calendar,
  month: Calendar,
  year: Calendar,
  custom: Calendar
};

export const DashboardAnalytics: React.FC<DashboardAnalyticsProps> = ({ settings, transactions, storeId }) => {
  const [cashFlows, setCashFlows] = useState<CashFlowRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dashboard_time_period') as TimePeriod) || 'month';
    }
    return 'month';
  });
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);

  // Load cashFlows & products dari Dexie & Firebase
  useEffect(() => {
    const loadLocal = async () => {
      try {
        const [cfList, prodList] = await Promise.all([
          db.cashFlows.toArray(),
          db.products.toArray()
        ]);
        setCashFlows(cfList);
        setProducts(prodList);
      } catch (err) {
        console.warn('Failed to load data from Dexie:', err);
      } finally {
        setLoading(false);
      }
    };

    loadLocal();

    const unsubscribeCf = subscribeCashFlows(
      (firestoreCfs) => {
        if (firestoreCfs && firestoreCfs.length > 0) {
          setCashFlows(firestoreCfs);
          db.cashFlows.clear().then(() => db.cashFlows.bulkAdd(firestoreCfs)).catch(console.warn);
        }
      },
      undefined,
      storeId || undefined
    );

    return () => {
      unsubscribeCf();
    };
  }, [storeId]);

  // Persist time period to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboard_time_period', timePeriod);
    }
  }, [timePeriod]);

  // Helper: get date range for period
  const getPeriodRange = useCallback((period: TimePeriod, customStart?: string, customEnd?: string) => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    
    let start: Date;
    
    switch (period) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        start = new Date(now);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        start = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        if (customEnd) {
          end.setTime(new Date(customEnd).getTime());
          end.setHours(23, 59, 59, 999);
        }
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    return { start, end };
  }, []);

  // Helper: get previous period range for comparison
  const getPrevPeriodRange = useCallback((period: TimePeriod, customStart?: string, customEnd?: string) => {
    const { start, end } = getPeriodRange(period, customStart, customEnd);
    const diff = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diff);
    return { start: prevStart, end: prevEnd };
  }, [getPeriodRange]);

  // Filter transactions by period
  const filteredTransactions = useMemo(() => {
    const { start, end } = getPeriodRange(timePeriod, customStartDate, customEndDate);
    return transactions.filter(t => {
      const d = new Date(t.timestamp);
      return d >= start && d <= end;
    });
  }, [transactions, timePeriod, customStartDate, customEndDate, getPeriodRange]);

  // Previous period transactions for comparison
  const prevPeriodTransactions = useMemo(() => {
    const { start, end } = getPrevPeriodRange(timePeriod, customStartDate, customEndDate);
    return transactions.filter(t => {
      const d = new Date(t.timestamp);
      return d >= start && d <= end;
    });
  }, [transactions, timePeriod, customStartDate, customEndDate, getPrevPeriodRange]);

  // Analytics dari Luar Kasir (berdasarkan CashFlow type income)
  const externalPOSData: ExternalPOSData[] = useMemo(() => {
    const { start, end } = getPeriodRange(timePeriod, customStartDate, customEndDate);
    
    // Filter cashflow: type income, dalam periode, dan bukan kategori internal (opsional)
    const filteredCfs = cashFlows.filter(cf => {
      const d = new Date(cf.timestamp);
      return cf.type === 'income' && d >= start && d <= end;
    });

    const sourceMap: Record<string, { sales: number; txCount: number }> = {};
    
    filteredCfs.forEach(cf => {
      const source = cf.category || 'Lainnya';
      if (!sourceMap[source]) {
        sourceMap[source] = { sales: 0, txCount: 0 };
      }
      sourceMap[source].sales += cf.amount;
      sourceMap[source].txCount += 1;
    });

    return Object.entries(sourceMap).map(([source, stats]) => ({
      source,
      ...stats,
      period: PERIOD_LABELS[timePeriod]
    })).sort((a, b) => b.sales - a.sales);
  }, [cashFlows, timePeriod, customStartDate, customEndDate, getPeriodRange]);

  // Hitung metrics utama berdasarkan periode
  const metrics: DashboardMetrics = useMemo(() => {
    const periodSales = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
    const periodTxCount = filteredTransactions.length;
    const prevPeriodSales = prevPeriodTransactions.reduce((sum, t) => sum + t.total, 0);
    
    const { start, end } = getPeriodRange(timePeriod, customStartDate, customEndDate);
    const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const avgDailySales = daysDiff > 0 ? Math.round(periodSales / daysDiff) : 0;
    
    const growthVsPrevPeriod = prevPeriodSales > 0 
      ? ((periodSales - prevPeriodSales) / prevPeriodSales) * 100 
      : periodSales > 0 ? 100 : 0;
    
    const aov = periodTxCount > 0 ? Math.round(periodSales / periodTxCount) : 0;

    return {
      periodSales,
      periodTxCount,
      prevPeriodSales,
      avgDailySales,
      growthVsPrevPeriod,
      aov
    };
  }, [filteredTransactions, prevPeriodTransactions, timePeriod, customStartDate, customEndDate, getPeriodRange]);

  // Top 5 produk terlaris (periode terpilih)
  const topProducts: TopProduct[] = useMemo(() => {
    const productMap: Record<string, { quantity: number; revenue: number }> = {};
    
    filteredTransactions.forEach(tx => {
      tx.items.forEach(item => {
        const pName = item.product.name;
        if (!productMap[pName]) {
          productMap[pName] = { quantity: 0, revenue: 0 };
        }
        productMap[pName].quantity += item.quantity;
        productMap[pName].revenue += item.quantity * item.product.price;
      });
    });

    return Object.entries(productMap)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [filteredTransactions]);

  // Breakdown metode pembayaran (periode terpilih)
  const paymentStats: PaymentMethodStat[] = useMemo(() => {
    const stats: Record<string, number> = {};
    
    filteredTransactions.forEach(tx => {
      const method = (tx.paymentMethod || 'cash').toUpperCase();
      stats[method] = (stats[method] || 0) + tx.total;
    });

    const colorMap: Record<string, string> = {
      CASH: '#10b981',
      QRIS: '#3b82f6',
      TRANSFER: '#f59e0b'
    };

    return Object.entries(stats).map(([name, value]) => ({
      name,
      value,
      color: colorMap[name] || '#8b5cf6'
    }));
  }, [filteredTransactions]);

  // Sales per jam (hanya untuk today/week, untuk month/year gunakan daily)
  const hourlySales: HourlyStat[] = useMemo(() => {
    if (timePeriod !== 'today' && timePeriod !== 'week') return [];
    
    const hourMap: Record<number, { sales: number; txCount: number }> = {};
    
    for (let h = 0; h < 24; h++) {
      hourMap[h] = { sales: 0, txCount: 0 };
    }

    const { start } = getPeriodRange(timePeriod);
    
    filteredTransactions.forEach(tx => {
      const hour = new Date(tx.timestamp).getHours();
      hourMap[hour].sales += tx.total;
      hourMap[hour].txCount += 1;
    });

    return Object.entries(hourMap)
      .map(([hour, stats]) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        ...stats
      }))
      .filter(h => h.sales > 0);
  }, [filteredTransactions, timePeriod, getPeriodRange]);

  // Daily sales untuk chart trend (semua periode)
  const dailySales: DailyStat[] = useMemo(() => {
    const { start, end } = getPeriodRange(timePeriod, customStartDate, customEndDate);
    const dayMap: Record<string, { sales: number; txCount: number }> = {};
    
    // Initialize all days in range
    const current = new Date(start);
    while (current <= end) {
      const key = current.toISOString().split('T')[0];
      dayMap[key] = { sales: 0, txCount: 0 };
      current.setDate(current.getDate() + 1);
    }

    filteredTransactions.forEach(tx => {
      const key = new Date(tx.timestamp).toISOString().split('T')[0];
      if (dayMap[key]) {
        dayMap[key].sales += tx.total;
        dayMap[key].txCount += 1;
      }
    });

    return Object.entries(dayMap)
      .map(([date, stats]) => ({
        date: new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        ...stats
      }))
      .filter(d => d.sales > 0 || timePeriod === 'today');
  }, [filteredTransactions, timePeriod, customStartDate, customEndDate, getPeriodRange]);

  // Previous period daily sales for comparison line
  const prevDailySales: DailyStat[] = useMemo(() => {
    if (timePeriod === 'custom') return [];
    const { start, end } = getPrevPeriodRange(timePeriod);
    const dayMap: Record<string, { sales: number; txCount: number }> = {};
    
    const current = new Date(start);
    while (current <= end) {
      const key = current.toISOString().split('T')[0];
      dayMap[key] = { sales: 0, txCount: 0 };
      current.setDate(current.getDate() + 1);
    }

    prevPeriodTransactions.forEach(tx => {
      const key = new Date(tx.timestamp).toISOString().split('T')[0];
      if (dayMap[key]) {
        dayMap[key].sales += tx.total;
        dayMap[key].txCount += 1;
      }
    });

    return Object.entries(dayMap)
      .map(([date, stats]) => ({
        date: new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        ...stats
      }));
  }, [prevPeriodTransactions, timePeriod, getPrevPeriodRange]);

  const handlePeriodChange = (period: TimePeriod) => {
    setTimePeriod(period);
    setShowPeriodDropdown(false);
    if (period !== 'custom') {
      setShowCustomPicker(false);
    }
  };

  const handleCustomApply = () => {
    if (customStartDate && customEndDate) {
      setTimePeriod('custom');
      setShowCustomPicker(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const periodLabel = PERIOD_LABELS[timePeriod];
  const isCustom = timePeriod === 'custom';

  return (
    <div className="w-full max-w-full mx-auto p-2 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Header dengan Period Selector */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white">Dashboard Analytics</h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Insight penjualan real-time & performa toko Anda
              </p>
            </div>
          </div>
          
          {/* Period Selector */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="relative">
              <button
                onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-white hover:border-emerald-500/50 transition-colors"
                aria-haspopup="true"
                aria-expanded={showPeriodDropdown}
              >
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>{periodLabel}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showPeriodDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {showPeriodDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowPeriodDropdown(false)} 
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 top-full mt-2 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden min-w-[160px] animate-fade-in">
                    {(['today', 'week', 'month', 'year'] as TimePeriod[]).map(p => {
                      const Icon = PERIOD_ICONS[p];
                      return (
                        <button
                          key={p}
                          onClick={() => handlePeriodChange(p)}
                          className={`w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors ${
                            timePeriod === p 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{PERIOD_LABELS[p]}</span>
                          {timePeriod === p && <span className="ml-auto w-2 h-2 bg-emerald-400 rounded-full" />}
                        </button>
                      );
                    })}
                    <div className="border-t border-slate-800" />
                    <button
                      onClick={() => { setShowCustomPicker(true); setShowPeriodDropdown(false); }}
                      className={`w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors ${
                        timePeriod === 'custom' 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Rentang Kustom</span>
                      {timePeriod === 'custom' && <span className="ml-auto w-2 h-2 bg-emerald-400 rounded-full" />}
                    </button>
                  </div>
                </>
              )}
            </div>

            {isCustom && (
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl p-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="bg-transparent border-none text-sm text-white focus:outline-none w-32"
                  max={customEndDate || undefined}
                />
                <ArrowLeftRight className="w-4 h-4 text-slate-500" />
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="bg-transparent border-none text-sm text-white focus:outline-none w-32"
                  min={customStartDate || undefined}
                />
                <button
                  onClick={handleCustomApply}
                  className="px-3 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
                >
                  Terapkan
                </button>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="p-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors"
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Card: Penjualan Periode */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
          <div className="relative flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Penjualan {periodLabel}</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white mb-1 relative">
            {formatRupiah(metrics.periodSales)}
          </div>
          <div className="flex items-center gap-2 text-xs relative">
            {metrics.growthVsPrevPeriod >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span className={metrics.growthVsPrevPeriod >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {metrics.growthVsPrevPeriod >= 0 ? '+' : ''}{metrics.growthVsPrevPeriod.toFixed(1)}%
            </span>
            <span className="text-slate-500">vs periode sebelumnya</span>
          </div>
        </div>

        {/* Card: Transaksi Periode */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
          <div className="relative flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Transaksi {periodLabel}</span>
            <ShoppingCart className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white mb-1 relative">
            {metrics.periodTxCount.toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-slate-500 relative">
            Total pembayaran selesai
          </div>
        </div>

        {/* Card: Rata-rata Harian */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
          <div className="relative flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Rata-rata Harian</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white mb-1 relative">
            {formatRupiah(metrics.avgDailySales)}
          </div>
          <div className="text-xs text-slate-500 relative">
            Per hari di periode ini
          </div>
        </div>

        {/* Card: AOV (Average Order Value) */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
          <div className="relative flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">AOV</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white mb-1 relative">
            {formatRupiah(metrics.aov)}
          </div>
          <div className="text-xs text-slate-500 relative">
            Rata-rata per transaksi
          </div>
        </div>

        {/* Card: Total Produk Terjual */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
          <div className="relative flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Item Terjual</span>
            <Award className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white mb-1 relative">
            {topProducts.reduce((sum, p) => sum + p.quantity, 0).toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-slate-500 relative">
            Total quantity {periodLabel.toLowerCase()}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Chart: Top 5 Produk Terlaris */}
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
            <Award className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-sm sm:text-base">Top 5 Produk Terlaris</h3>
          </div>

          {topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topProducts} layout="vertical">
                <defs>
                  <linearGradient id="topProductsGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  stroke="#94a3b8" 
                  fontSize={11}
                  width={120}
                  tick={{ fill: '#94a3b8' }}
                />
                <XAxis 
                  stroke="#94a3b8" 
                  fontSize={11} 
                  tick={{ fill: '#94a3b8' }}
                  type="number"
                  domain={[0, 'dataMax']}
                  tickCount={5}
                  tickFormatter={(value) => `${value} pcs`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f1f5f9',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
                  }}
                  itemStyle={{ color: '#f1f5f9' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}
                  formatter={(value: any, name: any) => {
                    if (name === 'quantity') return [`${Number(value).toLocaleString('id-ID')} pcs`, 'Terjual'];
                    if (name === 'revenue') return [formatRupiah(Number(value) || 0), 'Pendapatan'];
                    return [value, name];
                  }}
                  labelFormatter={(label: any) => label}
                />
                <Bar
                  dataKey="quantity" 
                  radius={[0, 8, 8, 0]}
                  maxBarSize={40}
                >
                  {topProducts.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
              Belum ada data penjualan produk
            </div>
          )}
        </div>

        {/* Chart: Metode Pembayaran */}
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
            <PieChart className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-white text-sm sm:text-base">Metode Pembayaran</h3>
          </div>

          {paymentStats.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <RechartsPie>
                <Pie
                  data={paymentStats}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
                  dataKey="value"
                >
                  {paymentStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  formatter={(value: any) => [formatRupiah(Number(value) || 0), 'Total']}
                />
                <Legend 
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: any) => value}
                />
              </RechartsPie>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
              Belum ada data metode pembayaran
            </div>
          )}
        </div>
      </div>

      {/* Chart: Sales Trend (Daily) - Full Width */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h3 className="font-bold text-white text-sm sm:text-base">Tren Penjualan Harian - {periodLabel}</h3>
        </div>

        {(dailySales.length > 0 || prevDailySales.length > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailySales}>
              <defs>
                <linearGradient id="currentPeriodGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="prevPeriodGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="date" 
                stroke="#94a3b8" 
                fontSize={11}
                tick={{ fill: '#94a3b8' }}
                tickLine={{ stroke: '#334155' }}
              />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={11}
                tick={{ fill: '#94a3b8' }}
                tickLine={{ stroke: '#334155' }}
                tickFormatter={(value) => formatRupiah(value).replace('Rp', '').trim()}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0f172a', 
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: any) => [formatRupiah(Number(value) || 0), 'Penjualan']}
                labelFormatter={(label: any) => label}
              />
              <Legend 
                layout="horizontal"
                align="center"
                verticalAlign="top"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ paddingTop: 8 }}
              />
              {prevDailySales.length > 0 && timePeriod !== 'custom' && (
                <Area
                  type="monotone"
                  dataKey="sales"
                  data={prevDailySales}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="url(#prevPeriodGradient)"
                  name="Periode Sebelumnya"
                  opacity={0.7}
                />
              )}
              <Area
                type="monotone"
                dataKey="sales"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#currentPeriodGradient)"
                name={periodLabel}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
            Belum ada data penjualan untuk periode ini
          </div>
        )}
      </div>

      {/* Hourly Chart (only for today/week) */}
      {(timePeriod === 'today' || timePeriod === 'week') && hourlySales.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
            <Clock className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-sm sm:text-base">Penjualan Per Jam - {periodLabel}</h3>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hourlySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="hour" 
                stroke="#94a3b8" 
                fontSize={11}
                tick={{ fill: '#94a3b8' }}
              />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={11}
                tick={{ fill: '#94a3b8' }}
                tickFormatter={(value) => formatRupiah(value).replace('Rp', '').trim()}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0f172a', 
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: any) => [formatRupiah(Number(value) || 0), 'Penjualan']}
              />
              <Bar 
                dataKey="sales" 
                fill="url(#salesGradient3)" 
                radius={[6, 6, 0, 0]}
                maxBarSize={30}
              >
                {hourlySales.map((_, index) => (
                  <Cell key={`hour-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category Breakdown (if products have category) */}
      {products.some(p => p.category) && (
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
            <PieChart className="w-5 h-5 text-purple-400" />
            <h3 className="font-bold text-white text-sm sm:text-base">Penjualan per Kategori</h3>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <RechartsPie>
              <Pie
                data={(() => {
                  const catMap: Record<string, number> = {};
                  filteredTransactions.forEach(tx => {
                    tx.items.forEach(item => {
                      const cat = item.product.category || 'Lainnya';
                      catMap[cat] = (catMap[cat] || 0) + item.quantity * item.product.price;
                    });
                  });
                  return Object.entries(catMap).map(([name, value], i) => ({
                    name,
                    value,
                    color: COLORS[i % COLORS.length]
                  }));
                })()}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                labelLine={false}
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
                dataKey="value"
              >
                {(() => {
                  const catMap: Record<string, number> = {};
                  filteredTransactions.forEach(tx => {
                    tx.items.forEach(item => {
                      const cat = item.product.category || 'Lainnya';
                      catMap[cat] = (catMap[cat] || 0) + item.quantity * item.product.price;
                    });
                  });
                  return Object.entries(catMap).map((_, index) => (
                    <Cell key={`cat-${index}`} fill={COLORS[index % COLORS.length]} />
                  ));
                })()}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0f172a', 
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: any) => [formatRupiah(Number(value) || 0), 'Penjualan']}
              />
              <Legend 
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconType="circle"
                iconSize={8}
              />
            </RechartsPie>
          </ResponsiveContainer>
        </div>
      )}

      {/* External POS Analytics Section */}
      {externalPOSData.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm sm:text-base">Analytics dari Luar Kasir (PPOB)</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {externalPOSData.map((ext, idx) => (
              <div key={ext.source} className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white text-sm">{ext.source}</span>
                </div>
                <div className="text-xl font-extrabold text-emerald-400 mb-1">
                  {formatRupiah(ext.sales)}
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <span>{ext.txCount.toLocaleString('id-ID')} transaksi</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-purple-400">{ext.period}</span>
                </div>
              </div>
            ))}
          </div>

          {/* External POS Summary */}
          <div className="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-5 h-5 text-purple-400" />
              <span className="font-bold text-white text-sm">Total Penjualan PPOB ({periodLabel})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-extrabold text-emerald-400">
                  {formatRupiah(externalPOSData.reduce((sum, e) => sum + e.sales, 0))}
                </div>
                <div className="text-xs text-slate-400">Total Omzet</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-cyan-400">
                  {externalPOSData.reduce((sum, e) => sum + e.txCount, 0).toLocaleString('id-ID')}
                </div>
                <div className="text-xs text-slate-400">Total Transaksi</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-amber-400">
                  {formatRupiah(externalPOSData.reduce((sum, e) => sum + e.sales, 0) / Math.max(1, externalPOSData.reduce((sum, e) => sum + e.txCount, 0)))}
                </div>
                <div className="text-xs text-slate-400">AOV PPOB</div>
              </div>
            </div>
          </div>

          {/* Combined Total (Kasir + External) */}
          <div className="mt-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <PlusCircle className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-white text-sm">Total Gabungan (Kasir + PPOB)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-extrabold text-white">
                  {formatRupiah(metrics.periodSales + externalPOSData.reduce((sum, e) => sum + e.sales, 0))}
                </div>
                <div className="text-xs text-slate-400">Total Omzet Gabungan</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-white">
                  {(metrics.periodTxCount + externalPOSData.reduce((sum, e) => sum + e.txCount, 0)).toLocaleString('id-ID')}
                </div>
                <div className="text-xs text-slate-400">Total Transaksi Gabungan</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-white">
                  {formatRupiah(
                    (metrics.periodSales + externalPOSData.reduce((sum, e) => sum + e.sales, 0)) / 
                    Math.max(1, metrics.periodTxCount + externalPOSData.reduce((sum, e) => sum + e.txCount, 0))
                  )}
                </div>
                <div className="text-xs text-slate-400">AOV Gabungan</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.15s ease-out;
        }
      `}</style>
    </div>
  );
};

export default DashboardAnalytics;
