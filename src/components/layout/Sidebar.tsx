'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Menu, Plus, X, ChevronDown, ArrowLeftRight } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { PAPERS } from '@/lib/constants/papers';
import { Toggle } from '@/components/ui/Toggle';
import { Tooltip } from '@/components/ui/Tooltip';
import { Unit } from '@/types';
import { unitToMm } from '@/lib/units';
import { LeftToolbar } from './LeftToolbar';

interface SizePreset {
  id: string;
  name: string;
  wMm: number;
  hMm: number;
}

const MORE_PAPERS = ['legal', 'a3', 'a5', '4r', '5r'];

const SHEET_SIZE_PRESETS: SizePreset[] = [
  { id: '1x1', name: '1x1 in', wMm: 25.4, hMm: 25.4 },
  { id: '2x2', name: '2x2 in', wMm: 50.8, hMm: 50.8 },
  { id: 'wallet', name: 'Wallet', wMm: 63.5, hMm: 88.9 },
  { id: 'passport', name: 'Passport (35x45 mm)', wMm: 35, hMm: 45 },
  { id: '3r', name: '3R (3.5x5 in)', wMm: 88.9, hMm: 127 },
  { id: '4r', name: '4R (4x6 in)', wMm: 101.6, hMm: 152.4 },
  { id: '5r', name: '5R (5x7 in)', wMm: 127, hMm: 177.8 },
  { id: '6r', name: '6R (6x8 in)', wMm: 152.4, hMm: 203.2 },
  { id: '8r', name: '8R (8x10 in)', wMm: 203.2, hMm: 254 },
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
    setUnit,
    setBorderless,
    setBlockSize,
    updateBlock,
    detachCollagePicture,
    hasManualEdits,
  } = useSessionStore();

  const {
    sidebarCollapsed,
    toggleSidebar,
    activeAssetId,
    setActiveAssetId,
    setEditingBlockLayoutId,
  } = useUiStore();

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const firstPage = activeJob?.pages[0];
  const currentUnit = activeJob?.settings.unit || 'in';

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

  // Active asset and block lookup
  const activeAsset = assets.find((a) => a.id === activeAssetId);
  const activeBlock = activeAsset
    ? activeJob?.blocks.find((b) => b.assetIds.includes(activeAsset.id))
    : null;

  const isCollageBlock = Boolean(
    activeBlock && (activeBlock.kind === 'collage' || activeBlock.assetIds.length > 1)
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
      | { mode: 'fit' | 'fill' | 'width' }
      | {
          mode: 'sheet';
          size: { id: string; wMm: number; hMm: number };
          qty?: number;
          fillPage?: boolean;
          crop?: boolean;
        }
  ) => {
    if (!activeJob || !activeAssetId) return;
    const res = setBlockSize(activeJob.id, activeAssetId, spec);
    if (res === 'needs-confirm') {
      if (window.confirm('Reset your manual changes?')) {
        setBlockSize(activeJob.id, activeAssetId, spec, { force: true });
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
      mode: 'sheet',
      size: { id: `custom-${Math.round(wMm)}x${Math.round(hMm)}`, wMm, hMm },
    });
  };

  const handleSwapCustom = () => {
    setCustomW(customH);
    setCustomH(customW);
  };

  const handleQtyStep = (delta: number) => {
    if (!activeJob || !activeBlock || activeBlock.kind !== 'sheet') return;
    const currentQty = activeBlock.qty ?? 1;
    const nextQty = Math.min(500, Math.max(1, currentQty + delta));
    updateBlock(activeJob.id, activeBlock.id, { qty: nextQty, fillPage: false });
  };

  const handleQtyInput = (val: string) => {
    if (!activeJob || !activeBlock || activeBlock.kind !== 'sheet') return;
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.min(500, Math.max(1, parsed));
      updateBlock(activeJob.id, activeBlock.id, { qty: clamped, fillPage: false });
    }
  };

  const handleToggleFillPage = () => {
    if (!activeJob || !activeBlock || activeBlock.kind !== 'sheet') return;
    updateBlock(activeJob.id, activeBlock.id, { fillPage: !activeBlock.fillPage });
  };

  const unitOptions = [
    { value: 'mm' as Unit, label: 'mm' },
    { value: 'cm' as Unit, label: 'cm' },
    { value: 'in' as Unit, label: 'in' },
  ];

  const isStartState = !activeJob?.pages.some((p) => p.elements.length > 0);
  const currentPaperId = firstPage?.paperId || 'letter';
  const isMorePaperActive = MORE_PAPERS.includes(currentPaperId);

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
              </div>

              {/* 3. PICTURES */}
              <div className="p-3 border-b border-line flex flex-col gap-2.5">
                <h2 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                  Pictures
                </h2>

                {assets.length === 0 ? (
                  <p className="text-xs text-muted">No pictures added</p>
                ) : (
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
              </div>

              {/* 4. SIZE */}
              <div className="p-3 border-b border-line flex flex-col gap-2.5">
                <h2 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                  Size
                </h2>

                {!activeAsset ? (
                  <p className="text-xs text-muted">Pick a picture.</p>
                ) : isOnFreePage ? (
                  <p className="text-xs text-muted">Placed by hand.</p>
                ) : isCollageBlock ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted">This picture shares a page.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => activeBlock && setEditingBlockLayoutId(activeBlock.id)}
                        className="h-[40px] px-3 flex-1 rounded-[8px] border border-line bg-surface hover:border-blue text-xs font-medium cursor-pointer transition-colors"
                      >
                        Change layout
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          activeBlock &&
                          detachCollagePicture(activeJob.id, activeBlock.id, activeAsset.id)
                        }
                        className="h-[40px] px-3 flex-1 rounded-[8px] border border-line bg-surface hover:border-blue text-xs font-medium cursor-pointer transition-colors"
                      >
                        Own page
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Big Size Chips */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => applySize({ mode: 'fit' })}
                        className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                          activeBlock?.kind === 'fit'
                            ? 'border-blue bg-blue/10 text-blue font-semibold'
                            : 'border-line bg-paper text-ink hover:border-blue/50'
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                      >
                        Full page
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          applySize({
                            mode: 'sheet',
                            size: { id: '1x1', wMm: 25.4, hMm: 25.4 },
                          })
                        }
                        className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                          activeBlock?.kind === 'sheet' && activeBlock.size?.id === '1x1'
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
                            mode: 'sheet',
                            size: { id: '2x2', wMm: 50.8, hMm: 50.8 },
                          })
                        }
                        className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                          activeBlock?.kind === 'sheet' && activeBlock.size?.id === '2x2'
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
                            mode: 'sheet',
                            size: { id: 'wallet', wMm: 63.5, hMm: 88.9 },
                          })
                        }
                        className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                          activeBlock?.kind === 'sheet' && activeBlock.size?.id === 'wallet'
                            ? 'border-blue bg-blue/10 text-blue font-semibold'
                            : 'border-line bg-paper text-ink hover:border-blue/50'
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                      >
                        Wallet
                      </button>
                    </div>

                    {/* More Sizes Popover Button */}
                    <div className="relative" ref={sizeMoreRef}>
                      <button
                        type="button"
                        onClick={() => setSizeMoreOpen(!sizeMoreOpen)}
                        className={`w-full h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border flex items-center justify-between ${
                          activeBlock &&
                          activeBlock.kind !== 'fit' &&
                          !(
                            activeBlock.kind === 'sheet' &&
                            ['1x1', '2x2', 'wallet'].includes(activeBlock.size?.id || '')
                          )
                            ? 'border-blue bg-blue/10 text-blue font-semibold'
                            : 'border-line bg-paper text-ink hover:border-blue/50'
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                      >
                        <span>More sizes</span>
                        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                      </button>

                      {sizeMoreOpen && (
                        <div className="absolute top-[44px] right-0 left-0 bg-paper border border-line rounded-[8px] shadow-lg p-2.5 z-30 flex flex-col gap-2 max-h-80 overflow-y-auto">
                          {/* Presets */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                              Presets
                            </span>
                            <div className="grid grid-cols-2 gap-1">
                              {SHEET_SIZE_PRESETS.slice(3).map((preset) => (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() =>
                                    applySize({
                                      mode: 'sheet',
                                      size: preset,
                                    })
                                  }
                                  className="h-[32px] px-2 rounded-[6px] text-left text-xs text-ink hover:bg-surface border border-line transition-colors truncate"
                                  title={preset.name}
                                >
                                  {preset.name}
                                </button>
                              ))}
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
                              className="h-[32px] px-2 rounded-[6px] text-left text-xs text-ink hover:bg-surface border border-line transition-colors"
                            >
                              Fill page (trim edges)
                            </button>
                            <button
                              type="button"
                              onClick={() => applySize({ mode: 'width' })}
                              className="h-[32px] px-2 rounded-[6px] text-left text-xs text-ink hover:bg-surface border border-line transition-colors"
                            >
                              Fit width (long pictures)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 5. HOW MANY? (Visible only when block kind is 'sheet') */}
              {activeBlock && activeBlock.kind === 'sheet' && (
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
                        type="number"
                        min={1}
                        max={500}
                        value={activeBlock.qty ?? 1}
                        onChange={(e) => handleQtyInput(e.target.value)}
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
                      className={`h-[40px] px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer border ${
                        activeBlock.fillPage
                          ? 'border-blue bg-blue/10 text-blue font-semibold'
                          : 'border-line bg-paper text-ink hover:border-blue/50'
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                    >
                      Fill page
                    </button>
                  </div>
                </div>
              )}

              {/* 8. More options (collapsed <details>) */}
              <div className="p-3">
                <details className="group">
                  <summary className="text-[12px] font-semibold text-muted uppercase tracking-wider cursor-pointer select-none py-1 flex items-center justify-between">
                    <span>More options</span>
                    <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                  </summary>

                  <div className="mt-2.5 flex flex-col gap-3">
                    {/* Units */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted font-medium">Units</label>
                      <Toggle
                        options={unitOptions}
                        value={currentUnit}
                        onChange={(val) => setUnit(val)}
                        aria-label="Select measurement unit"
                        className="w-full h-9"
                      />
                    </div>

                    {/* Legacy LeftToolbar */}
                    <div className="border-t border-line pt-2">
                      <LeftToolbar />
                    </div>
                  </div>
                </details>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
