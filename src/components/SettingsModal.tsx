import React, { useState, useEffect, useRef } from 'react';
import { 
  Store, 
  Save, 
  CheckCircle2, 
  Percent, 
  X,
  Upload,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';
import { StoreSettings } from '../types';
import { saveStoreSettingsToFirestore, auth } from '../services/firebase';
import { db } from '../db/db';

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
  onClose
}) => {
  const [formData, setFormData] = useState<StoreSettings>({ ...settings });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync formData whenever modal opens or settings change
  useEffect(() => {
    if (isOpen) {
      setFormData({ ...settings });
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress & scale to max 200x200 px for optimal lightweight offline & Firestore storage
        const maxDim = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/png', 0.85);
          setFormData(prev => ({ ...prev, logoUrl: compressedBase64 }));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setFormData(prev => ({ ...prev, logoUrl: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false),
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      try {
        localStorage.setItem('kasirpro_settings', JSON.stringify(formData));
      } catch (e) {}
      await db.settings.put({ ...formData, id: 'main' });
      onUpdateSettings(formData);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1200);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden my-6">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Pengaturan Profil Toko</h3>
              <p className="text-xs text-slate-400">Logo toko, identitas outlet kasir & perhitungan PPN</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          {saveSuccess && (
            <div className="p-3 bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Profil toko & logo berhasil disimpan!</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Custom Store Logo Uploader */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
              <label className="block text-slate-300 font-medium mb-2">
                Logo Kustom Toko / Brand
              </label>
              
              <div className="flex items-center gap-4">
                {/* Logo Preview Box */}
                <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-750 flex items-center justify-center overflow-hidden shrink-0 shadow-inner relative group">
                  {formData.logoUrl ? (
                    <img 
                      src={formData.logoUrl} 
                      alt="Logo Toko" 
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-slate-600">
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-[9px] mt-0.5">No Logo</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    accept="image/png, image/jpeg, image/webp, image/svg+xml"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {formData.logoUrl ? 'Ganti Logo' : 'Upload Logo Toko'}
                    </button>

                    {formData.logoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-500/30 rounded-lg text-xs flex items-center gap-1 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    Mendukung format PNG, JPG, atau SVG. Logo akan otomatis ditampilkan di bilah navigasi dan struk thermal.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Nama Toko / Outlet
              </label>
              <input
                type="text"
                required
                value={formData.storeName}
                onChange={e => setFormData({ ...formData, storeName: e.target.value })}
                placeholder="WARUNG KOPI & KASIRPRO"
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

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
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
              {isSaving ? 'Menyimpan...' : 'Simpan Profil Toko'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsModal;
