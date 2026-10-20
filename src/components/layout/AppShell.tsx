'use client';

import React, { useEffect } from 'react';
import { useSessionStore, getJobAssetIds } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { importFiles } from '@/lib/importImages';
import { nanoid } from 'nanoid';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { StartScreen } from './StartScreen';
import { RightPanel } from './RightPanel';
import { TextToolbar } from './TextToolbar';
import { PageStack } from '../canvas/PageStack';
import { newTextPage } from '@/lib/textActions';
import { PrintView } from '@/components/output/PrintView';
import { CheckNotice } from '@/components/output/CheckNotice';
import { ExportProgress } from '@/components/output/ExportProgress';
import { requestPrint, requestExportPdf, startExportPdf, confirmNotice, cancelExportPdf, getOutputPageIndexes, executePrintWithOptions, startExportPdfWithOptions, executePrintTestSheet } from '@/lib/outputManager';
import { loadPagePrintImages } from '@/lib/printImageLoader';
import { ArrangeModal } from '@/components/modals/ArrangeModal';
import { LayoutModal } from '@/components/modals/LayoutModal';
import { ChangeLayoutModal } from '@/components/modals/ChangeLayoutModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { PrintChooserModal } from '@/components/modals/PrintChooserModal';
import { CropModal } from '@/components/modals/CropModal';
import type { PageElement } from '@/types';
import { getBackNudge, setBackNudge, resetBackNudge } from '@/lib/backNudge';
import { mirrorPageForOutput } from '@/lib/backMirror';
import { generateTestSheetJob } from '@/lib/testSheet';
import {
  copySelection,
  cutSelection,
  duplicateSelection,
  pasteInAppClipboard,
  hasInAppClipboard,
  clearInAppClipboard,
  isInputOrModalFocused,
} from '@/lib/clipboard';

export function AppShell() {
  const { jobs, assets } = useSessionStore();
  const { initTheme } = useUiStore();

  // Initialize theme listener, refit default elements, and load stored theme on mount
  useEffect(() => {
    initTheme();
    useSessionStore.getState().refitDefaultElements();
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      (window as any).__AZ_TEST__ = {
        useSessionStore,
        useUiStore,
        requestPrint,
        requestExportPdf,
        startExportPdf,
        executePrintWithOptions,
        startExportPdfWithOptions,
        executePrintTestSheet,
        getOutputPageIndexes,
        loadPagePrintImages,
        getBackNudge,
        setBackNudge,
        resetBackNudge,
        mirrorPageForOutput,
        generateTestSheetJob,
        importFiles,
        copySelection,
        cutSelection,
        duplicateSelection,
        pasteInAppClipboard,
        hasInAppClipboard,
        clearInAppClipboard,
        isInputOrModalFocused,
      };
    }
  }, [initTheme]);

  // Warn before closing tab if ANY job has at least one element OR if any image asset exists
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasAnyElement = jobs.some((job) =>
        job.pages.some((page) => page.elements && page.elements.length > 0)
      );
      const hasAnyAsset = assets.length > 0;

      if (hasAnyElement || hasAnyAsset) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [jobs, assets]);

  // Global paste listener for images & in-app pictures
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isInputOrModalFocused()) return;

      const files: File[] = [];
      if (e.clipboardData) {
        if (e.clipboardData.files && e.clipboardData.files.length > 0) {
          for (let i = 0; i < e.clipboardData.files.length; i++) {
            const file = e.clipboardData.files[i];
            if (file) files.push(file);
          }
        } else if (e.clipboardData.items) {
          for (let i = 0; i < e.clipboardData.items.length; i++) {
            const item = e.clipboardData.items[i];
            if (item.type.indexOf('image') !== -1) {
              const file = item.getAsFile();
              if (file) files.push(file);
            }
          }
        }
      }

      // Priority: if the system clipboard has an image, paste that image.
      // Otherwise, if the in-app clipboard has pictures, paste those.
      // Clear the in-app clipboard when a system image is pasted so the two never mix.
      if (files.length > 0) {
        e.preventDefault();
        clearInAppClipboard();
        importFiles(files);
        return;
      }

      if (hasInAppClipboard()) {
        e.preventDefault();
        pasteInAppClipboard();
        return;
      }

      // Check for plain text clipboard content
      const plainText = e.clipboardData?.getData('text/plain');
      if (plainText && plainText.trim().length > 0) {
        e.preventDefault();
        newTextPage(plainText);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  // Global keyboard shortcuts (Ctrl/Cmd+Z, Y, P, C, X, D, V)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputOrModalFocused()) return;

      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          const { activeJobId, undo, redo } = useSessionStore.getState();
          if (e.shiftKey) {
            redo(activeJobId);
          } else {
            undo(activeJobId);
          }
        } else if (key === 'y') {
          e.preventDefault();
          const { activeJobId, redo } = useSessionStore.getState();
          redo(activeJobId);
        } else if (key === 'p') {
          e.preventDefault();
          requestPrint();
        } else if (key === 'c') {
          const handled = copySelection();
          if (handled) {
            e.preventDefault();
          }
        } else if (key === 'x') {
          const handled = cutSelection();
          if (handled) {
            e.preventDefault();
          }
        } else if (key === 'a' && e.shiftKey) {
          e.preventDefault();
          const { activeJobId, jobs } = useSessionStore.getState();
          const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
          if (!activeJob) return;
          const jobPics = getJobAssetIds(activeJob);
          const isStart = !activeJob.pages.some((p) => p.elements && p.elements.length > 0);
          if (isStart) {
            if (jobPics.length >= 2) {
              useUiStore.getState().setMultiImport({
                step: 'arrange',
                batchAssetIds: jobPics,
                cards: jobPics.map((id) => ({ id: nanoid(), assetIds: [id] })),
                layoutStepIndex: 0,
                chosenLayouts: {},
                isReAdd: true,
              });
            } else if (jobPics.length === 1) {
              const res = useSessionStore.getState().addBlocks(activeJob.id, [
                { kind: 'fit', assetIds: [jobPics[0]] },
              ]);
              if (res.ok) {
                useUiStore.getState().setLayoutMode('document');
                useUiStore.getState().setDocFit('fit-page');
                useUiStore.getState().setActiveAssetId(jobPics[0]);
                if (res.firstPageId) {
                  useUiStore.getState().setActivePage(res.firstPageId);
                }
              }
            }
          } else if (jobPics.length >= 2) {
            const { toggleSelectAll } = useUiStore.getState();
            toggleSelectAll();
          }
        } else if (key === 'd') {
          const handled = duplicateSelection();
          if (handled) {
            e.preventDefault();
          }
        }
      } else {
        if (!e.altKey && e.key.toLowerCase() === 'r') {
          const uiState = useUiStore.getState();
          const sessionState = useSessionStore.getState();
          const activeJob =
            sessionState.jobs.find((j) => j.id === sessionState.activeJobId) ||
            sessionState.jobs[0];
          if (!activeJob) return;

          let targetEl: PageElement | undefined;
          let targetPageId: string | undefined;

          if (uiState.selected && uiState.selected.pageId && uiState.selected.elementId) {
            targetPageId = uiState.selected.pageId;
            const p = activeJob.pages.find((pg) => pg.id === targetPageId);
            targetEl = p?.elements.find((el) => el.id === uiState.selected?.elementId);
          } else if (uiState.selectedIds.length === 1 && uiState.selectedPageId) {
            targetPageId = uiState.selectedPageId;
            const p = activeJob.pages.find((pg) => pg.id === targetPageId);
            targetEl = p?.elements.find((el) => el.id === uiState.selectedIds[0]);
          }

          if (targetEl && targetEl.type === 'image' && targetEl.assetId && targetPageId) {
            const asset = sessionState.assets.find((a) => a.id === targetEl?.assetId);
            if (asset) {
              e.preventDefault();
              const pageObj = activeJob.pages.find((p) => p.id === targetPageId);
              const activeBlock = activeJob.blocks?.find((b) => b.id === pageObj?.blockId);
              const activeRow = activeBlock?.kind === 'sheet'
                ? ((targetEl.rowId ? activeBlock.rows?.find((r) => r.id === targetEl.rowId) : undefined) ||
                   activeBlock.rows?.find((r) => r.assetId === targetEl.assetId))
                : undefined;

              const isExplicitSized = activeRow?.size?.id ? activeRow.size.id !== 'default' : false;
              const isRatioDifferent =
                targetEl.wMm > 0 && targetEl.hMm > 0 && asset.pxW > 0 && asset.pxH > 0
                  ? Math.abs(targetEl.wMm / targetEl.hMm - asset.pxW / asset.pxH) > 0.01
                  : false;
              const isSized = isExplicitSized || isRatioDifferent;
              const sizeName = activeRow?.size?.id
                ? (activeRow.size.id === 'wallet' ? 'Wallet' : activeRow.size.id)
                : isRatioDifferent
                ? (Math.abs(targetEl.wMm / targetEl.hMm - 1) < 0.05 ? '1x1' : undefined)
                : undefined;

              uiState.openCropModal({
                jobId: activeJob.id,
                target: targetEl.rowId ? { rowIds: [targetEl.rowId] } : { assetIds: [targetEl.assetId!] },
                asset,
                element: targetEl,
                initialCropRect: targetEl.cropRect || activeRow?.cropRect,
                isSizedVariant: isSized,
                sizeName,
              });
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const {
    outputMode,
    outputJob,
    outputPageIndexes: storeOutputPageIndexes,
    checkNotice,
    exportProgress,
    setCheckNotice,
    assetSrcOverrides,
    message,
    cropModal,
    closeCropModal,
  } = useUiStore();
  const { activeJobId, applyVariantCrop } = useSessionStore();
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];

  const assetsById = React.useMemo(() => {
    return new Map(assets.map((a) => [a.id, a]));
  }, [assets]);

  const outputPageIndexes = React.useMemo(() => {
    if (!activeJob) return [];
    return activeJob.pages
      .map((p, idx) => ({ hasElements: p.elements.length > 0, idx }))
      .filter((p) => p.hasElements)
      .map((p) => p.idx);
  }, [activeJob]);

  const isStartState = !activeJob?.pages.some((p) => p.elements && p.elements.length > 0);

  const effectiveJobToPrint = outputJob || activeJob;
  const effectivePageIndexesToPrint =
    storeOutputPageIndexes && storeOutputPageIndexes.length > 0
      ? storeOutputPageIndexes
      : outputPageIndexes;

  return (
    <>
      <div id="app-root" className="min-w-[1100px] h-screen flex flex-col bg-transparent overflow-hidden">
        {/* Top Navigation & Controls */}
        <TopBar />

        {/* Main Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <Sidebar />

          {/* Conditional Center Area: StartScreen OR Workspace */}
          {isStartState ? (
            <StartScreen />
          ) : (
            <>
              {/* Workspace: TextToolbar + PageStack */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <TextToolbar />
                <PageStack />
              </div>

              {/* Right Inspector Panel */}
              <RightPanel />
            </>
          )}
        </div>
      </div>

      {/* Print Root rendered for print media & PDF canvas generation */}
      {outputMode !== null && effectiveJobToPrint && (
        <div
          id="print-root"
          className={outputMode === 'export' ? 'exporting-pdf' : undefined}
          style={
            outputMode === 'export'
              ? {
                  position: 'fixed',
                  left: 0,
                  top: 0,
                  zIndex: -1,
                  pointerEvents: 'none',
                }
              : undefined
          }
        >
          <PrintView
            job={effectiveJobToPrint}
            pageIndexes={effectivePageIndexesToPrint}
            assetsById={assetsById}
            assetSrcOverrides={assetSrcOverrides || undefined}
          />
        </div>
      )}

      {/* Preflight Check Notice Modal */}
      {checkNotice && (
        <CheckNotice
          onConfirm={confirmNotice}
          onCancel={() => setCheckNotice(null)}
        />
      )}

      {/* Export Progress Modal */}
      {exportProgress && (
        <ExportProgress
          onCancel={cancelExportPdf}
        />
      )}

      {/* Toast Notification (above zoom bar) - only for warnings and errors */}
      {message && (message.type === 'warn' || message.type === 'error') && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-[86px] left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-glass backdrop-blur-[14px] border border-line2 rounded-[14px] shadow-lg text-[14px] font-bold text-ink pointer-events-none transition-all select-none"
        >
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              message.type === 'warn' ? 'bg-yellow' : 'bg-red'
            }`}
          />
          <span>{message.text}</span>
        </div>
      )}

      {/* Multi-image import modals */}
      <ArrangeModal />
      <LayoutModal />
      <ChangeLayoutModal />
      <SettingsModal />
      <ConfirmModal />
      <PrintChooserModal />
      {cropModal && (
        <CropModal
          asset={cropModal.asset}
          initialCrop={cropModal.initialCropRect}
          variantSize={
            cropModal.element
              ? { id: cropModal.sizeName || '', wMm: cropModal.element.wMm, hMm: cropModal.element.hMm }
              : undefined
          }
          isDefault={!cropModal.isSizedVariant}
          onConfirm={(newCrop) => {
            applyVariantCrop(cropModal.jobId, cropModal.target, newCrop);
            closeCropModal();
          }}
          onCancel={closeCropModal}
        />
      )}
    </>
  );
}
