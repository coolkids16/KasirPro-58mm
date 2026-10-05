export interface Product {
  id?: number;
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
  id?: number;
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
  notes?: string;
}

export interface StoreSettings {
  storeName: string;
  address: string;
  phone: string;
  footerMessage: string;
  paperWidthChars: number; // 32 characters for 58mm
  currencyPrefix: string;
  enableTax: boolean;
  taxRate: number; // in percentage e.g. 10%
  cashierName: string;
  linuxDevicePath: string; // default: /dev/usb/lp0
}

export type PrinterConnectionType = 
  | 'simulator' 
  | 'tauri_raw' 
  | 'web_bluetooth' 
  | 'web_serial' 
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

export interface PrinterDeviceStatus {
  connected: boolean;
  type: PrinterConnectionType;
  deviceName?: string;
  devicePath?: string;
  error?: string;
  linuxInfo?: LinuxPrinterInfo;
}
