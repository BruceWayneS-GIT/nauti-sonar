import { STATUS_COLORS, CONFIDENCE_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.NEW;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', colors.bg, colors.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot, status === 'NEW' && 'status-dot')} />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: string | null }) {
  if (!confidence) return <span className="text-xs text-muted-foreground">—</span>;
  const colors = CONFIDENCE_COLORS[confidence] || CONFIDENCE_COLORS.NONE;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', colors.bg, colors.text)}>
      {confidence.charAt(0) + confidence.slice(1).toLowerCase()}
    </span>
  );
}

export function SourceStatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-emerald-500',
    PAUSED: 'bg-amber-500',
    ERROR: 'bg-red-500',
  };
  return (
    <span className={cn('inline-block h-2 w-2 rounded-full', colorMap[status] || 'bg-gray-400')} />
  );
}
