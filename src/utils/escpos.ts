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
 * Converts an image element or canvas into ESC/POS GS v 0 raster byte commands
 * for 58mm thermal printers (e.g. 240 dots max width, centered).
 */
export function convertImageToEscPosRaster(
  imgElementOrCanvas: HTMLCanvasElement | HTMLImageElement,
  maxWidthDots = 240
): Uint8Array {
  try {
    const canvas = document.createElement('canvas');
    let width = imgElementOrCanvas.width || (imgElementOrCanvas as HTMLImageElement).naturalWidth || 200;
    let height = imgElementOrCanvas.height || (imgElementOrCanvas as HTMLImageElement).naturalHeight || 200;

    if (width <= 0 || height <= 0) return new Uint8Array(0);

    // Scale down if width exceeds maxWidthDots
    if (width > maxWidthDots) {
      height = Math.round((height * maxWidthDots) / width);
      width = maxWidthDots;
    }

    // Width must be a multiple of 8 for ESC/POS raster byte packing
    width = Math.floor(width / 8) * 8;
    if (width < 8) width = 8;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return new Uint8Array(0);

    // Fill white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Draw image
    ctx.drawImage(imgElementOrCanvas, 0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    // ESC/POS GS v 0 Command Header: 0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH
    const bytesPerWidth = width / 8;
    const xL = bytesPerWidth % 256;
    const xH = Math.floor(bytesPerWidth / 256);
    const yL = height % 256;
    const yH = Math.floor(height / 256);

    const header = [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH];
    const rasterBytes: number[] = [...header];

    // Convert RGBA pixels to monochrome 1-bit raster data (1 = black dot, 0 = white dot)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < bytesPerWidth; x++) {
        let byteVal = 0;
        for (let b = 0; b < 8; b++) {
          const pxIndex = (y * width + (x * 8 + b)) * 4;
          const r = pixels[pxIndex];
          const g = pixels[pxIndex + 1];
          const bCol = pixels[pxIndex + 2];
          const alpha = pixels[pxIndex + 3];

          // Luminance calculation
          const luminance = alpha < 128 ? 255 : (0.299 * r + 0.587 * g + 0.114 * bCol);

          // Threshold for black thermal dot
          if (luminance < 160) {
            byteVal |= (1 << (7 - b));
          }
        }
        rasterBytes.push(byteVal);
      }
    }

    // Add trailing newline to advance paper past image
    rasterBytes.push(LF);

    return new Uint8Array(rasterBytes);
  } catch (err) {
    console.warn('Failed to convert image to ESC/POS raster:', err);
    return new Uint8Array(0);
  }
}

/**
 * Loads Base64/Data URL or Image URL and converts it asynchronously into ESC/POS GS v 0 raster bytes
 */
export async function loadLogoRasterBytes(logoUrl: string, maxWidthDots = 240): Promise<Uint8Array> {
  if (!logoUrl || typeof window === 'undefined') return new Uint8Array(0);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const rasterBytes = convertImageToEscPosRaster(img, maxWidthDots);
        resolve(rasterBytes);
      } catch (e) {
        console.warn('Raster conversion error:', e);
        resolve(new Uint8Array(0));
      }
    };
    img.onerror = (err) => {
      console.warn('Logo image loading failed for printer rasterization:', err);
      resolve(new Uint8Array(0));
    };
    img.src = logoUrl;
  });
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
  const feedCount = settings.feedLines !== undefined ? settings.feedLines : 1;
  for (let i = 0; i < feedCount; i++) {
    lines.push('');
  }

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

  feed(lines = 1): this {
    return this.newline(lines);
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
   * Appends raw raster image bytes (GS v 0) to printer stream
   */
  rasterImage(rasterBytes: Uint8Array): this {
    if (rasterBytes && rasterBytes.length > 0) {
      for (let i = 0; i < rasterBytes.length; i++) {
        this.buffer.push(rasterBytes[i]);
      }
    }
    return this;
  }

  /**
   * Cut paper command (Full/Partial cut)
   * GS V m n
   */
  cut(fullCut = false, feedCount = 1): this {
    if (feedCount > 0) {
      this.newline(feedCount);
    }
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
 * Generate binary ESC/POS buffer for complete transaction receipt asynchronously
 * including custom store logo rasterization if logoUrl is provided!
 */
export async function generateEscPosBinaryAsync(
  transaction: Transaction,
  settings: StoreSettings
): Promise<Uint8Array> {
  const W = settings.paperWidthChars || 32;
  const feedCount = settings.feedLines !== undefined ? settings.feedLines : 1;
  const encoder = new EscPosEncoder();

  // 1. Buka Laci Kasir
  encoder.kickDrawer();

  // 2. Cetak Logo Kustom jika ada
  if (settings.logoUrl) {
    try {
      const logoRasterBytes = await loadLogoRasterBytes(settings.logoUrl, 240);
      if (logoRasterBytes && logoRasterBytes.length > 0) {
        encoder.align('center');
        encoder.rasterImage(logoRasterBytes);
      }
    } catch (e) {
      console.warn('Failed to append logo raster to receipt:', e);
    }
  }

  // 3. Header Toko
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

  // 4. Info Transaksi
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

  // 5. Daftar Item
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

  // 6. Subtotal, Diskon, Pajak
  encoder.twoColumn('Subtotal', `${settings.currencyPrefix} ${formatRupiah(transaction.subtotal)}`, W);
  if (transaction.discount > 0) {
    encoder.twoColumn('Diskon', `-${settings.currencyPrefix} ${formatRupiah(transaction.discount)}`, W);
  }
  if (transaction.tax > 0) {
    encoder.twoColumn(`PPN (${settings.taxRate}%)`, `${settings.currencyPrefix} ${formatRupiah(transaction.tax)}`, W);
  }

  encoder.separator('=', W);

  // 7. Total Tebal
  encoder.bold(true);
  encoder.doubleHeight(true);
  encoder.twoColumn('TOTAL', `${settings.currencyPrefix} ${formatRupiah(transaction.total)}`, W);
  encoder.doubleHeight(false);
  encoder.bold(false);

  encoder.twoColumn('BAYAR', `${settings.currencyPrefix} ${formatRupiah(transaction.paidAmount)}`, W);
  encoder.twoColumn('KEMBALI', `${settings.currencyPrefix} ${formatRupiah(transaction.changeAmount)}`, W);

  encoder.separator('=', W);

  // 8. Footer Message
  encoder.align('center');
  if (settings.footerMessage) {
    const footerLines = settings.footerMessage.split('\n');
    for (const fLine of footerLines) {
      encoder.textLine(fLine);
    }
  }
  encoder.textLine('*** KASIRPRO 58MM ***');

  // Akhir Struk: Auto Cut atau Feed
  if (settings.enableAutoCut) {
    encoder.cut(false, feedCount);
  } else {
    encoder.feed(feedCount);
  }

  return encoder.encode();
}

/**
 * Synchronous wrapper for backwards compatibility
 */
export function generateEscPosBinary(
  transaction: Transaction,
  settings: StoreSettings
): Uint8Array {
  const W = settings.paperWidthChars || 32;
  const feedCount = settings.feedLines !== undefined ? settings.feedLines : 1;
  const encoder = new EscPosEncoder();

  encoder.kickDrawer();
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
  encoder.twoColumn('Subtotal', `${settings.currencyPrefix} ${formatRupiah(transaction.subtotal)}`, W);
  if (transaction.discount > 0) {
    encoder.twoColumn('Diskon', `-${settings.currencyPrefix} ${formatRupiah(transaction.discount)}`, W);
  }
  if (transaction.tax > 0) {
    encoder.twoColumn(`PPN (${settings.taxRate}%)`, `${settings.currencyPrefix} ${formatRupiah(transaction.tax)}`, W);
  }

  encoder.separator('=', W);
  encoder.bold(true);
  encoder.doubleHeight(true);
  encoder.twoColumn('TOTAL', `${settings.currencyPrefix} ${formatRupiah(transaction.total)}`, W);
  encoder.doubleHeight(false);
  encoder.bold(false);

  encoder.twoColumn('BAYAR', `${settings.currencyPrefix} ${formatRupiah(transaction.paidAmount)}`, W);
  encoder.twoColumn('KEMBALI', `${settings.currencyPrefix} ${formatRupiah(transaction.changeAmount)}`, W);

  encoder.separator('=', W);
  encoder.align('center');

  if (settings.footerMessage) {
    const footerLines = settings.footerMessage.split('\n');
    for (const fLine of footerLines) {
      encoder.textLine(fLine);
    }
  }
  encoder.textLine('*** KASIRPRO 58MM ***');

  if (settings.enableAutoCut) {
    encoder.cut(false, feedCount);
  } else {
    encoder.feed(feedCount);
  }

  return encoder.encode();
}

export default EscPosEncoder;
