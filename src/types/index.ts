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
  storeId?: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  category: string;
  barcode?: string;
  color?: string;
  description?: string;
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
  storeId?: string;
  invoiceNumber: string;
  timestamp: number;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
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
