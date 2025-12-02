import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCompactCurrency(amount: number): string {
  if (Math.abs(amount) >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return formatCurrency(amount);
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function parseMarkdown(text: string): string {
  // Comprehensive markdown parsing for chat messages
  let html = text
    // Headers
    .replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold mt-3 mb-1">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mt-3 mb-2">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.*?)`/g, '<code class="bg-muted/50 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    // Lists - unordered
    .replace(/^\s*[-•]\s+(.*)$/gm, '<li class="ml-4">$1</li>')
    // Lists - ordered
    .replace(/^\s*\d+\.\s+(.*)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-3 border-border">')
    // Line breaks
    .replace(/\n/g, '<br />');
  
  // Wrap consecutive <li> items in <ul>
  html = html.replace(/(<li class="ml-4">.*?<\/li>)(\s*<br \/>)*(<li class="ml-4">)/g, '$1$3');
  
  return html;
}
