'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db, initializeApp } from '@/lib/db';
import { sendMessage, getState, getMonthlyData, syncData, isOnline, Snapshot, MonthlyDataPoint } from '@/lib/api';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  pending?: boolean;
  error?: boolean;
}

interface AppState {
  threadId: string | null;
  messages: Message[];
  snapshot: Snapshot | null;
  monthlyData: MonthlyDataPoint[];
  setupComplete: boolean;
  setupStep: number;
  isLoading: boolean;
  isOnline: boolean;
  error: string | null;
}

interface AppContextType extends AppState {
  sendUserMessage: (content: string) => Promise<void>;
  refreshState: () => Promise<void>;
  clearError: () => void;
  retryLastMessage: () => Promise<void>;
}

const defaultSnapshot: Snapshot = {
  total_cash: 0,
  total_investments: 0,
  total_liabilities: 0,
  net_worth: 0,
  ytd_income: 0,
  ytd_expenses: 0,
  estimated_tax_liability: 0,
  monthly_burn_rate: 0,
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    threadId: null,
    messages: [],
    snapshot: null,
    monthlyData: [],
    setupComplete: false,
    setupStep: 0,
    isLoading: false,
    isOnline: true,
    error: null,
  });

  // Initialize app on mount
  useEffect(() => {
    const init = async () => {
      try {
        const threadId = await initializeApp();
        
        // Load cached messages
        const cachedMessages = await db.messages.orderBy('timestamp').toArray();
        
        setState(prev => ({
          ...prev,
          threadId,
          messages: cachedMessages.length > 0 ? cachedMessages : [],
          isOnline: navigator.onLine,
        }));

        // Fetch fresh state from server
        if (navigator.onLine) {
          try {
            const serverState = await getState(threadId);
            const monthly = await getMonthlyData(threadId);
            
            setState(prev => ({
              ...prev,
              snapshot: serverState.snapshot,
              setupComplete: serverState.setup_complete,
              monthlyData: monthly,
            }));
          } catch (e) {
            console.warn('Could not fetch server state:', e);
          }
        }
      } catch (error) {
        console.error('Initialization error:', error);
        setState(prev => ({ ...prev, error: 'Failed to initialize app' }));
      }
    };

    init();

    // Online/offline listeners
    const handleOnline = () => setState(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setState(prev => ({ ...prev, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const sendUserMessage = useCallback(async (content: string) => {
    if (!state.threadId || state.isLoading) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };

    // Optimistically add user message
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
      error: null,
    }));

    // Cache locally
    await db.messages.put(userMessage);

    try {
      if (!navigator.onLine) {
        // Queue for later
        const offlineMsg: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: "📴 You're offline. I'll process your message when you're back online.",
          timestamp: new Date().toISOString(),
        };
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, offlineMsg],
          isLoading: false,
        }));
        await db.messages.put(offlineMsg);
        return;
      }

      const response = await sendMessage(state.threadId, content);

      const assistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date().toISOString(),
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        snapshot: response.snapshot,
        setupComplete: response.setup_complete,
        setupStep: response.setup_step,
        isLoading: false,
      }));

      await db.messages.put(assistantMessage);

      // Refresh monthly data
      try {
        const monthly = await getMonthlyData(state.threadId);
        setState(prev => ({ ...prev, monthlyData: monthly }));
      } catch (e) {
        console.warn('Could not refresh monthly data:', e);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: "❌ I'm having trouble connecting. Please check your connection and try again.",
        timestamp: new Date().toISOString(),
        error: true,
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, errorMsg],
        isLoading: false,
        error: 'Failed to send message',
      }));
    }
  }, [state.threadId, state.isLoading]);

  const refreshState = useCallback(async () => {
    if (!state.threadId || !navigator.onLine) return;

    try {
      const serverState = await getState(state.threadId);
      const monthly = await getMonthlyData(state.threadId);

      setState(prev => ({
        ...prev,
        snapshot: serverState.snapshot,
        setupComplete: serverState.setup_complete,
        monthlyData: monthly,
      }));
    } catch (error) {
      console.error('Refresh error:', error);
    }
  }, [state.threadId]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const retryLastMessage = useCallback(async () => {
    const lastUserMsg = [...state.messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      // Remove error messages
      const cleanMessages = state.messages.filter(m => !m.error);
      setState(prev => ({ ...prev, messages: cleanMessages }));
      await sendUserMessage(lastUserMsg.content);
    }
  }, [state.messages, sendUserMessage]);

  return (
    <AppContext.Provider
      value={{
        ...state,
        sendUserMessage,
        refreshState,
        clearError,
        retryLastMessage,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
