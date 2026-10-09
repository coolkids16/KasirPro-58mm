import React, { useState } from 'react';
import { X, Save, TrendingUp, TrendingDown, RotateCcw, AlertTriangle, Trash2, AlertCircle } from 'lucide-react';
import { db } from '../db/db';
import { auth, saveCapitalRecordToFirestore, deleteAllCapitalFromFirestore } from '../services/firebase';
import { CapitalRecord } from '../types';
import { formatRupiah } from '../utils/escpos';

interface CapitalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  storeId?: string | null;
}

export const CapitalModal: React.FC<CapitalModalProps> = ({ isOpen, onClose, onSuccess, storeId }) => {
  const [type, setType] = useState<'add' | 'subtract'>('add');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const payload: CapitalRecord = {
        type,
        amount: amountNum,
        description: description.trim() || (type === 'add' ? 'Tambah Modal' : 'Tarik Modal'),
        timestamp: Date.now(),
        storeId: storeId || undefined
      };

      const localId = await db.capital.add(payload);
      
      if (auth.currentUser) {
        const firestoreId = await saveCapitalRecordToFirestore({ ...payload, id: localId }, storeId || undefined);
        await db.capital.update(localId, { firestoreId });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save capital record:', err);
      setErrorMessage('Gagal menyimpan data modal: ' + (err?.message || 'Terjadi kesalahan'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetModal = async () => {
    setIsResetting(true);
    setErrorMessage(null);
    try {
      await db.capital.clear();
      if (auth.currentUser) {
        await deleteAllCapitalFromFirestore(storeId || undefined);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to reset capital:', err);
      setErrorMessage('Gagal mereset modal: ' + (err?.message || 'Terjadi kesalahan'));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-750 rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-white">Kelola Modal</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('add')}
              className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                type === 'add' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <TrendingUp className="w-4 h-4" /> Tambah
            </button>
            <button
              type="button"
              onClick={() => setType('subtract')}
              className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                type === 'subtract' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <TrendingDown className="w-4 h-4" /> Tarik
            </button>
          </div>
          
          {/* Reset Modal Button / Confirmation Box */}
          {!isConfirmingReset ? (
            <button
              type="button"
              onClick={() => setIsConfirmingReset(true)}
              className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Modal ke Rp 0
            </button>
          ) : (
            <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl space-y-2.5 animate-in fade-in">
              <div className="flex items-center gap-2 text-rose-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <p className="text-xs font-bold">Reset Seluruh Saldo Modal ke Rp 0?</p>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Semua catatan riwayat modal usaha akan dihapus permanen dan saldo modal kembali menjadi Rp 0.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={() => setIsConfirmingReset(false)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={handleResetModal}
                  className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/30 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isResetting ? 'Mereset...' : 'Ya, Reset Modal'}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1">Nominal (Rp)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              placeholder="Masukkan nominal"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Keterangan</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              placeholder="Contoh: Modal awal usaha"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-2 bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-600 transition cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </form>
      </div>
    </div>
  );
};
