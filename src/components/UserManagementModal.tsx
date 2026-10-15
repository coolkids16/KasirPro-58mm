import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  ShieldCheck, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  Mail, 
  User, 
  Briefcase,
  Store as StoreIcon
} from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { 
  registerStaffAccount, 
  subscribeStoreStaff, 
  deleteStaffAccount 
} from '../services/firebase';

export interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserProfile: UserProfile | null;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentUserProfile
}) => {
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state untuk buat staf baru
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'manager' | 'cashier'>('cashier');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentUserProfile?.storeId) return;

    const unsub = subscribeStoreStaff(
      currentUserProfile.storeId,
      (staff) => {
        setStaffList(staff);
      },
      (err) => {
        console.error('Error fetching staff list:', err);
      }
    );

    return () => unsub();
  }, [isOpen, currentUserProfile?.storeId]);

  if (!isOpen) return null;

  const isOwner = currentUserProfile?.role === 'owner';

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile || !isOwner) {
      setErrorMessage('Hanya Owner yang berhak mendaftarkan akun staf.');
      return;
    }

    if (!email || !password || !displayName) {
      setErrorMessage('Harap lengkapi semua kolom.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Kata sandi minimal 6 karakter.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const createdStaff = await registerStaffAccount(
        currentUserProfile,
        email.trim(),
        password,
        displayName.trim(),
        selectedRole
      );

      setSuccessMessage(
        `Berhasil mendaftarkan akun ${createdStaff.role.toUpperCase()}: ${createdStaff.displayName} (${createdStaff.email}) ke Toko ${currentUserProfile.storeId}.`
      );

      // Reset form
      setEmail('');
      setPassword('');
      setDisplayName('');
      setSelectedRole('cashier');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mendaftarkan staf baru.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStaff = async (staffUid: string, name: string) => {
    if (staffUid === currentUserProfile?.uid) {
      alert('Anda tidak bisa menghapus akun Owner utama Anda sendiri.');
      return;
    }

    if (!confirm(`Yakin ingin mencabut akses akun ${name}?`)) return;

    try {
      await deleteStaffAccount(staffUid);
      setSuccessMessage(`Akun ${name} telah berhasil dicabut.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghapus akun staf.');
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'owner':
        return (
          <span className="px-2.5 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider">
            👑 Owner
          </span>
        );
      case 'manager':
        return (
          <span className="px-2.5 py-1 bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider">
            🛡️ Manager
          </span>
        );
      case 'cashier':
        return (
          <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider">
            💼 Cashier
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Manajemen Pengguna & Hak Akses (RBAC)
              </h2>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <StoreIcon className="w-3.5 h-3.5 text-cyan-400" />
                Store ID: <code className="text-cyan-300 font-mono font-bold">{currentUserProfile?.storeId || 'N/A'}</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-3 sm:p-4 lg:p-6 overflow-y-auto space-y-4 sm:space-y-6 flex-1">
          {/* Notification */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/60 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {!isOwner ? (
            <div className="p-8 text-center bg-slate-950 border border-slate-800 rounded-2xl">
              <ShieldCheck className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white mb-1">Akses Khusus Owner Toko</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Anda login sebagai <strong className="text-cyan-300 font-mono uppercase">[{currentUserProfile?.role}]</strong>. 
                Pendaftaran dan pengelolaan akun Manager & Kasir hanya dapat dilakukan oleh akun Owner utama.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Form Tambah Staf Baru (2 Kolom) */}
              <div className="lg:col-span-2 bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                  <UserPlus className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Daftarkan Staf Baru
                  </h3>
                </div>

                <form onSubmit={handleCreateStaff} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Nama Lengkap Staf
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Contoh: Rian (Kasir Shift 1)"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Email Login
                    </label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="kasir.toko@gmail.com"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Kata Sandi Sementara
                    </label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 6 karakter"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Pilihan Peran (Role)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRole('cashier')}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                          selectedRole === 'cashier'
                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          💼 Cashier
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          Hanya POS & rekap shift
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedRole('manager')}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                          selectedRole === 'manager'
                            ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          🛡️ Manager
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          POS, stok produk & laporan
                        </div>
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 text-xs transition disabled:opacity-50"
                  >
                    {isSubmitting ? 'Mendaftarkan Akun...' : `+ Buat Akun ${selectedRole.toUpperCase()}`}
                  </button>
                </form>
              </div>

              {/* Daftar Staf Toko (3 Kolom) */}
              <div className="lg:col-span-3 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-cyan-400" />
                    Daftar Pengguna Toko ({staffList.length})
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Otomatis terisolasi pada Store ID yang sama
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {staffList.map((user) => (
                    <div
                      key={user.uid}
                      className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 hover:border-slate-700 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs">
                            {user.displayName || 'Tanpa Nama'}
                          </span>
                          {getRoleBadge(user.role)}
                          {user.uid === currentUserProfile.uid && (
                            <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                              Anda
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {user.email}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Dibuat: {new Date(user.createdAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                        </div>
                      </div>

                      {user.uid !== currentUserProfile.uid && (
                        <button
                          onClick={() => handleDeleteStaff(user.uid, user.displayName)}
                          className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition"
                          title="Hapus / Cabut Akses Akun"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}

                  {staffList.length === 0 && (
                    <div className="text-center py-10 text-xs text-slate-500 bg-slate-950/50 rounded-xl border border-dashed border-slate-800">
                      Belum ada staf terdaftar selain Owner. Gunakan form di sebelah kiri untuk menambah Manager atau Kasir.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
