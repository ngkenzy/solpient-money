"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Shared inline two-click confirmation for destructive import actions.
 *
 * First click on the action button arms it (no browser confirm dialog);
 * this panel renders the explicit second click plus Cancel. API failures
 * render through ImportActionAlert (role="alert") instead of tiny text.
 */
export function ImportActionConfirm({
  title,
  detail,
  confirmLabel,
  busyLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  detail: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="import-confirm"
      role="group"
      aria-label={title}
    >
      <p>
        <strong>{title}</strong>
      </p>
      <p>{detail}</p>
      <div className="import-confirm-actions">
        <button
          type="button"
          className="danger"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ImportActionAlert({
  message,
}: {
  message: string;
}) {
  return (
    <div className="import-alert" role="alert">
      <AlertTriangle size={14} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
