import { cn } from '@/lib/utils';
import { type LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  variant?: 'default' | 'teal' | 'success' | 'warning' | 'danger';
}

const variantStyles = {
  default: 'bg-card border',
  teal: 'bg-gradient-to-br from-teal/10 to-teal/5 border border-teal/20',
  success: 'bg-gradient-to-br from-emerald-50 to-emerald-50/50 dark:from-emerald-950/20 dark:to-emerald-950/10 border border-emerald-200/50 dark:border-emerald-800/30',
  warning: 'bg-gradient-to-br from-amber-50 to-amber-50/50 dark:from-amber-950/20 dark:to-amber-950/10 border border-amber-200/50 dark:border-amber-800/30',
  danger: 'bg-gradient-to-br from-red-50 to-red-50/50 dark:from-red-950/20 dark:to-red-950/10 border border-red-200/50 dark:border-red-800/30',
};

const iconVariantStyles = {
  default: 'bg-muted text-muted-foreground',
  teal: 'bg-teal/15 text-teal',
  success: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  danger: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
};

export function MetricCard({ title, value, subtitle, icon: Icon, trend, variant = 'default' }: MetricCardProps) {
  return (
    <div className={cn('rounded-xl p-5 shadow-sm', variantStyles[variant])}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={cn('text-xs font-medium', trend.value >= 0 ? 'text-emerald-600' : 'text-red-500')}>
              {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
            </p>
          )}
        </div>
        <div className={cn('rounded-lg p-2.5', iconVariantStyles[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
