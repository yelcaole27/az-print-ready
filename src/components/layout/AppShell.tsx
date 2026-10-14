'use client';

import React, { useEffect } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { importFiles } from '@/lib/importImages';
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
import { requestPrint, confirmNotice, cancelExportPdf } from '@/lib/outputManager';
import { ArrangeModal } from '@/components/modals/ArrangeModal';
import { LayoutModal } from '@/components/modals/LayoutModal';
import { ChangeLayoutModal } from '@/components/modals/ChangeLayoutModal';
import { SettingsModal } from '@/components/modals/SettingsModal';

export function AppShell() {
  const { jobs, assets } = useSessionStore();
  const { initTheme } = useUiStore();

  // Initialize theme listener and load stored theme on mount
  useEffect(() => {
    initTheme();
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

  // Global paste listener for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = Boolean(
        target?.closest?.('[contenteditable="true"], input, textarea, select')
      );

      if (isInput || Boolean(useUiStore.getState().multiImport)) return;

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

      if (files.length > 0) {
        e.preventDefault();
        importFiles(files);
        return;
      }

      // Check for plain text clipboard content
      const plainText = e.clipboardData?.getData('text/plain');
      if (plainText && plainText.trim().length > 0) {
        e.preventDefault();
        newTextPage(plainText);
        useUiStore.getState().setMessage({
          type: 'info',
          text: 'Pasted text into a new page. Ctrl+Z to undo.',
        });
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  // Global undo/redo keyboard listeners (Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = Boolean(
        target?.closest?.('[contenteditable="true"], input, textarea, select')
      );

      if (isInput || Boolean(useUiStore.getState().multiImport)) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          const { activeJobId, undo, redo } = useSessionStore.getState();
          if (e.shiftKey) {
            redo(activeJobId);
          } else {
            undo(activeJobId);
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          const { activeJobId, redo } = useSessionStore.getState();
          redo(activeJobId);
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          requestPrint();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { outputMode, checkNotice, exportProgress, setCheckNotice, assetSrcOverrides } = useUiStore();
  const { activeJobId } = useSessionStore();
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

  return (
    <>
      <div id="app-root" className="min-w-[1100px] h-screen flex flex-col bg-surface overflow-hidden">
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
      {outputMode !== null && activeJob && (
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
            job={activeJob}
            pageIndexes={outputPageIndexes}
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

      {/* Multi-image import modals */}
      <ArrangeModal />
      <LayoutModal />
      <ChangeLayoutModal />
      <SettingsModal />
    </>
  );
}
