import { initializeApp, deleteApp } from 'firebase/app';
import { 
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  signInWithPopup, 
  signOut, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  initializeFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocFromServer,
  query,
  where,
  orderBy,
  limit,
  writeBatch
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Product, Transaction, StoreSettings, UserRole, UserProfile, Store, CustomTemplate, CashFlowRecord, CustomerDebt, CapitalRecord } from '../types';
import { INITIAL_PRODUCTS, DEFAULT_SETTINGS } from '../db/db';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Connect to configured firestoreDatabaseId (or default database for custom personal Firebase project)
// Force HTTP Long Polling to completely bypass Tauri/WebKitGTK WebSocket sandbox restrictions on Linux/Android
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, (firebaseConfig as any).firestoreDatabaseId && (firebaseConfig as any).firestoreDatabaseId !== '(default)'
  ? (firebaseConfig as any).firestoreDatabaseId
  : undefined);

// Initialize Firebase Auth with fallback persistence (IndexedDB falling back to localStorage)
// This is essential under WebKitGTK / Tauri sandbox to prevent Auth hanging or initialization errors
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence]
});
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validate initial connection to Firestore as required by system directives
 */
export async function validateFirestoreConnection(): Promise<boolean> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 1500)
    );
    await Promise.race([
      getDocFromServer(doc(db, 'settings', 'test-connection')),
      timeoutPromise
    ]);
    return true;
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore client is offline or network unavailable.");
    }
    return false;
  }
}

/**
 * Universal recursive sanitizer for Firestore writes.
 * Strips any undefined fields or nested undefined values to prevent Firestore rejection.
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => cleanForFirestore(item)) as any;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

// ----------------- USER PROFILE & RBAC HELPERS -----------------

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      return userSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.warn('getUserProfile error:', error);
    return null;
  }
}

export function subscribeUserProfile(uid: string, callback: (profile: UserProfile | null) => void) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as UserProfile);
      } else {
        callback(null);
      }
    },
    (err) => {
      console.warn('subscribeUserProfile error:', err);
      callback(null);
    }
  );
}

export async function loginWithGoogle(): Promise<FirebaseUser> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      const userRef = doc(db, 'users', result.user.uid);
      const existingDoc = await getDoc(userRef);
      
      if (!existingDoc.exists()) {
        // Akun pertama kali login via Google otomatis dijadikan "owner"
        const storeId = `store_${result.user.uid.slice(0, 12)}`;
        const initialProfile: UserProfile = {
          uid: result.user.uid,
          email: result.user.email || '',
          displayName: result.user.displayName || 'Owner Toko',
          photoURL: result.user.photoURL || '',
          role: 'owner',
          storeId,
          createdAt: new Date().toISOString()
        };

        // Buat store dan profil user
        await setDoc(doc(db, 'stores', storeId), {
          id: storeId,
          name: `${result.user.displayName || 'Toko'} Store`,
          ownerId: result.user.uid,
          createdAt: new Date().toISOString()
        }, { merge: true });

        await setDoc(userRef, initialProfile, { merge: true });
      }
    }
    return result.user;
  } catch (error: any) {
    console.error('Login error:', error);
    throw error;
  }
}

export async function registerWithEmailPassword(
  email: string, 
  pass: string, 
  displayName: string,
  storeName?: string
): Promise<FirebaseUser> {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    if (displayName.trim()) {
      await updateProfile(res.user, { displayName: displayName.trim() });
    }

    // Owner mendaftarkan toko pertama kali
    const storeId = `store_${res.user.uid.slice(0, 12)}`;
    const effectiveStoreName = storeName?.trim() || `${displayName.trim() || 'KasirPro'} Store`;

    // 1. Buat data toko di /stores/{storeId}
    await setDoc(doc(db, 'stores', storeId), {
      id: storeId,
      name: effectiveStoreName,
      ownerId: res.user.uid,
      createdAt: new Date().toISOString()
    }, { merge: true });

    // 2. Buat profil pengguna di /users/{uid} sebagai "owner"
    const userProfile: UserProfile = {
      uid: res.user.uid,
      email: res.user.email || email,
      displayName: displayName.trim() || 'Owner',
      photoURL: '',
      role: 'owner',
      storeId,
      createdAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'users', res.user.uid), userProfile, { merge: true });

    return res.user;
  } catch (error: any) {
    console.error('Register error:', error);
    throw error;
  }
}

/**
 * FUNGSI UTAMA BAGI "OWNER":
 * Mendaftarkan akun "manager" atau "cashier" baru ke Firebase Auth & Firestore
 * dengan storeId yang sama, TANPA membuat sesi Owner saat ini ter-logout!
 */
export async function registerStaffAccount(
  ownerProfile: UserProfile,
  staffEmail: string,
  staffPass: string,
  staffDisplayName: string,
  staffRole: 'manager' | 'cashier'
): Promise<UserProfile> {
  if (ownerProfile.role !== 'owner') {
    throw new Error('Hanya akun dengan peran "owner" yang berhak mendaftarkan akun manager atau kasir.');
  }

  if (!ownerProfile.storeId) {
    throw new Error('ID Toko (storeId) pemilik belum terkonfigurasi.');
  }

  // Gunakan Secondary Firebase App instance agar sesi Owner yang sedang aktif tidak tertimpa
  const secondaryAppName = `SecondaryAuth_${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, staffEmail, staffPass);
    if (staffDisplayName.trim()) {
      await updateProfile(cred.user, { displayName: staffDisplayName.trim() });
    }

    const newStaffProfile: UserProfile = {
      uid: cred.user.uid,
      email: staffEmail,
      displayName: staffDisplayName.trim(),
      role: staffRole,
      storeId: ownerProfile.storeId,
      createdAt: new Date().toISOString(),
      createdById: ownerProfile.uid
    };

    // Tulis dokumen staf ke Firestore menggunakan database utama
    await setDoc(doc(db, 'users', cred.user.uid), newStaffProfile);

    // Logout secondary auth instance
    await signOut(secondaryAuth);
    return newStaffProfile;
  } catch (err: any) {
    console.error('Error saat mendaftarkan staf:', err);
    throw new Error(err.message || 'Gagal membuat akun staf baru.');
  } finally {
    // Bersihkan secondary app instance dari memory
    await deleteApp(secondaryApp).catch(console.warn);
  }
}

/**
 * Hapus akun staf dari Firestore oleh Owner
 */
export async function deleteStaffAccount(staffUid: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Tidak terotentikasi');
  await deleteDoc(doc(db, 'users', staffUid));
}

/**
 * Berlangganan (listen) daftar staf di toko yang sama (untuk Owner)
 */
export function subscribeStoreStaff(
  storeId: string,
  callback: (staff: UserProfile[]) => void,
  onError?: (err: any) => void
) {
  const usersCol = collection(db, 'users');
  const q = query(usersCol, where('storeId', '==', storeId));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as UserProfile);
      });
      callback(list);
    },
    (err) => {
      console.warn('subscribeStoreStaff error:', err);
      if (onError) onError(err);
    }
  );
}

export async function loginWithEmailPassword(email: string, pass: string): Promise<FirebaseUser> {
  try {
    const res = await signInWithEmailAndPassword(auth, email, pass);
    return res.user;
  } catch (error: any) {
    console.error('Email login error:', error);
    throw error;
  }
}

export async function resetUserPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    console.error('Password reset error:', error);
    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error: any) {
    console.error('Logout error:', error);
    throw error;
  }
}

export function subscribeToAuthState(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// ----------------- FIRESTORE PRODUCTS SERVICE -----------------

let activeStoreId: string | null = null;

export function setActiveStoreId(id: string | null): void {
  activeStoreId = id;
}

export function getActiveStoreId(): string | null {
  return activeStoreId;
}

export function subscribeProducts(
  onProductsUpdate: (products: Product[]) => void,
  onError?: (err: any) => void,
  storeId?: string
) {
  if (!auth.currentUser) {
    if (onError) onError(new Error('User not authenticated'));
    return () => {};
  }

  const effectiveStoreId = storeId || activeStoreId;
  const productsCol = collection(db, 'products');
  
  // Scoped to effectiveStoreId or adoption of legacy/unassigned 'default_store' products
  const q = effectiveStoreId 
    ? query(productsCol, where('storeId', 'in', [effectiveStoreId, 'default_store']))
    : productsCol;

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        
        // Auto-migrate legacy products saved as 'default_store' to the actual active store
        if (data.storeId === 'default_store' && effectiveStoreId) {
          updateDoc(docSnap.ref, { 
            storeId: effectiveStoreId,
            updatedAt: new Date().toISOString()
          }).catch(console.warn);
        }

        const costVal = data.costPrice !== undefined 
          ? Number(data.costPrice) 
          : (data.modal !== undefined ? Number(data.modal) : (data.purchase_price !== undefined ? Number(data.purchase_price) : 0));

        list.push({
          id: docSnap.id,
          firestoreId: docSnap.id,
          storeId: data.storeId || effectiveStoreId || undefined,
          name: data.name || '',
          sku: data.sku || '',
          price: Number(data.price) || 0,
          stock: Number(data.stock) || 0,
          costPrice: costVal || 0,
          modal: costVal || 0,
          purchase_price: costVal || 0,
          unit: data.unit || 'Pcs',
          category: data.category || 'Makanan',
          barcode: data.barcode || '',
          color: data.color || '#10B981',
          description: data.description || ''
        });
      });
      onProductsUpdate(list);
    },
    (error) => {
      console.warn('Firestore Products sync error:', error);
      if (onError) onError(error);
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.GET, 'products');
      }
    }
  );
}

export async function saveProductToFirestore(product: Product, storeId?: string): Promise<string> {
  if (!auth.currentUser) {
    // In local offline mode, return local id without attempting cloud sync
    return String(product.id || '');
  }
  const path = 'products';
  try {
    let targetStoreId = storeId || product.storeId || activeStoreId;
    if (!targetStoreId && auth.currentUser) {
      try {
        const profile = await getUserProfile(auth.currentUser.uid);
        if (profile?.storeId) {
          targetStoreId = profile.storeId;
          activeStoreId = profile.storeId;
        }
      } catch (e) {}
    }
    if (!targetStoreId) {
      targetStoreId = 'default_store';
    }

    const costVal = product.costPrice !== undefined 
      ? Number(product.costPrice) 
      : (product.modal !== undefined ? Number(product.modal) : (product.purchase_price !== undefined ? Number(product.purchase_price) : 0));

    const productData = {
      storeId: targetStoreId,
      name: product.name,
      sku: product.sku,
      price: Number(product.price) || 0,
      stock: Number(product.stock) || 0,
      costPrice: costVal || 0,
      modal: costVal || 0,
      purchase_price: costVal || 0,
      unit: product.unit || 'Pcs',
      category: product.category || 'Makanan',
      barcode: product.barcode || '',
      color: product.color || '#10B981',
      description: product.description || '',
      updatedAt: new Date().toISOString()
    };

    // 1. If product has a string firestoreId or id, update it directly
    const targetDocId = product.firestoreId || (typeof product.id === 'string' && isNaN(Number(product.id)) ? product.id : null);
    if (targetDocId) {
      const docRef = doc(db, path, targetDocId);
      await setDoc(docRef, productData, { merge: true });
      return targetDocId;
    }

    // 2. Search if a document with this SKU exists in this store or default_store to update in-place
    if (product.sku) {
      const q = query(
        collection(db, path), 
        where('sku', '==', product.sku),
        where('storeId', 'in', [targetStoreId, 'default_store'])
      );
      const snaps = await getDocs(q);
      if (!snaps.empty) {
        for (const docSnap of snaps.docs) {
          await updateDoc(docSnap.ref, productData);
        }
        return snaps.docs[0].id;
      }
    }

    // 3. Otherwise add new product doc
    const newDocRef = await addDoc(collection(db, path), productData);
    return newDocRef.id;
  } catch (error) {
    console.error('saveProductToFirestore error:', error);
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function deleteProductFromFirestore(
  id?: number | string, 
  sku?: string, 
  name?: string,
  storeId?: string
): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'products';
  const effectiveStoreId = storeId || activeStoreId;
  try {
    // 1. If we have a string ID, delete it
    if (id && typeof id === 'string' && isNaN(Number(id))) {
      await deleteDoc(doc(db, path, id));
    }
    // 2. Query by SKU to delete any matching documents in Firestore
    if (sku) {
      const q = effectiveStoreId
        ? query(collection(db, path), where('sku', '==', sku), where('storeId', 'in', [effectiveStoreId, 'default_store']))
        : query(collection(db, path), where('sku', '==', sku));
      const snaps = await getDocs(q);
      for (const d of snaps.docs) {
        await deleteDoc(d.ref);
      }
    }
    // 3. Also query by name if provided
    if (name) {
      const q = effectiveStoreId
        ? query(collection(db, path), where('name', '==', name), where('storeId', 'in', [effectiveStoreId, 'default_store']))
        : query(collection(db, path), where('name', '==', name));
      const snaps = await getDocs(q);
      for (const d of snaps.docs) {
        await deleteDoc(d.ref);
      }
    }
  } catch (error) {
    console.error('deleteProductFromFirestore error:', error);
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

export async function clearAllStockInFirestore(storeId?: string): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'products';
  const effectiveStoreId = storeId || activeStoreId;
  try {
    const q = effectiveStoreId
      ? query(collection(db, path), where('storeId', 'in', [effectiveStoreId, 'default_store']))
      : collection(db, path);
    const snaps = await getDocs(q);
    if (snaps.empty) return;
    const batch = writeBatch(db);
    snaps.forEach((d) => {
      batch.update(d.ref, { 
        stock: 0, 
        updatedAt: new Date().toISOString() 
      });
    });
    await batch.commit();
  } catch (error) {
    console.error('clearAllStockInFirestore error:', error);
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function deleteAllProductsFromFirestore(storeId?: string): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'products';
  const effectiveStoreId = storeId || activeStoreId;
  try {
    const q = effectiveStoreId
      ? query(collection(db, path), where('storeId', 'in', [effectiveStoreId, 'default_store']))
      : collection(db, path);
    const snaps = await getDocs(q);
    if (snaps.empty) return;
    const batch = writeBatch(db);
    snaps.forEach((d) => {
      batch.delete(d.ref);
    });
    await batch.commit();
  } catch (error) {
    console.error('deleteAllProductsFromFirestore error:', error);
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

export async function batchSaveProductsToFirestore(products: Product[], storeId?: string): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'products';
  const targetStoreId = storeId || activeStoreId || 'default_store';
  try {
    const batch = writeBatch(db);
    for (const p of products) {
      const docRef = p.firestoreId || (p.id && typeof p.id === 'string' && isNaN(Number(p.id)))
        ? doc(db, path, String(p.firestoreId || p.id)) 
        : doc(collection(db, path));
      const costVal = p.costPrice !== undefined 
        ? Number(p.costPrice) 
        : (p.modal !== undefined ? Number(p.modal) : (p.purchase_price !== undefined ? Number(p.purchase_price) : 0));

      batch.set(docRef, {
        storeId: p.storeId || targetStoreId,
        name: p.name,
        sku: p.sku,
        price: Number(p.price) || 0,
        stock: Number(p.stock) || 0,
        costPrice: costVal || 0,
        modal: costVal || 0,
        purchase_price: costVal || 0,
        unit: p.unit || 'Pcs',
        category: p.category || 'Makanan',
        barcode: p.barcode || '',
        color: p.color || '#10B981',
        description: p.description || '',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
    await batch.commit();
  } catch (error) {
    console.warn('Batch save products failed, fallback to individual saves:', error);
    for (const p of products) {
      try {
        await saveProductToFirestore({ ...p, storeId: targetStoreId }, targetStoreId);
      } catch (e) {
        // ignore
      }
    }
  }
}

export async function batchSaveTransactionsToFirestore(transactions: Transaction[]): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'transactions';
  try {
    const batch = writeBatch(db);
    for (const t of transactions) {
      const docRef = t.id && typeof t.id === 'string' && isNaN(Number(t.id)) 
        ? doc(db, path, String(t.id)) 
        : doc(collection(db, path));
      batch.set(docRef, {
        invoiceNumber: t.invoiceNumber,
        timestamp: t.timestamp || Date.now(),
        items: t.items || [],
        subtotal: Number(t.subtotal) || 0,
        discount: Number(t.discount) || 0,
        tax: Number(t.tax) || 0,
        total: Number(t.total) || 0,
        paidAmount: Number(t.paidAmount) || 0,
        changeAmount: Number(t.changeAmount) || 0,
        paymentMethod: t.paymentMethod || 'cash',
        cashierName: t.cashierName || 'Kasir',
        notes: t.notes || '',
        createdAt: new Date().toISOString()
      }, { merge: true });
    }
    await batch.commit();
  } catch (error) {
    console.warn('Batch save transactions failed, fallback to individual saves:', error);
    for (const t of transactions) {
      try {
        await saveTransactionToFirestore(t);
      } catch (e) {
        // ignore
      }
    }
  }
}

export async function seedProductsIfEmpty(): Promise<void> {
  if (!auth.currentUser) return;
  // Prevent re-seeding if user has already initialized or deleted products
  const hasSeeded = localStorage.getItem('kasirpro_seeded_v1');
  if (hasSeeded) {
    return;
  }

  const path = 'products';
  try {
    const snapshot = await getDocs(collection(db, path));
    if (snapshot.empty) {
      const batch = writeBatch(db);
      for (const item of INITIAL_PRODUCTS) {
        const newRef = doc(collection(db, path));
        batch.set(newRef, {
          ...item,
          updatedAt: new Date().toISOString()
        });
      }
      await batch.commit();
    }
    localStorage.setItem('kasirpro_seeded_v1', 'true');
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

// ----------------- FIRESTORE TRANSACTIONS SERVICE -----------------

export function subscribeTransactions(
  onTransactionsUpdate: (transactions: Transaction[]) => void,
  onError?: (err: any) => void,
  storeId?: string
) {
  if (!auth.currentUser) {
    if (onError) onError(new Error('User not authenticated'));
    return () => {};
  }

  const effectiveStoreId = storeId || activeStoreId;
  const txCol = collection(db, 'transactions');
  const q = effectiveStoreId
    ? query(txCol, where('storeId', 'in', [effectiveStoreId, 'default_store']), orderBy('timestamp', 'desc'), limit(150))
    : query(txCol, orderBy('timestamp', 'desc'), limit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Transaction[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.storeId === 'default_store' && effectiveStoreId) {
          updateDoc(docSnap.ref, { storeId: effectiveStoreId }).catch(console.warn);
        }
        list.push({
          id: docSnap.id,
          firestoreId: docSnap.id,
          storeId: data.storeId || effectiveStoreId || undefined,
          invoiceNumber: data.invoiceNumber || docSnap.id,
          timestamp: data.timestamp || Date.now(),
          items: data.items || [],
          subtotal: Number(data.subtotal) || 0,
          discount: Number(data.discount) || 0,
          tax: Number(data.tax) || 0,
          total: Number(data.total) || 0,
          paidAmount: Number(data.paidAmount) || 0,
          changeAmount: Number(data.changeAmount) || 0,
          paymentMethod: data.paymentMethod || 'cash',
          cashierName: data.cashierName || 'Kasir',
          cashierId: data.cashierId || '',
          notes: data.notes || ''
        });
      });
      onTransactionsUpdate(list);
    },
    (error) => {
      console.warn('Firestore Transactions sync error:', error);
      if (onError) onError(error);
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.GET, 'transactions');
      }
    }
  );
}

export async function deleteTransactionFromFirestore(id: number | string, invoiceNumber?: string): Promise<void> {
  if (!auth.currentUser) return;
  const path = `transactions/${id}`;
  try {
    await deleteDoc(doc(db, 'transactions', String(id)));
  } catch (error) {
    console.warn('Direct deleteDoc by ID failed, searching by invoiceNumber:', error);
    if (invoiceNumber) {
      try {
        const q = query(collection(db, 'transactions'), where('invoiceNumber', '==', invoiceNumber));
        const snaps = await getDocs(q);
        for (const d of snaps.docs) {
          await deleteDoc(d.ref);
        }
      } catch (e) {
        console.warn('Failed to delete transaction by invoiceNumber:', e);
      }
    }
  }
}

export async function saveTransactionToFirestore(transaction: Transaction, storeId?: string): Promise<string> {
  if (!auth.currentUser) {
    return String(transaction.id || '');
  }
  const path = 'transactions';
  try {
    const targetStoreId = storeId || transaction.storeId || activeStoreId || 'default_store';
    const txData = {
      storeId: targetStoreId,
      invoiceNumber: transaction.invoiceNumber,
      timestamp: transaction.timestamp,
      items: transaction.items,
      subtotal: Number(transaction.subtotal),
      discount: Number(transaction.discount),
      tax: Number(transaction.tax),
      total: Number(transaction.total),
      paidAmount: Number(transaction.paidAmount),
      changeAmount: Number(transaction.changeAmount),
      paymentMethod: transaction.paymentMethod,
      cashierName: transaction.cashierName,
      cashierId: auth.currentUser?.uid || '',
      notes: transaction.notes || '',
      createdAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, path), txData);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ----------------- FIRESTORE STORE SETTINGS SERVICE -----------------

export function subscribeStoreSettings(
  onSettingsUpdate: (settings: StoreSettings) => void,
  onError?: (err: any) => void
) {
  if (!auth.currentUser) {
    if (onError) onError(new Error('User not authenticated'));
    return () => {};
  }

  const settingsDocRef = doc(db, 'settings', 'main');
  return onSnapshot(
    settingsDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const updatedSettings: StoreSettings = {
          storeName: data.storeName !== undefined && data.storeName !== '' ? data.storeName : DEFAULT_SETTINGS.storeName,
          logoUrl: data.logoUrl || '',
          address: data.address !== undefined ? data.address : DEFAULT_SETTINGS.address,
          phone: data.phone !== undefined ? data.phone : DEFAULT_SETTINGS.phone,
          footerMessage: data.footerMessage !== undefined ? data.footerMessage : DEFAULT_SETTINGS.footerMessage,
          paperWidthChars: Number(data.paperWidthChars) || 32,
          currencyPrefix: data.currencyPrefix || 'Rp',
          enableTax: Boolean(data.enableTax),
          taxRate: Number(data.taxRate) !== undefined ? Number(data.taxRate) : 10,
          cashierName: data.cashierName || DEFAULT_SETTINGS.cashierName,
          linuxDevicePath: data.linuxDevicePath || '/dev/usb/lp0',
          feedLines: data.feedLines !== undefined ? Number(data.feedLines) : 1,
          enableAutoCut: Boolean(data.enableAutoCut),
          compactMode: data.compactMode !== undefined ? Boolean(data.compactMode) : true,
          timezone: data.timezone || DEFAULT_SETTINGS.timezone || 'Asia/Jakarta'
        };
        try {
          localStorage.setItem('kasirpro_settings', JSON.stringify(updatedSettings));
        } catch (e) {}
        onSettingsUpdate(updatedSettings);
      }
    },
    (error) => {
      console.warn('Firestore Settings sync error:', error);
      if (onError) onError(error);
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.GET, 'settings/main');
      }
    }
  );
}

export async function saveStoreSettingsToFirestore(settings: StoreSettings): Promise<void> {
  const path = 'settings/main';
  try {
    const payload = {
      storeName: settings.storeName,
      logoUrl: settings.logoUrl || '',
      address: settings.address,
      phone: settings.phone,
      footerMessage: settings.footerMessage,
      paperWidthChars: Number(settings.paperWidthChars) || 32,
      currencyPrefix: settings.currencyPrefix || 'Rp',
      enableTax: Boolean(settings.enableTax),
      taxRate: Number(settings.taxRate) || 0,
      cashierName: settings.cashierName || 'Kasir 01',
      linuxDevicePath: settings.linuxDevicePath || '/dev/usb/lp0',
      feedLines: settings.feedLines !== undefined ? Number(settings.feedLines) : 1,
      enableAutoCut: Boolean(settings.enableAutoCut),
      compactMode: settings.compactMode !== undefined ? Boolean(settings.compactMode) : true,
      timezone: settings.timezone || 'Asia/Jakarta',
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'settings', 'main'), payload, { merge: true });
    try {
      localStorage.setItem('kasirpro_settings', JSON.stringify(settings));
    } catch (e) {}
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ----------------- FIRESTORE RECEIPT TEMPLATES SERVICE -----------------

export async function getReceiptTemplatesFromFirestore(): Promise<CustomTemplate[]> {
  const path = 'receiptTemplates';
  try {
    const templatesRef = collection(db, 'receiptTemplates');
    const snapshot = await getDocs(templatesRef);
    const templates: CustomTemplate[] = [];
    snapshot.forEach(docSnap => {
      templates.push({ id: docSnap.id, ...docSnap.data() } as CustomTemplate);
    });
    return templates;
  } catch (error) {
    console.warn('Error reading receiptTemplates from Firestore:', error);
    return [];
  }
}

export async function saveReceiptTemplateToFirestore(template: CustomTemplate): Promise<void> {
  const path = `receiptTemplates/${template.id}`;
  try {
    const docRef = doc(db, 'receiptTemplates', template.id);
    await setDoc(docRef, {
      ...template,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.warn('Error saving receiptTemplate to Firestore:', error);
  }
}

export async function deleteReceiptTemplateFromFirestore(templateId: string): Promise<void> {
  const path = `receiptTemplates/${templateId}`;
  try {
    const docRef = doc(db, 'receiptTemplates', templateId);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('Error deleting receiptTemplate from Firestore:', error);
  }
}

// ----------------- FIRESTORE CASH FLOW SERVICE -----------------

export async function saveCashFlowToFirestore(cf: CashFlowRecord, storeId?: string): Promise<string> {
  if (!auth.currentUser) return String(cf.id || '');
  const path = 'cashFlows';
  try {
    const targetStoreId = storeId || cf.storeId || activeStoreId || 'default_store';
    const payload: Record<string, any> = {
      storeId: targetStoreId,
      type: cf.type,
      category: cf.category,
      description: cf.description,
      amount: Number(cf.amount) || 0,
      status: cf.status,
      paymentMethod: cf.paymentMethod || 'Tunai',
      timestamp: cf.timestamp || Date.now(),
      dateString: cf.dateString || new Date().toISOString().split('T')[0],
      createdAt: cf.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (cf.cost !== undefined && cf.cost !== null && !isNaN(Number(cf.cost))) {
      payload.cost = Number(cf.cost);
    }
    if (cf.profit !== undefined && cf.profit !== null && !isNaN(Number(cf.profit))) {
      payload.profit = Number(cf.profit);
    }

    const cleanedPayload = cleanForFirestore(payload);

    if (cf.id && typeof cf.id === 'string' && isNaN(Number(cf.id))) {
      await setDoc(doc(db, path, cf.id), cleanedPayload, { merge: true });
      return cf.id;
    } else {
      const docRef = await addDoc(collection(db, path), cleanedPayload);
      return docRef.id;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return '';
  }
}

export async function deleteCashFlowFromFirestore(itemOrId: CashFlowRecord | string | number): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'cashFlows';
  try {
    if (typeof itemOrId === 'string' && isNaN(Number(itemOrId))) {
      await deleteDoc(doc(db, path, itemOrId));
      return;
    }

    if (typeof itemOrId === 'object' && itemOrId !== null) {
      if (itemOrId.firestoreId) {
        await deleteDoc(doc(db, path, itemOrId.firestoreId));
        return;
      }
      if (typeof itemOrId.id === 'string' && isNaN(Number(itemOrId.id))) {
        await deleteDoc(doc(db, path, itemOrId.id));
        return;
      }

      // Query matching cash flow by timestamp and amount
      if (itemOrId.timestamp && itemOrId.amount) {
        const q = query(
          collection(db, path),
          where('timestamp', '==', itemOrId.timestamp),
          where('amount', '==', Number(itemOrId.amount))
        );
        const snaps = await getDocs(q);
        for (const d of snaps.docs) {
          await deleteDoc(d.ref);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to delete cashFlow from Firestore:', error);
  }
}

export function subscribeCashFlows(
  callback: (list: CashFlowRecord[]) => void,
  onError?: (err: any) => void,
  storeId?: string
) {
  if (!auth.currentUser) {
    if (onError) onError(new Error('User not authenticated'));
    return () => {};
  }
  const targetStoreId = storeId || activeStoreId;
  const cfCol = collection(db, 'cashFlows');
  const q = targetStoreId
    ? query(cfCol, where('storeId', '==', targetStoreId))
    : query(cfCol);

  return onSnapshot(
    q,
    (snapshot) => {
      const list: CashFlowRecord[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id as any,
          ...d
        } as CashFlowRecord);
      });
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      callback(list);
    },
    (err) => {
      console.warn('subscribeCashFlows error:', err);
      if (onError) onError(err);
    }
  );
}

// ----------------- FIRESTORE DEBTS SERVICE -----------------

export async function saveDebtToFirestore(debt: CustomerDebt, storeId?: string): Promise<string> {
  if (!auth.currentUser) return String(debt.id || '');
  const path = 'debts';
  try {
    const targetStoreId = storeId || debt.storeId || activeStoreId || 'default_store';
    const payload: Record<string, any> = {
      storeId: targetStoreId,
      customerName: debt.customerName,
      customerPhone: debt.customerPhone || '',
      description: debt.description,
      totalAmount: Number(debt.totalAmount) || 0,
      cost: debt.cost !== undefined ? Number(debt.cost) : (debt.modal !== undefined ? Number(debt.modal) : 0),
      profit: debt.profit !== undefined ? Number(debt.profit) : (debt.keuntunganBersih !== undefined ? Number(debt.keuntunganBersih) : 0),
      modal: debt.modal !== undefined ? Number(debt.modal) : (debt.cost !== undefined ? Number(debt.cost) : 0),
      keuntunganBersih: debt.keuntunganBersih !== undefined ? Number(debt.keuntunganBersih) : (debt.profit !== undefined ? Number(debt.profit) : 0),
      paidAmount: Number(debt.paidAmount) || 0,
      remainingAmount: Number(debt.remainingAmount) || 0,
      status: debt.status,
      debtCategory: debt.debtCategory || 'pelanggan',
      createdAt: debt.createdAt || Date.now(),
      dueDate: debt.dueDate || '',
      payments: debt.payments || [],
      mutations: debt.mutations || [],
      updatedAt: Date.now()
    };

    const cleanedPayload = cleanForFirestore(payload);
    if (debt.firestoreId && typeof debt.firestoreId === 'string') {
      await setDoc(doc(db, path, debt.firestoreId), cleanedPayload, { merge: true });
      return debt.firestoreId;
    }
    if (debt.id && typeof debt.id === 'string' && isNaN(Number(debt.id))) {
      await setDoc(doc(db, path, debt.id), cleanedPayload, { merge: true });
      return debt.id;
    } else {
      const docRef = await addDoc(collection(db, path), cleanedPayload);
      return docRef.id;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateDebtInFirestore(docId: string | number, partial: Partial<CustomerDebt>, originalCreatedAt?: number): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'debts';
  
  // Sanitize partial: recursively remove undefined values
  const sanitizedPartial = cleanForFirestore(partial);

  try {
    if (docId && typeof docId === 'string' && isNaN(Number(docId))) {
      await setDoc(doc(db, path, docId), {
        ...sanitizedPartial,
        updatedAt: Date.now()
      }, { merge: true });
      return;
    }

    // Fallback: Query by createdAt if docId is numeric or local
    const q = originalCreatedAt
      ? query(collection(db, path), where('createdAt', '==', originalCreatedAt))
      : query(collection(db, path));
    
    const snaps = await getDocs(q);
    if (!snaps.empty) {
      for (const d of snaps.docs) {
        await setDoc(d.ref, {
          ...sanitizedPartial,
          updatedAt: Date.now()
        }, { merge: true });
      }
    } else if (originalCreatedAt) {
      await addDoc(collection(db, path), {
        ...sanitizedPartial,
        createdAt: originalCreatedAt,
        updatedAt: Date.now()
      });
    }
  } catch (error) {
    console.error('Failed to update debt in Firestore:', error);
    throw error;
  }
}

export async function deleteDebtFromFirestore(debtOrId: CustomerDebt | string | number): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'debts';
  try {
    if (typeof debtOrId === 'string' && isNaN(Number(debtOrId))) {
      await deleteDoc(doc(db, path, debtOrId));
      return;
    }

    if (typeof debtOrId === 'object' && debtOrId !== null) {
      if (debtOrId.firestoreId) {
        await deleteDoc(doc(db, path, debtOrId.firestoreId));
        return;
      }
      if (typeof debtOrId.id === 'string' && isNaN(Number(debtOrId.id))) {
        await deleteDoc(doc(db, path, debtOrId.id));
        return;
      }

      if (debtOrId.createdAt && debtOrId.totalAmount) {
        const q = query(
          collection(db, path),
          where('createdAt', '==', debtOrId.createdAt),
          where('totalAmount', '==', Number(debtOrId.totalAmount))
        );
        const snaps = await getDocs(q);
        for (const d of snaps.docs) {
          await deleteDoc(d.ref);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to delete debt from Firestore:', error);
  }
}

export async function deleteDebtsByCustomerFromFirestore(customerName: string, storeId?: string): Promise<void> {
  if (!auth.currentUser || !customerName) return;
  const path = 'debts';
  try {
    const targetStoreId = storeId || activeStoreId;
    const debtsCol = collection(db, path);
    const q = targetStoreId
      ? query(debtsCol, where('storeId', '==', targetStoreId))
      : query(debtsCol);
    const snaps = await getDocs(q);
    const target = customerName.trim().toLowerCase();
    for (const d of snaps.docs) {
      const data = d.data();
      if ((data.customerName || '').trim().toLowerCase() === target) {
        await deleteDoc(d.ref);
      }
    }
  } catch (error) {
    console.warn('Failed to delete debts by customer from Firestore:', error);
  }
}

export function subscribeDebts(
  callback: (list: CustomerDebt[]) => void,
  onError?: (err: any) => void,
  storeId?: string
) {
  if (!auth.currentUser) {
    if (onError) onError(new Error('User not authenticated'));
    return () => {};
  }
  const targetStoreId = storeId || activeStoreId;
  const debtsCol = collection(db, 'debts');
  const q = targetStoreId
    ? query(debtsCol, where('storeId', '==', targetStoreId))
    : query(debtsCol);

  return onSnapshot(
    q,
    (snapshot) => {
      const list: CustomerDebt[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id as any,
          firestoreId: docSnap.id,
          ...d
        } as CustomerDebt);
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    },
    (err) => {
      console.warn('subscribeDebts error:', err);
      if (onError) onError(err);
    }
  );
}

// ----------------- FIRESTORE CAPITAL SERVICE -----------------

export async function saveCapitalRecordToFirestore(cap: CapitalRecord, storeId?: string): Promise<string> {
  if (!auth.currentUser) return String(cap.id || '');
  const path = 'capital';
  try {
    const targetStoreId = storeId || cap.storeId || activeStoreId || 'default_store';
    const payload = {
      storeId: targetStoreId,
      type: cap.type,
      amount: Number(cap.amount) || 0,
      description: cap.description,
      timestamp: cap.timestamp || Date.now()
    };
    if (cap.firestoreId && typeof cap.firestoreId === 'string') {
      await setDoc(doc(db, path, cap.firestoreId), payload, { merge: true });
      return cap.firestoreId;
    }
    const docRef = await addDoc(collection(db, path), payload);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeCapital(
  callback: (list: CapitalRecord[]) => void,
  onError?: (err: any) => void,
  storeId?: string
) {
  if (!auth.currentUser) {
    if (onError) onError(new Error('User not authenticated'));
    return () => {};
  }
  const targetStoreId = storeId || activeStoreId;
  const capitalCol = collection(db, 'capital');
  const q = targetStoreId
    ? query(capitalCol, where('storeId', '==', targetStoreId))
    : query(capitalCol);

  return onSnapshot(
    q,
    (snapshot) => {
      const list: CapitalRecord[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id as any,
          firestoreId: docSnap.id,
          ...d
        } as CapitalRecord);
      });
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      callback(list);
    },
    (err) => {
      console.warn('subscribeCapital error:', err);
      if (onError) onError(err);
    }
  );
}

export async function deleteAllCashFlowsFromFirestore(storeId?: string): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'cashFlows';
  const effectiveStoreId = storeId || activeStoreId;
  console.log(`Deleting all from ${path} for store ${effectiveStoreId}`);
  try {
    const q = effectiveStoreId
      ? query(collection(db, path), where('storeId', '==', effectiveStoreId))
      : collection(db, path);
    const snaps = await getDocs(q);
    console.log(`Found ${snaps.size} docs in ${path}`);
    const batch = writeBatch(db);
    snaps.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`Successfully deleted ${snaps.size} docs from ${path}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteAllTransactionsFromFirestore(storeId?: string): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'transactions';
  const effectiveStoreId = storeId || activeStoreId;
  console.log(`Deleting all from ${path} for store ${effectiveStoreId}`);
  try {
    const q = effectiveStoreId
      ? query(collection(db, path), where('storeId', '==', effectiveStoreId))
      : collection(db, path);
    const snaps = await getDocs(q);
    console.log(`Found ${snaps.size} docs in ${path}`);
    const batch = writeBatch(db);
    snaps.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`Successfully deleted ${snaps.size} docs from ${path}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteAllDebtsFromFirestore(storeId?: string): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'debts';
  const effectiveStoreId = storeId || activeStoreId;
  console.log(`Deleting all from ${path} for store ${effectiveStoreId}`);
  try {
    const q = effectiveStoreId
      ? query(collection(db, path), where('storeId', '==', effectiveStoreId))
      : collection(db, path);
    const snaps = await getDocs(q);
    console.log(`Found ${snaps.size} docs in ${path}`);
    const batch = writeBatch(db);
    snaps.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`Successfully deleted ${snaps.size} docs from ${path}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteAllCapitalFromFirestore(storeId?: string): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'capital';
  const effectiveStoreId = storeId || activeStoreId;
  console.log(`Deleting all from ${path} for store ${effectiveStoreId}`);
  try {
    const q = effectiveStoreId
      ? query(collection(db, path), where('storeId', '==', effectiveStoreId))
      : collection(db, path);
    const snaps = await getDocs(q);
    console.log(`Found ${snaps.size} docs in ${path}`);
    const batch = writeBatch(db);
    snaps.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`Successfully deleted ${snaps.size} docs from ${path}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function batchSaveCashFlowsToFirestore(list: CashFlowRecord[], storeId?: string): Promise<number> {
  if (!auth.currentUser) return 0;
  let count = 0;
  for (const cf of list) {
    await saveCashFlowToFirestore(cf, storeId);
    count++;
  }
  return count;
}

export async function batchSaveDebtsToFirestore(list: CustomerDebt[], storeId?: string): Promise<number> {
  if (!auth.currentUser) return 0;
  let count = 0;
  for (const d of list) {
    await saveDebtToFirestore(d, storeId);
    count++;
  }
  return count;
}

