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
import { useSessionStore, getJobAssetIds } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { PAPERS } from '@/lib/constants/papers';
import { Tooltip } from '@/components/ui/Tooltip';
import { unitToMm } from '@/lib/units';
import { importFiles } from '@/lib/importImages';
import { SIZE_PRESETS } from '@/lib/constants/sizePresets';
import { ImageAsset } from '@/types';
import { nanoid } from 'nanoid';

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

interface QuickSet {
  id: string;
  label: string;
  size: {
    id: string;
    wMm: number;
    hMm: number;
  };
  qty: number;
  isBuiltIn?: boolean;
}

function formatQuickSetLabel(
  size: { id: string; wMm: number; hMm: number },
  qty: number
): string {
  const preset =
    SIZE_PRESETS.find((p) => p.id === size.id) ||
    MORE_SIZE_PRESETS.find((p) => p.id === size.id);
  const sizeName =
    preset?.name ||
    (size.id.startsWith('custom-')
      ? `${Math.round(size.wMm)}x${Math.round(size.hMm)}`
      : size.id);
  return `${sizeName} \u00D7 ${qty}`;
}

function createBuiltInQuickSet(
  id: string,
  size: { id: string; wMm: number; hMm: number },
  qty: number
): QuickSet {
  return {
    id,
    label: formatQuickSetLabel(size, qty),
    size,
    qty,
    isBuiltIn: true,
  };
}

const BUILT_IN_QUICK_SETS: QuickSet[] = [
  createBuiltInQuickSet('builtin-1x1-6', { id: '1x1', wMm: 25.4, hMm: 25.4 }, 6),
  createBuiltInQuickSet('builtin-2x2-4', { id: '2x2', wMm: 50.8, hMm: 50.8 }, 4),
  createBuiltInQuickSet('builtin-wallet-8', { id: 'wallet', wMm: 63.5, hMm: 88.9 }, 8),
];

function loadCustomQuickSets(): QuickSet[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('azpr-quicksets');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 8).map((item) => ({
        id: String(item.id || nanoid()),
        label: String(item.label || ''),
        size: {
          id: String(item.size?.id || 'custom'),
          wMm: Number(item.size?.wMm) || 50,
          hMm: Number(item.size?.hMm) || 50,
        },
        qty: Math.max(1, Math.min(500, Number(item.qty) || 1)),
        isBuiltIn: false,
      }));
    }
  } catch {
    // Storage blocked or invalid
  }
  return [];
}

function saveCustomQuickSets(customSets: QuickSet[]) {
  if (typeof window === 'undefined') return;
  try {
    const toStore = customSets.slice(0, 8).map((s) => ({
      id: s.id,
      label: s.label,
      size: {
        id: s.size.id,
        wMm: s.size.wMm,
        hMm: s.size.hMm,
      },
      qty: s.qty,
    }));
    localStorage.setItem('azpr-quicksets', JSON.stringify(toStore));
  } catch {
    // Storage blocked
  }
}

export function Sidebar() {
  const {
    jobs,
    activeJobId,
    assets,
    setActiveJob,
    addJob,
    removeJob,
    removeAsset,
    deleteAllJobPictures,
    setJobPaper,
    setJobOrientation,
    setBorderless,
    setPictureSize,
    setPictureQty,
    setPictureFillPage,
    setPictureSizeAndQty,
    addBlocks,
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
    isAllSelected,
    toggleSelectAll,
    activePageId,
    openConfirmModal,
    setLayoutMode,
    setDocFit,
    setActivePage,
    select,
    clearSelection,
    setMultiImport,
    setDraggingAssetId,
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

  const jobPictureAssetIds = React.useMemo(() => {
    if (!activeJob) return [];
    return getJobAssetIds(activeJob);
  }, [activeJob]);

  const jobPicturesCount = jobPictureAssetIds.length;

  const jobAssets = React.useMemo(() => {
    return jobPictureAssetIds
      .map((id) => assets.find((a) => a.id === id))
      .filter((a): a is ImageAsset => Boolean(a));
  }, [assets, jobPictureAssetIds]);

  const handlePictureClick = (assetId: string) => {
    if (!activeJob) return;
    const isStart = !activeJob.pages.some((p) => p.elements && p.elements.length > 0);

    if (isStart) {
      const res = addBlocks(activeJob.id, [
        { kind: 'fit', assetIds: [assetId] },
      ]);
      if (res.ok) {
        setLayoutMode('document');
        setDocFit('fit-page');
        setActiveAssetId(assetId);
        if (res.firstPageId) {
          setActivePage(res.firstPageId);
          const updatedJob = useSessionStore
            .getState()
            .jobs.find((j) => j.id === activeJob.id);
          const page = updatedJob?.pages.find((p) => p.id === res.firstPageId);
          const el = page?.elements.find((e) => e.assetId === assetId) || page?.elements[0];
          if (page && el) {
            select({ pageId: page.id, elementId: el.id });
          }
        }
      }
    } else {
      setActiveAssetId(assetId);
      const pageWithElement = activeJob.pages.find((p) =>
        p.elements.some((el) => el.assetId === assetId)
      );
      if (pageWithElement) {
        const el = pageWithElement.elements.find((e) => e.assetId === assetId);
        if (el) {
          select({ pageId: pageWithElement.id, elementId: el.id });
          setActivePage(pageWithElement.id);
        }
      } else {
        clearSelection();
      }
    }
  };

  const handleAllClick = () => {
    if (!activeJob) return;
    const isStart = !activeJob.pages.some((p) => p.elements && p.elements.length > 0);

    if (isStart) {
      if (jobPicturesCount >= 2) {
        const batchAssetIds = [...jobPictureAssetIds];
        setMultiImport({
          step: 'arrange',
          batchAssetIds,
          cards: batchAssetIds.map((id) => ({
            id: nanoid(),
            assetIds: [id],
          })),
          layoutStepIndex: 0,
          chosenLayouts: {},
          isReAdd: true,
        });
      } else if (jobPicturesCount === 1) {
        handlePictureClick(jobPictureAssetIds[0]);
      }
    } else {
      toggleSelectAll();
    }
  };

  const handleDeleteAllPictures = () => {
    if (!activeJob || jobPicturesCount === 0) return;
    openConfirmModal({
      title: 'Delete all',
      accentWord: 'pictures?',
      message: 'This removes them from every page.',
      confirmLabel: 'Delete all',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: () => {
        deleteAllJobPictures(activeJob.id);
      },
    });
  };

  const targetAssetIds: string[] = React.useMemo(() => {
    if (isAllSelected) {
      return jobPictureAssetIds;
    }
    if (selectedIds.length >= 2 && selectedPageId && activeJob) {
      const page = activeJob.pages.find((p) => p.id === selectedPageId);
      if (page) {
        return Array.from(
          new Set(
            page.elements
              .filter((el) => selectedIds.includes(el.id))
              .map((el) => el.assetId)
              .filter((id): id is string => Boolean(id))
          )
        );
      }
    }
    if (activeAssetId) {
      return [activeAssetId];
    }
    return [];
  }, [isAllSelected, jobPictureAssetIds, selectedIds, selectedPageId, activeJob, activeAssetId]);

  const placedElements = React.useMemo(() => {
    if (!activeJob || targetAssetIds.length === 0) return [];
    return activeJob.pages
      .flatMap((p) => p.elements)
      .filter((el) => el.assetId && targetAssetIds.includes(el.assetId));
  }, [activeJob, targetAssetIds]);

  const isPlaced = placedElements.length > 0;

  // Active asset, block, and sheet row lookup
  const activeAsset = assets.find((a) => a.id === activeAssetId);
  const activeBlock = isPlaced && activeAsset
    ? activeJob?.blocks.find((b) => b.assetIds.includes(activeAsset.id))
    : (isPlaced && targetAssetIds.length > 0
        ? activeJob?.blocks.find((b) => b.assetIds.some((id) => targetAssetIds.includes(id)))
        : null);

  const activeRow = isPlaced
    ? ((activeAsset && activeBlock?.kind === 'sheet'
        ? activeBlock.rows?.find((r) => r.assetId === activeAsset.id)
        : undefined) ||
      (targetAssetIds.length > 0
        ? activeJob?.blocks.find((b) => b.kind === 'sheet')?.rows?.find((r) => targetAssetIds.includes(r.assetId))
        : undefined))
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
    if (!activeJob || targetAssetIds.length === 0) return;
    const res = setPictureSize(activeJob.id, targetAssetIds, spec);
    if (res === 'needs-confirm') {
      openConfirmModal({
        title: 'Reset manual',
        accentWord: 'changes?',
        message: 'Applying this size will rearrange pictures on the page.',
        confirmLabel: 'Reset and apply',
        destructive: true,
        onConfirm: () => {
          setPictureSize(activeJob.id, targetAssetIds, spec, { force: true });
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
    if (!activeJob || targetAssetIds.length === 0) return;
    const parsed = parseInt(val, 10);
    const clamped = Math.min(500, Math.max(1, isNaN(parsed) ? (activeRow?.qty ?? 1) : parsed));
    const res = setPictureQty(activeJob.id, targetAssetIds, clamped);
    if (res === 'needs-confirm') {
      openConfirmModal({
        title: 'Reset manual',
        accentWord: 'changes?',
        message: 'Changing quantity will rearrange pictures on the page.',
        confirmLabel: 'Reset and apply',
        destructive: true,
        onConfirm: () => {
          setPictureQty(activeJob.id, targetAssetIds, clamped, { force: true });
        },
      });
    }
  };

  const handleQtyStep = (delta: number) => {
    if (!activeJob || targetAssetIds.length === 0) return;
    const currentQty = activeRow?.qty ?? 1;
    const nextQty = Math.min(500, Math.max(1, currentQty + delta));
    const res = setPictureQty(activeJob.id, targetAssetIds, nextQty);
    if (res === 'needs-confirm') {
      openConfirmModal({
        title: 'Reset manual',
        accentWord: 'changes?',
        message: 'Changing quantity will rearrange pictures on the page.',
        confirmLabel: 'Reset and apply',
        destructive: true,
        onConfirm: () => {
          setPictureQty(activeJob.id, targetAssetIds, nextQty, { force: true });
        },
      });
    }
  };

  const handleToggleFillPage = () => {
    if (!activeJob || targetAssetIds.length === 0) return;
    const nextFill = !(activeRow?.fillPage ?? false);
    const res = setPictureFillPage(activeJob.id, targetAssetIds, nextFill);
    if (res === 'needs-confirm') {
      openConfirmModal({
        title: 'Reset manual',
        accentWord: 'changes?',
        message: 'Filling the page will rearrange pictures on the page.',
        confirmLabel: 'Reset and fill',
        destructive: true,
        onConfirm: () => {
          setPictureFillPage(activeJob.id, targetAssetIds, nextFill, { force: true });
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

  const uniformSizeId = React.useMemo(() => {
    if (!isPlaced || placedElements.length === 0 || !activeJob) return null;

    const sizeIds = placedElements.map((el) => {
      const page = activeJob.pages.find((p) => p.elements.some((e) => e.id === el.id));
      const block = page?.blockId ? activeJob.blocks.find((b) => b.id === page.blockId) : null;
      if (block) {
        if (block.kind === 'fit') return 'default';
        if (block.kind === 'fill') return 'fill';
        if (block.kind === 'width') return 'width';
        if (block.kind === 'sheet') {
          const row = block.rows?.find((r) => r.assetId === el.assetId);
          if (row?.size?.id) return row.size.id;
        }
      }
      if (Math.abs(el.wMm - 25.4) < 1 && Math.abs(el.hMm - 25.4) < 1) return '1x1';
      if (Math.abs(el.wMm - 38.1) < 1 && Math.abs(el.hMm - 38.1) < 1) return '1.5x1.5';
      if (Math.abs(el.wMm - 50.8) < 1 && Math.abs(el.hMm - 50.8) < 1) return '2x2';
      if (
        (Math.abs(el.wMm - 63.5) < 1 && Math.abs(el.hMm - 88.9) < 1) ||
        (Math.abs(el.wMm - 88.9) < 1 && Math.abs(el.hMm - 63.5) < 1)
      ) {
        return 'wallet';
      }
      return `custom-${Math.round(el.wMm)}x${Math.round(el.hMm)}`;
    });

    const first = sizeIds[0];
    const allSame = sizeIds.every((s) => s === first);
    return allSame ? first : null;
  }, [isPlaced, placedElements, activeJob]);

  const isDefaultActive = !isCollageBlock && uniformSizeId === 'default';
  const is1x1Active = !isCollageBlock && uniformSizeId === '1x1';
  const is15Active = !isCollageBlock && uniformSizeId === '1.5x1.5';
  const is2x2Active = !isCollageBlock && uniformSizeId === '2x2';
  const isWalletActive = !isCollageBlock && uniformSizeId === 'wallet';
  const isMoreActive =
    !isCollageBlock &&
    uniformSizeId !== null &&
    !['default', '1x1', '1.5x1.5', '2x2', 'wallet'].includes(uniformSizeId);

  const [customQuickSets, setCustomQuickSets] = useState<QuickSet[]>(() => loadCustomQuickSets());

  const allQuickSets = React.useMemo(() => {
    return [...BUILT_IN_QUICK_SETS, ...customQuickSets];
  }, [customQuickSets]);

  const applyQuickSet = (chip: QuickSet) => {
    if (!activeJob || targetAssetIds.length === 0) return;
    const res = setPictureSizeAndQty(activeJob.id, targetAssetIds, chip.size, chip.qty);
    if (res === 'needs-confirm') {
      openConfirmModal({
        title: 'Reset manual',
        accentWord: 'changes?',
        message: 'Applying this quick set will rearrange pictures on the page.',
        confirmLabel: 'Reset and apply',
        destructive: true,
        onConfirm: () => {
          setPictureSizeAndQty(activeJob.id, targetAssetIds, chip.size, chip.qty, { force: true });
        },
      });
    }
  };

  const isSaveFull = customQuickSets.length >= 8;
  const isSaveDisabled =
    isSaveFull ||
    targetAssetIds.length === 0 ||
    !isPlaced ||
    !activeRow ||
    isDefaultActive ||
    activeBlock?.kind === 'fit';

  const handleSaveQuickSet = () => {
    if (isSaveDisabled || !activeRow) return;
    const label = formatQuickSetLabel(activeRow.size, activeRow.qty);
    const newChip: QuickSet = {
      id: nanoid(),
      label,
      size: { ...activeRow.size },
      qty: activeRow.qty,
      isBuiltIn: false,
    };
    const nextList = [...customQuickSets, newChip].slice(0, 8);
    setCustomQuickSets(nextList);
    saveCustomQuickSets(nextList);
  };

  const handleDeleteCustomQuickSet = (id: string) => {
    const nextList = customQuickSets.filter((s) => s.id !== id);
    setCustomQuickSets(nextList);
    saveCustomQuickSets(nextList);
  };

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

            {/* 2 equal buttons Portrait and Landscape */}
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
                <span>Portrait</span>
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
                <span>Landscape</span>
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
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint">
                Pictures
              </h2>
              {jobPicturesCount >= 1 && (
                <button
                  type="button"
                  onClick={handleDeleteAllPictures}
                  className="text-[11.5px] font-bold text-red hover:underline bg-transparent cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue rounded"
                >
                  Delete all
                </button>
              )}
            </div>

            {jobAssets.length === 0 ? (
              <div className="flex items-center gap-2 py-3 px-3 rounded-[14px] bg-surface2 border border-line text-xs text-muted mb-2.5">
                <ImageIcon className="w-4 h-4 shrink-0 text-faint" />
                <span>No pictures added yet.</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mb-2.5">
                {jobAssets.map((asset) => {
                  const isActive = asset.id === activeAssetId;
                  return (
                    <div
                      key={asset.id}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-azpr-asset', asset.id);
                        e.dataTransfer.setData('text/plain', asset.id);
                        e.dataTransfer.effectAllowed = 'copy';
                        setDraggingAssetId(asset.id);

                        // Ghost under cursor: 56px, 80% opacity, non-animated
                        const ghost = document.createElement('div');
                        ghost.style.position = 'fixed';
                        ghost.style.top = '-9999px';
                        ghost.style.left = '-9999px';
                        ghost.style.width = '56px';
                        ghost.style.height = '56px';
                        ghost.style.borderRadius = '14px';
                        ghost.style.overflow = 'hidden';
                        ghost.style.opacity = '0.8';
                        ghost.style.pointerEvents = 'none';
                        ghost.style.zIndex = '99999';

                        const img = document.createElement('img');
                        img.src = asset.objectUrl;
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        ghost.appendChild(img);

                        document.body.appendChild(ghost);
                        e.dataTransfer.setDragImage(ghost, 28, 28);

                        setTimeout(() => {
                          ghost.remove();
                        }, 0);
                      }}
                      onDragEnd={() => {
                        setDraggingAssetId(null);
                        useUiStore.getState().setDropTargetPageId(null);
                        useUiStore.getState().setIsHoveringAddPage(false);
                      }}
                      onClick={() => handlePictureClick(asset.id)}
                      className={`group relative w-[56px] h-[56px] rounded-[14px] overflow-hidden bg-surface2 cursor-pointer transition-all ${
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
                {jobPicturesCount >= 2 && (
                  <button
                    type="button"
                    onClick={handleAllClick}
                    aria-label={isAllSelected ? 'Deselect all pictures' : 'Select all pictures'}
                    className={`w-[56px] h-[56px] rounded-[14px] flex items-center justify-center font-bold text-xs transition-all cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue ${
                      isAllSelected
                        ? 'border-2 border-blue bg-blue-tint text-blue shadow-xs'
                        : 'border-[1.5px] border-line hover:border-line2 bg-surface2 text-ink'
                    }`}
                  >
                    All
                  </button>
                )}
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

            {!activeAsset && targetAssetIds.length === 0 ? (
              <div className="flex items-center gap-2 py-3 px-3 rounded-[14px] bg-surface2 border border-line text-xs text-muted">
                <MousePointerClick className="w-4 h-4 shrink-0 text-faint" />
                <span>Pick a picture to change its size.</span>
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

                {/* Quick sets */}
                <div className="flex flex-col mt-3.5 pt-3 border-t border-line">
                  <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2">
                    Quick sets
                  </h3>
                  <div className="flex flex-wrap gap-2 items-center">
                    {allQuickSets.map((chip) => (
                      <div key={chip.id} className="group relative inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => applyQuickSet(chip)}
                          className={`h-[32px] px-3 rounded-[12px] border-[1.5px] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue ${
                            isPlaced && uniformSizeId === chip.size.id && (activeRow?.qty ?? placedElements.length) === chip.qty
                              ? 'border-blue bg-blue-tint text-blue'
                              : 'border-line bg-surface2 text-ink hover:border-line2'
                          }`}
                        >
                          <span>{chip.label}</span>
                        </button>
                        {!chip.isBuiltIn && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCustomQuickSet(chip.id);
                            }}
                            aria-label={`Remove ${chip.label}`}
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-surface2 border border-line hover:border-red hover:bg-red hover:text-white text-muted flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity cursor-pointer focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      disabled={isSaveDisabled}
                      title={isSaveFull ? 'Remove one first' : undefined}
                      onClick={handleSaveQuickSet}
                      className="h-[32px] px-3 rounded-[12px] border-[1.5px] border-dashed border-line bg-surface2 text-ink hover:text-blue hover:border-blue text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none disabled:hover:text-ink disabled:hover:border-line select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* HOW MANY? Section */}
          {targetAssetIds.length > 0 && (
            <div className="flex flex-col shrink-0">
              <h2 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2.5">
                How many?
              </h2>

              <div className="flex items-center gap-2">
                {/* 48px Stepper */}
                <div className="h-[48px] flex items-center border-[1.5px] border-line rounded-[12px] bg-surface2 overflow-hidden flex-1">
                  <button
                    type="button"
                    disabled={!isPlaced}
                    onClick={() => handleQtyStep(-1)}
                    className="w-12 h-full flex items-center justify-center text-ink hover:bg-surface border-r border-line cursor-pointer select-none font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <input
                    key={`${targetAssetIds.join('-')}-${isPlaced ? (activeRow?.qty ?? placedElements.length) : 'unplaced'}-${isPlaced && activeRow?.fillPage ? 'fill' : 'normal'}`}
                    type="number"
                    min={1}
                    max={500}
                    disabled={!isPlaced}
                    defaultValue={isPlaced ? (activeRow?.qty ?? placedElements.length) : 1}
                    onBlur={(e) => isPlaced && handleQtyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isPlaced) {
                        handleQtyInput((e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className={`w-full h-full text-center font-heading font-extrabold text-[22px] bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      isPlaced ? 'text-ink' : 'text-faint opacity-60'
                    }`}
                    aria-label="Quantity"
                  />
                  <button
                    type="button"
                    disabled={!isPlaced}
                    onClick={() => handleQtyStep(1)}
                    className="w-12 h-full flex items-center justify-center text-ink hover:bg-surface border-l border-line cursor-pointer select-none font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                {/* Fill page toggle button */}
                <button
                  type="button"
                  disabled={!isPlaced}
                  onClick={handleToggleFillPage}
                  aria-pressed={Boolean(isPlaced && activeRow?.fillPage)}
                  className={`h-[48px] px-3.5 rounded-[12px] border-[1.5px] text-xs font-semibold transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                    isPlaced && activeRow?.fillPage
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
