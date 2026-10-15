import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  CheckCircle2,
  Sun,
  Moon,
  Users,
  Scan,
  Wallet,
  RefreshCw
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { PrinterDeviceStatus, StoreSettings, UserProfile } from '../types';

export interface NavbarProps {
  activeTab: 'pos' | 'products' | 'strukscan' | 'transactions' | 'printer' | 'pembukuan';
  setActiveTab: (tab: 'pos' | 'products' | 'strukscan' | 'transactions' | 'printer' | 'pembukuan') => void;
  printerStatus: PrinterDeviceStatus;
  onOpenPrinterModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenAuthModal: () => void;
  onOpenBackupModal: () => void;
  onOpenUsersModal?: () => void;
  currentUser: FirebaseUser | null;
  userProfile?: UserProfile | null;
  runtimeEnv: 'tauri' | 'capacitor' | 'browser';
  settings?: StoreSettings;
  theme?: 'dark' | 'light';
  toggleTheme?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  printerStatus,
  onOpenPrinterModal,
  onOpenSettingsModal,
  onOpenAuthModal,
  onOpenBackupModal,
  onOpenUsersModal,
  currentUser,
  userProfile,
  runtimeEnv,
  settings,
  theme = 'dark',
  toggleTheme
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showSyncInfo, setShowSyncInfo] = useState<boolean>(false);

  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false);

  // Helper to extract display label & initial for signed in user
  const getUserNameLabel = (user: FirebaseUser | null): string => {
    if (!user) return 'Masuk';
    if (userProfile?.displayName && userProfile.displayName.trim().length > 0) {
      return userProfile.displayName.split(' ')[0];
    }
    if (user.displayName && user.displayName.trim().length > 0) {
      return user.displayName.split(' ')[0];
    }
    if (user.email && user.email.includes('@')) {
      const emailPrefix = user.email.split('@')[0];
      return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }
    return userProfile?.role ? userProfile.role.toUpperCase() : 'Kasir';
  };

  const getUserInitial = (user: FirebaseUser): string => {
    const label = getUserNameLabel(user);
    return label.charAt(0).toUpperCase();
  };

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

  // Firestore sync is active when user is signed in AND device is online
  const isFirestoreActive = Boolean(currentUser && isOnline);

  return (
    <header className="w-full max-w-full overflow-hidden bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
      <div className="w-full max-w-full mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Brand + Nav Tabs group sitting closely together */}
          <div className="flex items-center gap-3 lg:gap-4">
            {/* Logo & Platform Info with Live Indicators */}
            <div className="flex items-center gap-2.5 shrink-0">
              {settings?.logoUrl ? (
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-950 border border-slate-750 flex items-center justify-center p-1 shadow-md overflow-hidden shrink-0">
                  <img 
                    src={settings.logoUrl} 
                    alt={settings.storeName || 'Logo'} 
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-bold text-lg shrink-0">
                  KP
                </div>
              )}
              <div className="shrink-0">
                <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-white leading-tight whitespace-nowrap">
                  {settings?.storeName ? settings.storeName : 'KasirPro'}
                </h1>
                <div className="text-[10px] text-slate-400 font-mono hidden sm:flex flex-col leading-tight mt-0.5 whitespace-nowrap">
                  <span>Cross-Platform POS</span>
                  <span className="text-slate-500">• Linux & Android</span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs aligned closely to the left */}
            <nav className="hidden lg:flex [@media(orientation:portrait)]:!hidden items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800 shrink-0 ml-2 sm:ml-3">
              <button
                onClick={() => setActiveTab('pos')}
                className={`flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'pos'
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <Store className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">Kasir (POS)</span>
              </button>

              <button
                onClick={() => setActiveTab('products')}
                className={`flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'products'
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <Package className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline whitespace-nowrap">Produk & Stok</span>
                <span className="lg:hidden whitespace-nowrap">Produk</span>
              </button>

              <button
                onClick={() => setActiveTab('transactions')}
                className={`flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'transactions'
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <Receipt className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">Riwayat</span>
              </button>

              {/* TAB PEMBUKUAN */}
              <button
                onClick={() => setActiveTab('pembukuan')}
                className={`flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'pembukuan'
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="whitespace-nowrap">Pembukuan</span>
              </button>

              {/* TAB STRUKSCAN STUDIO */}
              <button
                onClick={() => setActiveTab('strukscan')}
                className={`flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'strukscan'
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <Scan className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="hidden lg:inline whitespace-nowrap">StrukScan OCR</span>
                <span className="lg:hidden whitespace-nowrap">StrukScan</span>
              </button>

              <button
                onClick={() => setActiveTab('printer')}
                className={`flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'printer'
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline whitespace-nowrap">Uji Printer 58mm</span>
                <span className="lg:hidden whitespace-nowrap">Printer</span>
              </button>
            </nav>
          </div>

          {/* Right: Consolidated Quick Actions & Status */}
          <div className="flex items-center gap-2 lg:gap-3 shrink-0">
            {/* Live Sync Status Pill Indicator */}
            <div className="relative">
              <button
                onClick={() => setShowSyncInfo(!showSyncInfo)}
                title="Status Database & Sinkronisasi (Klik untuk rincian)"
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                  isFirestoreActive
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                    : 'bg-amber-950/50 border-amber-500/40 text-amber-300 hover:bg-amber-900/50'
                }`}
              >
                {/* Visual Dual-LED Lights */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Dexie LED (Always Active) */}
                  <span 
                    className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400 shrink-0" 
                    title="Dexie IndexedDB (Offline): Aktif" 
                  />
                  {/* Firestore Cloud LED */}
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
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
              </button>

              {/* Popover Card Info */}
              {showSyncInfo && createPortal(
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                  onClick={() => setShowSyncInfo(false)}
                >
                  <div
                    className="relative z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full mx-4 p-4 text-xs space-y-3 animate-in fade-in"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Status Sinkronisasi Database"
                    onClick={event => event.stopPropagation()}
                  >
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                    <span className="font-bold text-white flex items-center gap-1.5 text-xs whitespace-nowrap">
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
                        <span className="font-bold text-white whitespace-nowrap">Dexie.js (IndexedDB)</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
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
                        <span className="font-bold text-white whitespace-nowrap">Firebase Firestore</span>
                      </div>
                      <span 
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
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

                      {currentUser && (
                        <div className="pt-2 pl-4.5">
                          <button
                            onClick={() => {
                              setShowSyncInfo(false);
                              window.location.reload();
                            }}
                            className="w-full py-1.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow whitespace-nowrap"
                            title="Paksa sinkronisasi ulang data terbaru dari cloud (Android / Linux)"
                          >
                            <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                            Sinkronkan Sekarang (Force Sync)
                          </button>
                        </div>
                      )}

                    {!currentUser && (
                      <div className="pt-2 pl-4.5">
                        <button
                          onClick={() => {
                            setShowSyncInfo(false);
                            onOpenAuthModal();
                          }}
                          className="w-full py-1.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow whitespace-nowrap"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          Login untuk Aktifkan Cloud Sync (2/2)
                        </button>
                      </div>
                    )}
                  </div>
                  </div>
                </div>,
                document.body
              )}
            </div>

            {/* Unified User & Settings Dropdown Menu Button */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                title="Buka Menu Pengaturan & Akun"
                className={`p-2 rounded-xl border transition flex items-center justify-center shrink-0 ${
                  currentUser
                    ? userProfile?.role === 'owner'
                      ? 'bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/50 shadow-sm'
                      : userProfile?.role === 'manager'
                      ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/50 shadow-sm'
                      : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 shadow-sm'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                {currentUser?.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={getUserNameLabel(currentUser)}
                    className={`w-6 h-6 rounded-full object-cover border shrink-0 ${
                      userProfile?.role === 'owner'
                        ? 'border-amber-400/70'
                        : userProfile?.role === 'manager'
                        ? 'border-cyan-400/70'
                        : 'border-emerald-400/70'
                    }`}
                  />
                ) : currentUser ? (
                  <div className={`w-6 h-6 rounded-full font-black text-xs flex items-center justify-center leading-none shrink-0 ${
                    userProfile?.role === 'owner'
                      ? 'bg-amber-400 text-slate-950'
                      : userProfile?.role === 'manager'
                      ? 'bg-cyan-400 text-slate-950'
                      : 'bg-emerald-500 text-slate-950'
                  }`}>
                    {getUserInitial(currentUser)}
                  </div>
                ) : (
                  <LogIn className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
              </button>

              {/* Dropdown Menu Card */}
              {showProfileMenu && createPortal(
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <div
                    className="relative z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full mx-4 p-3 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-100"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Menu akun dan pengaturan"
                    onClick={event => event.stopPropagation()}
                  >
                  {/* User Profile Header Section */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                    {currentUser?.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt="Profile"
                        className="w-10 h-10 rounded-full object-cover border border-slate-700"
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full font-black text-sm flex items-center justify-center leading-none shrink-0 ${
                        currentUser
                          ? userProfile?.role === 'owner'
                            ? 'bg-amber-400 text-slate-950'
                            : userProfile?.role === 'manager'
                            ? 'bg-cyan-400 text-slate-950'
                            : 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {currentUser ? getUserInitial(currentUser) : '?'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white truncate text-[13px]">
                        {currentUser ? getUserNameLabel(currentUser) : 'Mode Lokal / Offline'}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {currentUser ? currentUser.email : 'Data disimpan di perangkat'}
                      </p>
                    </div>
                    {userProfile?.role && (
                      <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded font-black uppercase shrink-0 ${
                        userProfile.role === 'owner'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : userProfile.role === 'manager'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {userProfile.role}
                      </span>
                    )}
                  </div>

                  <div className="border-t border-slate-800 my-1" />

                  {/* Menu Options */}
                  <div className="space-y-0.5">
                    {/* 1. Account / Login Modal */}
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onOpenAuthModal();
                      }}
                      className="w-full flex items-center justify-between p-2 rounded-xl text-slate-200 hover:text-white hover:bg-slate-800 transition font-medium text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <UserIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{currentUser ? 'Akun & Integrasi' : 'Masuk ke Cloud Sync'}</span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 uppercase font-bold">
                        {currentUser ? 'Atur' : 'Login'}
                      </span>
                    </button>

                    {/* 2. Store & Printer Settings */}
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onOpenSettingsModal();
                      }}
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl text-slate-200 hover:text-white hover:bg-slate-800 transition font-medium text-left"
                    >
                      <Settings className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Pengaturan Toko</span>
                    </button>

                    {/* 3. Backup & Restore */}
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onOpenBackupModal();
                      }}
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl text-slate-200 hover:text-white hover:bg-slate-800 transition font-medium text-left"
                    >
                      <Database className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>Backup & Impor Data (Dexie)</span>
                    </button>

                    {/* 4. Staff Management (Owner only) */}
                    {userProfile?.role === 'owner' && onOpenUsersModal && (
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          onOpenUsersModal();
                        }}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl text-slate-200 hover:text-white hover:bg-slate-800 transition font-medium text-left"
                      >
                        <Users className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span>Kelola Staf Toko</span>
                      </button>
                    )}

                    {/* 5. Theme Toggle Switch */}
                    {toggleTheme && (
                      <button
                        onClick={() => {
                          toggleTheme();
                        }}
                        className="w-full flex items-center justify-between p-2 rounded-xl text-slate-200 hover:text-white hover:bg-slate-800 transition font-medium text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          {theme === 'dark' ? (
                            <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : (
                            <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
                          )}
                          <span>Tema: {theme === 'dark' ? 'Gelap' : 'Terang'}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {theme === 'dark' ? 'Dark' : 'Light'}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Environment info footer */}
                  <div className="border-t border-slate-800 pt-2 pb-1 px-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>KasirPro v2.0</span>
                    <span className="uppercase bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-cyan-500 text-[9px]">
                      {runtimeEnv}
                    </span>
                  </div>
                  </div>
                </div>,
                document.body
              )}
            </div>

            <div className="hidden xl:block px-2.5 py-1 rounded-md text-[11px] font-mono uppercase bg-slate-800 text-cyan-400 border border-slate-700 whitespace-nowrap shrink-0">
              {runtimeEnv}
            </div>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <nav className="flex lg:hidden [@media(orientation:portrait)]:!flex items-center justify-start gap-1 py-2 border-t border-slate-800 overflow-x-auto no-scrollbar whitespace-nowrap">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex flex-col items-center gap-1 text-xs py-1 px-2 rounded shrink-0 ${
              activeTab === 'pos' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Store className="w-4 h-4" />
            Kasir
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex flex-col items-center gap-1 text-xs py-1 px-2 rounded shrink-0 ${
              activeTab === 'products' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Package className="w-4 h-4" />
            Produk
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex flex-col items-center gap-1 text-xs py-1 px-2 rounded shrink-0 ${
              activeTab === 'transactions' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Riwayat
          </button>
          <button
            onClick={() => setActiveTab('pembukuan')}
            className={`flex flex-col items-center gap-1 text-xs py-1 px-2 rounded shrink-0 ${
              activeTab === 'pembukuan' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Wallet className="w-4 h-4 text-emerald-400" />
            Buku
          </button>
          <button
            onClick={() => setActiveTab('strukscan')}
            className={`flex flex-col items-center gap-1 text-xs py-1 px-2 rounded shrink-0 ${
              activeTab === 'strukscan' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Scan className="w-4 h-4 text-emerald-400" />
            StrukScan
          </button>
          <button
            onClick={() => setActiveTab('printer')}
            className={`flex flex-col items-center gap-1 text-xs py-1 px-2 rounded shrink-0 ${
              activeTab === 'printer' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Printer className="w-4 h-4" />
            Printer
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
