'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { 
  Send, Download, BarChart3, RefreshCw, Wifi, WifiOff, 
  Menu, X, Settings, History, TrendingUp, AlertCircle,
  ChevronDown, Sparkles, Loader2, Paperclip, Image, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatMessage, LoadingMessage } from '@/components/ChatMessage';
import { SnapshotDisplay } from '@/components/SnapshotDisplay';
import { MonthlyChart } from '@/components/MonthlyChart';
import { QuickActions } from '@/components/QuickActions';
import { sendMessage, sendMessageWithFile, getState, getMonthlyData, exportCsv, isOnline, Snapshot, MonthlyDataPoint } from '@/lib/api';
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
  { icon: '💸', text: 'Add expense', prompt: 'I spent $' },
  { icon: '💰', text: 'Add income', prompt: 'I received $' },
  { icon: '📊', text: 'Show summary', prompt: 'Show me my financial summary' },
  { icon: '📈', text: 'Net worth', prompt: "What's my net worth?" },
  { icon: '🏦', text: 'Tax estimate', prompt: 'Calculate my tax estimate' },
  { icon: '📉', text: 'Spending', prompt: 'Analyze my spending this month' },
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
  const [showSidebar, setShowSidebar] = useState(false);
  const [online, setOnline] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  // Focus input on mount
  useEffect(() => {
    if (!isInitializing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isInitializing]);

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
          content: "📴 You're offline. I'll process this when you reconnect.",
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
        content: '❌ Something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
        error: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
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
          <div className="relative">
            <div className="text-6xl animate-bounce">💰</div>
            <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-yellow-400 animate-pulse" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading your finances...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header - ChatGPT style */}
      <header className="flex-shrink-0 border-b bg-card/80 backdrop-blur-sm px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowSidebar(!showSidebar)}
              className="lg:hidden p-2 hover:bg-secondary rounded-lg transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-2xl">💰</span>
              <div>
                <h1 className="text-base font-semibold leading-tight">Personal Accountant</h1>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    online ? "bg-green-500" : "bg-red-500"
                  )} />
                  <span>{online ? 'Online' : 'Offline'}</span>
                  {setupComplete && snapshot && (
                    <>
                      <span className="text-muted-foreground/50">•</span>
                      <span className="text-green-400">
                        ${(snapshot.net_worth || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowChart(!showChart)}
              className={cn("transition-colors", showChart && "bg-secondary")}
              aria-label="Toggle chart"
            >
              <BarChart3 className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExport}
              aria-label="Export ledger"
            >
              <Download className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={syncData}
              disabled={isSyncing}
              aria-label="Sync data"
            >
              <RefreshCw className={cn("h-5 w-5", isSyncing && "animate-spin")} />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Snapshot ticker - collapsible */}
        {snapshot && setupComplete && (
          <div className="flex-shrink-0 border-b bg-card/50">
            <div className="max-w-4xl mx-auto">
              <SnapshotDisplay snapshot={snapshot} />
            </div>
          </div>
        )}

        {/* Chart panel - animated */}
        <div className={cn(
          "flex-shrink-0 border-b overflow-hidden transition-all duration-300 ease-in-out",
          showChart ? "max-h-80 opacity-100" : "max-h-0 opacity-0 border-0"
        )}>
          <div className="max-w-4xl mx-auto px-4 py-3">
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader className="py-3 pb-0">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Monthly Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2 pb-3">
                {monthlyData.length > 0 ? (
                  <MonthlyChart data={monthlyData} />
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground">
                    <p>No data yet. Start tracking transactions!</p>
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
          <div className="max-w-4xl mx-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 py-12">
                <div className="relative mb-6">
                  <div className="text-7xl">💰</div>
                  <Sparkles className="absolute -top-1 -right-1 h-8 w-8 text-yellow-400" />
                </div>
                <h2 className="text-2xl font-semibold mb-3">Personal Accountant</h2>
                <p className="text-muted-foreground max-w-md mb-8">
                  Your AI-powered financial assistant. Track expenses, investments, and get tax insights using natural language.
                </p>
                
                {/* Quick actions grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-lg">
                  {QUICK_PROMPTS.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuickPrompt(item.prompt)}
                      className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors text-left group"
                    >
                      <span className="text-xl">{item.icon}</span>
                      <span className="text-sm font-medium group-hover:text-primary transition-colors">
                        {item.text}
                      </span>
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
            
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        {/* Input area - ChatGPT style */}
        <div className="flex-shrink-0 border-t bg-gradient-to-t from-background via-background to-transparent pt-2 pb-4 px-4">
          <div className="max-w-4xl mx-auto">
            {/* Quick prompts row - show when messages exist */}
            {messages.length > 0 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
                {QUICK_PROMPTS.slice(0, 4).map((item, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickPrompt(item.prompt)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-xs font-medium whitespace-nowrap transition-colors"
                  >
                    <span>{item.icon}</span>
                    <span>{item.text}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Selected file indicator */}
            {selectedFile && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-secondary/50 rounded-lg">
                {selectedFile.type.startsWith('image/') ? (
                  <Image className="h-4 w-4 text-blue-400" />
                ) : (
                  <FileText className="h-4 w-4 text-red-400" />
                )}
                <span className="text-sm truncate flex-1">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  className="p-1 hover:bg-secondary rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                onChange={handleFileSelect}
                className="hidden"
                aria-label="Upload file"
              />
              <div className="relative flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="h-10 w-10 rounded-xl flex-shrink-0"
                  aria-label="Attach file"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={selectedFile ? "Add a message about this file..." : "Type a transaction or ask a question..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  className={cn(
                    "flex-1 px-4 py-3 pr-12 rounded-2xl border bg-secondary/50 text-sm",
                    "placeholder:text-muted-foreground/60",
                    "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "transition-all duration-200"
                  )}
                  aria-label="Message input"
                />
                <Button 
                  type="submit" 
                  disabled={isLoading || (!input.trim() && !selectedFile)} 
                  size="icon"
                  className={cn(
                    "absolute right-2 h-8 w-8 rounded-xl",
                    "transition-all duration-200",
                    (input.trim() || selectedFile) ? "opacity-100" : "opacity-50"
                  )}
                  aria-label="Send message"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
            
            <p className="text-xs text-muted-foreground/60 mt-2 text-center">
              Examples: "Paid $50 for dinner" • "Sold 0.1 BTC for $4,200" • 📎 Upload receipts or statements
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
