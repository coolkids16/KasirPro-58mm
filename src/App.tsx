import React, { useState, useEffect, useCallback } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { Navbar } from './components/Navbar';
import { PosScreen } from './components/PosScreen';
import { ProductManagement } from './components/ProductManagement';
import { StrukScanStudio } from './components/StrukScanStudio';
import { TransactionHistory } from './components/TransactionHistory';
import { Pembukuan } from './components/Pembukuan';
import { DashboardAnalytics } from './components/DashboardAnalytics';
import { PrinterTester } from './components/PrinterTester';
import { ReceiptModal } from './components/ReceiptModal';
import { AuthModal } from './components/AuthModal';
import { SettingsModal } from './components/SettingsModal';
import { DataBackupModal } from './components/DataBackupModal';
import { Product, Transaction, StoreSettings, PrinterDeviceStatus } from './types';
import { db, initializeDatabase, DEFAULT_SETTINGS, INITIAL_PRODUCTS } from './db/db';
import { printerService } from './services/printerService';
import { 
  subscribeToAuthState, 
  subscribeProducts, 
  subscribeStoreSettings, 
  saveStoreSettingsToFirestore,
  validateFirestoreConnection,
  saveProductToFirestore,
  setActiveStoreId 
} from './services/firebase';
import { useRole } from './hooks/useRole';
import { RoleProtectedRoute } from './components/RoleGuard';
import { UserManagementModal } from './components/UserManagementModal';

export default function App() {
  const { currentUser, userProfile, role, storeId, isOwner, isManager, isCashier } = useRole();
  const [activeTab, setActiveTab] = useState<'pos' | 'products' | 'strukscan' | 'transactions' | 'printer' | 'pembukuan' | 'dashboard'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  
  // Synchronously initialize settings from localStorage if available, otherwise DEFAULT_SETTINGS
  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      const saved = localStorage.getItem('kasirpro_settings');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {}
    return DEFAULT_SETTINGS;
  });

  const [printerStatus, setPrinterStatus] = useState<PrinterDeviceStatus>(printerService.getStatus());
  const [currentReceiptTx, setCurrentReceiptTx] = useState<Transaction | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState<boolean>(false);
  const [runtimeEnv, setRuntimeEnv] = useState<'tauri' | 'capacitor' | 'browser'>('browser');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('kasirpro_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}
    return 'dark';
  });

  // Sync theme to root html element & localStorage
  useEffect(() => {
    try {
      localStorage.setItem('kasirpro_theme', theme);
    } catch (e) {}
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Load products & settings from Dexie.js IndexedDB for offline resilience
  const refreshProductsLocal = useCallback(async () => {
    try {
      const list = await db.products.toArray();
      if (list.length > 0) {
        setProducts(list);
      }
    } catch (err) {
      console.error('Failed to load products from Dexie:', err);
    }
  }, []);

  const loadSettingsLocal = useCallback(async () => {
    try {
      const s = await db.settings.get('main');
      if (s) {
        setSettings(s);
        try {
          localStorage.setItem('kasirpro_settings', JSON.stringify(s));
        } catch (e) {}
      } else {
        const local = localStorage.getItem('kasirpro_settings');
        if (local) {
          const parsed = JSON.parse(local);
          setSettings(parsed);
          await db.settings.put({ ...parsed, id: 'main' });
        }
      }
    } catch (err) {
      console.error('Failed to load settings from Dexie:', err);
    }
  }, []);

  const handleUpdateSettings = (newSettings: StoreSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('kasirpro_settings', JSON.stringify(newSettings));
    } catch (e) {}
    db.settings.put({ ...newSettings, id: 'main' }).catch(console.warn);
    if (currentUser) {
      saveStoreSettingsToFirestore({ ...newSettings, storeId: storeId || undefined }, storeId || undefined).catch(console.warn);
    }
    printerService.setDevicePath(newSettings.linuxDevicePath || '/dev/usb/lp0');
  };

  // 1. Initial boot: local database, hardware detection, connection test
  useEffect(() => {
    async function boot() {
      setIsLoading(true);
      await initializeDatabase();
      await refreshProductsLocal();
      await loadSettingsLocal();

      const env = printerService.getRuntimeEnv();
      setRuntimeEnv(env);

      // Cek port printer Linux /dev/usb/lp0
      const linuxInfo = await printerService.checkLinuxPrinter(settings.linuxDevicePath || '/dev/usb/lp0');
      if (env === 'tauri' || linuxInfo.exists) {
        setPrinterStatus({
          connected: linuxInfo.writable,
          type: 'tauri_raw',
          deviceName: `Linux ${settings.linuxDevicePath || '/dev/usb/lp0'} (28e9:0289)`,
          devicePath: settings.linuxDevicePath || '/dev/usb/lp0',
          linuxInfo
        });
      } else {
        setPrinterStatus(printerService.getStatus());
      }

      // Test firestore connection (non-blocking, only if user is signed in)
      if (currentUser) {
        validateFirestoreConnection().catch(console.warn);
      }

      setIsLoading(false);
    }
    boot();
  }, [refreshProductsLocal, loadSettingsLocal, settings.linuxDevicePath]);

  // 2. Real-time sync with Firebase Firestore for Products & Settings (active when authenticated)
  useEffect(() => {
    if (!currentUser) {
      refreshProductsLocal();
      loadSettingsLocal();
      return;
    }

    if (storeId) {
      setActiveStoreId(storeId);
    }

    // Sync products from Firestore (scoped by storeId, with safe Dexie caching)
    const unsubProducts = subscribeProducts(
      async (firestoreProducts) => {
        if (firestoreProducts && firestoreProducts.length > 0) {
          setProducts(firestoreProducts);
          // Mirror to local Dexie for offline cache
          try {
            await db.products.clear();
            await db.products.bulkAdd(firestoreProducts);
          } catch (e) {
            console.warn('Error mirroring products to Dexie:', e);
          }
        } else {
          // Keep the local cache available as a backup; uploading it is an explicit user action.
          try {
            const localProducts = await db.products.toArray();
            if (localProducts && localProducts.length > 0) {
              setProducts(localProducts);
            } else {
              // If both Firestore and local Dexie are truly empty:
              // For Owner, initialize INITIAL_PRODUCTS so the store has inventory!
              if (isOwner && storeId) {
                const seededList: Product[] = [];
                for (const initP of INITIAL_PRODUCTS) {
                  const pPayload: Product = {
                    ...initP,
                    storeId
                  };
                  const localId = await db.products.add(pPayload);
                  const firestoreId = await saveProductToFirestore({ ...pPayload, id: localId }, storeId);
                  seededList.push({ ...pPayload, id: localId, firestoreId });
                }
                setProducts(seededList);
              } else {
                setProducts([]);
              }
            }
          } catch (err) {
            console.warn('Error verifying local Dexie products:', err);
          }
        }
      },
      () => {
        // Fallback to local Dexie
        refreshProductsLocal();
      },
      storeId || undefined
    );

    // Sync store settings from Firestore
    const unsubSettings = subscribeStoreSettings(
      (firestoreSettings) => {
        if (firestoreSettings) {
          setSettings(firestoreSettings);
          printerService.setDevicePath(firestoreSettings.linuxDevicePath || '/dev/usb/lp0');
          db.settings.put({ ...firestoreSettings, id: 'main' }).catch(console.warn);
        }
      },
      () => {
        loadSettingsLocal();
      },
      storeId || undefined
    );

    return () => {
      unsubProducts();
      unsubSettings();
    };
  }, [currentUser, storeId, isOwner, isManager, refreshProductsLocal, loadSettingsLocal]);

  // When cashier completes a transaction
  const handleTransactionComplete = (tx: Transaction) => {
    const finalTx: Transaction = {
      ...tx,
      storeId: storeId || undefined,
      cashierId: currentUser?.uid || undefined
    };
    setCurrentReceiptTx(finalTx);
    setIsReceiptModalOpen(true);
  };

  // When user selects a past transaction to re-print
  const handleSelectTransactionToPrint = (tx: Transaction) => {
    setCurrentReceiptTx(tx);
    setIsReceiptModalOpen(true);
  };

  // Refresh data callback when import completes
  const handleDataImported = () => {
    refreshProductsLocal();
    loadSettingsLocal();
  };

  return (
    <div className={`box-border w-full max-w-full h-screen overflow-hidden ${theme} ${theme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'} flex flex-col font-sans`}>
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        printerStatus={printerStatus}
        onOpenPrinterModal={() => setActiveTab('printer')}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onOpenUsersModal={() => setIsUsersModalOpen(true)}
        currentUser={currentUser}
        userProfile={userProfile}
        runtimeEnv={runtimeEnv}
        settings={settings}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* Main Content Area */}
      <main className="box-border w-full max-w-full min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 sm:px-4 py-3 pb-16 md:pb-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
            <p className="text-sm text-slate-400 font-mono">Memuat KasirPro & Firebase Firestore...</p>
          </div>
        ) : (
          <>
            {activeTab === 'pos' && (
              <PosScreen
                products={products}
                settings={settings}
                onTransactionComplete={handleTransactionComplete}
                onRefreshProducts={refreshProductsLocal}
                storeId={storeId}
              />
            )}

            {activeTab === 'products' && (
              <RoleProtectedRoute allowedRoles={['owner', 'manager']} pageTitle="Manajemen Produk & Stok">
                <ProductManagement
                  products={products}
                  onRefreshProducts={refreshProductsLocal}
                  onOpenBackupModal={() => setIsBackupModalOpen(true)}
                  storeId={storeId}
                />
              </RoleProtectedRoute>
            )}

            {activeTab === 'transactions' && (
              <TransactionHistory
                settings={settings}
                onSelectTransactionToPrint={handleSelectTransactionToPrint}
                onOpenBackupModal={() => setIsBackupModalOpen(true)}
                storeId={storeId}
              />
            )}

            {activeTab === 'pembukuan' && (
              <Pembukuan
                settings={settings}
                storeId={storeId}
                runtimeEnv={runtimeEnv}
                onNavigateToPos={() => setActiveTab('pos')}
                onSelectTransactionToPrint={handleSelectTransactionToPrint}
              />
            )}

            {activeTab === 'strukscan' && (
              <StrukScanStudio
                settings={settings}
                printerStatus={printerStatus}
                storeId={storeId}
              />
            )}

            {activeTab === 'printer' && (
              <PrinterTester
                printerStatus={printerStatus}
                setPrinterStatus={setPrinterStatus}
                runtimeEnv={runtimeEnv}
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                storeId={storeId}
              />
            )}

            {activeTab === 'dashboard' && (
              <DashboardAnalytics
                settings={settings}
                storeId={storeId}
              />
            )}
          </>
        )}
      </main>

      {/* Realistic 58mm Thermal Receipt Dialog */}
      {currentReceiptTx && (
        <ReceiptModal
          transaction={currentReceiptTx}
          settings={settings}
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          onNewTransaction={() => {
            setIsReceiptModalOpen(false);
            setActiveTab('pos');
          }}
        />
      )}

      {/* Authentication / Login Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        userProfile={userProfile}
        onOpenUsersModal={() => setIsUsersModalOpen(true)}
      />

      {/* User Management Modal (Khusus Owner) */}
      <UserManagementModal
        isOpen={isUsersModalOpen}
        onClose={() => setIsUsersModalOpen(false)}
        currentUserProfile={userProfile}
      />

      {/* Store and Printer Settings Modal */}
      <SettingsModal
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        storeId={storeId}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
      />

      {/* Comprehensive Export & Import Modal */}
      <DataBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        products={products}
        settings={settings}
        storeId={storeId}
        role={role}
        onDataImported={handleDataImported}
      />
    </div>
  );
}
