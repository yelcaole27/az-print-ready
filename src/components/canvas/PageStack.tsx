'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { getPageDimensionsMm, MM_TO_PX } from '@/lib/pageGeometry';
import { importFiles } from '@/lib/importImages';
import { PageView } from './PageView';
import { ZoomBar } from './ZoomBar';
import { Button } from '@/components/ui/Button';

export function PageStack() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef<number>(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const { jobs, activeJobId, addPage, removePage, removeElement, removeElements, nudgeGroup } =
    useSessionStore();
  const {
    zoom,
    zoomMode,
    showMargins,
    activePageId,
    setZoom,
    setActivePage,
    clearSelection,
    isHoveringAddPage,
  } = useUiStore();

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const pages = React.useMemo(() => activeJob.pages, [activeJob.pages]);

  // Clear selection whenever the active job changes
  useEffect(() => {
    clearSelection();
  }, [activeJobId, clearSelection]);

  // Sync activePageId on job change or initial load
  useEffect(() => {
    if (!pages.length) return;
    const exists = pages.some((p) => p.id === activePageId);
    if (!exists) {
      setActivePage(pages[0].id);
    }
  }, [pages, activePageId, setActivePage, activeJobId]);

  const lastNudgeRef = useRef<{ time: number; elementId: string } | null>(null);

  // Keyboard navigation: Delete/Backspace, Escape, Ctrl+D duplicate, and Arrow nudges
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = Boolean(
        target?.closest?.('[contenteditable="true"], input, textarea, select')
      );

      if (isInput || Boolean(useUiStore.getState().multiImport)) return;

      // Select all elements on active page Ctrl/Cmd+A
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        const { isSettingsOpen, editingBlockLayoutId, activePageId, setSelection } =
          useUiStore.getState();
        if (isSettingsOpen || editingBlockLayoutId) return;

        const job = useSessionStore.getState().jobs.find((j) => j.id === activeJobId);
        const curPage =
          job?.pages.find((p) => p.id === activePageId) || job?.pages[0];
        if (curPage && curPage.elements.length > 0) {
          e.preventDefault();
          const allIds = curPage.elements.map((el) => el.id);
          setSelection(curPage.id, allIds);
        }
        return;
      }

      // Duplicate shortcut Ctrl/Cmd+D (ignored for groups)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        const { selected, selectedIds, select } = useUiStore.getState();
        if (selectedIds.length >= 2) {
          return;
        }
        if (selected) {
          const job = useSessionStore.getState().jobs.find((j) => j.id === activeJobId);
          const page = job?.pages.find((p) => p.id === selected.pageId);
          const element = page?.elements.find((el) => el.id === selected.elementId);
          if (element && !element.sliceIndex) {
            e.preventDefault();
            const { duplicateElement } = useSessionStore.getState();
            const newId = duplicateElement(activeJobId, selected.pageId, selected.elementId);
            if (newId) {
              select({ pageId: selected.pageId, elementId: newId });
            }
          }
        }
        return;
      }

      // Arrow key nudges
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        const { selected, selectedIds, selectedPageId } = useUiStore.getState();
        if (selectedIds.length >= 2 && selectedPageId) {
          const job = useSessionStore.getState().jobs.find((j) => j.id === activeJobId);
          const page = job?.pages.find((p) => p.id === selectedPageId);
          if (page) {
            const movable = page.elements.filter(
              (el) => selectedIds.includes(el.id) && !el.sliceIndex
            );
            if (movable.length > 0) {
              e.preventDefault();
              const delta = e.shiftKey ? 10 : 1;
              let dx = 0;
              let dy = 0;
              if (e.key === 'ArrowLeft') dx = -delta;
              if (e.key === 'ArrowRight') dx = delta;
              if (e.key === 'ArrowUp') dy = -delta;
              if (e.key === 'ArrowDown') dy = delta;

              const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(page);
              const minX = Math.min(...movable.map((el) => el.xMm));
              const minY = Math.min(...movable.map((el) => el.yMm));
              const maxX = Math.max(...movable.map((el) => el.xMm + el.wMm));
              const maxY = Math.max(...movable.map((el) => el.yMm + el.hMm));

              if (minX + dx < 0) dx = -minX;
              if (maxX + dx > pageW) dx = pageW - maxX;
              if (minY + dy < 0) dy = -minY;
              if (maxY + dy > pageH) dy = pageH - maxY;

              if (dx !== 0 || dy !== 0) {
                const now = Date.now();
                const shouldCoalesce =
                  lastNudgeRef.current !== null &&
                  lastNudgeRef.current.elementId === 'group' &&
                  now - lastNudgeRef.current.time < 500;

                lastNudgeRef.current = { time: now, elementId: 'group' };
                nudgeGroup(
                  activeJobId,
                  selectedPageId,
                  movable.map((el) => el.id),
                  dx,
                  dy,
                  shouldCoalesce
                );
              }
            }
          }
          return;
        }

        if (selected) {
          const job = useSessionStore.getState().jobs.find((j) => j.id === activeJobId);
          const page = job?.pages.find((p) => p.id === selected.pageId);
          const element = page?.elements.find((el) => el.id === selected.elementId);
          if (element && !element.sliceIndex) {
            e.preventDefault();
            const delta = e.shiftKey ? 10 : 1;
            let dx = 0;
            let dy = 0;
            if (e.key === 'ArrowLeft') dx = -delta;
            if (e.key === 'ArrowRight') dx = delta;
            if (e.key === 'ArrowUp') dy = -delta;
            if (e.key === 'ArrowDown') dy = delta;

            const now = Date.now();
            const shouldCoalesce =
              lastNudgeRef.current !== null &&
              lastNudgeRef.current.elementId === selected.elementId &&
              now - lastNudgeRef.current.time < 500;

            lastNudgeRef.current = { time: now, elementId: selected.elementId };

            const { updateElement } = useSessionStore.getState();
            updateElement(
              activeJobId,
              selected.pageId,
              selected.elementId,
              {
                xMm: element.xMm + dx,
                yMm: element.yMm + dy,
              },
              shouldCoalesce
            );
          }
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selected, selectedIds, selectedPageId } = useUiStore.getState();
        if (selectedIds.length >= 2 && selectedPageId) {
          e.preventDefault();
          removeElements(activeJobId, selectedPageId, selectedIds);
          clearSelection();
        } else if (selected) {
          e.preventDefault();
          removeElement(activeJobId, selected.pageId, selected.elementId);
          clearSelection();
        }
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeJobId, removeElement, removeElements, nudgeGroup, clearSelection]);

  // Compute Fit Width and Fit Page zoom levels
  const computeFitWidth = useCallback(() => {
    if (!containerRef.current || !pages.length) return 1;
    const containerW = containerRef.current.clientWidth;
    const widestW = Math.max(
      ...pages.map((p) => getPageDimensionsMm(p).wMm)
    );
    const calculated = (containerW - 64) / (widestW * MM_TO_PX);
    return Math.min(4, Math.max(0.25, Math.round(calculated * 100) / 100));
  }, [pages]);

  const computeFitPage = useCallback(() => {
    if (!containerRef.current || !pages.length) return 1;
    const containerH = containerRef.current.clientHeight;
    const fitW = computeFitWidth();

    const targetPage =
      pages.find((p) => p.id === activePageId) || pages[0];
    const pageH = getPageDimensionsMm(targetPage).hMm;

    const fitH = (containerH - 64 - 60) / (pageH * MM_TO_PX);
    const calculated = Math.min(fitW, fitH);
    return Math.min(4, Math.max(0.25, Math.round(calculated * 100) / 100));
  }, [pages, activePageId, computeFitWidth]);

  // Apply automatic zoom when zoomMode is fit-width or fit-page
  const applyAutoZoom = useCallback(() => {
    if (zoomMode === 'fit-width') {
      const target = computeFitWidth();
      useUiStore.setState({ zoom: target });
    } else if (zoomMode === 'fit-page') {
      const target = computeFitPage();
      useUiStore.setState({ zoom: target });
    }
  }, [zoomMode, computeFitWidth, computeFitPage]);

  // ResizeObserver to recompute auto-zoom when container or paper/orientation changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    applyAutoZoom();

    const ro = new ResizeObserver(() => {
      applyAutoZoom();
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [applyAutoZoom]);

  // Handle Ctrl + mouse wheel zoom with non-passive event listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const currentZoom = useUiStore.getState().zoom;
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        setZoom(currentZoom + delta);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [setZoom]);

  // Delete page handler with active page fallback
  const handleDeletePage = (pageId: string) => {
    if (pages.length <= 1) return;
    const pageIndex = pages.findIndex((p) => p.id === pageId);

    if (activePageId === pageId) {
      const prevIndex = Math.max(0, pageIndex - 1);
      const remaining = pages.filter((p) => p.id !== pageId);
      if (remaining[prevIndex]) {
        setActivePage(remaining[prevIndex].id);
      }
    }

    removePage(activeJob.id, pageId);
  };

  // Drag and drop image files over canvas area
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsDraggingOver(false);
      dragCounter.current = 0;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      importFiles(files);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        // Deselect if clicking on the background container itself or non-element area
        const target = e.target as HTMLElement;
        if (!target.closest('[data-element-id]') && !target.closest('.bg-sheet')) {
          useUiStore.getState().setEditingElement(null);
          clearSelection();
        }
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-canvas-scroll="true"
      className="relative flex-1 bg-transparent overflow-y-auto overflow-x-hidden p-8 select-none"
    >
      {/* Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-4 z-50 rounded-[12px] border-2 border-dashed border-blue bg-blue/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
          <div className="px-6 py-3 rounded-[8px] bg-paper border border-line shadow-xs text-sm font-medium text-blue">
            Drop images to add
          </div>
        </div>
      )}

      {/* Vertical Stack of Pages */}
      <div className="min-w-fit min-h-full flex flex-col items-center gap-10 pb-20">
        {pages.map((page, index) => (
          <PageView
            key={page.id}
            page={page}
            pageIndex={index}
            totalPages={pages.length}
            jobId={activeJob.id}
            jobSettings={activeJob.settings}
            zoom={zoom}
            isActive={page.id === activePageId}
            showMargins={showMargins}
            onSelect={() => setActivePage(page.id)}
            onDelete={() => handleDeletePage(page.id)}
            canDelete={pages.length > 1}
          />
        ))}

        {/* Add Page Button */}
        <div className="pt-2">
          <Button
            variant="outline"
            data-drop-newpage="true"
            onClick={() => addPage(activeJob.id)}
            className={`flex items-center gap-1.5 transition-all ${
              isHoveringAddPage ? 'border-dashed border-2 border-blue' : ''
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isHoveringAddPage ? 'Drop here for a new page' : 'Add page'}</span>
          </Button>
        </div>
      </div>

      {/* Floating Zoom Bar Controls */}
      <ZoomBar
        onFitWidth={() => {
          const z = computeFitWidth();
          useUiStore.setState({ zoom: z });
        }}
        onFitPage={() => {
          const z = computeFitPage();
          useUiStore.setState({ zoom: z });
        }}
      />
    </div>
  );
}
