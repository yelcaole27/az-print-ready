import { create } from 'zustand';
import type { Job, ImageAsset, PageElement, PictureTarget, CheckNoticeState } from '@/types';

export interface CropModalState {
  jobId: string;
  target: PictureTarget;
  asset: ImageAsset;
  element?: PageElement;
  initialCropRect?: { x: number; y: number; w: number; h: number };
  isSizedVariant: boolean;
  sizeName?: string;
}

export type ZoomMode = 'fit-page' | 'fit-width' | 'custom';
export type AppTheme = 'light' | 'dark' | 'system';
export type FitMode = 'cover' | 'contain';
export type LayoutMode = 'sheet' | 'document';
export type DocFitMode = 'fit-page' | 'fill-page' | 'fill-width';
export type DocAlign = 'top' | 'center';

export interface UiMessage {
  type: 'info' | 'warn' | 'error';
  text: string;
}

export interface MultiImportCard {
  id: string;
  assetIds: string[];
}

export interface MultiImportState {
  step: 'arrange' | 'layout';
  batchAssetIds: string[];
  cards: MultiImportCard[];
  layoutStepIndex: number;
  chosenLayouts: Record<string, 'best' | 'grid' | 'column' | 'row'>;
  isReAdd?: boolean;
}

export interface ConfirmModalState {
  title: string;
  accentWord?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface UiState {
  zoom: number;
  zoomMode: ZoomMode;
  showMargins: boolean;
  activePageId: string | null;
  theme: AppTheme;
  sidebarCollapsed: boolean;

  // Asset and Selection
  activeAssetId: string | null;
  selected: { pageId: string; elementId: string } | null;
  selectedIds: string[];
  selectedPageId: string | null;
  isAllSelected: boolean;
  groupDraft: { pageId: string; dxMm: number; dyMm: number } | null;

  // Layout Mode
  layoutMode: LayoutMode;

  // Document Placement Form State
  docFit: DocFitMode;

  // Transient Guides and Controls
  guides: { axis: 'x' | 'y'; posMm: number }[];
  dropTargetPageId: string | null;
  draggingAssetId: string | null;
  isHoveringAddPage: boolean;
  aspectLock: boolean;

  // TipTap Editor Integration
  activeEditor: unknown | null;
  editingElement: { pageId: string; elementId: string } | null;

  // Text overflow tracking
  overflowIds: Set<string>;

  // Phase 7 Print and Export State
  outputMode: null | 'print' | 'export';
  outputJob: Job | null;
  outputPageIndexes: number[];
  exportProgress: { done: number; total: number } | null;
  checkNotice: CheckNoticeState | null;
  assetSrcOverrides: Record<string, string> | null;

  // Multi-image import flow
  multiImport: MultiImportState | null;

  // Collage Block Layout Modal
  editingBlockLayoutId: string | null;

  // Settings Modal
  isSettingsOpen: boolean;

  // Confirm Modal
  confirmModal: ConfirmModalState | null;

  // Back-to-back print chooser
  printChooser: { action: 'print' | 'export' | 'testSheet' } | null;

  // Crop modal
  cropModal: CropModalState | null;

  // Inline Message Banner
  message: UiMessage | null;

  setEditingBlockLayoutId: (id: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
  openConfirmModal: (conf: ConfirmModalState) => void;
  closeConfirmModal: () => void;
  openPrintChooser: (action: 'print' | 'export' | 'testSheet') => void;
  closePrintChooser: () => void;
  openCropModal: (modal: CropModalState) => void;
  closeCropModal: () => void;

  setMultiImport: (
    val:
      | MultiImportState
      | null
      | ((prev: MultiImportState | null) => MultiImportState | null)
  ) => void;
  setOverflow: (elementId: string, isOverflow: boolean) => void;
  setOutputMode: (mode: null | 'print' | 'export') => void;
  setOutputTarget: (job: any | null, pageIndexes: number[]) => void;
  setExportProgress: (progress: { done: number; total: number } | null) => void;
  setCheckNotice: (notice: CheckNoticeState | null) => void;
  setAssetSrcOverrides: (overrides: Record<string, string> | null) => void;

  setZoom: (zoom: number) => void;
  setZoomMode: (mode: ZoomMode) => void;
  toggleMargins: () => void;
  setActivePage: (id: string | null) => void;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  initTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  setActiveAssetId: (id: string | null) => void;
  select: (sel: { pageId: string; elementId: string } | null) => void;
  setSelection: (pageId: string, ids: string[]) => void;
  clearSelection: () => void;
  setIsAllSelected: (val: boolean) => void;
  toggleSelectAll: () => void;
  setGroupDraft: (draft: { pageId: string; dxMm: number; dyMm: number } | null) => void;

  setGuides: (guides: { axis: 'x' | 'y'; posMm: number }[]) => void;
  clearGuides: () => void;
  setDropTargetPageId: (id: string | null) => void;
  setDraggingAssetId: (id: string | null) => void;
  setIsHoveringAddPage: (hovering: boolean) => void;
  setAspectLock: (lock: boolean) => void;
  toggleAspectLock: () => void;

  setLayoutMode: (mode: LayoutMode) => void;

  setDocFit: (fit: DocFitMode) => void;

  setActiveEditor: (editor: unknown | null) => void;
  setEditingElement: (editing: { pageId: string; elementId: string } | null) => void;

  setMessage: (msg: UiMessage | null) => void;
}

function applyThemeToDom(theme: AppTheme) {
  if (typeof window === 'undefined') return;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
}

let mediaQueryList: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;
let messageTimeout: NodeJS.Timeout | null = null;

function setupSystemThemeListener(active: boolean) {
  if (typeof window === 'undefined') return;
  if (mediaQueryList && mediaListener) {
    mediaQueryList.removeEventListener('change', mediaListener);
    mediaListener = null;
  }
  if (active) {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    mediaListener = (e: MediaQueryListEvent) => {
      document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
    };
    mediaQueryList.addEventListener('change', mediaListener);
  }
}

function getStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = localStorage.getItem('azpr-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return 'dark';
}

export const useUiStore = create<UiState>((set) => ({
  zoom: 1,
  zoomMode: 'fit-page',
  showMargins: true,
  activePageId: null,
  theme: 'dark',
  sidebarCollapsed: false,

  activeAssetId: null,
  selected: null,
  selectedIds: [],
  selectedPageId: null,
  isAllSelected: false,
  groupDraft: null,

  layoutMode: 'sheet',

  docFit: 'fit-page',

  guides: [],
  dropTargetPageId: null,
  draggingAssetId: null,
  isHoveringAddPage: false,
  aspectLock: true,

  activeEditor: null,
  editingElement: null,

  overflowIds: new Set<string>(),
  outputMode: null,
  outputJob: null,
  outputPageIndexes: [],
  exportProgress: null,
  checkNotice: null,
  assetSrcOverrides: null,
  multiImport: null,
  editingBlockLayoutId: null,
  isSettingsOpen: false,
  confirmModal: null,
  printChooser: null,
  cropModal: null,

  message: null,

  setEditingBlockLayoutId: (id: string | null) => {
    set({ editingBlockLayoutId: id });
  },

  setSettingsOpen: (open: boolean) => {
    set({ isSettingsOpen: open });
  },

  openConfirmModal: (conf: ConfirmModalState) => {
    set({ confirmModal: conf });
  },

  closeConfirmModal: () => {
    set({ confirmModal: null });
  },

  openPrintChooser: (action: 'print' | 'export' | 'testSheet') => {
    set({ printChooser: { action } });
  },

  closePrintChooser: () => {
    set({ printChooser: null });
  },

  openCropModal: (target) => {
    set({ cropModal: target });
  },

  closeCropModal: () => {
    set({ cropModal: null });
  },

  setZoom: (zoom: number) => {
    const clamped = Math.min(4, Math.max(0.25, Math.round(zoom * 100) / 100));
    set({ zoom: clamped, zoomMode: 'custom' });
  },

  setZoomMode: (mode: ZoomMode) => {
    set({ zoomMode: mode });
  },

  toggleMargins: () => {
    set((state) => ({ showMargins: !state.showMargins }));
  },

  setActivePage: (id: string | null) => {
    set({ activePageId: id });
  },

  setTheme: (theme: AppTheme) => {
    set({ theme });
    try {
      localStorage.setItem('azpr-theme', theme);
    } catch {
      // Ignore storage errors
    }
    applyThemeToDom(theme);
    setupSystemThemeListener(theme === 'system');
  },

  toggleTheme: () => {
    const current = getStoredTheme();
    // In light mode (or system when resolving to light), toggle to dark; otherwise toggle to light
    const isDark = typeof document !== 'undefined'
      ? document.documentElement.dataset.theme === 'dark'
      : current === 'dark';
    const nextTheme: AppTheme = isDark ? 'light' : 'dark';
    set({ theme: nextTheme });
    try {
      localStorage.setItem('azpr-theme', nextTheme);
    } catch {
      // Ignore storage errors
    }
    applyThemeToDom(nextTheme);
    setupSystemThemeListener(false);
  },

  initTheme: () => {
    const initialTheme = getStoredTheme();
    set({ theme: initialTheme });
    applyThemeToDom(initialTheme);
    setupSystemThemeListener(initialTheme === 'system');
  },

  setSidebarCollapsed: (collapsed: boolean) => {
    set({ sidebarCollapsed: collapsed });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  setActiveAssetId: (id: string | null) => {
    set({ activeAssetId: id, isAllSelected: false });
  },

  setIsAllSelected: (val: boolean) => {
    set({ isAllSelected: val });
  },

  toggleSelectAll: () => {
    set((state) => ({
      isAllSelected: !state.isAllSelected,
      selected: null,
      selectedIds: [],
      selectedPageId: null,
      activeAssetId: null,
    }));
  },

  select: (sel: { pageId: string; elementId: string } | null) => {
    set({
      selected: sel,
      selectedIds: [],
      selectedPageId: null,
      groupDraft: null,
      isAllSelected: false,
    });
  },

  setSelection: (pageId: string, ids: string[]) => {
    if (ids.length === 0) {
      set({
        selected: null,
        selectedIds: [],
        selectedPageId: null,
        groupDraft: null,
        isAllSelected: false,
      });
    } else if (ids.length === 1) {
      set({
        selected: { pageId, elementId: ids[0] },
        selectedIds: [],
        selectedPageId: null,
        groupDraft: null,
        isAllSelected: false,
      });
    } else {
      set({
        selected: null,
        selectedIds: ids,
        selectedPageId: pageId,
        groupDraft: null,
        isAllSelected: false,
      });
    }
  },

  clearSelection: () => {
    set({
      selected: null,
      selectedIds: [],
      selectedPageId: null,
      groupDraft: null,
      isAllSelected: false,
    });
  },

  setGroupDraft: (draft: { pageId: string; dxMm: number; dyMm: number } | null) => {
    set({ groupDraft: draft });
  },

  setGuides: (guides: { axis: 'x' | 'y'; posMm: number }[]) => {
    set({ guides });
  },

  clearGuides: () => {
    set({ guides: [], dropTargetPageId: null, isHoveringAddPage: false });
  },

  setDropTargetPageId: (id: string | null) => {
    set({ dropTargetPageId: id });
  },

  setDraggingAssetId: (id: string | null) => {
    set({ draggingAssetId: id });
  },

  setIsHoveringAddPage: (hovering: boolean) => {
    set({ isHoveringAddPage: hovering });
  },

  setAspectLock: (lock: boolean) => {
    set({ aspectLock: lock });
  },

  toggleAspectLock: () => {
    set((state) => ({ aspectLock: !state.aspectLock }));
  },

  setLayoutMode: (mode: LayoutMode) => {
    set({ layoutMode: mode });
  },

  setDocFit: (fit: DocFitMode) => {
    set({ docFit: fit });
  },

  setActiveEditor: (editor: unknown | null) => {
    set({ activeEditor: editor });
  },

  setEditingElement: (editing: { pageId: string; elementId: string } | null) => {
    set({ editingElement: editing });
  },

  setMultiImport: (val) => {
    set((state) => ({
      multiImport:
        typeof val === 'function' ? val(state.multiImport) : val,
    }));
  },

  setOverflow: (elementId: string, isOverflow: boolean) => {
    set((state) => {
      const next = new Set(state.overflowIds);
      if (isOverflow) {
        next.add(elementId);
      } else {
        next.delete(elementId);
      }
      return { overflowIds: next };
    });
  },

  setOutputMode: (mode: null | 'print' | 'export') => {
    if (mode === null) {
      set({ outputMode: null, outputJob: null, outputPageIndexes: [] });
    } else {
      set({ outputMode: mode });
    }
  },

  setOutputTarget: (job: any | null, pageIndexes: number[]) => {
    set({ outputJob: job, outputPageIndexes: pageIndexes });
  },

  setExportProgress: (progress: { done: number; total: number } | null) => {
    set({ exportProgress: progress });
  },

  setCheckNotice: (notice: { action: 'print' | 'export'; lines: string[] } | null) => {
    set({ checkNotice: notice });
  },

  setAssetSrcOverrides: (overrides: Record<string, string> | null) => {
    set({ assetSrcOverrides: overrides });
  },

  setMessage: (msg: UiMessage | null) => {
    if (messageTimeout) {
      clearTimeout(messageTimeout);
      messageTimeout = null;
    }
    set({ message: msg });
    if (msg) {
      messageTimeout = setTimeout(() => {
        set({ message: null });
      }, 6000);
    }
  },
}));
