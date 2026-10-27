declare module 'firebase/app' {
  export const initializeApp: (...args: any[]) => any;
  export const getApps: (...args: any[]) => any[];
  export const getApp: (...args: any[]) => any;
  export type FirebaseApp = any;
  const _default: any;
  export default _default;
}

declare module 'firebase/firestore' {
  export interface DocumentData {
    [field: string]: any;
  }

  export interface QueryDocumentSnapshot<T = DocumentData> {
    id: string;
    data: (options?: any) => T;
    exists: () => boolean;
    ref: DocumentReference<T>;
  }

  export interface QuerySnapshot<T = DocumentData> {
    docs: QueryDocumentSnapshot<T>[];
    empty: boolean;
    size: number;
    forEach: (callback: (doc: QueryDocumentSnapshot<T>) => void) => void;
  }

  export interface DocumentSnapshot<T = DocumentData> {
    id: string;
    data: (options?: any) => T;
    exists: () => boolean;
    ref: DocumentReference<T>;
  }

  export interface Transaction {
    get: <T = DocumentData>(documentRef: DocumentReference<T>) => Promise<DocumentSnapshot<T>>;
    set: <T = DocumentData>(documentRef: DocumentReference<T>, data: Partial<T>, options?: any) => Transaction;
    update: (documentRef: DocumentReference<any>, data: any) => Transaction;
    delete: (documentRef: DocumentReference<any>) => Transaction;
  }

  export interface WriteBatch {
    set: <T = DocumentData>(documentRef: DocumentReference<T>, data: Partial<T>, options?: any) => WriteBatch;
    update: (documentRef: DocumentReference<any>, data: any) => WriteBatch;
    delete: (documentRef: DocumentReference<any>) => WriteBatch;
    commit: () => Promise<void>;
  }

  export const getFirestore: (...args: any[]) => any;
  export const connectFirestoreEmulator: (...args: any[]) => any;
  export const collection: (...args: any[]) => any;
  export const doc: (...args: any[]) => any;
  export const getDoc: <T = DocumentData>(...args: any[]) => Promise<DocumentSnapshot<T>>;
  export const getDocs: <T = DocumentData>(...args: any[]) => Promise<QuerySnapshot<T>>;
  export const setDoc: (...args: any[]) => Promise<void>;
  export const updateDoc: (...args: any[]) => Promise<void>;
  export const addDoc: (...args: any[]) => Promise<any>;
  export const writeBatch: (...args: any[]) => WriteBatch;
  export const query: (...args: any[]) => any;
  export const where: (...args: any[]) => any;
  export const orderBy: (...args: any[]) => any;
  export const limit: (...args: any[]) => any;
  export function onSnapshot<T = DocumentData>(
    queryOrDoc: any,
    onNext: (snapshot: QuerySnapshot<T> & DocumentSnapshot<T>) => void,
    onError?: (error: any) => void
  ): () => void;
  export const runTransaction: <T>(
    firestore: any,
    updateFunction: (transaction: Transaction) => Promise<T>
  ) => Promise<T>;
  export const serverTimestamp: (...args: any[]) => any;
  export const Timestamp: any;
  export type Firestore = any;
  export type DocumentReference<T = any> = any;
  export type CollectionReference<T = any> = any;
  export type Query<T = any> = any;
  const _default: any;
  export default _default;
}

declare module 'firebase/storage' {
  export interface UploadResult {
    ref: any;
    metadata: any;
  }
  export const getStorage: (...args: any[]) => any;
  export const connectStorageEmulator: (...args: any[]) => any;
  export const ref: (...args: any[]) => any;
  export const uploadBytes: (...args: any[]) => Promise<UploadResult>;
  export const getDownloadURL: (...args: any[]) => Promise<string>;
  export type FirebaseStorage = any;
  export type StorageReference = any;
  const _default: any;
  export default _default;
}

declare module 'firebase/auth' {
  export const getAuth: (...args: any[]) => any;
  export const signInWithCustomToken: (...args: any[]) => Promise<any>;
  export const signInAnonymously: (...args: any[]) => Promise<any>;
  export const signOut: (...args: any[]) => Promise<any>;
  export const onAuthStateChanged: (auth: any, callback: (user: any) => void) => () => void;
  export type Auth = any;
  export type User = any;
  const _default: any;
  export default _default;
}

declare module 'firebase/functions' {
  export const getFunctions: (...args: any[]) => any;
  export const connectFunctionsEmulator: (...args: any[]) => any;
  export const httpsCallable: <T = any, R = any>(...args: any[]) => (data?: T) => Promise<{ data: R }>;
  export type Functions = any;
  const _default: any;
  export default _default;
}
