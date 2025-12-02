'use client';

import React from 'react';

interface QuickAction {
  icon: string;
  label: string;
  prompt: string;
}

const ACTIONS: QuickAction[] = [
  { icon: '💸', label: 'Add expense', prompt: 'I spent $' },
  { icon: '💰', label: 'Add income', prompt: 'I received $' },
  { icon: '📊', label: 'Summary', prompt: 'Show me my financial summary' },
  { icon: '📈', label: 'Net worth', prompt: "What's my current net worth?" },
  { icon: '🏦', label: 'Tax estimate', prompt: 'Calculate my tax liability' },
  { icon: '📉', label: 'Spending analysis', prompt: 'Analyze my spending patterns' },
];

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
}

export function QuickActions({ onSelect }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map((action, i) => (
        <button
          key={i}
          onClick={() => onSelect(action.prompt)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-xs font-medium whitespace-nowrap transition-colors"
        >
          <span>{action.icon}</span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
