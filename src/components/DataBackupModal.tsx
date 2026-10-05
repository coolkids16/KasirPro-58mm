import React, { useState, useRef } from 'react';
import { 
  Download, 
  Upload, 
  Database, 
  FileSpreadsheet, 
  FileCode, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Layers, 
  Archive, 
  Receipt, 
  Package, 
  RotateCcw,
  CloudCheck,
  HardDrive
} from 'lucide-react';
import { Product, Transaction, StoreSettings } from '../types';
import { db } from '../db/db';
import { 
  batchSaveProductsToFirestore, 
  batchSaveTransactionsToFirestore, 
  saveStoreSettingsToFirestore 
} from '../services/firebase';
import { 
  exportFullBackupJson, 
  exportProductsJson, 
  exportTransactionsJson, 
  exportProductsCsv, 
  exportTransactionsCsv,
  parseProductsCsv,
  FullBackupData 
} from '../utils/exportImport';

export interface DataBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: StoreSettings;
  onDataImported: () => void;
}

export const DataBackupModal: React.FC<DataBackupModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  onDataImported
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<{
    type: 'full_backup' | 'products' | 'transactions';
    productsCount: number;
    transactionsCount: number;
    hasSettings: boolean;
    rawProducts?: Product[];
    rawTransactions?: Transaction[];
    rawSettings?: StoreSettings;
  } | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  // Load all transactions for export
  React.useEffect(() => {
    if (isOpen) {
      db.transactions.reverse().toArray().then(txs => {
        setAllTransactions(txs);
      }).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatusMessage(null);
    setParsedData(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const text = await file.text();
    const fileName = file.name.toLowerCase();

    try {
      if (fileName.endsWith('.json')) {
        const json = JSON.parse(text);

        // Case 1: Full Backup
        if (json.version && (json.products || json.transactions)) {
          setParsedData({
            type: 'full_backup',
            productsCount: json.products?.length || 0,
            transactionsCount: json.transactions?.length || 0,
            hasSettings: Boolean(json.storeSettings),
            rawProducts: json.products || [],
            rawTransactions: json.transactions || [],
            rawSettings: json.storeSettings
          });
        }
        // Case 2: Array of products
        else if (Array.isArray(json) && json.length > 0 && ('price' in json[0] || 'sku' in json[0])) {
          setParsedData({
            type: 'products',
            productsCount: json.length,
            transactionsCount: 0,
            hasSettings: false,
            rawProducts: json
          });
        }
        // Case 3: Array of transactions
        else if (Array.isArray(json) && json.length > 0 && ('invoiceNumber' in json[0] || 'paidAmount' in json[0])) {
          setParsedData({
            type: 'transactions',
            productsCount: 0,
            transactionsCount: json.length,
            hasSettings: false,
            rawTransactions: json
          });
        } else {
          setStatusMessage({
            type: 'error',
            text: 'Format JSON tidak dikenali. Pastikan file berasal dari ekspor KasirPro.'
          });
        }
      } else if (fileName.endsWith('.csv')) {
        const parsedProducts = parseProductsCsv(text);
        if (parsedProducts.length > 0) {
          setParsedData({
            type: 'products',
            productsCount: parsedProducts.length,
            transactionsCount: 0,
            hasSettings: false,
            rawProducts: parsedProducts
          });
        } else {
          setStatusMessage({
            type: 'error',
            text: 'File CSV tidak berisi kolom produk yang valid (SKU, Nama Produk, Harga, Stok).'
          });
        }
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Harap pilih file dengan ekstensi .json atau .csv.'
        });
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: 'Gagal membaca file: ' + (err.message || 'File rusak')
      });
    }
  };

  const handleExecuteImport = async () => {
    if (!parsedData) return;
    setIsProcessing(true);
    setStatusMessage(null);

    try {
      let importedProductsCount = 0;
      let importedTxsCount = 0;

      // 1. Process Products
      if (parsedData.rawProducts && parsedData.rawProducts.length > 0) {
        if (importMode === 'replace') {
          await db.products.clear();
        }

        // Save to Dexie
        for (const p of parsedData.rawProducts) {
          const existing = await db.products.where('sku').equals(p.sku).first();
          if (existing?.id) {
            await db.products.update(existing.id, p);
          } else {
            await db.products.add(p);
          }
        }

        // Save to Firestore
        await batchSaveProductsToFirestore(parsedData.rawProducts);
        importedProductsCount = parsedData.rawProducts.length;
      }

      // 2. Process Transactions
      if (parsedData.rawTransactions && parsedData.rawTransactions.length > 0) {
        if (importMode === 'replace') {
          await db.transactions.clear();
        }

        // Save to Dexie
        for (const t of parsedData.rawTransactions) {
          const existing = await db.transactions.where('invoiceNumber').equals(t.invoiceNumber).first();
          if (!existing) {
            await db.transactions.add(t);
          }
        }

        // Save to Firestore
        await batchSaveTransactionsToFirestore(parsedData.rawTransactions);
        importedTxsCount = parsedData.rawTransactions.length;
      }

      // 3. Process Settings if available
      if (parsedData.rawSettings) {
        await db.settings.put({ ...parsedData.rawSettings, id: 'main' });
        await saveStoreSettingsToFirestore(parsedData.rawSettings);
      }

      setStatusMessage({
        type: 'success',
        text: `Berhasil mengimpor ${importedProductsCount} produk dan ${importedTxsCount} transaksi ke sistem lokal dan Cloud Firestore!`
      });

      // Clear file selection
      setSelectedFile(null);
      setParsedData(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      onDataImported();
    } catch (err: any) {
      console.error('Import execution error:', err);
      setStatusMessage({
        type: 'error',
        text: 'Terjadi kesalahan saat mengimpor: ' + (err.message || 'Error')
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-6">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Pusat Ekspor & Impor Data</h3>
              <p className="text-xs text-slate-400">Cadangkan atau pulihkan Produk, Stok, dan Riwayat Penjualan</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950/60 px-5 gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('export');
              setStatusMessage(null);
            }}
            className={`py-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === 'export'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Download className="w-4 h-4" />
            Ekspor Data (Backup)
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('import');
              setStatusMessage(null);
            }}
            className={`py-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === 'import'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4" />
            Impor Data (Restore)
          </button>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div className={`m-5 p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/70 border-rose-500/40 text-rose-300'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* TAB 1: EKSPOR DATA */}
        {activeTab === 'export' && (
          <div className="p-6 space-y-5 text-xs">
            {/* Option 1: Full Unified Backup */}
            <div className="p-4 bg-gradient-to-r from-emerald-950/50 via-slate-950 to-slate-950 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Cadangan Penuh (Full Backup JSON)</h4>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Menyimpan semua {products.length} produk & stok, {allTransactions.length} transaksi riwayat, dan profil toko dalam 1 file.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  exportFullBackupJson(products, allTransactions, settings);
                  setStatusMessage({
                    type: 'success',
                    text: 'File Cadangan Penuh (JSON) berhasil diunduh!'
                  });
                }}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 shrink-0 transition"
              >
                <Download className="w-4 h-4" />
                Unduh Cadangan Penuh
              </button>
            </div>

            {/* Option 2: Products & Stock Export */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 font-bold text-white text-sm">
                  <Package className="w-4 h-4 text-cyan-400" />
                  Ekspor Produk & Stok ({products.length} Item)
                </div>
                <span className="text-[11px] text-slate-400 font-mono">Katalog Aktif</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Unduh daftar harga, SKU, barcode, dan kuantitas sisa stok produk.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    exportProductsCsv(products);
                    setStatusMessage({ type: 'success', text: 'Katalog Produk (CSV Excel) berhasil diunduh!' });
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium flex items-center gap-1.5 transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  Format CSV (Excel)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    exportProductsJson(products);
                    setStatusMessage({ type: 'success', text: 'Katalog Produk (JSON) berhasil diunduh!' });
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium flex items-center gap-1.5 transition"
                >
                  <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                  Format JSON
                </button>
              </div>
            </div>

            {/* Option 3: Sales History Export */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 font-bold text-white text-sm">
                  <Receipt className="w-4 h-4 text-indigo-400" />
                  Ekspor Riwayat Penjualan ({allTransactions.length} Transaksi)
                </div>
                <span className="text-[11px] text-slate-400 font-mono">Buku Kasir</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Unduh rekap penjualan untuk pembukuan akuntansi toko lengkap dengan nomor invoice, tanggal, rincian item, dan total omzet.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    exportTransactionsCsv(allTransactions);
                    setStatusMessage({ type: 'success', text: 'Riwayat Penjualan (CSV Excel) berhasil diunduh!' });
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium flex items-center gap-1.5 transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  Format Laporan CSV (Excel)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    exportTransactionsJson(allTransactions);
                    setStatusMessage({ type: 'success', text: 'Riwayat Penjualan (JSON) berhasil diunduh!' });
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium flex items-center gap-1.5 transition"
                >
                  <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                  Format JSON
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: IMPOR DATA */}
        {activeTab === 'import' && (
          <div className="p-6 space-y-5 text-xs">
            {/* File Dropzone Area */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 bg-slate-950 p-6 rounded-2xl text-center cursor-pointer transition space-y-2 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-slate-850 group-hover:bg-emerald-500/20 text-slate-400 group-hover:text-emerald-400 flex items-center justify-center mx-auto transition">
                <Upload className="w-6 h-6" />
              </div>

              <div className="font-bold text-white text-sm">
                {selectedFile ? selectedFile.name : 'Pilih atau Seret File Cadangan ke Sini'}
              </div>
              <p className="text-slate-400 text-[11px]">
                Mendukung file Cadangan JSON KasirPro atau file Excel Produk (.CSV)
              </p>
            </div>

            {/* Parsed File Preview Card */}
            {parsedData && (
              <div className="p-4 bg-slate-950 border border-emerald-500/30 rounded-2xl space-y-3">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Data Siap Diimpor
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block">Katalog Produk:</span>
                    <strong className="text-emerald-400 font-mono text-sm">{parsedData.productsCount} Item</strong>
                  </div>

                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block">Riwayat Transaksi:</span>
                    <strong className="text-cyan-400 font-mono text-sm">{parsedData.transactionsCount} Struk</strong>
                  </div>

                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block">Profil Toko:</span>
                    <strong className="text-white font-mono text-sm">{parsedData.hasSettings ? 'Tersedia' : '-'}</strong>
                  </div>
                </div>

                {/* Import Mode: Merge vs Replace */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <label className="block text-slate-300 font-semibold">Mode Penggabungan:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setImportMode('merge')}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        importMode === 'merge'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                          : 'border-slate-800 bg-slate-900 text-slate-400'
                      }`}
                    >
                      <div className="font-bold text-white">Gabungkan (Merge)</div>
                      <div className="text-[10px] text-slate-400">Tambahkan & perbarui data tanpa menghapus yang ada</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setImportMode('replace')}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        importMode === 'replace'
                          ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                          : 'border-slate-800 bg-slate-900 text-slate-400'
                      }`}
                    >
                      <div className="font-bold text-white">Timpa Semua (Replace)</div>
                      <div className="text-[10px] text-slate-400">Ganti seluruh data saat ini dengan data dari file cadangan</div>
                    </button>
                  </div>
                </div>

                {/* Confirm Import Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleExecuteImport}
                    className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition"
                  >
                    <Upload className="w-4 h-4" />
                    {isProcessing ? 'Sedang Memproses Sinkronisasi...' : 'Mulai Impor ke Sistem & Firestore'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <CloudCheck className="w-4 h-4 text-cyan-400" />
            <span>Otomatis sinkron ke Cloud Firestore & Dexie IndexedDB</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataBackupModal;
