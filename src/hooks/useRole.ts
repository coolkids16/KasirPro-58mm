import { useState, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { UserProfile, UserRole } from '../types';
import { auth, subscribeToAuthState, subscribeUserProfile, setActiveStoreId } from '../services/firebase';

export interface RolePermissions {
  canAccessPos: boolean;
  canAccessProducts: boolean;
  canEditProducts: boolean;
  canAccessTransactions: boolean;
  canAccessSettings: boolean;
  canManageUsers: boolean;
  canAccessPrinterTest: boolean;
}

export function useRole() {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingRole, setIsLoadingRole] = useState<boolean>(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let activeUid: string | null = null;

    const unsubAuth = subscribeToAuthState((user) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      activeUid = user?.uid || null;
      setCurrentUser(user);
      setUserProfile(null);
      if (user) {
        setIsLoadingRole(true);
        unsubProfile = subscribeUserProfile(user.uid, (profile) => {
          if (activeUid !== user.uid) return;
          setUserProfile(profile);
          setActiveStoreId(profile?.storeId || null);
          setIsLoadingRole(false);
        });
      } else {
        setUserProfile(null);
        setActiveStoreId(null);
        setIsLoadingRole(false);
      }
    });

    return () => {
      activeUid = null;
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const role: UserRole | null = userProfile?.role || null;
  const storeId: string | null = userProfile?.storeId || null;

  const isOwner = role === 'owner';
  const isManager = role === 'manager';
  const isCashier = role === 'cashier';

  // Role permissions matrix sesuai spesifikasi
  const permissions: RolePermissions = {
    // 1. POS / Halaman Kasir: Semua role bisa akses
    canAccessPos: true,

    // 2. Produk & Stok: Owner & Manager bisa lihat & ubah. Cashier hanya read-only / tidak bisa ubah
    canAccessProducts: isOwner || isManager,
    canEditProducts: isOwner || isManager,

    // 3. Riwayat Transaksi: Semua role bisa akses (Cashier untuk rekap shift, Manager & Owner untuk analitik)
    canAccessTransactions: true,

    // 4. Pengaturan Toko & Pajak: Khusus Owner
    canAccessSettings: isOwner,

    // 5. Manajemen Pengguna (Buat akun manager/kasir): Khusus Owner
    canManageUsers: isOwner,

    // 6. Uji Printer 58mm: Semua role bisa akses
    canAccessPrinterTest: true,
  };

  const hasRole = (allowedRoles: UserRole[]): boolean => {
    if (!role) return false;
    return allowedRoles.includes(role);
  };

  const canAccessTab = (tab: 'pos' | 'products' | 'transactions' | 'printer' | 'settings' | 'users'): boolean => {
    switch (tab) {
      case 'pos':
        return permissions.canAccessPos;
      case 'products':
        return permissions.canAccessProducts;
      case 'transactions':
        return permissions.canAccessTransactions;
      case 'printer':
        return permissions.canAccessPrinterTest;
      case 'settings':
        return permissions.canAccessSettings;
      case 'users':
        return permissions.canManageUsers;
      default:
        return false;
    }
  };

  return {
    currentUser,
    userProfile,
    role,
    storeId,
    isLoadingRole,
    isOwner,
    isManager,
    isCashier,
    permissions,
    hasRole,
    canAccessTab
  };
}
