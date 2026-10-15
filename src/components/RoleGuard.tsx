import React from 'react';
import { UserRole } from '../types';
import { useRole } from '../hooks/useRole';
import { ShieldAlert, Lock } from 'lucide-react';

export interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Komponen Pelindung Akses Berdasarkan Role (RBAC)
 * Menampilkan konten anak hanya jika role pengguna saat ini terdaftar di allowedRoles
 */
export const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedRoles,
  children,
  fallback = null
}) => {
  const { role, isLoadingRole } = useRole();

  if (isLoadingRole) {
    return (
      <div className="p-4 text-center text-xs text-slate-500 animate-pulse flex items-center justify-center gap-2">
        <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span>Memeriksa hak akses...</span>
      </div>
    );
  }

  if (!role || !allowedRoles.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export interface RoleProtectedRouteProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  pageTitle?: string;
}

/**
 * Komponen Standar Protected Route untuk React Router
 * Jika role tidak diizinkan, menampilkan pesan 'Akses Dibatasi' yang informatif dan elegan
 */
export const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({
  allowedRoles,
  children,
  pageTitle = 'Halaman'
}) => {
  const { role, isLoadingRole, currentUser } = useRole();

  if (isLoadingRole) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-3 sm:p-4 lg:p-6">
        <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-400 font-mono">Memverifikasi otorisasi akun...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-3 sm:p-4 lg:p-6 text-center max-w-md mx-auto">
        <div className="w-14 h-14 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-2xl flex items-center justify-center mb-4">
          <Lock className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Login Diperlukan</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Silakan login ke akun Anda terlebih dahulu untuk mengakses menu {pageTitle}.
        </p>
      </div>
    );
  }

  if (!role || !allowedRoles.includes(role)) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-3 sm:p-4 lg:p-6 text-center max-w-md mx-auto">
        <div className="w-14 h-14 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-2xl flex items-center justify-center mb-4">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Akses Ditolak (403 Forbidden)</h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-4">
          Role Anda saat ini adalah <strong className="text-rose-300 font-mono uppercase font-bold">[{role || 'Guest'}]</strong>.
          Halaman {pageTitle} ini khusus dibatasi untuk peran: <strong className="text-emerald-300 font-mono uppercase">{allowedRoles.join(', ')}</strong>.
        </p>
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-[11px] text-slate-400 text-left w-full">
          💡 Hubungi <strong>Owner Toko</strong> Anda jika Anda memerlukan peningkatan wewenang akun.
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
