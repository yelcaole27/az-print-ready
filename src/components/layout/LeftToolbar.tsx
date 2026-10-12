'use client';

import React, { useRef } from 'react';
import { Upload, X, ArrowLeftRight, Type } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore, DocFitMode } from '@/store/useUiStore';
import { SIZE_PRESETS } from '@/lib/constants/sizePresets';
import { mmToUnit, unitToMm } from '@/lib/units';
import { printableRect, packCopies } from '@/lib/packing';
import { getPageDimensionsMm } from '@/lib/pageGeometry';
import { layoutDocumentImage } from '@/lib/documentLayout';
import { importFiles } from '@/lib/importImages';
import { addTextBox, newTextPage } from '@/lib/textActions';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';

export function LeftToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    jobs,
    activeJobId,
    assets,
    removeAsset,
    clearElements,
    updateSettings,
    applyPlacements,
  } = useSessionStore();

  const {
    activeAssetId,
    setActiveAssetId,
    clearSelection,
    activePageId,
    setActivePage,
    layoutMode,
    setLayoutMode,
    sizeMode,
    setSizeMode,
    presetId,
    setPresetId,
    customWMm,
    setCustomWMm,
    customHMm,
    setCustomHMm,
    swapCustomDimensions,
    qty,
    setQty,
    fit,
    setFit,
    matchOrientation,
    setMatchOrientation,
    allowRotate,
    setAllowRotate,
    docFit,
    setDocFit,
    docAutoRotate,
    setDocAutoRotate,
    docEdgeToEdge,
    setDocEdgeToEdge,
    docAlign,
    setDocAlign,
    docCopies,
    setDocCopies,
    message,
    setMessage,
  } = useUiStore();

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const unit = activeJob.settings.unit;
  const activeAsset = assets.find((a) => a.id === activeAssetId);

  // File upload trigger
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      importFiles(files);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  // Remove asset with confirmation if placed
  const handleRemoveAsset = (e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    const isUsed = jobs.some((j) =>
      j.pages.some((p) => p.elements.some((el) => el.assetId === assetId))
    );

    if (isUsed) {
      const ok = window.confirm(
        'Remove this image and its placed copies? This also clears undo history.'
      );
      if (!ok) return;
    }

    removeAsset(assetId);
    if (activeAssetId === assetId) {
      const remaining = assets.filter((a) => a.id !== assetId);
      setActiveAssetId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // Sheet Mode placement action
  const handlePlaceSheet = (fillActiveOnly: boolean) => {
    if (!activeAsset) return;

    let wMm: number;
    let hMm: number;

    if (sizeMode === 'preset') {
      const preset =
        SIZE_PRESETS.find((p) => p.id === presetId) || SIZE_PRESETS[0];
      wMm = preset.widthMm;
      hMm = preset.heightMm;
    } else {
      wMm = customWMm;
      hMm = customHMm;
    }

    // Match orientation if requested and neither image nor size is square
    const assetIsLandscape = activeAsset.pxW > activeAsset.pxH;
    const assetIsPortrait = activeAsset.pxH > activeAsset.pxW;
    const sizeIsLandscape = wMm > hMm;
    const sizeIsPortrait = hMm > wMm;

    if (matchOrientation) {
      if (assetIsLandscape && sizeIsPortrait) {
        const tmp = wMm;
        wMm = hMm;
        hMm = tmp;
      } else if (assetIsPortrait && sizeIsLandscape) {
        const tmp = wMm;
        wMm = hMm;
        hMm = tmp;
      }
    }

    const activePageIndex = Math.max(
      0,
      activeJob.pages.findIndex((p) => p.id === activePageId)
    );

    const result = packCopies({
      pages: activeJob.pages,
      startPageIndex: activePageIndex,
      itemWMm: wMm,
      itemHMm: hMm,
      qty: fillActiveOnly ? 500 : qty,
      allowRotate,
      fillActiveOnly,
      settings: activeJob.settings,
      assetId: activeAsset.id,
      fit,
    });

    if (result.error) {
      setMessage({ type: 'error', text: result.error });
      return;
    }

    if (result.placements.length > 0) {
      applyPlacements(activeJob.id, result.placements);
      if (fillActiveOnly) {
        setMessage({
          type: 'info',
          text: `Filled ${result.placedCount} copies on page ${activePageIndex + 1}`,
        });
      } else {
        const uniquePages = new Set(
          result.placements.map((p) => p.pageIndex)
        );
        setMessage({
          type: 'info',
          text: `Added ${result.placedCount} copies across ${uniquePages.size} page(s)`,
        });
      }
    } else {
      setMessage({
        type: 'warn',
        text: 'No more space on this page',
      });
    }
  };

  // Document Mode placement action
  const handlePlaceDocument = (allImages: boolean) => {
    const targetAssets = allImages
      ? assets
      : activeAsset
      ? [activeAsset]
      : [];

    if (targetAssets.length === 0) return;

    const firstPage = activeJob.pages[0];
    const { wMm: pageWMm, hMm: pageHMm } = getPageDimensionsMm(firstPage);
    const marginMm = docEdgeToEdge ? 0 : activeJob.settings.marginMm;

    const generatedPages = [];
    let slicedCount = 0;
    let maxSliceCount = 0;

    for (let c = 0; c < docCopies; c++) {
      for (const asset of targetAssets) {
        const pagesForAsset = layoutDocumentImage({
          asset,
          pageWMm,
          pageHMm,
          marginMm,
          fit: docFit,
          autoRotate: docAutoRotate,
          align: docAlign,
        });

        for (const p of pagesForAsset) {
          if (p[0]?.sliceCount && p[0].sliceCount > 1) {
            slicedCount++;
            if (p[0].sliceCount > maxSliceCount) {
              maxSliceCount = p[0].sliceCount;
            }
          }
        }

        generatedPages.push(...pagesForAsset);
      }
    }

    if (generatedPages.length === 0) return;

    const lastPage = activeJob.pages[activeJob.pages.length - 1];
    const startIndex =
      lastPage && lastPage.elements.length === 0
        ? activeJob.pages.length - 1
        : activeJob.pages.length;

    const totalPagesNeeded = startIndex + generatedPages.length;
    if (totalPagesNeeded > 50) {
      setMessage({
        type: 'warn',
        text: 'Safety limit reached: cannot exceed 50 pages.',
      });
      return;
    }

    const placements = [];
    for (let k = 0; k < generatedPages.length; k++) {
      const pageElements = generatedPages[k];
      for (const el of pageElements) {
        placements.push({
          pageIndex: startIndex + k,
          element: el,
        });
      }
    }

    applyPlacements(activeJob.id, placements);

    // Set active page to the first page created/used
    const updatedJob = useSessionStore
      .getState()
      .jobs.find((j) => j.id === activeJob.id);
    if (updatedJob && updatedJob.pages[startIndex]) {
      setActivePage(updatedJob.pages[startIndex].id);
    }

    let msg = `Added ${generatedPages.length} page(s)`;
    if (slicedCount > 0) {
      msg += `. Tall image split into ${maxSliceCount} pages. Slices may cut through lines of text; use Fit page to keep everything on one page.`;
    }
    setMessage({
      type: 'info',
      text: msg,
    });
  };

  // Clear all layout in active job
  const handleClearAllLayout = () => {
    const ok = window.confirm('Clear all layout elements from this job?');
    if (ok) {
      clearElements(activeJob.id);
      clearSelection();
    }
  };

  // Printable area text
  const activePage =
    activeJob.pages.find((p) => p.id === activePageId) || activeJob.pages[0];
  const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(activePage);
  const pRect = printableRect(pageW, pageH, activeJob.settings.marginMm);
  const pw = Math.round(mmToUnit(pRect.w, unit) * 100) / 100;
  const ph = Math.round(mmToUnit(pRect.h, unit) * 100) / 100;

  // Custom size values in current unit
  const customWInUnit = Math.round(mmToUnit(customWMm, unit) * 100) / 100;
  const customHInUnit = Math.round(mmToUnit(customHMm, unit) * 100) / 100;

  // Spacing values in current unit
  const marginInUnit =
    Math.round(mmToUnit(activeJob.settings.marginMm, unit) * 100) / 100;
  const gapInUnit =
    Math.round(mmToUnit(activeJob.settings.gapMm, unit) * 100) / 100;

  const docFitOptions: {
    id: DocFitMode;
    title: string;
    desc: string;
  }[] = [
    {
      id: 'fit-page',
      title: 'Fit page',
      desc: 'Whole image, no stretching',
    },
    {
      id: 'fill-page',
      title: 'Fill page (crop)',
      desc: 'Covers the full page, crops overflow',
    },
    {
      id: 'fill-width',
      title: 'Fill width',
      desc: 'Fits the page width, continues on more pages if tall',
    },
  ];

  return (
    <aside className="w-[280px] shrink-0 bg-paper border-r border-line p-3 flex flex-col gap-4 overflow-y-auto select-none text-ink">
      {/* Inline Message Banner */}
      {message && (
        <div
          className={`px-2.5 py-2 rounded-[8px] border text-xs leading-snug transition-all ${
            message.type === 'error'
              ? 'bg-red/10 border-red/30 text-red font-medium'
              : message.type === 'warn'
              ? 'bg-yellow/15 border-yellow/40 text-ink'
              : 'bg-blue/10 border-blue/30 text-blue font-medium'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 1) Section: Add */}
      <section className="flex flex-col gap-1.5">
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          Add
        </h2>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          className="hidden"
          onChange={handleFileInputChange}
        />
        <Button
          variant="outline"
          onClick={handleUploadClick}
          className="w-full flex items-center justify-center gap-1.5"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload images</span>
        </Button>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="outline"
            onClick={addTextBox}
            className="flex items-center justify-center gap-1 text-xs"
            title="Add text box on active page"
          >
            <Type className="w-3 h-3" />
            <span>Add text box</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => newTextPage()}
            className="flex items-center justify-center gap-1 text-xs"
            title="Create new full-page text box"
          >
            <Type className="w-3 h-3" />
            <span>New text page</span>
          </Button>
        </div>

        <p className="text-[11px] text-muted text-center">
          or drag & drop, or press Ctrl+V to paste
        </p>
      </section>

      {/* 2) Section: Images */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          Images
        </h2>
        {assets.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted border border-dashed border-line rounded-[8px] bg-surface/50">
            No images added
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
              {assets.map((asset) => {
                const isActive = asset.id === activeAssetId;
                return (
                  <div
                    key={asset.id}
                    onClick={() => setActiveAssetId(asset.id)}
                    className={`relative w-16 h-16 rounded-[8px] overflow-hidden cursor-pointer bg-surface group transition-all ${
                      isActive
                        ? 'border-2 border-blue'
                        : 'border border-line hover:border-muted'
                    }`}
                  >
                    <img
                      src={asset.objectUrl}
                      alt={asset.name}
                      className="w-full h-full object-cover select-none pointer-events-none"
                    />
                    <button
                      type="button"
                      onClick={(e) => handleRemoveAsset(e, asset.id)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-paper/90 border border-line flex items-center justify-center text-muted hover:text-red hover:bg-paper transition-colors"
                      title="Remove image"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            {activeAsset && (
              <p
                className="text-[11px] text-muted truncate px-1"
                title={activeAsset.name}
              >
                {activeAsset.name} · {activeAsset.pxW} × {activeAsset.pxH} px
              </p>
            )}
          </div>
        )}
      </section>

      {/* 3) Section: Layout mode */}
      <section className="flex flex-col gap-1.5">
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          Layout mode
        </h2>
        <div className="grid grid-cols-2 p-0.5 rounded-[8px] bg-surface border border-line text-xs font-medium">
          <button
            type="button"
            onClick={() => setLayoutMode('sheet')}
            className={`py-1 px-2 rounded-[6px] transition-colors cursor-pointer ${
              layoutMode === 'sheet'
                ? 'bg-paper text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            Sheet
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('document')}
            className={`py-1 px-2 rounded-[6px] transition-colors cursor-pointer ${
              layoutMode === 'document'
                ? 'bg-paper text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            Document
          </button>
        </div>
      </section>

      {/* Mode-Specific Sections */}
      {layoutMode === 'sheet' ? (
        <>
          {/* Section: Size */}
          <section className="flex flex-col gap-2">
            <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
              Size
            </h2>
            <div className="flex flex-wrap gap-1">
              {SIZE_PRESETS.map((preset) => {
                const isSelected =
                  sizeMode === 'preset' && presetId === preset.id;
                const w =
                  Math.round(mmToUnit(preset.widthMm, unit) * 100) / 100;
                const h =
                  Math.round(mmToUnit(preset.heightMm, unit) * 100) / 100;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSizeMode('preset');
                      setPresetId(preset.id);
                    }}
                    className={`py-1 px-2 rounded-[6px] text-xs border transition-colors cursor-pointer text-left ${
                      isSelected
                        ? 'border-blue bg-blue/10 text-blue font-medium'
                        : 'border-line bg-paper hover:bg-surface text-ink'
                    }`}
                  >
                    {preset.name} {w} × {h} {unit}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSizeMode('custom')}
                className={`py-1 px-2 rounded-[6px] text-xs border transition-colors cursor-pointer ${
                  sizeMode === 'custom'
                    ? 'border-blue bg-blue/10 text-blue font-medium'
                    : 'border-line bg-paper hover:bg-surface text-ink'
                }`}
              >
                Custom
              </button>
            </div>

            {sizeMode === 'custom' && (
              <div className="flex items-center gap-2 p-2 rounded-[8px] bg-surface border border-line">
                <div className="flex-1 flex flex-col gap-0.5">
                  <label className="text-[10px] text-muted">Width ({unit})</label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    value={customWInUnit}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        setCustomWMm(unitToMm(val, unit));
                      }
                    }}
                    className="w-full px-2 py-1 text-xs rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue"
                  />
                </div>

                <button
                  type="button"
                  onClick={swapCustomDimensions}
                  title="Swap Width and Height"
                  className="mt-3.5 p-1 rounded-[6px] border border-line bg-paper hover:bg-surface text-muted hover:text-ink cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>

                <div className="flex-1 flex flex-col gap-0.5">
                  <label className="text-[10px] text-muted">Height ({unit})</label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    value={customHInUnit}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        setCustomHMm(unitToMm(val, unit));
                      }
                    }}
                    className="w-full px-2 py-1 text-xs rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Section: Place */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
              Place
            </h2>

            {/* Quantity */}
            <div className="flex items-center justify-between text-xs">
              <label className="text-muted">Quantity</label>
              <input
                type="number"
                min="1"
                max="500"
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value, 10) || 1)}
                className="w-20 px-2 py-1 text-xs text-right rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue"
              />
            </div>

            {/* Fit segmented control */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted">Fit mode</label>
              <div className="grid grid-cols-2 p-0.5 rounded-[8px] bg-surface border border-line text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setFit('cover')}
                  className={`py-1 px-1.5 text-center rounded-[6px] transition-colors cursor-pointer ${
                    fit === 'cover'
                      ? 'bg-paper text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Fill (crop)
                </button>
                <button
                  type="button"
                  onClick={() => setFit('contain')}
                  className={`py-1 px-1.5 text-center rounded-[6px] transition-colors cursor-pointer ${
                    fit === 'contain'
                      ? 'bg-paper text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Fit (whole image)
                </button>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-col gap-1.5 text-xs text-ink">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={matchOrientation}
                  onChange={(e) => setMatchOrientation(e.target.checked)}
                  className="rounded-[4px] border-line accent-blue cursor-pointer"
                />
                <span>Match photo orientation</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowRotate}
                  onChange={(e) => setAllowRotate(e.target.checked)}
                  className="rounded-[4px] border-line accent-blue cursor-pointer"
                />
                <span>Allow rotating to fit more</span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-1.5 pt-1">
              {activeAsset ? (
                <>
                  <Button
                    variant="primary"
                    onClick={() => handlePlaceSheet(false)}
                    className="w-full"
                  >
                    Add to layout
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handlePlaceSheet(true)}
                    className="w-full"
                  >
                    Fill active page
                  </Button>
                </>
              ) : (
                <Tooltip content="Select or upload an image first">
                  <div className="flex flex-col gap-1.5 w-full">
                    <Button variant="primary" disabled className="w-full">
                      Add to layout
                    </Button>
                    <Button variant="outline" disabled className="w-full">
                      Fill active page
                    </Button>
                  </div>
                </Tooltip>
              )}
            </div>
          </section>
        </>
      ) : (
        /* Document Fit Section */
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
            Document fit
          </h2>

          {/* Three selectable option cards */}
          <div className="flex flex-col gap-1.5">
            {docFitOptions.map((opt) => {
              const isSelected = docFit === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setDocFit(opt.id)}
                  className={`p-2 rounded-[8px] border cursor-pointer transition-colors text-left flex flex-col gap-0.5 ${
                    isSelected
                      ? 'border-blue bg-blue/5'
                      : 'border-line bg-surface/50 hover:bg-surface'
                  }`}
                >
                  <span
                    className={`text-xs font-medium ${
                      isSelected ? 'text-blue' : 'text-ink'
                    }`}
                  >
                    {opt.title}
                  </span>
                  <span className="text-[11px] text-muted leading-tight">
                    {opt.desc}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Align segmented control (hidden when fill-page) */}
          {docFit !== 'fill-page' && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted">Alignment</label>
              <div className="grid grid-cols-2 p-0.5 rounded-[8px] bg-surface border border-line text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setDocAlign('top')}
                  className={`py-1 px-1.5 text-center rounded-[6px] transition-colors cursor-pointer ${
                    docAlign === 'top'
                      ? 'bg-paper text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Top
                </button>
                <button
                  type="button"
                  onClick={() => setDocAlign('center')}
                  className={`py-1 px-1.5 text-center rounded-[6px] transition-colors cursor-pointer ${
                    docAlign === 'center'
                      ? 'bg-paper text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Center
                </button>
              </div>
            </div>
          )}

          {/* Auto-rotate Checkbox */}
          <div className="flex flex-col gap-1.5 text-xs text-ink">
            {docFit === 'fill-width' ? (
              <Tooltip content="Auto-rotate is disabled in Fill width mode">
                <label className="flex items-center gap-2 opacity-50 cursor-not-allowed select-none">
                  <input
                    type="checkbox"
                    disabled
                    checked={false}
                    className="rounded-[4px] border-line cursor-not-allowed"
                  />
                  <span>Auto-rotate to best fit</span>
                </label>
              </Tooltip>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={docAutoRotate}
                  onChange={(e) => setDocAutoRotate(e.target.checked)}
                  className="rounded-[4px] border-line accent-blue cursor-pointer"
                />
                <span>Auto-rotate to best fit</span>
              </label>
            )}

            {/* Edge to edge Checkbox */}
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={docEdgeToEdge}
                  onChange={(e) => setDocEdgeToEdge(e.target.checked)}
                  className="rounded-[4px] border-line accent-blue cursor-pointer"
                />
                <span>Edge to edge (ignore margins)</span>
              </label>
              {docEdgeToEdge && (
                <div className="flex items-start gap-1.5 pl-6 text-[11px] text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow shrink-0 mt-1" />
                  <span>
                    Most printers can&apos;t print to the very edge; edges may be clipped.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Copies Input */}
          <div className="flex items-center justify-between text-xs">
            <label className="text-muted">Copies</label>
            <input
              type="number"
              min="1"
              max="50"
              value={docCopies}
              onChange={(e) =>
                setDocCopies(parseInt(e.target.value, 10) || 1)
              }
              className="w-20 px-2 py-1 text-xs text-right rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-1.5 pt-1">
            {assets.length > 0 ? (
              <>
                <Button
                  variant="primary"
                  onClick={() => handlePlaceDocument(false)}
                  className="w-full"
                >
                  Add to layout
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handlePlaceDocument(true)}
                  className="w-full"
                >
                  Add all images
                </Button>
              </>
            ) : (
              <Tooltip content="Upload images first" className="w-full">
                <div className="flex flex-col gap-1.5 w-full">
                  <Button variant="primary" disabled className="w-full">
                    Add to layout
                  </Button>
                  <Button variant="outline" disabled className="w-full">
                    Add all images
                  </Button>
                </div>
              </Tooltip>
            )}
          </div>
        </section>
      )}

      {/* 6) Section: Spacing */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          Spacing
        </h2>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col gap-1">
            <label className="text-muted">Margin ({unit})</label>
            <input
              type="number"
              step="any"
              min="0"
              value={marginInUnit}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                  const mm = Math.min(50, Math.max(0, unitToMm(val, unit)));
                  updateSettings(activeJob.id, { marginMm: mm });
                }
              }}
              className="w-full px-2 py-1 rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-muted">Gap ({unit})</label>
            <input
              type="number"
              step="any"
              min="0"
              value={gapInUnit}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                  const mm = Math.min(20, Math.max(0, unitToMm(val, unit)));
                  updateSettings(activeJob.id, { gapMm: mm });
                }
              }}
              className="w-full px-2 py-1 rounded-[6px] border border-line bg-paper text-ink focus:outline-none focus:border-blue"
            />
          </div>
        </div>

        <p className="text-[11px] text-muted">
          Printable area: {pw} × {ph} {unit}
        </p>
      </section>

      {/* 7) Section: Clear all layout */}
      <section className="mt-auto pt-2 border-t border-line">
        <button
          type="button"
          onClick={handleClearAllLayout}
          className="w-full text-center text-xs font-medium text-red hover:underline py-1.5 cursor-pointer"
        >
          Clear all layout
        </button>
      </section>
    </aside>
  );
}
