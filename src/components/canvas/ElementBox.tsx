'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Page, PageElement, Settings } from '@/types';
import { mmToScreenPx, getPageDimensionsMm, clampToPage, MM_TO_PX } from '@/lib/pageGeometry';
import { formatSize } from '@/lib/units';
import { printableRect } from '@/lib/packing';
import { snapMove, snapResizeEdge } from '@/lib/snapping';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { TextBoxEditor } from './TextBoxEditor';
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
  const { setGuides, clearGuides, editingElement, setEditingElement } = useUiStore();

  const isEditing =
    element.type === 'text' &&
    editingElement?.pageId === page.id &&
    editingElement?.elementId === element.id;

  const [isOverflow, setIsOverflow] = useState(false);

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

  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
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

  const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(page);
  const pRect = printableRect(pageW, pageH, jobSettings.marginMm);

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

      if (isInput) return;

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
      if (e.key === 'Escape') {
        if (isDraggingRef.current || isResizingRef.current) {
          isDraggingRef.current = false;
          isResizingRef.current = null;
          dragStartRef.current = null;
          resizeStartRef.current = null;
          setDraft(null);
          clearGuides();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearGuides]);

  // Current active geometry
  const currentX = draft ? draft.xMm : element.xMm;
  const currentY = draft ? draft.yMm : element.yMm;
  const currentW = draft ? draft.wMm : element.wMm;
  const currentH = draft ? draft.hMm : element.hMm;

  const leftPx = mmToScreenPx(currentX, zoom);
  const topPx = mmToScreenPx(currentY, zoom);
  const widthPx = mmToScreenPx(currentW, zoom);
  const heightPx = mmToScreenPx(currentH, zoom);

  const formattedW = formatSize(currentW, jobSettings.unit);
  const formattedH = formatSize(currentH, jobSettings.unit);

  const rotation = element.rotation || 0;
  const fit = element.fit || 'cover';
  const objectFit: React.CSSProperties['objectFit'] =
    fit === 'stretch' ? 'fill' : fit;

  // Inner rotation container dimensions
  const innerW = mmToScreenPx(currentH, zoom);
  const innerH = mmToScreenPx(currentW, zoom);
  const innerLeft = (widthPx - innerW) / 2;
  const innerTop = (heightPx - innerH) / 2;

  // 1) Drag to Move handler
  const handlePointerDownMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const isTargetEditable = Boolean(
      (e.target as HTMLElement | null)?.closest?.('[contenteditable="true"]')
    );
    if (e.button !== 0 || isEditing || isTargetEditable) return;
    if (isLocked) {
      onSelect();
      return;
    }

    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      origX: element.xMm,
      origY: element.yMm,
      origW: element.wMm,
      origH: element.hMm,
      hasMoved: false,
    };
  };

  const handlePointerMoveMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !dragStartRef.current || isEditing) return;

    const dxPx = e.clientX - dragStartRef.current.pointerX;
    const dyPx = e.clientY - dragStartRef.current.pointerY;

    if (!dragStartRef.current.hasMoved && Math.hypot(dxPx, dyPx) >= 3) {
      dragStartRef.current.hasMoved = true;
    }

    if (dragStartRef.current.hasMoved) {
      const dxMm = dxPx / (MM_TO_PX * zoom);
      const dyMm = dyPx / (MM_TO_PX * zoom);

      const rawX = dragStartRef.current.origX + dxMm;
      const rawY = dragStartRef.current.origY + dyMm;
      const wMm = dragStartRef.current.origW;
      const hMm = dragStartRef.current.origH;

      if (e.altKey) {
        clearGuides();
        const clamped = clampToPage(rawX, rawY, wMm, hMm, pageW, pageH, minSizeMm);
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
        setDraft({ xMm: snapped.x, yMm: snapped.y, wMm, hMm });
      }
    }
  };

  const handlePointerUpMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || isEditing) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    isDraggingRef.current = false;
    clearGuides();

    if (dragStartRef.current?.hasMoved && draft) {
      if (draft.xMm !== element.xMm || draft.yMm !== element.yMm) {
        updateElement(jobId, page.id, element.id, {
          xMm: draft.xMm,
          yMm: draft.yMm,
        });
      }
    }

    dragStartRef.current = null;
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
      } else if (handle === 'w') {
        newW = Math.max(minSizeMm, start.origW - dxMm);
        newX = start.origX + start.origW - newW;
      } else if (handle === 's') {
        newH = Math.max(minSizeMm, start.origH + dyMm);
      } else if (handle === 'n') {
        newH = Math.max(minSizeMm, start.origH - dyMm);
        newY = start.origY + start.origH - newH;
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

  // Static text rendering when NOT editing
  const renderStaticText = () => {
    const vAlign = element.vAlign || 'top';
    let justifyContent = 'flex-start';
    if (vAlign === 'middle') justifyContent = 'center';
    if (vAlign === 'bottom') justifyContent = 'flex-end';

    const paddingPx = (element.paddingMm ?? 2) * MM_TO_PX;
    const borderPx = (element.borderMm ?? 0) * MM_TO_PX;
    const borderColor = element.borderColor || '#111111';
    const fillColor = element.fillColor || 'transparent';

    const baseWPx = currentW * MM_TO_PX;
    const baseHPx = currentH * MM_TO_PX;

    const isEmptyText = !element.html || element.html === '<p></p>' || element.html.trim() === '';

    return (
      <div
        style={{
          width: `${baseWPx}px`,
          height: `${baseHPx}px`,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          backgroundColor: fillColor,
          borderWidth: `${borderPx}px`,
          borderStyle: borderPx > 0 ? 'solid' : 'none',
          borderColor: borderColor,
          padding: `${paddingPx}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent,
          boxSizing: 'border-box',
        }}
        className="sheet-text-container select-none pointer-events-none"
      >
        {isEmptyText ? (
          <span className="text-sheet-muted italic no-print text-[14pt]">
            Double-click to type
          </span>
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: element.html || '' }}
            className="w-full"
          />
        )}
      </div>
    );
  };

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
    borderClass = 'border-2 border-sheet-blue z-20';
  } else if (isHovered && !isLocked) {
    borderClass = 'border border-sheet-blue/60 z-10';
  }

  const isDraggingNow = Boolean(draft);

  return (
    <div
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
      className={`absolute select-none overflow-visible box-border ${cursorClass} ${borderClass} ${
        isDraggingNow ? 'opacity-90' : 'opacity-100'
      }`}
    >
      {/* Content wrapper with overflow-hidden */}
      <div className={`relative w-full h-full overflow-hidden ${isEditing ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        {element.type === 'text' ? (
          isEditing ? (
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
              onOverflowChange={setIsOverflow}
            />
          ) : (
            renderStaticText()
          )
        ) : asset ? (
          element.crop ? (
            <div className="relative w-full h-full overflow-hidden pointer-events-none">
              <img
                src={asset.objectUrl}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  width: `${(1 / element.crop.w) * 100}%`,
                  height: `${(1 / element.crop.h) * 100}%`,
                  left: `${-(element.crop.x / element.crop.w) * 100}%`,
                  top: `${-(element.crop.y / element.crop.h) * 100}%`,
                  objectFit: 'fill',
                  display: 'block',
                }}
                className="select-none pointer-events-none max-w-none max-h-none"
              />
            </div>
          ) : rotation === 90 ? (
            <div
              style={{
                width: `${innerW}px`,
                height: `${innerH}px`,
                left: `${innerLeft}px`,
                top: `${innerTop}px`,
                transform: 'rotate(90deg)',
                transformOrigin: 'center',
              }}
              className="absolute pointer-events-none"
            >
              <img
                src={asset.objectUrl}
                alt=""
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit,
                  objectPosition: 'center',
                  display: 'block',
                }}
                className="select-none pointer-events-none"
              />
            </div>
          ) : (
            <img
              src={asset.objectUrl}
              alt=""
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit,
                objectPosition: 'center',
                display: 'block',
              }}
              className="select-none pointer-events-none"
            />
          )
        ) : (
          <div className="w-full h-full bg-sheet-blue/5 flex items-center justify-center text-sheet-muted text-xs">
            Missing asset
          </div>
        )}
      </div>

      {/* Overflow Warning indicator (Top-right yellow dot on text boxes) */}
      {element.type === 'text' && isOverflow && (
        <div className="absolute top-1 right-1 z-30 no-print">
          <Tooltip content="Text is cut off. Enlarge the box or turn on Auto-grow.">
            <div className="w-2.5 h-2.5 rounded-full bg-yellow border border-sheet shadow-xs cursor-help" />
          </Tooltip>
        </div>
      )}

      {/* Size badge shown on selected element or live while resizing/dragging */}
      {isSelected && !isEditing && (
        <div className="absolute top-1 left-1 px-1 py-0.5 text-[10px] leading-none font-mono text-sheet-muted bg-sheet/95 rounded-[2px] pointer-events-none whitespace-nowrap shadow-xs z-30">
          {formattedW} × {formattedH}
        </div>
      )}

      {/* 8 Resize Handles (Only for selected, unlocked elements, not while editing) */}
      {isSelected && !isLocked && !isEditing && (
        <>
          {/* Top-Left */}
          <div
            onPointerDown={(e) => handlePointerDownResize(e, 'nw')}
            onPointerMove={handlePointerMoveResize}
            onPointerUp={handlePointerUpResize}
            className="absolute -top-[5px] -left-[5px] w-[10px] h-[10px] bg-sheet border-[1.5px] border-sheet-blue cursor-nwse-resize z-40 box-border"
          />
          {/* Top-Center */}
          <div
            onPointerDown={(e) => handlePointerDownResize(e, 'n')}
            onPointerMove={handlePointerMoveResize}
            onPointerUp={handlePointerUpResize}
            className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] bg-sheet border-[1.5px] border-sheet-blue cursor-ns-resize z-40 box-border"
          />
          {/* Top-Right */}
          <div
            onPointerDown={(e) => handlePointerDownResize(e, 'ne')}
            onPointerMove={handlePointerMoveResize}
            onPointerUp={handlePointerUpResize}
            className="absolute -top-[5px] -right-[5px] w-[10px] h-[10px] bg-sheet border-[1.5px] border-sheet-blue cursor-nesw-resize z-40 box-border"
          />
          {/* Middle-Right */}
          <div
            onPointerDown={(e) => handlePointerDownResize(e, 'e')}
            onPointerMove={handlePointerMoveResize}
            onPointerUp={handlePointerUpResize}
            className="absolute top-1/2 -right-[5px] -translate-y-1/2 w-[10px] h-[10px] bg-sheet border-[1.5px] border-sheet-blue cursor-ew-resize z-40 box-border"
          />
          {/* Bottom-Right */}
          <div
            onPointerDown={(e) => handlePointerDownResize(e, 'se')}
            onPointerMove={handlePointerMoveResize}
            onPointerUp={handlePointerUpResize}
            className="absolute -bottom-[5px] -right-[5px] w-[10px] h-[10px] bg-sheet border-[1.5px] border-sheet-blue cursor-nwse-resize z-40 box-border"
          />
          {/* Bottom-Center */}
          <div
            onPointerDown={(e) => handlePointerDownResize(e, 's')}
            onPointerMove={handlePointerMoveResize}
            onPointerUp={handlePointerUpResize}
            className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] bg-sheet border-[1.5px] border-sheet-blue cursor-ns-resize z-40 box-border"
          />
          {/* Bottom-Left */}
          <div
            onPointerDown={(e) => handlePointerDownResize(e, 'sw')}
            onPointerMove={handlePointerMoveResize}
            onPointerUp={handlePointerUpResize}
            className="absolute -bottom-[5px] -left-[5px] w-[10px] h-[10px] bg-sheet border-[1.5px] border-sheet-blue cursor-nesw-resize z-40 box-border"
          />
          {/* Middle-Left */}
          <div
            onPointerDown={(e) => handlePointerDownResize(e, 'w')}
            onPointerMove={handlePointerMoveResize}
            onPointerUp={handlePointerUpResize}
            className="absolute top-1/2 -left-[5px] -translate-y-1/2 w-[10px] h-[10px] bg-sheet border-[1.5px] border-sheet-blue cursor-ew-resize z-40 box-border"
          />
        </>
      )}
    </div>
  );
}
