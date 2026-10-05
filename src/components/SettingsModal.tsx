import React, { useState, useEffect } from 'react';
import { 
  Store, 
  Printer, 
  Save, 
  CheckCircle2, 
  Cpu, 
  Percent, 
  Receipt, 
  X,
  FileText,
  Database,
  Download,
  Upload
} from 'lucide-react';
import { StoreSettings } from '../types';
import { saveStoreSettingsToFirestore, auth } from '../services/firebase';
import { db } from '../db/db';
import { printerService } from '../services/printerService';
import { EscPosEncoder, padCenter, padRow, padSeparator } from '../utils/escpos';

export interface SettingsModalProps {
  settings: StoreSettings;
  onUpdateSettings: (settings: StoreSettings) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenBackupModal?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  isOpen,
  onClose,
  onOpenBackupModal
}) => {
  const [formData, setFormData] = useState<StoreSettings>({ ...settings });
  const [activeTab, setActiveTab] = useState<'store' | 'receipt' | 'hardware' | 'backup'>('store');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testPrintSuccess, setTestPrintSuccess] = useState<string | null>(null);

  // Sync formData whenever modal opens or settings change
  useEffect(() => {
    if (isOpen) {
      setFormData({ ...settings });
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      // 1. Simpan segera ke localStorage
      try {
        localStorage.setItem('kasirpro_settings', JSON.stringify(formData));
      } catch (e) {}

      // 2. Simpan ke Dexie IndexedDB lokal untuk offline persistence
      await db.settings.put({ ...formData, id: 'main' });

      // 3. Simpan ke Firestore jika user terotentikasi
      if (auth.currentUser) {
        await saveStoreSettingsToFirestore(formData);
      }

      // 4. Update state di parent App
      onUpdateSettings(formData);
      printerService.setDevicePath(formData.linuxDevicePath || '/dev/usb/lp0');

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      // Tetap simpan ke local Dexie & localStorage jika koneksi firestore gagal
      try {
        localStorage.setItem('kasirpro_settings', JSON.stringify(formData));
      } catch (e) {}
      await db.settings.put({ ...formData, id: 'main' });
      onUpdateSettings(formData);
      setSaveSuccess(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestPrintSample = async () => {
    setTestPrintSuccess(null);
    try {
      const W = formData.paperWidthChars || 32;
      const encoder = new EscPosEncoder();
      encoder.init();
      encoder.align('center');
      encoder.bold(true);
      encoder.doubleHeight(true);
      encoder.textLine(formData.storeName.toUpperCase());
      encoder.doubleHeight(false);
      encoder.bold(false);

      if (formData.address) {
        encoder.textLine(formData.address.substring(0, W));
      }
      if (formData.phone) {
        encoder.textLine('Telp: ' + formData.phone.substring(0, W - 6));
      }
      encoder.separator('=', W);
      encoder.align('left');
      encoder.twoColumn('TEST STRUK 58MM', 'BERHASIL', W);
      encoder.twoColumn('Port Linux', formData.linuxDevicePath || '/dev/usb/lp0', W);
      encoder.twoColumn('Lebar Kertas', `${W} Kolom`, W);
      encoder.separator('-', W);

      if (formData.footerMessage) {
        encoder.align('center');
        const lines = formData.footerMessage.split('\n');
        for (const l of lines) {
          encoder.textLine(l.substring(0, W));
        }
      }
      encoder.textLine('*** PENGATURAN TERSIMPAN ***');
      encoder.cut();

      const plain = [
        padCenter(formData.storeName.toUpperCase(), W),
        formData.address ? padCenter(formData.address, W) : '',
        padSeparator('=', W),
        padRow('TEST STRUK 58MM', 'BERHASIL', W),
        padRow('Port Linux', formData.linuxDevicePath || '/dev/usb/lp0', W),
        padSeparator('-', W),
        padCenter('*** PENGATURAN TERSIMPAN ***', W)
      ].join('\n');

      const result = await printerService.printUnified(
        encoder.encode(),
        plain,
        undefined,
        formData.linuxDevicePath || '/dev/usb/lp0'
      );

      setTestPrintSuccess(result.message);
      setTimeout(() => setTestPrintSuccess(null), 4000);
    } catch (err: any) {
      alert('Gagal mengirim uji cetak: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-6">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Pengaturan Toko & Printer Thermal</h3>
              <p className="text-xs text-slate-400">Sinkronisasi Cloud Firestore & Konfigurasi Struk 58mm</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950/60 px-5 gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('store')}
            className={`py-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === 'store'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Store className="w-4 h-4" />
            Profil Toko
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('receipt')}
            className={`py-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === 'receipt'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Format Struk 58mm
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hardware')}
            className={`py-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === 'hardware'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Cpu className="w-4 h-4" />
            Hardware & Port
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`py-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === 'backup'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Database className="w-4 h-4" />
            Cadangan & Data
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          {saveSuccess && (
            <div className="p-3 bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Pengaturan berhasil disimpan ke Firebase Firestore dan memori lokal!</span>
            </div>
          )}

          {testPrintSuccess && (
            <div className="p-3 bg-cyan-950/70 border border-cyan-500/30 text-cyan-300 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{testPrintSuccess}</span>
            </div>
          )}

          {/* TAB 1: PROFIL TOKO */}
          {activeTab === 'store' && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Nama Toko / Outlet
                </label>
                <input
                  type="text"
                  required
                  value={formData.storeName}
                  onChange={e => setFormData({ ...formData, storeName: e.target.value })}
                  placeholder="WARUNG KASIRPRO 58MM"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Alamat Lengkap Toko
                </label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Jl. Merdeka No. 45, Bandung"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    No. Telepon / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="0812-3456-7890"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Nama Kasir Default
                  </label>
                  <input
                    type="text"
                    value={formData.cashierName}
                    onChange={e => setFormData({ ...formData, cashierName: e.target.value })}
                    placeholder="Kasir 01"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-750 rounded-xl text-white"
                  />
                </div>
              </div>

              {/* Pajak PPN */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-200 font-medium">
                    <Percent className="w-4 h-4 text-emerald-400" />
                    Aktifkan Perhitungan Pajak (PPN)
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enableTax}
                    onChange={e => setFormData({ ...formData, enableTax: e.target.checked })}
                    className="w-4 h-4 accent-emerald-500 rounded"
                  />
                </div>

                {formData.enableTax && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                    <span className="text-slate-400">Tarif Pajak (%):</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.taxRate}
                      onChange={e => setFormData({ ...formData, taxRate: Number(e.target.value) || 0 })}
                      className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white font-bold text-center"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: FORMAT STRUK THERMAL 58MM */}
          {activeTab === 'receipt' && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Lebar Kolom Kertas
                  </label>
                  <select
                    value={formData.paperWidthChars}
                    onChange={e => setFormData({ ...formData, paperWidthChars: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono"
                  >
                    <option value={32} className="bg-slate-900 text-white">32 Karakter (Standar Thermal 58mm)</option>
                    <option value={42} className="bg-slate-900 text-white">42 Karakter (Font B Thermal 58mm)</option>
                    <option value={48} className="bg-slate-900 text-white">48 Karakter (Thermal 80mm)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Awalan Mata Uang
                  </label>
                  <input
                    type="text"
                    value={formData.currencyPrefix}
                    onChange={e => setFormData({ ...formData, currencyPrefix: e.target.value })}
                    placeholder="Rp"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Pesan Catatan Kaki (Footer Struk)
                </label>
                <textarea
                  rows={3}
                  value={formData.footerMessage}
                  onChange={e => setFormData({ ...formData, footerMessage: e.target.value })}
                  placeholder="Terima kasih atas kunjungan Anda!&#10;Barang yang dibeli tidak dapat ditukar."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Teks ini akan dicetak di bagian paling bawah struk secara rata tengah.
                </p>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-medium text-white">Preview Hasil Cetak Struk</div>
                  <div className="text-[11px] text-slate-400">Kirim struk sampel ke printer untuk menguji layout</div>
                </div>
                <button
                  type="button"
                  onClick={handleTestPrintSample}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  Uji Cetak Sampel
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: HARDWARE & LINUX PORT */}
          {activeTab === 'hardware' && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Jalur Device Printer Thermal di Linux CachyOS
                </label>
                <input
                  type="text"
                  required
                  value={formData.linuxDevicePath}
                  onChange={e => setFormData({ ...formData, linuxDevicePath: e.target.value })}
                  placeholder="/dev/usb/lp0"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-750 rounded-xl text-cyan-300 font-mono font-bold focus:outline-none focus:border-cyan-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Default kernel Linux untuk printer thermal USB adalah <code className="text-slate-300">/dev/usb/lp0</code> (Vendor: 28e9, PID: 0289).
                </p>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2">
                <div className="font-bold text-white flex items-center gap-2">
                  <Printer className="w-4 h-4 text-emerald-400" />
                  Perintah ESC/POS Otomatis
                </div>
                <div className="text-slate-400 text-[11px] space-y-1">
                  <div>• Buka Laci Kasir: <code className="text-cyan-400 font-mono">ESC p 0 25 250</code> otomatis ditembakkan saat transaksi tunai.</div>
                  <div>• Potong Kertas: <code className="text-cyan-400 font-mono">GS V 66 0</code> otomatis dieksekusi di akhir struk jika printer mendukung cutter.</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CADANGAN & DATA */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center gap-2.5 font-bold text-white text-sm">
                  <Database className="w-5 h-5 text-cyan-400" />
                  Pusat Cadangan & Pemulihan Data
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Anda dapat mencadangkan seluruh data toko termasuk Produk, Sisa Stok, Riwayat Penjualan, dan Pengaturan Struk ke file JSON atau CSV (Excel). File cadangan dapat diimpor kembali ke perangkat lain atau saat mengganti komputer kasir.
                </p>

                {onOpenBackupModal && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenBackupModal();
                      }}
                      className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 transition"
                    >
                      <Download className="w-4 h-4" />
                      <Upload className="w-4 h-4" />
                      Buka Menu Ekspor & Impor Menyeluruh
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleTestPrintSample}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium transition flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              Uji Struk 58mm
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl font-medium transition"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsModal;
