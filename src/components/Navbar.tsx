import React from 'react';
import { 
  Store, 
  Package, 
  Receipt, 
  Printer, 
  HardDrive,
  Cpu
} from 'lucide-react';
import { PrinterDeviceStatus } from '../types';

interface NavbarProps {
  activeTab: 'pos' | 'products' | 'transactions' | 'printer';
  setActiveTab: (tab: 'pos' | 'products' | 'transactions' | 'printer') => void;
  printerStatus: PrinterDeviceStatus;
  onOpenPrinterModal: () => void;
  runtimeEnv: 'tauri' | 'capacitor' | 'browser';
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  printerStatus,
  onOpenPrinterModal,
  runtimeEnv
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-bold text-lg">
              KP
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">KasirPro</span>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  58mm POS
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-emerald-400" />
                  Dexie.js (Offline)
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-300">
                  <Cpu className="w-3 h-3 text-cyan-400" />
                  Target: Linux & Android
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'pos'
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <Store className="w-4 h-4" />
              Kasir (POS)
            </button>

            <button
              onClick={() => setActiveTab('products')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'products'
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <Package className="w-4 h-4" />
              Produk & Stok
            </button>

            <button
              onClick={() => setActiveTab('transactions')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'transactions'
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <Receipt className="w-4 h-4" />
              Riwayat
            </button>

            <button
              onClick={() => setActiveTab('printer')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'printer'
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <Printer className="w-4 h-4" />
              Uji Printer 58mm
            </button>
          </nav>

          {/* Printer Status & Quick Action */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onOpenPrinterModal}
              title="Konfigurasi Printer 58mm"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors"
            >
              <span className={`w-2 h-2 rounded-full ${printerStatus.connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <Printer className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">
                {printerStatus.deviceName || (printerStatus.connected ? 'Printer Siap' : 'Simulator 58mm')}
              </span>
            </button>

            <div className="px-2.5 py-1 rounded-md text-[11px] font-mono uppercase bg-slate-800 text-cyan-400 border border-slate-700">
              {runtimeEnv}
            </div>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden flex items-center justify-around py-2 border-t border-slate-800">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex flex-col items-center gap-1 text-xs py-1 px-2 rounded ${
              activeTab === 'pos' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Store className="w-4 h-4" />
            Kasir
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex flex-col items-center gap-1 text-xs py-1 px-2 rounded ${
              activeTab === 'products' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Package className="w-4 h-4" />
            Produk
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex flex-col items-center gap-1 text-xs py-1 px-2 rounded ${
              activeTab === 'transactions' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Riwayat
          </button>
          <button
            onClick={() => setActiveTab('printer')}
            className={`flex flex-col items-center gap-1 text-xs py-1 px-2 rounded ${
              activeTab === 'printer' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Printer className="w-4 h-4" />
            Printer
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
