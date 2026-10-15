'use client';

import React from 'react';
import { useUiStore } from '@/store/useUiStore';
import { ModalShell } from './ModalShell';

export function ConfirmModal() {
  const confirmModal = useUiStore((s) => s.confirmModal);
  const closeConfirmModal = useUiStore((s) => s.closeConfirmModal);

  if (!confirmModal) return null;

  const handleConfirm = () => {
    confirmModal.onConfirm();
    closeConfirmModal();
  };

  const handleCancel = () => {
    confirmModal.onCancel?.();
    closeConfirmModal();
  };

  return (
    <ModalShell
      titleId="confirm-modal-title"
      onCancel={handleCancel}
      className="w-[min(520px,calc(100vw-48px))] max-h-[86vh] flex flex-col bg-surface rounded-[28px] px-[36px] pt-[32px] pb-[28px] border border-line2 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] relative overflow-hidden focus:outline-none"
    >
      <div className="flex flex-col gap-2">
        <h2
          id="confirm-modal-title"
          className="font-heading font-extrabold text-[34px] tracking-[-0.02em] text-ink leading-tight"
        >
          {confirmModal.title}{' '}
          {confirmModal.accentWord && (
            <span className="font-accent italic text-[40px] text-red font-normal">
              {confirmModal.accentWord}
            </span>
          )}
        </h2>
        {confirmModal.message && (
          <p className="text-[15px] text-muted leading-normal">
            {confirmModal.message}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 mt-8">
        <button
          type="button"
          onClick={handleCancel}
          className="h-[48px] px-6 rounded-[14px] border-[1.5px] border-line2 bg-transparent hover:bg-surface2 text-ink font-bold text-[16px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          {confirmModal.cancelLabel || 'Cancel'}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className={`h-[48px] px-6 rounded-[14px] font-bold text-[16px] transition-all cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue ${
            confirmModal.destructive !== false
              ? 'bg-red text-on-red shadow-[0_8px_24px_-6px_rgba(244,112,103,0.55)] hover:opacity-95'
              : 'bg-blue text-on-blue shadow-sm hover:opacity-95'
          }`}
        >
          {confirmModal.confirmLabel || 'Reset'}
        </button>
      </div>
    </ModalShell>
  );
}
