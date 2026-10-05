import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { PosScreen } from './components/PosScreen';
import { ProductManagement } from './components/ProductManagement';
import { TransactionHistory } from './components/TransactionHistory';
import { PrinterTester } from './components/PrinterTester';
import { ReceiptModal } from './components/ReceiptModal';
import { Product, Transaction, StoreSettings, PrinterDeviceStatus } from './types';
import { db, initializeDatabase, DEFAULT_SETTINGS } from './db/db';
import { printerService } from './services/printerService';

export default function App() {
  const [activeTab, setActiveTab] = useState<'pos' | 'products' | 'transactions' | 'printer'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [printerStatus, setPrinterStatus] = useState<PrinterDeviceStatus>(printerService.getStatus());
  const [currentReceiptTx, setCurrentReceiptTx] = useState<Transaction | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [runtimeEnv, setRuntimeEnv] = useState<'tauri' | 'capacitor' | 'browser'>('browser');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load products & settings from Dexie.js IndexedDB
  const refreshProducts = useCallback(async () => {
    try {
      const list = await db.products.toArray();
      setProducts(list);
    } catch (err) {
      console.error('Failed to load products from Dexie:', err);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await db.settings.get('main');
      if (s) {
        setSettings(s);
      }
    } catch (err) {
      console.error('Failed to load settings from Dexie:', err);
    }
  }, []);

  useEffect(() => {
    async function boot() {
      setIsLoading(true);
      await initializeDatabase();
      await refreshProducts();
      await loadSettings();
      setRuntimeEnv(printerService.getRuntimeEnv());
      setPrinterStatus(printerService.getStatus());
      setIsLoading(false);
    }
    boot();
  }, [refreshProducts, loadSettings]);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        printerStatus={printerStatus}
        onOpenPrinterModal={() => setActiveTab('printer')}
        runtimeEnv={runtimeEnv}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16 md:pb-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
            <p className="text-sm text-slate-400 font-mono">Memuat Database Offline (Dexie.js)...</p>
          </div>
        ) : (
          <>
            {activeTab === 'pos' && (
              <PosScreen
                products={products}
                settings={settings}
                onTransactionComplete={handleTransactionComplete}
                onRefreshProducts={refreshProducts}
              />
            )}

            {activeTab === 'products' && (
              <ProductManagement
                products={products}
                onRefreshProducts={refreshProducts}
              />
            )}

            {activeTab === 'transactions' && (
              <TransactionHistory
                settings={settings}
                onSelectTransactionToPrint={handleSelectTransactionToPrint}
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
    </div>
  );
}
