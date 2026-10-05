import Dexie, { type Table } from 'dexie';
import { Product, Transaction, StoreSettings } from '../types';

export class KasirProDatabase extends Dexie {
  products!: Table<Product, number>;
  transactions!: Table<Transaction, number>;
  settings!: Table<StoreSettings & { id: string }, string>;

  constructor() {
    super('KasirProPOS_DB');
    this.version(1).stores({
      products: '++id, name, category, sku, barcode, stock',
      transactions: '++id, invoiceNumber, timestamp, paymentMethod',
      settings: 'id'
    });
  }
}

export const db = new KasirProDatabase();

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'WARUNG KOPI & KASIRPRO',
  address: 'Jl. Merdeka No. 45, Bandung',
  phone: '0812-3456-7890',
  footerMessage: 'Terima kasih atas kunjungan Anda!\nBarang yang dibeli tidak dapat ditukar.',
  paperWidthChars: 32, // Standar kertas thermal 58mm
  currencyPrefix: 'Rp',
  enableTax: false,
  taxRate: 10,
  cashierName: 'Kasir 01',
  linuxDevicePath: '/dev/usb/lp0' // Target default Linux CachyOS
};

export const INITIAL_PRODUCTS: Omit<Product, 'id'>[] = [
  {
    name: 'Kopi Susu Gula Aren',
    sku: 'KOP-001',
    price: 18000,
    stock: 45,
    category: 'Minuman',
    color: '#D97706',
    description: 'Espresso robusta dengan susu murni & gula aren asli'
  },
  {
    name: 'Americano Dingin',
    sku: 'KOP-002',
    price: 15000,
    stock: 50,
    category: 'Minuman',
    color: '#78350F',
    description: 'Double shot espresso dengan air dingin segar'
  },
  {
    name: 'Matcha Latte',
    sku: 'NON-001',
    price: 22000,
    stock: 30,
    category: 'Minuman',
    color: '#059669',
    description: 'Matcha premium Jepang dengan fresh milk creamy'
  },
  {
    name: 'Es Teh Manis Jumbo',
    sku: 'NON-002',
    price: 6000,
    stock: 120,
    category: 'Minuman',
    color: '#EA580C',
    description: 'Teh melati wangi dengan es melimpah'
  },
  {
    name: 'Nasi Goreng Spesial',
    sku: 'MAK-001',
    price: 25000,
    stock: 25,
    category: 'Makanan',
    color: '#DC2626',
    description: 'Nasi goreng dengan telur, suwir ayam, sosis, dan kerupuk'
  },
  {
    name: 'Ayam Geprek Sambal Matah',
    sku: 'MAK-002',
    price: 24000,
    stock: 20,
    category: 'Makanan',
    color: '#B91C1C',
    description: 'Ayam krispi renyah dilumuri sambal matah khas Bali'
  },
  {
    name: 'Mie Nyemek Pedas',
    sku: 'MAK-003',
    price: 18000,
    stock: 35,
    category: 'Makanan',
    color: '#E11D48',
    description: 'Mie kuah kental gurih dengan telur orak-arik & sawi'
  },
  {
    name: 'Kentang Goreng Keju',
    sku: 'SNK-001',
    price: 15000,
    stock: 40,
    category: 'Snack',
    color: '#CA8A04',
    description: 'French fries crinkle cut dengan bumbu tabur keju gurih'
  },
  {
    name: 'Roti Bakar Cokelat Keju',
    sku: 'SNK-002',
    price: 16000,
    stock: 28,
    category: 'Snack',
    color: '#92400E',
    description: 'Roti tawar tebal bakar dengan filling cokelat lumer & parutan keju'
  },
  {
    name: 'Tahu Cabe Garam',
    sku: 'SNK-003',
    price: 14000,
    stock: 30,
    category: 'Snack',
    color: '#65A30D',
    description: 'Tahu goreng renyah ditumis bawang putih & cabai rawit pedas'
  },
  {
    name: 'Paket Hemat Makan Siang',
    sku: 'PKT-001',
    price: 28000,
    stock: 15,
    category: 'Paket',
    color: '#7C3AED',
    description: 'Nasi Goreng Spesial + Es Teh Manis Jumbo (Hemat Rp 3.000)'
  },
  {
    name: 'Croissant Butter',
    sku: 'SNK-004',
    price: 20000,
    stock: 12,
    category: 'Snack',
    color: '#D97706',
    description: 'Pastry butter renyah dengan aroma wangi khas Perancis'
  }
];

export async function initializeDatabase() {
  try {
    const productCount = await db.products.count();
    if (productCount === 0) {
      await db.products.bulkAdd(INITIAL_PRODUCTS as Product[]);
    }

    const savedSettings = await db.settings.get('main');
    if (!savedSettings) {
      await db.settings.put({ ...DEFAULT_SETTINGS, id: 'main' });
    }
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

export default db;
