import React, { useState } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  RotateCcw, 
  Download, 
  Upload, 
  Check, 
  X,
  AlertTriangle
} from 'lucide-react';
import { Product } from '../types';
import { db, INITIAL_PRODUCTS } from '../db/db';
import { formatRupiah } from '../utils/escpos';

interface ProductManagementProps {
  products: Product[];
  onRefreshProducts: () => void;
}

export const ProductManagement: React.FC<ProductManagementProps> = ({
  products,
  onRefreshProducts
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Semua');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formCategory, setFormCategory] = useState('Makanan');
  const [formPrice, setFormPrice] = useState<number>(10000);
  const [formStock, setFormStock] = useState<number>(20);
  const [formBarcode, setFormBarcode] = useState('');
  const [formColor, setFormColor] = useState('#10B981');

  const categories = ['Semua', 'Makanan', 'Minuman', 'Snack', 'Paket', 'Lainnya'];

  const filtered = products.filter(p => {
    const matchCat = categoryFilter === 'Semua' || p.category === categoryFilter;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormSku(`PRD-${Math.floor(100 + Math.random() * 900)}`);
    setFormCategory('Makanan');
    setFormPrice(15000);
    setFormStock(25);
    setFormBarcode('');
    setFormColor('#10B981');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormSku(p.sku);
    setFormCategory(p.category || 'Makanan');
    setFormPrice(p.price);
    setFormStock(p.stock);
    setFormBarcode(p.barcode || '');
    setFormColor(p.color || '#10B981');
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (editingProduct?.id) {
      await db.products.update(editingProduct.id, {
        name: formName.trim(),
        sku: formSku.trim(),
        category: formCategory,
        price: Number(formPrice) || 0,
        stock: Number(formStock) || 0,
        barcode: formBarcode.trim() || undefined,
        color: formColor
      });
    } else {
      await db.products.add({
        name: formName.trim(),
        sku: formSku.trim(),
        category: formCategory,
        price: Number(formPrice) || 0,
        stock: Number(formStock) || 0,
        barcode: formBarcode.trim() || undefined,
        color: formColor
      });
    }

    setIsModalOpen(false);
    onRefreshProducts();
  };

  const handleDeleteProduct = async (id?: number) => {
    if (!id) return;
    if (confirm('Yakin ingin menghapus produk ini?')) {
      await db.products.delete(id);
      onRefreshProducts();
    }
  };

  const handleQuickStock = async (p: Product, delta: number) => {
    if (!p.id) return;
    const newStock = Math.max(0, p.stock + delta);
    await db.products.update(p.id, { stock: newStock });
    onRefreshProducts();
  };

  const handleResetCatalog = async () => {
    if (confirm('Kembalikan katalog produk ke daftar bawaan? Semua modifikasi produk akan di-reset.')) {
      await db.products.clear();
      await db.products.bulkAdd(INITIAL_PRODUCTS as Product[]);
      onRefreshProducts();
    }
  };

  const handleExportData = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(products, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `katalog_kasirpro_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-400" />
            Manajemen Produk & Stok
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Data tersimpan offline di browser lokal (IndexedDB via Dexie.js).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportData}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 flex items-center gap-1.5 transition"
            title="Download cadangan data JSON"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>

          <button
            onClick={handleResetCatalog}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 flex items-center gap-1.5 transition"
            title="Reset ke menu contoh default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Bawaan
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            Tambah Produk
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari produk berdasarkan nama atau SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                categoryFilter === cat
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase font-mono tracking-wider">
              <tr>
                <th className="py-3 px-4">Produk</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">Harga Satuan</th>
                <th className="py-3 px-4 text-center">Stok</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map(product => {
                const isLow = product.stock <= 5 && product.stock > 0;
                const isOut = product.stock <= 0;

                return (
                  <tr key={product.id} className="hover:bg-slate-850/50 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: product.color || '#10B981' }}
                        />
                        <div>
                          <div className="font-bold text-white text-sm">{product.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            SKU: {product.sku} {product.barcode ? `• Barcode: ${product.barcode}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md text-[11px]">
                        {product.category}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-bold text-emerald-400 text-sm">
                      Rp {formatRupiah(product.price)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleQuickStock(product, -1)}
                          disabled={product.stock <= 0}
                          className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center disabled:opacity-30"
                        >
                          -
                        </button>
                        <span className={`min-w-8 font-mono font-bold text-center ${
                          isOut ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-slate-200'
                        }`}>
                          {product.stock}
                        </span>
                        <button
                          onClick={() => handleQuickStock(product, 1)}
                          className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditModal(product)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
                          title="Edit Produk"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          className="p-1.5 bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-lg transition"
                          title="Hapus Produk"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    Tidak ada produk ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-white text-base">
                {editingProduct ? 'Edit Produk' : 'Tambah Produk Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Nama Produk</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Es Kopi Susu Aren"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
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
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Kategori</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none"
                  >
                    <option value="Makanan">Makanan</option>
                    <option value="Minuman">Minuman</option>
                    <option value="Snack">Snack</option>
                    <option value="Paket">Paket</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
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
                    onChange={e => setFormPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Stok Awal</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formStock}
                    onChange={e => setFormStock(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Barcode (Opsional)</label>
                <input
                  type="text"
                  placeholder="Scan atau ketik kode barcode"
                  value={formBarcode}
                  onChange={e => setFormBarcode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Warna Label</label>
                <div className="flex items-center gap-2">
                  {['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#78350F'].map(c => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setFormColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition ${
                        formColor === c ? 'border-white scale-110' : 'border-transparent'
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
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl shadow-md shadow-emerald-500/20"
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
