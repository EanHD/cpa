'use client';

import React, { useEffect, useRef } from 'react';
import { cn, parseMarkdown } from '@/lib/utils';
import { User, Copy, Check, Paperclip, Calculator } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  pending?: boolean;
  error?: boolean;
  fileName?: string;
}

interface ChatMessageProps {
  message: Message;
  isLatest?: boolean;
}

export function ChatMessage({ message, isLatest }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = React.useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Animate in effect for latest message
  useEffect(() => {
    if (isLatest && messageRef.current) {
      messageRef.current.classList.add('animate-in');
    }
  }, [isLatest]);

  return (
    <div
      ref={messageRef}
      className={cn(
        'group flex gap-2.5 px-3 py-2 transition-all duration-300',
        isUser ? 'justify-end' : 'justify-start',
        isLatest && 'message-enter'
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
          <Calculator className="w-4 h-4 text-white" />
        </div>
      )}
      
      <div className={cn(
        'relative max-w-[85%] sm:max-w-[80%]',
        isUser ? 'order-first' : ''
      )}>
        {/* File attachment indicator */}
        {message.fileName && (
          <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            <span>{message.fileName}</span>
          </div>
        )}
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 shadow-sm',
            isUser
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-secondary text-secondary-foreground rounded-bl-sm',
            message.error && 'bg-destructive/10 border border-destructive/20'
          )}
        >
          <div
            className="text-[15px] leading-relaxed prose-sm prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: parseMarkdown(message.content) }}
          />
        </div>
        
        {/* Action buttons for assistant messages */}
        {!isUser && !message.error && (
          <div className={cn(
            'absolute -bottom-5 left-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'
          )}>
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-secondary transition-colors"
              aria-label={copied ? 'Copied' : 'Copy message'}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          </div>
        )}
      </div>
      
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </div>
      )}
    </div>
  );
}

export function LoadingMessage() {
  return (
    <div className="flex gap-2.5 px-3 py-2 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
        <Calculator className="w-4 h-4 text-white" />
      </div>
      <div className="bg-secondary rounded-2xl rounded-bl-sm px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-xs text-muted-foreground">Calculating...</span>
        </div>
      </div>
    </div>
  );
}
