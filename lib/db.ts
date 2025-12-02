import Dexie, { Table } from 'dexie';

export interface Transaction {
  id: string;
  timestamp: string;
  description: string;
  amount: number;
  accountFrom: string;
  accountTo: string;
  category: string;
  subcategory?: string;
  costBasis?: number;
  assetType?: string;
  quantity?: number;
  synced: boolean;
}

export interface Account {
  name: string;
  type: string;
  balance: number;
  currency: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  pending?: boolean;
  error?: boolean;
}

export interface UserProfile {
  id: string;
  taxResidency: string;
  filingStatus: string;
  dependents: number;
  incomeSources: string[];
  annualIncomeEstimate: number;
  retirementAccounts: string[];
  investmentAccounts: string[];
  primaryBank: string;
  setupComplete: boolean;
}

export interface AppState {
  id: string;
  threadId: string;
  setupStep: number;
  lastSync: string;
  encryptionKey?: string;
}

class AccountantDB extends Dexie {
  transactions!: Table<Transaction>;
  accounts!: Table<Account>;
  messages!: Table<Message>;
  userProfile!: Table<UserProfile>;
  appState!: Table<AppState>;

  constructor() {
    super('AccountantDB');
    this.version(1).stores({
      transactions: 'id, timestamp, category, synced',
      accounts: 'name, type',
      messages: 'id, timestamp',
      userProfile: 'id',
      appState: 'id',
    });
  }
}

export const db = new AccountantDB();

// Encryption utilities using WebCrypto
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function importKey(keyString: string): Promise<CryptoKey> {
  const keyData = Uint8Array.from(atob(keyString), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(data: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return new TextDecoder().decode(decrypted);
}

// Initialize app state
export async function initializeApp(): Promise<string> {
  let state = await db.appState.get('main');
  
  if (!state) {
    const threadId = crypto.randomUUID();
    state = {
      id: 'main',
      threadId,
      setupStep: 0,
      lastSync: new Date().toISOString(),
    };
    await db.appState.put(state);
  }
  
  return state.threadId;
}

// Sync utilities
export async function getUnsyncedTransactions(): Promise<Transaction[]> {
  return await db.transactions.where('synced').equals(0).toArray();
}

export async function markTransactionsSynced(ids: string[]): Promise<void> {
  await db.transactions.where('id').anyOf(ids).modify({ synced: true });
}
