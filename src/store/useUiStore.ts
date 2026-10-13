import { create } from 'zustand';

export type ZoomMode = 'fit-page' | 'fit-width' | 'custom';
export type AppTheme = 'light' | 'dark' | 'system';
export type SizeMode = 'preset' | 'custom';
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

  // Layout Mode
  layoutMode: LayoutMode;

  // Sheet Placement Form State
  sizeMode: SizeMode;
  presetId: string;
  customWMm: number;
  customHMm: number;
  qty: number;
  fit: FitMode;
  matchOrientation: boolean;
  allowRotate: boolean;

  // Document Placement Form State
  docFit: DocFitMode;
  docAutoRotate: boolean;
  docEdgeToEdge: boolean;
  docAlign: DocAlign;
  docCopies: number;

  // Transient Guides and Controls
  guides: { axis: 'x' | 'y'; posMm: number }[];
  aspectLock: boolean;

  // TipTap Editor Integration
  activeEditor: unknown | null;
  editingElement: { pageId: string; elementId: string } | null;

  // Text overflow tracking
  overflowIds: Set<string>;

  // Phase 7 Print and Export State
  outputMode: null | 'print' | 'export';
  exportProgress: { done: number; total: number } | null;
  checkNotice: { action: 'print' | 'export'; lines: string[] } | null;

  // Multi-image import flow
  multiImport: MultiImportState | null;

  // Collage Block Layout Modal
  editingBlockLayoutId: string | null;

  // Inline Message Banner
  message: UiMessage | null;

  setEditingBlockLayoutId: (id: string | null) => void;

  setMultiImport: (
    val:
      | MultiImportState
      | null
      | ((prev: MultiImportState | null) => MultiImportState | null)
  ) => void;
  setOverflow: (elementId: string, isOverflow: boolean) => void;
  setOutputMode: (mode: null | 'print' | 'export') => void;
  setExportProgress: (progress: { done: number; total: number } | null) => void;
  setCheckNotice: (notice: { action: 'print' | 'export'; lines: string[] } | null) => void;

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
  clearSelection: () => void;

  setGuides: (guides: { axis: 'x' | 'y'; posMm: number }[]) => void;
  clearGuides: () => void;
  setAspectLock: (lock: boolean) => void;
  toggleAspectLock: () => void;

  setLayoutMode: (mode: LayoutMode) => void;

  setSizeMode: (mode: SizeMode) => void;
  setPresetId: (id: string) => void;
  setCustomWMm: (w: number) => void;
  setCustomHMm: (h: number) => void;
  swapCustomDimensions: () => void;
  setQty: (qty: number) => void;
  setFit: (fit: FitMode) => void;
  setMatchOrientation: (val: boolean) => void;
  setAllowRotate: (val: boolean) => void;

  setDocFit: (fit: DocFitMode) => void;
  setDocAutoRotate: (val: boolean) => void;
  setDocEdgeToEdge: (val: boolean) => void;
  setDocAlign: (align: DocAlign) => void;
  setDocCopies: (copies: number) => void;

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
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem('azpr-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return 'system';
}

export const useUiStore = create<UiState>((set) => ({
  zoom: 1,
  zoomMode: 'fit-page',
  showMargins: true,
  activePageId: null,
  theme: 'system',
  sidebarCollapsed: false,

  activeAssetId: null,
  selected: null,

  layoutMode: 'sheet',

  sizeMode: 'preset',
  presetId: 'wallet',
  customWMm: 50.8,
  customHMm: 76.2,
  qty: 1,
  fit: 'cover',
  matchOrientation: true,
  allowRotate: true,

  docFit: 'fit-page',
  docAutoRotate: true,
  docEdgeToEdge: false,
  docAlign: 'center',
  docCopies: 1,

  guides: [],
  aspectLock: true,

  activeEditor: null,
  editingElement: null,

  overflowIds: new Set<string>(),
  outputMode: null,
  exportProgress: null,
  checkNotice: null,
  multiImport: null,
  editingBlockLayoutId: null,

  message: null,

  setEditingBlockLayoutId: (id: string | null) => {
    set({ editingBlockLayoutId: id });
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
    set({ activeAssetId: id });
  },

  select: (sel: { pageId: string; elementId: string } | null) => {
    set({ selected: sel });
  },

  clearSelection: () => {
    set({ selected: null });
  },

  setGuides: (guides: { axis: 'x' | 'y'; posMm: number }[]) => {
    set({ guides });
  },

  clearGuides: () => {
    set({ guides: [] });
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

  setSizeMode: (mode: SizeMode) => {
    set({ sizeMode: mode });
  },

  setPresetId: (id: string) => {
    set({ presetId: id });
  },

  setCustomWMm: (w: number) => {
    set({ customWMm: Math.max(1, w) });
  },

  setCustomHMm: (h: number) => {
    set({ customHMm: Math.max(1, h) });
  },

  swapCustomDimensions: () => {
    set((state) => ({
      customWMm: state.customHMm,
      customHMm: state.customWMm,
    }));
  },

  setQty: (qty: number) => {
    const clamped = Math.min(500, Math.max(1, Math.round(qty) || 1));
    set({ qty: clamped });
  },

  setFit: (fit: FitMode) => {
    set({ fit });
  },

  setMatchOrientation: (val: boolean) => {
    set({ matchOrientation: val });
  },

  setAllowRotate: (val: boolean) => {
    set({ allowRotate: val });
  },

  setDocFit: (fit: DocFitMode) => {
    set({ docFit: fit });
  },

  setDocAutoRotate: (val: boolean) => {
    set({ docAutoRotate: val });
  },

  setDocEdgeToEdge: (val: boolean) => {
    set({ docEdgeToEdge: val });
  },

  setDocAlign: (align: DocAlign) => {
    set({ docAlign: align });
  },

  setDocCopies: (copies: number) => {
    const clamped = Math.min(50, Math.max(1, Math.round(copies) || 1));
    set({ docCopies: clamped });
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
    set({ outputMode: mode });
  },

  setExportProgress: (progress: { done: number; total: number } | null) => {
    set({ exportProgress: progress });
  },

  setCheckNotice: (notice: { action: 'print' | 'export'; lines: string[] } | null) => {
    set({ checkNotice: notice });
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
