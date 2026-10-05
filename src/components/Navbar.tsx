import React, { useState, useEffect, useRef } from 'react';
import { 
  Store, 
  Package, 
  Receipt, 
  Printer, 
  Settings, 
  LogIn, 
  User as UserIcon, 
  HardDrive,
  Cloud,
  CloudOff,
  Database,
  Wifi,
  WifiOff,
  CheckCircle2
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { PrinterDeviceStatus } from '../types';

export interface NavbarProps {
  activeTab: 'pos' | 'products' | 'transactions' | 'printer';
  setActiveTab: (tab: 'pos' | 'products' | 'transactions' | 'printer') => void;
  printerStatus: PrinterDeviceStatus;
  onOpenPrinterModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenAuthModal: () => void;
  onOpenBackupModal: () => void;
  currentUser: FirebaseUser | null;
  runtimeEnv: 'tauri' | 'capacitor' | 'browser';
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  printerStatus,
  onOpenPrinterModal,
  onOpenSettingsModal,
  onOpenAuthModal,
  onOpenBackupModal,
  currentUser,
  runtimeEnv
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showSyncInfo, setShowSyncInfo] = useState<boolean>(false);
  const syncPopoverRef = useRef<HTMLDivElement>(null);

  // Monitor network connectivity
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (syncPopoverRef.current && !syncPopoverRef.current.contains(event.target as Node)) {
        setShowSyncInfo(false);
      }
    };
    if (showSyncInfo) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSyncInfo]);

  // Firestore sync is active when user is signed in AND device is online
  const isFirestoreActive = Boolean(currentUser && isOnline);

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Platform Info with Live Indicators */}
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
              <p className="text-[11px] text-slate-400 font-mono hidden sm:block">
                ESC/POS (32 Kolom) • Linux & Android
              </p>
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

          {/* Quick Actions: Sync Status, Backup, Settings, Printer & Login Status */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Live Sync Status Pill Indicator */}
            <div className="relative" ref={syncPopoverRef}>
              <button
                onClick={() => setShowSyncInfo(!showSyncInfo)}
                title="Status Database & Sinkronisasi (Klik untuk rincian)"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                  isFirestoreActive
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                    : 'bg-amber-950/50 border-amber-500/40 text-amber-300 hover:bg-amber-900/50'
                }`}
              >
                {/* Visual Dual-LED Lights */}
                <div className="flex items-center gap-1.5">
                  {/* Dexie LED (Always Active) */}
                  <span 
                    className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" 
                    title="Dexie IndexedDB (Offline): Aktif" 
                  />
                  {/* Firestore Cloud LED */}
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isFirestoreActive
                        ? 'bg-cyan-400 animate-pulse shadow-sm shadow-cyan-400'
                        : 'bg-slate-600'
                    }`}
                    title={isFirestoreActive ? 'Firestore Cloud: Aktif' : 'Firestore: Nonaktif'}
                  />
                </div>

                {isFirestoreActive ? (
                  <Cloud className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                ) : (
                  <HardDrive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}

                <span className="hidden xl:inline text-[11px] font-mono">
                  {isFirestoreActive ? 'Cloud + Dexie (2/2 Aktif)' : 'Hanya Dexie (1/2 Aktif)'}
                </span>
                <span className="hidden sm:inline xl:hidden text-[11px] font-mono">
                  {isFirestoreActive ? '2/2 DB' : '1/2 DB'}
                </span>
              </button>

              {/* Popover Card Info */}
              {showSyncInfo && (
                <div className="absolute right-0 mt-2 w-80 p-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 text-xs space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                    <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                      <Database className="w-4 h-4 text-emerald-400" />
                      Status Sinkronisasi Database
                    </span>
                    <button
                      onClick={() => setShowSyncInfo(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 1. Dexie.js (IndexedDB) Status */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
                        <span className="font-bold text-white">Dexie.js (IndexedDB)</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        🟢 AKTIF (100%)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 pl-4.5">
                      Penyimpanan lokal di memori browser/perangkat. Kasir tetap beroperasi cepat tanpa jeda meski tanpa koneksi internet.
                    </p>
                  </div>

                  {/* 2. Firebase Firestore (Cloud) Status */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span 
                          className={`w-2.5 h-2.5 rounded-full ${
                            isFirestoreActive
                              ? 'bg-cyan-400 animate-pulse shadow-sm shadow-cyan-400'
                              : 'bg-amber-400'
                          }`}
                        />
                        <span className="font-bold text-white">Firebase Firestore</span>
                      </div>
                      <span 
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isFirestoreActive
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {isFirestoreActive ? '🟢 TERSINKRON' : '🟡 MODE OFFLINE'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 pl-4.5">
                      {isFirestoreActive ? (
                        <span className="text-emerald-300">
                          Sinkronisasi Cloud aktif secara real-time. Perubahan stok, transaksi, dan pengaturan otomatis tersinkron ke semua kasir.
                        </span>
                      ) : !currentUser ? (
                        <span>
                          Masuk dengan akun Google/Email untuk mengaktifkan sinkronisasi otomatis ke cloud.
                        </span>
                      ) : (
                        <span className="text-amber-300 flex items-center gap-1">
                          <WifiOff className="w-3 h-3 shrink-0" />
                          Koneksi internet terputus. Data disimpan di Dexie lokal dan akan otomatis sinkron saat online kembali.
                        </span>
                      )}
                    </p>

                    {!currentUser && (
                      <div className="pt-2 pl-4.5">
                        <button
                          onClick={() => {
                            setShowSyncInfo(false);
                            onOpenAuthModal();
                          }}
                          className="w-full py-1.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          Login untuk Aktifkan Cloud Sync (2/2)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Full Backup & Export/Import Button */}
            <button
              onClick={onOpenBackupModal}
              title="Pusat Ekspor & Impor Data (Backup & Restore)"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-cyan-400 hover:text-white transition"
            >
              <Database className="w-4 h-4" />
            </button>

            {/* Settings Button */}
            <button
              onClick={onOpenSettingsModal}
              title="Pengaturan Toko & Struk Printer Thermal"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* User Login Status Button */}
            <button
              onClick={onOpenAuthModal}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                currentUser
                  ? 'bg-slate-800/90 border-slate-700 text-emerald-300 hover:bg-slate-800'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              }`}
            >
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Kasir'}
                  className="w-4 h-4 rounded-full object-cover"
                />
              ) : currentUser ? (
                <UserIcon className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <LogIn className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span className="max-w-[100px] truncate">
                {currentUser?.displayName ? currentUser.displayName.split(' ')[0] : 'Masuk'}
              </span>
            </button>

            <div className="hidden lg:block px-2.5 py-1 rounded-md text-[11px] font-mono uppercase bg-slate-800 text-cyan-400 border border-slate-700">
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
          <button
            onClick={onOpenBackupModal}
            className="flex flex-col items-center gap-1 text-xs py-1 px-2 rounded text-cyan-400 hover:text-white"
          >
            <Database className="w-4 h-4" />
            Data
          </button>
          <button
            onClick={onOpenSettingsModal}
            className="flex flex-col items-center gap-1 text-xs py-1 px-2 rounded text-slate-400 hover:text-white"
          >
            <Settings className="w-4 h-4" />
            Atur
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
