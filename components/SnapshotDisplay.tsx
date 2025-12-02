'use client';

import React, { useState } from 'react';
import { formatCurrency, formatCompactCurrency, cn } from '@/lib/utils';
import { Snapshot } from '@/lib/api';
import { 
  TrendingUp, TrendingDown, Wallet, PiggyBank, CreditCard, 
  DollarSign, Calculator, Flame, ChevronDown, ChevronUp 
} from 'lucide-react';

interface SnapshotDisplayProps {
  snapshot: Snapshot;
  compact?: boolean;
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  prefix?: string;
}

function MetricCard({ icon, label, value, color, prefix = '$' }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className={cn("text-sm font-semibold tabular-nums", color)}>
        {prefix}{Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}

export function SnapshotDisplay({ snapshot, compact = false }: SnapshotDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Compact ticker for header
  if (compact) {
    return (
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1">
          <Wallet className="h-3 w-3 text-green-400" />
          <span className="text-muted-foreground">Cash:</span>
          <span className="font-medium text-green-400">
            {formatCompactCurrency(snapshot.total_cash)}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-blue-400" />
          <span className="text-muted-foreground">Invest:</span>
          <span className="font-medium text-blue-400">
            {formatCompactCurrency(snapshot.total_investments)}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <DollarSign className="h-3 w-3 text-primary" />
          <span className="text-muted-foreground">Net:</span>
          <span className={cn(
            "font-medium",
            snapshot.net_worth >= 0 ? "text-green-400" : "text-red-400"
          )}>
            {formatCompactCurrency(snapshot.net_worth)}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Main metrics row - always visible */}
      <div className="grid grid-cols-4 gap-2 p-3 bg-secondary/30 rounded-xl">
        <MetricCard
          icon={<Wallet className="h-3 w-3" />}
          label="Cash"
          value={snapshot.total_cash}
          color="text-green-400"
        />
        <MetricCard
          icon={<TrendingUp className="h-3 w-3" />}
          label="Investments"
          value={snapshot.total_investments}
          color="text-blue-400"
        />
        <MetricCard
          icon={<CreditCard className="h-3 w-3" />}
          label="Liabilities"
          value={snapshot.total_liabilities}
          color="text-red-400"
        />
        <MetricCard
          icon={<DollarSign className="h-3 w-3" />}
          label="Net Worth"
          value={snapshot.net_worth}
          color={snapshot.net_worth >= 0 ? "text-green-400" : "text-red-400"}
        />
      </div>

      {/* Expandable section */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{isExpanded ? 'Less details' : 'More details'}</span>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {/* Secondary metrics - expandable */}
      <div className={cn(
        "grid grid-cols-4 gap-2 p-3 bg-secondary/20 rounded-xl overflow-hidden transition-all duration-300",
        isExpanded ? "max-h-40 opacity-100" : "max-h-0 opacity-0 p-0"
      )}>
        <MetricCard
          icon={<PiggyBank className="h-3 w-3" />}
          label="YTD Income"
          value={snapshot.ytd_income}
          color="text-green-400"
        />
        <MetricCard
          icon={<TrendingDown className="h-3 w-3" />}
          label="YTD Expenses"
          value={snapshot.ytd_expenses}
          color="text-orange-400"
        />
        <MetricCard
          icon={<Calculator className="h-3 w-3" />}
          label="Est. Tax"
          value={snapshot.estimated_tax_liability}
          color="text-purple-400"
        />
        <MetricCard
          icon={<Flame className="h-3 w-3" />}
          label="Monthly Burn"
          value={snapshot.monthly_burn_rate}
          color="text-yellow-400"
        />
      </div>
    </div>
  );
}
