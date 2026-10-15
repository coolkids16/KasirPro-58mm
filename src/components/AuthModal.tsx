import React, { useState, useEffect } from 'react';
import { 
  X, 
  LogIn, 
  LogOut, 
  User as UserIcon, 
  ShieldCheck, 
  CloudCheck, 
  AlertCircle,
  HardDrive,
  UserPlus,
  Mail,
  Lock,
  CheckCircle2,
  KeyRound,
  Crown,
  Briefcase,
  Users,
  Store,
  Copy,
  Check
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { UserProfile, UserRole } from '../types';
import { 
  registerWithEmailPassword, 
  loginWithEmailPassword, 
  resetUserPassword,
  logoutUser,
  subscribeUserProfile
} from '../services/firebase';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
  userProfile?: UserProfile | null;
  onOpenUsersModal?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  userProfile,
  onOpenUsersModal
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [internalProfile, setInternalProfile] = useState<UserProfile | null>(userProfile || null);
  const [copiedStoreId, setCopiedStoreId] = useState<boolean>(false);

  // Form states for Email/Password
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Keep internal profile synced in real time
  useEffect(() => {
    if (userProfile) {
      setInternalProfile(userProfile);
      return;
    }
    if (currentUser?.uid) {
      const unsub = subscribeUserProfile(currentUser.uid, (p) => {
        setInternalProfile(p);
      });
      return () => {
        if (unsub) unsub();
      };
    }
  }, [currentUser, userProfile]);

  const activeProfile = userProfile || internalProfile;
  const role: UserRole | undefined = activeProfile?.role;

  const handleCopyStoreId = () => {
    if (activeProfile?.storeId) {
      navigator.clipboard.writeText(activeProfile.storeId);
      setCopiedStoreId(true);
      setTimeout(() => setCopiedStoreId(false), 2000);
    }
  };

  if (!isOpen) return null;

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Mohon masukkan alamat email kasir Anda.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await resetUserPassword(email.trim());
      setSuccessMsg(`Tautan pemulihan kata sandi telah dikirim ke email: ${email.trim()}. Silakan periksa kotak masuk atau folder spam Anda.`);
    } catch (err: any) {
      console.error('Forgot password error:', err);
      if (err.code === 'auth/user-not-found') {
        setErrorMsg('Email tersebut belum terdaftar.');
      } else if (err.code === 'auth/invalid-email') {
        setErrorMsg('Format email tidak valid.');
      } else {
        setErrorMsg(err.message || 'Gagal mengirim email reset kata sandi.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Mohon isi email dan kata sandi.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Kata sandi minimal 6 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      await registerWithEmailPassword(email, password, displayName || 'Kasir');
      setSuccessMsg('Akun berhasil dibuat dan otomatis masuk!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('Email ini sudah terdaftar. Silakan pilih tab "Masuk"');
      } else if (err.code === 'auth/operation-not-allowed') {
        setErrorMsg('Metode Email/Password belum diaktifkan di Firebase Console.');
      } else {
        setErrorMsg(err.message || 'Gagal mendaftarkan akun.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Mohon isi email dan kata sandi.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      await loginWithEmailPassword(email, password);
      onClose();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setErrorMsg('Email atau kata sandi salah, atau akun belum terdaftar.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setErrorMsg('Metode Email/Password belum diaktifkan di Firebase Console.');
      } else if (err.code === 'auth/network-request-failed') {
        setErrorMsg('Gagal terhubung ke server Firebase. Periksa koneksi internet Anda.');
      } else {
        setErrorMsg(err.message || 'Gagal masuk.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await logoutUser();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal keluar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-3 sm:p-4 lg:p-6 relative my-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-5">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto shadow-lg text-white mb-2.5 ${
            !currentUser
              ? 'bg-gradient-to-tr from-emerald-500 to-teal-500 shadow-emerald-500/25'
              : role === 'owner'
              ? 'bg-gradient-to-tr from-amber-500 to-amber-600 shadow-amber-500/30'
              : role === 'manager'
              ? 'bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-cyan-500/30'
              : 'bg-gradient-to-tr from-emerald-500 to-teal-500 shadow-emerald-500/25'
          }`}>
            {!currentUser ? (
              <UserIcon className="w-6 h-6" />
            ) : role === 'owner' ? (
              <Crown className="w-6 h-6 text-white" />
            ) : role === 'manager' ? (
              <ShieldCheck className="w-6 h-6 text-white" />
            ) : (
              <Briefcase className="w-6 h-6 text-white" />
            )}
          </div>
          <h3 className="text-lg font-bold text-white">
            {!currentUser
              ? 'Akun Kasir & Cloud Sync'
              : role === 'owner'
              ? 'Profil Pemilik Toko (Owner)'
              : role === 'manager'
              ? 'Profil Manager Operasional'
              : role === 'cashier'
              ? 'Profil Kasir (Cashier)'
              : 'Profil Pengguna & Akun'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {!currentUser 
              ? 'Masuk atau daftarkan akun kasir Anda untuk sinkronisasi cloud.'
              : role === 'owner'
              ? 'Akun Utama • Hak Akses Penuh Sistem & Pengelolaan Staf Toko'
              : role === 'manager'
              ? 'Pengelola Operasional • Inventaris, Produk & Analitik Penjualan'
              : role === 'cashier'
              ? 'Operator Transaksi Kasir • POS & Cetak Struk Thermal 58mm'
              : 'Terhubung dengan Firebase Firestore untuk sinkronisasi cloud.'}
          </p>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-950/70 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* View when user is already logged in */}
        {currentUser ? (
          <div className="space-y-4">
            <div className={`p-4 bg-slate-950 border rounded-2xl flex items-center gap-3.5 transition-all ${
              role === 'owner'
                ? 'border-amber-500/40 shadow-md shadow-amber-500/5'
                : role === 'manager'
                ? 'border-cyan-500/40 shadow-md shadow-cyan-500/5'
                : 'border-emerald-500/40 shadow-md shadow-emerald-500/5'
            }`}>
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={activeProfile?.displayName || currentUser.displayName || 'Kasir'}
                  className={`w-13 h-13 rounded-2xl object-cover border-2 shadow-sm ${
                    role === 'owner'
                      ? 'border-amber-400'
                      : role === 'manager'
                      ? 'border-cyan-400'
                      : 'border-emerald-400'
                  }`}
                />
              ) : (
                <div className={`w-13 h-13 rounded-2xl flex items-center justify-center font-black text-lg shadow-inner ${
                  role === 'owner'
                    ? 'bg-amber-500/20 text-amber-300 border-2 border-amber-500/40'
                    : role === 'manager'
                    ? 'bg-cyan-500/20 text-cyan-300 border-2 border-cyan-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-2 border-emerald-500/40'
                }`}>
                  {(activeProfile?.displayName || currentUser.displayName || currentUser.email || 'K')[0].toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm truncate">
                  {activeProfile?.displayName || currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Kasir Aktif')}
                </div>
                <div className="text-xs text-slate-400 truncate font-mono">
                  {currentUser.email}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {/* Dynamic Role Badge */}
                  {role === 'owner' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full shadow-sm">
                      <Crown className="w-3 h-3 text-amber-400" />
                      👑 OWNER (PEMILIK TOKO)
                    </span>
                  ) : role === 'manager' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2.5 py-0.5 rounded-full shadow-sm">
                      <ShieldCheck className="w-3 h-3 text-cyan-400" />
                      🛡️ MANAGER OPERASIONAL
                    </span>
                  ) : role === 'cashier' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full shadow-sm">
                      <Briefcase className="w-3 h-3 text-emerald-400" />
                      💼 KASIR (CASHIER)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-750 px-2.5 py-0.5 rounded-full">
                      <UserIcon className="w-3 h-3" />
                      {activeProfile?.role ? String(activeProfile.role).toUpperCase() : 'MEMUAT PERAN...'}
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                    <CloudCheck className="w-3 h-3" />
                    Firestore Aktif
                  </span>
                </div>
              </div>
            </div>

            {/* Store & Role Details Box */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-850">
                <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                  <Store className="w-3.5 h-3.5 text-slate-500" />
                  ID Toko (Store ID)
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-200 bg-slate-900 px-2 py-0.5 rounded border border-slate-750 text-[11px]">
                    {activeProfile?.storeId || '-'}
                  </span>
                  {activeProfile?.storeId && (
                    <button
                      type="button"
                      onClick={handleCopyStoreId}
                      title="Salin Store ID"
                      className="p-1 rounded bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                    >
                      {copiedStoreId ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Ringkasan Hak Akses Berdasarkan Role */}
              <div className="pt-0.5">
                <span className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                  Hak Akses Akun:
                </span>
                {role === 'owner' ? (
                  <div className="bg-amber-950/25 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-200/90 space-y-1.5">
                    <div className="font-bold text-amber-300 flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Akses Penuh Seluruh Sistem (Owner)</span>
                    </div>
                    <ul className="space-y-1 text-slate-300 text-[11px] pl-1">
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Akses penuh POS kasir & cetak struk thermal 58mm</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Manajemen master produk, harga & stok barang</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Pengaturan profil toko, logo, dan tarif pajak PPN</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Daftarkan akun staf baru (Manager & Kasir)</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Riwayat lengkap & grafik penjualan harian</span>
                      </li>
                    </ul>
                  </div>
                ) : role === 'manager' ? (
                  <div className="bg-cyan-950/25 border border-cyan-500/20 rounded-xl p-3 text-[11px] text-cyan-200/90 space-y-1.5">
                    <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>Akses Operasional Toko (Manager)</span>
                    </div>
                    <ul className="space-y-1 text-slate-300 text-[11px] pl-1">
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Manajemen master produk, kategori & update stok</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Riwayat & analitik grafik penjualan harian</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Akses POS penjualan kasir & cetak struk thermal</span>
                      </li>
                    </ul>
                  </div>
                ) : role === 'cashier' ? (
                  <div className="bg-emerald-950/25 border border-emerald-500/20 rounded-xl p-3 text-[11px] text-emerald-200/90 space-y-1.5">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Akses Transaksi Kasir (Cashier)</span>
                    </div>
                    <ul className="space-y-1 text-slate-300 text-[11px] pl-1">
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Halaman POS kasir, keranjang & pembayaran</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Cetak struk thermal 58mm (Bluetooth SPP / USB)</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Riwayat penjualan untuk rekap shift kasir</span>
                      </li>
                    </ul>
                  </div>
                ) : (
                  <p className="text-slate-400 text-[11px] py-1">
                    Memuat data perizinan akun...
                  </p>
                )}
              </div>
            </div>

            {/* Quick Action for Owner to Manage Staff */}
            {role === 'owner' && onOpenUsersModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenUsersModal();
                }}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600/30 to-purple-600/30 hover:from-indigo-600/40 hover:to-purple-600/40 text-indigo-200 hover:text-white border border-indigo-500/40 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-sm"
              >
                <Users className="w-4 h-4 text-indigo-400" />
                Kelola Akun Manager & Kasir Toko
              </button>
            )}

            <button
              onClick={handleLogout}
              disabled={loading}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <LogOut className="w-4 h-4" />
              {loading ? 'Memproses...' : 'Keluar dari Akun'}
            </button>
          </div>
        ) : (
          /* View when user is not logged in */
          <div className="space-y-4">
            {/* Tab Selector: Masuk / Daftar Baru */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 px-3 rounded-lg transition text-center flex items-center justify-center gap-2 ${
                  authMode === 'login' || authMode === 'forgot'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Masuk Kasir
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 px-3 rounded-lg transition text-center flex items-center justify-center gap-2 ${
                  authMode === 'register'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Daftar Baru
              </button>
            </div>

            {/* TAB 1: MASUK DENGAN EMAIL & PASSWORD */}
            {authMode === 'login' && (
              <form onSubmit={handleEmailLogin} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email Kasir</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="kasir@tokosaya.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-300 font-medium">Kata Sandi</label>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('forgot');
                        setErrorMsg(null);
                        setSuccessMsg(null);
                      }}
                      className="text-[11px] text-cyan-400 hover:underline font-medium flex items-center gap-1"
                    >
                      <KeyRound className="w-3 h-3" />
                      Lupa kata sandi?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition mt-3 shadow-md shadow-emerald-500/20"
                >
                  <LogIn className="w-4 h-4" />
                  {loading ? 'Memproses Masuk...' : 'Masuk ke Kasir'}
                </button>

                <p className="text-center text-[11px] text-slate-400 pt-1">
                  Belum punya akun?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className="text-emerald-400 hover:underline font-semibold"
                  >
                    Daftar di sini
                  </button>
                </p>
              </form>
            )}

            {/* TAB 2: LUPA KATA SANDI / RESET PASSWORD */}
            {authMode === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-3.5 text-xs">
                <div className="p-3 bg-cyan-950/40 border border-cyan-500/20 rounded-xl text-xs text-cyan-300">
                  <p className="leading-relaxed text-[11px]">
                    Masukkan alamat email akun kasir Anda. Kami akan mengirimkan tautan resmi untuk mengatur ulang kata sandi baru Anda.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email Kasir Terdaftar</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="kasir@tokosaya.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-md shadow-cyan-600/20"
                >
                  <Mail className="w-4 h-4" />
                  {loading ? 'Mengirim Tautan...' : 'Kirim Tautan Reset Sandi'}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className="text-slate-400 hover:text-white text-[11px] underline"
                  >
                    ← Kembali ke Halaman Masuk
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: REGISTRASI AKUN BARU */}
            {authMode === 'register' && (
              <form onSubmit={handleEmailRegister} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Nama Kasir / Outlet</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Nama Kasir Anda"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email Kasir</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="kasir@tokosaya.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Kata Sandi</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Min 6 huruf"
                        className="w-full pl-9 pr-2 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white text-[11px] focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Konfirmasi</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi sandi"
                        className="w-full pl-9 pr-2 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white text-[11px] focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition mt-3 shadow-md shadow-emerald-500/20"
                >
                  <UserPlus className="w-4 h-4" />
                  {loading ? 'Mendaftarkan Akun...' : 'Daftar Akun Kasir Baru'}
                </button>

                <p className="text-center text-[11px] text-slate-400 pt-1">
                  Sudah punya akun?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className="text-emerald-400 hover:underline font-semibold"
                  >
                    Masuk di sini
                  </button>
                </p>
              </form>
            )}

            {/* Offline-first reassurance info */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                Dukungan Penuh Offline-First
              </div>
              <p className="leading-relaxed">
                Aplikasi kasir tetap dapat digunakan tanpa login (tersimpan di database lokal). Saat masuk akun, data otomatis disinkronkan ke Cloud Firestore.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
