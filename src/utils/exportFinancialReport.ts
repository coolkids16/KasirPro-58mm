import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Transaction, Product, CashFlowRecord, StoreSettings, CustomerDebt, TabunganRecord } from '../types';
import { formatRupiah } from './escpos';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { printerService } from '../services/printerService';

export interface FinancialReportData {
  settings: StoreSettings;
  periodLabel: string;
  transactions: Transaction[];
  cashFlows: CashFlowRecord[];
  products: Product[];
  debts: CustomerDebt[];
  savings: TabunganRecord[];
}

function getMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function filterByMonth<T extends { timestamp: number }>(items: T[]): T[] {
  const { start, end } = getMonthRange();
  return items.filter(item => item.timestamp >= start.getTime() && item.timestamp <= end.getTime());
}

function calculatePembukuanMetrics(transactions: Transaction[], cashFlows: CashFlowRecord[]) {
  const posTotalRevenue = transactions.reduce((sum, tx) => sum + (tx.total || 0), 0);
  const posTotalCost = transactions.reduce((sum, tx) => {
    const directCost = tx.totalCost !== undefined ? tx.totalCost : (tx.modal !== undefined ? tx.modal : tx.total_modal);
    if (directCost !== undefined) return sum + directCost;
    return sum + (tx.items || []).reduce((itemSum, item) => {
      const cost = item.product.costPrice !== undefined
        ? Number(item.product.costPrice)
        : (item.product.modal !== undefined ? Number(item.product.modal) : Number(item.product.purchase_price) || 0);
      return itemSum + cost * item.quantity;
    }, 0);
  }, 0);

  const incomeRecords = cashFlows.filter(cf => cf.type === 'income');
  const manualIncomeTotal = incomeRecords.reduce((sum, cf) => sum + (cf.amount || 0), 0);
  const manualCostTotal = incomeRecords.reduce((sum, cf) => sum + (cf.cost || 0), 0);
  const expenseRecords = cashFlows.filter(cf => cf.type === 'expense');
  const operationalExpenses = expenseRecords.reduce((sum, cf) => sum + (cf.amount || 0), 0);
  const totalCOGS = manualCostTotal + posTotalCost;
  const totalExpenses = operationalExpenses + totalCOGS;
  const totalGrossRevenue = posTotalRevenue + manualIncomeTotal;

  return {
    posTotalRevenue,
    posTotalCost,
    manualIncomeTotal,
    manualCostTotal,
    operationalExpenses,
    totalCOGS,
    totalExpenses,
    totalGrossRevenue,
    netProfit: totalGrossRevenue - totalExpenses,
    incomeRecords,
    expenseRecords
  };
}

export async function exportFinancialReportPdf(data: FinancialReportData): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { settings, transactions, cashFlows, debts, savings } = data;
  const monthlyTx = filterByMonth(transactions);
  const monthlyCashFlows = filterByMonth(cashFlows);
  const metrics = calculatePembukuanMetrics(monthlyTx, monthlyCashFlows);
  const customerDebts = debts.filter(debt => debt.debtCategory !== 'saya' && (debt.remainingAmount || 0) > 0);
  const totalCustomerDebt = customerDebts.reduce((total, debt) => total + (debt.remainingAmount || 0), 0);
  const totalSavings = savings.reduce((total, account) => total + (account.totalBalance || 0), 0);
  const { start, end } = getMonthRange();
  const periodLabel = `${start.toLocaleDateString('id-ID')} - ${end.toLocaleDateString('id-ID')}`;

  doc.setFontSize(18);
  doc.setTextColor(16, 185, 129);
  doc.text(settings.storeName || 'KasirPro 58mm', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(settings.address || '', 14, 24);
  doc.text(`Telp: ${settings.phone || '-'}`, 14, 28);
  doc.setFontSize(14);
  doc.setTextColor(30);
  doc.text('LAPORAN KEUANGAN BULANAN', 283, 18, { align: 'right' });
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Periode: ${periodLabel}`, 283, 24, { align: 'right' });
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 283, 28, { align: 'right' });
  doc.setLineWidth(0.5);
  doc.setDrawColor(200);
  doc.line(14, 32, 283, 32);

  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text('RINGKASAN KEUANGAN (MENGIKUTI PEMBUKUAN)', 14, 40);
  autoTable(doc, {
    startY: 43,
    head: [['Kategori', 'Nilai (Rp)']],
    body: [
      ['Penjualan POS', `Rp ${formatRupiah(metrics.posTotalRevenue)}`],
      ['Pemasukan Luar Kasir', `Rp ${formatRupiah(metrics.manualIncomeTotal)}`],
      ['Total Pendapatan Kotor', `Rp ${formatRupiah(metrics.totalGrossRevenue)}`],
      ['Modal Produk POS (HPP)', `Rp ${formatRupiah(metrics.posTotalCost)}`],
      ['Modal Pemasukan Luar Kasir', `Rp ${formatRupiah(metrics.manualCostTotal)}`],
      ['Total HPP', `Rp ${formatRupiah(metrics.totalCOGS)}`],
      ['Pengeluaran Operasional', `Rp ${formatRupiah(metrics.operationalExpenses)}`],
      ['Total Pengeluaran', `Rp ${formatRupiah(metrics.totalExpenses)}`],
      ['KEUNTUNGAN / LABA BERSIH', `Rp ${formatRupiah(metrics.netProfit)}`],
      ['Total Sisa Utang Pelanggan (Saat Ini)', `Rp ${formatRupiah(totalCustomerDebt)}`],
      ['Total Tabungan (Saat Ini)', `Rp ${formatRupiah(totalSavings)}`]
    ],
    theme: 'striped',
    headStyles: { fillColor: [16, 185, 129] },
    styles: { fontSize: 9 }
  });

  let currentY = (doc as any).lastAutoTable.finalY + 10;
  if (currentY > 175) { doc.addPage(); currentY = 20; }
  doc.setFontSize(11);
  doc.text(`RINCIAN PENJUALAN POS (${monthlyTx.length} transaksi)`, 14, currentY);
  autoTable(doc, {
    startY: currentY + 3,
    head: [['Invoice', 'Tanggal', 'Kasir', 'Metode', 'Item', 'Omzet', 'Modal', 'Laba']],
    body: monthlyTx.map(tx => {
      const txCost = tx.totalCost !== undefined ? tx.totalCost : (tx.modal !== undefined ? tx.modal : tx.total_modal !== undefined ? tx.total_modal : (tx.items || []).reduce((sum, item) => {
        const cost = item.product.costPrice !== undefined ? Number(item.product.costPrice) : Number(item.product.modal ?? item.product.purchase_price ?? 0);
        return sum + cost * item.quantity;
      }, 0));
      return [tx.invoiceNumber, new Date(tx.timestamp).toLocaleString('id-ID'), tx.cashierName || 'Kasir', (tx.paymentMethod || 'cash').toUpperCase(), (tx.items || []).map(item => `${item.product.name} x${item.quantity}`).join(', '), `Rp ${formatRupiah(tx.total)}`, `Rp ${formatRupiah(txCost)}`, `Rp ${formatRupiah(tx.total - txCost)}`];
    }),
    theme: 'grid',
    headStyles: { fillColor: [51, 65, 85] },
    styles: { fontSize: 7, cellPadding: 1.5 },
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: [0]
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;
  if (metrics.incomeRecords.length && currentY > 175) { doc.addPage(); currentY = 20; }
  if (metrics.incomeRecords.length) {
    doc.setFontSize(11);
    doc.text(`RINCIAN PEMASUKAN LUAR KASIR (${metrics.incomeRecords.length} catatan)`, 14, currentY);
    autoTable(doc, {
      startY: currentY + 3,
      head: [['Tanggal', 'Kategori', 'Keterangan', 'Status', 'Jumlah', 'Modal', 'Laba']],
      body: metrics.incomeRecords.map(cf => [cf.dateString || new Date(cf.timestamp).toLocaleDateString('id-ID'), cf.category || '-', cf.description || '-', cf.status, `Rp ${formatRupiah(cf.amount)}`, `Rp ${formatRupiah(cf.cost || 0)}`, `Rp ${formatRupiah(cf.profit !== undefined ? cf.profit : cf.amount - (cf.cost || 0))}`]),
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 8 }
    });
  }

  currentY = (doc as any).lastAutoTable?.finalY + 10 || 20;
  if (metrics.expenseRecords.length && currentY > 175) { doc.addPage(); currentY = 20; }
  if (metrics.expenseRecords.length) {
    doc.setFontSize(11);
    doc.text(`RINCIAN PENGELUARAN OPERASIONAL (${metrics.expenseRecords.length} catatan)`, 14, currentY);
    autoTable(doc, {
      startY: currentY + 3,
      head: [['Tanggal', 'Kategori', 'Keterangan', 'Status', 'Jumlah']],
      body: metrics.expenseRecords.map(cf => [cf.dateString || new Date(cf.timestamp).toLocaleDateString('id-ID'), cf.category || '-', cf.description || '-', cf.status, `Rp ${formatRupiah(cf.amount)}`]),
      theme: 'grid',
      headStyles: { fillColor: [239, 68, 68] },
      styles: { fontSize: 8 }
    });
  }

  currentY = (doc as any).lastAutoTable?.finalY + 10 || 20;
  if (currentY > 175) { doc.addPage(); currentY = 20; }
  doc.setFontSize(11);
  doc.text(`SISA UTANG PELANGGAN (${customerDebts.length} pelanggan)`, 14, currentY);
  autoTable(doc, {
    startY: currentY + 3,
    head: [['Nama Pelanggan', 'Sisa Utang']],
    body: [
      ...customerDebts.map(debt => [debt.customerName || '-', `Rp ${formatRupiah(debt.remainingAmount || 0)}`]),
      ['TOTAL SISA UTANG', `Rp ${formatRupiah(totalCustomerDebt)}`]
    ],
    theme: 'grid',
    headStyles: { fillColor: [245, 158, 11] },
    styles: { fontSize: 8 },
    columnStyles: { 1: { halign: 'right' } }
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;
  if (currentY > 175) { doc.addPage(); currentY = 20; }
  doc.setFontSize(11);
  doc.text(`SALDO TABUNGAN (${savings.length} nasabah)`, 14, currentY);
  autoTable(doc, {
    startY: currentY + 3,
    head: [['Nama Nasabah', 'Jumlah Tabungan']],
    body: [
      ...savings.map(account => [account.customerName || '-', `Rp ${formatRupiah(account.totalBalance || 0)}`]),
      ['TOTAL TABUNGAN', `Rp ${formatRupiah(totalSavings)}`]
    ],
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229] },
    styles: { fontSize: 8 },
    columnStyles: { 1: { halign: 'right' } }
  });

  const storeName = (settings.storeName || 'KasirPro_58mm').replace(/\s+/g, '_');
  const filename = `Laporan_Keuangan_Bulanan_${storeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const tauriWindow = window as typeof window & { __TAURI__?: { invoke?: (command: string, args: unknown) => Promise<unknown> } };
  const runtimeEnv = printerService.getRuntimeEnv();

  try {
    if (runtimeEnv === 'tauri' && typeof tauriWindow.__TAURI__?.invoke === 'function') {
      const bytes = Array.from(new Uint8Array(doc.output('arraybuffer')));
      await tauriWindow.__TAURI__.invoke('save_download', { filename, bytes });
      return;
    }

    if (runtimeEnv === 'capacitor') {
      // For Capacitor Android: Convert PDF arrayBuffer / dataUri to base64 and write to Documents / Downloads
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      
      try {
        await Filesystem.writeFile({
          path: filename,
          data: pdfBase64,
          directory: Directory.Documents,
          recursive: true
        });
        window.alert(`Laporan PDF berhasil disimpan di folder Dokumen/Downloads Android: ${filename}`);
      } catch (capErr) {
        console.warn('Filesystem.writeFile failed, falling back to blob trigger:', capErr);
        // Fallback to standard blob download in Webview
        const pdfDataUri = doc.output('datauristring');
        const link = document.createElement('a');
        link.href = pdfDataUri;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      return;
    }

    // Browser fallback
    const url = URL.createObjectURL(doc.output('blob'));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error('Gagal mengunduh laporan PDF:', error);
    window.alert('Laporan PDF gagal disimpan.');
  }
}

export function exportFinancialReportExcel(data: FinancialReportData) {
  const { settings, transactions, cashFlows } = data;
  const monthlyTx = filterByMonth(transactions);
  const monthlyCashFlows = filterByMonth(cashFlows);
  const metrics = calculatePembukuanMetrics(monthlyTx, monthlyCashFlows);
  const { start, end } = getMonthRange();
  const periodLabel = `${start.toLocaleDateString('id-ID')} - ${end.toLocaleDateString('id-ID')}`;

  const summarySheet = [
    ['LAPORAN KEUANGAN BULANAN', settings.storeName || 'KasirPro 58mm'],
    ['Periode', periodLabel],
    ['Dicetak', new Date().toLocaleString('id-ID')], [],
    ['Kategori', 'Nilai (Rp)'],
    ['Penjualan POS', metrics.posTotalRevenue],
    ['Pemasukan Luar Kasir', metrics.manualIncomeTotal],
    ['Total Pendapatan Kotor', metrics.totalGrossRevenue],
    ['Modal Produk POS (HPP)', metrics.posTotalCost],
    ['Modal Pemasukan Luar Kasir', metrics.manualCostTotal],
    ['Total HPP', metrics.totalCOGS],
    ['Pengeluaran Operasional', metrics.operationalExpenses],
    ['Total Pengeluaran', metrics.totalExpenses],
    ['KEUNTUNGAN / LABA BERSIH', metrics.netProfit]
  ];

  const salesSheet = [
    ['Invoice', 'Tanggal & Waktu', 'Kasir', 'Metode Pembayaran', 'Rincian Item', 'Omzet', 'Modal', 'Laba'],
    ...monthlyTx.map(tx => {
      const txCost = tx.totalCost !== undefined ? tx.totalCost : (tx.modal !== undefined ? tx.modal : tx.total_modal !== undefined ? tx.total_modal : (tx.items || []).reduce((sum, item) => {
        const cost = item.product.costPrice !== undefined ? Number(item.product.costPrice) : Number(item.product.modal ?? item.product.purchase_price ?? 0);
        return sum + cost * item.quantity;
      }, 0));
      return [tx.invoiceNumber, new Date(tx.timestamp).toLocaleString('id-ID'), tx.cashierName || 'Kasir', (tx.paymentMethod || 'cash').toUpperCase(), (tx.items || []).map(item => `${item.product.name} x${item.quantity}`).join(', '), tx.total, txCost, tx.total - txCost];
    })
  ];

  const incomeSheet = [
    ['Tanggal', 'Kategori', 'Keterangan', 'Status', 'Jumlah', 'Modal', 'Laba'],
    ...metrics.incomeRecords.map(cf => [cf.dateString || new Date(cf.timestamp).toLocaleDateString('id-ID'), cf.category || '-', cf.description || '-', cf.status, cf.amount || 0, cf.cost || 0, cf.profit !== undefined ? cf.profit : cf.amount - (cf.cost || 0)])
  ];
  const expenseSheet = [
    ['Tanggal', 'Kategori', 'Keterangan', 'Status', 'Jumlah'],
    ...metrics.expenseRecords.map(cf => [cf.dateString || new Date(cf.timestamp).toLocaleDateString('id-ID'), cf.category || '-', cf.description || '-', cf.status, cf.amount || 0])
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summarySheet), 'Ringkasan');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(salesSheet), 'Penjualan POS');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(incomeSheet), 'Pemasukan Luar Kasir');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(expenseSheet), 'Pengeluaran Operasional');
  XLSX.writeFile(workbook, `Laporan_Keuangan_Bulanan_${settings.storeName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
