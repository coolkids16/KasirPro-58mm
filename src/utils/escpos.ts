import { Transaction, StoreSettings } from '../types';

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'decimal',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Utility string padding for 32-character thermal receipt lines
 */
export function padCenter(text: string, width = 32): string {
  if (text.length >= width) return text.substring(0, width);
  const leftPadding = Math.floor((width - text.length) / 2);
  const rightPadding = width - text.length - leftPadding;
  return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
}

export function padRow(left: string, right: string, width = 32): string {
  const totalLength = left.length + right.length;
  if (totalLength >= width) {
    // If text exceeds width, truncate left text to leave room for right
    const maxLeft = Math.max(5, width - right.length - 1);
    left = left.substring(0, maxLeft);
  }
  const spaces = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(spaces) + right;
}

export function padSeparator(char = '-', width = 32): string {
  return char.repeat(width);
}

/**
 * Builds standard plain-text representation (32-character monospace)
 * Used for live on-screen thermal paper simulator and fallback printer.
 */
export function generateReceiptText(
  transaction: Transaction,
  settings: StoreSettings
): string {
  const W = settings.paperWidthChars || 32;
  const lines: string[] = [];

  // Header Toko (Centered)
  lines.push(padCenter(settings.storeName.toUpperCase(), W));
  if (settings.address) {
    // Split address into multi-line if needed
    const words = settings.address.split(' ');
    let currentLine = '';
    for (const w of words) {
      if ((currentLine + ' ' + w).trim().length <= W) {
        currentLine = (currentLine + ' ' + w).trim();
      } else {
        lines.push(padCenter(currentLine, W));
        currentLine = w;
      }
    }
    if (currentLine) lines.push(padCenter(currentLine, W));
  }
  if (settings.phone) {
    lines.push(padCenter('Telp: ' + settings.phone, W));
  }

  lines.push(padSeparator('=', W));

  // Info Transaksi
  const dateObj = new Date(transaction.timestamp);
  const dateStr = dateObj.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
  const timeStr = dateObj.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  });

  lines.push(padRow(`No: ${transaction.invoiceNumber}`, `${dateStr} ${timeStr}`, W));
  lines.push(padRow(`Kasir: ${transaction.cashierName}`, `Metode: ${transaction.paymentMethod.toUpperCase()}`, W));
  lines.push(padSeparator('-', W));

  // Daftar Item
  for (const item of transaction.items) {
    // Line 1: Item Name
    lines.push(item.product.name.substring(0, W));
    
    // Line 2: Qty x Price   Subtotal
    const leftText = `  ${item.quantity} x ${formatRupiah(item.product.price)}`;
    const rightText = formatRupiah(item.quantity * item.product.price);
    lines.push(padRow(leftText, rightText, W));

    if (item.notes) {
      lines.push(`   *(${item.notes.substring(0, W - 6)})`);
    }
  }

  lines.push(padSeparator('-', W));

  // Rincian Pembayaran
  lines.push(padRow('Subtotal', `${settings.currencyPrefix} ${formatRupiah(transaction.subtotal)}`, W));

  if (transaction.discount > 0) {
    lines.push(padRow('Diskon', `-${settings.currencyPrefix} ${formatRupiah(transaction.discount)}`, W));
  }

  if (transaction.tax > 0) {
    lines.push(padRow(`PPN (${settings.taxRate}%)`, `${settings.currencyPrefix} ${formatRupiah(transaction.tax)}`, W));
  }

  lines.push(padSeparator('=', W));
  lines.push(padRow('TOTAL', `${settings.currencyPrefix} ${formatRupiah(transaction.total)}`, W));
  lines.push(padRow('BAYAR', `${settings.currencyPrefix} ${formatRupiah(transaction.paidAmount)}`, W));
  lines.push(padRow('KEMBALI', `${settings.currencyPrefix} ${formatRupiah(transaction.changeAmount)}`, W));

  lines.push(padSeparator('=', W));

  // Footer Message
  if (settings.footerMessage) {
    const footerLines = settings.footerMessage.split('\n');
    for (const fLine of footerLines) {
      lines.push(padCenter(fLine, W));
    }
  }

  lines.push(padCenter('*** KASIRPRO 58MM ***', W));
  lines.push(''); // Feed 1
  lines.push(''); // Feed 2

  return lines.join('\n');
}

/**
 * Real Binary ESC/POS Command Encoder
 * Produces Uint8Array byte stream compliant with standard 58mm thermal printers.
 */
export class EscPosEncoder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  init(): this {
    this.buffer.push(ESC, 0x40); // ESC @ : Initialize printer
    return this;
  }

  align(alignment: 'left' | 'center' | 'right'): this {
    const code = alignment === 'center' ? 1 : alignment === 'right' ? 2 : 0;
    this.buffer.push(ESC, 0x61, code); // ESC a n
    return this;
  }

  bold(enable: boolean): this {
    this.buffer.push(ESC, 0x45, enable ? 1 : 0); // ESC E n
    return this;
  }

  doubleSize(enable: boolean): this {
    this.buffer.push(GS, 0x21, enable ? 0x11 : 0x00); // GS ! n (0x11 = 2x height & 2x width)
    return this;
  }

  doubleHeight(enable: boolean): this {
    this.buffer.push(GS, 0x21, enable ? 0x01 : 0x00); // GS ! n (0x01 = 2x height)
    return this;
  }

  text(str: string): this {
    // Encode string to ASCII / CP437 bytes
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      this.buffer.push(code <= 255 ? code : 63); // Fallback to '?' for unsupported unicode
    }
    return this;
  }

  newline(count = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(LF);
    }
    return this;
  }

  textLine(str: string): this {
    this.text(str);
    this.newline();
    return this;
  }

  separator(char = '-', width = 32): this {
    this.textLine(char.repeat(width));
    return this;
  }

  twoColumn(left: string, right: string, width = 32): this {
    this.textLine(padRow(left, right, width));
    return this;
  }

  /**
   * Cash drawer kick-out pulse (Pins 2 & 5)
   * Standard ESC p command: ESC p m t1 t2
   */
  kickDrawer(): this {
    this.buffer.push(ESC, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  /**
   * Cut paper command (Full/Partial cut)
   * GS V m n
   */
  cut(fullCut = false): this {
    this.newline(3); // Feed 3 lines before cut so text clears the tear blade
    this.buffer.push(GS, 0x56, fullCut ? 0x00 : 0x01);
    return this;
  }

  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  toHexString(): string {
    return this.buffer.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  }
}

/**
 * Generate binary ESC/POS buffer for complete transaction receipt
 */
export function generateEscPosBinary(
  transaction: Transaction,
  settings: StoreSettings
): Uint8Array {
  const W = settings.paperWidthChars || 32;
  const encoder = new EscPosEncoder();

  // Buka Laci Kasir otomatis saat struk dicetak jika diaktifkan
  encoder.kickDrawer();

  // Header Toko
  encoder.align('center');
  encoder.bold(true);
  encoder.doubleHeight(true);
  encoder.textLine(settings.storeName.toUpperCase());
  encoder.doubleHeight(false);
  encoder.bold(false);

  if (settings.address) {
    const words = settings.address.split(' ');
    let currentLine = '';
    for (const w of words) {
      if ((currentLine + ' ' + w).trim().length <= W) {
        currentLine = (currentLine + ' ' + w).trim();
      } else {
        encoder.textLine(currentLine);
        currentLine = w;
      }
    }
    if (currentLine) encoder.textLine(currentLine);
  }

  if (settings.phone) {
    encoder.textLine('Telp: ' + settings.phone);
  }

  encoder.separator('=', W);

  // Info Transaksi
  encoder.align('left');
  const dateObj = new Date(transaction.timestamp);
  const dateStr = dateObj.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
  const timeStr = dateObj.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  });

  encoder.twoColumn(`No: ${transaction.invoiceNumber}`, `${dateStr} ${timeStr}`, W);
  encoder.twoColumn(`Kasir: ${transaction.cashierName}`, `Metode: ${transaction.paymentMethod.toUpperCase()}`, W);
  encoder.separator('-', W);

  // Daftar Item
  for (const item of transaction.items) {
    encoder.textLine(item.product.name.substring(0, W));
    const leftText = `  ${item.quantity} x ${formatRupiah(item.product.price)}`;
    const rightText = formatRupiah(item.quantity * item.product.price);
    encoder.twoColumn(leftText, rightText, W);

    if (item.notes) {
      encoder.textLine(`   *(${item.notes.substring(0, W - 6)})`);
    }
  }

  encoder.separator('-', W);

  // Subtotal, Diskon, Pajak
  encoder.twoColumn('Subtotal', `${settings.currencyPrefix} ${formatRupiah(transaction.subtotal)}`, W);
  if (transaction.discount > 0) {
    encoder.twoColumn('Diskon', `-${settings.currencyPrefix} ${formatRupiah(transaction.discount)}`, W);
  }
  if (transaction.tax > 0) {
    encoder.twoColumn(`PPN (${settings.taxRate}%)`, `${settings.currencyPrefix} ${formatRupiah(transaction.tax)}`, W);
  }

  encoder.separator('=', W);

  // Total Tebal
  encoder.bold(true);
  encoder.doubleHeight(true);
  encoder.twoColumn('TOTAL', `${settings.currencyPrefix} ${formatRupiah(transaction.total)}`, W);
  encoder.doubleHeight(false);
  encoder.bold(false);

  encoder.twoColumn('BAYAR', `${settings.currencyPrefix} ${formatRupiah(transaction.paidAmount)}`, W);
  encoder.twoColumn('KEMBALI', `${settings.currencyPrefix} ${formatRupiah(transaction.changeAmount)}`, W);

  encoder.separator('=', W);

  // Footer Message
  encoder.align('center');
  if (settings.footerMessage) {
    const footerLines = settings.footerMessage.split('\n');
    for (const fLine of footerLines) {
      encoder.textLine(fLine);
    }
  }
  encoder.textLine('*** KASIRPRO 58MM ***');

  // Potong kertas
  encoder.cut(false);

  return encoder.encode();
}

export default EscPosEncoder;
