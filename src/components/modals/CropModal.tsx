'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ModalShell } from './ModalShell';
import { Lock, Wand2, X } from 'lucide-react';
import type { ImageAsset } from '@/types';
import {
  CropRect,
  getDefaultCropRect,
  refitCropRectToRatio,
  findTrimRect,
} from '@/lib/cropUtils';

export interface CropModalProps {
  asset: ImageAsset;
  initialCrop?: CropRect;
  variantSize?: { id: string; wMm: number; hMm: number };
  isDefault: boolean;
  onConfirm: (crop: CropRect | null) => void;
  onCancel: () => void;
}

type AspectPreset = 'free' | '1:1' | '3:4' | '4:3' | '16:9';

type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function CropModal({
  asset,
  initialCrop,
  variantSize,
  isDefault,
  onConfirm,
  onCancel,
}: CropModalProps) {
  const isSizedLocked = !isDefault && Boolean(variantSize && variantSize.id !== 'default');
  const lockedRatio = (isSizedLocked && variantSize && variantSize.hMm > 0)
    ? variantSize.wMm / variantSize.hMm
    : (!isDefault && variantSize && variantSize.wMm > 0 && variantSize.hMm > 0)
    ? variantSize.wMm / variantSize.hMm
    : null;

  const initialPreset: AspectPreset = React.useMemo(() => {
    if (lockedRatio) {
      if (Math.abs(lockedRatio - 1) < 0.02) return '1:1';
      if (Math.abs(lockedRatio - 3 / 4) < 0.02) return '3:4';
      if (Math.abs(lockedRatio - 4 / 3) < 0.02) return '4:3';
      if (Math.abs(lockedRatio - 16 / 9) < 0.02) return '16:9';
    }
    return 'free';
  }, [lockedRatio]);

  const [aspectPreset, setAspectPreset] = useState<AspectPreset>(initialPreset);
  const [trimNotice, setTrimNotice] = useState<string | null>(null);
  const [isTrimming, setIsTrimming] = useState(false);

  // Compute starting crop
  const startingCrop = React.useMemo<CropRect>(() => {
    if (initialCrop) return initialCrop;
    if (lockedRatio) {
      return getDefaultCropRect(asset.pxW || 1, asset.pxH || 1, lockedRatio);
    }
    if (variantSize && variantSize.wMm > 0 && variantSize.hMm > 0) {
      const boxRatio = variantSize.wMm / variantSize.hMm;
      return getDefaultCropRect(asset.pxW || 1, asset.pxH || 1, boxRatio);
    }
    return { x: 0, y: 0, w: 1, h: 1 };
  }, [initialCrop, lockedRatio, variantSize, asset.pxW, asset.pxH]);

  const [crop, setCrop] = useState<CropRect>(startingCrop);

  // Active ratio for handle resizing
  const activeRatio = React.useMemo<number | null>(() => {
    if (lockedRatio) return lockedRatio;
    if (aspectPreset === '1:1') return 1;
    if (aspectPreset === '3:4') return 3 / 4;
    if (aspectPreset === '4:3') return 4 / 3;
    if (aspectPreset === '16:9') return 16 / 9;
    return null;
  }, [lockedRatio, aspectPreset]);

  // When changing preset on Default variant, re-fit crop
  const handleSelectPreset = (preset: AspectPreset) => {
    setAspectPreset(preset);
    if (preset === 'free') return;
    let targetRatio = 1;
    if (preset === '3:4') targetRatio = 3 / 4;
    if (preset === '4:3') targetRatio = 4 / 3;
    if (preset === '16:9') targetRatio = 16 / 9;

    const nextCrop = refitCropRectToRatio(
      crop,
      asset.pxW || 1,
      asset.pxH || 1,
      targetRatio
    );
    setCrop(nextCrop);
  };

  // Image display dimensions in container
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgLayout, setImgLayout] = useState<{
    width: number;
    height: number;
    left: number;
    top: number;
  } | null>(null);

  const updateImageLayout = useCallback(() => {
    if (!imgRef.current || !containerRef.current) return;
    const img = imgRef.current;
    const cont = containerRef.current;
    const cRect = cont.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();

    setImgLayout({
      width: iRect.width,
      height: iRect.height,
      left: iRect.left - cRect.left,
      top: iRect.top - cRect.top,
    });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', updateImageLayout);
    return () => window.removeEventListener('resize', updateImageLayout);
  }, [updateImageLayout]);

  // Trim edges handler
  const handleTrimEdges = async () => {
    if (isTrimming) return;
    setIsTrimming(true);
    setTrimNotice(null);
    try {
      const rect = await findTrimRect(asset, activeRatio || undefined);
      if (rect) {
        setCrop(rect);
      } else {
        setTrimNotice('Nothing to trim');
        setTimeout(() => setTrimNotice(null), 2500);
      }
    } catch {
      setTrimNotice('Nothing to trim');
      setTimeout(() => setTrimNotice(null), 2500);
    } finally {
      setIsTrimming(false);
    }
  };

  // Reset handler
  const handleReset = () => {
    if (lockedRatio) {
      setCrop(getDefaultCropRect(asset.pxW || 1, asset.pxH || 1, lockedRatio));
    } else {
      setCrop({ x: 0, y: 0, w: 1, h: 1 });
      setAspectPreset('free');
    }
  };

  // Dragging gesture state
  const dragRef = useRef<{
    type: 'move' | HandleType;
    startX: number;
    startY: number;
    startCrop: CropRect;
    layout: { width: number; height: number; left: number; top: number };
  } | null>(null);

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    type: 'move' | HandleType
  ) => {
    if (!imgLayout) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
      layout: imgLayout,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const { type, startX, startY, startCrop, layout } = dragRef.current;
    const dxFrac = (e.clientX - startX) / layout.width;
    const dyFrac = (e.clientY - startY) / layout.height;

    const natW = asset.pxW || layout.width;
    const natH = asset.pxH || layout.height;
    const fracAspect = activeRatio ? activeRatio * (natH / natW) : null;

    if (type === 'move') {
      const maxX = 1 - startCrop.w;
      const maxY = 1 - startCrop.h;
      const nextX = Math.max(0, Math.min(maxX, startCrop.x + dxFrac));
      const nextY = Math.max(0, Math.min(maxY, startCrop.y + dyFrac));
      setCrop({
        ...startCrop,
        x: Math.round(nextX * 10000) / 10000,
        y: Math.round(nextY * 10000) / 10000,
      });
      return;
    }

    // Handle resizing
    let x1 = startCrop.x;
    let y1 = startCrop.y;
    let x2 = startCrop.x + startCrop.w;
    let y2 = startCrop.y + startCrop.h;

    const minSize = 0.05;

    if (type === 'se') {
      x2 = Math.min(1, Math.max(x1 + minSize, startCrop.x + startCrop.w + dxFrac));
      y2 = Math.min(1, Math.max(y1 + minSize, startCrop.y + startCrop.h + dyFrac));
      if (fracAspect) {
        const wCandidate = x2 - x1;
        const hCandidate = wCandidate / fracAspect;
        if (y1 + hCandidate <= 1) {
          y2 = y1 + hCandidate;
        } else {
          y2 = 1;
          x2 = Math.min(1, x1 + (y2 - y1) * fracAspect);
        }
      }
    } else if (type === 'nw') {
      x1 = Math.max(0, Math.min(x2 - minSize, startCrop.x + dxFrac));
      y1 = Math.max(0, Math.min(y2 - minSize, startCrop.y + dyFrac));
      if (fracAspect) {
        const wCandidate = x2 - x1;
        const hCandidate = wCandidate / fracAspect;
        if (y2 - hCandidate >= 0) {
          y1 = y2 - hCandidate;
        } else {
          y1 = 0;
          x1 = Math.max(0, x2 - (y2 - y1) * fracAspect);
        }
      }
    } else if (type === 'ne') {
      x2 = Math.min(1, Math.max(x1 + minSize, startCrop.x + startCrop.w + dxFrac));
      y1 = Math.max(0, Math.min(y2 - minSize, startCrop.y + dyFrac));
      if (fracAspect) {
        const wCandidate = x2 - x1;
        const hCandidate = wCandidate / fracAspect;
        if (y2 - hCandidate >= 0) {
          y1 = y2 - hCandidate;
        } else {
          y1 = 0;
          x2 = Math.min(1, x1 + (y2 - y1) * fracAspect);
        }
      }
    } else if (type === 'sw') {
      x1 = Math.max(0, Math.min(x2 - minSize, startCrop.x + dxFrac));
      y2 = Math.min(1, Math.max(y1 + minSize, startCrop.y + startCrop.h + dyFrac));
      if (fracAspect) {
        const wCandidate = x2 - x1;
        const hCandidate = wCandidate / fracAspect;
        if (y1 + hCandidate <= 1) {
          y2 = y1 + hCandidate;
        } else {
          y2 = 1;
          x1 = Math.max(0, x2 - (y2 - y1) * fracAspect);
        }
      }
    } else if (type === 'e') {
      x2 = Math.min(1, Math.max(x1 + minSize, startCrop.x + startCrop.w + dxFrac));
      if (fracAspect) {
        const newW = x2 - x1;
        const newH = newW / fracAspect;
        const cy = (startCrop.y + startCrop.y + startCrop.h) / 2;
        y1 = Math.max(0, cy - newH / 2);
        y2 = Math.min(1, y1 + newH);
      }
    } else if (type === 'w') {
      x1 = Math.max(0, Math.min(x2 - minSize, startCrop.x + dxFrac));
      if (fracAspect) {
        const newW = x2 - x1;
        const newH = newW / fracAspect;
        const cy = (startCrop.y + startCrop.y + startCrop.h) / 2;
        y1 = Math.max(0, cy - newH / 2);
        y2 = Math.min(1, y1 + newH);
      }
    } else if (type === 's') {
      y2 = Math.min(1, Math.max(y1 + minSize, startCrop.y + startCrop.h + dyFrac));
      if (fracAspect) {
        const newH = y2 - y1;
        const newW = newH * fracAspect;
        const cx = (startCrop.x + startCrop.x + startCrop.w) / 2;
        x1 = Math.max(0, cx - newW / 2);
        x2 = Math.min(1, x1 + newW);
      }
    } else if (type === 'n') {
      y1 = Math.max(0, Math.min(y2 - minSize, startCrop.y + dyFrac));
      if (fracAspect) {
        const newH = y2 - y1;
        const newW = newH * fracAspect;
        const cx = (startCrop.x + startCrop.x + startCrop.w) / 2;
        x1 = Math.max(0, cx - newW / 2);
        x2 = Math.min(1, x1 + newW);
      }
    }

    setCrop({
      x: Math.round(x1 * 10000) / 10000,
      y: Math.round(y1 * 10000) / 10000,
      w: Math.round((x2 - x1) * 10000) / 10000,
      h: Math.round((y2 - y1) * 10000) / 10000,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      dragRef.current = null;
    }
  };

  // Keyboard Enter to confirm
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(crop);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [crop, onConfirm]);

  const sizeLabel = variantSize
    ? variantSize.id === 'wallet'
      ? 'Wallet'
      : variantSize.id
    : 'Custom';

  return (
    <ModalShell onCancel={onCancel} titleId="crop-modal-title">
      <div className="bg-surface rounded-[24px] border border-line shadow-dialog w-full max-w-[760px] p-6 flex flex-col gap-4 text-ink select-none animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 id="crop-modal-title" className="text-lg font-bold text-ink">
              Crop
            </h2>
            {isSizedLocked ? (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-surface2 border border-line text-xs font-semibold text-ink"
                title="Crop ratio is locked to match printed box"
              >
                <Lock className="w-3.5 h-3.5 text-muted" />
                <span>{sizeLabel}</span>
              </div>
            ) : (
              <div className="flex items-center p-0.5 rounded-[8px] bg-surface2 border border-line text-xs font-medium">
                {(['free', '1:1', '3:4', '4:3', '16:9'] as AspectPreset[]).map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`px-2 py-0.5 rounded-[6px] transition-colors cursor-pointer capitalize ${
                        aspectPreset === preset
                          ? 'bg-surface text-ink shadow-xs font-semibold'
                          : 'text-muted hover:text-ink'
                      }`}
                    >
                      {preset === 'free' ? 'Free' : preset === '1:1' ? 'Square' : preset}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isTrimming}
              onClick={handleTrimEdges}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-surface2 hover:bg-surface border border-line text-xs font-semibold text-ink transition-colors cursor-pointer disabled:opacity-50"
              title="Trim white or transparent margins"
            >
              <Wand2 className="w-3.5 h-3.5 text-blue" />
              <span>Trim edges</span>
            </button>
            {trimNotice && (
              <span className="text-xs text-muted font-medium animate-in fade-in duration-100">
                {trimNotice}
              </span>
            )}
          </div>
        </div>

        {/* Viewport container */}
        <div
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative w-full h-[460px] bg-surface2 rounded-[16px] border border-line flex items-center justify-center overflow-hidden"
        >
          <img
            ref={imgRef}
            src={asset.previewUrl || asset.objectUrl}
            alt={asset.name}
            onLoad={updateImageLayout}
            draggable={false}
            className="max-w-full max-h-full object-contain pointer-events-none select-none"
          />

          {imgLayout && (
            <>
              {/* Dimmed backdrop outside crop area (4 rects) */}
              {/* Top */}
              <div
                style={{
                  position: 'absolute',
                  left: `${imgLayout.left}px`,
                  top: `${imgLayout.top}px`,
                  width: `${imgLayout.width}px`,
                  height: `${crop.y * imgLayout.height}px`,
                  backgroundColor: 'rgba(0, 0, 0, 0.58)',
                  pointerEvents: 'none',
                }}
              />
              {/* Bottom */}
              <div
                style={{
                  position: 'absolute',
                  left: `${imgLayout.left}px`,
                  top: `${imgLayout.top + (crop.y + crop.h) * imgLayout.height}px`,
                  width: `${imgLayout.width}px`,
                  height: `${(1 - (crop.y + crop.h)) * imgLayout.height}px`,
                  backgroundColor: 'rgba(0, 0, 0, 0.58)',
                  pointerEvents: 'none',
                }}
              />
              {/* Left */}
              <div
                style={{
                  position: 'absolute',
                  left: `${imgLayout.left}px`,
                  top: `${imgLayout.top + crop.y * imgLayout.height}px`,
                  width: `${crop.x * imgLayout.width}px`,
                  height: `${crop.h * imgLayout.height}px`,
                  backgroundColor: 'rgba(0, 0, 0, 0.58)',
                  pointerEvents: 'none',
                }}
              />
              {/* Right */}
              <div
                style={{
                  position: 'absolute',
                  left: `${imgLayout.left + (crop.x + crop.w) * imgLayout.width}px`,
                  top: `${imgLayout.top + crop.y * imgLayout.height}px`,
                  width: `${(1 - (crop.x + crop.w)) * imgLayout.width}px`,
                  height: `${crop.h * imgLayout.height}px`,
                  backgroundColor: 'rgba(0, 0, 0, 0.58)',
                  pointerEvents: 'none',
                }}
              />

              {/* Crop Frame */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'move')}
                style={{
                  position: 'absolute',
                  left: `${imgLayout.left + crop.x * imgLayout.width}px`,
                  top: `${imgLayout.top + crop.y * imgLayout.height}px`,
                  width: `${crop.w * imgLayout.width}px`,
                  height: `${crop.h * imgLayout.height}px`,
                  cursor: 'move',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.8), 0 4px 12px rgba(0,0,0,0.3)',
                }}
                className="border-2 border-white pointer-events-auto"
              >
                {/* 8 Handles */}
                {/* Corner NW */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'nw')}
                  className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-white border-2 border-ink/40 shadow-sm cursor-nwse-resize pointer-events-auto"
                />
                {/* Edge N */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'n')}
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-3 rounded-[3px] bg-white border border-ink/40 shadow-sm cursor-ns-resize pointer-events-auto"
                />
                {/* Corner NE */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'ne')}
                  className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-white border-2 border-ink/40 shadow-sm cursor-nesw-resize pointer-events-auto"
                />
                {/* Edge E */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'e')}
                  className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-4 rounded-[3px] bg-white border border-ink/40 shadow-sm cursor-ew-resize pointer-events-auto"
                />
                {/* Corner SE */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'se')}
                  className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-white border-2 border-ink/40 shadow-sm cursor-nwse-resize pointer-events-auto"
                />
                {/* Edge S */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 's')}
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-3 rounded-[3px] bg-white border border-ink/40 shadow-sm cursor-ns-resize pointer-events-auto"
                />
                {/* Corner SW */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'sw')}
                  className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-white border-2 border-ink/40 shadow-sm cursor-nesw-resize pointer-events-auto"
                />
                {/* Edge W */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'w')}
                  className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-4 rounded-[3px] bg-white border border-ink/40 shadow-sm cursor-ew-resize pointer-events-auto"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 rounded-[12px] bg-surface2 hover:bg-surface border border-line text-xs font-semibold text-ink transition-colors cursor-pointer"
          >
            Reset
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-[12px] bg-surface2 hover:bg-surface border border-line text-xs font-semibold text-ink transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(crop)}
              className="px-5 py-2 rounded-[12px] bg-blue text-white hover:bg-blue/90 text-xs font-semibold transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
