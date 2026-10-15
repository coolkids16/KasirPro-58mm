import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CustomSelect } from './CustomSelect';
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
  Tag,
  Barcode,
  Camera,
  Sparkles
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
import { CameraBarcodeScannerModal } from './CameraBarcodeScannerModal';
import { sounds } from '../utils/audio';

interface ProductManagementProps {
  products: Product[];
  onRefreshProducts: () => void;
  onOpenBackupModal?: () => void;
  storeId?: string | null;
}

export const ProductManagement: React.FC<ProductManagementProps> = ({
  products,
  onRefreshProducts,
  onOpenBackupModal,
  storeId
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

  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  const executeDeleteCategory = async (cat: string) => {
    setIsProcessing(true);
    try {
      console.log('Starting delete category process for:', cat);
      
      // 1. Optimistic UI: remove from customCategories list immediately
      const updated = customCategories.filter(c => c !== cat);
      setCustomCategories(updated);
      try {
        localStorage.setItem('kasirpro_custom_categories', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save updated categories to localStorage:', e);
      }

      const productsWithThisCat = products.filter(p => p.category === cat);
      const hasProducts = productsWithThisCat.length > 0;

      // 2. Fast local update in Dexie first (instant local response)
      try {
        await db.products.where('category').equals(cat).modify({ category: 'Lainnya' });
        console.log('Dexie products successfully modified to category "Lainnya"');
      } catch (err) {
        console.warn('Dexie modify query failed, falling back to individual local updates:', err);
        if (hasProducts) {
          for (const p of productsWithThisCat) {
            if (p.id) {
              await db.products.update(p.id as any, { category: 'Lainnya' }).catch(console.warn);
            }
          }
        }
      }

      // 3. Parallelized Firestore updates so it doesn't get stuck or loop slowly
      if (hasProducts) {
        console.log(`Syncing ${productsWithThisCat.length} product category updates to Firestore in parallel...`);
        const promises = productsWithThisCat.map(async (p) => {
          const updatedProduct = { ...p, category: 'Lainnya' };
          return saveProductToFirestore(updatedProduct, storeId || undefined).catch(e => {
            console.warn(`Failed to update product ${p.name} in Firestore:`, e);
          });
        });
        await Promise.all(promises);
      }

      // 4. Reset selected category filter if the deleted category was currently active
      if (selectedCategory === cat) {
        setSelectedCategory('Semua');
      }

      // 5. Success notification
      showNotification(`Kategori "${cat}" berhasil dihapus!`);
      
      // Refresh parent state
      if (onRefreshProducts) {
        onRefreshProducts();
      }
    } catch (err: any) {
      console.error('Failed to execute delete category:', err);
      showNotification(`Gagal menghapus kategori: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsProcessing(false);
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
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [newCategoryModalInput, setNewCategoryModalInput] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

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

  // Modal / cost price states (Eceran vs Grosir/Dus vs Konversi Kg->Liter)
  const [modalInputType, setModalInputType] = useState<'eceran' | 'grosir' | 'konversi'>('eceran');
  const [formBuyPrice, setFormBuyPrice] = useState<number | string>('');
  const [formBoxPrice, setFormBoxPrice] = useState<number | string>('');
  const [formBoxQty, setFormBoxQty] = useState<number | string>('24');
  const [formSackPrice, setFormSackPrice] = useState<number | string>('');
  const [formSackWeight, setFormSackWeight] = useState<number | string>('50');
  const [formConversionFactor, setFormConversionFactor] = useState<number | string>('1.25');

  const parseCurrencyNumber = (val: string | number): number => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleaned = String(val).replace(/\./g, '').replace(/,/g, '');
    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const parseFloatNumber = (val: string | number): number => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const str = String(val).trim().replace(/,/g, '.');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const calculatedCostPrice = useMemo(() => {
    if (modalInputType === 'eceran') {
      return parseCurrencyNumber(formBuyPrice);
    } else if (modalInputType === 'grosir') {
      const boxP = parseCurrencyNumber(formBoxPrice);
      const boxQ = parseCurrencyNumber(formBoxQty) || 1;
      return boxQ > 0 ? parseFloat((boxP / boxQ).toFixed(2)) : 0;
    } else {
      const sackP = parseCurrencyNumber(formSackPrice);
      const weightKg = parseFloatNumber(formSackWeight);
      const factor = parseFloatNumber(formConversionFactor) || 1.25;
      const totalLiter = weightKg * factor;
      if (sackP > 0 && totalLiter > 0) {
        return parseFloat((sackP / totalLiter).toFixed(2));
      }
      if (editingProduct?.costPrice || editingProduct?.modal || editingProduct?.purchase_price) {
        return Number(editingProduct.costPrice || editingProduct.modal || editingProduct.purchase_price) || 0;
      }
      return 0;
    }
  }, [modalInputType, formBuyPrice, formBoxPrice, formBoxQty, formSackPrice, formSackWeight, formConversionFactor, editingProduct]);

  const calculatedConvertedStock = useMemo(() => {
    if (modalInputType === 'konversi') {
      const weightKg = parseFloatNumber(formSackWeight);
      const factor = parseFloatNumber(formConversionFactor) || 1;
      return Math.round((weightKg * factor) * 100) / 100;
    }
    return null;
  }, [modalInputType, formSackWeight, formConversionFactor]);

  useEffect(() => {
    if (modalInputType === 'konversi' && calculatedConvertedStock !== null) {
      setFormStock(String(calculatedConvertedStock));
    }
  }, [calculatedConvertedStock, modalInputType]);

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (formBarcode.trim()) {
        sounds.playScanBeep();
        showNotification(`✓ Barcode "${formBarcode.trim()}" terdeteksi dari pemindai fisik!`);
      }
    }
  };

  const handleGenerateRandomBarcode = () => {
    const randomEan = '899' + Math.floor(100000000 + Math.random() * 900000000).toString();
    setFormBarcode(randomEan);
    sounds.playScanBeep();
    showNotification(`Kode barcode EAN-13 acak dibuat: ${randomEan}`);
  };

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
    setModalInputType('eceran');
    setFormBuyPrice('');
    setFormBoxPrice('');
    setFormBoxQty('24');
    setFormSackPrice('');
    setFormSackWeight('50');
    setFormConversionFactor('1.25');
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

    const costVal = p.costPrice !== undefined 
      ? p.costPrice 
      : (p.modal !== undefined ? p.modal : (p.purchase_price !== undefined ? p.purchase_price : ''));

    if (p.unit === 'Liter') {
      setModalInputType('konversi');
      setFormSackWeight('25');
      setFormConversionFactor('1.25');
      if (costVal) {
        setFormSackPrice(Math.round(Number(costVal) * 31.25));
        setFormBuyPrice(costVal);
      } else {
        setFormSackPrice('');
        setFormBuyPrice('');
      }
    } else if (p.unit === 'Dus') {
      setModalInputType('grosir');
      setFormBoxQty('24');
      if (costVal) {
        setFormBoxPrice(Math.round(Number(costVal) * 24));
        setFormBuyPrice(costVal);
      } else {
        setFormBoxPrice('');
        setFormBuyPrice('');
      }
    } else {
      setModalInputType('eceran');
      setFormBuyPrice(costVal !== undefined && costVal !== null ? costVal : '');
      setFormBoxPrice('');
      setFormBoxQty('24');
      setFormSackPrice('');
      setFormSackWeight('50');
      setFormConversionFactor('1.25');
    }
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    // Use custom category if custom mode was selected
    const finalCategory = (isCustomCategory ? customCategoryInput.trim() : formCategory.trim()) || 'Makanan';
    saveCustomCategory(finalCategory);

    // Calculate explicit modalPerLiter with validation
    let modalPerLiter = 0;
    if (modalInputType === 'konversi') {
      const sackP = parseCurrencyNumber(formSackPrice);
      const weightKg = parseFloatNumber(formSackWeight);
      const factor = parseFloatNumber(formConversionFactor) || 1.25;
      const totalLiter = weightKg * factor;
      if (sackP > 0 && totalLiter > 0) {
        modalPerLiter = parseFloat((sackP / totalLiter).toFixed(2));
      } else if (editingProduct?.costPrice || editingProduct?.modal || editingProduct?.purchase_price) {
        modalPerLiter = Number(editingProduct.costPrice || editingProduct.modal || editingProduct.purchase_price) || 0;
      }
    } else if (modalInputType === 'grosir') {
      const boxP = parseCurrencyNumber(formBoxPrice);
      const boxQ = parseCurrencyNumber(formBoxQty) || 1;
      modalPerLiter = boxQ > 0 ? parseFloat((boxP / boxQ).toFixed(2)) : 0;
    } else {
      modalPerLiter = parseCurrencyNumber(formBuyPrice) || parseFloatNumber(formBuyPrice);
    }

    if (isNaN(modalPerLiter) || modalPerLiter < 0) {
      modalPerLiter = 0;
    }

    const finalStock = modalInputType === 'konversi' && calculatedConvertedStock !== null 
      ? calculatedConvertedStock 
      : parseFloatNumber(formStock);

    const finalUnit = modalInputType === 'konversi' 
      ? 'Liter' 
      : (modalInputType === 'grosir' ? 'Dus' : (editingProduct?.unit || 'Pcs'));

    const productPayload: Product = {
      storeId: storeId || undefined,
      name: formName.trim(),
      sku: formSku.trim(),
      category: finalCategory,
      price: parseCurrencyNumber(formPrice),
      stock: finalStock,
      costPrice: modalPerLiter,
      modal: modalPerLiter,
      purchase_price: modalPerLiter,
      unit: finalUnit,
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
        await saveProductToFirestore({ 
          ...productPayload, 
          id: editingProduct.id,
          firestoreId: editingProduct.firestoreId 
        }, storeId || undefined);
        showNotification(`Produk "${productPayload.name}" berhasil diperbarui di kategori "${finalCategory}"!`);
      } else {
        // 1. Add Dexie
        const newLocalId = await db.products.add(productPayload);
        // 2. Add Firestore
        const firestoreId = await saveProductToFirestore({ 
          ...productPayload, 
          id: newLocalId 
        }, storeId || undefined);
        if (firestoreId) {
          await db.products.update(newLocalId, { firestoreId });
        }
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
        productToDelete.firestoreId || productToDelete.id, 
        productToDelete.sku, 
        productToDelete.name,
        storeId || productToDelete.storeId
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
      await saveProductToFirestore({ 
        ...p, 
        stock: newStock, 
        storeId: storeId || p.storeId 
      }, storeId || p.storeId);
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
      await saveProductToFirestore({ 
        ...p, 
        stock: 0, 
        storeId: storeId || p.storeId 
      }, storeId || p.storeId);
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
      await clearAllStockInFirestore(storeId || undefined);

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
      await deleteAllProductsFromFirestore(storeId || undefined);

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
    <div className="w-full max-w-full mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Action Notification Toast (Fixed floating for guaranteed visibility anywhere on screen) */}
      {actionSuccessMsg && (
        <div className="fixed top-6 right-6 z-[100] max-w-sm p-4 bg-slate-900 border border-emerald-500/30 text-emerald-300 rounded-2xl text-xs flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 animate-bounce">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="font-bold text-white">Sukses</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{actionSuccessMsg}</p>
          </div>
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

          {/* Tombol Tambah Produk */}
          <button
            onClick={handleOpenAddModal}
            className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 transition"
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

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-4 pt-1 sm:pb-3 elegant-scrollbar">
          {categories.map(cat => {
            const isDeletable = cat !== 'Semua' && !['Makanan', 'Minuman', 'Snack', 'Paket', 'Lainnya'].includes(cat);
            return (
              <div 
                key={cat} 
                className={`flex items-center rounded-xl transition shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-emerald-500 border border-emerald-500/20 shadow-sm shadow-emerald-500/30 text-white'
                    : 'bg-slate-900 border border-slate-800 text-slate-400'
                }`}
              >
                <button
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-l-xl rounded-r-xl text-xs font-semibold whitespace-nowrap transition ${
                    isDeletable ? 'rounded-r-none pr-2.5' : ''
                  } ${
                    selectedCategory === cat ? 'text-white font-bold' : 'hover:text-white'
                  }`}
                >
                  {cat}
                </button>
                {isDeletable && (
                  <button
                    onClick={() => setCategoryToDelete(cat)}
                    title={`Hapus kategori "${cat}"`}
                    className={`p-1.5 rounded-r-xl transition shrink-0 self-stretch flex items-center justify-center border-l ${
                      selectedCategory === cat 
                        ? 'hover:bg-rose-600 text-emerald-200 hover:text-white border-emerald-400/40' 
                        : 'hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 border-slate-800'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}

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
        <div className="w-full overflow-x-auto">
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

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-emerald-400 text-sm">
                        Rp {formatRupiah(product.price)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Modal: Rp {formatRupiah(product.costPrice || (product as any).modal || (product as any).purchase_price || 0)}
                      </div>
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
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-3 sm:p-4 lg:p-6 space-y-4">
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

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
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
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-3 sm:p-4 lg:p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Hapus Produk Ini?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Produk <strong className="text-white">"{productToDelete.name}"</strong> (SKU: {productToDelete.sku}) akan dihapus permanen dari daftar kasir & database Cloud Firestore.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
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

      {/* CUSTOM IN-APP MODAL: CONFIRM HAPUS KATEGORI */}
      {categoryToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-3 sm:p-4 lg:p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Hapus Kategori Produk</h3>
                <p className="text-[11px] text-slate-400">Kategori: <span className="font-bold text-rose-400">"{categoryToDelete}"</span></p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus kategori ini? 
              {products.filter(p => p.category === categoryToDelete).length > 0 && (
                <span className="block mt-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-amber-300">
                  ⚠️ Ada <span className="font-bold">{products.filter(p => p.category === categoryToDelete).length} produk</span> yang menggunakan kategori ini. Produk tersebut akan otomatis dialihkan ke kategori <span className="font-bold text-white">"Lainnya"</span>.
                </span>
              )}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const cat = categoryToDelete;
                  setCategoryToDelete(null);
                  await executeDeleteCategory(cat);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-500/20"
              >
                Hapus Kategori
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP MODAL: HAPUS SEMUA STOK (PILIHAN KOSONGKAN STOK ATAU HAPUS SEMUA PRODUK) */}
      {isClearAllStockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-3 sm:p-4 lg:p-6 space-y-4">
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
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-3 sm:p-4 lg:p-6 relative">
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
                    <CustomSelect
                      value={formCategory}
                      onChange={val => {
                        if (val === '__add_new__') {
                          setIsCustomCategory(true);
                          setCustomCategoryInput('');
                        } else {
                          setFormCategory(val);
                        }
                      }}
                      options={[
                        ...availableCategories.map(cat => ({ label: cat, value: cat })),
                        { label: '+ Tambah Kategori Manual...', value: '__add_new__' }
                      ]}
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
                    step="any"
                    value={formStock}
                    onChange={e => setFormStock(e.target.value)}
                    placeholder="50"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* METODE INPUT MODAL: ECERAN VS GROSIR / PER DUS */}
              <div className="space-y-2 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-bold flex items-center gap-1.5">
                    <span>Metode Input Modal / Harga Beli</span>
                  </label>
                  <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 gap-0.5 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setModalInputType('eceran')}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition whitespace-nowrap ${
                        modalInputType === 'eceran' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Eceran
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalInputType('grosir')}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition whitespace-nowrap ${
                        modalInputType === 'grosir' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Grosir/Dus
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalInputType('konversi')}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition whitespace-nowrap ${
                        modalInputType === 'konversi' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Konversi Kg &rarr; Liter
                    </button>
                  </div>
                </div>

                {modalInputType === 'eceran' ? (
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Harga Beli / Modal per Satuan (Rp)</label>
                    <input
                      type="number"
                      min={0}
                      value={formBuyPrice}
                      onChange={e => setFormBuyPrice(e.target.value)}
                      placeholder="15000"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-750 rounded-xl text-emerald-400 font-bold font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                ) : modalInputType === 'grosir' ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">Harga Beli 1 Dus (Rp)</label>
                        <input
                          type="number"
                          min={0}
                          value={formBoxPrice}
                          onChange={e => setFormBoxPrice(e.target.value)}
                          placeholder="48000"
                          className="w-full px-3.5 py-2 bg-slate-900 border border-slate-750 rounded-xl text-emerald-400 font-bold font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">Isi per Dus (Pcs/Botol)</label>
                        <input
                          type="number"
                          min={1}
                          value={formBoxQty}
                          onChange={e => setFormBoxQty(e.target.value)}
                          placeholder="24"
                          className="w-full px-3.5 py-2 bg-slate-900 border border-slate-750 rounded-xl text-white font-bold font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs">
                      <span className="text-slate-300">Hasil Kalkulasi Modal per Pcs:</span>
                      <span className="font-mono font-extrabold text-emerald-400 text-sm">
                        Rp {formatRupiah(calculatedCostPrice)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-slate-400 mb-1 font-medium">Harga Beli 1 Karung (Rp)</label>
                      <input
                        type="number"
                        min={0}
                        value={formSackPrice}
                        onChange={e => setFormSackPrice(e.target.value)}
                        placeholder="600000"
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-750 rounded-xl text-emerald-400 font-bold font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">Berat Karung (Kg)</label>
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          value={formSackWeight}
                          onChange={e => setFormSackWeight(e.target.value)}
                          placeholder="50"
                          className="w-full px-3.5 py-2 bg-slate-900 border border-slate-750 rounded-xl text-white font-bold font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">Faktor Konversi (Liter/Kg)</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={formConversionFactor}
                          onChange={e => setFormConversionFactor(e.target.value)}
                          placeholder="1.25"
                          className="w-full px-3.5 py-2 bg-slate-900 border border-slate-750 rounded-xl text-white font-bold font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">Total Stok Konversi Liter:</span>
                        <span className="font-mono font-bold text-emerald-300">
                          {calculatedConvertedStock} Liter
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20">
                        <span className="text-slate-200 font-medium">Modal per Liter:</span>
                        <span className="font-mono font-extrabold text-emerald-400 text-sm">
                          Rp {formatRupiah(calculatedCostPrice)} / Liter
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* BARCODE INPUT DENGAN FISIK & KAMERA SCANNER */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Barcode className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Kode Barcode Produk</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Mendukung Scanner USB/BT & Kamera
                  </span>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={formBarcode}
                      onChange={e => setFormBarcode(e.target.value)}
                      onKeyDown={handleBarcodeKeyDown}
                      placeholder="Pindai dengan alat fisik / kamera..."
                      className="w-full pl-3 pr-8 py-2 bg-slate-950 border border-slate-750 focus:border-emerald-500 rounded-xl text-white font-mono text-xs focus:outline-none"
                    />
                    {formBarcode && (
                      <button
                        type="button"
                        onClick={() => setFormBarcode('')}
                        title="Hapus Barcode"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-rose-400 p-0.5 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Tombol Scan Kamera */}
                  <button
                    type="button"
                    onClick={() => setIsCameraScannerOpen(true)}
                    className="px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 shadow-sm"
                    title="Buka Kamera Android / HP untuk Pindai Barcode"
                  >
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span className="hidden sm:inline">Scan</span> Kamera
                  </button>

                  {/* Tombol Acak EAN-13 */}
                  <button
                    type="button"
                    onClick={handleGenerateRandomBarcode}
                    className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-medium flex items-center gap-1 transition shrink-0"
                    title="Buat Kode Barcode Acak (EAN-13)"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span className="sr-only sm:not-sr-only sm:inline-block text-[11px]">Acak</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  💡 Arahkan pemindai barcode USB/Bluetooth ke kolom di atas atau klik <strong>"Scan Kamera"</strong>.
                </p>
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

              <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-md shadow-emerald-500/20 transition"
                >
                  Simpan Produk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* CAMERA BARCODE SCANNER MODAL UNTUK FORM PRODUK */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        title="Pemindai Barcode Kamera"
        description="Arahkan kamera HP/Android ke barcode fisik produk untuk mengisi kolom secara otomatis"
        onScanCode={(scannedCode) => {
          setFormBarcode(scannedCode);
          showNotification(`✓ Barcode "${scannedCode}" berhasil dipindai dari kamera!`);
          setIsCameraScannerOpen(false);
          if (barcodeInputRef.current) {
            barcodeInputRef.current.focus();
          }
        }}
      />
    </div>
  );
};

export default ProductManagement;
