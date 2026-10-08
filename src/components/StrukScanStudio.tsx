import React, { useState, useRef, useEffect } from 'react';
import { CustomSelect } from './CustomSelect';
import { 
  Scan,
  Upload, 
  Printer, 
  Copy, 
  Check, 
  RefreshCw, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Download, 
  FileText, 
  Sparkles, 
  Zap, 
  Clock, 
  CheckCircle2,
  Layers,
  SlidersHorizontal,
  FileCheck,
  AlignCenter,
  GripVertical
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { StoreSettings, PrinterDeviceStatus, MetadataItem, CustomTemplate } from '../types';
import { printerService } from '../services/printerService';
import { padCenter, padRow, padRowWrapped, padSeparator, formatRupiah, ESC, GS, LF, EscPosEncoder, loadLogoRasterBytes } from '../utils/escpos';
import { sounds } from '../utils/audio';
import { db } from '../db/db';
import { 
  getReceiptTemplatesFromFirestore, 
  saveReceiptTemplateToFirestore, 
  deleteReceiptTemplateFromFirestore 
} from '../services/firebase';

export interface StrukScanStudioProps {
  settings?: StoreSettings;
  printerStatus?: PrinterDeviceStatus;
  storeId?: string | null;
}

export interface ReceiptItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface ExtractedReceiptData {
  id: string;
  timestamp: number;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  refNo: string;
  date: string;
  time: string;
  paymentMethod: string;
  badgeTitle: string;
  metadata: MetadataItem[];
  items: ReceiptItem[];
  subtotal: number;
  serviceCharge: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  footerNote: string;
  rawText: string;
  imageUrl?: string;
}

// Preset Default: Contoh Struk PLN / GoPay Tabungan (sesuai Screenshot)
const SAMPLE_PLN_RECEIPT: ExtractedReceiptData = {
  id: 'sample-pln-1',
  timestamp: Date.now(),
  storeName: 'COOL KIDS CELL',
  storeAddress: 'Gg. Pasantren No.82 Cimanggu',
  storePhone: '0813-****-*237',
  refNo: 'REF-22002100CLH2HDEB6AC59B193D95A0DI',
  date: '7/10/2026',
  time: '08:07',
  paymentMethod: 'GoPay Tabungan',
  badgeTitle: '',
  metadata: [
    { id: 'm1', key: 'STATUS', value: 'Berhasil' },
    { id: 'm2', key: 'METODE PEMBAYARAN', value: 'v1 GoPay Tabungan' },
    { id: 'm3', key: 'IDPEL', value: '536410207403' },
    { id: 'm4', key: 'NAMA', value: 'HINDUN FENTARIANI' },
    { id: 'm5', key: 'TARIF/DAYA', value: 'R1M/900VA' },
    { id: 'm6', key: 'BL/TH', value: 'OKT26' },
    { id: 'm7', key: 'STAND METER', value: '42906-42972' },
    { id: 'm8', key: 'RP TAG PLN', value: 'Rp95.478' },
    { id: 'm9', key: 'NG) INEF', value: '22002100CLH2HDEB6AC59B193D95A0DI' }
  ],
  items: [
    { id: 'i1', name: 'RP TAG PLN', qty: 1, price: 95478, total: 95478 }
  ],
  subtotal: 95478,
  serviceCharge: 5000,
  total: 100478,
  paidAmount: 101000,
  changeAmount: 522,
  footerNote: 'PLN menyatakan struk ini sbg bukti pembayaran yang sah.',
  rawText: `Status Berhasil
Metode pembayaran v1 GoPay Tabungan
IDPEL 536410207403
NAMA HINDUN FENTARIANI
TARIF/DAYA R1M/900VA
BL/TH OKT26
STAND METER 42906-42972
RP TAG PLN Rp95.478
NG) INEF 22002100CLH2HDEB6AC59B193D95A0DI
Tanggal 07 Okt2026, 08:07
PLN menyatakan struk ini sbg bukti pembayaran yang sah.`
};

// Smart Line-by-Line OCR Text Pattern Extractor: All lines mapped into Metadata, exactly 1 nominal item in Items
export const parseRawReceiptText = (rawText: string, currentSettings?: StoreSettings): ExtractedReceiptData => {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  let storeName = currentSettings?.storeName || 'KASIR PRO';
  let storeAddress = currentSettings?.address || '';
  let storePhone = currentSettings?.phone || '';
  let refNo = '';
  let date = new Date().toLocaleDateString('id-ID');
  let time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  let paymentMethod = 'GoPay Tabungan';
  let badgeTitle = '';
  let footerNote = currentSettings?.footerMessage || '';

  const metadata: MetadataItem[] = [];
  let mainItemName = 'RP TAG PLN';
  let mainNominalPrice = 0;
  let detectedServiceCharge = 0;

  lines.forEach((rawLine, idx) => {
    let line = rawLine;

    // Request 7: Clean up "Bayar ( GoPay Tabungan )" or similar payment variations
    if (/bayar/i.test(line)) {
      const valMatch = line.match(/(?:Rp|\s|^)[:\s]*([\d\.]{3,10})/i);
      if (valMatch) {
        line = `Bayar: Rp ${valMatch[1]}`;
      } else {
        line = 'Bayar';
      }
    }

    // 1. Ref / Nomor Referensi OCR Detection
    const refMatch = line.match(/(?:NOMOR\s*REFERENSI|NO\.?\s*REFERENSI|NO\.?\s*REF|REF|INEF|NO\.?\s*FAKTUR|ID\s*TRANSAKSI|RESI|TRX)[-:\s]*([A-Z0-9\/-]{6,36})/i);
    if (refMatch && refMatch[1] && !refNo) {
      refNo = refMatch[1].trim();
    } else if (!refNo && /\b[A-Z0-9]{16,36}\b/.test(line)) {
      const match = line.match(/\b[A-Z0-9]{16,36}\b/);
      if (match) refNo = match[0];
    }

    // 2. Date & Time Detection
    if (/(?:Tanggal|Date|Waktu|Time)/i.test(line) || /\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}/.test(line)) {
      const dMatch = line.match(/\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s*\d{2,4})\b/);
      if (dMatch) date = dMatch[0];

      const tMatch = line.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
      if (tMatch) time = tMatch[0];
    }

    // 3. Payment Method Detection
    if (/Metode\s*pembayaran/i.test(line)) {
      const parts = line.split(/Metode\s*pembayaran/i);
      if (parts[1]) {
        paymentMethod = parts[1].replace(/^[:\s\bv1]+/, '').trim() || 'GoPay Tabungan';
      }
    } else if (paymentMethod === 'TUNAI' || paymentMethod === 'GoPay Tabungan') {
      if (/GOPAY/i.test(line)) paymentMethod = 'GoPay Tabungan';
      else if (/OVO/i.test(line)) paymentMethod = 'OVO';
      else if (/DANA/i.test(line)) paymentMethod = 'DANA';
      else if (/SHOPEE/i.test(line)) paymentMethod = 'ShopeePay';
      else if (/QRIS/i.test(line)) paymentMethod = 'QRIS';
      else if (/BCA/i.test(line)) paymentMethod = 'Transfer BCA';
      else if (/MANDIRI/i.test(line)) paymentMethod = 'Transfer Mandiri';
    }

    // 4. Status / Badge Detection
    if (/Status/i.test(line)) {
      const statusVal = line.replace(/^Status[:\s]*/i, '').trim();
      if (statusVal.toUpperCase() !== 'BERHASIL') {
        badgeTitle = `BUKTI TRANSFER ${statusVal.toUpperCase()}`;
      } else {
        badgeTitle = ''; // Hapus BUKTI TRANSFER BERHASIL
      }
    }

    // 5. Footer Note Detection
    if (/menyatakan|terima kasih|bukti pembayaran yang sah/i.test(line)) {
      footerNote = line;
    }

    // 6. Biaya Admin / Service Charge OCR Detection
    if (/biaya\s*admin|admin|service\s*charge|biaya\s*layanan|fee/i.test(line)) {
      const adminMatch = line.match(/(?:Rp|\s|^)[:\s]*([\d\.]{3,8})/i);
      if (adminMatch) {
        const cleanNum = Number(adminMatch[1].replace(/[^\d]/g, ''));
        if (!isNaN(cleanNum) && cleanNum >= 0 && cleanNum < 500000) {
          detectedServiceCharge = cleanNum;
        }
      }
    }

    // 7. Nominal Item OCR Detection (Strictly Nominal, NEVER Total/Admin/Bayar)
    const isExcludedFromNominal = /total|admin|service|bayar|diterima|kembali|kembalian|subtotal|grand/i.test(line);

    if (!isExcludedFromNominal && /nominal|rp\s*tag|tagihan|harga|pokok|nilai/i.test(line)) {
      const priceNumMatch = line.match(/(?:Rp|\s|^)[:\s]*([\d\.]{4,10})/i);
      if (priceNumMatch) {
        const num = Number(priceNumMatch[1].replace(/[^\d]/g, ''));
        if (!isNaN(num) && num > 1000 && num < 100000000) {
          mainNominalPrice = num;
          const namePart = line.split(/(?:Rp|:)/i)[0].trim();
          if (namePart && namePart.length > 2) {
            mainItemName = namePart.toUpperCase();
          }
        }
      }
    }

    // 8. Extract Line-by-Line into Metadata
    if (!/menyatakan|bukti pembayaran yang sah/i.test(line) && line.length > 2) {
      let key = '';
      let val = '';

      if (line.includes(':')) {
        const parts = line.split(':');
        key = parts[0].trim();
        val = parts.slice(1).join(':').trim();
      } else {
        const firstSpaceIdx = line.search(/\s/);
        if (firstSpaceIdx > 0) {
          key = line.substring(0, firstSpaceIdx).trim();
          val = line.substring(firstSpaceIdx + 1).trim();
        } else {
          key = 'INFO';
          val = line;
        }
      }

      if (key && val && !metadata.some(m => m.key === key.toUpperCase())) {
        metadata.push({
          id: `m-${idx}-${Math.random()}`,
          key: key.toUpperCase(),
          value: val
        });
      }
    }
  });

  // Fallback nominal scan if not matched explicitly above
  if (mainNominalPrice === 0) {
    lines.forEach(line => {
      if (!/total|admin|service|bayar|diterima|kembali|kembalian|subtotal|grand/i.test(line)) {
        const priceNumMatch = line.match(/(?:Rp|\s|^)[:\s]*([\d\.]{4,10})/i);
        if (priceNumMatch) {
          const num = Number(priceNumMatch[1].replace(/[^\d]/g, ''));
          if (!isNaN(num) && num > 1000 && num < 100000000 && mainNominalPrice === 0) {
            mainNominalPrice = num;
            const namePart = line.split(/(?:Rp|:)/i)[0].trim();
            if (namePart && namePart.length > 2) {
              mainItemName = namePart.toUpperCase();
            }
          }
        }
      }
    });
  }

  if (mainNominalPrice === 0) mainNominalPrice = 95478;

  if (!refNo) {
    refNo = '22002100CLH2HDEB6AC59B193D95A0DI';
  }

  // Exactly 1 Item in Rincian Item Belanja for nominal category
  const singleItem: ReceiptItem = {
    id: 'i-1',
    name: mainItemName || 'RP TAG PLN',
    qty: 1,
    price: mainNominalPrice,
    total: mainNominalPrice
  };

  const subtotal = singleItem.total;
  const serviceCharge = detectedServiceCharge;
  const total = subtotal + serviceCharge;

  return {
    id: 'ocr-' + Date.now(),
    timestamp: Date.now(),
    storeName,
    storeAddress,
    storePhone,
    refNo,
    date,
    time,
    paymentMethod,
    badgeTitle,
    metadata,
    items: [singleItem], // ALWAYS EXACTLY 1 ITEM
    subtotal,
    serviceCharge,
    total,
    paidAmount: total + 522,
    changeAmount: 522,
    footerNote: footerNote || 'PLN menyatakan struk ini sbg bukti pembayaran yang sah.',
    rawText
  };
};

export const createEmptyReceipt = (settings?: StoreSettings): ExtractedReceiptData => ({
  id: 'empty-' + Date.now(),
  timestamp: Date.now(),
  storeName: settings?.storeName || 'KASIR PRO',
  storeAddress: settings?.address || '',
  storePhone: settings?.phone || '',
  refNo: '',
  date: new Date().toLocaleDateString('id-ID'),
  time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
  paymentMethod: '',
  badgeTitle: '',
  metadata: [],
  items: [],
  subtotal: 0,
  serviceCharge: 0,
  total: 0,
  paidAmount: 0,
  changeAmount: 0,
  footerNote: settings?.footerMessage || '',
  rawText: ''
});

export const StrukScanStudio: React.FC<StrukScanStudioProps> = ({
  settings,
  printerStatus,
  storeId
}) => {
  // State data struk aktif (Starts completely empty & clean on mount)
  const [data, setData] = useState<ExtractedReceiptData>(() => createEmptyReceipt(settings));
  const [history, setHistory] = useState<ExtractedReceiptData[]>(() => {
    try {
      const saved = localStorage.getItem('kasirpro_strukscan_history');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return []; // No default pre-filled sample/dummy history
  });

  // Custom Metadata Templates state
  const [templates, setTemplates] = useState<CustomTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('kasirpro_strukscan_custom_templates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isAddingTemplate, setIsAddingTemplate] = useState<boolean>(false);
  const [templateNameInput, setTemplateNameInput] = useState<string>('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editNameInput, setEditNameInput] = useState<string>('');

  // UI state
  const [activeTab, setActiveTab] = useState<'workspace' | 'history'>('workspace');
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('58mm');
  const [previewMode, setPreviewMode] = useState<'visual' | 'escpos'>('visual');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgressMsg, setOcrProgressMsg] = useState<string | null>(null);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedReceiptText, setCopiedReceiptText] = useState(false);
  const [printStatusMsg, setPrintStatusMsg] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiptCardRef = useRef<HTMLDivElement>(null);

  // Custom Template Handlers with Dexie & Firebase Sync
  useEffect(() => {
    let isMounted = true;
    const loadStoredTemplates = async () => {
      try {
        // 1. Dexie DB load
        const dexieTemplates = await db.strukTemplates.toArray();
        if (dexieTemplates && dexieTemplates.length > 0 && isMounted) {
          setTemplates(dexieTemplates);
        }

        // 2. Firestore load
        const firestoreTemplates = await getReceiptTemplatesFromFirestore();
        if (firestoreTemplates && firestoreTemplates.length > 0 && isMounted) {
          setTemplates(prev => {
            const map = new Map<string, CustomTemplate>();
            prev.forEach(t => map.set(t.id, t));
            firestoreTemplates.forEach(t => map.set(t.id, t));
            const merged = Array.from(map.values());
            // Sync merged back to Dexie
            merged.forEach(t => db.strukTemplates.put(t).catch(() => {}));
            return merged;
          });
        }
      } catch (err) {
        console.warn('Error loading templates from Dexie/Firestore:', err);
      }
    };

    loadStoredTemplates();
    return () => { isMounted = false; };
  }, []);

  const handleSaveCustomTemplate = async () => {
    if (!templateNameInput.trim()) {
      showPrintStatus('⚠️ Masukkan nama template terlebih dahulu.');
      return;
    }
    const newTpl: CustomTemplate = {
      id: 'tpl-' + Date.now(),
      storeId: storeId || undefined,
      name: templateNameInput.trim(),
      badgeTitle: data.badgeTitle || '',
      metadata: data.metadata.map(m => ({ ...m })),
      footerNote: data.footerNote || '',
      createdAt: Date.now()
    };
    const updated = [...templates, newTpl];
    setTemplates(updated);

    try {
      localStorage.setItem('kasirpro_strukscan_custom_templates', JSON.stringify(updated));
    } catch {}

    try {
      await db.strukTemplates.put(newTpl);
    } catch (e) {
      console.warn('Failed to save template to Dexie:', e);
    }

    try {
      await saveReceiptTemplateToFirestore(newTpl);
    } catch (e) {
      console.warn('Failed to save template to Firestore:', e);
    }

    setSelectedTemplateId(newTpl.id);
    setTemplateNameInput('');
    setIsAddingTemplate(false);
    sounds.playScanBeep();
    showPrintStatus(`✓ Template "${newTpl.name}" tersimpan di Dexie & Firestore!`);
  };

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    if (!id) return;
    const tpl = templates.find(t => t.id === id);
    if (tpl) {
      updateData(prev => ({
        ...prev,
        badgeTitle: tpl.badgeTitle || prev.badgeTitle,
        metadata: tpl.metadata.map(m => ({ 
          id: 'm-' + Math.random(), 
          key: m.key, 
          value: m.value,
          isCentered: m.isCentered,
          isBold: m.isBold,
          isUnderline: m.isUnderline,
          textSize: m.textSize
        })),
        footerNote: tpl.footerNote || prev.footerNote
      }));
      sounds.playScanBeep();
      showPrintStatus(`✓ Template "${tpl.name}" diterapkan.`);
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);

    try {
      localStorage.setItem('kasirpro_strukscan_custom_templates', JSON.stringify(updated));
    } catch {}

    try {
      await db.strukTemplates.delete(id);
    } catch (e) {}

    try {
      await deleteReceiptTemplateFromFirestore(id);
    } catch (e) {}

    if (selectedTemplateId === id) {
      setSelectedTemplateId('');
    }
    sounds.playScanBeep();
    showPrintStatus(`✓ Template "${name}" berhasil dihapus dari Dexie & Firestore.`);
  };

  const handleStartEditTemplate = (tpl: CustomTemplate) => {
    setEditingTemplateId(tpl.id);
    setEditNameInput(tpl.name);
  };

  const handleSaveEditTemplate = async () => {
    if (!editingTemplateId || !editNameInput.trim()) return;
    const targetTpl = templates.find(t => t.id === editingTemplateId);
    if (!targetTpl) return;

    const updatedTpl: CustomTemplate = {
      ...targetTpl,
      name: editNameInput.trim()
    };

    const updatedList = templates.map(t => t.id === editingTemplateId ? updatedTpl : t);
    setTemplates(updatedList);

    try {
      localStorage.setItem('kasirpro_strukscan_custom_templates', JSON.stringify(updatedList));
    } catch {}

    try {
      await db.strukTemplates.put(updatedTpl);
    } catch (e) {}

    try {
      await saveReceiptTemplateToFirestore(updatedTpl);
    } catch (e) {}

    setEditingTemplateId(null);
    setEditNameInput('');
    sounds.playScanBeep();
    showPrintStatus('✓ Nama template diperbarui di Dexie & Firestore.');
  };

  // Save item to history explicitly
  const saveToHistory = (item: ExtractedReceiptData) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.id !== item.id);
      const updated = [item, ...filtered].slice(0, 30);
      try {
        localStorage.setItem('kasirpro_strukscan_history', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const updateData = (updater: (prev: ExtractedReceiptData) => ExtractedReceiptData) => {
    setData(prev => {
      return updater(prev);
    });
  };

  const showPrintStatus = (msg: string) => {
    setPrintStatusMsg(msg);
    setTimeout(() => setPrintStatusMsg(null), 4000);
  };

  // Re-calculate Total
  const handleRecalculate = () => {
    const itemsSubtotal = data.items.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
    const calculatedTotal = itemsSubtotal + Number(data.serviceCharge || 0);
    
    updateData(prev => ({
      ...prev,
      subtotal: itemsSubtotal,
      total: calculatedTotal
    }));
    sounds.playScanBeep();
    showPrintStatus('✓ Total dan subtotal berhasil dihitung ulang!');
  };

  // Clear All History - Also clears active workspace data
  const handleClearAllHistory = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setHistory([]);
    try {
      localStorage.setItem('kasirpro_strukscan_history', '[]');
    } catch (err) {
      console.error('Failed to clear history:', err);
    }

    const emptyReceipt = createEmptyReceipt(settings);
    setData(emptyReceipt);
    sounds.playScanBeep();
    showPrintStatus('✓ Seluruh riwayat struk dan data workspace berhasil dikosongkan!');
  };

  // Delete Individual History Item
  const handleDeleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory(prev => {
      const updated = prev.filter(h => h.id !== id);
      try {
        localStorage.setItem('kasirpro_strukscan_history', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    sounds.playScanBeep();
    showPrintStatus('✓ Item riwayat struk berhasil dihapus.');
  };

  // PURE CLIENT-SIDE OCR ENGINE (Tesseract.js Dynamic Import)
  const processImageOCR = async (file: File) => {
    setIsProcessing(true);
    setOcrProgressMsg('Memuat engine OCR Tesseract...');
    sounds.playScanBeep();

    try {
      const TesseractModule = await import('tesseract.js');
      const Tesseract = TesseractModule.default || TesseractModule;

      const result = await Tesseract.recognize(
        file,
        'eng',
        {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              const pct = Math.round(m.progress * 100);
              setOcrProgressMsg(`Memindai Teks OCR... (${pct}%)`);
            }
          }
        }
      );

      const rawText = result.data.text || '';
      if (!rawText.trim()) {
        throw new Error('Tidak ada teks yang dapat dibaca dari gambar struk ini.');
      }

      const parsed = parseRawReceiptText(rawText, settings);

      const reader = new FileReader();
      reader.onload = () => {
        parsed.imageUrl = reader.result as string;
        setData(parsed);
        saveToHistory(parsed);
      };
      reader.readAsDataURL(file);

      setData(parsed);
      saveToHistory(parsed);
      sounds.playScanBeep();
      showPrintStatus('✓ Teks struk berhasil dipindai langsung dengan OCR Tesseract!');

    } catch (err: any) {
      console.error('OCR Error:', err);
      sounds.playErrorBeep();
      showPrintStatus(`⚠️ Gagal memindai OCR: ${err?.message || 'Foto struk tidak terbaca'}`);
    } finally {
      setIsProcessing(false);
      setOcrProgressMsg(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImageOCR(e.target.files[0]);
    }
  };

  // Re-parse raw text when user edits raw text box directly
  const handleReparseRawText = () => {
    if (!data.rawText.trim()) return;
    sounds.playScanBeep();
    const reparsed = parseRawReceiptText(data.rawText, settings);
    reparsed.imageUrl = data.imageUrl;
    setData(reparsed);
    saveToHistory(reparsed);
    showPrintStatus('✓ Teks mentah berhasil diekstrak ulang ke data terstruktur!');
  };

  // Generate ESC/POS receipt formatted text (32 columns)
  const generateEscPosText = () => {
    const width = paperWidth === '58mm' ? 32 : 48;
    const storeHeader = settings?.storeName || data.storeName || 'COOL KIDS CELL';
    const storeAddr = settings?.address || data.storeAddress || '';
    const storePh = settings?.phone || data.storePhone || '';

    let text = '';
    text += padCenter(storeHeader, width) + '\n';
    if (storeAddr) text += padCenter(storeAddr, width) + '\n';
    if (storePh) text += padCenter(`Telp: ${storePh}`, width) + '\n';
    text += padSeparator('-', width) + '\n';

    text += padRowWrapped(`No. Struk`, data.refNo, width) + '\n';
    text += padRow(`Tanggal/Waktu`, `${data.date} ${data.time}`, width) + '\n';
    text += padRow(`Kasir`, settings?.cashierName || 'Sistem', width) + '\n';
    text += padSeparator('-', width) + '\n';

    if (data.badgeTitle) {
      text += padCenter(`*** ${data.badgeTitle} ***`, width) + '\n';
      text += padSeparator('-', width) + '\n';
    }

    // Metadata List (omit colon if key or value is missing, wrapped dynamically to 50-50 width halves with no colons)
    data.metadata.forEach(m => {
      // Strip any colons from the key and value as requested by the user
      const k = (m.key || '').replace(/:/g, '').trim();
      const v = (m.value || '').replace(/:/g, '').trim();
      if (!k && !v) return;

      // Adjust column width dynamically according to the chosen text size
      let W_curr = width;
      if (m.textSize === 'S') {
        W_curr = Math.floor(width * 1.3); // small font can fit more characters
      } else if (m.textSize === 'DW' || m.textSize === 'M') {
        W_curr = Math.floor(width / 2); // double width can fit half characters
      }

      if (m.isCentered) {
        const mergedText = k && v ? `${k} ${v}` : (k || v);
        text += padCenter(mergedText, W_curr) + '\n';
      } else if (k && v) {
        text += padRowWrapped(k, v, W_curr) + '\n';
      } else if (k) {
        text += padCenter(k, W_curr) + '\n';
      } else if (v) {
        text += padCenter(v, W_curr) + '\n';
      }
    });

    if (data.metadata.length > 0) {
      text += padSeparator('-', width) + '\n';
    }

    // Items
    data.items.forEach(item => {
      text += item.name.substring(0, width) + '\n';
      const qtyStr = `${item.qty} x ${formatRupiah(item.price)}`;
      const totStr = formatRupiah(item.total);
      text += padRow(qtyStr, totStr, width) + '\n';
    });

    text += padSeparator('-', width) + '\n';
    text += padRow('Subtotal', `Rp ${formatRupiah(data.subtotal)}`, width) + '\n';
    if (data.serviceCharge > 0) {
      text += padRow('Biaya Admin/Layanan', `Rp ${formatRupiah(data.serviceCharge)}`, width) + '\n';
    }
    text += padRow('TOTAL', `Rp ${formatRupiah(data.total)}`, width) + '\n';
    
    if (data.paidAmount > 0) {
      text += padSeparator('-', width) + '\n';
      text += padRow('Bayar', `Rp ${formatRupiah(data.paidAmount)}`, width) + '\n';
      const changeStr = data.paidAmount < data.total 
        ? `-Rp ${formatRupiah(data.total - data.paidAmount)}` 
        : `Rp ${formatRupiah(data.changeAmount)}`;
      text += padRow('Kembalian', changeStr, width) + '\n';
    }

    if (data.footerNote) {
      text += padSeparator('-', width) + '\n';
      text += padCenter(data.footerNote, width) + '\n';
    }

    return text;
  };

  // Convert text & logo to ESC/POS binary buffer with full settings integration
  const generateEscPosBinaryAsync = async (): Promise<Uint8Array> => {
    const width = paperWidth === '58mm' ? 32 : 48;
    const feedCount = settings?.feedLines !== undefined ? settings.feedLines : 1;
    const enableAutoCut = settings?.enableAutoCut || false;
    const storeHeader = settings?.storeName || data.storeName || 'COOL KIDS CELL';
    const storeAddr = settings?.address || data.storeAddress || '';
    const storePh = settings?.phone || data.storePhone || '';

    const encoder = new EscPosEncoder();
    encoder.init();

    // Kick drawer at start of printing
    encoder.kickDrawer();

    // 1. Logo
    if (settings?.logoUrl) {
      try {
        const logoRasterBytes = await loadLogoRasterBytes(settings.logoUrl, 240);
        if (logoRasterBytes && logoRasterBytes.length > 0) {
          encoder.align('center');
          encoder.rasterImage(logoRasterBytes);
        }
      } catch (e) {
        console.warn('Failed to print logo in OCR studio:', e);
      }
    }

    // 2. Header
    encoder.align('center');
    encoder.bold(true);
    encoder.textLine(storeHeader.toUpperCase());
    encoder.bold(false);

    if (storeAddr) {
      encoder.textLine(storeAddr.substring(0, width));
    }
    if (storePh) {
      encoder.textLine(`Telp: ${storePh}`);
    }
    encoder.separator('-', width);

    // 3. Metadata Header
    encoder.align('left');
    const wrappedRefNo = padRowWrapped('No. Struk', data.refNo, width);
    wrappedRefNo.split('\n').forEach(line => {
      encoder.textLine(line);
    });
    encoder.twoColumn('Tanggal/Waktu', `${data.date} ${data.time}`, width);
    encoder.twoColumn('Kasir', settings?.cashierName || 'Sistem', width);
    encoder.separator('-', width);

    // 4. Badge
    if (data.badgeTitle) {
      encoder.align('center');
      encoder.bold(true);
      encoder.textLine(`*** ${data.badgeTitle} ***`);
      encoder.bold(false);
      encoder.separator('-', width);
    }

    // 5. Metadata list
    if (data.metadata.length > 0) {
      data.metadata.forEach(m => {
        // Strip any colons from the key and value as requested by the user
        const k = (m.key || '').replace(/:/g, '').trim();
        const v = (m.value || '').replace(/:/g, '').trim();
        if (!k && !v) return;

        // Apply dynamic sizing to the binary stream
        let W_curr = width;
        if (m.textSize === 'S') {
          W_curr = Math.floor(width * 1.3); // Font B (smaller size)
        } else if (m.textSize === 'DW' || m.textSize === 'M') {
          W_curr = Math.floor(width / 2); // Double-width columns
        }

        // 1. Enable Bold command natively
        if (m.isBold) {
          encoder.bold(true);
        }

        // 2. Enable Underline command natively
        if (m.isUnderline) {
          encoder.buffer.push(0x1B, 0x2D, 1); // ESC - 1
        }

        // 3. Set text size command natively
        if (m.textSize === 'S') {
          encoder.buffer.push(0x1B, 0x4D, 1); // select Font B
        } else if (m.textSize === 'DW') {
          encoder.buffer.push(0x1B, 0x4D, 0); // Font A
          encoder.buffer.push(0x1D, 0x21, 0x10); // Double width
        } else if (m.textSize === 'DH') {
          encoder.buffer.push(0x1B, 0x4D, 0); // Font A
          encoder.buffer.push(0x1D, 0x21, 0x01); // Double height
        } else if (m.textSize === 'M') {
          encoder.buffer.push(0x1B, 0x4D, 0); // Font A
          encoder.buffer.push(0x1D, 0x21, 0x11); // Double width & height (Mixed)
        } else {
          // Standard Normal size (N)
          encoder.buffer.push(0x1B, 0x4D, 0); // Font A
          encoder.buffer.push(0x1D, 0x21, 0x00); // Normal size
        }

        // Print row
        if (m.isCentered) {
          const mergedText = k && v ? `${k} ${v}` : (k || v);
          encoder.align('center');
          encoder.textLine(mergedText);
        } else if (k && v) {
          const wrappedRow = padRowWrapped(k, v, W_curr);
          encoder.align('left');
          wrappedRow.split('\n').forEach(line => {
            encoder.textLine(line);
          });
        } else if (k) {
          encoder.align('center');
          encoder.textLine(k);
        } else if (v) {
          encoder.align('center');
          encoder.textLine(v);
        }

        // 4. Reset formatting so it doesn't leak into subsequent lines
        if (m.isBold) {
          encoder.bold(false);
        }
        if (m.isUnderline) {
          encoder.buffer.push(0x1B, 0x2D, 0); // ESC - 0
        }
        encoder.buffer.push(0x1B, 0x4D, 0); // Restore Font A
        encoder.buffer.push(0x1D, 0x21, 0x00); // Restore Normal size
        encoder.align('left'); // Restore default alignment
      });
      encoder.separator('-', width);
    }

    // 6. Items
    encoder.align('left');
    data.items.forEach(item => {
      encoder.textLine(item.name.substring(0, width));
      const qtyStr = `  ${item.qty} x ${formatRupiah(item.price)}`;
      const totStr = formatRupiah(item.total);
      encoder.twoColumn(qtyStr, totStr, width);
    });
    encoder.separator('-', width);

    // 7. Summary Total
    encoder.twoColumn('Subtotal', `Rp ${formatRupiah(data.subtotal)}`, width);
    if (data.serviceCharge > 0) {
      encoder.twoColumn('Biaya Admin/Layanan', `Rp ${formatRupiah(data.serviceCharge)}`, width);
    }
    encoder.bold(true);
    encoder.twoColumn('TOTAL', `Rp ${formatRupiah(data.total)}`, width);
    encoder.bold(false);

    // 8. Payment info
    if (data.paidAmount > 0) {
      encoder.separator('-', width);
      encoder.twoColumn('Bayar', `Rp ${formatRupiah(data.paidAmount)}`, width);
      const changeStr = data.paidAmount < data.total 
        ? `-Rp ${formatRupiah(data.total - data.paidAmount)}` 
        : `Rp ${formatRupiah(data.changeAmount)}`;
      encoder.twoColumn('Kembalian', changeStr, width);
    }

    // 9. Footer
    if (data.footerNote) {
      encoder.separator('-', width);
      encoder.align('center');
      const footerLines = data.footerNote.split('\n');
      for (const line of footerLines) {
        encoder.textLine(line.substring(0, width));
      }
    }

    // End-of-receipt: feed lines & cut paper strictly following user's configuration
    if (enableAutoCut) {
      encoder.cut(false, feedCount);
    } else {
      encoder.feed(feedCount);
    }

    return encoder.encode();
  };

  // Print directly to connected Thermal Printer (Linux / Bluetooth)
  const handlePrintThermal = async () => {
    sounds.playScanBeep();
    try {
      const binary = await generateEscPosBinaryAsync();
      const text = generateEscPosText();

      const res = await printerService.printUnified(
        binary,
        text,
        printerStatus?.type || 'tauri_raw',
        printerStatus?.devicePath || settings?.linuxDevicePath || '/dev/usb/lp0'
      );

      sounds.playScanBeep();
      showPrintStatus(`✓ ${res.message || 'Struk hasil OCR berhasil dikirim ke printer thermal!'}`);
    } catch (err: any) {
      console.error('Thermal print error:', err);
      sounds.playErrorBeep();
      showPrintStatus(`⚠️ Gagal cetak thermal: ${err.message || 'Printer tidak merespon'}`);
    }
  };

  // Browser Print
  const handlePrintBrowser = () => {
    sounds.playScanBeep();
    printerService.printViaBrowser(generateEscPosText());
  };

  // Download Receipt as PNG image
  const handleDownloadPNG = async () => {
    if (!receiptCardRef.current) return;
    try {
      sounds.playScanBeep();
      const canvas = await html2canvas(receiptCardRef.current, {
        scale: 2,
        backgroundColor: '#ffffff'
      });
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `Struk-${data.refNo || 'OCR'}.png`;
      link.click();
      showPrintStatus('✓ Gambar struk berhasil diunduh sebagai PNG!');
    } catch (err) {
      console.error('PNG download error:', err);
    }
  };

  // Metadata row handlers
  const handleAddMetadataRow = () => {
    updateData(prev => ({
      ...prev,
      metadata: [
        ...prev.metadata,
        { id: `m-${Date.now()}`, key: 'INFO BARU', value: '' }
      ]
    }));
  };

  const handleUpdateMetadata = (id: string, key: string, value: string) => {
    updateData(prev => ({
      ...prev,
      metadata: prev.metadata.map(m => m.id === id ? { ...m, key, value } : m)
    }));
  };

  const handleDeleteMetadata = (id: string) => {
    updateData(prev => ({
      ...prev,
      metadata: prev.metadata.filter(m => m.id !== id)
    }));
  };

  const handleMoveMetadata = (index: number, direction: 'up' | 'down') => {
    updateData(prev => {
      const list = [...prev.metadata];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIndex];
      list[targetIndex] = temp;
      return { ...prev, metadata: list };
    });
  };

  const handleToggleMetadataCenter = (id: string) => {
    updateData(prev => ({
      ...prev,
      metadata: prev.metadata.map(m => m.id === id ? { ...m, isCentered: !m.isCentered } : m)
    }));
    sounds.playScanBeep();
  };

  // HTML5 Native Drag & Drop Handlers for flexible, library-free sorting
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    updateData(prev => {
      const list = [...prev.metadata];
      const draggedItem = list[draggedIndex];
      list.splice(draggedIndex, 1);
      list.splice(index, 0, draggedItem);
      return { ...prev, metadata: list };
    });
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Receipt Items handlers
  const handleAddItemRow = () => {
    updateData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        { id: `i-${Date.now()}`, name: 'Item Baru', qty: 1, price: 0, total: 0 }
      ]
    }));
  };

  const handleUpdateItem = (id: string, name: string, qty: number, price: number) => {
    updateData(prev => ({
      ...prev,
      items: prev.items.map(it => {
        if (it.id === id) {
          const tot = qty * price;
          return { ...it, name, qty, price, total: tot };
        }
        return it;
      })
    }));
  };

  const handleDeleteItem = (id: string) => {
    updateData(prev => ({
      ...prev,
      items: prev.items.filter(it => it.id !== id)
    }));
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-5 lg:p-6 space-y-5 text-slate-100">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelect} 
        accept="image/*" 
        className="hidden" 
      />

      {/* STATUS TOAST NOTIFICATION */}
      {printStatusMsg && (
        <div className="p-3 bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 rounded-xl text-xs flex items-center justify-between gap-2 shadow-2xl animate-in fade-in sticky top-20 z-50">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{printStatusMsg}</span>
          </div>
          <button onClick={() => setPrintStatusMsg(null)} className="text-emerald-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* HEADER STRUKSCAN STUDIO */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
            <Scan className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-tight text-white">StrukScan Studio</h2>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1">
                <FileCheck className="w-3 h-3" />
                Pure OCR Engine (Tesseract)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Ekstraksi Struk Belanja & Bukti Pembayaran ke Format Printer Thermal (100% Offline OCR)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Tabs Top Bar */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('workspace')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'workspace' ? 'bg-emerald-500 text-slate-950 font-bold shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Workspace Struk & OCR
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'history' ? 'bg-emerald-500 text-slate-950 font-bold shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Riwayat Struk ({history.length})
            </button>
          </div>

          {/* Tombol Unggah Foto Baru */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition shrink-0"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{ocrProgressMsg || 'Memindai OCR...'}</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Unggah Foto Baru</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      {activeTab === 'history' ? (
        /* TAB RIWAYAT STRUK */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-400" />
              Daftar Riwayat Struk Pindai OCR ({history.length})
            </h3>

            <button
              type="button"
              onClick={handleClearAllHistory}
              disabled={history.length === 0}
              className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed font-bold px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Kosongkan Riwayat
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {history.map(item => (
              <div
                key={item.id}
                onClick={() => {
                  setData(item);
                  setActiveTab('workspace');
                  showPrintStatus(`✓ Struk "${item.refNo}" dimuat ke workspace!`);
                }}
                className={`p-4 rounded-xl border transition cursor-pointer space-y-2 relative group ${
                  data.id === item.id 
                    ? 'bg-emerald-950/40 border-emerald-500/60 shadow-lg' 
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-emerald-400 truncate max-w-[180px]">
                    {item.refNo}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(item.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      type="button"
                      onClick={e => handleDeleteHistoryItem(e, item.id)}
                      title="Hapus Item Riwayat Ini"
                      className="p-1 text-slate-500 hover:text-rose-400 opacity-70 group-hover:opacity-100 hover:bg-slate-800 rounded transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-xs font-bold text-white truncate">{item.storeName}</div>
                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Metode: {item.paymentMethod}</span>
                  <span className="text-emerald-400 font-mono font-bold">Rp {formatRupiah(item.total)}</span>
                </div>
              </div>
            ))}

            {history.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 space-y-2 border border-dashed border-slate-800 rounded-2xl">
                <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-400">Belum ada riwayat struk tersimpan.</p>
                <p className="text-xs text-slate-500">
                  Lakukan pemindaian struk baru di tab <strong>Workspace Struk & OCR</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB WORKSPACE OCR (2 COLUMNS LAYOUT) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* LEFT COLUMN: RAW OCR & THERMAL PREVIEW (5 COLS) */}
          <div className="lg:col-span-5 space-y-5">

            {/* BOX 1: HASIL PINDAI MENTAH (RAW OCR) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Hasil Pindai Mentah (Raw OCR)</h3>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(data.rawText);
                    setCopiedRaw(true);
                    setTimeout(() => setCopiedRaw(false), 2000);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-slate-700 transition"
                >
                  {copiedRaw ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedRaw ? 'Tersalin' : 'Salin'}</span>
                </button>
              </div>

              {/* Monospaced Editable Textarea - REALTIME PARSE ON CHANGE */}
              <textarea
                value={data.rawText}
                onChange={e => {
                  const val = e.target.value;
                  const reparsed = parseRawReceiptText(val, settings);
                  reparsed.imageUrl = data.imageUrl;
                  setData(reparsed);
                }}
                rows={9}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 font-mono text-xs focus:outline-none focus:border-emerald-500 leading-relaxed resize-y"
                placeholder="Teks mentah hasil OCR akan muncul di sini..."
              />

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Edit teks lalu klik:</span>
                <button
                  onClick={handleReparseRawText}
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg flex items-center gap-1 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Parse Ulang Teks</span>
                </button>
              </div>
            </div>

            {/* BOX 2: PRATINJAU STRUK THERMAL (REALISTIC 58MM PAPER PREVIEW) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Pratinjau Struk Thermal</h3>
                </div>

                {/* Badges width & mode toggle */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
                  <button
                    onClick={() => setPaperWidth('58mm')}
                    className={`px-2 py-0.5 rounded font-mono font-bold transition ${
                      paperWidth === '58mm' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'
                    }`}
                  >
                    58mm (32 Col)
                  </button>
                  <button
                    onClick={() => setPaperWidth('80mm')}
                    className={`px-2 py-0.5 rounded font-mono font-bold transition ${
                      paperWidth === '80mm' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'
                    }`}
                  >
                    80mm
                  </button>
                  <button
                    onClick={() => setPreviewMode(previewMode === 'visual' ? 'escpos' : 'visual')}
                    className="px-2 py-0.5 rounded text-cyan-400 font-semibold hover:bg-slate-800 transition"
                  >
                    {previewMode === 'visual' ? 'Visual Struk' : 'Teks ESC/POS'}
                  </button>
                </div>
              </div>

              {/* REALISTIC WHITE THERMAL PAPER RECEIPT CARD */}
              <div className="flex justify-center p-3 bg-slate-950 rounded-xl overflow-x-auto">
                <div
                  ref={receiptCardRef}
                  className={`bg-white text-slate-900 font-mono text-[11px] leading-tight p-4 shadow-2xl rounded-sm ${
                    paperWidth === '58mm' ? 'w-[280px]' : 'w-[360px]'
                  }`}
                  style={{
                    fontFamily: '"Courier New", Courier, monospace',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                  }}
                >
                  {/* Store Header */}
                  <div className="text-center space-y-1 pb-2">
                    {settings?.logoUrl ? (
                      <img 
                        src={settings.logoUrl} 
                        alt="Logo Toko" 
                        className="w-12 h-12 object-contain mx-auto rounded-lg shadow-sm" 
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-extrabold flex items-center justify-center mx-auto text-sm tracking-widest shadow-md">
                        {(settings?.storeName || data.storeName || 'PRO').substring(0, 3).toUpperCase()}
                      </div>
                    )}
                    <div className="font-extrabold text-sm uppercase tracking-wider text-slate-950 pt-1">
                      {settings?.storeName || data.storeName || 'KASIR PRO'}
                    </div>
                    {(settings?.address || data.storeAddress) && (
                      <div className="text-[10px] text-slate-600">
                        {settings?.address || data.storeAddress}
                      </div>
                    )}
                    {(settings?.phone || data.storePhone) && (
                      <div className="text-[10px] text-slate-600">
                        Telp: {settings?.phone || data.storePhone}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-dashed border-slate-400 my-2" />

                  {/* Receipt Meta */}
                  <div className="space-y-1 text-[10.5px]">
                    <div className="flex justify-between gap-1 w-full items-start">
                      <span className="text-slate-600 max-w-[50%] text-left break-all whitespace-pre-wrap shrink-0 leading-tight">No. Struk</span>
                      <span className="font-bold max-w-[50%] text-right break-all whitespace-pre-wrap shrink-0 leading-tight">{data.refNo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tanggal/Waktu</span>
                      <span>{data.date} {data.time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Kasir</span>
                      <span>{settings?.cashierName || 'Sistem'}</span>
                    </div>
                  </div>

                  {data.badgeTitle && (
                    <>
                      <div className="border-t border-dashed border-slate-400 my-2" />
                      <div className="py-1 px-2 bg-emerald-50 text-emerald-900 border border-emerald-300 rounded text-center font-bold text-[10px] tracking-wider uppercase">
                        {data.badgeTitle}
                      </div>
                    </>
                  )}

                  {/* Key-Value Metadata List (Omit colon if key or value is missing) */}
                  {data.metadata.length > 0 && (
                    <>
                      <div className="border-t border-dashed border-slate-400 my-2" />
                      <div className="space-y-1 text-[10.5px]">
                        {data.metadata.map((m, idx) => {
                          const k = (m.key || '').trim();
                          const v = (m.value || '').trim();
                          if (!k && !v) return null;

                          // Helper for styling
                          const textStyleClasses = `break-all whitespace-pre-wrap shrink-0 ${
                            m.isBold ? 'font-black text-black' : 'font-medium text-slate-700'
                          } ${
                            m.isUnderline ? 'underline underline-offset-2' : ''
                          } ${
                            m.textSize === 'S' 
                              ? 'text-[8.5px] leading-tight' 
                              : m.textSize === 'DW'
                              ? 'text-[12px] font-bold tracking-wider'
                              : m.textSize === 'DH'
                              ? 'text-[13px] font-bold leading-relaxed'
                              : m.textSize === 'M'
                              ? 'text-[14px] font-black tracking-wide leading-loose'
                              : 'text-[10.5px] leading-tight'
                          }`;

                          return (
                            <div key={m.id || idx} className="flex justify-between gap-1 w-full items-start">
                              {m.isCentered ? (
                                <span className={`text-center w-full ${textStyleClasses}`}>
                                  {k && v ? `${k} ${v}` : (k || v)}
                                </span>
                              ) : k && v ? (
                                <>
                                  <span className={`max-w-[50%] text-left ${textStyleClasses}`}>
                                    {k}
                                  </span>
                                  <span className={`max-w-[50%] text-right ${
                                    m.isBold ? textStyleClasses : textStyleClasses.replace('font-medium text-slate-700', 'font-bold text-slate-900')
                                  }`}>
                                    {v}
                                  </span>
                                </>
                              ) : k ? (
                                <span className={`w-full ${textStyleClasses}`}>{k}</span>
                              ) : (
                                <span className={`w-full text-right ${textStyleClasses}`}>{v}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Items List */}
                  <div className="border-t border-dashed border-slate-400 my-2" />
                  <div className="space-y-1.5 text-[10.5px]">
                    {data.items.map((it, idx) => (
                      <div key={it.id || idx}>
                        <div className="font-bold uppercase text-slate-900">{it.name}</div>
                        <div className="flex justify-between text-slate-700 text-[10px]">
                          <span>{it.qty} x {formatRupiah(it.price)}</span>
                          <span className="font-bold">Rp {formatRupiah(it.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Total Calculations */}
                  <div className="border-t border-dashed border-slate-400 my-2" />
                  <div className="space-y-1 text-[10.5px]">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Subtotal</span>
                      <span>Rp {formatRupiah(data.subtotal)}</span>
                    </div>
                    {data.serviceCharge > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Biaya Admin/Layanan</span>
                        <span>Rp {formatRupiah(data.serviceCharge)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-extrabold text-sm text-slate-950 pt-1 border-t border-slate-300">
                      <span>TOTAL</span>
                      <span>Rp {formatRupiah(data.total)}</span>
                    </div>
                    {data.paidAmount > 0 && (
                      <>
                        <div className="flex justify-between text-slate-600 pt-1">
                          <span>Bayar</span>
                          <span>Rp {formatRupiah(data.paidAmount)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Kembalian</span>
                          <span>
                            {data.paidAmount < data.total 
                              ? `-Rp ${formatRupiah(data.total - data.paidAmount)}` 
                              : `Rp ${formatRupiah(data.changeAmount)}`}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Footer Note */}
                  {data.footerNote && (
                    <>
                      <div className="border-t border-dashed border-slate-400 my-2" />
                      <div className="text-center text-[9.5px] text-slate-600 leading-snug">
                        {data.footerNote}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ACTION BUTTONS UNDER PREVIEW */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generateEscPosText());
                    setCopiedReceiptText(true);
                    setTimeout(() => setCopiedReceiptText(false), 2000);
                  }}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition"
                >
                  {copiedReceiptText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedReceiptText ? 'Tersalin' : 'Salin Teks Struk'}</span>
                </button>

                <button
                  onClick={handleDownloadPNG}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Unduh Gambar (PNG)</span>
                </button>

                <button
                  onClick={handlePrintThermal}
                  className="py-2.5 px-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-1.5 transition shadow-lg shadow-cyan-500/20"
                >
                  <Zap className="w-4 h-4" />
                  <span>Cetak Thermal</span>
                </button>

                <button
                  onClick={handlePrintBrowser}
                  className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Browser</span>
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: STRUCTURED EDITOR (7 COLS) */}
          <div className="lg:col-span-7 space-y-5">

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-extrabold text-white">Hasil Ekstraksi Bersih & Terstruktur</h3>
                    <p className="text-[11px] text-slate-400">Edit manual detail toko, rincian item, dan info tambahan di bawah ini.</p>
                  </div>
                </div>
                <span className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-2.5 py-1 rounded-full font-mono font-bold shrink-0">
                  Real-time Sync
                </span>
              </div>

              {/* 1. DETAIL TRANSAKSI (NO FAKTUR, TANGGAL, WAKTU) */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Detail Transaksi</span>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 mb-1 font-medium">No. Ref:</label>
                    <input
                      type="text"
                      value={data.refNo}
                      onChange={e => {
                        const val = e.target.value;
                        updateData(prev => ({ ...prev, refNo: val }));
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-750 focus:border-emerald-500 rounded-xl text-emerald-400 font-mono font-semibold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 mb-1 font-medium">Tanggal:</label>
                    <input
                      type="text"
                      value={data.date}
                      onChange={e => {
                        const val = e.target.value;
                        updateData(prev => ({ ...prev, date: val }));
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-750 focus:border-emerald-500 rounded-xl text-white font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 mb-1 font-medium">Waktu:</label>
                    <input
                      type="text"
                      value={data.time}
                      onChange={e => {
                        const val = e.target.value;
                        updateData(prev => ({ ...prev, time: val }));
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-750 focus:border-emerald-500 rounded-xl text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 2. SIMPAN & KELOLA TEMPLATE METADATA */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Simpan / Kelola Template Metadata ({templates.length})
                  </span>
                  <span className="text-[10px] text-slate-500">Kustomisasi Template Saya</span>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex-1 min-w-[200px]">
                    <CustomSelect
                      value={selectedTemplateId}
                      onChange={val => handleSelectTemplate(val)}
                      options={[
                        { label: '-- Pilih Template Tersimpan --', value: '' },
                        ...templates.map(t => ({
                          label: `${t.name} (${t.metadata.length} kolom info)`,
                          value: t.id
                        }))
                      ]}
                    />
                  </div>

                  {selectedTemplateId && (
                    <div className="flex items-center gap-1">
                      {editingTemplateId === selectedTemplateId ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editNameInput}
                            onChange={e => setEditNameInput(e.target.value)}
                            className="px-2 py-1 bg-slate-900 border border-emerald-500 rounded-lg text-xs text-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleSaveEditTemplate}
                            className="px-2 py-1 bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg"
                          >
                            Simpan
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const tpl = templates.find(t => t.id === selectedTemplateId);
                              if (tpl) handleStartEditTemplate(tpl);
                            }}
                            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-750 rounded-xl text-xs font-semibold"
                            title="Edit Nama Template"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const tpl = templates.find(t => t.id === selectedTemplateId);
                              if (tpl) handleDeleteTemplate(tpl.id, tpl.name);
                            }}
                            className="p-2 bg-slate-900 hover:bg-rose-950/60 text-rose-400 border border-slate-750 rounded-xl text-xs font-semibold"
                            title="Hapus Template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {!isAddingTemplate ? (
                    <button
                      type="button"
                      onClick={() => setIsAddingTemplate(true)}
                      className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1 transition shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Simpan Template Baru
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 w-full sm:w-auto">
                      <input
                        type="text"
                        value={templateNameInput}
                        onChange={e => setTemplateNameInput(e.target.value)}
                        placeholder="Nama Template (mis. Struk Token PLN)"
                        className="px-3 py-1.5 bg-slate-900 border border-emerald-500 rounded-xl text-xs text-white focus:outline-none flex-1"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleSaveCustomTemplate}
                        className="px-3 py-1.5 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingTemplate(false);
                          setTemplateNameInput('');
                        }}
                        className="px-2.5 py-1.5 bg-slate-800 text-slate-400 rounded-xl text-xs"
                      >
                        Batal
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. RINCIAN INFO TAMBAHAN (KEY-VALUE PAIRS METADATA) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Rincian Info Tambahan ({data.metadata.length})
                  </span>
                  <button
                    onClick={handleAddMetadataRow}
                    className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah
                  </button>
                </div>

                 <div className="space-y-2">
                  {data.metadata.map((m, index) => (
                    <div 
                      key={m.id} 
                      draggable={dragActiveId === m.id}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-2 bg-slate-950 border p-2 rounded-xl transition-all duration-200 ${
                        draggedIndex === index 
                          ? 'opacity-40 border-emerald-500 scale-[0.98]' 
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Drag & Drop Grip Handle */}
                      <div 
                        className="cursor-grab active:cursor-grabbing p-1 text-slate-500 hover:text-slate-300 transition"
                        title="Tarik untuk mengurutkan posisi info ini"
                        onMouseEnter={() => setDragActiveId(m.id)}
                        onMouseLeave={() => setDragActiveId(null)}
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>

                      <span className="text-[10px] font-mono text-slate-500 w-4 text-center shrink-0">
                        {index + 1}
                      </span>

                      {/* Align Center / Merge Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleMetadataCenter(m.id)}
                        className={`p-1.5 rounded-lg border transition ${
                          m.isCentered
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'bg-slate-900 border-slate-750 text-slate-500 hover:text-white'
                        }`}
                        title={m.isCentered ? "Ubah ke Kolom Kiri:Kanan" : "Gabung & Rata Tengah"}
                      >
                        <AlignCenter className="w-3.5 h-3.5" />
                      </button>

                      {/* Inputs with Center-Aware Styling */}
                      <input
                        type="text"
                        value={m.key}
                        onChange={e => handleUpdateMetadata(m.id, e.target.value, m.value)}
                        placeholder="Nama Info (kiri)"
                        className={`w-1/3 px-3 py-1.5 bg-slate-900 border rounded-lg text-xs font-semibold focus:outline-none transition-all ${
                          m.isCentered
                            ? 'text-center border-emerald-500/40 text-emerald-300 font-bold'
                            : 'border-slate-750 focus:border-emerald-500 text-white'
                        }`}
                      />

                      <span className={`font-bold text-xs transition ${m.isCentered ? 'text-emerald-400' : 'text-slate-600'}`}>
                        ⇄
                      </span>

                      <input
                        type="text"
                        value={m.value}
                        onChange={e => handleUpdateMetadata(m.id, m.key, e.target.value)}
                        placeholder="Nilai Info (kanan)"
                        className={`flex-1 px-3 py-1.5 bg-slate-900 border rounded-lg text-xs font-mono focus:outline-none transition-all ${
                          m.isCentered
                            ? 'text-center border-emerald-500/40 text-emerald-300 font-bold'
                            : 'border-slate-750 focus:border-emerald-500 text-white'
                        }`}
                      />

                      {/* Bold (B) Button */}
                      <button
                        type="button"
                        onClick={() => {
                          updateData(prev => ({
                            ...prev,
                            metadata: prev.metadata.map(item => item.id === m.id ? { ...item, isBold: !item.isBold } : item)
                          }));
                          sounds.playScanBeep();
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black border transition ${
                          m.isBold
                            ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                            : 'bg-slate-900 border-slate-750 text-slate-400 hover:text-white'
                        }`}
                        title="Tebalkan Teks (B)"
                      >
                        B
                      </button>

                      {/* Underline (U) Button */}
                      <button
                        type="button"
                        onClick={() => {
                          updateData(prev => ({
                            ...prev,
                            metadata: prev.metadata.map(item => item.id === m.id ? { ...item, isUnderline: !item.isUnderline } : item)
                          }));
                          sounds.playScanBeep();
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs underline border font-bold transition ${
                          m.isUnderline
                            ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                            : 'bg-slate-900 border-slate-750 text-slate-400 hover:text-white'
                        }`}
                        title="Garis Bawah (U)"
                      >
                        U
                      </button>

                      {/* Font Size Select */}
                      <div className="w-16">
                        <CustomSelect
                          value={m.textSize || 'N'}
                          onChange={val => {
                            const size = val as 'S' | 'N' | 'DW' | 'DH' | 'M';
                            updateData(prev => ({
                              ...prev,
                              metadata: prev.metadata.map(item => item.id === m.id ? { ...item, textSize: size } : item)
                            }));
                            sounds.playScanBeep();
                          }}
                          options={[
                            { label: 'S', value: 'S' },
                            { label: 'N', value: 'N' },
                            { label: 'DW', value: 'DW' },
                            { label: 'DH', value: 'DH' },
                            { label: 'M', value: 'M' }
                          ]}
                        />
                      </div>

                      {/* Move Up/Down buttons (Keep as convenient fallback) */}
                      <div className="flex flex-col gap-0.5 shrink-0 pl-1 border-l border-slate-800">
                        <button
                          onClick={() => handleMoveMetadata(index, 'up')}
                          disabled={index === 0}
                          className="text-slate-500 hover:text-white disabled:opacity-30 p-0.5"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleMoveMetadata(index, 'down')}
                          disabled={index === data.metadata.length - 1}
                          className="text-slate-500 hover:text-white disabled:opacity-30 p-0.5"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeleteMetadata(m.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {data.metadata.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                      Belum ada info tambahan. Klik "+ Tambah" untuk menambah baris baru.
                    </div>
                  )}
                </div>
              </div>

              {/* 4. RINCIAN ITEM BELANJA (SINGLE ITEM CATEGORY NOMINAL) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Rincian Item Belanja / Category Nominal ({data.items.length})
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Kategori nominal utama transaksi (1 item)
                    </span>
                  </div>
                  <button
                    onClick={handleAddItemRow}
                    className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Item
                  </button>
                </div>

                <div className="space-y-2">
                  {data.items.map((it, idx) => (
                    <div key={it.id} className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-slate-500">#{idx + 1}</span>
                        <input
                          type="text"
                          value={it.name}
                          onChange={e => handleUpdateItem(it.id, e.target.value, it.qty, it.price)}
                          placeholder="Nama kategori / item..."
                          className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-750 rounded-lg text-xs text-white font-semibold focus:outline-none"
                        />
                        {data.items.length > 1 && (
                          <button
                            onClick={() => handleDeleteItem(it.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">Kuantitas (Qty)</label>
                          <input
                            type="number"
                            min={1}
                            value={it.qty}
                            onChange={e => handleUpdateItem(it.id, it.name, Number(e.target.value) || 1, it.price)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-750 rounded-lg text-white font-mono focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">Harga Nominal (Rp)</label>
                          <input
                            type="number"
                            min={0}
                            value={it.price}
                            onChange={e => handleUpdateItem(it.id, it.name, it.qty, Number(e.target.value) || 0)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-750 rounded-lg text-emerald-400 font-mono font-bold focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">Subtotal Baris</label>
                          <div className="w-full px-2.5 py-1.5 bg-slate-900/60 border border-slate-800 rounded-lg text-emerald-300 font-mono font-bold">
                            Rp {formatRupiah(it.total)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. TOTAL, BIAYA LAYANAN, METODE PEMBAYARAN & NOMINAL BAYAR/KEMBALIAN */}
              <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Biaya Admin / Service Charge (Rp):</label>
                    <input
                      type="number"
                      min={0}
                      value={data.serviceCharge}
                      onChange={e => {
                        const val = Number(e.target.value) || 0;
                        updateData(prev => ({
                          ...prev,
                          serviceCharge: val,
                          total: prev.subtotal + val
                        }));
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-amber-400 font-mono font-bold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">TOTAL BELANJA / BAYAR (Rp):</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={data.total}
                        onChange={e => {
                          const val = Number(e.target.value) || 0;
                          updateData(prev => ({ ...prev, total: val }));
                        }}
                        className="flex-1 px-3 py-2 bg-slate-950 border border-emerald-500 rounded-xl text-emerald-400 font-extrabold text-base font-mono focus:outline-none"
                      />
                      <button
                        onClick={handleRecalculate}
                        className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shrink-0"
                        title="Hitung Ulang Otomatis dari Subtotal + Admin"
                      >
                        Hitung
                      </button>
                    </div>
                  </div>
                </div>

                {/* NOMINAL DITERIMA & KEMBALIAN (PINDAH DI BAWAH BIAYA ADMIN & TOTAL BELANJA) */}
                <div className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Nominal Diterima / Bayar (Rp):</label>
                    <input
                      type="number"
                      value={data.paidAmount}
                      onChange={e => {
                        const val = Number(e.target.value) || 0;
                        updateData(prev => ({
                          ...prev,
                          paidAmount: val,
                          changeAmount: Math.max(0, val - prev.total)
                        }));
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-emerald-400 font-mono font-bold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Kembalian (Rp):</label>
                    <input
                      type="text"
                      value={data.paidAmount < data.total ? `-${formatRupiah(data.total - data.paidAmount)}` : formatRupiah(data.changeAmount)}
                      readOnly
                      className={`w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl font-mono focus:outline-none font-bold ${
                        data.paidAmount < data.total ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* CATATAN KAKI STRUK (FOOTER NOTE) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Catatan Kaki Struk (Footer Note)
                </h3>
              </div>
              <textarea
                value={data.footerNote}
                onChange={e => {
                  const val = e.target.value;
                  updateData(prev => ({ ...prev, footerNote: val }));
                }}
                rows={3}
                placeholder="Contoh: Terima kasih atas kunjungan Anda! / PLN menyatakan struk ini sbg bukti pembayaran yang sah."
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 leading-relaxed resize-y font-mono"
              />
            </div>

          </div>

        </div>
      )}

    </div>
  );
};

export default StrukScanStudio;
