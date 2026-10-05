import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
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
import { Product, Transaction, StoreSettings } from '../types';
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

export const auth = getAuth(app);
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

// ----------------- AUTHENTICATION HELPERS -----------------

export async function loginWithGoogle(): Promise<FirebaseUser> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    // Sync user record to /users/{uid}
    if (result.user) {
      const userRef = doc(db, 'users', result.user.uid);
      await setDoc(userRef, {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName || 'Kasir',
        photoURL: result.user.photoURL || '',
        role: 'cashier',
        createdAt: new Date().toISOString()
      }, { merge: true });
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
  displayName: string
): Promise<FirebaseUser> {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    if (displayName.trim()) {
      await updateProfile(res.user, { displayName: displayName.trim() });
    }
    // Sync to Firestore /users/{uid} with 1.8s timeout protection
    const userRef = doc(db, 'users', res.user.uid);
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout writing user doc')), 1800)
      );
      await Promise.race([
        setDoc(userRef, {
          uid: res.user.uid,
          email: res.user.email,
          displayName: displayName.trim() || 'Kasir',
          photoURL: '',
          role: 'cashier',
          createdAt: new Date().toISOString()
        }, { merge: true }),
        timeoutPromise
      ]);
    } catch (e) {
      console.warn('Syncing user profile to Firestore timed out or was offline:', e);
    }

    return res.user;
  } catch (error: any) {
    console.error('Register error:', error);
    throw error;
  }
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

export function subscribeProducts(
  onProductsUpdate: (products: Product[]) => void,
  onError?: (err: any) => void
) {
  if (!auth.currentUser) {
    if (onError) onError(new Error('User not authenticated'));
    return () => {};
  }

  const productsCol = collection(db, 'products');
  return onSnapshot(
    productsCol,
    (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          firestoreId: docSnap.id,
          name: data.name || '',
          sku: data.sku || '',
          price: Number(data.price) || 0,
          stock: Number(data.stock) || 0,
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

export async function saveProductToFirestore(product: Product): Promise<string> {
  if (!auth.currentUser) {
    // In local offline mode, return local id without attempting cloud sync
    return String(product.id || '');
  }
  const path = 'products';
  try {
    const productData = {
      name: product.name,
      sku: product.sku,
      price: Number(product.price) || 0,
      stock: Number(product.stock) || 0,
      category: product.category || 'Makanan',
      barcode: product.barcode || '',
      color: product.color || '#10B981',
      description: product.description || '',
      updatedAt: new Date().toISOString()
    };

    // 1. Search if a document with this SKU exists in Firestore to update it in-place
    if (product.sku) {
      const q = query(collection(db, path), where('sku', '==', product.sku));
      const snaps = await getDocs(q);
      if (!snaps.empty) {
        for (const docSnap of snaps.docs) {
          await updateDoc(docSnap.ref, productData);
        }
        return snaps.docs[0].id;
      }
    }

    // 2. If product.id is a string (e.g. Firestore doc ID), use it
    if (product.id && typeof product.id === 'string' && isNaN(Number(product.id))) {
      const docRef = doc(db, path, product.id);
      await setDoc(docRef, productData, { merge: true });
      return product.id;
    } else {
      const newDocRef = await addDoc(collection(db, path), productData);
      return newDocRef.id;
    }
  } catch (error) {
    console.error('saveProductToFirestore error:', error);
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function deleteProductFromFirestore(
  id?: number | string, 
  sku?: string, 
  name?: string
): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'products';
  try {
    // 1. If we have a string ID, delete it
    if (id && typeof id === 'string' && isNaN(Number(id))) {
      await deleteDoc(doc(db, path, id));
    }
    // 2. Query by SKU to delete any matching documents in Firestore
    if (sku) {
      const q = query(collection(db, path), where('sku', '==', sku));
      const snaps = await getDocs(q);
      for (const d of snaps.docs) {
        await deleteDoc(d.ref);
      }
    }
    // 3. Also query by name if provided
    if (name) {
      const q = query(collection(db, path), where('name', '==', name));
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

export async function clearAllStockInFirestore(): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'products';
  try {
    const snaps = await getDocs(collection(db, path));
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

export async function deleteAllProductsFromFirestore(): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'products';
  try {
    const snaps = await getDocs(collection(db, path));
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

export async function batchSaveProductsToFirestore(products: Product[]): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'products';
  try {
    const batch = writeBatch(db);
    for (const p of products) {
      const docRef = p.id && typeof p.id === 'string' && isNaN(Number(p.id)) 
        ? doc(db, path, String(p.id)) 
        : doc(collection(db, path));
      batch.set(docRef, {
        name: p.name,
        sku: p.sku,
        price: Number(p.price) || 0,
        stock: Number(p.stock) || 0,
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
        await saveProductToFirestore(p);
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
  onError?: (err: any) => void
) {
  if (!auth.currentUser) {
    if (onError) onError(new Error('User not authenticated'));
    return () => {};
  }

  const txCol = collection(db, 'transactions');
  const q = query(txCol, orderBy('timestamp', 'desc'), limit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Transaction[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          firestoreId: docSnap.id,
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

export async function saveTransactionToFirestore(transaction: Transaction): Promise<string> {
  if (!auth.currentUser) {
    return String(transaction.id || '');
  }
  const path = 'transactions';
  try {
    const txData = {
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
          enableAutoCut: Boolean(data.enableAutoCut)
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
