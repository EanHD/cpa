// API URL - for browser, use relative path; for SSR, use env var
function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    // Browser: use relative URL (handled by Next.js rewrites)
    return '';
  }
  // Server: use internal Docker network URL
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
}

export interface Snapshot {
  total_cash: number;
  total_investments: number;
  total_liabilities: number;
  net_worth: number;
  ytd_income: number;
  ytd_expenses: number;
  estimated_tax_liability: number;
  monthly_burn_rate: number;
}

export interface ChatResponse {
  response: string;
  snapshot: Snapshot;
  setup_complete: boolean;
  setup_step: number;
}

export interface StateResponse {
  thread_id: string;
  snapshot: Snapshot;
  user_profile: any;
  accounts: Record<string, any>;
  transaction_count: number;
  setup_complete: boolean;
}

export interface MonthlyDataPoint {
  month: string;
  income: number;
  expenses: number;
}

export async function sendMessage(threadId: string, message: string): Promise<ChatResponse> {
  const response = await fetch(`${getApiUrl()}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      thread_id: threadId,
      message,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function sendMessageWithFile(
  threadId: string, 
  message: string, 
  file: File
): Promise<ChatResponse> {
  const formData = new FormData();
  formData.append('thread_id', threadId);
  formData.append('message', message);
  formData.append('file', file);

  const response = await fetch(`${getApiUrl()}/api/chat/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function getState(threadId: string): Promise<StateResponse> {
  const response = await fetch(`${getApiUrl()}/api/state/${threadId}`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function getMonthlyData(threadId: string, year?: number): Promise<MonthlyDataPoint[]> {
  const apiUrl = getApiUrl();
  const url = year 
    ? `${apiUrl}/api/monthly-data/${threadId}?year=${year}`
    : `${apiUrl}/api/monthly-data/${threadId}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}

export async function exportCsv(threadId: string): Promise<Blob> {
  const response = await fetch(`${getApiUrl()}/api/export/${threadId}`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.blob();
}

export async function syncData(
  threadId: string, 
  transactions: any[], 
  accounts: Record<string, any>
): Promise<any> {
  const response = await fetch(`${getApiUrl()}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      thread_id: threadId,
      transactions,
      accounts,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Check if we're online
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// WebSocket connection for real-time updates
export function createWebSocket(threadId: string): WebSocket | null {
  if (typeof window === 'undefined') return null;
  
  const wsUrl = `ws://${window.location.host}`;
  return new WebSocket(`${wsUrl}/ws/${threadId}`);
}
