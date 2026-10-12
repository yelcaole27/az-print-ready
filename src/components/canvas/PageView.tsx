'use client';

import React from 'react';
import { Page, Settings } from '@/types';
import { PAPERS } from '@/lib/constants/papers';
import { getPageDimensionsMm, mmToScreenPx } from '@/lib/pageGeometry';
import { formatSize } from '@/lib/units';
import { useUiStore } from '@/store/useUiStore';
import { ElementBox } from './ElementBox';

export interface PageViewProps {
  page: Page;
  pageIndex: number;
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
  jobId,
  jobSettings,
  zoom,
  isActive,
  showMargins,
  onSelect,
  onDelete,
  canDelete = false,
}: PageViewProps) {
  const { selected, select, clearSelection, guides } = useUiStore();
  const paper = PAPERS.find((p) => p.id === page.paperId) || PAPERS[0];
  const { wMm, hMm } = getPageDimensionsMm(page);

  const pageWidthPx = mmToScreenPx(wMm, zoom);
  const pageHeightPx = mmToScreenPx(hMm, zoom);
  const marginPx = mmToScreenPx(jobSettings.marginMm, zoom);

  const formattedWidth = formatSize(wMm, jobSettings.unit);
  const formattedHeight = formatSize(hMm, jobSettings.unit);

  const handlePageClick = () => {
    useUiStore.getState().setEditingElement(null);
    clearSelection();
    onSelect();
  };

  return (
    <div className="flex flex-col items-center">
      {/* Physical Sheet Canvas */}
      <div
        onClick={handlePageClick}
        style={{
          width: `${pageWidthPx}px`,
          height: `${pageHeightPx}px`,
          boxShadow: 'var(--shadow-sheet)',
        }}
        className={`relative overflow-hidden bg-sheet rounded-none cursor-pointer transition-shadow select-none ${
          isActive ? 'outline outline-2 outline-sheet-blue' : ''
        }`}
      >
        {/* Margin Guides */}
        {showMargins && (
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

        {/* Snap Guides on Active Page */}
        {isActive &&
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

        {/* Page Elements */}
        {page.elements.map((el) => {
          const isSelected =
            selected?.pageId === page.id && selected?.elementId === el.id;
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
                onSelect();
              }}
            />
          );
        })}
      </div>

      {/* Caption & Page Controls Below Sheet */}
      <div
        style={{ width: `${pageWidthPx}px` }}
        className="mt-2 px-1 flex items-center justify-between text-xs text-muted select-none"
      >
        <span className="truncate">
          Page {pageIndex + 1} · {paper.name} · {formattedWidth} × {formattedHeight}
        </span>

        {canDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="text-red hover:underline text-xs cursor-pointer ml-3 shrink-0"
          >
            Delete page
          </button>
        )}
      </div>
    </div>
  );
}
