import React, { useState, useEffect, useCallback } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { Navbar } from './components/Navbar';
import { PosScreen } from './components/PosScreen';
import { ProductManagement } from './components/ProductManagement';
import { TransactionHistory } from './components/TransactionHistory';
import { PrinterTester } from './components/PrinterTester';
import { ReceiptModal } from './components/ReceiptModal';
import { AuthModal } from './components/AuthModal';
import { SettingsModal } from './components/SettingsModal';
import { DataBackupModal } from './components/DataBackupModal';
import { Product, Transaction, StoreSettings, PrinterDeviceStatus } from './types';
import { db, initializeDatabase, DEFAULT_SETTINGS } from './db/db';
import { printerService } from './services/printerService';
import { 
  subscribeToAuthState, 
  subscribeProducts, 
  subscribeStoreSettings, 
  saveStoreSettingsToFirestore,
  validateFirestoreConnection,
  seedProductsIfEmpty 
} from './services/firebase';

export default function App() {
  const [activeTab, setActiveTab] = useState<'pos' | 'products' | 'transactions' | 'printer'>('pos');
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
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [runtimeEnv, setRuntimeEnv] = useState<'tauri' | 'capacitor' | 'browser'>('browser');
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
      saveStoreSettingsToFirestore(newSettings).catch(console.warn);
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

      // Test firestore connection
      await validateFirestoreConnection();

      setIsLoading(false);
    }
    boot();
  }, [refreshProductsLocal, loadSettingsLocal, settings.linuxDevicePath]);

  // 2. Listen to Firebase Authentication State
  useEffect(() => {
    const unsubscribeAuth = subscribeToAuthState(async (user) => {
      setCurrentUser(user);
      if (user) {
        // When authenticated, check if products in Firestore exist, otherwise seed
        try {
          await seedProductsIfEmpty();
        } catch (e) {
          // offline or permission
        }

        // Also ensure current local store settings are saved to Firestore
        try {
          const currentSettings = await db.settings.get('main');
          if (currentSettings) {
            await saveStoreSettingsToFirestore(currentSettings);
          } else {
            const local = localStorage.getItem('kasirpro_settings');
            if (local) {
              await saveStoreSettingsToFirestore(JSON.parse(local));
            }
          }
        } catch (e) {
          // ignore
        }
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // 3. Real-time sync with Firebase Firestore for Products & Settings (active when authenticated)
  useEffect(() => {
    if (!currentUser) {
      refreshProductsLocal();
      loadSettingsLocal();
      return;
    }

    // Sync products from Firestore
    const unsubProducts = subscribeProducts(
      (firestoreProducts) => {
        setProducts(firestoreProducts || []);
        // Mirror to Dexie for offline cache
        db.products.clear().then(() => {
          if (firestoreProducts && firestoreProducts.length > 0) {
            db.products.bulkAdd(firestoreProducts);
          }
        }).catch(console.warn);
      },
      () => {
        // Fallback to local Dexie
        refreshProductsLocal();
      }
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
      }
    );

    return () => {
      unsubProducts();
      unsubSettings();
    };
  }, [currentUser, refreshProductsLocal, loadSettingsLocal]);

  // When cashier completes a transaction
  const handleTransactionComplete = (tx: Transaction) => {
    setCurrentReceiptTx(tx);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        printerStatus={printerStatus}
        onOpenPrinterModal={() => setActiveTab('printer')}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        currentUser={currentUser}
        runtimeEnv={runtimeEnv}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16 md:pb-6">
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
              />
            )}

            {activeTab === 'products' && (
              <ProductManagement
                products={products}
                onRefreshProducts={refreshProductsLocal}
                onOpenBackupModal={() => setIsBackupModalOpen(true)}
              />
            )}

            {activeTab === 'transactions' && (
              <TransactionHistory
                settings={settings}
                onSelectTransactionToPrint={handleSelectTransactionToPrint}
                onOpenBackupModal={() => setIsBackupModalOpen(true)}
              />
            )}

            {activeTab === 'printer' && (
              <PrinterTester
                printerStatus={printerStatus}
                setPrinterStatus={setPrinterStatus}
                runtimeEnv={runtimeEnv}
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
      />

      {/* Store and Printer Settings Modal */}
      <SettingsModal
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
      />

      {/* Comprehensive Export & Import Modal */}
      <DataBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        products={products}
        settings={settings}
        onDataImported={handleDataImported}
      />
    </div>
  );
}
