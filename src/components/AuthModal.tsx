import React, { useState } from 'react';
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
  KeyRound
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { 
  registerWithEmailPassword, 
  loginWithEmailPassword, 
  resetUserPassword,
  logoutUser 
} from '../services/firebase';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states for Email/Password
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-6 relative my-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/25 text-white mb-2.5">
            <UserIcon className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">
            {currentUser ? 'Profil Kasir & Akun' : 'Akun Kasir & Cloud Sync'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {currentUser 
              ? 'Terhubung dengan Firebase Firestore untuk sinkronisasi inventaris & transaksi.' 
              : 'Masuk atau daftarkan akun kasir Anda untuk sinkronisasi cloud.'}
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
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-3.5">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Kasir'}
                  className="w-12 h-12 rounded-full border border-slate-700 object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-lg">
                  {(currentUser.displayName || currentUser.email || 'K')[0].toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm truncate">
                  {currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Kasir Aktif')}
                </div>
                <div className="text-xs text-slate-400 truncate font-mono">
                  {currentUser.email}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" />
                    Kasir / Manager
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                    <CloudCheck className="w-3 h-3" />
                    Firestore Aktif
                  </span>
                </div>
              </div>
            </div>

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
