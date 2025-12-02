'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Send, Paperclip, BarChart2, RefreshCw, Calculator, Image, FileText, X } from 'lucide-react';
import { sendMessage, sendMessageWithFile, getState, getMonthlyData, Snapshot, MonthlyDataPoint } from '@/lib/api';
import { db, initializeApp } from '@/lib/db';
import { parseMarkdown } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  fileName?: string;
}

const QUICK_PROMPTS = [
  { icon: '💸', text: 'Expense', prompt: 'I spent $' },
  { icon: '💰', text: 'Income', prompt: 'I received $' },
  { icon: '📊', text: 'Summary', prompt: 'Show my financial summary' },
  { icon: '📈', text: 'Net worth', prompt: "What's my net worth?" },
];

export function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Initialize app
  useEffect(() => {
    const init = async () => {
      setIsInitializing(true);
      try {
        const tid = await initializeApp();
        setThreadId(tid);
        
        const savedMessages = await db.messages.toArray();
        if (savedMessages.length > 0) {
          setMessages(savedMessages as Message[]);
        }
        
        if (navigator.onLine) {
          try {
            const state = await getState(tid);
            setSnapshot(state.snapshot);
            setSetupComplete(state.setup_complete);
          } catch (e) {
            console.warn('Could not fetch initial state');
          }
        }
      } catch (error) {
        console.error('Init error:', error);
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

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
      setSetupComplete(state.setup_complete);
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !selectedFile) || !threadId || isLoading) return;

    const messageContent = input.trim() || (selectedFile ? `Analyze: ${selectedFile.name}` : '');
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      fileName: selectedFile?.name,
    };

    setMessages(prev => [...prev, userMessage]);
    await db.messages.put(userMessage);
    
    const fileToSend = selectedFile;
    setInput('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsLoading(true);

    try {
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

      setMessages(prev => [...prev, assistantMessage]);
      await db.messages.put(assistantMessage);
      setSnapshot(response.snapshot);
      setSetupComplete(response.setup_complete);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const formatMoney = (value: number) => {
    const formatted = Math.abs(value).toLocaleString('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    });
    return value < 0 ? `-$${formatted}` : `$${formatted}`;
  };

  if (isInitializing) {
    return (
      <div className="app-shell">
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-state-icon">
            <Calculator size={32} />
          </div>
          <div className="loading-dots">
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ 
            width: '36px', 
            height: '36px', 
            background: 'linear-gradient(135deg, #16a34a, #22c55e)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Calculator size={20} color="white" />
          </div>
          <span style={{ fontSize: '17px', fontWeight: 600 }}>Accountant</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button 
            className="attach-button"
            onClick={syncData}
            disabled={isSyncing}
          >
            <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Dashboard Cards */}
      {snapshot && setupComplete && (
        <div className="dashboard-strip">
          <div className="dashboard-cards">
            <div className="dashboard-card">
              <div className="dashboard-card-icon bg-money-positive">💵</div>
              <div className="dashboard-card-content">
                <span className="dashboard-card-label">Cash</span>
                <span className="dashboard-card-value text-money-positive">
                  {formatMoney(snapshot.total_cash || 0)}
                </span>
              </div>
            </div>
            <div className="dashboard-card">
              <div className="dashboard-card-icon bg-money-neutral">📈</div>
              <div className="dashboard-card-content">
                <span className="dashboard-card-label">Investments</span>
                <span className="dashboard-card-value text-money-neutral">
                  {formatMoney(snapshot.total_investments || 0)}
                </span>
              </div>
            </div>
            <div className="dashboard-card">
              <div className="dashboard-card-icon bg-money-negative">💳</div>
              <div className="dashboard-card-content">
                <span className="dashboard-card-label">Liabilities</span>
                <span className="dashboard-card-value text-money-negative">
                  {formatMoney(snapshot.total_liabilities || 0)}
                </span>
              </div>
            </div>
            <div className="dashboard-card">
              <div className="dashboard-card-icon" style={{ background: 'rgba(34, 197, 94, 0.2)' }}>🏦</div>
              <div className="dashboard-card-content">
                <span className="dashboard-card-label">Net Worth</span>
                <span className="dashboard-card-value" style={{ color: (snapshot.net_worth || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                  {formatMoney(snapshot.net_worth || 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div ref={chatContainerRef} className="chat-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Calculator size={32} />
            </div>
            <h2 className="empty-state-title">Your Accountant</h2>
            <p className="empty-state-subtitle">
              Track expenses, income, and get financial insights in natural language
            </p>
            <div className="quick-actions">
              {QUICK_PROMPTS.map((item, i) => (
                <button
                  key={i}
                  className="quick-action"
                  onClick={() => handleQuickPrompt(item.prompt)}
                >
                  <span>{item.icon}</span>
                  <span>{item.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-messages">
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`message-bubble ${message.role}`}
              >
                {message.fileName && (
                  <div style={{ 
                    fontSize: '12px', 
                    opacity: 0.7, 
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <Paperclip size={12} />
                    {message.fileName}
                  </div>
                )}
                <div 
                  className="message-content"
                  dangerouslySetInnerHTML={{ __html: parseMarkdown(message.content) }}
                />
              </div>
            ))}
            
            {isLoading && (
              <div className="message-bubble assistant">
                <div className="loading-dots">
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="input-bar">
        {selectedFile && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            background: '#111827',
            borderRadius: '12px',
            marginBottom: '8px',
            fontSize: '14px'
          }}>
            {selectedFile.type.startsWith('image/') ? (
              <Image size={16} color="#3b82f6" />
            ) : (
              <FileText size={16} color="#ef4444" />
            )}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedFile.name}
            </span>
            <button onClick={clearSelectedFile} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <X size={16} color="#9CA3AF" />
            </button>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="input-wrapper">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="attach-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            <Paperclip size={22} />
          </button>
          
          <textarea
            ref={textareaRef}
            className="input-field"
            placeholder={selectedFile ? "Add a note..." : "Message"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />
          
          <button
            type="submit"
            className="send-button"
            disabled={isLoading || (!input.trim() && !selectedFile)}
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}