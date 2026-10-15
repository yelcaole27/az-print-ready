'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Plus,
  X,
  ChevronDown,
  ArrowLeftRight,
  MoreHorizontal,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  MousePointerClick,
  Hand,
  Image as ImageIcon,
} from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { PAPERS } from '@/lib/constants/papers';
import { Tooltip } from '@/components/ui/Tooltip';
import { unitToMm } from '@/lib/units';
import { importFiles } from '@/lib/importImages';

function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <div className="h-[38px] flex items-center justify-between select-none">
      <span className="text-xs font-semibold text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-[42px] h-[24px] rounded-[12px] p-[2px] transition-colors relative cursor-pointer border-[1.5px] ${
          checked ? 'bg-blue border-blue' : 'bg-transparent border-line2'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
      >
        <span
          className={`block w-[16px] h-[16px] rounded-full transition-transform ${
            checked ? 'translate-x-[18px] bg-white' : 'translate-x-0 bg-faint'
          }`}
        />
      </button>
    </div>
  );
}

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
    openConfirmModal,
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
  const [jobsMenuOpen, setJobsMenuOpen] = useState(false);
  const [paperMoreOpen, setPaperMoreOpen] = useState(false);
  const [sizeMoreOpen, setSizeMoreOpen] = useState(false);

  // Custom size form state in More Sizes
  const [customW, setCustomW] = useState('4');
  const [customH, setCustomH] = useState('6');

  const jobsMenuRef = useRef<HTMLDivElement>(null);
  const paperMoreRef = useRef<HTMLDivElement>(null);
  const sizeMoreRef = useRef<HTMLDivElement>(null);

  // Close popovers on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (jobsMenuRef.current && !jobsMenuRef.current.contains(e.target as Node)) {
        setJobsMenuOpen(false);
      }
      if (paperMoreRef.current && !paperMoreRef.current.contains(e.target as Node)) {
        setPaperMoreOpen(false);
      }
      if (sizeMoreRef.current && !sizeMoreRef.current.contains(e.target as Node)) {
        setSizeMoreOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setJobsMenuOpen(false);
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
      openConfirmModal({
        title: 'Reset manual',
        accentWord: 'changes?',
        message: 'Changing paper size will rearrange pictures on the page.',
        confirmLabel: 'Reset and change',
        destructive: true,
        onConfirm: () => {
          setJobPaper(activeJob.id, newPaperId);
          setPaperMoreOpen(false);
        },
      });
      return;
    }
    setJobPaper(activeJob.id, newPaperId);
    setPaperMoreOpen(false);
  };

  const handleOrientationChange = (newOrientation: 'portrait' | 'landscape') => {
    if (!activeJob || !firstPage || newOrientation === firstPage.orientation) return;
    if (hasManualEdits(activeJob.id)) {
      openConfirmModal({
        title: 'Reset manual',
        accentWord: 'changes?',
        message: 'Changing orientation will rearrange pictures on the page.',
        confirmLabel: 'Reset and turn',
        destructive: true,
        onConfirm: () => {
          setJobOrientation(activeJob.id, newOrientation);
        },
      });
      return;
    }
    setJobOrientation(activeJob.id, newOrientation);
  };

  const handleCloseJob = (e: React.MouseEvent, job: typeof jobs[0]) => {
    e.stopPropagation();
    if (jobs.length <= 1) return;

    const hasElements = job.pages.some((p) => p.elements && p.elements.length > 0);
    if (hasElements) {
      openConfirmModal({
        title: 'Close this',
        accentWord: 'job?',
        message: 'Unsaved changes in this job will be lost.',
        confirmLabel: 'Close job',
        destructive: true,
        onConfirm: () => {
          removeJob(job.id);
        },
      });
      return;
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
      openConfirmModal({
        title: 'Reset manual',
        accentWord: 'changes?',
        message: 'Applying this size will rearrange pictures on the page.',
        confirmLabel: 'Reset and apply',
        destructive: true,
        onConfirm: () => {
          setPictureSize(activeJob.id, activeAssetId, spec, { force: true });
        },
      });
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
        openConfirmModal({
          title: 'Reset manual',
          accentWord: 'changes?',
          message: 'Changing quantity will rearrange pictures on the page.',
          confirmLabel: 'Reset and apply',
          destructive: true,
          onConfirm: () => {
            setPictureQty(activeJob.id, activeAsset.id, clamped, { force: true });
          },
        });
      }
    }
  };

  const handleQtyStep = (delta: number) => {
    if (!activeJob || !activeAsset || !activeRow) return;
    const nextQty = Math.min(500, Math.max(1, activeRow.qty + delta));
    const res = setPictureQty(activeJob.id, activeAsset.id, nextQty);
    if (res === 'needs-confirm') {
      openConfirmModal({
        title: 'Reset manual',
        accentWord: 'changes?',
        message: 'Changing quantity will rearrange pictures on the page.',
        confirmLabel: 'Reset and apply',
        destructive: true,
        onConfirm: () => {
          setPictureQty(activeJob.id, activeAsset.id, nextQty, { force: true });
        },
      });
    }
  };

  const handleToggleFillPage = () => {
    if (!activeJob || !activeAsset || !activeRow) return;
    const nextFill = !activeRow.fillPage;
    const res = setPictureFillPage(activeJob.id, activeAsset.id, nextFill);
    if (res === 'needs-confirm') {
      openConfirmModal({
        title: 'Reset manual',
        accentWord: 'changes?',
        message: 'Filling the page will rearrange pictures on the page.',
        confirmLabel: 'Reset and fill',
        destructive: true,
        onConfirm: () => {
          setPictureFillPage(activeJob.id, activeAsset.id, nextFill, { force: true });
        },
      });
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

  const isAlignDisabled = !activeJob || !hasSelectedElements;

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
      className={`shrink-0 bg-surface border-r border-line flex flex-col transition-[width] duration-150 ease-in-out select-none overflow-hidden ${
        sidebarCollapsed ? 'w-[64px] p-3 gap-3' : 'w-[300px] p-5 gap-[22px] overflow-y-auto'
      }`}
    >
      {sidebarCollapsed ? (
        <div className="flex flex-col items-center gap-3">
          <Tooltip content="Expand sidebar">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              className="w-10 h-10 flex items-center justify-center rounded-[12px] text-ink hover:bg-surface2 border-[1.5px] border-line transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              <Menu className="w-5 h-5" />
            </button>
          </Tooltip>
          <Tooltip content="New job">
            <button
              type="button"
              onClick={addJob}
              aria-label="New job"
              className="w-10 h-10 flex items-center justify-center rounded-[12px] text-ink hover:text-blue hover:bg-surface2 border-[1.5px] border-dashed border-line transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              <Plus className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>
      ) : (
        <>
          {/* Top Row: Hamburger, Job-Name Pill, + New Job */}
          <div className="flex items-center gap-2 relative shrink-0">
            <Tooltip content="Collapse sidebar">
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
                className="w-10 h-10 flex items-center justify-center rounded-[12px] text-ink hover:bg-surface2 border-[1.5px] border-line transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <Menu className="w-5 h-5" />
              </button>
            </Tooltip>

            <div className="relative flex-1 min-w-0" ref={jobsMenuRef}>
              <button
                type="button"
                onClick={() => setJobsMenuOpen(!jobsMenuOpen)}
                className="w-full h-10 px-3 flex items-center justify-between gap-1.5 rounded-[12px] border-[1.5px] border-blue bg-blue-tint text-blue font-bold text-xs cursor-pointer hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  <span className="w-2 h-2 rounded-full bg-blue shrink-0" />
                  <span className="truncate">{activeJob?.name || 'Untitled'}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
              </button>

              {jobsMenuOpen && (
                <div className="absolute top-[44px] left-0 right-0 bg-surface border border-line rounded-[12px] shadow-lg p-1.5 z-40 flex flex-col gap-1 max-h-56 overflow-y-auto">
                  {jobs.map((job) => {
                    const isActive = job.id === activeJobId;
                    const canClose = jobs.length > 1;
                    return (
                      <div
                        key={job.id}
                        onClick={() => {
                          setActiveJob(job.id);
                          setJobsMenuOpen(false);
                        }}
                        className={`group flex items-center justify-between h-[36px] px-2.5 rounded-[8px] cursor-pointer text-xs transition-colors ${
                          isActive
                            ? 'bg-blue-tint font-bold text-blue'
                            : 'text-ink hover:bg-surface2'
                        }`}
                      >
                        <span className="truncate pr-2">{job.name}</span>
                        {canClose && (
                          <button
                            type="button"
                            onClick={(e) => handleCloseJob(e, job)}
                            aria-label={`Close ${job.name}`}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-red hover:bg-line rounded-[4px] transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Tooltip content="New job">
              <button
                type="button"
                onClick={addJob}
                aria-label="New job"
                className="w-10 h-10 flex items-center justify-center rounded-[12px] text-ink hover:text-blue hover:bg-surface2 border-[1.5px] border-dashed border-line transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <Plus className="w-5 h-5" />
              </button>
            </Tooltip>
          </div>

          {/* PAPER Section */}
          <div className="flex flex-col shrink-0">
            <h2 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2.5">
              Paper
            </h2>

            {/* 4 chips in one row */}
            <div className="grid grid-cols-4 gap-1.5 mb-2.5">
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
                    className={`h-[40px] rounded-[12px] border-[1.5px] text-xs font-semibold transition-all cursor-pointer flex items-center justify-center ${
                      isSelected
                        ? 'border-blue bg-blue-tint text-blue'
                        : 'border-line bg-surface2 text-ink hover:border-line2'
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                  >
                    {p.label}
                  </button>
                );
              })}

              {/* More Paper chip with popover */}
              <div className="relative" ref={paperMoreRef}>
                <button
                  type="button"
                  onClick={() => setPaperMoreOpen(!paperMoreOpen)}
                  className={`w-full h-[40px] px-1 rounded-[12px] border-[1.5px] text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-0.5 ${
                    isMorePaperActive
                      ? 'border-blue bg-blue-tint text-blue'
                      : 'border-line bg-surface2 text-ink hover:border-line2'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                >
                  <span className="truncate">
                    {isMorePaperActive
                      ? PAPERS.find((p) => p.id === currentPaperId)?.name || 'More'
                      : 'More'}
                  </span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>

                {paperMoreOpen && (
                  <div className="absolute top-[44px] right-0 left-[-60px] bg-surface border border-line rounded-[12px] shadow-lg p-1.5 z-40 flex flex-col gap-1">
                    {MORE_PAPERS.map((pid) => {
                      const p = PAPERS.find((x) => x.id === pid);
                      if (!p) return null;
                      const isSelected = currentPaperId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handlePaperChange(p.id)}
                          className={`h-[36px] px-2.5 rounded-[8px] text-left text-xs font-medium cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue text-white font-semibold'
                              : 'text-ink hover:bg-surface2'
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

            {/* 2 equal buttons Upright and Sideways */}
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <button
                type="button"
                onClick={() => handleOrientationChange('portrait')}
                className={`h-[40px] px-3 rounded-[12px] border-[1.5px] text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  firstPage?.orientation === 'portrait'
                    ? 'border-blue bg-blue-tint text-blue'
                    : 'border-line bg-surface2 text-ink hover:border-line2'
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
              >
                <div className="w-3 h-4 border-[1.5px] border-current rounded-[2px]" />
                <span>Upright</span>
              </button>
              <button
                type="button"
                onClick={() => handleOrientationChange('landscape')}
                className={`h-[40px] px-3 rounded-[12px] border-[1.5px] text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  firstPage?.orientation === 'landscape'
                    ? 'border-blue bg-blue-tint text-blue'
                    : 'border-line bg-surface2 text-ink hover:border-line2'
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
              >
                <div className="w-4 h-3 border-[1.5px] border-current rounded-[2px]" />
                <span>Sideways</span>
              </button>
            </div>

            {/* Two switch rows */}
            <div className="flex flex-col">
              <Switch
                label="No white border"
                checked={activeJob?.settings.borderless ?? false}
                onChange={(checked) => setBorderless(activeJob.id, checked)}
                id="switch-borderless"
              />
              <Switch
                label="Cut lines"
                checked={activeJob?.settings.cutStyle !== 'none'}
                onChange={(checked) => {
                  if (!activeJob) return;
                  const nextCutStyle = checked
                    ? activeJob.settings.cutStyle === 'ticks'
                      ? 'ticks'
                      : 'outline'
                    : 'none';
                  updateSettings(activeJob.id, { cutStyle: nextCutStyle });
                }}
                id="switch-cutlines"
              />
            </div>
          </div>

          {/* PICTURES Section */}
          <div className="flex flex-col shrink-0">
            <h2 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2.5">
              Pictures
            </h2>

            {assets.length === 0 ? (
              <div className="flex items-center gap-2 py-3 px-3 rounded-[14px] bg-surface2 border border-line text-xs text-muted mb-2.5">
                <ImageIcon className="w-4 h-4 shrink-0 text-faint" />
                <span>No pictures added yet.</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-[10px] mb-2.5">
                {assets.map((asset) => {
                  const isActive = asset.id === activeAssetId;
                  return (
                    <div
                      key={asset.id}
                      onClick={() => setActiveAssetId(asset.id)}
                      className={`group relative w-[62px] h-[62px] rounded-[14px] overflow-hidden bg-surface2 cursor-pointer transition-all ${
                        isActive
                          ? 'border-2 border-blue shadow-xs'
                          : 'border-[1.5px] border-line hover:border-line2'
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
                          openConfirmModal({
                            title: 'Delete this',
                            accentWord: 'picture?',
                            message: 'This will remove the picture from your pages and project.',
                            confirmLabel: 'Delete',
                            destructive: true,
                            onConfirm: () => {
                              removeAsset(asset.id);
                              if (activeAssetId === asset.id) {
                                setActiveAssetId(null);
                              }
                            },
                          });
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
              className="w-full h-[44px] flex items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-dashed border-line hover:border-blue bg-surface2 text-ink hover:text-blue text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              <Plus className="w-4 h-4" />
              <span>Add pictures</span>
            </button>
          </div>

          {/* SIZE Section */}
          <div className="flex flex-col shrink-0">
            <h2 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2.5">
              Size
            </h2>

            {!activeAsset || selectedIds.length >= 2 ? (
              <div className="flex items-center gap-2 py-3 px-3 rounded-[14px] bg-surface2 border border-line text-xs text-muted">
                <MousePointerClick className="w-4 h-4 shrink-0 text-faint" />
                <span>Pick a picture to change its size.</span>
              </div>
            ) : isOnFreePage ? (
              <div className="flex items-center gap-2 py-3 px-3 rounded-[14px] bg-surface2 border border-line text-xs text-muted">
                <Hand className="w-4 h-4 shrink-0 text-faint" />
                <span>Placed by hand on the page.</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {/* Default */}
                  <button
                    type="button"
                    onClick={() => applySize({ mode: 'default' })}
                    className={`h-[76px] rounded-[12px] border-[1.5px] flex flex-col items-center justify-center gap-1.5 p-2 transition-all cursor-pointer ${
                      isDefaultActive
                        ? 'border-blue bg-blue-tint text-blue'
                        : 'border-line bg-surface2 text-ink hover:border-line2'
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                  >
                    <div
                      className={`w-[18px] h-[22px] rounded-[2px] border-[1.5px] border-dashed ${
                        isDefaultActive ? 'border-blue bg-blue/20' : 'border-faint'
                      }`}
                    />
                    <span className="text-[11px] font-semibold tracking-tight">Default</span>
                  </button>

                  {/* 1x1 */}
                  <button
                    type="button"
                    onClick={() =>
                      applySize({
                        mode: 'size',
                        size: { id: '1x1', wMm: 25.4, hMm: 25.4 },
                      })
                    }
                    className={`h-[76px] rounded-[12px] border-[1.5px] flex flex-col items-center justify-center gap-1.5 p-2 transition-all cursor-pointer ${
                      is1x1Active
                        ? 'border-blue bg-blue-tint text-blue'
                        : 'border-line bg-surface2 text-ink hover:border-line2'
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                  >
                    <div
                      className={`w-[13px] h-[13px] rounded-[2px] ${
                        is1x1Active ? 'bg-blue border border-blue' : 'border border-faint'
                      }`}
                    />
                    <span className="text-[11px] font-semibold tracking-tight">1x1</span>
                  </button>

                  {/* 1.5x1.5 */}
                  <button
                    type="button"
                    onClick={() =>
                      applySize({
                        mode: 'size',
                        size: { id: '1.5x1.5', wMm: 38.1, hMm: 38.1 },
                      })
                    }
                    className={`h-[76px] rounded-[12px] border-[1.5px] flex flex-col items-center justify-center gap-1.5 p-2 transition-all cursor-pointer ${
                      is15Active
                        ? 'border-blue bg-blue-tint text-blue'
                        : 'border-line bg-surface2 text-ink hover:border-line2'
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                  >
                    <div
                      className={`w-[18px] h-[18px] rounded-[2px] ${
                        is15Active ? 'bg-blue border border-blue' : 'border border-faint'
                      }`}
                    />
                    <span className="text-[11px] font-semibold tracking-tight">1.5x1.5</span>
                  </button>

                  {/* 2x2 */}
                  <button
                    type="button"
                    onClick={() =>
                      applySize({
                        mode: 'size',
                        size: { id: '2x2', wMm: 50.8, hMm: 50.8 },
                      })
                    }
                    className={`h-[76px] rounded-[12px] border-[1.5px] flex flex-col items-center justify-center gap-1.5 p-2 transition-all cursor-pointer ${
                      is2x2Active
                        ? 'border-blue bg-blue-tint text-blue'
                        : 'border-line bg-surface2 text-ink hover:border-line2'
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                  >
                    <div
                      className={`w-[24px] h-[24px] rounded-[2px] ${
                        is2x2Active ? 'bg-blue border border-blue' : 'border border-faint'
                      }`}
                    />
                    <span className="text-[11px] font-semibold tracking-tight">2x2</span>
                  </button>

                  {/* Wallet */}
                  <button
                    type="button"
                    onClick={() =>
                      applySize({
                        mode: 'size',
                        size: { id: 'wallet', wMm: 63.5, hMm: 88.9 },
                      })
                    }
                    className={`h-[76px] rounded-[12px] border-[1.5px] flex flex-col items-center justify-center gap-1.5 p-2 transition-all cursor-pointer ${
                      isWalletActive
                        ? 'border-blue bg-blue-tint text-blue'
                        : 'border-line bg-surface2 text-ink hover:border-line2'
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                  >
                    <div
                      className={`w-[17px] h-[24px] rounded-[2px] ${
                        isWalletActive ? 'bg-blue border border-blue' : 'border border-faint'
                      }`}
                    />
                    <span className="text-[11px] font-semibold tracking-tight">Wallet</span>
                  </button>

                  {/* More */}
                  <div className="relative" ref={sizeMoreRef}>
                    <button
                      type="button"
                      onClick={() => setSizeMoreOpen(!sizeMoreOpen)}
                      className={`w-full h-[76px] rounded-[12px] border-[1.5px] flex flex-col items-center justify-center gap-1.5 p-2 transition-all cursor-pointer ${
                        isMoreActive
                          ? 'border-blue bg-blue-tint text-blue'
                          : 'border-line bg-surface2 text-ink hover:border-line2'
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                    >
                      <MoreHorizontal className="w-5 h-5 text-current" />
                      <span className="text-[11px] font-semibold tracking-tight">More</span>
                    </button>

                    {sizeMoreOpen && (
                      <div className="absolute top-[80px] right-0 w-[240px] bg-surface border border-line rounded-[12px] shadow-lg p-3 z-40 flex flex-col gap-2.5 max-h-80 overflow-y-auto">
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
                                  className={`h-[32px] px-2 rounded-[8px] text-left text-xs border transition-colors truncate cursor-pointer ${
                                    isSelected
                                      ? 'border-blue bg-blue-tint text-blue font-semibold'
                                      : 'text-ink hover:bg-surface2 border-line'
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
                              className="w-14 h-8 px-1.5 text-xs rounded-[6px] border border-line bg-surface2 text-ink text-center"
                              placeholder="W"
                            />
                            <span className="text-xs text-muted">x</span>
                            <input
                              type="number"
                              step="any"
                              min={0.1}
                              value={customH}
                              onChange={(e) => setCustomH(e.target.value)}
                              className="w-14 h-8 px-1.5 text-xs rounded-[6px] border border-line bg-surface2 text-ink text-center"
                              placeholder="H"
                            />
                            <button
                              type="button"
                              onClick={handleSwapCustom}
                              title="Swap width and height"
                              className="w-8 h-8 flex items-center justify-center rounded-[6px] border border-line text-muted hover:text-ink cursor-pointer"
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={handleApplyCustomSize}
                              className="flex-1 h-8 px-2 rounded-[6px] bg-blue text-white text-xs font-semibold cursor-pointer"
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
                            className={`h-[32px] px-2 rounded-[8px] text-left text-xs border transition-colors cursor-pointer ${
                              activeBlock?.kind === 'fill'
                                ? 'border-blue bg-blue-tint text-blue font-semibold'
                                : 'text-ink hover:bg-surface2 border-line'
                            }`}
                          >
                            Fill page (trim edges)
                          </button>
                          <button
                            type="button"
                            onClick={() => applySize({ mode: 'width' })}
                            className={`h-[32px] px-2 rounded-[8px] text-left text-xs border transition-colors cursor-pointer ${
                              activeBlock?.kind === 'width'
                                ? 'border-blue bg-blue-tint text-blue font-semibold'
                                : 'text-ink hover:bg-surface2 border-line'
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
                    className="w-full h-[40px] mt-2 px-3 rounded-[12px] border-[1.5px] border-line bg-surface2 hover:border-blue text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                  >
                    Change layout
                  </button>
                )}
              </>
            )}
          </div>

          {/* HOW MANY? Section */}
          {activeRow && selectedIds.length < 2 && (
            <div className="flex flex-col shrink-0">
              <h2 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2.5">
                How many?
              </h2>

              <div className="flex items-center gap-2">
                {/* 48px Stepper */}
                <div className="h-[48px] flex items-center border-[1.5px] border-line rounded-[12px] bg-surface2 overflow-hidden flex-1">
                  <button
                    type="button"
                    onClick={() => handleQtyStep(-1)}
                    className="w-12 h-full flex items-center justify-center text-ink hover:bg-surface border-r border-line cursor-pointer select-none font-bold text-lg"
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
                    className="w-full h-full text-center font-heading font-extrabold text-[22px] text-ink bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    aria-label="Quantity"
                  />
                  <button
                    type="button"
                    onClick={() => handleQtyStep(1)}
                    className="w-12 h-full flex items-center justify-center text-ink hover:bg-surface border-l border-line cursor-pointer select-none font-bold text-lg"
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
                  className={`h-[48px] px-3.5 rounded-[12px] border-[1.5px] text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                    activeRow.fillPage
                      ? 'border-blue bg-blue-tint text-blue'
                      : 'border-line bg-surface2 text-ink hover:border-line2'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                >
                  Fill page
                </button>
              </div>
            </div>
          )}

          {/* ALIGN Section */}
          <div className="flex flex-col shrink-0">
            <h2 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2.5">
              Align
            </h2>

            <div className="grid grid-cols-3 gap-2 mb-2">
              <button
                type="button"
                disabled={isAlignDisabled}
                onClick={() => handleAlign('left')}
                className="h-[40px] px-2 rounded-[12px] border-[1.5px] border-line bg-surface2 text-ink hover:border-line2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <AlignLeft className="w-4 h-4 shrink-0" />
                <span>Left</span>
              </button>
              <button
                type="button"
                disabled={isAlignDisabled}
                onClick={() => handleAlign('center')}
                className="h-[40px] px-2 rounded-[12px] border-[1.5px] border-line bg-surface2 text-ink hover:border-line2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <AlignCenter className="w-4 h-4 shrink-0" />
                <span>Center</span>
              </button>
              <button
                type="button"
                disabled={isAlignDisabled}
                onClick={() => handleAlign('right')}
                className="h-[40px] px-2 rounded-[12px] border-[1.5px] border-line bg-surface2 text-ink hover:border-line2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <AlignRight className="w-4 h-4 shrink-0" />
                <span>Right</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isAlignDisabled}
                onClick={() => handleAlign('top')}
                className="h-[40px] px-2 rounded-[12px] border-[1.5px] border-line bg-surface2 text-ink hover:border-line2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <AlignStartVertical className="w-4 h-4 shrink-0" />
                <span>Top</span>
              </button>
              <button
                type="button"
                disabled={isAlignDisabled}
                onClick={() => handleAlign('middle')}
                className="h-[40px] px-2 rounded-[12px] border-[1.5px] border-line bg-surface2 text-ink hover:border-line2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <AlignCenterVertical className="w-4 h-4 shrink-0" />
                <span>Middle</span>
              </button>
              <button
                type="button"
                disabled={isAlignDisabled}
                onClick={() => handleAlign('bottom')}
                className="h-[40px] px-2 rounded-[12px] border-[1.5px] border-line bg-surface2 text-ink hover:border-line2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <AlignEndVertical className="w-4 h-4 shrink-0" />
                <span>Bottom</span>
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
