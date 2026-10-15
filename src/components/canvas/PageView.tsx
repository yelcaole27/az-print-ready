'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Page, Settings } from '@/types';
import { PAPERS } from '@/lib/constants/papers';
import { getPageDimensionsMm, mmToScreenPx, MM_TO_PX } from '@/lib/pageGeometry';
import { formatSize } from '@/lib/units';
import { useUiStore } from '@/store/useUiStore';
import { ElementBox } from './ElementBox';
import { CutGuides } from './CutGuides';

export interface PageViewProps {
  page: Page;
  pageIndex: number;
  totalPages?: number;
  jobId: string;
  jobSettings: Settings;
  zoom: number;
  isActive: boolean;
  showMargins: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}

export function PageView({
  page,
  pageIndex,
  totalPages = 1,
  jobId,
  jobSettings,
  zoom,
  isActive,
  showMargins,
  onSelect,
  onDelete,
  canDelete = false,
}: PageViewProps) {
  const {
    selected,
    selectedIds,
    selectedPageId,
    groupDraft,
    select,
    clearSelection,
    guides,
    dropTargetPageId,
  } = useUiStore();
  const paper = PAPERS.find((p) => p.id === page.paperId) || PAPERS[0];
  const { wMm, hMm } = getPageDimensionsMm(page);

  const pageWidthPx = mmToScreenPx(wMm, zoom);
  const pageHeightPx = mmToScreenPx(hMm, zoom);
  const effectiveMarginMm = jobSettings.borderless ? 0 : jobSettings.marginMm;
  const marginPx = mmToScreenPx(effectiveMarginMm, zoom);

  const formattedWidth = formatSize(wMm, jobSettings.unit);
  const formattedHeight = formatSize(hMm, jobSettings.unit);

  const isDropTarget = Boolean(dropTargetPageId && dropTargetPageId === page.id);
  const showGuidesHere = (isActive && !dropTargetPageId) || isDropTarget;

  // Marquee selection box state
  const [marqueeBox, setMarqueeBox] = useState<{
    leftPx: number;
    topPx: number;
    widthPx: number;
    heightPx: number;
  } | null>(null);

  const marqueeStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    sheetRect: DOMRect;
    active: boolean;
    additive: boolean;
    baseIds: string[];
  } | null>(null);

  const justFinishedMarqueeRef = useRef(false);

  // Escape during marquee drag cancels it
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && marqueeStateRef.current?.active) {
        e.preventDefault();
        const m = marqueeStateRef.current;
        marqueeStateRef.current = null;
        setMarqueeBox(null);
        justFinishedMarqueeRef.current = true;
        if (m.additive) {
          useUiStore.getState().setSelection(page.id, m.baseIds);
        } else {
          useUiStore.getState().clearSelection();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [page.id]);

  const handleSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-element-id]') ||
      target.closest('button, input, textarea, [contenteditable="true"]')
    ) {
      return;
    }

    const sheetEl = e.currentTarget;
    const isAdditive = e.ctrlKey || e.metaKey || e.shiftKey;
    const { selected: currSelected, selectedIds: currSelectedIds, selectedPageId: currSelectedPageId } =
      useUiStore.getState();

    let baseIds: string[] = [];
    if (isAdditive) {
      if (currSelectedPageId === page.id && currSelectedIds.length >= 2) {
        baseIds = [...currSelectedIds];
      } else if (currSelected?.pageId === page.id) {
        baseIds = [currSelected.elementId];
      }
    }

    marqueeStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      sheetRect: sheetEl.getBoundingClientRect(),
      active: false,
      additive: isAdditive,
      baseIds,
    };

    sheetEl.setPointerCapture(e.pointerId);
  };

  const handleSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const m = marqueeStateRef.current;
    if (!m || m.pointerId !== e.pointerId) return;

    const dxPx = e.clientX - m.startX;
    const dyPx = e.clientY - m.startY;

    if (!m.active) {
      if (Math.hypot(dxPx, dyPx) >= 4) {
        m.active = true;
      } else {
        return;
      }
    }

    const leftPx = Math.max(0, Math.min(m.startX, e.clientX) - m.sheetRect.left);
    const topPx = Math.max(0, Math.min(m.startY, e.clientY) - m.sheetRect.top);
    const rightPx = Math.min(
      m.sheetRect.width,
      Math.max(m.startX, e.clientX) - m.sheetRect.left
    );
    const bottomPx = Math.min(
      m.sheetRect.height,
      Math.max(m.startY, e.clientY) - m.sheetRect.top
    );

    const widthPx = Math.max(0, rightPx - leftPx);
    const heightPx = Math.max(0, bottomPx - topPx);

    setMarqueeBox({ leftPx, topPx, widthPx, heightPx });

    const boxLeftMm = leftPx / (MM_TO_PX * zoom);
    const boxTopMm = topPx / (MM_TO_PX * zoom);
    const boxRightMm = rightPx / (MM_TO_PX * zoom);
    const boxBottomMm = bottomPx / (MM_TO_PX * zoom);

    const overlappingIds = page.elements
      .filter((el) => {
        const elLeft = el.xMm;
        const elRight = el.xMm + el.wMm;
        const elTop = el.yMm;
        const elBottom = el.yMm + el.hMm;
        return !(
          elRight < boxLeftMm ||
          elLeft > boxRightMm ||
          elBottom < boxTopMm ||
          elTop > boxBottomMm
        );
      })
      .map((el) => el.id);

    const nextIdSet = new Set(
      m.additive ? [...m.baseIds, ...overlappingIds] : overlappingIds
    );
    useUiStore.getState().setSelection(page.id, Array.from(nextIdSet));
  };

  const handleSheetPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const m = marqueeStateRef.current;
    if (!m || m.pointerId !== e.pointerId) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const wasActive = m.active;
    marqueeStateRef.current = null;
    setMarqueeBox(null);

    if (wasActive) {
      justFinishedMarqueeRef.current = true;
    } else {
      useUiStore.getState().setEditingElement(null);
      clearSelection();
      onSelect();
    }
  };

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (justFinishedMarqueeRef.current) {
      justFinishedMarqueeRef.current = false;
      return;
    }
    // Only deselect when clicking on the page background itself
    if (e.target !== e.currentTarget) {
      const target = e.target as HTMLElement;
      if (target.closest('[data-element-id]')) {
        return;
      }
    }
    useUiStore.getState().setEditingElement(null);
    clearSelection();
    onSelect();
  };

  return (
    <div className="relative flex flex-col items-center" data-page-id={page.id}>
      {/* 4 corner crop marks 4px outside the page */}
      <div
        className="absolute pointer-events-none z-10"
        style={{
          top: '-4px',
          left: '-4px',
          width: `${pageWidthPx + 8}px`,
          height: `${pageHeightPx + 8}px`,
        }}
      >
        <svg
          className="absolute top-0 left-0 w-3 h-3 overflow-visible pointer-events-none"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M0 12 V0 H12" stroke="var(--color-faint)" strokeWidth="1" />
        </svg>
        <svg
          className="absolute top-0 right-0 w-3 h-3 overflow-visible pointer-events-none"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M12 12 V0 H0" stroke="var(--color-faint)" strokeWidth="1" />
        </svg>
        <svg
          className="absolute bottom-0 left-0 w-3 h-3 overflow-visible pointer-events-none"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M0 0 V12 H12" stroke="var(--color-faint)" strokeWidth="1" />
        </svg>
        <svg
          className="absolute bottom-0 right-0 w-3 h-3 overflow-visible pointer-events-none"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M12 0 V12 H0" stroke="var(--color-faint)" strokeWidth="1" />
        </svg>
      </div>

      {/* Physical Sheet Canvas */}
      <div
        data-page-sheet="true"
        onClick={handlePageClick}
        onPointerDown={handleSheetPointerDown}
        onPointerMove={handleSheetPointerMove}
        onPointerUp={handleSheetPointerUp}
        style={{
          width: `${pageWidthPx}px`,
          height: `${pageHeightPx}px`,
          backgroundColor: '#FBFAF6',
          boxShadow: 'var(--shadow-sheet)',
        }}
        className={`relative overflow-hidden bg-sheet rounded-none cursor-pointer transition-shadow select-none ${
          isDropTarget
            ? 'outline outline-3 outline-sheet-blue'
            : isActive
            ? 'outline outline-2 outline-sheet-blue'
            : ''
        }`}
      >
        {/* Drop Target Tint Overlay */}
        {isDropTarget && (
          <div className="absolute inset-0 bg-sheet-blue/10 pointer-events-none z-30" />
        )}

        {/* Margin Guides */}
        {showMargins && !jobSettings.borderless && effectiveMarginMm > 0 && (
          <div
            style={{
              top: `${marginPx}px`,
              left: `${marginPx}px`,
              right: `${marginPx}px`,
              bottom: `${marginPx}px`,
            }}
            className="absolute border border-dashed border-sheet-blue/40 pointer-events-none"
          />
        )}

        {/* Snap Guides on Active Page or Drop Target Page */}
        {showGuidesHere &&
          guides.map((guide, idx) => {
            const px = mmToScreenPx(guide.posMm, zoom);
            if (guide.axis === 'x') {
              return (
                <div
                  key={`guide-x-${idx}`}
                  style={{ left: `${px}px` }}
                  className="absolute top-0 bottom-0 w-[1px] bg-sheet-red pointer-events-none z-30"
                />
              );
            }
            return (
              <div
                key={`guide-y-${idx}`}
                style={{ top: `${px}px` }}
                className="absolute left-0 right-0 h-[1px] bg-sheet-red pointer-events-none z-30"
              />
            );
          })}

        {/* Cut Guides */}
        <CutGuides
          page={page}
          settings={jobSettings}
          scale={mmToScreenPx(1, zoom)}
        />

        {/* Group dashed bounding box */}
        {selectedPageId === page.id &&
          selectedIds.length >= 2 &&
          (() => {
            const multiElements = page.elements.filter((el) =>
              selectedIds.includes(el.id)
            );
            if (multiElements.length < 2) return null;
            const dxMm =
              groupDraft && groupDraft.pageId === page.id ? groupDraft.dxMm : 0;
            const dyMm =
              groupDraft && groupDraft.pageId === page.id ? groupDraft.dyMm : 0;
            const minX = Math.min(...multiElements.map((el) => el.xMm)) + dxMm;
            const minY = Math.min(...multiElements.map((el) => el.yMm)) + dyMm;
            const maxX =
              Math.max(...multiElements.map((el) => el.xMm + el.wMm)) + dxMm;
            const maxY =
              Math.max(...multiElements.map((el) => el.yMm + el.hMm)) + dyMm;
            const boxLeft = mmToScreenPx(minX, zoom);
            const boxTop = mmToScreenPx(minY, zoom);
            const boxW = mmToScreenPx(maxX - minX, zoom);
            const boxH = mmToScreenPx(maxY - minY, zoom);

            return (
              <div
                style={{
                  left: `${boxLeft}px`,
                  top: `${boxTop}px`,
                  width: `${boxW}px`,
                  height: `${boxH}px`,
                }}
                className="absolute border border-dashed border-sheet-blue pointer-events-none z-20"
              />
            );
          })()}

        {/* Marquee selection box */}
        {marqueeBox && (
          <div
            style={{
              left: `${marqueeBox.leftPx}px`,
              top: `${marqueeBox.topPx}px`,
              width: `${marqueeBox.widthPx}px`,
              height: `${marqueeBox.heightPx}px`,
              backgroundColor: 'rgba(27, 155, 240, 0.08)',
            }}
            className="absolute border border-sheet-blue pointer-events-none z-30"
          />
        )}

        {/* Page Elements */}
        {page.elements.map((el) => {
          const isSelected =
            (selected?.pageId === page.id && selected?.elementId === el.id) ||
            (selectedPageId === page.id && selectedIds.includes(el.id));
          return (
            <ElementBox
              key={el.id}
              element={el}
              page={page}
              jobId={jobId}
              jobSettings={jobSettings}
              zoom={zoom}
              isSelected={isSelected}
              onSelect={() => {
                select({ pageId: page.id, elementId: el.id });
                if (el.assetId) {
                  useUiStore.getState().setActiveAssetId(el.assetId);
                }
                onSelect();
              }}
            />
          );
        })}
      </div>

      {/* Caption & Page Controls Below Sheet */}
      <div
        style={{ width: `${pageWidthPx}px` }}
        className="mt-3 px-1 flex items-center justify-between text-xs select-none"
      >
        <div className="flex items-center gap-2.5 truncate">
          <span className="px-3 py-1 rounded-[999px] bg-surface border border-line font-bold text-[13px] text-text shadow-xs shrink-0">
            Page {pageIndex + 1} of {totalPages}
          </span>
          <span className="text-muted text-[13px] font-normal truncate">
            {paper.name} · {formattedWidth} × {formattedHeight}
          </span>
        </div>

        {canDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="text-red hover:underline text-xs cursor-pointer ml-3 shrink-0 font-medium"
          >
            Delete page
          </button>
        )}
      </div>
    </div>
  );
}
