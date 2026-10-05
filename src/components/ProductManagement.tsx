import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Download, 
  Upload, 
  Check, 
  X, 
  AlertTriangle,
  Layers,
  CheckCircle2,
  AlertOctagon,
  Tag
} from 'lucide-react';
import { Product } from '../types';
import { db } from '../db/db';
import { 
  saveProductToFirestore, 
  deleteProductFromFirestore,
  clearAllStockInFirestore,
  deleteAllProductsFromFirestore
} from '../services/firebase';
import { formatRupiah } from '../utils/escpos';

interface ProductManagementProps {
  products: Product[];
  onRefreshProducts: () => void;
  onOpenBackupModal?: () => void;
}

export const ProductManagement: React.FC<ProductManagementProps> = ({
  products,
  onRefreshProducts,
  onOpenBackupModal
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Custom categories state (persisted in localStorage)
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kasirpro_custom_categories');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const saveCustomCategory = (newCat: string) => {
    const trimmed = newCat.trim();
    if (!trimmed) return;
    if (!customCategories.includes(trimmed)) {
      const updated = [...customCategories, trimmed];
      setCustomCategories(updated);
      try {
        localStorage.setItem('kasirpro_custom_categories', JSON.stringify(updated));
      } catch (e) {}
    }
  };

  // Base + product-derived + custom categories
  const availableCategories = useMemo(() => {
    const set = new Set<string>(['Makanan', 'Minuman', 'Snack', 'Paket', 'Lainnya']);
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    customCategories.forEach(c => set.add(c));
    return Array.from(set);
  }, [products, customCategories]);

  const categories = useMemo(() => {
    return ['Semua', ...availableCategories];
  }, [availableCategories]);

  // In-app modal states
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isClearAllStockModalOpen, setIsClearAllStockModalOpen] = useState(false);
  const [isNewCategoryModalOpen, setIsNewCategoryModalOpen] = useState(false);
  const [newCategoryModalInput, setNewCategoryModalInput] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form States for Add/Edit Product
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formPrice, setFormPrice] = useState<number | string>('');
  const [formStock, setFormStock] = useState<number | string>('');
  const [formCategory, setFormCategory] = useState('Makanan');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formColor, setFormColor] = useState('#10B981');

  const filteredProducts = products.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search));
    const matchesCategory = selectedCategory === 'Semua' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const showNotification = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormSku(`PRD-${Math.floor(100 + Math.random() * 900)}`);
    setFormPrice('');
    setFormStock('20');
    setFormCategory('Makanan');
    setIsCustomCategory(false);
    setCustomCategoryInput('');
    setFormBarcode('');
    setFormColor('#10B981');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormSku(p.sku);
    setFormPrice(p.price);
    setFormStock(p.stock);
    setFormCategory(p.category || 'Makanan');
    setIsCustomCategory(false);
    setCustomCategoryInput('');
    setFormBarcode(p.barcode || '');
    setFormColor(p.color || '#10B981');
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    // Use custom category if custom mode was selected
    const finalCategory = (isCustomCategory ? customCategoryInput.trim() : formCategory.trim()) || 'Makanan';
    saveCustomCategory(finalCategory);

    const productPayload: Product = {
      name: formName.trim(),
      sku: formSku.trim(),
      category: finalCategory,
      price: Number(formPrice) || 0,
      stock: Number(formStock) || 0,
      barcode: formBarcode.trim() || undefined,
      color: formColor
    };

    try {
      if (editingProduct?.id) {
        // 1. Update Dexie
        try {
          await db.products.update(editingProduct.id as any, productPayload);
        } catch (e) {
          const localItem = await db.products.where('sku').equals(editingProduct.sku).first();
          if (localItem?.id) {
            await db.products.update(localItem.id, productPayload);
          }
        }
        // 2. Update Firestore
        await saveProductToFirestore({ ...productPayload, id: editingProduct.id });
        showNotification(`Produk "${productPayload.name}" berhasil diperbarui di kategori "${finalCategory}"!`);
      } else {
        // 1. Add Dexie
        const newLocalId = await db.products.add(productPayload);
        // 2. Add Firestore
        await saveProductToFirestore({ ...productPayload, id: newLocalId });
        showNotification(`Produk baru "${productPayload.name}" berhasil ditambahkan di kategori "${finalCategory}"!`);
      }
    } catch (err) {
      console.warn('Sync to firestore/local error:', err);
    }

    setIsModalOpen(false);
    onRefreshProducts();
  };

  // Quick Category Addition from toolbar
  const handleCreateCategoryFromToolbar = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryModalInput.trim();
    if (!trimmed) return;

    saveCustomCategory(trimmed);
    setSelectedCategory(trimmed);
    showNotification(`Kategori baru "${trimmed}" berhasil ditambahkan!`);
    setNewCategoryModalInput('');
    setIsNewCategoryModalOpen(false);
  };

  // Safe In-App Delete Handler: Deletes from both Dexie and Firebase Firestore
  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    setIsProcessing(true);

    try {
      // 1. Delete from Dexie Local DB
      if (productToDelete.id) {
        try {
          await db.products.delete(productToDelete.id as any);
        } catch (e) {}
      }
      if (productToDelete.sku) {
        try {
          await db.products.where('sku').equals(productToDelete.sku).delete();
        } catch (e) {}
      }

      // 2. Delete from Firebase Firestore (guaranteed by ID, SKU, and Name)
      await deleteProductFromFirestore(
        productToDelete.id, 
        productToDelete.sku, 
        productToDelete.name
      );

      showNotification(`Produk "${productToDelete.name}" telah dihapus permanen dari sistem & Cloud Firestore.`);
    } catch (err: any) {
      console.error('Failed to delete product from Firestore:', err);
      showNotification(`Produk dihapus secara lokal (${err.message || 'Firestore offline'}).`);
    } finally {
      setIsProcessing(false);
      setProductToDelete(null);
      onRefreshProducts();
    }
  };

  // Quick Stock Modifier (+ / -)
  const handleQuickStock = async (p: Product, delta: number) => {
    const newStock = Math.max(0, p.stock + delta);
    try {
      if (p.id) {
        try { await db.products.update(p.id as any, { stock: newStock }); } catch (e) {}
      }
      if (p.sku) {
        const match = await db.products.where('sku').equals(p.sku).first();
        if (match?.id) {
          await db.products.update(match.id, { stock: newStock });
        }
      }
      await saveProductToFirestore({ ...p, stock: newStock });
    } catch (err) {
      // offline fallback
    }
    onRefreshProducts();
  };

  // Clear / Zero out individual product stock
  const handleClearStock = async (p: Product) => {
    try {
      if (p.id) {
        try { await db.products.update(p.id as any, { stock: 0 }); } catch (e) {}
      }
      if (p.sku) {
        const match = await db.products.where('sku').equals(p.sku).first();
        if (match?.id) {
          await db.products.update(match.id, { stock: 0 });
        }
      }
      await saveProductToFirestore({ ...p, stock: 0 });
      showNotification(`Stok produk "${p.name}" telah dikosongkan (0) di sistem & Firestore.`);
    } catch (err) {
      // offline fallback
    }
    onRefreshProducts();
  };

  // Option 1: Kosongkan SEMUA Stok Jadi 0 (Katalog tetap ada)
  const handleZeroOutAllStock = async () => {
    setIsProcessing(true);
    try {
      // 1. Update Dexie
      for (const p of products) {
        if (p.id) {
          try { await db.products.update(p.id as any, { stock: 0 }); } catch (e) {}
        }
      }
      // 2. Update Firestore
      await clearAllStockInFirestore();

      showNotification('Semua stok produk telah dikosongkan (0) di sistem & Cloud Firestore.');
    } catch (err: any) {
      console.error(err);
      showNotification('Stok produk dikosongkan secara lokal.');
    } finally {
      setIsProcessing(false);
      setIsClearAllStockModalOpen(false);
      onRefreshProducts();
    }
  };

  // Option 2: Hapus BERSIH Seluruh Produk & Stok Total
  const handleDeleteAllProductsAndStock = async () => {
    setIsProcessing(true);
    try {
      // 1. Clear Dexie
      await db.products.clear();

      // 2. Clear Firestore
      await deleteAllProductsFromFirestore();

      showNotification('Seluruh produk dan stok telah dihapus bersih dari sistem & Cloud Firestore.');
    } catch (err: any) {
      console.error(err);
      showNotification('Produk dihapus secara lokal.');
    } finally {
      setIsProcessing(false);
      setIsClearAllStockModalOpen(false);
      onRefreshProducts();
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Action Notification Toast */}
      {actionSuccessMsg && (
        <div className="p-3.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-400" />
            Manajemen Produk & Stok
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Sinkronisasi otomatis ke Firebase Firestore & cache lokal offline (Dexie.js).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Tombol Hapus Semua Stok (Menggantikan Reset) */}
          <button
            onClick={() => setIsClearAllStockModalOpen(true)}
            className="px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-850 hover:border-rose-750 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            title="Hapus atau kosongkan semua stok produk di katalog dan Firestore"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Hapus Semua Stok
          </button>

          {/* Tombol Ekspor & Impor */}
          {onOpenBackupModal && (
            <button
              onClick={onOpenBackupModal}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-slate-750 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
              title="Buka Pusat Ekspor & Impor Data (JSON / CSV)"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              Ekspor & Impor
            </button>
          )}

          {/* Tombol Tambah Produk */}
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            Tambah Produk
          </button>
        </div>
      </div>

      {/* Search & Category Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama, SKU, atau barcode..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-emerald-500 text-white font-bold shadow-sm shadow-emerald-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}

          {/* Tombol Tambah Kategori Manual di Toolbar */}
          <button
            onClick={() => {
              setNewCategoryModalInput('');
              setIsNewCategoryModalOpen(true);
            }}
            title="Tambah kategori produk baru"
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap bg-slate-900 hover:bg-emerald-950/60 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-500 flex items-center gap-1 transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Kategori Baru</span>
          </button>
        </div>
      </div>

      {/* Products Table Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Nama Produk</th>
                <th className="py-3.5 px-4">SKU / Barcode</th>
                <th className="py-3.5 px-4">Kategori</th>
                <th className="py-3.5 px-4">Harga Jual</th>
                <th className="py-3.5 px-4 text-center">Kelola Stok</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredProducts.map(product => {
                const isLow = product.stock <= 5 && product.stock > 0;
                const isOut = product.stock === 0;

                return (
                  <tr key={String(product.id || product.sku)} className="hover:bg-slate-850/50 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <span 
                          className="w-3 h-3 rounded-full shrink-0" 
                          style={{ backgroundColor: product.color || '#10B981' }}
                        />
                        <div className="font-semibold text-white text-sm">
                          {product.name}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      <div>{product.sku}</div>
                      {product.barcode && (
                        <div className="text-[10px] text-slate-500">{product.barcode}</div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md text-[11px] font-medium">
                        {product.category}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-bold text-emerald-400 text-sm">
                      Rp {formatRupiah(product.price)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <button
                          onClick={() => handleQuickStock(product, -1)}
                          disabled={product.stock <= 0}
                          title="Kurangi stok (-1)"
                          className="w-6 h-6 rounded-lg bg-slate-850 hover:bg-slate-750 text-slate-300 flex items-center justify-center font-bold text-xs disabled:opacity-30 transition"
                        >
                          -
                        </button>
                        <span className={`min-w-8 font-mono font-bold text-center text-xs px-1 ${
                          isOut ? 'text-rose-400 font-extrabold' : isLow ? 'text-amber-400 font-extrabold' : 'text-slate-200'
                        }`}>
                          {product.stock}
                        </span>
                        <button
                          onClick={() => handleQuickStock(product, 1)}
                          title="Tambah stok (+1)"
                          className="w-6 h-6 rounded-lg bg-slate-850 hover:bg-slate-750 text-slate-300 flex items-center justify-center font-bold text-xs transition"
                        >
                          +
                        </button>
                        <button
                          onClick={() => handleClearStock(product)}
                          title="Kosongkan stok produk ini (0)"
                          className="text-[10px] px-1.5 py-0.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                        >
                          Nol
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(product)}
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition"
                          title="Edit Produk & Stok"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setProductToDelete(product)}
                          className="p-2 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl transition shadow-sm"
                          title="Hapus Produk Ini dari Sistem & Firestore"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    Tidak ada produk yang tersimpan di kategori "{selectedCategory}". Klik "+ Tambah Produk" atau buka menu "Ekspor & Impor".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: TAMBAH KATEGORI BARU CEPAT DARI TOOLBAR */}
      {isNewCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">Tambah Kategori Baru</h3>
              </div>
              <button
                onClick={() => setIsNewCategoryModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCategoryFromToolbar} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Nama Kategori</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newCategoryModalInput}
                  onChange={e => setNewCategoryModalInput(e.target.value)}
                  placeholder="Contoh: Sembako, ATK, Rokok, Obat..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-750 rounded-xl text-white font-semibold focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Kategori akan otomatis muncul di filter produk dan menu kasir.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewCategoryModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Simpan Kategori
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL: DELETE INDIVIDUAL PRODUCT */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Hapus Produk Ini?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Produk <strong className="text-white">"{productToDelete.name}"</strong> (SKU: {productToDelete.sku}) akan dihapus permanen dari daftar kasir & database Cloud Firestore.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setProductToDelete(null)}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={confirmDeleteProduct}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isProcessing ? 'Menghapus...' : 'Hapus Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP MODAL: HAPUS SEMUA STOK (PILIHAN KOSONGKAN STOK ATAU HAPUS SEMUA PRODUK) */}
      {isClearAllStockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Hapus / Kosongkan Stok</h3>
                  <p className="text-xs text-slate-400">Pilih tindakan untuk katalog produk dan Firestore</p>
                </div>
              </div>
              <button
                onClick={() => setIsClearAllStockModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Option 1: Kosongkan Semua Stok (0) */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="font-bold text-white text-sm flex items-center justify-between">
                  <span>Pilihan 1: Kosongkan Stok (Jadikan 0)</span>
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono">
                    Produk Tetap Ada
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Semua {products.length} produk tetap tersimpan di katalog kasir, namun nilai sisa stok masing-masing diatur menjadi <strong>0</strong> di database lokal dan Cloud Firestore.
                </p>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleZeroOutAllStock}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isProcessing ? 'Memproses...' : 'Kosongkan Semua Stok Jadi 0'}
                </button>
              </div>

              {/* Option 2: Hapus Bersih Semua Produk & Stok */}
              <div className="p-3.5 bg-slate-950 border border-rose-500/30 rounded-xl space-y-2">
                <div className="font-bold text-white text-sm flex items-center justify-between">
                  <span>Pilihan 2: Hapus Bersih Seluruh Produk</span>
                  <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full font-mono">
                    Hapus Total
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Menghapus <strong>seluruh {products.length} produk dan stok secara permanen</strong> dari sistem kasir dan koleksi <code className="text-rose-400 font-mono">/products</code> di Cloud Firestore.
                </p>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleDeleteAllProductsAndStock}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isProcessing ? 'Menghapus Semua...' : 'Hapus Seluruh Produk & Stok Total'}
                </button>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setIsClearAllStockModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT PRODUCT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-6 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-400" />
              {editingProduct ? 'Edit Produk & Stok' : 'Tambah Produk Baru'}
            </h3>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Nama Produk</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Contoh: Kopi Susu Gula Aren"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">SKU / Kode</label>
                  <input
                    type="text"
                    required
                    value={formSku}
                    onChange={e => setFormSku(e.target.value)}
                    placeholder="KOP-001"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* KATEGORI DENGAN DUKUNGAN MANUAL INPUT */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-400 font-medium">Kategori</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomCategory(!isCustomCategory);
                        if (!isCustomCategory) {
                          setCustomCategoryInput('');
                        }
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5 transition"
                    >
                      {isCustomCategory ? '← Pilih Daftar' : '+ Ketik Baru'}
                    </button>
                  </div>

                  {isCustomCategory ? (
                    <input
                      type="text"
                      required
                      autoFocus
                      value={customCategoryInput}
                      onChange={e => {
                        setCustomCategoryInput(e.target.value);
                        setFormCategory(e.target.value);
                      }}
                      placeholder="Nama kategori baru..."
                      className="w-full px-3 py-2 bg-slate-950 border border-emerald-500 rounded-xl text-white font-semibold focus:outline-none"
                    />
                  ) : (
                    <select
                      value={formCategory}
                      onChange={e => {
                        if (e.target.value === '__add_new__') {
                          setIsCustomCategory(true);
                          setCustomCategoryInput('');
                        } else {
                          setFormCategory(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    >
                      {availableCategories.map(cat => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__add_new__" className="text-emerald-400 font-bold bg-slate-900">
                        + Tambah Kategori Manual...
                      </option>
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Harga Jual (Rp)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formPrice}
                    onChange={e => setFormPrice(e.target.value)}
                    placeholder="18000"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-emerald-400 font-bold font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Jumlah Stok</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formStock}
                    onChange={e => setFormStock(e.target.value)}
                    placeholder="50"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Barcode (Opsional)</label>
                <input
                  type="text"
                  value={formBarcode}
                  onChange={e => setFormBarcode(e.target.value)}
                  placeholder="8991234567890"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Warna Label</label>
                <div className="flex items-center gap-2">
                  {['#10B981', '#059669', '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B', '#64748B'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition ${
                        formColor === c ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-md shadow-emerald-500/20 transition"
                >
                  Simpan Produk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManagement;
