'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Menu, Plus, X, ChevronDown, ArrowLeftRight, Upload } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { PAPERS } from '@/lib/constants/papers';
import { Tooltip } from '@/components/ui/Tooltip';
import { unitToMm } from '@/lib/units';
import { importFiles } from '@/lib/importImages';

interface SizePreset {
  id: string;
  name: string;
  wMm: number;
  hMm: number;
}

const MORE_PAPERS = ['legal', 'a3', 'a5', '4r', '5r'];

const MORE_SIZE_PRESETS: SizePreset[] = [
  { id: 'passport', name: 'Passport', wMm: 35, hMm: 45 },
  { id: '3r', name: '3R', wMm: 88.9, hMm: 127 },
  { id: '4r', name: '4R', wMm: 101.6, hMm: 152.4 },
  { id: '5r', name: '5R', wMm: 127, hMm: 177.8 },
  { id: '6r', name: '6R', wMm: 152.4, hMm: 203.2 },
  { id: '8r', name: '8R', wMm: 203.2, hMm: 254 },
  { id: 'a6', name: 'A6', wMm: 105, hMm: 148 },
];

export function Sidebar() {
  const {
    jobs,
    activeJobId,
    assets,
    setActiveJob,
    addJob,
    removeJob,
    removeAsset,
    setJobPaper,
    setJobOrientation,
    setBorderless,
    setPictureSize,
    setPictureQty,
    setPictureFillPage,
    updateSettings,
    hasManualEdits,
    alignElements,
  } = useSessionStore();

  const {
    sidebarCollapsed,
    toggleSidebar,
    activeAssetId,
    setActiveAssetId,
    setEditingBlockLayoutId,
    selected,
    selectedIds,
    selectedPageId,
    activePageId,
  } = useUiStore();

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const firstPage = activeJob?.pages[0];
  const currentUnit = activeJob?.settings.unit || 'in';

  // File input ref for "Add pictures"
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddPicturesClick = () => {
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

  // Popover state
  const [paperMoreOpen, setPaperMoreOpen] = useState(false);
  const [sizeMoreOpen, setSizeMoreOpen] = useState(false);

  // Custom size form state in More Sizes
  const [customW, setCustomW] = useState('4');
  const [customH, setCustomH] = useState('6');

  const paperMoreRef = useRef<HTMLDivElement>(null);
  const sizeMoreRef = useRef<HTMLDivElement>(null);

  // Close popovers on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (paperMoreRef.current && !paperMoreRef.current.contains(e.target as Node)) {
        setPaperMoreOpen(false);
      }
      if (sizeMoreRef.current && !sizeMoreRef.current.contains(e.target as Node)) {
        setSizeMoreOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPaperMoreOpen(false);
        setSizeMoreOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handlePaperChange = (newPaperId: string) => {
    if (!activeJob || !firstPage || newPaperId === firstPage.paperId) return;
    if (hasManualEdits(activeJob.id)) {
      const confirmed = window.confirm('Reset your manual changes?');
      if (!confirmed) return;
    }
    setJobPaper(activeJob.id, newPaperId);
    setPaperMoreOpen(false);
  };

  const handleOrientationChange = (newOrientation: 'portrait' | 'landscape') => {
    if (!activeJob || !firstPage || newOrientation === firstPage.orientation) return;
    if (hasManualEdits(activeJob.id)) {
      const confirmed = window.confirm('Reset your manual changes?');
      if (!confirmed) return;
    }
    setJobOrientation(activeJob.id, newOrientation);
  };

  const handleCloseJob = (e: React.MouseEvent, job: typeof jobs[0]) => {
    e.stopPropagation();
    if (jobs.length <= 1) return;

    const hasElements = job.pages.some((p) => p.elements && p.elements.length > 0);
    if (hasElements) {
      const confirmed = window.confirm('Close this job?');
      if (!confirmed) return;
    }

    removeJob(job.id);
  };

  // Active asset, block, and sheet row lookup
  const activeAsset = assets.find((a) => a.id === activeAssetId);
  const activeBlock = activeAsset
    ? activeJob?.blocks.find((b) => b.assetIds.includes(activeAsset.id))
    : null;

  const activeRow =
    activeAsset && activeBlock?.kind === 'sheet'
      ? activeBlock.rows?.find((r) => r.assetId === activeAsset.id)
      : undefined;

  const isCollageBlock = Boolean(
    activeBlock && activeBlock.kind === 'collage'
  );

  const isOnFreePage = Boolean(
    activeAsset &&
      !activeBlock &&
      activeJob?.pages.some(
        (p) => !p.blockId && p.elements.some((el) => el.assetId === activeAsset.id)
      )
  );

  const applySize = (
    spec:
      | { mode: 'default' }
      | { mode: 'size'; size: { id: string; wMm: number; hMm: number } }
      | { mode: 'fill' }
      | { mode: 'width' }
  ) => {
    if (!activeJob || !activeAssetId) return;
    const res = setPictureSize(activeJob.id, activeAssetId, spec);
    if (res === 'needs-confirm') {
      if (window.confirm('Reset your manual changes?')) {
        setPictureSize(activeJob.id, activeAssetId, spec, { force: true });
      }
    }
    setSizeMoreOpen(false);
  };

  const handleApplyCustomSize = () => {
    const parsedW = parseFloat(customW);
    const parsedH = parseFloat(customH);
    if (isNaN(parsedW) || isNaN(parsedH) || parsedW <= 0 || parsedH <= 0) return;
    const wMm = Math.max(1, unitToMm(parsedW, currentUnit));
    const hMm = Math.max(1, unitToMm(parsedH, currentUnit));
    applySize({
      mode: 'size',
      size: { id: `custom-${Math.round(wMm)}x${Math.round(hMm)}`, wMm, hMm },
    });
  };

  const handleSwapCustom = () => {
    setCustomW(customH);
    setCustomH(customW);
  };

  const handleQtyInput = (val: string) => {
    if (!activeJob || !activeAsset || !activeRow) return;
    const parsed = parseInt(val, 10);
    const clamped = Math.min(500, Math.max(1, isNaN(parsed) ? activeRow.qty : parsed));
    if (clamped !== activeRow.qty || activeRow.fillPage) {
      const res = setPictureQty(activeJob.id, activeAsset.id, clamped);
      if (res === 'needs-confirm') {
        if (window.confirm('Reset your manual changes?')) {
          setPictureQty(activeJob.id, activeAsset.id, clamped, { force: true });
        }
      }
    }
  };

  const handleQtyStep = (delta: number) => {
    if (!activeJob || !activeAsset || !activeRow) return;
    const nextQty = Math.min(500, Math.max(1, activeRow.qty + delta));
    const res = setPictureQty(activeJob.id, activeAsset.id, nextQty);
    if (res === 'needs-confirm') {
      if (window.confirm('Reset your manual changes?')) {
        setPictureQty(activeJob.id, activeAsset.id, nextQty, { force: true });
      }
    }
  };

  const handleToggleFillPage = () => {
    if (!activeJob || !activeAsset || !activeRow) return;
    const nextFill = !activeRow.fillPage;
    const res = setPictureFillPage(activeJob.id, activeAsset.id, nextFill);
    if (res === 'needs-confirm') {
      if (window.confirm('Reset your manual changes?')) {
        setPictureFillPage(activeJob.id, activeAsset.id, nextFill, { force: true });
      }
    }
  };

  const isStartState = !activeJob?.pages.some((p) => p.elements.length > 0);
  const currentPaperId = firstPage?.paperId || 'letter';
  const isMorePaperActive = MORE_PAPERS.includes(currentPaperId);

  const activePage =
    activeJob?.pages.find((p) => p.id === activePageId) || activeJob?.pages[0];

  const hasSelectedElements =
    (selectedIds.length >= 2 && selectedPageId) ||
    Boolean(selected?.elementId && selected?.pageId);

  const isAlignDisabled = !activeJob || (
    hasSelectedElements
      ? false
      : !activePage || activePage.elements.filter((el) => !el.sliceIndex).length === 0
  );

  const handleAlign = (
    mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
  ) => {
    if (!activeJob) return;
    if (selectedIds.length >= 2 && selectedPageId) {
      alignElements(activeJob.id, selectedPageId, selectedIds, mode);
    } else if (selected?.elementId && selected?.pageId) {
      alignElements(activeJob.id, selected.pageId, [selected.elementId], mode);
    } else if (activePage) {
      alignElements(activeJob.id, activePage.id, null, mode);
    }
  };

  const isDefaultActive = !isCollageBlock && activeBlock?.kind === 'fit';
  const is1x1Active = !isCollageBlock && activeRow?.size.id === '1x1';
  const is15Active = !isCollageBlock && activeRow?.size.id === '1.5x1.5';
  const is2x2Active = !isCollageBlock && activeRow?.size.id === '2x2';
  const isWalletActive = !isCollageBlock && activeRow?.size.id === 'wallet';
  const isMoreActive =
    !isCollageBlock &&
    ((activeBlock?.kind === 'fill' || activeBlock?.kind === 'width') ||
      (Boolean(activeRow) &&
        !['1x1', '1.5x1.5', '2x2', 'wallet'].includes(activeRow?.size.id || '')));

  return (
    <aside
      className={`shrink-0 bg-paper border-r border-line flex flex-col transition-[width] duration-150 ease-in-out select-none overflow-hidden ${
        sidebarCollapsed ? 'w-[64px]' : 'w-[280px]'
      }`}
    >
      {/* Header */}
      <div className="h-14 flex items-center px-3 border-b border-line shrink-0">
        <Tooltip content={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-10 h-10 flex items-center justify-center rounded-[8px] text-ink hover:bg-surface border border-transparent hover:border-line transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            <Menu className="w-5 h-5" />
          </button>
        </Tooltip>

        {!sidebarCollapsed && (
          <span className="ml-3 text-xs font-semibold text-muted uppercase tracking-wider">
            Menu
          </span>
        )}
      </div>

      {sidebarCollapsed ? (
        <div className="flex flex-col items-center py-3 gap-2 flex-1">
          <Tooltip content="New job">
            <button
              type="button"
              onClick={addJob}
              aria-label="New job"
              className="w-10 h-10 flex items-center justify-center rounded-[8px] text-ink hover:bg-surface border border-line transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              <Plus className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* 1. JOBS */}
          <div className="p-3 border-b border-line flex flex-col gap-2">
            <h2 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
              Jobs
            </h2>

            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {jobs.map((job) => {
                const isActive = job.id === activeJobId;
                const canClose = jobs.length > 1;

                return (
                  <div
                    key={job.id}
                    onClick={() => setActiveJob(job.id)}
                    className={`group relative h-[40px] px-3 flex items-center justify-between rounded-[6px] cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-surface font-bold text-ink border-l-[3px] border-blue pl-2.5'
                        : 'text-ink hover:bg-surface/60 font-medium'
                    }`}
                  >
                    <span className="truncate text-sm pr-2 flex-1">{job.name}</span>

                    {canClose && (
                      <button
                        type="button"
                        onClick={(e) => handleCloseJob(e, job)}
                        aria-label={`Close ${job.name}`}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-[4px] text-muted hover:text-red hover:bg-line transition-all cursor-pointer focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addJob}
              aria-label="New job"
              className="h-[40px] w-full flex items-center justify-center gap-1.5 rounded-[8px] border border-line bg-transparent hover:bg-surface text-ink text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              <Plus className="w-4 h-4" />
              <span>+ New job</span>
            </button>
          </div>

          {isStartState ? (
            <div className="p-4 text-center">
              <p className="text-sm text-muted">Add a picture to begin</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* 2. PAPER */}
              <div className="p-3 border-b border-line flex flex-col gap-3">
                <h2 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                  Paper
                </h2>

                {/* Big Paper Chips */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'letter', label: 'Letter' },
                    { id: 'a4', label: 'A4' },
                    { id: 'long', label: 'Long' },
                  ].map((p) => {
                    const isSelected = currentPaperId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePaperChange(p.id)}
                        className={`h-[40px] px-3 rounded-[8px] text-sm font-medium transition-all cursor-pointer border ${
                          isSelected
                            ? 'border-blue bg-blue/10 text-blue font-semibold'
                            : 'border-line bg-paper text-ink hover:border-blue/50'
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                      >
                        {p.label}
                      </button>
                    );
                  })}

                  {/* More Paper Popover Button */}
                  <div className="relative" ref={paperMoreRef}>
                    <button
                      type="button"
                      onClick={() => setPaperMoreOpen(!paperMoreOpen)}
                      className={`w-full h-[40px] px-3 rounded-[8px] text-sm font-medium transition-all cursor-pointer border flex items-center justify-between ${
                        isMorePaperActive
                          ? 'border-blue bg-blue/10 text-blue font-semibold'
                          : 'border-line bg-paper text-ink hover:border-blue/50'
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                    >
                      <span className="truncate">
                        {isMorePaperActive
                          ? PAPERS.find((p) => p.id === currentPaperId)?.name || 'More'
                          : 'More'}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 shrink-0 ml-1" />
                    </button>

                    {paperMoreOpen && (
                      <div className="absolute top-[44px] right-0 left-0 bg-paper border border-line rounded-[8px] shadow-lg p-1.5 z-30 flex flex-col gap-1">
                        {MORE_PAPERS.map((pid) => {
                          const p = PAPERS.find((x) => x.id === pid);
                          if (!p) return null;
                          const isSelected = currentPaperId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handlePaperChange(p.id)}
                              className={`h-[36px] px-2.5 rounded-[6px] text-left text-xs font-medium cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue text-white'
                                  : 'text-ink hover:bg-surface'
                              }`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Direction Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleOrientationChange('portrait')}
                    className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                      firstPage?.orientation === 'portrait'
                        ? 'border-blue bg-blue/10 text-blue font-semibold'
                        : 'border-line bg-paper text-ink hover:border-blue/50'
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                  >
                    Upright
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOrientationChange('landscape')}
                    className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                      firstPage?.orientation === 'landscape'
                        ? 'border-blue bg-blue/10 text-blue font-semibold'
                        : 'border-line bg-paper text-ink hover:border-blue/50'
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                  >
                    Sideways
                  </button>
                </div>

                {/* No white border switch */}
                <label className="flex items-center justify-between cursor-pointer py-1 select-none">
                  <span className="text-xs font-medium text-ink">No white border</span>
                  <input
                    type="checkbox"
                    checked={activeJob?.settings.borderless ?? false}
                    onChange={(e) => setBorderless(activeJob.id, e.target.checked)}
                    className="w-4 h-4 rounded text-blue focus:ring-blue cursor-pointer"
                  />
                </label>

                {/* Cut lines switch */}
                <label className="flex items-center justify-between cursor-pointer py-1 select-none">
                  <span className="text-xs font-medium text-ink">Cut lines</span>
                  <input
                    type="checkbox"
                    checked={activeJob?.settings.cutStyle !== 'none'}
                    onChange={(e) => {
                      if (!activeJob) return;
                      const nextCutStyle = e.target.checked
                        ? activeJob.settings.cutStyle === 'ticks'
                          ? 'ticks'
                          : 'outline'
                        : 'none';
                      updateSettings(activeJob.id, { cutStyle: nextCutStyle });
                    }}
                    className="w-4 h-4 rounded text-blue focus:ring-blue cursor-pointer"
                  />
                </label>
              </div>

              {/* 3. PICTURES */}
              <div className="p-3 border-b border-line flex flex-col gap-2.5">
                <h2 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                  Pictures
                </h2>

                {assets.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {assets.map((asset) => {
                      const isActive = asset.id === activeAssetId;
                      return (
                        <div
                          key={asset.id}
                          onClick={() => setActiveAssetId(asset.id)}
                          className={`group relative w-[72px] h-[72px] rounded-[8px] overflow-hidden bg-surface cursor-pointer transition-all ${
                            isActive
                              ? 'border-2 border-blue shadow-xs'
                              : 'border border-line hover:border-blue/50'
                          }`}
                        >
                          <img
                            src={asset.objectUrl}
                            alt={asset.name}
                            className="w-full h-full object-cover select-none pointer-events-none"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const confirmed = window.confirm('Delete this picture?');
                              if (confirmed) {
                                removeAsset(asset.id);
                                if (activeAssetId === asset.id) {
                                  setActiveAssetId(null);
                                }
                              }
                            }}
                            aria-label={`Remove ${asset.name}`}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-red text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                <button
                  type="button"
                  onClick={handleAddPicturesClick}
                  className="w-full h-[40px] flex items-center justify-center gap-2 rounded-[8px] border border-line bg-paper text-ink hover:border-blue/50 text-[14px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                >
                  <Upload className="w-4 h-4" />
                  <span>Add pictures</span>
                </button>
              </div>

              {/* 4. SIZE */}
              <div className="p-3 border-b border-line flex flex-col gap-2.5">
                <h2 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                  Size
                </h2>

                {!activeAsset || selectedIds.length >= 2 ? (
                  <p className="text-xs text-muted">Pick a picture.</p>
                ) : isOnFreePage ? (
                  <p className="text-xs text-muted">Placed by hand.</p>
                ) : (
                  <>
                    {/* Big Size Chips */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => applySize({ mode: 'default' })}
                        className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                          isDefaultActive
                            ? 'border-blue bg-blue/10 text-blue font-semibold'
                            : 'border-line bg-paper text-ink hover:border-blue/50'
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                      >
                        Default
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          applySize({
                            mode: 'size',
                            size: { id: '1x1', wMm: 25.4, hMm: 25.4 },
                          })
                        }
                        className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                          is1x1Active
                            ? 'border-blue bg-blue/10 text-blue font-semibold'
                            : 'border-line bg-paper text-ink hover:border-blue/50'
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                      >
                        1x1
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          applySize({
                            mode: 'size',
                            size: { id: '1.5x1.5', wMm: 38.1, hMm: 38.1 },
                          })
                        }
                        className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                          is15Active
                            ? 'border-blue bg-blue/10 text-blue font-semibold'
                            : 'border-line bg-paper text-ink hover:border-blue/50'
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                      >
                        1.5x1.5
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          applySize({
                            mode: 'size',
                            size: { id: '2x2', wMm: 50.8, hMm: 50.8 },
                          })
                        }
                        className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                          is2x2Active
                            ? 'border-blue bg-blue/10 text-blue font-semibold'
                            : 'border-line bg-paper text-ink hover:border-blue/50'
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                      >
                        2x2
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          applySize({
                            mode: 'size',
                            size: { id: 'wallet', wMm: 63.5, hMm: 88.9 },
                          })
                        }
                        className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                          isWalletActive
                            ? 'border-blue bg-blue/10 text-blue font-semibold'
                            : 'border-line bg-paper text-ink hover:border-blue/50'
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                      >
                        Wallet
                      </button>

                      {/* More Sizes Popover Button */}
                      <div className="relative" ref={sizeMoreRef}>
                        <button
                          type="button"
                          onClick={() => setSizeMoreOpen(!sizeMoreOpen)}
                          className={`w-full h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border flex items-center justify-between ${
                            isMoreActive
                              ? 'border-blue bg-blue/10 text-blue font-semibold'
                              : 'border-line bg-paper text-ink hover:border-blue/50'
                          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                        >
                          <span>More</span>
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        </button>

                        {sizeMoreOpen && (
                          <div className="absolute top-[44px] right-0 w-[240px] bg-paper border border-line rounded-[8px] shadow-lg p-2.5 z-30 flex flex-col gap-2 max-h-80 overflow-y-auto">
                            {/* Presets */}
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                                Presets
                              </span>
                              <div className="grid grid-cols-2 gap-1">
                                {MORE_SIZE_PRESETS.map((preset) => {
                                  const isSelected = activeRow?.size.id === preset.id;
                                  return (
                                    <button
                                      key={preset.id}
                                      type="button"
                                      onClick={() =>
                                        applySize({
                                          mode: 'size',
                                          size: preset,
                                        })
                                      }
                                      className={`h-[32px] px-2 rounded-[6px] text-left text-xs border transition-colors truncate cursor-pointer ${
                                        isSelected
                                          ? 'border-blue bg-blue/10 text-blue font-semibold'
                                          : 'text-ink hover:bg-surface border-line'
                                      }`}
                                      title={preset.name}
                                    >
                                      {preset.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Custom size */}
                            <div className="border-t border-line pt-2 flex flex-col gap-1.5">
                              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                                Custom ({currentUnit})
                              </span>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="any"
                                  min={0.1}
                                  value={customW}
                                  onChange={(e) => setCustomW(e.target.value)}
                                  className="w-14 h-8 px-1.5 text-xs rounded border border-line bg-surface text-ink text-center"
                                  placeholder="W"
                                />
                                <span className="text-xs text-muted">x</span>
                                <input
                                  type="number"
                                  step="any"
                                  min={0.1}
                                  value={customH}
                                  onChange={(e) => setCustomH(e.target.value)}
                                  className="w-14 h-8 px-1.5 text-xs rounded border border-line bg-surface text-ink text-center"
                                  placeholder="H"
                                />
                                <button
                                  type="button"
                                  onClick={handleSwapCustom}
                                  title="Swap width and height"
                                  className="w-8 h-8 flex items-center justify-center rounded border border-line text-muted hover:text-ink cursor-pointer"
                                >
                                  <ArrowLeftRight className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleApplyCustomSize}
                                  className="flex-1 h-8 px-2 rounded bg-blue-strong text-white text-xs font-medium cursor-pointer"
                                >
                                  OK
                                </button>
                              </div>
                            </div>

                            {/* Page options */}
                            <div className="border-t border-line pt-2 flex flex-col gap-1">
                              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                                Page options
                              </span>
                              <button
                                type="button"
                                onClick={() => applySize({ mode: 'fill' })}
                                className={`h-[32px] px-2 rounded-[6px] text-left text-xs border transition-colors cursor-pointer ${
                                  activeBlock?.kind === 'fill'
                                    ? 'border-blue bg-blue/10 text-blue font-semibold'
                                    : 'text-ink hover:bg-surface border-line'
                                }`}
                              >
                                Fill page (trim edges)
                              </button>
                              <button
                                type="button"
                                onClick={() => applySize({ mode: 'width' })}
                                className={`h-[32px] px-2 rounded-[6px] text-left text-xs border transition-colors cursor-pointer ${
                                  activeBlock?.kind === 'width'
                                    ? 'border-blue bg-blue/10 text-blue font-semibold'
                                    : 'text-ink hover:bg-surface border-line'
                                }`}
                              >
                                Fit width (long pictures)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Collage Change layout button */}
                    {isCollageBlock && (
                      <button
                        type="button"
                        onClick={() => activeBlock && setEditingBlockLayoutId(activeBlock.id)}
                        className="w-full h-[40px] px-3 rounded-[8px] border border-line bg-surface hover:border-blue text-xs font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                      >
                        Change layout
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* 5. HOW MANY? (Visible whenever activeRow exists and not multi-selecting) */}
              {activeRow && selectedIds.length < 2 && (
                <div className="p-3 border-b border-line flex flex-col gap-2.5">
                  <h2 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                    How many?
                  </h2>

                  <div className="flex items-center gap-2">
                    {/* Stepper */}
                    <div className="flex items-center border border-line rounded-[8px] bg-paper overflow-hidden flex-1 h-[40px]">
                      <button
                        type="button"
                        onClick={() => handleQtyStep(-1)}
                        className="w-10 h-full flex items-center justify-center text-ink hover:bg-surface border-r border-line cursor-pointer select-none font-bold"
                        aria-label="Decrease quantity"
                      >
                        -
                      </button>
                      <input
                        key={`${activeRow.assetId}-${activeRow.qty}-${activeRow.fillPage ? 'fill' : 'normal'}`}
                        type="number"
                        min={1}
                        max={500}
                        defaultValue={activeRow.qty}
                        onBlur={(e) => handleQtyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleQtyInput((e.target as HTMLInputElement).value);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="w-full h-full text-center text-sm font-semibold text-ink bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        aria-label="Quantity"
                      />
                      <button
                        type="button"
                        onClick={() => handleQtyStep(1)}
                        className="w-10 h-full flex items-center justify-center text-ink hover:bg-surface border-l border-line cursor-pointer select-none font-bold"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    {/* Fill page toggle button */}
                    <button
                      type="button"
                      onClick={handleToggleFillPage}
                      aria-pressed={activeRow.fillPage ?? false}
                      className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                        activeRow.fillPage
                          ? 'border-blue bg-blue/10 text-blue font-semibold'
                          : 'border-line bg-paper text-ink hover:border-blue/50'
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                    >
                      Fill page
                    </button>
                  </div>
                </div>
              )}

              {/* 6. ALIGN */}
              <div className="p-3 border-b border-line flex flex-col gap-2.5">
                <h2 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                  Align
                </h2>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isAlignDisabled}
                    onClick={() => handleAlign('left')}
                    className="h-[40px] px-2 rounded-[8px] border border-line bg-paper text-ink hover:border-blue/50 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    disabled={isAlignDisabled}
                    onClick={() => handleAlign('center')}
                    className="h-[40px] px-2 rounded-[8px] border border-line bg-paper text-ink hover:border-blue/50 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    disabled={isAlignDisabled}
                    onClick={() => handleAlign('right')}
                    className="h-[40px] px-2 rounded-[8px] border border-line bg-paper text-ink hover:border-blue/50 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                  >
                    Right
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isAlignDisabled}
                    onClick={() => handleAlign('top')}
                    className="h-[40px] px-2 rounded-[8px] border border-line bg-paper text-ink hover:border-blue/50 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                  >
                    Top
                  </button>
                  <button
                    type="button"
                    disabled={isAlignDisabled}
                    onClick={() => handleAlign('middle')}
                    className="h-[40px] px-2 rounded-[8px] border border-line bg-paper text-ink hover:border-blue/50 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                  >
                    Middle
                  </button>
                  <button
                    type="button"
                    disabled={isAlignDisabled}
                    onClick={() => handleAlign('bottom')}
                    className="h-[40px] px-2 rounded-[8px] border border-line bg-paper text-ink hover:border-blue/50 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                  >
                    Bottom
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
