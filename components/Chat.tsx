'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { 
  Send, Download, BarChart3, RefreshCw,
  TrendingUp, Loader2, Paperclip, Image, FileText, X, Calculator
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatMessage, LoadingMessage } from '@/components/ChatMessage';
import { SnapshotDisplay } from '@/components/SnapshotDisplay';
import { MonthlyChart } from '@/components/MonthlyChart';
import { sendMessage, sendMessageWithFile, getState, getMonthlyData, exportCsv, Snapshot, MonthlyDataPoint } from '@/lib/api';
import { db, initializeApp } from '@/lib/db';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  pending?: boolean;
  error?: boolean;
  fileName?: string;
}

const QUICK_PROMPTS = [
  { icon: '💸', text: 'Expense', prompt: 'I spent $' },
  { icon: '💰', text: 'Income', prompt: 'I received $' },
  { icon: '📊', text: 'Summary', prompt: 'Show my financial summary' },
  { icon: '📈', text: 'Net worth', prompt: "What's my net worth?" },
];

const ACCEPTED_FILE_TYPES = "image/*,.pdf";

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyDataPoint[]>([]);
  const [showChart, setShowChart] = useState(false);
  const [online, setOnline] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Initialize app
  useEffect(() => {
    const init = async () => {
      setIsInitializing(true);
      try {
        const id = await initializeApp();
        setThreadId(id);

        // Load cached messages
        const cachedMessages = await db.messages.orderBy('timestamp').toArray();
        if (cachedMessages.length > 0) {
          setMessages(cachedMessages);
        }

        // Fetch state from server if online
        if (navigator.onLine) {
          try {
            const state = await getState(id);
            setSnapshot(state.snapshot);
            setSetupComplete(state.setup_complete);

            const monthly = await getMonthlyData(id);
            setMonthlyData(monthly);
          } catch (e) {
            console.warn('Could not fetch server state:', e);
          }
        }
      } catch (error) {
        console.error('Initialization error:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    init();

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setOnline(navigator.onLine);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_REQUIRED') {
          syncData();
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-scroll with smooth behavior
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isLoading]);

  // Focus textarea on mount and auto-resize
  useEffect(() => {
    if (!isInitializing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isInitializing]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const syncData = async () => {
    if (!threadId || !navigator.onLine) return;
    
    setIsSyncing(true);
    try {
      const state = await getState(threadId);
      setSnapshot(state.snapshot);
      
      const monthly = await getMonthlyData(threadId);
      setMonthlyData(monthly);
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedFile) || !threadId || isLoading) return;

    const messageContent = input.trim() || (selectedFile ? `Analyze this file: ${selectedFile.name}` : '');
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      fileName: selectedFile?.name,
    };

    setMessages((prev) => [...prev, userMessage]);
    await db.messages.put(userMessage);
    const fileToSend = selectedFile;
    setInput('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsLoading(true);

    try {
      if (navigator.onLine) {
        let response;
        if (fileToSend) {
          response = await sendMessageWithFile(threadId, messageContent, fileToSend);
        } else {
          response = await sendMessage(threadId, messageContent);
        }
        
        const assistantMessage: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: response.response,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        await db.messages.put(assistantMessage);
        setSnapshot(response.snapshot);
        setSetupComplete(response.setup_complete);

        try {
          const monthly = await getMonthlyData(threadId);
          setMonthlyData(monthly);
        } catch (e) {
          console.warn('Could not refresh monthly data');
        }
      } else {
        const offlineMessage: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: "You're offline. I'll process this when you reconnect.",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, offlineMessage]);
        await db.messages.put(offlineMessage);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
        error: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const handleExport = async () => {
    if (!threadId) return;
    
    try {
      const blob = await exportCsv(threadId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ledger_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (isInitializing) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center">
            <Calculator className="h-8 w-8 text-white" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header - Clean minimal */}
      <header className="flex-shrink-0 border-b bg-card/95 backdrop-blur-sm px-4 py-2.5 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center">
              <Calculator className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Accountant</h1>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  online ? "bg-green-500" : "bg-red-500"
                )} />
                {setupComplete && snapshot ? (
                  <span className="text-emerald-400 font-medium">
                    ${(snapshot.net_worth || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                ) : (
                  <span>{online ? 'Online' : 'Offline'}</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowChart(!showChart)}
              className={cn("h-8 w-8", showChart && "bg-secondary")}
              aria-label="Toggle chart"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExport}
              className="h-8 w-8"
              aria-label="Export"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={syncData}
              disabled={isSyncing}
              className="h-8 w-8"
              aria-label="Sync"
            >
              <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Snapshot ticker */}
        {snapshot && setupComplete && (
          <div className="flex-shrink-0 border-b bg-card/50">
            <div className="max-w-3xl mx-auto">
              <SnapshotDisplay snapshot={snapshot} />
            </div>
          </div>
        )}

        {/* Chart panel - animated */}
        <div className={cn(
          "flex-shrink-0 border-b overflow-hidden transition-all duration-300 ease-in-out",
          showChart ? "max-h-72 opacity-100" : "max-h-0 opacity-0 border-0"
        )}>
          <div className="max-w-3xl mx-auto px-3 py-2">
            <Card className="bg-card/50">
              <CardHeader className="py-2 pb-0">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Monthly Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2 pb-2">
                {monthlyData.length > 0 ? (
                  <MonthlyChart data={monthlyData} />
                ) : (
                  <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                    <p>No data yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Messages area */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto chat-container"
        >
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4 py-8">
                <div className="w-20 h-20 rounded-full bg-emerald-600 flex items-center justify-center mb-4">
                  <Calculator className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Your Accountant</h2>
                <p className="text-muted-foreground text-sm max-w-xs mb-6">
                  Track expenses, income, and get financial insights
                </p>
                
                {/* Quick actions */}
                <div className="flex flex-wrap justify-center gap-2 w-full max-w-sm">
                  {QUICK_PROMPTS.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuickPrompt(item.prompt)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-secondary hover:bg-secondary/80 transition-colors text-sm"
                    >
                      <span>{item.icon}</span>
                      <span>{item.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <ChatMessage 
                    key={message.id} 
                    message={message}
                    isLatest={index === messages.length - 1}
                  />
                ))}
                
                {isLoading && <LoadingMessage />}
              </>
            )}
            
            <div ref={messagesEndRef} className="h-2" />
          </div>
        </div>

        {/* Input area - iMessage style */}
        <div className="flex-shrink-0 border-t bg-background px-3 py-2 pb-safe">
          <div className="max-w-3xl mx-auto">
            {/* Selected file indicator */}
            {selectedFile && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-secondary rounded-lg">
                {selectedFile.type.startsWith('image/') ? (
                  <Image className="h-4 w-4 text-blue-400" />
                ) : (
                  <FileText className="h-4 w-4 text-red-400" />
                )}
                <span className="text-sm truncate flex-1">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  className="p-1 hover:bg-muted rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="h-9 w-9 rounded-full flex-shrink-0"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  placeholder={selectedFile ? "Add a note..." : "Message"}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  rows={1}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-3xl border bg-secondary text-[15px] resize-none",
                    "placeholder:text-muted-foreground/60",
                    "focus:outline-none focus:ring-1 focus:ring-emerald-500/50",
                    "disabled:opacity-50",
                    "min-h-[42px] max-h-[120px]"
                  )}
                />
              </div>
              <Button 
                type="submit" 
                disabled={isLoading || (!input.trim() && !selectedFile)} 
                size="icon"
                className={cn(
                  "h-9 w-9 rounded-full bg-emerald-600 hover:bg-emerald-700 flex-shrink-0",
                  (input.trim() || selectedFile) ? "opacity-100" : "opacity-50"
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
