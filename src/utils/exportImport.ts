import { Product, Transaction, StoreSettings, CashFlowRecord, CustomerDebt } from '../types';
import { getLocalDateString } from './timezone';

export interface FullBackupData {
  version: string;
  exportedAt: string;
  storeSettings?: StoreSettings;
  products: Product[];
  transactions: Transaction[];
  cashFlows?: CashFlowRecord[];
  debts?: CustomerDebt[];
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ----------------- EXPORT HELPERS -----------------

export function exportFullBackupJson(
  products: Product[],
  transactions: Transaction[],
  settings?: StoreSettings,
  cashFlows?: CashFlowRecord[],
  debts?: CustomerDebt[]
) {
  const backup: FullBackupData = {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    storeSettings: settings,
    products,
    transactions,
    cashFlows,
    debts
  };
  const dateStr = getLocalDateString();
  downloadFile(
    JSON.stringify(backup, null, 2),
    `kasirpro_full_backup_${dateStr}.json`,
    'application/json;charset=utf-8'
  );
}

export function exportProductsJson(products: Product[]) {
  const dateStr = getLocalDateString();
  downloadFile(
    JSON.stringify(products, null, 2),
    `produk_stok_kasirpro_${dateStr}.json`,
    'application/json;charset=utf-8'
  );
}

export function exportTransactionsJson(transactions: Transaction[]) {
  const dateStr = getLocalDateString();
  downloadFile(
    JSON.stringify(transactions, null, 2),
    `riwayat_penjualan_kasirpro_${dateStr}.json`,
    'application/json;charset=utf-8'
  );
}

export function exportProductsCsv(products: Product[]) {
  const headers = ['SKU', 'Nama Produk', 'Kategori', 'Harga Jual', 'Stok', 'Barcode', 'Warna', 'Deskripsi'];
  const rows = products.map(p => [
    `"${(p.sku || '').replace(/"/g, '""')}"`,
    `"${(p.name || '').replace(/"/g, '""')}"`,
    `"${(p.category || 'Makanan').replace(/"/g, '""')}"`,
    p.price || 0,
    p.stock || 0,
    `"${(p.barcode || '').replace(/"/g, '""')}"`,
    `"${(p.color || '#10B981').replace(/"/g, '""')}"`,
    `"${(p.description || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const dateStr = getLocalDateString();
  downloadFile(
    csvContent,
    `katalog_produk_stok_${dateStr}.csv`,
    'text/csv;charset=utf-8;'
  );
}

export function exportTransactionsCsv(transactions: Transaction[]) {
  const headers = [
    'Nomor Invoice',
    'Tanggal & Waktu',
    'Kasir',
    'Metode Pembayaran',
    'Subtotal',
    'Diskon',
    'Pajak',
    'Total Akhir',
    'Nominal Diterima',
    'Kembalian',
    'Rincian Item'
  ];

  const rows = transactions.map(t => {
    const dateFormatted = new Date(t.timestamp).toLocaleString('id-ID');
    const itemsSummary = t.items
      .map(i => `${i.product.name} (x${i.quantity})`)
      .join('; ');

    return [
      `"${t.invoiceNumber}"`,
      `"${dateFormatted}"`,
      `"${(t.cashierName || 'Kasir').replace(/"/g, '""')}"`,
      `"${t.paymentMethod.toUpperCase()}"`,
      t.subtotal || 0,
      t.discount || 0,
      t.tax || 0,
      t.total || 0,
      t.paidAmount || 0,
      t.changeAmount || 0,
      `"${itemsSummary.replace(/"/g, '""')}"`
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const dateStr = getLocalDateString();
  downloadFile(
    csvContent,
    `laporan_riwayat_penjualan_${dateStr}.csv`,
    'text/csv;charset=utf-8;'
  );
}

// ----------------- IMPORT PARSERS -----------------

export function parseProductsCsv(csvText: string): Product[] {
  // Strip BOM if present
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const products: Product[] = [];

  // Parse CSV lines handling quotes
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = parseCsvLine(line);
    if (cols.length >= 2 && cols[1].trim()) {
      const sku = cols[0]?.trim() || `PRD-${Math.floor(100 + Math.random() * 900)}`;
      const name = cols[1]?.trim() || 'Produk';
      const category = cols[2]?.trim() || 'Makanan';
      const price = Number(cols[3]) || 0;
      const stock = Number(cols[4]) || 0;
      const barcode = cols[5]?.trim() || undefined;
      const color = cols[6]?.trim() || '#10B981';
      const description = cols[7]?.trim() || undefined;

      products.push({
        name,
        sku,
        category,
        price,
        stock,
        barcode,
        color,
        description
      });
    }
  }

  return products;
}

function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}
