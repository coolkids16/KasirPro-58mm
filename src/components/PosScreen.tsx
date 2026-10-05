import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Banknote, 
  QrCode, 
  ShoppingBag, 
  Percent,
  ReceiptText,
  AlertCircle
} from 'lucide-react';
import { Product, CartItem, PaymentMethod, Transaction, StoreSettings } from '../types';
import { db } from '../db/db';
import { saveTransactionToFirestore, saveProductToFirestore } from '../services/firebase';
import { formatRupiah } from '../utils/escpos';

interface PosScreenProps {
  products: Product[];
  settings: StoreSettings;
  onTransactionComplete: (transaction: Transaction) => void;
  onRefreshProducts: () => void;
}

export const PosScreen: React.FC<PosScreenProps> = ({
  products,
  settings,
  onTransactionComplete,
  onRefreshProducts
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashGiven, setCashGiven] = useState<number>(0);
  const [cashInputString, setCashInputString] = useState<string>('');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [showDiscountInput, setShowDiscountInput] = useState<boolean>(false);
  const [itemNoteModal, setItemNoteModal] = useState<{ index: number; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Extract unique categories (including custom categories)
  const categories = useMemo(() => {
    const set = new Set<string>();
    try {
      const saved = localStorage.getItem('kasirpro_custom_categories');
      if (saved) {
        JSON.parse(saved).forEach((c: string) => set.add(c));
      }
    } catch (e) {}
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return ['Semua', ...Array.from(set)];
  }, [products]);

  // Filter products by category & search query
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchCat = selectedCategory === 'Semua' || product.category === selectedCategory;
      const matchQuery = 
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.barcode && product.barcode.includes(searchQuery));
      return matchCat && matchQuery;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart totals calculation
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }, [cart]);

  const tax = useMemo(() => {
    if (!settings.enableTax) return 0;
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    return Math.round((taxableAmount * settings.taxRate) / 100);
  }, [subtotal, discountAmount, settings]);

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - discountAmount + tax);
  }, [subtotal, discountAmount, tax]);

  // Calculate change for cash payment
  const changeAmount = useMemo(() => {
    if (paymentMethod !== 'cash') return 0;
    return Math.max(0, cashGiven - grandTotal);
  }, [cashGiven, grandTotal, paymentMethod]);

  // Add product to cart
  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;

    setCart(prevCart => {
      const existingIndex = prevCart.findIndex(item => item.product.id === product.id);
      if (existingIndex > -1) {
        const currentQty = prevCart[existingIndex].quantity;
        if (currentQty >= product.stock) {
          return prevCart; // Exceeds current stock
        }
        const updated = [...prevCart];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: currentQty + 1
        };
        return updated;
      } else {
        return [...prevCart, { product, quantity: 1 }];
      }
    });
  };

  // Modify quantity in cart
  const updateQuantity = (index: number, delta: number) => {
    setCart(prevCart => {
      const updated = [...prevCart];
      const item = updated[index];
      const newQty = item.quantity + delta;

      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }

      if (newQty > item.product.stock) {
        return updated; // Cannot exceed stock
      }

      updated[index] = { ...item, quantity: newQty };
      return updated;
    });
  };

  // Remove item completely
  const removeItem = (index: number) => {
    setCart(prevCart => prevCart.filter((_, i) => i !== index));
  };

  // Clear entire cart
  const clearCart = () => {
    setCart([]);
    setCashGiven(0);
    setCashInputString('');
    setDiscountAmount(0);
  };

  // Quick denomination helper
  const handleQuickCash = (amount: number) => {
    setCashGiven(amount);
    setCashInputString(amount.toString());
  };

  // When changing payment method
  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method);
    if (method !== 'cash') {
      setCashGiven(grandTotal);
      setCashInputString(grandTotal.toString());
    } else {
      if (cashGiven === 0) {
        setCashGiven(grandTotal);
        setCashInputString(grandTotal.toString());
      }
    }
  };

  // Complete checkout & process transaction
  const handleCheckout = async () => {
    if (cart.length === 0 || isProcessing) return;

    if (paymentMethod === 'cash' && cashGiven < grandTotal) {
      alert(`Uang pembayaran kurang! Total belanja: Rp ${formatRupiah(grandTotal)}, Uang diterima: Rp ${formatRupiah(cashGiven)}`);
      return;
    }

    setIsProcessing(true);

    try {
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const paid = paymentMethod === 'cash' ? cashGiven : grandTotal;
      const change = paymentMethod === 'cash' ? Math.max(0, cashGiven - grandTotal) : 0;

      const newTransaction: Transaction = {
        invoiceNumber,
        timestamp: Date.now(),
        items: [...cart],
        subtotal,
        discount: discountAmount,
        tax,
        total: grandTotal,
        paidAmount: paid,
        changeAmount: change,
        paymentMethod,
        cashierName: settings.cashierName
      };

      // 1. Save transaction in Dexie IndexedDB
      const txId = await db.transactions.add(newTransaction);
      newTransaction.id = txId;

      // 2. Reduce product stock in Dexie & sync to Firestore
      for (const item of cart) {
        if (item.product.id) {
          const newStock = Math.max(0, item.product.stock - item.quantity);
          await db.products.update(item.product.id, { stock: newStock });
          try {
            await saveProductToFirestore({
              ...item.product,
              stock: newStock
            });
          } catch (e) {
            // Offline fallback
          }
        }
      }

      // 3. Sync transaction to Firebase Firestore
      try {
        await saveTransactionToFirestore(newTransaction);
      } catch (e) {
        console.warn('Saved transaction offline only:', e);
      }

      // 4. Trigger receipt modal and callback
      onTransactionComplete(newTransaction);
      onRefreshProducts();

      // 5. Reset Cart
      clearCart();
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Terjadi kesalahan saat memproses transaksi.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6">
      
      {/* LEFT SECTION: Product Catalog Grid & Search */}
      <div className="flex-1 flex flex-col">
        {/* Top Controls: Search & Category Filter */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-5 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama produk, SKU, barcode..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-750 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Category Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map(cat => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
          {filteredProducts.map(product => {
            const outOfStock = product.stock <= 0;
            const inCart = cart.find(i => i.product.id === product.id);

            return (
              <div
                key={product.id}
                onClick={() => !outOfStock && addToCart(product)}
                className={`relative group bg-slate-900 border rounded-2xl p-3.5 flex flex-col justify-between transition-all select-none cursor-pointer ${
                  outOfStock
                    ? 'border-slate-800 opacity-50 cursor-not-allowed'
                    : inCart
                    ? 'border-emerald-500/80 bg-slate-900/90 shadow-md shadow-emerald-500/10'
                    : 'border-slate-800 hover:border-slate-700 hover:bg-slate-850 active:scale-[0.98]'
                }`}
              >
                {/* Visual Category Accent bar */}
                <div 
                  className="h-1.5 w-10 rounded-full mb-2"
                  style={{ backgroundColor: product.color || '#10B981' }}
                />

                <div>
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                      {product.sku}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      outOfStock
                        ? 'bg-rose-500/20 text-rose-400'
                        : product.stock < 10
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {outOfStock ? 'Habis' : `Stok: ${product.stock}`}
                    </span>
                  </div>

                  <h4 className="font-semibold text-white text-sm line-clamp-2 leading-snug group-hover:text-emerald-300 transition-colors">
                    {product.name}
                  </h4>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="font-bold text-emerald-400 text-sm">
                    Rp {formatRupiah(product.price)}
                  </div>

                  {inCart && (
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-white font-bold text-xs flex items-center justify-center shadow">
                      {inCart.quantity}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-500">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Tidak ada produk ditemukan.</p>
              <p className="text-xs text-slate-600 mt-1">Coba kata kunci pencarian atau kategori lain.</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SECTION: Cart & Payment Checkout Panel */}
      <div className="w-full lg:w-[410px] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col shadow-xl overflow-hidden">
        
        {/* Cart Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-white text-sm">Keranjang Pesanan</h3>
            <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-bold">
              {cart.reduce((s, i) => s + i.quantity, 0)}
            </span>
          </div>

          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Kosongkan
            </button>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 p-3 overflow-y-auto max-h-[300px] min-h-[180px] space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 py-10">
              <ShoppingBag className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-xs">Keranjang masih kosong</p>
              <p className="text-[11px] text-slate-600">Klik produk di sebelah kiri untuk menambahkan</p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div
                key={item.product.id || idx}
                className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{item.product.name}</div>
                  <div className="text-[11px] text-emerald-400">
                    Rp {formatRupiah(item.product.price)}
                  </div>
                  {item.notes && (
                    <div className="text-[10px] text-amber-400 italic">*{item.notes}</div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                    <button
                      onClick={() => updateQuantity(idx, -1)}
                      className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-7 text-center font-bold text-white text-xs">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(idx, 1)}
                      className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="w-16 text-right font-bold text-slate-200">
                    {formatRupiah(item.product.price * item.quantity)}
                  </div>

                  <button
                    onClick={() => removeItem(idx)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Calculations & Discounts */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 space-y-2 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Subtotal</span>
            <span className="text-white">Rp {formatRupiah(subtotal)}</span>
          </div>

          {/* Discount Toggle */}
          <div className="flex justify-between items-center text-slate-400">
            <button
              onClick={() => setShowDiscountInput(!showDiscountInput)}
              className="text-emerald-400 hover:underline flex items-center gap-1"
            >
              <Percent className="w-3 h-3" />
              {discountAmount > 0 ? `Diskon: Rp ${formatRupiah(discountAmount)}` : '+ Tambah Diskon'}
            </button>
            {discountAmount > 0 && (
              <span className="text-rose-400">-Rp {formatRupiah(discountAmount)}</span>
            )}
          </div>

          {showDiscountInput && (
            <div className="flex items-center gap-2 pt-1 pb-1">
              <input
                type="number"
                placeholder="Jumlah potongan (Rp)"
                value={discountAmount || ''}
                onChange={e => setDiscountAmount(Math.max(0, Number(e.target.value)))}
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-750 rounded-lg text-xs text-white"
              />
              <button
                onClick={() => setDiscountAmount(0)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px]"
              >
                Reset
              </button>
            </div>
          )}

          {settings.enableTax && (
            <div className="flex justify-between text-slate-400">
              <span>PPN ({settings.taxRate}%)</span>
              <span className="text-white">Rp {formatRupiah(tax)}</span>
            </div>
          )}

          <div className="flex justify-between text-sm font-extrabold text-white pt-2 border-t border-slate-800">
            <span>Total Belanja</span>
            <span className="text-emerald-400 text-base">Rp {formatRupiah(grandTotal)}</span>
          </div>
        </div>

        {/* Payment Methods & Cash Register Input */}
        <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-900">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleSelectPaymentMethod('cash')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                paymentMethod === 'cash'
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              Tunai
            </button>

            <button
              onClick={() => handleSelectPaymentMethod('qris')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                paymentMethod === 'qris'
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              QRIS
            </button>

            <button
              onClick={() => handleSelectPaymentMethod('transfer')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                paymentMethod === 'transfer'
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              Transfer
            </button>
          </div>

          {/* Cash Payment Details & Quick Buttons */}
          {paymentMethod === 'cash' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-24">Uang Diterima:</span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold">
                    Rp
                  </span>
                  <input
                    type="number"
                    value={cashInputString}
                    onChange={e => {
                      setCashInputString(e.target.value);
                      setCashGiven(Number(e.target.value) || 0);
                    }}
                    placeholder={grandTotal.toString()}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-750 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Quick Cash Suggestions */}
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickCash(grandTotal)}
                  className="py-1 px-2 bg-slate-800 hover:bg-slate-750 text-[11px] font-semibold text-slate-200 rounded-lg border border-slate-750 text-center transition"
                >
                  Uang Pas
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickCash(20000)}
                  className="py-1 px-2 bg-slate-800 hover:bg-slate-750 text-[11px] font-semibold text-slate-200 rounded-lg border border-slate-750 text-center transition"
                >
                  20.000
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickCash(50000)}
                  className="py-1 px-2 bg-slate-800 hover:bg-slate-750 text-[11px] font-semibold text-slate-200 rounded-lg border border-slate-750 text-center transition"
                >
                  50.000
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickCash(100000)}
                  className="py-1 px-2 bg-slate-800 hover:bg-slate-750 text-[11px] font-semibold text-slate-200 rounded-lg border border-slate-750 text-center transition"
                >
                  100.000
                </button>
              </div>

              {/* Kembalian Banner */}
              <div className={`p-2 rounded-xl flex items-center justify-between text-xs font-semibold ${
                cashGiven >= grandTotal
                  ? 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/60 border border-rose-500/30 text-rose-300'
              }`}>
                <span>Kembalian:</span>
                <span className="font-mono font-bold text-sm">
                  {cashGiven >= grandTotal
                    ? `Rp ${formatRupiah(changeAmount)}`
                    : `Kurang Rp ${formatRupiah(grandTotal - cashGiven)}`}
                </span>
              </div>
            </div>
          )}

          {/* Action Button: Checkout & Print */}
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || isProcessing || (paymentMethod === 'cash' && cashGiven < grandTotal)}
            className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-40 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 text-sm transition-all"
          >
            <ReceiptText className="w-4 h-4" />
            {isProcessing ? 'Menyimpan...' : 'Bayar & Cetak Struk 58mm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PosScreen;
