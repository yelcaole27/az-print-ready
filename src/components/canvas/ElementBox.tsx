'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Page, PageElement, Settings } from '@/types';
import { mmToScreenPx, getPageDimensionsMm, clampToPage, MM_TO_PX } from '@/lib/pageGeometry';
import { formatSize } from '@/lib/units';
import { printableRect } from '@/lib/packing';
import { snapMove, snapResizeEdge } from '@/lib/snapping';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { TextBoxEditor } from './TextBoxEditor';
import { ElementContent } from './ElementContent';
import { Tooltip } from '@/components/ui/Tooltip';

export interface ElementBoxProps {
  element: PageElement;
  page: Page;
  jobId: string;
  jobSettings: Settings;
  zoom: number;
  isSelected: boolean;
  onSelect: () => void;
}

type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function ElementBox({
  element,
  page,
  jobId,
  jobSettings,
  zoom,
  isSelected,
  onSelect,
}: ElementBoxProps) {
  const assets = useSessionStore((state) => state.assets);
  const updateElement = useSessionStore((state) => state.updateElement);
  const moveGroup = useSessionStore((state) => state.moveGroup);
  const {
    setGuides,
    clearGuides,
    editingElement,
    setEditingElement,
    setOverflow,
    selectedIds,
    selectedPageId,
    isAllSelected,
    groupDraft,
    setGroupDraft,
    setSelection,
    select,
    clearSelection,
  } = useUiStore();

  const isPartOfMulti = Boolean(
    isAllSelected || (selectedPageId === page.id && selectedIds.includes(element.id))
  );

  const isEditing =
    element.type === 'text' &&
    editingElement?.pageId === page.id &&
    editingElement?.elementId === element.id;

  const [isOverflow, setIsOverflow] = useState(false);
  const staticMeasureRef = useRef<HTMLDivElement>(null);

  const handleOverflowChange = useCallback((overflow: boolean) => {
    setIsOverflow(overflow);
    setOverflow(element.id, overflow);
  }, [element.id, setOverflow]);

  // Clean up overflow on unmount
  useEffect(() => {
    return () => {
      setOverflow(element.id, false);
    };
  }, [element.id, setOverflow]);

  // Check overflow while NOT editing
  useEffect(() => {
    if (element.type !== 'text' || isEditing) return;
    if (!staticMeasureRef.current) return;

    const el = staticMeasureRef.current;
    const paddingMm = element.paddingMm ?? 2;
    const paddingPx = paddingMm * MM_TO_PX;
    const borderMm = element.borderMm ?? 0;
    const borderPx = borderMm * MM_TO_PX;

    const scrollH = el.scrollHeight;
    const innerBoxH = (element.hMm * MM_TO_PX) - 2 * (paddingPx + borderPx);
    const hasOverflow = scrollH > innerBoxH + 2;

    handleOverflowChange(hasOverflow);
  }, [element.type, isEditing, element.html, element.hMm, element.paddingMm, element.borderMm, handleOverflowChange]);

  const asset = assets.find((a) => a.id === element.assetId);
  const isLocked = Boolean(element.sliceIndex);
  const minSizeMm = element.type === 'text' ? 10 : 5;

  // Local draft geometry during active gestures
  const [draft, setDraft] = useState<{
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
  } | null>(null);

  const [isHovered, setIsHovered] = useState(false);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef<HandleType | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);

  // Portal ghost position
  const [ghostPos, setGhostPos] = useState<{
    x: number;
    y: number;
    wMm: number;
    hMm: number;
  } | null>(null);

  type DropTarget =
    | { type: 'same-page'; xMm: number; yMm: number }
    | { type: 'other-page'; pageId: string; xMm: number; yMm: number }
    | { type: 'new-page' }
    | { type: 'none' };

  const dropTargetRef = useRef<DropTarget>({ type: 'none' });
  const lastPointerRef = useRef<{ x: number; y: number; altKey: boolean } | null>(null);
  const scrollSpeedRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  const dragStartRef = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    hasMoved: boolean;
  } | null>(null);

  const resizeStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    aspect: number;
  } | null>(null);

  const isDraggingGroupRef = useRef(false);
  const groupDragStartRef = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    groupMinX: number;
    groupMinY: number;
    groupW: number;
    groupH: number;
    hasMoved: boolean;
    elements: PageElement[];
  } | null>(null);

  const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(page);
  const effectiveMarginMm = jobSettings.borderless ? 0 : (jobSettings.marginMm ?? 6.35);
  const pRect = printableRect(pageW, pageH, effectiveMarginMm);

  // Keyboard listener on selected text box (Enter, printable keys to enter edit mode, Escape to exit)
  useEffect(() => {
    if (!isSelected || element.type !== 'text') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = Boolean(
        target?.closest?.('[contenteditable="true"], input, textarea, select')
      );

      if (isEditing) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setEditingElement(null);
        }
        return;
      }

      if (isInput || Boolean(useUiStore.getState().multiImport)) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        setEditingElement({ pageId: page.id, elementId: element.id });
      } else if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        setEditingElement({ pageId: page.id, elementId: element.id });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [element.id, element.type, isEditing, isSelected, page.id, setEditingElement]);

  // Cancel gesture on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (Boolean(useUiStore.getState().multiImport)) return;
      if (e.key === 'Escape') {
        if (isDraggingGroupRef.current) {
          if (boxRef.current && groupDragStartRef.current?.pointerId !== undefined) {
            try {
              boxRef.current.releasePointerCapture(groupDragStartRef.current.pointerId);
            } catch {
              // Ignore
            }
          }
          isDraggingGroupRef.current = false;
          groupDragStartRef.current = null;
          useUiStore.getState().setGroupDraft(null);
          clearGuides();
        }
        if (isDraggingRef.current || isResizingRef.current) {
          if (boxRef.current && dragStartRef.current?.pointerId !== undefined) {
            try {
              boxRef.current.releasePointerCapture(dragStartRef.current.pointerId);
            } catch {
              // Ignore
            }
          }
          scrollSpeedRef.current = 0;
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          isDraggingRef.current = false;
          isResizingRef.current = null;
          dragStartRef.current = null;
          resizeStartRef.current = null;
          dropTargetRef.current = { type: 'none' };
          setGhostPos(null);
          setDraft(null);
          clearGuides();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearGuides]);

  // Cleanup autoscroll on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  const detectAndApplyDropTarget = useCallback(
    (clientX: number, clientY: number, altKey: boolean) => {
      const dragStart = dragStartRef.current;
      if (!dragStart) return;

      const elements = document.elementsFromPoint(clientX, clientY);

      // Check if hovering over "+ Add page" button
      let addPageBtn: HTMLElement | null = null;
      for (const el of elements) {
        const btn = (el as HTMLElement).closest(
          '[data-drop-newpage="true"]'
        ) as HTMLElement | null;
        if (btn) {
          addPageBtn = btn;
          break;
        }
      }

      if (addPageBtn) {
        dropTargetRef.current = { type: 'new-page' };
        useUiStore.getState().setDropTargetPageId(null);
        useUiStore.getState().setIsHoveringAddPage(true);
        clearGuides();
        return;
      }

      // Check if hovering over a Page
      let targetPageRoot: HTMLElement | null = null;
      let targetPageSheet: HTMLElement | null = null;
      for (const el of elements) {
        const pageRoot = (el as HTMLElement).closest(
          '[data-page-id]'
        ) as HTMLElement | null;
        if (pageRoot) {
          targetPageRoot = pageRoot;
          targetPageSheet =
            (pageRoot.querySelector(
              '[data-page-sheet="true"]'
            ) as HTMLElement | null) || pageRoot;
          break;
        }
      }

      if (targetPageRoot && targetPageSheet) {
        const targetPageId = targetPageRoot.getAttribute('data-page-id');
        useUiStore.getState().setIsHoveringAddPage(false);

        if (targetPageId === page.id) {
          // SAME PAGE
          useUiStore.getState().setDropTargetPageId(null);

          const dxMm = (clientX - dragStart.pointerX) / (MM_TO_PX * zoom);
          const dyMm = (clientY - dragStart.pointerY) / (MM_TO_PX * zoom);
          const rawX = dragStart.origX + dxMm;
          const rawY = dragStart.origY + dyMm;
          const wMm = dragStart.origW;
          const hMm = dragStart.origH;

          if (altKey) {
            clearGuides();
            const clamped = clampToPage(rawX, rawY, wMm, hMm, pageW, pageH, minSizeMm);
            dropTargetRef.current = {
              type: 'same-page',
              xMm: clamped.x,
              yMm: clamped.y,
            };
            setDraft({ xMm: clamped.x, yMm: clamped.y, wMm, hMm });
          } else {
            const otherRects = page.elements
              .filter((el) => el.id !== element.id)
              .map((el) => ({ x: el.xMm, y: el.yMm, w: el.wMm, h: el.hMm }));
            const thresholdMm = 6 / (MM_TO_PX * zoom);
            const snapped = snapMove(
              { x: rawX, y: rawY, w: wMm, h: hMm },
              otherRects,
              pRect,
              pageW,
              pageH,
              thresholdMm,
              jobSettings.gapMm
            );
            setGuides(snapped.guides);
            dropTargetRef.current = {
              type: 'same-page',
              xMm: snapped.x,
              yMm: snapped.y,
            };
            setDraft({ xMm: snapped.x, yMm: snapped.y, wMm, hMm });
          }
          return;
        } else if (targetPageId) {
          // DIFFERENT PAGE
          useUiStore.getState().setDropTargetPageId(targetPageId);

          const pageRect = targetPageSheet.getBoundingClientRect();
          const grabOffsetXMm = dragStart.grabOffsetX / (MM_TO_PX * zoom);
          const grabOffsetYMm = dragStart.grabOffsetY / (MM_TO_PX * zoom);
          const rawX = (clientX - pageRect.left) / (MM_TO_PX * zoom) - grabOffsetXMm;
          const rawY = (clientY - pageRect.top) / (MM_TO_PX * zoom) - grabOffsetYMm;

          const job = useSessionStore.getState().jobs.find((j) => j.id === jobId);
          const targetPage = job?.pages.find((p) => p.id === targetPageId);

          if (targetPage) {
            const { wMm: tPageW, hMm: tPageH } = getPageDimensionsMm(targetPage);
            const tMarginMm = jobSettings.borderless ? 0 : (jobSettings.marginMm ?? 6.35);
            const tPRect = printableRect(tPageW, tPageH, tMarginMm);
            const maxXMm = Math.max(0, tPageW - element.wMm);
            const maxYMm = Math.max(0, tPageH - element.hMm);

            if (altKey) {
              clearGuides();
              const clampedX = Math.max(0, Math.min(maxXMm, rawX));
              const clampedY = Math.max(0, Math.min(maxYMm, rawY));
              dropTargetRef.current = {
                type: 'other-page',
                pageId: targetPageId,
                xMm: clampedX,
                yMm: clampedY,
              };
            } else {
              const otherRects = targetPage.elements.map((el) => ({
                x: el.xMm,
                y: el.yMm,
                w: el.wMm,
                h: el.hMm,
              }));
              const thresholdMm = 6 / (MM_TO_PX * zoom);
              const snapped = snapMove(
                { x: rawX, y: rawY, w: element.wMm, h: element.hMm },
                otherRects,
                tPRect,
                tPageW,
                tPageH,
                thresholdMm,
                jobSettings.gapMm
              );
              const clampedX = Math.max(0, Math.min(maxXMm, snapped.x));
              const clampedY = Math.max(0, Math.min(maxYMm, snapped.y));
              setGuides(snapped.guides);
              dropTargetRef.current = {
                type: 'other-page',
                pageId: targetPageId,
                xMm: clampedX,
                yMm: clampedY,
              };
            }
          }
          return;
        }
      }

      // OUTSIDE / GRAY AREA
      useUiStore.getState().setIsHoveringAddPage(false);
      useUiStore.getState().setDropTargetPageId(null);
      clearGuides();
      dropTargetRef.current = { type: 'none' };
    },
    [clearGuides, element.hMm, element.id, element.wMm, jobId, jobSettings.borderless, jobSettings.gapMm, jobSettings.marginMm, minSizeMm, page.elements, page.id, pageH, pageW, pRect, setGuides, zoom]
  );

  // Current active geometry
  let currentX = draft ? draft.xMm : element.xMm;
  let currentY = draft ? draft.yMm : element.yMm;
  let currentW = draft ? draft.wMm : element.wMm;
  let currentH = draft ? draft.hMm : element.hMm;

  if (isPartOfMulti && groupDraft && groupDraft.pageId === page.id) {
    currentX = element.xMm + groupDraft.dxMm;
    currentY = element.yMm + groupDraft.dyMm;
    currentW = element.wMm;
    currentH = element.hMm;
  }

  const isMovingWithGhost = Boolean(ghostPos);
  const leftPx = mmToScreenPx(isMovingWithGhost ? element.xMm : currentX, zoom);
  const topPx = mmToScreenPx(isMovingWithGhost ? element.yMm : currentY, zoom);
  const widthPx = mmToScreenPx(isMovingWithGhost ? element.wMm : currentW, zoom);
  const heightPx = mmToScreenPx(isMovingWithGhost ? element.hMm : currentH, zoom);

  const formattedW = formatSize(currentW, jobSettings.unit);
  const formattedH = formatSize(currentH, jobSettings.unit);

  // 1) Drag to Move handler
  const handlePointerDownMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const isTargetEditable = Boolean(
      (e.target as HTMLElement | null)?.closest?.('[contenteditable="true"]')
    );

    if (e.button !== 0 || isEditing || isTargetEditable) return;

    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.stopPropagation();
      const { selected: currSelected, selectedIds: currSelectedIds, selectedPageId: currSelectedPageId } =
        useUiStore.getState();
      if (currSelectedPageId === page.id && currSelectedIds.length >= 2) {
        if (currSelectedIds.includes(element.id)) {
          setSelection(
            page.id,
            currSelectedIds.filter((id) => id !== element.id)
          );
        } else {
          setSelection(page.id, [...currSelectedIds, element.id]);
        }
      } else if (currSelected?.pageId === page.id) {
        if (currSelected.elementId === element.id) {
          clearSelection();
        } else {
          setSelection(page.id, [currSelected.elementId, element.id]);
        }
      } else {
        select({ pageId: page.id, elementId: element.id });
        if (element.assetId) {
          useUiStore.getState().setActiveAssetId(element.assetId);
        }
      }
      return;
    }

    if (isLocked) {
      onSelect();
      return;
    }

    if (isPartOfMulti) {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingGroupRef.current = true;
      const groupElements = page.elements.filter(
        (el) => selectedIds.includes(el.id) && !el.sliceIndex
      );
      const minX = Math.min(...groupElements.map((el) => el.xMm));
      const minY = Math.min(...groupElements.map((el) => el.yMm));
      const maxX = Math.max(...groupElements.map((el) => el.xMm + el.wMm));
      const maxY = Math.max(...groupElements.map((el) => el.yMm + el.hMm));

      groupDragStartRef.current = {
        pointerId: e.pointerId,
        pointerX: e.clientX,
        pointerY: e.clientY,
        groupMinX: minX,
        groupMinY: minY,
        groupW: maxX - minX,
        groupH: maxY - minY,
        hasMoved: false,
        elements: groupElements,
      };
      return;
    }

    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;

    const elRect = e.currentTarget.getBoundingClientRect();
    dragStartRef.current = {
      pointerId: e.pointerId,
      pointerX: e.clientX,
      pointerY: e.clientY,
      grabOffsetX: e.clientX - elRect.left,
      grabOffsetY: e.clientY - elRect.top,
      origX: element.xMm,
      origY: element.yMm,
      origW: element.wMm,
      origH: element.hMm,
      hasMoved: false,
    };
    dropTargetRef.current = {
      type: 'same-page',
      xMm: element.xMm,
      yMm: element.yMm,
    };
  };

  const handlePointerMoveMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingGroupRef.current && groupDragStartRef.current && !isEditing) {
      const g = groupDragStartRef.current;
      const dxPx = e.clientX - g.pointerX;
      const dyPx = e.clientY - g.pointerY;

      if (!g.hasMoved && Math.hypot(dxPx, dyPx) >= 3) {
        g.hasMoved = true;
      }

      if (g.hasMoved) {
        const rawDxMm = (e.clientX - g.pointerX) / (MM_TO_PX * zoom);
        const rawDyMm = (e.clientY - g.pointerY) / (MM_TO_PX * zoom);
        const rawX = g.groupMinX + rawDxMm;
        const rawY = g.groupMinY + rawDyMm;
        const maxXMm = Math.max(0, pageW - g.groupW);
        const maxYMm = Math.max(0, pageH - g.groupH);
        const clampedRawX = Math.max(0, Math.min(maxXMm, rawX));
        const clampedRawY = Math.max(0, Math.min(maxYMm, rawY));

        if (e.altKey) {
          clearGuides();
          const finalDxMm = clampedRawX - g.groupMinX;
          const finalDyMm = clampedRawY - g.groupMinY;
          setGroupDraft({ pageId: page.id, dxMm: finalDxMm, dyMm: finalDyMm });
        } else {
          const otherRects = page.elements
            .filter((el) => !selectedIds.includes(el.id))
            .map((el) => ({ x: el.xMm, y: el.yMm, w: el.wMm, h: el.hMm }));
          const thresholdMm = 6 / (MM_TO_PX * zoom);
          const snapped = snapMove(
            { x: clampedRawX, y: clampedRawY, w: g.groupW, h: g.groupH },
            otherRects,
            pRect,
            pageW,
            pageH,
            thresholdMm,
            jobSettings.gapMm
          );
          setGuides(snapped.guides);
          const snappedX = Math.max(0, Math.min(maxXMm, snapped.x));
          const snappedY = Math.max(0, Math.min(maxYMm, snapped.y));
          const finalDxMm = snappedX - g.groupMinX;
          const finalDyMm = snappedY - g.groupMinY;
          setGroupDraft({ pageId: page.id, dxMm: finalDxMm, dyMm: finalDyMm });
        }
      }
      return;
    }

    if (!isDraggingRef.current || !dragStartRef.current || isEditing) return;

    const dxPx = e.clientX - dragStartRef.current.pointerX;
    const dyPx = e.clientY - dragStartRef.current.pointerY;

    if (!dragStartRef.current.hasMoved && Math.hypot(dxPx, dyPx) >= 3) {
      dragStartRef.current.hasMoved = true;
    }

    if (dragStartRef.current.hasMoved) {
      lastPointerRef.current = {
        x: e.clientX,
        y: e.clientY,
        altKey: e.altKey,
      };

      setGhostPos({
        x: e.clientX - dragStartRef.current.grabOffsetX,
        y: e.clientY - dragStartRef.current.grabOffsetY,
        wMm: dragStartRef.current.origW,
        hMm: dragStartRef.current.origH,
      });

      detectAndApplyDropTarget(e.clientX, e.clientY, e.altKey);

      // Edge autoscroll
      const scrollEl = document.querySelector(
        '[data-canvas-scroll="true"]'
      ) as HTMLElement | null;
      let speed = 0;
      if (scrollEl) {
        const rect = scrollEl.getBoundingClientRect();
        const distTop = e.clientY - rect.top;
        const distBottom = rect.bottom - e.clientY;
        if (distTop >= 0 && distTop < 80) {
          const ratio = 1 - distTop / 80;
          speed = -Math.round(ratio * 24);
        } else if (distBottom >= 0 && distBottom < 80) {
          const ratio = 1 - distBottom / 80;
          speed = Math.round(ratio * 24);
        }
      }
      scrollSpeedRef.current = speed;

      if (speed !== 0 && rafIdRef.current === null) {
        const tick = () => {
          if (scrollSpeedRef.current !== 0) {
            const el = document.querySelector(
              '[data-canvas-scroll="true"]'
            ) as HTMLElement | null;
            if (el) {
              el.scrollTop += scrollSpeedRef.current;
            }
            if (lastPointerRef.current && dragStartRef.current?.hasMoved) {
              detectAndApplyDropTarget(
                lastPointerRef.current.x,
                lastPointerRef.current.y,
                lastPointerRef.current.altKey
              );
            }
            rafIdRef.current = requestAnimationFrame(tick);
          } else {
            rafIdRef.current = null;
          }
        };
        rafIdRef.current = requestAnimationFrame(tick);
      }
    }
  };

  const handlePointerUpMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingGroupRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      isDraggingGroupRef.current = false;
      clearGuides();
      const g = groupDragStartRef.current;
      groupDragStartRef.current = null;
      const currentDraft = useUiStore.getState().groupDraft;
      useUiStore.getState().setGroupDraft(null);

      if (
        g &&
        g.hasMoved &&
        currentDraft &&
        (currentDraft.dxMm !== 0 || currentDraft.dyMm !== 0)
      ) {
        moveGroup(
          jobId,
          page.id,
          g.elements.map((el) => el.id),
          currentDraft.dxMm,
          currentDraft.dyMm
        );
      } else if (g && !g.hasMoved) {
        onSelect();
      }
      return;
    }

    if (!isDraggingRef.current || isEditing) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    scrollSpeedRef.current = 0;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    isDraggingRef.current = false;
    clearGuides();

    const target = dropTargetRef.current;
    const hasMoved = dragStartRef.current?.hasMoved;

    if (hasMoved) {
      if (target.type === 'same-page') {
        if (target.xMm !== element.xMm || target.yMm !== element.yMm) {
          updateElement(jobId, page.id, element.id, {
            xMm: target.xMm,
            yMm: target.yMm,
          });
        }
      } else if (target.type === 'other-page') {
        const { moveElementToPage } = useSessionStore.getState();
        moveElementToPage(jobId, page.id, target.pageId, element.id, {
          xMm: target.xMm,
          yMm: target.yMm,
        });
        const targetPageEl = document.querySelector(
          `[data-page-id="${target.pageId}"]`
        );
        targetPageEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (target.type === 'new-page') {
        const { addPageAndMove } = useSessionStore.getState();
        const newPageId = addPageAndMove(jobId, page.id, element.id);
        if (newPageId) {
          setTimeout(() => {
            const newPageEl = document.querySelector(
              `[data-page-id="${newPageId}"]`
            );
            newPageEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 50);
        }
      }
    }

    dragStartRef.current = null;
    dropTargetRef.current = { type: 'none' };
    setGhostPos(null);
    setDraft(null);
  };

  // 2) Resize handler
  const handlePointerDownResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, handle: HandleType) => {
      e.stopPropagation();
      if (e.button !== 0 || isLocked || isEditing) return;

      e.currentTarget.setPointerCapture(e.pointerId);
      isResizingRef.current = handle;
      resizeStartRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        origX: element.xMm,
        origY: element.yMm,
        origW: element.wMm,
        origH: element.hMm,
        aspect: element.wMm / element.hMm,
      };
    },
    [element, isEditing, isLocked]
  );

  const handlePointerMoveResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const handle = isResizingRef.current;
      const start = resizeStartRef.current;
      if (!handle || !start || isEditing) return;

      const dxPx = e.clientX - start.pointerX;
      const dyPx = e.clientY - start.pointerY;
      const dxMm = dxPx / (MM_TO_PX * zoom);
      const dyMm = dyPx / (MM_TO_PX * zoom);

      let newX = start.origX;
      let newY = start.origY;
      let newW = start.origW;
      let newH = start.origH;

      // Images keep ratio unless Shift; text boxes are free-form unless Shift
      const keepAspect = element.type === 'text' ? e.shiftKey : !e.shiftKey;

      if (handle === 'e') {
        newW = Math.max(minSizeMm, start.origW + dxMm);
        if (keepAspect) {
          newH = Math.max(minSizeMm, newW / start.aspect);
        }
      } else if (handle === 'w') {
        newW = Math.max(minSizeMm, start.origW - dxMm);
        newX = start.origX + start.origW - newW;
        if (keepAspect) {
          newH = Math.max(minSizeMm, newW / start.aspect);
        }
      } else if (handle === 's') {
        newH = Math.max(minSizeMm, start.origH + dyMm);
        if (keepAspect) {
          newW = Math.max(minSizeMm, newH * start.aspect);
        }
      } else if (handle === 'n') {
        newH = Math.max(minSizeMm, start.origH - dyMm);
        newY = start.origY + start.origH - newH;
        if (keepAspect) {
          newW = Math.max(minSizeMm, newH * start.aspect);
        }
      } else if (handle === 'se') {
        if (keepAspect) {
          const delta =
            Math.abs(dxMm) > Math.abs(dyMm) ? dxMm : dyMm * start.aspect;
          newW = Math.max(minSizeMm, start.origW + delta);
          newH = Math.max(minSizeMm, newW / start.aspect);
        } else {
          newW = Math.max(minSizeMm, start.origW + dxMm);
          newH = Math.max(minSizeMm, start.origH + dyMm);
        }
      } else if (handle === 'sw') {
        if (keepAspect) {
          const delta =
            Math.abs(-dxMm) > Math.abs(dyMm) ? -dxMm : dyMm * start.aspect;
          newW = Math.max(minSizeMm, start.origW + delta);
          newH = Math.max(minSizeMm, newW / start.aspect);
          newX = start.origX + start.origW - newW;
        } else {
          newW = Math.max(minSizeMm, start.origW - dxMm);
          newH = Math.max(minSizeMm, start.origH + dyMm);
          newX = start.origX + start.origW - newW;
        }
      } else if (handle === 'ne') {
        if (keepAspect) {
          const delta =
            Math.abs(dxMm) > Math.abs(-dyMm) ? dxMm : -dyMm * start.aspect;
          newW = Math.max(minSizeMm, start.origW + delta);
          newH = Math.max(minSizeMm, newW / start.aspect);
          newY = start.origY + start.origH - newH;
        } else {
          newW = Math.max(minSizeMm, start.origW + dxMm);
          newH = Math.max(minSizeMm, start.origH - dyMm);
          newY = start.origY + start.origH - newH;
        }
      } else if (handle === 'nw') {
        if (keepAspect) {
          const delta =
            Math.abs(-dxMm) > Math.abs(-dyMm) ? -dxMm : -dyMm * start.aspect;
          newW = Math.max(minSizeMm, start.origW + delta);
          newH = Math.max(minSizeMm, newW / start.aspect);
          newX = start.origX + start.origW - newW;
          newY = start.origY + start.origH - newH;
        } else {
          newW = Math.max(minSizeMm, start.origW - dxMm);
          newH = Math.max(minSizeMm, start.origH - dyMm);
          newX = start.origX + start.origW - newW;
          newY = start.origY + start.origH - newH;
        }
      }

      // Snapping during resize
      if (!e.altKey) {
        const otherRects = page.elements
          .filter((el) => el.id !== element.id)
          .map((el) => ({ x: el.xMm, y: el.yMm, w: el.wMm, h: el.hMm }));
        const thresholdMm = 6 / (MM_TO_PX * zoom);

        const activeGuides = [];
        if (handle.includes('e')) {
          const snapE = snapResizeEdge(
            newX + newW,
            'x',
            otherRects,
            pRect,
            pageW,
            thresholdMm,
            jobSettings.gapMm
          );
          if (snapE.guide) {
            newW = Math.max(minSizeMm, snapE.pos - newX);
            activeGuides.push(snapE.guide);
          }
        } else if (handle.includes('w')) {
          const snapW = snapResizeEdge(
            newX,
            'x',
            otherRects,
            pRect,
            pageW,
            thresholdMm,
            jobSettings.gapMm
          );
          if (snapW.guide) {
            const rightEdge = start.origX + start.origW;
            newX = snapW.pos;
            newW = Math.max(minSizeMm, rightEdge - newX);
            activeGuides.push(snapW.guide);
          }
        }

        if (handle.includes('s')) {
          const snapS = snapResizeEdge(
            newY + newH,
            'y',
            otherRects,
            pRect,
            pageH,
            thresholdMm,
            jobSettings.gapMm
          );
          if (snapS.guide) {
            newH = Math.max(minSizeMm, snapS.pos - newY);
            activeGuides.push(snapS.guide);
          }
        } else if (handle.includes('n')) {
          const snapN = snapResizeEdge(
            newY,
            'y',
            otherRects,
            pRect,
            pageH,
            thresholdMm,
            jobSettings.gapMm
          );
          if (snapN.guide) {
            const bottomEdge = start.origY + start.origH;
            newY = snapN.pos;
            newH = Math.max(minSizeMm, bottomEdge - newY);
            activeGuides.push(snapN.guide);
          }
        }

        setGuides(activeGuides);
      } else {
        clearGuides();
      }

      // Clamp inside page bounds
      if (newX < 0) {
        newW = Math.max(minSizeMm, newW + newX);
        newX = 0;
      }
      if (newY < 0) {
        newH = Math.max(minSizeMm, newH + newY);
        newY = 0;
      }
      if (newX + newW > pageW) {
        newW = Math.max(minSizeMm, pageW - newX);
      }
      if (newY + newH > pageH) {
        newH = Math.max(minSizeMm, pageH - newY);
      }

      setDraft({ xMm: newX, yMm: newY, wMm: newW, hMm: newH });
    },
    [clearGuides, element.id, element.type, isEditing, jobSettings.gapMm, minSizeMm, page.elements, pageH, pageW, pRect, setGuides, zoom]
  );

  const handlePointerUpResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizingRef.current || isEditing) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }

      isResizingRef.current = null;
      resizeStartRef.current = null;
      clearGuides();

      if (draft) {
        if (
          draft.xMm !== element.xMm ||
          draft.yMm !== element.yMm ||
          draft.wMm !== element.wMm ||
          draft.hMm !== element.hMm
        ) {
          updateElement(jobId, page.id, element.id, {
            xMm: draft.xMm,
            yMm: draft.yMm,
            wMm: draft.wMm,
            hMm: draft.hMm,
          });
        }
      }

      setDraft(null);
    },
    [clearGuides, draft, element, isEditing, jobId, page.id, updateElement]
  );



  const handleDoubleClick = (e: React.MouseEvent) => {
    if (element.type === 'text') {
      e.stopPropagation();
      onSelect();
      setEditingElement({ pageId: page.id, elementId: element.id });
    }
  };

  // Border & cursor style
  let borderClass = 'border border-sheet-blue/30 z-0';
  let cursorClass = isLocked ? 'cursor-default' : 'cursor-move';
  if (element.type === 'text') {
    cursorClass = isEditing ? 'cursor-text' : 'cursor-move';
  }

  if (isSelected) {
    borderClass = 'border-2 border-blue z-20';
  } else if (isHovered && !isLocked) {
    borderClass = 'border border-blue/60 z-10';
  }

  const isGroupDraggingNow = Boolean(
    isPartOfMulti &&
      groupDraft &&
      groupDraft.pageId === page.id &&
      (groupDraft.dxMm !== 0 || groupDraft.dyMm !== 0)
  );
  const isDraggingNow = Boolean(draft) || isGroupDraggingNow;

  return (
    <>
      <div
        ref={boxRef}
        data-element-id={element.id}
        onClick={(e) => {
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            return;
          }
          if (isPartOfMulti) {
            return;
          }
          onSelect();
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onPointerDown={handlePointerDownMove}
        onPointerMove={handlePointerMoveMove}
        onPointerUp={handlePointerUpMove}
        onDoubleClick={handleDoubleClick}
        style={{
          left: `${leftPx}px`,
          top: `${topPx}px`,
          width: `${widthPx}px`,
          height: `${heightPx}px`,
        }}
        className={`absolute select-none overflow-visible box-border ${cursorClass} ${
          isMovingWithGhost
            ? 'opacity-35'
            : isDraggingNow
            ? 'opacity-90'
            : 'opacity-100'
        }`}
      >
        {/* Invisible static measuring container for text overflow when not editing */}
        {element.type === 'text' && !isEditing && (
          <div
            ref={staticMeasureRef}
            className="absolute inset-0 invisible pointer-events-none overflow-hidden"
            aria-hidden="true"
          >
            <div
              dangerouslySetInnerHTML={{ __html: element.html || '' }}
              className="w-full"
            />
          </div>
        )}

        {/* Content wrapper with overflow-hidden */}
        <div className={`relative w-full h-full overflow-hidden ${isEditing ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          {element.type === 'text' && isEditing ? (
            <TextBoxEditor
              element={element}
              pageH={pageH}
              zoom={zoom}
              isEditing={true}
              onCommit={(newHtml, newHMm) => {
                const patch: Partial<PageElement> = {};
                let changed = false;
                if (newHtml !== element.html) {
                  patch.html = newHtml;
                  changed = true;
                }
                if (newHMm !== undefined && Math.abs(newHMm - element.hMm) > 0.01) {
                  patch.hMm = newHMm;
                  changed = true;
                }
                if (changed) {
                  updateElement(jobId, page.id, element.id, patch);
                }
              }}
              onOverflowChange={handleOverflowChange}
            />
          ) : (
            <ElementContent element={element} asset={asset} zoom={zoom} />
          )}
        </div>

        {/* Border overlay */}
        <div className={`absolute inset-0 pointer-events-none box-border ${borderClass}`} />

        {/* Overflow Warning indicator (Top-right yellow dot on text boxes) */}
        {element.type === 'text' && isOverflow && (
          <div className="absolute top-1 right-1 z-30 no-print">
            <Tooltip content="Text is cut off. Enlarge the box or turn on Auto-grow.">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow border border-sheet shadow-xs cursor-help" />
            </Tooltip>
          </div>
        )}

        {/* Size badge shown on selected element or live while resizing/dragging */}
        {isSelected && !isPartOfMulti && !isEditing && !isMovingWithGhost && (
          <div className="absolute top-1 left-1 px-1 py-0.5 text-[10px] leading-none font-mono text-sheet-muted bg-sheet/95 rounded-[2px] pointer-events-none whitespace-nowrap shadow-xs z-30">
            {formattedW} × {formattedH}
          </div>
        )}

        {/* 8 Resize Handles (4 Corner + 4 Edge, 9px centered exactly) */}
        {isSelected && !isPartOfMulti && !isLocked && !isEditing && !isMovingWithGhost && (
          <>
            {/* Top-Left */}
            <div
              onPointerDown={(e) => handlePointerDownResize(e, 'nw')}
              onPointerMove={handlePointerMoveResize}
              onPointerUp={handlePointerUpResize}
              className="absolute -top-[4.5px] -left-[4.5px] w-[9px] h-[9px] bg-white border border-blue cursor-nwse-resize z-40 box-border"
            />
            {/* Top-Center */}
            <div
              onPointerDown={(e) => handlePointerDownResize(e, 'n')}
              onPointerMove={handlePointerMoveResize}
              onPointerUp={handlePointerUpResize}
              className="absolute -top-[4.5px] left-1/2 -translate-x-1/2 w-[9px] h-[9px] bg-white border border-blue cursor-ns-resize z-40 box-border"
            />
            {/* Top-Right */}
            <div
              onPointerDown={(e) => handlePointerDownResize(e, 'ne')}
              onPointerMove={handlePointerMoveResize}
              onPointerUp={handlePointerUpResize}
              className="absolute -top-[4.5px] -right-[4.5px] w-[9px] h-[9px] bg-white border border-blue cursor-nesw-resize z-40 box-border"
            />
            {/* Middle-Right */}
            <div
              onPointerDown={(e) => handlePointerDownResize(e, 'e')}
              onPointerMove={handlePointerMoveResize}
              onPointerUp={handlePointerUpResize}
              className="absolute top-1/2 -right-[4.5px] -translate-y-1/2 w-[9px] h-[9px] bg-white border border-blue cursor-ew-resize z-40 box-border"
            />
            {/* Bottom-Right */}
            <div
              onPointerDown={(e) => handlePointerDownResize(e, 'se')}
              onPointerMove={handlePointerMoveResize}
              onPointerUp={handlePointerUpResize}
              className="absolute -bottom-[4.5px] -right-[4.5px] w-[9px] h-[9px] bg-white border border-blue cursor-nwse-resize z-40 box-border"
            />
            {/* Bottom-Center */}
            <div
              onPointerDown={(e) => handlePointerDownResize(e, 's')}
              onPointerMove={handlePointerMoveResize}
              onPointerUp={handlePointerUpResize}
              className="absolute -bottom-[4.5px] left-1/2 -translate-x-1/2 w-[9px] h-[9px] bg-white border border-blue cursor-ns-resize z-40 box-border"
            />
            {/* Bottom-Left */}
            <div
              onPointerDown={(e) => handlePointerDownResize(e, 'sw')}
              onPointerMove={handlePointerMoveResize}
              onPointerUp={handlePointerUpResize}
              className="absolute -bottom-[4.5px] -left-[4.5px] w-[9px] h-[9px] bg-white border border-blue cursor-nesw-resize z-40 box-border"
            />
            {/* Middle-Left */}
            <div
              onPointerDown={(e) => handlePointerDownResize(e, 'w')}
              onPointerMove={handlePointerMoveResize}
              onPointerUp={handlePointerUpResize}
              className="absolute top-1/2 -left-[4.5px] -translate-y-1/2 w-[9px] h-[9px] bg-white border border-blue cursor-ew-resize z-40 box-border"
            />
          </>
        )}
      </div>

      {/* Ghost portal during active cross-page move */}
      {ghostPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: `${ghostPos.x}px`,
              top: `${ghostPos.y}px`,
              width: `${mmToScreenPx(ghostPos.wMm, zoom)}px`,
              height: `${mmToScreenPx(ghostPos.hMm, zoom)}px`,
              opacity: 0.85,
              pointerEvents: 'none',
              zIndex: 99999,
            }}
            className="overflow-hidden border-2 border-sheet-blue shadow-lg bg-sheet/40"
          >
            <ElementContent element={element} asset={asset} zoom={zoom} />
          </div>,
          document.body
        )}
    </>
  );
}
