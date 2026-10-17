import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Calendar,
  Clock,
  Award,
  PieChart,
  Activity
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Transaction, StoreSettings } from '../types';
import { db } from '../db/db';
import { subscribeTransactions } from '../services/firebase';
import { formatRupiah } from '../utils/escpos';

export interface DashboardAnalyticsProps {
  settings: StoreSettings;
  storeId?: string | null;
}

interface DashboardMetrics {
  todaySales: number;
  todayTxCount: number;
  monthSales: number;
  monthTxCount: number;
  yesterdaySales: number;
  avgDailySales: number;
  growthVsYesterday: number;
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

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const DashboardAnalytics: React.FC<DashboardAnalyticsProps> = ({ settings, storeId }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Load transactions dari Dexie & Firebase
  useEffect(() => {
    const loadLocal = async () => {
      try {
        const list = await db.transactions.toArray();
        setTransactions(list);
      } catch (err) {
        console.warn('Failed to load transactions from Dexie:', err);
      } finally {
        setLoading(false);
      }
    };

    loadLocal();

    const unsubscribe = subscribeTransactions(
      (firestoreTxs) => {
        if (firestoreTxs && firestoreTxs.length > 0) {
          setTransactions(firestoreTxs);
          db.transactions.clear().then(() => db.transactions.bulkAdd(firestoreTxs)).catch(console.warn);
        }
      },
      loadLocal,
      storeId || undefined
    );

    return () => unsubscribe();
  }, [storeId]);

  // Hitung metrics utama
  const metrics: DashboardMetrics = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayTxs = transactions.filter(t => new Date(t.timestamp) >= todayStart);
    const yesterdayTxs = transactions.filter(t => {
      const d = new Date(t.timestamp);
      return d >= yesterdayStart && d < todayStart;
    });
    const monthTxs = transactions.filter(t => new Date(t.timestamp) >= monthStart);

    const todaySales = todayTxs.reduce((sum, t) => sum + t.total, 0);
    const todayTxCount = todayTxs.length;
    const yesterdaySales = yesterdayTxs.reduce((sum, t) => sum + t.total, 0);
    const monthSales = monthTxs.reduce((sum, t) => sum + t.total, 0);
    const monthTxCount = monthTxs.length;

    const daysInMonth = now.getDate();
    const avgDailySales = daysInMonth > 0 ? Math.round(monthSales / daysInMonth) : 0;

    const growthVsYesterday = yesterdaySales > 0 
      ? ((todaySales - yesterdaySales) / yesterdaySales) * 100 
      : todaySales > 0 ? 100 : 0;

    return {
      todaySales,
      todayTxCount,
      monthSales,
      monthTxCount,
      yesterdaySales,
      avgDailySales,
      growthVsYesterday
    };
  }, [transactions]);

  // Top 5 produk terlaris
  const topProducts: TopProduct[] = useMemo(() => {
    const productMap: Record<string, { quantity: number; revenue: number }> = {};
    
    transactions.forEach(tx => {
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
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [transactions]);

  // Breakdown metode pembayaran
  const paymentStats: PaymentMethodStat[] = useMemo(() => {
    const stats: Record<string, number> = {};
    
    transactions.forEach(tx => {
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
  }, [transactions]);

  // Sales per jam (24 jam)
  const hourlySales: HourlyStat[] = useMemo(() => {
    const hourMap: Record<number, { sales: number; txCount: number }> = {};
    
    for (let h = 0; h < 24; h++) {
      hourMap[h] = { sales: 0, txCount: 0 };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    transactions
      .filter(t => new Date(t.timestamp) >= todayStart)
      .forEach(tx => {
        const hour = new Date(tx.timestamp).getHours();
        hourMap[hour].sales += tx.total;
        hourMap[hour].txCount += 1;
      });

    return Object.entries(hourMap)
      .map(([hour, stats]) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        ...stats
      }))
      .filter(h => h.sales > 0); // Hanya jam yang ada transaksi
  }, [transactions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-full mx-auto p-2 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
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
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card: Penjualan Hari Ini */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Penjualan Hari Ini</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white mb-1">
            {formatRupiah(metrics.todaySales)}
          </div>
          <div className="flex items-center gap-2 text-xs">
            {metrics.growthVsYesterday >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span className={metrics.growthVsYesterday >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {metrics.growthVsYesterday >= 0 ? '+' : ''}{metrics.growthVsYesterday.toFixed(1)}%
            </span>
            <span className="text-slate-500">vs kemarin</span>
          </div>
        </div>

        {/* Card: Transaksi Hari Ini */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Transaksi Hari Ini</span>
            <ShoppingCart className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white mb-1">
            {metrics.todayTxCount}
          </div>
          <div className="text-xs text-slate-500">
            Total pembayaran selesai
          </div>
        </div>

        {/* Card: Penjualan Bulan Ini */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Penjualan Bulan Ini</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-white mb-1">
            {formatRupiah(metrics.monthSales)}
          </div>
          <div className="text-xs text-slate-500">
            {metrics.monthTxCount} transaksi
          </div>
        </div>

        {/* Card: Rata-rata Harian */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Rata-rata Harian</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-white mb-1">
            {formatRupiah(metrics.avgDailySales)}
          </div>
          <div className="text-xs text-slate-500">
            Per hari bulan ini
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
              <BarChart data={topProducts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis 
                  dataKey="name" 
                  stroke="#94a3b8" 
                  fontSize={11}
                  angle={-20}
                  textAnchor="end"
                  height={80}
                />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  formatter={(value: any) => formatRupiah(Number(value) || 0)}
                />
                <Bar dataKey="revenue" fill="#10b981" radius={[8, 8, 0, 0]} />
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
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${((entry.value / metrics.monthSales) * 100).toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
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
                  formatter={(value: any) => formatRupiah(Number(value) || 0)}
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

      {/* Chart: Penjualan Per Jam Hari Ini */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
          <Clock className="w-5 h-5 text-cyan-400" />
          <h3 className="font-bold text-white text-sm sm:text-base">Penjualan Per Jam (Hari Ini)</h3>
        </div>

        {hourlySales.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={hourlySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0f172a', 
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: any) => formatRupiah(Number(value) || 0)}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="sales" 
                stroke="#10b981" 
                strokeWidth={2}
                name="Penjualan"
                dot={{ fill: '#10b981', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
            Belum ada transaksi hari ini
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardAnalytics;
