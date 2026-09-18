import type { ReactNode } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import Button from "./Button";
import { cx } from "./cx";

/** Shimmering placeholder block. Size it with className (h-*, w-*). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("ui-skeleton", className)} />;
}

/** A grouped-list shaped skeleton: N rows with a tile, a title and a subtitle. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card" aria-busy aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3.5 px-4 py-3.5">
          <Skeleton className="h-12 w-12 rounded-[13px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Calm "nothing here" message with an optional action. */
export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ink/[0.06] text-ink-2 [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      )}
      <p className="ui-headline text-ink">{title}</p>
      {message && <p className="ui-subhead mt-1.5 max-w-sm text-ink-2">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Network/data failure with a Retry button (replaces silently empty screens). */
export function ErrorState({
  title = "Couldn’t load this page",
  message = "Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={<WifiOff />}
      title={title}
      message={message}
      action={
        onRetry && (
          <Button variant="tinted" size="md" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        )
      }
    />
  );
}
