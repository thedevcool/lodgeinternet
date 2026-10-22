"use client";

import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/admin/ui";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
  /** Extra controls shown under the message — an option the confirm depends on. */
  children?: React.ReactNode;
}

const ICON_TONE = {
  danger: "bg-rose-100 text-rose-600",
  warning: "bg-amber-100 text-amber-600",
  info: "bg-blue-100 text-blue-600",
};

const CONFIRM_CLASS = {
  danger: "glass-danger",
  warning: "glass-primary !from-amber-500 !to-orange-500",
  info: "glass-primary",
};

/**
 * Asks before doing something that can't be taken back. Built on the admin's
 * glass `Modal`: a bottom sheet on a phone, with the buttons stacked full
 * width, instead of a fixed card that its own long button labels overflowed.
 */
export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  type = "warning",
  children,
}: ConfirmationModalProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="md"
      icon={
        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${ICON_TONE[type]}`}>
          <AlertTriangle className="h-5 w-5" />
        </span>
      }
      title={<span className="block pt-1.5">{title}</span>}
      footer={
        <>
          <button type="button" onClick={onClose} className="glass-button">
            {cancelText}
          </button>
          <button type="button" onClick={handleConfirm} className={CONFIRM_CLASS[type]}>
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600">{message}</p>
      {children && <div className="mt-4">{children}</div>}
    </Modal>
  );
}
