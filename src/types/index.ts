export interface MetadataItem {
  id: string;
  key: string;
  value: string;
  isCentered?: boolean;
  isBold?: boolean;
  isUnderline?: boolean;
  textSize?: 'S' | 'N' | 'DW' | 'DH' | 'M';
}

export interface CustomTemplate {
  id: string;
  storeId?: string;
  name: string;
  badgeTitle: string;
  metadata: MetadataItem[];
  footerNote?: string;
  createdAt?: number;
}

export type UserRole = 'owner' | 'manager' | 'cashier';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  storeId: string;
  photoURL?: string;
  createdAt: string;
  createdById?: string;
}

export interface Store {
  id: string;
  name: string;
  ownerId: string;
  address?: string;
  phone?: string;
  createdAt: string;
}

export interface Product {
  id?: number | string;
  firestoreId?: string;
  syncPending?: boolean;
  storeId?: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  category: string;
  barcode?: string;
  color?: string;
  description?: string;
  costPrice?: number; // Modal per pcs / harga beli
  modal?: number; // Alias harga modal
  purchase_price?: number; // Alias harga beli/modal
  unit?: string; // Satuan (Pcs, Dus, Liter, Kg, dll)
}

export interface CartItem {
  product: Product;
  quantity: number;
  notes?: string;
}

export type PaymentMethod = 'cash' | 'qris' | 'transfer';

export interface Transaction {
  id?: number | string;
  firestoreId?: string;
  syncPending?: boolean;
  storeId?: string;
  invoiceNumber: string;
  timestamp: number;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  totalCost?: number;
  modal?: number;
  total_modal?: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: PaymentMethod;
  cashierName: string;
  cashierId?: string;
  notes?: string;
}

export interface StoreSettings {
  storeId?: string;
  storeName: string;
  logoUrl?: string; // Custom Store Logo (Data URL / Base64 image)
  address: string;
  phone: string;
  footerMessage: string;
  paperWidthChars: number; // 32 characters for 58mm
  currencyPrefix: string;
  enableTax: boolean;
  taxRate: number; // in percentage e.g. 10%
  cashierName: string;
  linuxDevicePath: string; // default: /dev/usb/lp0
  feedLines?: number; // Jumlah baris feed kosong di akhir (default: 1)
  enableAutoCut?: boolean; // Kirim perintah auto-cutter GS V (default: false untuk 58mm sobek manual)
  compactMode?: boolean; // Mode ringkas hemat kertas
  timezone?: string; // Zona waktu: 'Asia/Jakarta' (WIB), 'Asia/Makassar' (WITA), 'Asia/Jayapura' (WIT)
}

export type PrinterConnectionType = 
  | 'simulator' 
  | 'tauri_raw' 
  | 'web_bluetooth' 
  | 'web_serial' 
  | 'android_thermer'
  | 'capacitor_bluetooth' 
  | 'browser_print';

export interface LinuxPrinterInfo {
  path: string;
  exists: boolean;
  writable: boolean;
  vendorId?: string;
  productId?: string;
  details?: string;
}

export interface BluetoothDeviceOption {
  name: string;
  address: string;
}

export interface PrinterDeviceStatus {
  connected: boolean;
  type: PrinterConnectionType;
  deviceName?: string;
  devicePath?: string;
  error?: string;
  linuxInfo?: LinuxPrinterInfo;
  bluetoothDevice?: BluetoothDeviceOption;
}

export type CashFlowType = 'income' | 'expense';

export interface CashFlowRecord {
  id?: any;
  firestoreId?: string;
  syncPending?: boolean;
  type: CashFlowType; // 'income' | 'expense'
  category: string;
  description: string;
  amount: number;
  cost?: number;
  profit?: number;
  status: 'lunas' | 'belum_lunas';
  paymentMethod?: string;
  timestamp: number;
  dateString: string;
  storeId?: string;
  createdAt?: string;
  paidAmount?: number;
  dpAmount?: number;
}

export interface DebtPayment {
  id: string;
  amount: number;
  costPortion?: number;
  profitPortion?: number;
  timestamp: number;
  note?: string;
}

export interface DebtMutation {
  id: string;
  type: 'give' | 'take'; // 'give' = Berikan (Utang +), 'take' = Terima (Bayar/Cicil -)
  amount: number;
  note?: string;
  timestamp: number;
  dateString?: string;
}

export interface CustomerDebt {
  id?: any;
  firestoreId?: string;
  syncPending?: boolean;
  customerName: string;
  customerPhone?: string;
  description: string;
  totalAmount: number;
  cost?: number; // Biaya Modal / Pokok
  profit?: number; // Keuntungan Bersih / Margin
  modal?: number; // Alias untuk modal
  keuntunganBersih?: number; // Alias untuk laba bersih
  paidAmount: number;
  remainingAmount: number;
  status: 'belum_lunas' | 'cicilan' | 'lunas';
  debtType?: 'standard' | 'kasbon' | 'jasa_antar';
  debtCategory?: 'pelanggan' | 'saya'; // 'pelanggan' = Utang Pelanggan (Piutang kita), 'saya' = Utang Saya (Hutang kita ke supplier/orang)
  usesCapital?: boolean;
  createdAt: number;
  dueDate?: string;
  payments: DebtPayment[];
  mutations?: DebtMutation[];
  storeId?: string;
  updatedAt?: number;
}

export interface CapitalRecord {
  id?: any;
  firestoreId?: string;
  type: 'add' | 'subtract';
  amount: number;
  description: string;
  timestamp: number;
  storeId?: string;
}

