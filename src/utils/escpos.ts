import { Transaction, StoreSettings } from '../types';
import { formatReceiptDateTime } from './timezone';

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

export function wrapText(text: string, maxLength: number): string[] {
  if (!text) return [];
  // Split into words
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;
    
    // If a single word is wider than maxLength, we must slice it by characters
    if (word.length > maxLength) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      let remaining = word;
      while (remaining.length > maxLength) {
        lines.push(remaining.substring(0, maxLength));
        remaining = remaining.substring(maxLength);
      }
      currentLine = remaining;
      continue;
    }

    if (currentLine.length + word.length + (currentLine ? 1 : 0) <= maxLength) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

export function padRowWrapped(left: string, right: string, width = 32): string {
  const halfWidth = Math.floor(width / 2);
  const leftLines = wrapText(left, halfWidth);
  const rightLines = wrapText(right, halfWidth);

  const maxLines = Math.max(leftLines.length, rightLines.length, 1);
  const lines: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const lLine = (leftLines[i] || '').trim().padEnd(halfWidth, ' ');
    const rLine = (rightLines[i] || '').trim().padStart(halfWidth, ' ');
    lines.push(lLine + rLine);
  }

  return lines.join('\n');
}

export function padSeparator(char = '-', width = 32): string {
  return char.repeat(width);
}

/**
 * Converts an image element or canvas into ESC/POS GS v 0 raster byte commands
 * for 58mm thermal printers with automatic bounding-box auto-crop (trimming empty top/bottom padding).
 */
export function convertImageToEscPosRaster(
  imgElementOrCanvas: HTMLCanvasElement | HTMLImageElement,
  maxWidthDots = 240
): Uint8Array {
  try {
    let origWidth = imgElementOrCanvas.width || (imgElementOrCanvas as HTMLImageElement).naturalWidth || 200;
    let origHeight = imgElementOrCanvas.height || (imgElementOrCanvas as HTMLImageElement).naturalHeight || 200;

    if (origWidth <= 0 || origHeight <= 0) return new Uint8Array(0);

    // 1. Draw to temporary canvas to find non-white / non-transparent bounding box (Auto-Crop Top Space)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = origWidth;
    tempCanvas.height = origHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return new Uint8Array(0);

    tempCtx.drawImage(imgElementOrCanvas, 0, 0, origWidth, origHeight);
    const rawData = tempCtx.getImageData(0, 0, origWidth, origHeight).data;

    let minY = origHeight, maxY = 0, minX = origWidth, maxX = 0;
    let foundPixel = false;

    for (let y = 0; y < origHeight; y++) {
      for (let x = 0; x < origWidth; x++) {
        const idx = (y * origWidth + x) * 4;
        const alpha = rawData[idx + 3];
        const r = rawData[idx];
        const g = rawData[idx + 1];
        const b = rawData[idx + 2];
        const luminance = alpha < 128 ? 255 : (0.299 * r + 0.587 * g + 0.114 * b);

        // Non-white pixel threshold
        if (luminance < 230) {
          foundPixel = true;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }

    // Determine crop dimensions
    let cropX = 0, cropY = 0, cropW = origWidth, cropH = origHeight;
    if (foundPixel && minY <= maxY && minX <= maxX) {
      cropX = minX;
      cropY = minY;
      cropW = maxX - minX + 1;
      cropH = maxY - minY + 1;
    }

    // Scale cropped image down to maxWidthDots
    let width = cropW;
    let height = cropH;

    if (width > maxWidthDots) {
      height = Math.round((height * maxWidthDots) / width);
      width = maxWidthDots;
    }

    // Width must be a multiple of 8 for ESC/POS raster byte packing
    width = Math.floor(width / 8) * 8;
    if (width < 8) width = 8;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return new Uint8Array(0);

    // Fill white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Draw tightly cropped artwork
    ctx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, 0, 0, width, height);

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
  const { dateStr, timeStr } = formatReceiptDateTime(transaction.timestamp, settings?.timezone);

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
  public buffer: number[] = [];

  constructor() {
    this.init();
  }

  init(): this {
    this.buffer.push(ESC, 0x40); // ESC @ : Initialize printer
    return this;
  }

  setLineSpacing(dots = 0): this {
    if (dots === 0) {
      this.buffer.push(ESC, 0x33, 0x00); // ESC 3 0
    } else {
      this.buffer.push(ESC, 0x33, dots);
    }
    return this;
  }

  resetLineSpacing(): this {
    this.buffer.push(ESC, 0x32); // ESC 2 : Reset default line spacing (~30 dots)
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
    this.buffer.push(GS, 0x21, enable ? 0x11 : 0x00); // GS ! n
    return this;
  }

  doubleHeight(enable: boolean): this {
    this.buffer.push(GS, 0x21, enable ? 0x01 : 0x00); // GS ! n
    return this;
  }

  text(str: string): this {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      this.buffer.push(code <= 255 ? code : 63);
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
   */
  kickDrawer(): this {
    this.buffer.push(ESC, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  /**
   * Appends raw raster image bytes (GS v 0) to printer stream with zero-gap line spacing
   */
  rasterImage(rasterBytes: Uint8Array): this {
    if (rasterBytes && rasterBytes.length > 0) {
      this.setLineSpacing(0);
      for (let i = 0; i < rasterBytes.length; i++) {
        this.buffer.push(rasterBytes[i]);
      }
      this.resetLineSpacing();
      this.newline(1);
    }
    return this;
  }

  /**
   * Cut paper command (Full/Partial cut)
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
 * tight top margin & custom logo auto-crop.
 */
export async function generateEscPosBinaryAsync(
  transaction: Transaction,
  settings: StoreSettings
): Promise<Uint8Array> {
  const W = settings.paperWidthChars || 32;
  const feedCount = settings.feedLines !== undefined ? settings.feedLines : 1;
  const encoder = new EscPosEncoder();

  // 1. Kick Cash Drawer
  encoder.kickDrawer();

  // 2. Custom Logo (Tight zero-gap)
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
  const { dateStr, timeStr } = formatReceiptDateTime(transaction.timestamp, settings?.timezone);

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

  // Akhir Struk: Auto Cut atau Feed
  if (settings.enableAutoCut) {
    encoder.cut(false, feedCount);
  } else {
    encoder.feed(feedCount);
  }

  return encoder.encode();
}

/**
 * Synchronous fallback
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

  const { dateStr, timeStr } = formatReceiptDateTime(transaction.timestamp, settings?.timezone);

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

  if (settings.enableAutoCut) {
    encoder.cut(false, feedCount);
  } else {
    encoder.feed(feedCount);
  }

  return encoder.encode();
}

export default EscPosEncoder;
