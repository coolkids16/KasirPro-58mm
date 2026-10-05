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
  HelpCircle
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { 
  loginWithGoogle, 
  registerWithEmailPassword, 
  loginWithEmailPassword, 
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
  const [authMode, setAuthMode] = useState<'google' | 'login' | 'register'>('google');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states for Email/Password
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Gagal masuk dengan akun Google.');
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
        setErrorMsg('Metode Email/Password belum diaktifkan di Firebase Console. Anda dapat menggunakan tombol Google (1-Klik) untuk masuk instan.');
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
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setErrorMsg('Email atau kata sandi salah, atau akun belum terdaftar.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setErrorMsg('Metode Email/Password belum diaktifkan di Firebase Console. Gunakan tombol Google (1-Klik) untuk langsung masuk.');
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
              : 'Pilih metode masuk atau daftarkan akun kasir baru Anda.'}
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
                  {currentUser.displayName || 'Kasir Aktif'}
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
          /* View when user is not logged in: choice of Google / Email Login / Email Register */
          <div className="space-y-4">
            {/* Tab Selector */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('google');
                  setErrorMsg(null);
                }}
                className={`py-1.5 px-2 rounded-lg transition text-center ${
                  authMode === 'google'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Google 1-Klik
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setErrorMsg(null);
                }}
                className={`py-1.5 px-2 rounded-lg transition text-center ${
                  authMode === 'login'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setErrorMsg(null);
                }}
                className={`py-1.5 px-2 rounded-lg transition text-center ${
                  authMode === 'register'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Daftar Baru
              </button>
            </div>

            {/* TAB 1: GOOGLE (1-Klik Registrasi & Login Sekaligus) */}
            {authMode === 'google' && (
              <div className="space-y-3.5">
                <div className="p-3 bg-cyan-950/40 border border-cyan-500/20 rounded-xl text-xs text-cyan-300 flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
                  <p className="leading-relaxed text-[11px]">
                    <strong>Registrasi Otomatis:</strong> Masuk dengan Google tidak memerlukan pendaftaran manual terlebih dahulu. Jika akun Google Anda baru pertama kali digunakan, akun kasir akan langsung dibuatkan dan disinkronkan ke Firestore.
                  </p>
                </div>

                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold text-xs flex items-center justify-center gap-2.5 shadow-lg shadow-white/10 transition"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  {loading ? 'Menghubungkan Akun Google...' : 'Masuk / Daftar dengan Google (1-Klik)'}
                </button>
              </div>
            )}

            {/* TAB 2: MASUK DENGAN EMAIL & PASSWORD */}
            {authMode === 'login' && (
              <form onSubmit={handleEmailLogin} className="space-y-3 text-xs">
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
                  <label className="block text-slate-300 font-medium mb-1">Kata Sandi</label>
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
                  className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition mt-2 shadow-md shadow-emerald-500/20"
                >
                  <LogIn className="w-4 h-4" />
                  {loading ? 'Memproses Masuk...' : 'Masuk ke Kasir'}
                </button>

                <p className="text-center text-[11px] text-slate-400 pt-1">
                  Belum punya akun?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthMode('register')}
                    className="text-emerald-400 hover:underline font-semibold"
                  >
                    Daftar di sini
                  </button>
                </p>
              </form>
            )}

            {/* TAB 3: REGISTRASI AKUN BARU */}
            {authMode === 'register' && (
              <form onSubmit={handleEmailRegister} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Nama Kasir / Lengkap</label>
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
                  <label className="block text-slate-300 font-medium mb-1">Email</label>
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
                  className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition mt-2 shadow-md shadow-emerald-500/20"
                >
                  <UserPlus className="w-4 h-4" />
                  {loading ? 'Mendaftarkan Akun...' : 'Daftar Akun Kasir Baru'}
                </button>

                <p className="text-center text-[11px] text-slate-400 pt-1">
                  Sudah punya akun?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthMode('login')}
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
                Dukungan Offline-First
              </div>
              <p className="leading-relaxed">
                Aplikasi kasir tetap dapat dipakai tanpa login menggunakan database lokal IndexedDB. Jika login, data otomatis tersinkron ke Cloud Firestore.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
