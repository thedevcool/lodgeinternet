"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

/**
 * Toasts — iOS-style glass banners. Top-centre on phones (below the notch),
 * top-right on desktop. API unchanged: useToast().addToast({ type, title,
 * message?, duration? }). Also used by two admin pages, which get the same look.
 */
interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Counter ids: two toasts in the same millisecond no longer collide.
let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (toast: Omit<Toast, "id">) => {
    const id = `toast-${++nextToastId}`;
    const newToast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    const duration = toast.duration || 5000;
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

function ToastContainer({
  toasts,
  removeToast,
}: {
  toasts: Toast[];
  removeToast: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-[80] flex flex-col items-center gap-2 px-3 md:inset-x-auto md:right-4 md:top-4 md:items-end"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}

// Literal class strings per type (Tailwind keeps only classes it can see).
const ICONS = {
  success: { Icon: CheckCircle2, cls: "text-green-600" },
  error: { Icon: XCircle, cls: "text-red-500" },
  warning: { Icon: AlertTriangle, cls: "text-amber-500" },
  info: { Icon: Info, cls: "text-blue-500" },
} as const;

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const { Icon, cls } = ICONS[toast.type];

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      className="ui-glass ui-toast pointer-events-auto w-full max-w-[400px] animate-toast-in rounded-[22px] px-4 py-3 text-[rgb(var(--ink))]"
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cls}`} strokeWidth={2.2} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-5">{toast.title}</p>
          {toast.message && <p className="mt-0.5 text-[14px] leading-[19px] opacity-70">{toast.message}</p>}
        </div>
        <button
          onClick={() => onRemove(toast.id)}
          aria-label="Dismiss"
          className="-mr-1 rounded-full p-1 opacity-50 transition-opacity hover:opacity-90"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
