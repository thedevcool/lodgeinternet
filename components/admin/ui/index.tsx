"use client";

/**
 * The admin's shared building blocks, in the glass look the dashboard and
 * transactions pages set. Mobile first: every piece here is laid out for a
 * 360px phone and widens from there.
 *
 * These were copied page by page before (six KPI tiles, three table-cell
 * pairs, a dozen hand-rolled modals), which is how the admin ended up with two
 * different looks and modals that didn't fit a phone. One copy here means a
 * fix lands on every page at once.
 */

import { useEffect } from "react";
import { X } from "lucide-react";

// ─── KPI tile ────────────────────────────────────────────────────────────────

/**
 * Tone maps are spelled out in full on purpose: Tailwind scans source text for
 * class names, so a name assembled at runtime (`kpi-${tone}`) is invisible to
 * it and gets purged from the build — this bit the dashboard once already.
 */
const KPI_TONE_BG: Record<string, string> = {
  blue: "kpi-blue",
  green: "kpi-green",
  orange: "kpi-orange",
  red: "kpi-red",
  violet: "kpi-violet",
  purple: "kpi-purple",
  slate: "kpi-slate",
  teal: "kpi-teal",
};
const KPI_TONE_RAIL: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  red: "bg-rose-500",
  violet: "bg-violet-500",
  purple: "bg-purple-500",
  slate: "bg-slate-400",
  teal: "bg-teal-500",
};

export type Tone = "blue" | "green" | "orange" | "red" | "violet" | "purple" | "slate" | "teal";

export function Kpi({
  label,
  value,
  note,
  tone = "blue",
  icon,
  small = false,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: Tone | string;
  icon?: React.ReactNode;
  /** A smaller figure, for rows of many tiles or long values. */
  small?: boolean;
}) {
  return (
    <div className={`kpi-card ${KPI_TONE_BG[tone] || KPI_TONE_BG.blue}`}>
      <span className={`kpi-rail ${KPI_TONE_RAIL[tone] || KPI_TONE_RAIL.blue}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="kpi-label">{label}</p>
        {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
      </div>
      <p className={small ? "kpi-value-sm" : "kpi-value"}>{value}</p>
      {note && <p className="kpi-note">{note}</p>}
    </div>
  );
}

// ─── Inputs, buttons ─────────────────────────────────────────────────────────

/** Glass text input / select / textarea. The class lives in globals.css. */
export const GLASS_INPUT = "glass-input";
/** An icon inside a glass input: give the input `pl-11` and place this. */
export const GLASS_INPUT_ICON = "absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400";

/**
 * A 40×40 round icon button — the smallest a thumb hits reliably. `label` is
 * required because an icon alone tells a screen reader nothing.
 */
export function IconButton({
  label,
  onClick,
  children,
  tone = "default",
  disabled,
  type = "button",
  className = "",
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  tone?: "default" | "danger" | "primary" | "success";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const toneClass = {
    default: "text-slate-600 hover:text-slate-900",
    danger: "text-rose-600 hover:bg-rose-50",
    primary: "text-blue-600 hover:bg-blue-50",
    success: "text-emerald-600 hover:bg-emerald-50",
  }[tone];
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`glass-icon shrink-0 disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Labeled multi-way toggle (all/month, day/month/year, Fixed/Ongoing, …).
 * Distinct from `.segmented`, which is icon-only. Scrolls sideways rather than
 * overflowing when its options are wider than the screen.
 */
export function SegToggle<T extends string>({
  value,
  onChange,
  options,
  activeClass = "bg-slate-900 text-white shadow-sm",
  className = "",
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: React.ReactNode }[];
  activeClass?: string;
  className?: string;
}) {
  return (
    <div className={`ui-scroll-x max-w-full ${className}`}>
      <div className="inline-flex min-w-max rounded-full border border-white/80 bg-white/70 p-1 backdrop-blur-xl">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`min-h-[36px] rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              value === opt.value ? activeClass : "text-slate-600 hover:bg-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The page's section tabs: pills that scroll sideways on a phone. */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: React.ReactNode; icon?: React.ReactNode; count?: number; hidden?: boolean }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="ui-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex min-w-max gap-1 rounded-full border border-white/80 bg-white/70 p-1 backdrop-blur-xl">
        {tabs
          .filter((tab) => !tab.hidden)
          .map((tab) => {
            const active = tab.value === value;
            return (
              <button
                key={tab.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(tab.value)}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition sm:px-5 ${
                  active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                }`}
              >
                {tab.icon}
                {tab.label}
                {typeof tab.count === "number" && tab.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                      active ? "bg-white/20 text-white" : "slate-chip"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}

// ─── Page frame ──────────────────────────────────────────────────────────────

/**
 * Every admin page's header and body.
 *
 * No logo, back button or sign-out here: the shell already carries them (the
 * pinned sidebar from `lg` up, the top bar and drawer below it), and on a
 * phone those copies were what pushed each page's header off the screen.
 */
export function AdminPage({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  width = "wide",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Header buttons. They wrap below the title on a phone. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** "narrow" for single-column forms (settings, migrations). */
  width?: "wide" | "narrow";
}) {
  return (
    <div className="analytics-shell min-h-screen">
      <header className="glass-header">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <main
        className={`mx-auto space-y-5 px-4 py-5 sm:px-8 sm:py-6 ${width === "narrow" ? "max-w-4xl" : "max-w-[1600px]"}`}
      >
        {children}
      </main>
    </div>
  );
}

/** A glass section with an optional heading row (which wraps on a phone). */
export function Panel({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = "",
  flush = false,
}: {
  eyebrow?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** No inner padding — for a table or list that runs edge to edge. */
  flush?: boolean;
}) {
  const heading = (eyebrow || title || actions) && (
    <div className={`panel-heading ${flush ? "px-4 pt-4 sm:px-7 sm:pt-6" : ""}`}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {title && <h2 className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">{title}</h2>}
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
  return (
    <section className={`glass-panel ${flush ? "!p-0" : ""} ${className}`}>
      {heading}
      {children}
    </section>
  );
}

// ─── Tables that become cards on a phone ─────────────────────────────────────

const ALIGN_CLASS: Record<"left" | "right" | "center", string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/**
 * Table header/body cells. Header type matches `.kpi-label` exactly, so table
 * headers and KPI labels read as one language. No zebra striping — glass lists
 * mark rows with hover emphasis on a flat ground.
 */
export function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <th className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500 ${ALIGN_CLASS[align]}`}>
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-5 py-3 text-sm text-slate-700 ${ALIGN_CLASS[align]} ${className}`}>
      {children}
    </td>
  );
}

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
};

/**
 * A table from `md` up, a list of stacked cards below it.
 *
 * Sideways-scrolling tables were the phone experience before: a six-column
 * table at 360px shows two columns and hides the rest. A card shows every
 * field the row has, laid out for the width. `renderCard` decides what a card
 * shows; `MobileCard` is the usual shape for it.
 *
 * `renderExpanded` adds a detail section under a row (and under its card)
 * while `isExpanded(row)` is true — the splits history uses it.
 */
export function ResponsiveTable<T>({
  rows,
  columns,
  rowKey,
  renderCard,
  renderExpanded,
  isExpanded,
  empty,
  footer,
  rowClassName,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  renderCard: (row: T) => React.ReactNode;
  renderExpanded?: (row: T) => React.ReactNode;
  isExpanded?: (row: T) => boolean;
  empty?: React.ReactNode;
  /** A totals row: cells for the table, a card for the phone list. */
  footer?: { cells: React.ReactNode; card: React.ReactNode };
  rowClassName?: (row: T) => string;
}) {
  if (rows.length === 0 && empty) {
    return <div className="px-4 py-10 text-center text-sm text-slate-500 sm:px-7">{empty}</div>;
  }
  return (
    <>
      <ul className="space-y-3 p-4 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            {renderCard(row)}
            {renderExpanded && isExpanded?.(row) && <div className="mt-2">{renderExpanded(row)}</div>}
          </li>
        ))}
        {footer && <li>{footer.card}</li>}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200/70">
              {columns.map((col) => (
                <Th key={col.key} align={col.align}>
                  {col.header}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <TableRowGroup key={rowKey(row)}>
                <tr className={`border-t border-slate-100 transition hover:bg-white/50 ${rowClassName?.(row) ?? ""}`}>
                  {columns.map((col) => (
                    <Td key={col.key} align={col.align} className={col.className}>
                      {col.cell(row)}
                    </Td>
                  ))}
                </tr>
                {renderExpanded && isExpanded?.(row) && (
                  <tr className="bg-white/40">
                    <td colSpan={columns.length} className="px-5 py-4">
                      {renderExpanded(row)}
                    </td>
                  </tr>
                )}
              </TableRowGroup>
            ))}
          </tbody>
          {footer && <tfoot className="border-t-2 border-slate-200/80 bg-white/40">{footer.cells}</tfoot>}
        </table>
      </div>
    </>
  );
}

function TableRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * The usual card for a row on a phone: what it is and its key figure on top,
 * the rest as small lines underneath, actions along the bottom.
 */
export function MobileCard({
  title,
  aside,
  subtitle,
  lines,
  badges,
  actions,
  onClick,
}: {
  title: React.ReactNode;
  /** The figure that matters most (an amount, a count), top right. */
  aside?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Label/value pairs, or bare nodes, shown in a two-column grid. */
  lines?: (React.ReactNode | { label: string; value: React.ReactNode })[];
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={`glass-card ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="break-words font-semibold text-slate-900">{title}</div>
          {subtitle && <div className="mt-0.5 break-words text-xs text-slate-500">{subtitle}</div>}
        </div>
        {aside && <div className="shrink-0 text-right font-semibold text-slate-900">{aside}</div>}
      </div>
      {badges && <div className="mt-2 flex flex-wrap gap-1.5 text-xs">{badges}</div>}
      {lines && lines.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          {lines.map((line, i) =>
            line && typeof line === "object" && "label" in (line as object) ? (
              <div key={i} className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                  {(line as { label: string }).label}
                </dt>
                <dd className="break-words text-slate-700">{(line as { value: React.ReactNode }).value}</dd>
              </div>
            ) : (
              <div key={i} className="col-span-2 min-w-0 break-words text-slate-600">
                {line as React.ReactNode}
              </div>
            ),
          )}
        </dl>
      )}
      {actions && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-3">{actions}</div>}
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

const MODAL_WIDTH = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
};

/**
 * A glass modal: a bottom sheet on a phone, centred from `sm` up.
 *
 * Always fits the screen — the body scrolls inside a 90dvh cap, so a long form
 * stays reachable with the keyboard open — and the footer's buttons stack full
 * width on a phone instead of overflowing side by side.
 */
export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof MODAL_WIDTH;
  /** False while something is in flight that must not be abandoned. */
  dismissible?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismissible && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/30 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => dismissible && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`glass-drawer w-full max-h-[90dvh] !overflow-hidden rounded-b-none sm:rounded-[32px] ${MODAL_WIDTH[size]}`}
      >
        {(title || dismissible) && (
          <div className="flex items-start gap-3 border-b border-white/80 px-5 py-4 sm:px-6">
            {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
            <div className="min-w-0 flex-1 text-lg font-semibold text-slate-900">{title}</div>
            {dismissible && (
              <IconButton label="Close" onClick={onClose} className="-my-1 -mr-1">
                <X size={18} />
              </IconButton>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-white/80 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:justify-end sm:px-6 [&>*]:w-full sm:[&>*]:w-auto">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

/** The loading / empty / denied message that fills a section. */
export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {icon && <div className="text-slate-400">{icon}</div>}
      <p className="font-semibold text-slate-800">{title}</p>
      {children && <div className="max-w-sm text-sm text-slate-500">{children}</div>}
    </div>
  );
}
