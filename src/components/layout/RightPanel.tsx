'use client';

import React, { useState } from 'react';
import { Lock, Unlock, ChevronDown } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { mmToUnit, unitToMm } from '@/lib/units';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { getEffectiveDpi } from '@/lib/quality';
import type { PageElement, ImageAsset, Job, Unit } from '@/types';

const BRAND_COLORS = [
  { name: 'Black', hex: '#111111' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Red', hex: '#E8262B' },
  { name: 'Blue', hex: '#1B9BF0' },
  { name: 'Green', hex: '#1DAA2F' },
  { name: 'Yellow', hex: '#FFD500' },
  { name: 'Gray', hex: '#6B6B6B' },
];

interface QualityBadgeProps {
  dpi: number;
}

function QualityBadge({ dpi }: QualityBadgeProps) {
  let dotColor = 'bg-green';
  let qualityLabel = 'Sharp';

  if (dpi < 120) {
    dotColor = 'bg-red';
    qualityLabel = 'May look blurry';
  } else if (dpi < 200) {
    dotColor = 'bg-yellow';
    qualityLabel = 'OK';
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
      <span className="font-medium text-ink">{qualityLabel}</span>
    </div>
  );
}

interface ElementInspectorFormProps {
  element: PageElement;
  asset: ImageAsset | null | undefined;
  job: Job;
  pageId: string;
  unit: Unit;
  aspectLock: boolean;
  toggleAspectLock: () => void;
  updateElement: (
    jobId: string,
    pageId: string,
    elementId: string,
    patch: Partial<PageElement>
  ) => void;
  rotateElement: (jobId: string, pageId: string, elementId: string) => void;
  duplicateElement: (jobId: string, pageId: string, elementId: string) => string | null;
  moveElementToPage: (
    jobId: string,
    fromPageId: string,
    toPageId: string,
    elementId: string
  ) => void;
  bringForward: (jobId: string, pageId: string, elementId: string) => void;
  sendBackward: (jobId: string, pageId: string, elementId: string) => void;
  bringToFront: (jobId: string, pageId: string, elementId: string) => void;
  sendToBack: (jobId: string, pageId: string, elementId: string) => void;
  removeElement: (jobId: string, pageId: string, elementId: string) => void;
  select: (sel: { pageId: string; elementId: string } | null) => void;
  clearSelection: () => void;
}

function ElementInspectorForm({
  element,
  asset,
  job,
  pageId,
  unit,
  aspectLock,
  toggleAspectLock,
  updateElement,
  rotateElement,
  duplicateElement,
  moveElementToPage,
  bringForward,
  sendBackward,
  bringToFront,
  sendToBack,
  removeElement,
  select,
  clearSelection,
}: ElementInspectorFormProps) {
  const isSliced = Boolean(element.sliceIndex);
  const isText = element.type === 'text';

  const initialX = (Math.round(mmToUnit(element.xMm, unit) * 100) / 100).toString();
  const initialY = (Math.round(mmToUnit(element.yMm, unit) * 100) / 100).toString();
  const initialW = (Math.round(mmToUnit(element.wMm, unit) * 100) / 100).toString();
  const initialH = (Math.round(mmToUnit(element.hMm, unit) * 100) / 100).toString();

  const initialPadding = (
    Math.round(mmToUnit(element.paddingMm ?? 2, unit) * 100) / 100
  ).toString();
  const initialBorder = (
    Math.round(mmToUnit(element.borderMm ?? 0, unit) * 100) / 100
  ).toString();

  const [valX, setValX] = useState(initialX);
  const [valY, setValY] = useState(initialY);
  const [valW, setValW] = useState(initialW);
  const [valH, setValH] = useState(initialH);
  const [valPadding, setValPadding] = useState(initialPadding);
  const [valBorder, setValBorder] = useState(initialBorder);

  // Quality calculation for images
  const dpi = isText ? 0 : getEffectiveDpi(element, asset);
  const currentFit = element.fit || 'cover';
  const minSizeMm = isText ? 10 : 5;

  const applyField = (field: 'x' | 'y' | 'w' | 'h' | 'padding' | 'border') => {
    if (isSliced) return;
    let raw = 0;
    if (field === 'x') raw = parseFloat(valX);
    if (field === 'y') raw = parseFloat(valY);
    if (field === 'w') raw = parseFloat(valW);
    if (field === 'h') raw = parseFloat(valH);
    if (field === 'padding') raw = parseFloat(valPadding);
    if (field === 'border') raw = parseFloat(valBorder);

    if (isNaN(raw)) {
      if (field === 'x') setValX(initialX);
      if (field === 'y') setValY(initialY);
      if (field === 'w') setValW(initialW);
      if (field === 'h') setValH(initialH);
      if (field === 'padding') setValPadding(initialPadding);
      if (field === 'border') setValBorder(initialBorder);
      return;
    }

    const mmVal = unitToMm(raw, unit);

    if (field === 'x') {
      updateElement(job.id, pageId, element.id, { xMm: mmVal });
    } else if (field === 'y') {
      updateElement(job.id, pageId, element.id, { yMm: mmVal });
    } else if (field === 'w') {
      const newWMm = Math.max(minSizeMm, mmVal);
      if (!isText && aspectLock && element.wMm > 0 && element.hMm > 0) {
        const ratio = element.wMm / element.hMm;
        const newHMm = Math.max(minSizeMm, newWMm / ratio);
        updateElement(job.id, pageId, element.id, { wMm: newWMm, hMm: newHMm });
      } else {
        updateElement(job.id, pageId, element.id, { wMm: newWMm });
      }
    } else if (field === 'h') {
      const newHMm = Math.max(minSizeMm, mmVal);
      if (!isText && aspectLock && element.wMm > 0 && element.hMm > 0) {
        const ratio = element.wMm / element.hMm;
        const newWMm = Math.max(minSizeMm, newHMm * ratio);
        updateElement(job.id, pageId, element.id, { wMm: newWMm, hMm: newHMm });
      } else {
        updateElement(job.id, pageId, element.id, { hMm: newHMm });
      }
    } else if (field === 'padding') {
      updateElement(job.id, pageId, element.id, { paddingMm: Math.max(0, mmVal) });
    } else if (field === 'border') {
      updateElement(job.id, pageId, element.id, { borderMm: Math.max(0, mmVal) });
    }
  };

  const handleKeyDownField = (
    e: React.KeyboardEvent<HTMLInputElement>,
    field: 'x' | 'y' | 'w' | 'h' | 'padding' | 'border'
  ) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      if (field === 'x') setValX(initialX);
      if (field === 'y') setValY(initialY);
      if (field === 'w') setValW(initialW);
      if (field === 'h') setValH(initialH);
      if (field === 'padding') setValPadding(initialPadding);
      if (field === 'border') setValBorder(initialBorder);
    }
  };

  return (
    <aside className="w-[280px] shrink-0 bg-paper border-l border-line p-4 flex flex-col gap-4 overflow-y-auto select-none text-ink">
      {/* Header Info */}
      <div className="flex items-center gap-3">
        {isText ? (
          <div className="w-14 h-14 rounded-[8px] border border-line bg-surface flex items-center justify-center text-xs font-semibold text-muted shrink-0">
            Text
          </div>
        ) : asset ? (
          <div className="w-14 h-14 rounded-[8px] overflow-hidden border border-line bg-surface shrink-0">
            <img
              src={asset.objectUrl}
              alt={asset.name}
              className="w-full h-full object-cover select-none pointer-events-none"
            />
          </div>
        ) : (
          <div className="w-14 h-14 rounded-[8px] border border-line bg-surface flex items-center justify-center text-xs text-muted shrink-0">
            Image
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <h2
            className="text-xs font-semibold text-ink truncate"
            title={isText ? 'Text box' : asset?.name}
          >
            {isText ? 'Text Box' : asset?.name || 'Selected Element'}
          </h2>
          {!isText && (
            <div className="mt-1">
              <QualityBadge dpi={dpi} />
            </div>
          )}
          {isSliced && (
            <span className="text-[11px] font-medium text-blue mt-0.5">
              Slice {element.sliceIndex} of {element.sliceCount}
            </span>
          )}
        </div>
      </div>

      {isSliced && (
        <p className="text-[11px] text-muted italic">
          Slices are locked so pages line up
        </p>
      )}

      {/* Primary Action Buttons */}
      <div className="flex flex-col gap-2">
        {!isText && (
          isSliced ? (
            <Tooltip content="Sliced pages can't be rotated" className="w-full">
              <div className="w-full">
                <Button variant="outline" disabled className="w-full h-[40px]">
                  Rotate
                </Button>
              </div>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              onClick={() => rotateElement(job.id, pageId, element.id)}
              className="w-full h-[40px]"
            >
              Rotate
            </Button>
          )
        )}

        <Button
          variant="outline"
          disabled={isSliced}
          onClick={() => {
            const newId = duplicateElement(job.id, pageId, element.id);
            if (newId) {
              select({ pageId, elementId: newId });
            }
          }}
          className="w-full h-[40px]"
        >
          Duplicate
        </Button>

        <button
          type="button"
          disabled={isSliced}
          onClick={() => {
            removeElement(job.id, pageId, element.id);
            clearSelection();
          }}
          className="w-full h-[40px] flex items-center justify-center text-sm font-medium text-red hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
        >
          Delete
        </button>
      </div>

      {/* Collapsed Details: More */}
      <details className="group border-t border-line pt-3 mt-1">
        <summary className="text-[12px] font-semibold text-muted uppercase tracking-wider cursor-pointer select-none py-1 flex items-center justify-between">
          <span>More</span>
          <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
        </summary>

        <div className="mt-3 flex flex-col gap-4 text-xs">
          {/* Position & Size */}
          <section className="flex flex-col gap-2 p-3 rounded-[8px] bg-surface border border-line">
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
              Geometry
            </span>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted font-medium">X ({unit})</label>
                <input
                  type="number"
                  step="any"
                  disabled={isSliced}
                  value={valX}
                  onChange={(e) => setValX(e.target.value)}
                  onBlur={() => applyField('x')}
                  onKeyDown={(e) => handleKeyDownField(e, 'x')}
                  className="w-full px-2 py-1 text-xs rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted font-medium">Y ({unit})</label>
                <input
                  type="number"
                  step="any"
                  disabled={isSliced}
                  value={valY}
                  onChange={(e) => setValY(e.target.value)}
                  onBlur={() => applyField('y')}
                  onKeyDown={(e) => handleKeyDownField(e, 'y')}
                  className="w-full px-2 py-1 text-xs rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[10px] text-muted font-medium">W ({unit})</label>
                <input
                  type="number"
                  step="any"
                  disabled={isSliced}
                  value={valW}
                  onChange={(e) => setValW(e.target.value)}
                  onBlur={() => applyField('w')}
                  onKeyDown={(e) => handleKeyDownField(e, 'w')}
                  className="w-full px-2 py-1 text-xs rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                />
              </div>

              {!isText && (
                <button
                  type="button"
                  disabled={isSliced}
                  onClick={toggleAspectLock}
                  title={aspectLock ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                  className={`mt-4 p-1.5 rounded-[6px] border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    aspectLock
                      ? 'border-blue bg-blue/10 text-blue'
                      : 'border-line bg-paper text-muted hover:text-ink'
                  }`}
                >
                  {aspectLock ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5" />
                  )}
                </button>
              )}

              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[10px] text-muted font-medium">H ({unit})</label>
                <input
                  type="number"
                  step="any"
                  disabled={isSliced}
                  value={valH}
                  onChange={(e) => setValH(e.target.value)}
                  onBlur={() => applyField('h')}
                  onKeyDown={(e) => handleKeyDownField(e, 'h')}
                  className="w-full px-2 py-1 text-xs rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                />
              </div>
            </div>
          </section>

          {/* Fit Mode for Images */}
          {!isText && !isSliced && (
            <section className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Fit mode
              </span>
              <div className="grid grid-cols-2 p-0.5 rounded-[8px] bg-surface border border-line text-xs font-medium">
                <button
                  type="button"
                  onClick={() =>
                    updateElement(job.id, pageId, element.id, { fit: 'cover' })
                  }
                  className={`py-1 px-2 text-center rounded-[6px] transition-colors cursor-pointer ${
                    currentFit === 'cover'
                      ? 'bg-paper text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Fill
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateElement(job.id, pageId, element.id, { fit: 'contain' })
                  }
                  className={`py-1 px-2 text-center rounded-[6px] transition-colors cursor-pointer ${
                    currentFit === 'contain'
                      ? 'bg-paper text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Fit
                </button>
              </div>
            </section>
          )}

          {/* Page Select */}
          <section className="flex flex-col gap-1">
            <label className="text-[10px] text-muted font-medium">Page</label>
            <select
              disabled={isSliced}
              value={pageId}
              onChange={(e) =>
                moveElementToPage(job.id, pageId, e.target.value, element.id)
              }
              className="w-full px-2 py-1 text-xs rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {job.pages.map((p, idx) => (
                <option key={p.id} value={p.id}>
                  Page {idx + 1}
                </option>
              ))}
            </select>
          </section>

          {/* Text-specific settings */}
          {isText && (
            <>
              {/* Vertical Align */}
              <section className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                  Vertical Align
                </span>
                <div className="grid grid-cols-3 p-0.5 rounded-[8px] bg-surface border border-line text-xs font-medium">
                  {(['top', 'middle', 'bottom'] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() =>
                        updateElement(job.id, pageId, element.id, { vAlign: align })
                      }
                      className={`py-1 text-center rounded-[6px] capitalize transition-colors cursor-pointer ${
                        (element.vAlign || 'top') === align
                          ? 'bg-paper text-ink shadow-xs'
                          : 'text-muted hover:text-ink'
                      }`}
                    >
                      {align}
                    </button>
                  ))}
                </div>
              </section>

              {/* Padding */}
              <section className="flex flex-col gap-1">
                <label className="text-[10px] text-muted font-medium">Padding ({unit})</label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={valPadding}
                  onChange={(e) => setValPadding(e.target.value)}
                  onBlur={() => applyField('padding')}
                  onKeyDown={(e) => handleKeyDownField(e, 'padding')}
                  className="w-full px-2 py-1 text-xs rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue font-mono"
                />
              </section>

              {/* Fill Color */}
              <section className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted font-medium">Fill Color</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateElement(job.id, pageId, element.id, { fillColor: null })
                    }
                    className="text-[10px] text-red hover:underline cursor-pointer"
                  >
                    None
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() =>
                        updateElement(job.id, pageId, element.id, { fillColor: c.hex })
                      }
                      className="w-5 h-5 rounded-[4px] border border-line cursor-pointer hover:scale-110 transition-transform"
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                  <input
                    type="color"
                    value={element.fillColor || '#ffffff'}
                    onChange={(e) =>
                      updateElement(job.id, pageId, element.id, { fillColor: e.target.value })
                    }
                    className="w-5 h-5 p-0 border border-line rounded cursor-pointer"
                    title="Custom color"
                  />
                </div>
              </section>

              {/* Border Width & Color */}
              <section className="flex flex-col gap-1.5">
                <label className="text-[10px] text-muted font-medium">Border ({unit})</label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={valBorder}
                  onChange={(e) => setValBorder(e.target.value)}
                  onBlur={() => applyField('border')}
                  onKeyDown={(e) => handleKeyDownField(e, 'border')}
                  className="w-full px-2 py-1 text-xs rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue font-mono"
                />
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() =>
                        updateElement(job.id, pageId, element.id, { borderColor: c.hex })
                      }
                      className="w-5 h-5 rounded-[4px] border border-line cursor-pointer hover:scale-110 transition-transform"
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </section>

              {/* Auto-Grow Height */}
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={element.autoGrow ?? true}
                  onChange={(e) =>
                    updateElement(job.id, pageId, element.id, { autoGrow: e.target.checked })
                  }
                  className="rounded-[4px] border-line text-blue focus:ring-0 cursor-pointer"
                />
                <span>Auto-grow height</span>
              </label>
            </>
          )}

          {/* Layer order buttons */}
          <section className="flex flex-col gap-2 pt-1 border-t border-line">
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
              Layers
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                disabled={isSliced}
                onClick={() => bringForward(job.id, pageId, element.id)}
                className="text-xs"
              >
                Bring forward
              </Button>
              <Button
                variant="outline"
                disabled={isSliced}
                onClick={() => sendBackward(job.id, pageId, element.id)}
                className="text-xs"
              >
                Send backward
              </Button>
            </div>
            <div className="flex items-center justify-between px-1 text-[11px]">
              <button
                type="button"
                disabled={isSliced}
                onClick={() => bringToFront(job.id, pageId, element.id)}
                className="text-muted hover:text-ink hover:underline cursor-pointer disabled:opacity-50"
              >
                Bring to front
              </button>
              <button
                type="button"
                disabled={isSliced}
                onClick={() => sendToBack(job.id, pageId, element.id)}
                className="text-muted hover:text-ink hover:underline cursor-pointer disabled:opacity-50"
              >
                Send to back
              </button>
            </div>
          </section>
        </div>
      </details>
    </aside>
  );
}

export function RightPanel() {
  const {
    jobs,
    activeJobId,
    assets,
    updateElement,
    rotateElement,
    duplicateElement,
    moveElementToPage,
    bringForward,
    sendBackward,
    bringToFront,
    sendToBack,
    removeElement,
  } = useSessionStore();

  const {
    selected,
    select,
    clearSelection,
    aspectLock,
    toggleAspectLock,
  } = useUiStore();

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const unit = activeJob.settings.unit;

  const selectedPageId = selected?.pageId;
  const selectedElementId = selected?.elementId;

  const selectedPage = selectedPageId
    ? activeJob.pages.find((p) => p.id === selectedPageId)
    : null;
  const selectedElement =
    selectedPage && selectedElementId
      ? selectedPage.elements.find((el) => el.id === selectedElementId)
      : null;
  const selectedAsset = selectedElement
    ? assets.find((a) => a.id === selectedElement.assetId)
    : null;

  if (!selected || !selectedPage || !selectedElement) {
    return (
      <aside className="w-[280px] shrink-0 bg-paper border-l border-line p-4 flex flex-col items-center justify-center text-center select-none text-ink">
        <p className="text-xs text-muted">Click a picture to edit it.</p>
      </aside>
    );
  }

  return (
    <ElementInspectorForm
      key={`${selectedElement.id}-${selectedElement.xMm}-${selectedElement.yMm}-${selectedElement.wMm}-${selectedElement.hMm}-${unit}`}
      element={selectedElement}
      asset={selectedAsset}
      job={activeJob}
      pageId={selected.pageId}
      unit={unit}
      aspectLock={aspectLock}
      toggleAspectLock={toggleAspectLock}
      updateElement={updateElement}
      rotateElement={rotateElement}
      duplicateElement={duplicateElement}
      moveElementToPage={moveElementToPage}
      bringForward={bringForward}
      sendBackward={sendBackward}
      bringToFront={bringToFront}
      sendToBack={sendToBack}
      removeElement={removeElement}
      select={select}
      clearSelection={clearSelection}
    />
  );
}
