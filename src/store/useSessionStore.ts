import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { Session, Job, Page, PageElement, ImageAsset, Unit, Settings, Block, BlockKind, SheetRow } from '@/types';
import { getPageDimensionsMm, clampToPage } from '@/lib/pageGeometry';
import { useUiStore } from '@/store/useUiStore';
import { BlockCtx, generateBlockPages, blockSignature } from '@/lib/blocks';
import { printableRect } from '@/lib/packing';

interface SessionState extends Session {
  history: Record<string, { past: Job[]; future: Job[] }>;

  commit: (jobId: string) => void;
  undo: (jobId: string) => void;
  redo: (jobId: string) => void;
  canUndo: (jobId: string) => boolean;
  canRedo: (jobId: string) => boolean;

  addJob: () => void;
  removeJob: (jobId: string) => void;
  renameJob: (jobId: string, name: string) => void;
  setActiveJob: (jobId: string) => void;
  setPaper: (pageId: string, paperId: string) => void;
  setOrientation: (pageId: string, orientation: 'portrait' | 'landscape') => void;
  setUnit: (unit: Unit) => void;

  addPage: (jobId: string) => void;
  removePage: (jobId: string, pageId: string) => void;
  setJobPaper: (jobId: string, paperId: string) => void;
  setJobOrientation: (jobId: string, orientation: 'portrait' | 'landscape') => void;
  addElement: (jobId: string, pageId: string, element: PageElement) => void;
  removeElement: (jobId: string, pageId: string, elementId: string) => void;
  removeElements: (jobId: string, pageId: string, elementIds: string[]) => void;
  rotateElement: (jobId: string, pageId: string, elementId: string) => void;
  updateElement: (
    jobId: string,
    pageId: string,
    elementId: string,
    partial: Partial<PageElement>,
    skipCommit?: boolean
  ) => void;
  moveGroup: (
    jobId: string,
    pageId: string,
    elementIds: string[],
    dxMm: number,
    dyMm: number
  ) => void;
  nudgeGroup: (
    jobId: string,
    pageId: string,
    elementIds: string[],
    dxMm: number,
    dyMm: number,
    skipCommit?: boolean
  ) => void;
  alignElements: (
    jobId: string,
    pageId: string,
    elementIds: string[] | null,
    mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
  ) => void;
  duplicateElement: (jobId: string, pageId: string, elementId: string) => string | null;
  moveElementToPage: (
    jobId: string,
    fromPageId: string,
    toPageId: string,
    elementId: string,
    pos?: { xMm: number; yMm: number }
  ) => void;
  addPageAndMove: (
    jobId: string,
    fromPageId: string,
    elementId: string,
    pos?: { xMm: number; yMm: number }
  ) => string | null;
  bringForward: (jobId: string, pageId: string, elementId: string) => void;
  sendBackward: (jobId: string, pageId: string, elementId: string) => void;
  bringToFront: (jobId: string, pageId: string, elementId: string) => void;
  sendToBack: (jobId: string, pageId: string, elementId: string) => void;
  clearElements: (jobId: string) => void;

  hasManualEdits: (jobId: string) => boolean;
  addBlocks: (
    jobId: string,
    specs: {
      kind: BlockKind;
      assetIds: string[];
      collageOption?: 'best' | 'grid' | 'column' | 'row';
      rows?: SheetRow[];
    }[]
  ) => { ok: boolean; reason?: string; firstPageId?: string };
  updateBlock: (
    jobId: string,
    blockId: string,
    patch: Partial<
      Pick<
        Block,
        'kind' | 'assetIds' | 'collageOption' | 'rows'
      >
    >,
    opts?: { force?: boolean }
  ) => 'ok' | 'needs-confirm';
  removeBlock: (jobId: string, blockId: string) => void;
  relayoutAll: (
    jobId: string,
    opts?: { force?: boolean }
  ) => 'ok' | 'needs-confirm';

  setBorderless: (jobId: string, borderless: boolean) => void;
  setPictureSize: (
    jobId: string,
    assetId: string,
    spec:
      | { mode: 'default' }
      | { mode: 'size'; size: { id: string; wMm: number; hMm: number } }
      | { mode: 'fill' }
      | { mode: 'width' },
    opts?: { force?: boolean }
  ) => 'ok' | 'needs-confirm' | 'free' | 'not-found';
  setPictureQty: (
    jobId: string,
    assetId: string,
    qty: number,
    opts?: { force?: boolean }
  ) => 'ok' | 'needs-confirm';
  setPictureFillPage: (
    jobId: string,
    assetId: string,
    value: boolean,
    opts?: { force?: boolean }
  ) => 'ok' | 'needs-confirm';

  addAssets: (newAssets: ImageAsset[]) => void;
  discardAssets: (ids: string[]) => void;
  removeAsset: (assetId: string) => void;
  applyPlacements: (
    jobId: string,
    placements: { pageIndex: number; element: PageElement }[]
  ) => void;
  updateSettings: (jobId: string, partial: Partial<Settings>) => void;
}

const defaultSettings: Settings = {
  unit: 'in',
  marginMm: 6.35,
  gapMm: 2,
  cutStyle: 'outline',
  borderless: false,
};

const initialJobId = nanoid();
const initialPageId = nanoid();

const initialJob: Job = {
  id: initialJobId,
  name: 'Job 1',
  settings: { ...defaultSettings },
  pages: [
    {
      id: initialPageId,
      paperId: 'letter',
      orientation: 'portrait',
      elements: [],
    },
  ],
  blocks: [],
};

function ctxForJob(job: Job, assets: ImageAsset[]): BlockCtx {
  const firstPage = job.pages[0];
  const paperId = firstPage ? firstPage.paperId : 'letter';
  const orientation = firstPage ? firstPage.orientation : 'portrait';
  const { wMm: pageWMm, hMm: pageHMm } = firstPage
    ? getPageDimensionsMm(firstPage)
    : { wMm: 215.9, hMm: 279.4 };
  const assetsById: Record<string, ImageAsset> = {};
  for (const a of assets) {
    assetsById[a.id] = a;
  }
  const effectiveMargin = job.settings.borderless ? 0 : job.settings.marginMm;
  return {
    paperId,
    orientation,
    pageWMm,
    pageHMm,
    marginMm: effectiveMargin,
    gapMm: job.settings.gapMm,
    assetsById,
  };
}

function relayoutJobBlocks(job: Job, ctx: BlockCtx): Job {
  const blocks = job.blocks || [];
  const activeBlockIds = new Set(
    job.pages.map((p) => p.blockId).filter((id): id is string => Boolean(id))
  );

  const remainingBlocks = blocks.filter((b) => activeBlockIds.has(b.id));

  const generatedMap = new Map<string, { block: Block; pages: Page[] }>();
  for (const block of remainingBlocks) {
    const newPages = generateBlockPages(block, ctx);
    const updatedBlock: Block = {
      ...block,
      generatedSig: blockSignature(newPages),
    };
    generatedMap.set(block.id, { block: updatedBlock, pages: newPages });
  }

  const reconstructedPages: Page[] = [];
  const insertedBlockIds = new Set<string>();

  for (const page of job.pages) {
    if (!page.blockId) {
      reconstructedPages.push({
        ...page,
        paperId: ctx.paperId,
        orientation: ctx.orientation,
      });
    } else {
      if (!insertedBlockIds.has(page.blockId)) {
        insertedBlockIds.add(page.blockId);
        const gen = generatedMap.get(page.blockId);
        if (gen) {
          reconstructedPages.push(...gen.pages);
        }
      }
    }
  }

  if (reconstructedPages.length === 0) {
    reconstructedPages.push({
      id: nanoid(),
      paperId: ctx.paperId,
      orientation: ctx.orientation,
      elements: [],
    });
  }

  const updatedBlocks = remainingBlocks.map((b) => {
    const gen = generatedMap.get(b.id);
    return gen ? gen.block : b;
  });

  return {
    ...job,
    pages: reconstructedPages,
    blocks: updatedBlocks,
  };
}

function checkAndClearSelection() {
  const { selected, selectedIds, selectedPageId, setSelection, clearSelection } = useUiStore.getState();
  if (selected) {
    const job = useSessionStore.getState().jobs.find((j) =>
      j.pages.some((p) => p.id === selected.pageId)
    );
    const element = job?.pages
      .find((p) => p.id === selected.pageId)
      ?.elements.find((el) => el.id === selected.elementId);
    if (!element) {
      clearSelection();
    }
  } else if (selectedPageId && selectedIds.length > 0) {
    const job = useSessionStore.getState().jobs.find((j) =>
      j.pages.some((p) => p.id === selectedPageId)
    );
    const page = job?.pages.find((p) => p.id === selectedPageId);
    const existingIds = selectedIds.filter((id) =>
      page?.elements.some((el) => el.id === id)
    );
    if (existingIds.length !== selectedIds.length) {
      setSelection(selectedPageId, existingIds);
    }
  }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  jobs: [initialJob],
  activeJobId: initialJobId,
  assets: [],
  history: {},

  commit: (jobId: string) => {
    const state = get();
    const currentJob = state.jobs.find((j) => j.id === jobId);
    if (!currentJob) return;

    const currentHistory = state.history[jobId] || { past: [], future: [] };
    const updatedPast = [...currentHistory.past, currentJob].slice(-50);

    set({
      history: {
        ...state.history,
        [jobId]: {
          past: updatedPast,
          future: [],
        },
      },
    });
  },

  canUndo: (jobId: string) => {
    const h = get().history[jobId];
    return Boolean(h && h.past.length > 0);
  },

  canRedo: (jobId: string) => {
    const h = get().history[jobId];
    return Boolean(h && h.future.length > 0);
  },

  undo: (jobId: string) => {
    const state = get();
    const jobHistory = state.history[jobId];
    if (!jobHistory || jobHistory.past.length === 0) return;

    const currentJob = state.jobs.find((j) => j.id === jobId);
    if (!currentJob) return;

    const previousJob = jobHistory.past[jobHistory.past.length - 1];
    const newPast = jobHistory.past.slice(0, -1);
    const newFuture = [currentJob, ...jobHistory.future];

    set({
      jobs: state.jobs.map((j) => (j.id === jobId ? previousJob : j)),
      history: {
        ...state.history,
        [jobId]: { past: newPast, future: newFuture },
      },
    });

    const { selected, selectedIds, selectedPageId, activePageId, clearSelection, setSelection, setActivePage } =
      useUiStore.getState();
    if (selected) {
      const page = previousJob.pages.find((p) => p.id === selected.pageId);
      const element = page?.elements.find((el) => el.id === selected.elementId);
      if (!element) {
        clearSelection();
      }
    } else if (selectedPageId && selectedIds.length > 0) {
      const page = previousJob.pages.find((p) => p.id === selectedPageId);
      const existingIds = selectedIds.filter((id) =>
        page?.elements.some((el) => el.id === id)
      );
      if (existingIds.length !== selectedIds.length) {
        setSelection(selectedPageId, existingIds);
      }
    }

    if (activePageId && !previousJob.pages.some((p) => p.id === activePageId)) {
      setActivePage(previousJob.pages[0]?.id || null);
    }
  },

  redo: (jobId: string) => {
    const state = get();
    const jobHistory = state.history[jobId];
    if (!jobHistory || jobHistory.future.length === 0) return;

    const currentJob = state.jobs.find((j) => j.id === jobId);
    if (!currentJob) return;

    const nextJob = jobHistory.future[0];
    const newFuture = jobHistory.future.slice(1);
    const newPast = [...jobHistory.past, currentJob].slice(-50);

    set({
      jobs: state.jobs.map((j) => (j.id === jobId ? nextJob : j)),
      history: {
        ...state.history,
        [jobId]: { past: newPast, future: newFuture },
      },
    });

    const { selected, selectedIds, selectedPageId, activePageId, clearSelection, setSelection, setActivePage } =
      useUiStore.getState();
    if (selected) {
      const page = nextJob.pages.find((p) => p.id === selected.pageId);
      const element = page?.elements.find((el) => el.id === selected.elementId);
      if (!element) {
        clearSelection();
      }
    } else if (selectedPageId && selectedIds.length > 0) {
      const page = nextJob.pages.find((p) => p.id === selectedPageId);
      const existingIds = selectedIds.filter((id) =>
        page?.elements.some((el) => el.id === id)
      );
      if (existingIds.length !== selectedIds.length) {
        setSelection(selectedPageId, existingIds);
      }
    }

    if (activePageId && !nextJob.pages.some((p) => p.id === activePageId)) {
      setActivePage(nextJob.pages[0]?.id || null);
    }
  },

  addJob: () => {
    const currentJobs = get().jobs;
    const newJobId = nanoid();
    const newPageId = nanoid();
    const newJob: Job = {
      id: newJobId,
      name: `Job ${currentJobs.length + 1}`,
      settings: { ...defaultSettings },
      pages: [
        {
          id: newPageId,
          paperId: 'letter',
          orientation: 'portrait',
          elements: [],
        },
      ],
      blocks: [],
    };

    set({
      jobs: [...currentJobs, newJob],
      activeJobId: newJobId,
    });
  },

  removeJob: (jobId: string) => {
    const { jobs, activeJobId, history } = get();
    if (jobs.length <= 1) return;

    const jobIndex = jobs.findIndex((j) => j.id === jobId);
    if (jobIndex === -1) return;

    const nextJobs = jobs.filter((j) => j.id !== jobId);
    let nextActiveId = activeJobId;

    if (activeJobId === jobId) {
      const nextIndex = Math.min(jobIndex, nextJobs.length - 1);
      nextActiveId = nextJobs[nextIndex].id;
    }

    const nextHistory = { ...history };
    delete nextHistory[jobId];

    set({
      jobs: nextJobs,
      activeJobId: nextActiveId,
      history: nextHistory,
    });
  },

  renameJob: (jobId: string, name: string) => {
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === jobId ? { ...job, name } : job
      ),
    }));
  },

  setActiveJob: (jobId: string) => {
    set({ activeJobId: jobId });
  },

  setPaper: (pageId: string, paperId: string) => {
    set((state) => ({
      jobs: state.jobs.map((job) => ({
        ...job,
        pages: job.pages.map((page) =>
          page.id === pageId ? { ...page, paperId } : page
        ),
      })),
    }));
  },

  setOrientation: (pageId: string, orientation: 'portrait' | 'landscape') => {
    set((state) => ({
      jobs: state.jobs.map((job) => ({
        ...job,
        pages: job.pages.map((page) =>
          page.id === pageId ? { ...page, orientation } : page
        ),
      })),
    }));
  },

  setUnit: (unit: Unit) => {
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === state.activeJobId
          ? { ...job, settings: { ...job.settings, unit } }
          : job
      ),
    }));
  },

  addPage: (jobId: string) => {
    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        const lastPage = job.pages[job.pages.length - 1];
        const newPage: Page = {
          id: nanoid(),
          paperId: lastPage ? lastPage.paperId : 'letter',
          orientation: lastPage ? lastPage.orientation : 'portrait',
          elements: [],
        };
        return {
          ...job,
          pages: [...job.pages, newPage],
        };
      }),
    }));
  },

  removePage: (jobId: string, pageId: string) => {
    const job = get().jobs.find((j) => j.id === jobId);
    if (!job || job.pages.length <= 1) return;

    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: j.pages.filter((p) => p.id !== pageId),
        };
      }),
    }));
  },

  setJobPaper: (jobId: string, paperId: string) => {
    get().commit(jobId);
    set((state) => {
      const targetJob = state.jobs.find((j) => j.id === jobId);
      if (!targetJob) return state;

      const orientation = targetJob.pages[0]?.orientation || 'portrait';
      const paperDimensions = getPageDimensionsMm({
        paperId,
        orientation,
      } as Page);

      const effectiveMargin = targetJob.settings.borderless ? 0 : targetJob.settings.marginMm;
      const ctx: BlockCtx = {
        paperId,
        orientation,
        pageWMm: paperDimensions.wMm,
        pageHMm: paperDimensions.hMm,
        marginMm: effectiveMargin,
        gapMm: targetJob.settings.gapMm,
        assetsById: Object.fromEntries(state.assets.map((a) => [a.id, a])),
      };

      const relaidJob = relayoutJobBlocks(targetJob, ctx);

      return {
        jobs: state.jobs.map((j) => (j.id === jobId ? relaidJob : j)),
      };
    });
    checkAndClearSelection();
  },

  setJobOrientation: (jobId: string, orientation: 'portrait' | 'landscape') => {
    get().commit(jobId);
    set((state) => {
      const targetJob = state.jobs.find((j) => j.id === jobId);
      if (!targetJob) return state;

      const paperId = targetJob.pages[0]?.paperId || 'letter';
      const paperDimensions = getPageDimensionsMm({
        paperId,
        orientation,
      } as Page);

      const effectiveMargin = targetJob.settings.borderless ? 0 : targetJob.settings.marginMm;
      const ctx: BlockCtx = {
        paperId,
        orientation,
        pageWMm: paperDimensions.wMm,
        pageHMm: paperDimensions.hMm,
        marginMm: effectiveMargin,
        gapMm: targetJob.settings.gapMm,
        assetsById: Object.fromEntries(state.assets.map((a) => [a.id, a])),
      };

      const relaidJob = relayoutJobBlocks(targetJob, ctx);

      return {
        jobs: state.jobs.map((j) => (j.id === jobId ? relaidJob : j)),
      };
    });
    checkAndClearSelection();
  },

  addElement: (jobId: string, pageId: string, element: PageElement) => {
    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          pages: job.pages.map((p) => {
            if (p.id !== pageId) return p;
            return {
              ...p,
              elements: [...p.elements, element],
            };
          }),
        };
      }),
    }));
  },

  removeElement: (jobId: string, pageId: string, elementId: string) => {
    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          pages: job.pages.map((p) => {
            if (p.id !== pageId) return p;
            return {
              ...p,
              elements: p.elements.filter((el) => el.id !== elementId),
            };
          }),
        };
      }),
    }));
  },

  removeElements: (jobId: string, pageId: string, elementIds: string[]) => {
    if (!elementIds || elementIds.length === 0) return;
    get().commit(jobId);
    const idSet = new Set(elementIds);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          pages: job.pages.map((p) => {
            if (p.id !== pageId) return p;
            return {
              ...p,
              elements: p.elements.filter((el) => !idSet.has(el.id)),
            };
          }),
        };
      }),
    }));
  },

  moveGroup: (
    jobId: string,
    pageId: string,
    elementIds: string[],
    dxMm: number,
    dyMm: number
  ) => {
    if ((dxMm === 0 && dyMm === 0) || !elementIds || elementIds.length === 0) return;
    get().commit(jobId);
    const idSet = new Set(elementIds);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          pages: job.pages.map((p) => {
            if (p.id !== pageId) return p;
            return {
              ...p,
              elements: p.elements.map((el) => {
                if (!idSet.has(el.id) || el.sliceIndex) return el;
                return {
                  ...el,
                  xMm: Math.round((el.xMm + dxMm) * 1000) / 1000,
                  yMm: Math.round((el.yMm + dyMm) * 1000) / 1000,
                };
              }),
            };
          }),
        };
      }),
    }));
  },

  nudgeGroup: (
    jobId: string,
    pageId: string,
    elementIds: string[],
    dxMm: number,
    dyMm: number,
    skipCommit?: boolean
  ) => {
    if ((dxMm === 0 && dyMm === 0) || !elementIds || elementIds.length === 0) return;
    if (!skipCommit) {
      get().commit(jobId);
    }
    const idSet = new Set(elementIds);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          pages: job.pages.map((p) => {
            if (p.id !== pageId) return p;
            return {
              ...p,
              elements: p.elements.map((el) => {
                if (!idSet.has(el.id) || el.sliceIndex) return el;
                return {
                  ...el,
                  xMm: Math.round((el.xMm + dxMm) * 1000) / 1000,
                  yMm: Math.round((el.yMm + dyMm) * 1000) / 1000,
                };
              }),
            };
          }),
        };
      }),
    }));
  },

  alignElements: (
    jobId: string,
    pageId: string,
    elementIds: string[] | null,
    mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
  ) => {
    const job = get().jobs.find((j) => j.id === jobId);
    if (!job) return;
    const page = job.pages.find((p) => p.id === pageId);
    if (!page) return;

    let targetElements: PageElement[];
    if (elementIds && elementIds.length > 0) {
      const idSet = new Set(elementIds);
      targetElements = page.elements.filter((el) => idSet.has(el.id) && !el.sliceIndex);
    } else {
      targetElements = page.elements.filter((el) => !el.sliceIndex);
    }

    if (targetElements.length === 0) return;

    const minX = Math.min(...targetElements.map((el) => el.xMm));
    const minY = Math.min(...targetElements.map((el) => el.yMm));
    const maxX = Math.max(...targetElements.map((el) => el.xMm + el.wMm));
    const maxY = Math.max(...targetElements.map((el) => el.yMm + el.hMm));
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    const bboxCenterX = minX + bboxW / 2;
    const bboxCenterY = minY + bboxH / 2;

    const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(page);
    const effectiveMargin = job.settings.borderless ? 0 : job.settings.marginMm;
    const pRect = printableRect(pageW, pageH, effectiveMargin);

    let dx = 0;
    let dy = 0;

    if (mode === 'left') {
      dx = pRect.x - minX;
    } else if (mode === 'center') {
      dx = pRect.x + pRect.w / 2 - bboxCenterX;
    } else if (mode === 'right') {
      dx = pRect.x + pRect.w - maxX;
    } else if (mode === 'top') {
      dy = pRect.y - minY;
    } else if (mode === 'middle') {
      dy = pRect.y + pRect.h / 2 - bboxCenterY;
    } else if (mode === 'bottom') {
      dy = pRect.y + pRect.h - maxY;
    }

    // Clamp inside page bounds
    if (minX + dx < 0) dx = -minX;
    if (maxX + dx > pageW) dx = pageW - maxX;
    if (minY + dy < 0) dy = -minY;
    if (maxY + dy > pageH) dy = pageH - maxY;

    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;

    get().commit(jobId);
    const targetIdSet = new Set(targetElements.map((el) => el.id));

    set((state) => ({
      jobs: state.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: j.pages.map((p) => {
            if (p.id !== pageId) return p;
            return {
              ...p,
              elements: p.elements.map((el) => {
                if (!targetIdSet.has(el.id)) return el;
                return {
                  ...el,
                  xMm: Math.round((el.xMm + dx) * 1000) / 1000,
                  yMm: Math.round((el.yMm + dy) * 1000) / 1000,
                };
              }),
            };
          }),
        };
      }),
    }));
  },

  rotateElement: (jobId: string, pageId: string, elementId: string) => {
    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          pages: job.pages.map((p) => {
            if (p.id !== pageId) return p;
            return {
              ...p,
              elements: p.elements.map((el) => {
                if (el.id !== elementId) return el;
                const oldRotation = el.rotation || 0;
                const newRotation: 0 | 90 = oldRotation === 0 ? 90 : 0;
                const oldW = el.wMm;
                const oldH = el.hMm;
                const newW = oldH;
                const newH = oldW;

                const newX = el.xMm + (oldW - newW) / 2;
                const newY = el.yMm + (oldH - newH) / 2;

                const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(p);
                const clamped = clampToPage(newX, newY, newW, newH, pageW, pageH);

                return {
                  ...el,
                  rotation: newRotation,
                  wMm: clamped.w,
                  hMm: clamped.h,
                  xMm: clamped.x,
                  yMm: clamped.y,
                };
              }),
            };
          }),
        };
      }),
    }));
  },

  updateElement: (
    jobId: string,
    pageId: string,
    elementId: string,
    partial: Partial<PageElement>,
    skipCommit?: boolean
  ) => {
    if (!skipCommit) {
      get().commit(jobId);
    }
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          pages: job.pages.map((p) => {
            if (p.id !== pageId) return p;
            return {
              ...p,
              elements: p.elements.map((el) => {
                if (el.id !== elementId) return el;
                const next = { ...el, ...partial };
                const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(p);
                const clamped = clampToPage(
                  next.xMm,
                  next.yMm,
                  next.wMm,
                  next.hMm,
                  pageW,
                  pageH
                );
                return {
                  ...next,
                  xMm: clamped.x,
                  yMm: clamped.y,
                  wMm: clamped.w,
                  hMm: clamped.h,
                };
              }),
            };
          }),
        };
      }),
    }));
  },

  duplicateElement: (jobId: string, pageId: string, elementId: string) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return null;
    const page = job.pages.find((p) => p.id === pageId);
    if (!page) return null;
    const element = page.elements.find((el) => el.id === elementId);
    if (!element) return null;

    state.commit(jobId);

    const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(page);
    const clamped = clampToPage(
      element.xMm + 5,
      element.yMm + 5,
      element.wMm,
      element.hMm,
      pageW,
      pageH
    );

    const newElementId = nanoid();
    const newElement: PageElement = {
      ...element,
      id: newElementId,
      xMm: clamped.x,
      yMm: clamped.y,
    };

    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: j.pages.map((p) => {
            if (p.id !== pageId) return p;
            return {
              ...p,
              elements: [...p.elements, newElement],
            };
          }),
        };
      }),
    }));

    return newElementId;
  },

  moveElementToPage: (
    jobId: string,
    fromPageId: string,
    toPageId: string,
    elementId: string,
    pos?: { xMm: number; yMm: number }
  ) => {
    if (fromPageId === toPageId) return;
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;
    const fromPage = job.pages.find((p) => p.id === fromPageId);
    const toPage = job.pages.find((p) => p.id === toPageId);
    if (!fromPage || !toPage) return;
    const element = fromPage.elements.find((el) => el.id === elementId);
    if (!element) return;

    state.commit(jobId);

    const { wMm: toPageW, hMm: toPageH } = getPageDimensionsMm(toPage);
    const targetX = pos !== undefined ? pos.xMm : element.xMm;
    const targetY = pos !== undefined ? pos.yMm : element.yMm;
    const clamped = clampToPage(
      targetX,
      targetY,
      element.wMm,
      element.hMm,
      toPageW,
      toPageH
    );

    const movedElement: PageElement = {
      ...element,
      xMm: clamped.x,
      yMm: clamped.y,
    };

    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: j.pages.map((p) => {
            if (p.id === fromPageId) {
              return {
                ...p,
                elements: p.elements.filter((el) => el.id !== elementId),
              };
            }
            if (p.id === toPageId) {
              return {
                ...p,
                elements: [...p.elements, movedElement],
              };
            }
            return p;
          }),
        };
      }),
    }));

    const { select, setActivePage } = useUiStore.getState();
    setActivePage(toPageId);
    select({ pageId: toPageId, elementId });
  },

  addPageAndMove: (
    jobId: string,
    fromPageId: string,
    elementId: string,
    pos?: { xMm: number; yMm: number }
  ) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return null;
    const fromPage = job.pages.find((p) => p.id === fromPageId);
    if (!fromPage) return null;
    const element = fromPage.elements.find((el) => el.id === elementId);
    if (!element) return null;

    state.commit(jobId);

    const lastPage = job.pages[job.pages.length - 1];
    const newPageId = nanoid();
    const paperId = lastPage ? lastPage.paperId : 'letter';
    const orientation = lastPage ? lastPage.orientation : 'portrait';

    const tempPage: Page = {
      id: newPageId,
      paperId,
      orientation,
      elements: [],
    };
    const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(tempPage);
    const effectiveMargin = job.settings.borderless
      ? 0
      : (job.settings.marginMm ?? 6.35);

    const targetX = pos !== undefined ? pos.xMm : effectiveMargin;
    const targetY = pos !== undefined ? pos.yMm : effectiveMargin;
    const clamped = clampToPage(
      targetX,
      targetY,
      element.wMm,
      element.hMm,
      pageW,
      pageH
    );

    const movedElement: PageElement = {
      ...element,
      xMm: clamped.x,
      yMm: clamped.y,
    };

    const newPage: Page = {
      id: newPageId,
      paperId,
      orientation,
      elements: [movedElement],
    };

    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: [
            ...j.pages.map((p) => {
              if (p.id === fromPageId) {
                return {
                  ...p,
                  elements: p.elements.filter((el) => el.id !== elementId),
                };
              }
              return p;
            }),
            newPage,
          ],
        };
      }),
    }));

    const { select, setActivePage } = useUiStore.getState();
    setActivePage(newPageId);
    select({ pageId: newPageId, elementId });

    return newPageId;
  },

  bringForward: (jobId: string, pageId: string, elementId: string) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;
    const page = job.pages.find((p) => p.id === pageId);
    if (!page) return;
    const idx = page.elements.findIndex((el) => el.id === elementId);
    if (idx === -1 || idx === page.elements.length - 1) return;

    state.commit(jobId);
    const newElements = [...page.elements];
    const temp = newElements[idx];
    newElements[idx] = newElements[idx + 1];
    newElements[idx + 1] = temp;

    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: j.pages.map((p) => (p.id === pageId ? { ...p, elements: newElements } : p)),
        };
      }),
    }));
  },

  sendBackward: (jobId: string, pageId: string, elementId: string) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;
    const page = job.pages.find((p) => p.id === pageId);
    if (!page) return;
    const idx = page.elements.findIndex((el) => el.id === elementId);
    if (idx <= 0) return;

    state.commit(jobId);
    const newElements = [...page.elements];
    const temp = newElements[idx];
    newElements[idx] = newElements[idx - 1];
    newElements[idx - 1] = temp;

    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: j.pages.map((p) => (p.id === pageId ? { ...p, elements: newElements } : p)),
        };
      }),
    }));
  },

  bringToFront: (jobId: string, pageId: string, elementId: string) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;
    const page = job.pages.find((p) => p.id === pageId);
    if (!page) return;
    const idx = page.elements.findIndex((el) => el.id === elementId);
    if (idx === -1 || idx === page.elements.length - 1) return;

    state.commit(jobId);
    const element = page.elements[idx];
    const newElements = [...page.elements.slice(0, idx), ...page.elements.slice(idx + 1), element];

    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: j.pages.map((p) => (p.id === pageId ? { ...p, elements: newElements } : p)),
        };
      }),
    }));
  },

  sendToBack: (jobId: string, pageId: string, elementId: string) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;
    const page = job.pages.find((p) => p.id === pageId);
    if (!page) return;
    const idx = page.elements.findIndex((el) => el.id === elementId);
    if (idx <= 0) return;

    state.commit(jobId);
    const element = page.elements[idx];
    const newElements = [element, ...page.elements.slice(0, idx), ...page.elements.slice(idx + 1)];

    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: j.pages.map((p) => (p.id === pageId ? { ...p, elements: newElements } : p)),
        };
      }),
    }));
  },

  clearElements: (jobId: string) => {
    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          blocks: [],
          pages: job.pages.map((p) => ({
            ...p,
            elements: [],
            blockId: undefined,
          })),
        };
      }),
    }));
    checkAndClearSelection();
  },

  hasManualEdits: (jobId: string) => {
    const job = get().jobs.find((j) => j.id === jobId);
    if (!job || !job.blocks) return false;
    for (const block of job.blocks) {
      const pages = job.pages.filter((p) => p.blockId === block.id);
      if (pages.length === 0) continue;
      if (blockSignature(pages) !== block.generatedSig) {
        return true;
      }
    }
    return false;
  },

  addBlocks: (
    jobId: string,
    specs: {
      kind: BlockKind;
      assetIds: string[];
      collageOption?: 'best' | 'grid' | 'column' | 'row';
      rows?: SheetRow[];
    }[]
  ) => {
    const job = get().jobs.find((j) => j.id === jobId);
    if (!job) return { ok: false, reason: 'Job not found' };

    const ctx = ctxForJob(job, get().assets);
    const newBlocks: Block[] = [];
    const allNewPages: Page[] = [];

    for (const spec of specs) {
      const blockId = nanoid();
      const block: Block = {
        id: blockId,
        kind: spec.kind,
        assetIds: spec.rows ? spec.rows.map((r) => r.assetId) : spec.assetIds,
        collageOption: spec.collageOption,
        rows: spec.rows,
        generatedSig: '',
      };
      const pages = generateBlockPages(block, ctx);
      block.generatedSig = blockSignature(pages);
      newBlocks.push(block);
      allNewPages.push(...pages);
    }

    const isJobEmpty = job.pages.every(
      (p) => !p.elements || p.elements.length === 0
    );

    let finalPages: Page[] = [];
    let finalBlocks: Block[] = [];

    if (isJobEmpty) {
      if (allNewPages.length > 50) {
        return { ok: false, reason: '50 pages max' };
      }
      finalPages = allNewPages;
      finalBlocks = newBlocks;
    } else {
      let existingPages = [...job.pages];
      const lastPage = existingPages[existingPages.length - 1];
      if (
        lastPage &&
        (!lastPage.elements || lastPage.elements.length === 0) &&
        !lastPage.blockId
      ) {
        existingPages = existingPages.slice(0, -1);
      }

      if (existingPages.length + allNewPages.length > 50) {
        return { ok: false, reason: '50 pages max' };
      }

      finalPages = [...existingPages, ...allNewPages];
      finalBlocks = [...(job.blocks || []), ...newBlocks];
    }

    get().commit(jobId);

    set((state) => ({
      jobs: state.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: finalPages,
          blocks: finalBlocks,
        };
      }),
    }));

    if (allNewPages[0]) {
      useUiStore.getState().setActivePage(allNewPages[0].id);
    }

    return { ok: true, firstPageId: allNewPages[0]?.id };
  },

  updateBlock: (
    jobId: string,
    blockId: string,
    patch: Partial<
      Pick<
        Block,
        'kind' | 'assetIds' | 'collageOption' | 'rows'
      >
    >,
    opts?: { force?: boolean }
  ) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return 'ok';
    const block = job.blocks?.find((b) => b.id === blockId);
    if (!block) return 'ok';

    const existingPages = job.pages.filter((p) => p.blockId === blockId);
    if (existingPages.length > 0) {
      const sig = blockSignature(existingPages);
      if (sig !== block.generatedSig && !opts?.force) {
        return 'needs-confirm';
      }
    }

    get().commit(jobId);

    const updatedBlock: Block = {
      ...block,
      ...patch,
    };
    const ctx = ctxForJob(job, get().assets);
    const newPages = generateBlockPages(updatedBlock, ctx);
    updatedBlock.generatedSig = blockSignature(newPages);

    const firstIndex = job.pages.findIndex((p) => p.blockId === blockId);
    let reconstructedPages: Page[] = [];

    if (firstIndex === -1) {
      reconstructedPages = [...job.pages, ...newPages];
    } else {
      const pagesBefore = job.pages.slice(0, firstIndex).filter((p) => p.blockId !== blockId);
      const pagesAfter = job.pages.slice(firstIndex).filter((p) => p.blockId !== blockId);
      reconstructedPages = [...pagesBefore, ...newPages, ...pagesAfter];
    }

    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          blocks: (j.blocks || []).map((b) => (b.id === blockId ? updatedBlock : b)),
          pages: reconstructedPages,
        };
      }),
    }));

    if (newPages[0]) {
      useUiStore.getState().setActivePage(newPages[0].id);
    }
    checkAndClearSelection();

    return 'ok';
  },

  removeBlock: (jobId: string, blockId: string) => {
    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        const newBlocks = (job.blocks || []).filter((b) => b.id !== blockId);
        let newPages = job.pages.filter((p) => p.blockId !== blockId);
        if (newPages.length === 0) {
          const firstPage = job.pages[0];
          newPages = [
            {
              id: nanoid(),
              paperId: firstPage ? firstPage.paperId : 'letter',
              orientation: firstPage ? firstPage.orientation : 'portrait',
              elements: [],
            },
          ];
        }
        return {
          ...job,
          blocks: newBlocks,
          pages: newPages,
        };
      }),
    }));
    checkAndClearSelection();
  },

  relayoutAll: (jobId: string, opts?: { force?: boolean }) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return 'ok';

    if (!opts?.force && state.hasManualEdits(jobId)) {
      return 'needs-confirm';
    }

    get().commit(jobId);
    set((s) => {
      const targetJob = s.jobs.find((j) => j.id === jobId);
      if (!targetJob) return s;
      const ctx = ctxForJob(targetJob, s.assets);
      const relaidJob = relayoutJobBlocks(targetJob, ctx);
      return {
        jobs: s.jobs.map((j) => (j.id === jobId ? relaidJob : j)),
      };
    });
    checkAndClearSelection();
    return 'ok';
  },

  setBorderless: (jobId: string, borderless: boolean) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;

    if (state.hasManualEdits(jobId)) {
      const confirmed = window.confirm('Reset your manual changes?');
      if (!confirmed) return;
    }

    get().commit(jobId);
    set((s) => {
      return {
        jobs: s.jobs.map((j) => {
          if (j.id !== jobId) return j;
          const updatedJob = {
            ...j,
            settings: { ...j.settings, borderless },
          };
          const ctx = ctxForJob(updatedJob, s.assets);
          return relayoutJobBlocks(updatedJob, ctx);
        }),
      };
    });
    checkAndClearSelection();
  },

  setPictureSize: (
    jobId: string,
    assetId: string,
    spec:
      | { mode: 'default' }
      | { mode: 'size'; size: { id: string; wMm: number; hMm: number } }
      | { mode: 'fill' }
      | { mode: 'width' },
    opts?: { force?: boolean }
  ) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return 'not-found';

    const existingBlock = (job.blocks || []).find((b) => b.assetIds.includes(assetId));

    if (!existingBlock) {
      const onFreePages = job.pages.some(
        (p) => !p.blockId && p.elements.some((el) => el.assetId === assetId)
      );
      if (onFreePages) {
        return 'free';
      }

      if (spec.mode === 'size') {
        state.addBlocks(jobId, [
          {
            kind: 'sheet',
            assetIds: [assetId],
            rows: [{ assetId, size: spec.size, qty: 1 }],
          },
        ]);
      } else {
        const kind = spec.mode === 'default' ? 'fit' : spec.mode;
        state.addBlocks(jobId, [{ kind, assetIds: [assetId] }]);
      }
      return 'ok';
    }

    const existingPages = job.pages.filter((p) => p.blockId === existingBlock.id);
    const sig = blockSignature(existingPages);
    if (sig !== existingBlock.generatedSig && !opts?.force) {
      return 'needs-confirm';
    }

    if (spec.mode === 'default' || spec.mode === 'fill' || spec.mode === 'width') {
      const targetKind = spec.mode === 'default' ? 'fit' : spec.mode;

      if (existingBlock.assetIds.length === 1 && existingBlock.assetIds[0] === assetId) {
        return state.updateBlock(
          jobId,
          existingBlock.id,
          {
            kind: targetKind,
            rows: undefined,
            collageOption: undefined,
          },
          opts
        );
      }

      state.commit(jobId);

      const remainingAssetIds = existingBlock.assetIds.filter((id) => id !== assetId);
      let updatedRemainingBlock: Block;

      if (existingBlock.kind === 'sheet') {
        const remainingRows = (existingBlock.rows || []).filter((r) => r.assetId !== assetId);
        updatedRemainingBlock = {
          ...existingBlock,
          assetIds: remainingRows.map((r) => r.assetId),
          rows: remainingRows,
        };
      } else if (existingBlock.kind === 'collage') {
        updatedRemainingBlock = {
          ...existingBlock,
          assetIds: remainingAssetIds,
          kind: remainingAssetIds.length === 1 ? 'fit' : 'collage',
          collageOption: remainingAssetIds.length === 1 ? undefined : existingBlock.collageOption,
        };
      } else {
        updatedRemainingBlock = {
          ...existingBlock,
          assetIds: remainingAssetIds,
        };
      }

      const newDetachedBlock: Block = {
        id: nanoid(),
        kind: targetKind,
        assetIds: [assetId],
        generatedSig: '',
      };

      const ctx = ctxForJob(job, state.assets);
      const updatedRemainingPages = generateBlockPages(updatedRemainingBlock, ctx);
      updatedRemainingBlock.generatedSig = blockSignature(updatedRemainingPages);

      const newDetachedPages = generateBlockPages(newDetachedBlock, ctx);
      newDetachedBlock.generatedSig = blockSignature(newDetachedPages);

      const firstIndex = job.pages.findIndex((p) => p.blockId === existingBlock.id);
      let reconstructedPages: Page[] = [];
      if (firstIndex === -1) {
        reconstructedPages = [...job.pages, ...updatedRemainingPages, ...newDetachedPages];
      } else {
        const pagesBefore = job.pages.slice(0, firstIndex).filter((p) => p.blockId !== existingBlock.id);
        const pagesAfter = job.pages.slice(firstIndex).filter((p) => p.blockId !== existingBlock.id);
        reconstructedPages = [...pagesBefore, ...updatedRemainingPages, ...newDetachedPages, ...pagesAfter];
      }

      const updatedBlocks: Block[] = [];
      for (const b of job.blocks) {
        if (b.id === existingBlock.id) {
          updatedBlocks.push(updatedRemainingBlock, newDetachedBlock);
        } else {
          updatedBlocks.push(b);
        }
      }

      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                blocks: updatedBlocks,
                pages: reconstructedPages,
              }
            : j
        ),
      }));

      if (newDetachedPages[0]) {
        useUiStore.getState().setActivePage(newDetachedPages[0].id);
      }
      checkAndClearSelection();
      return 'ok';
    }

    if (existingBlock.kind === 'sheet') {
      const existingRows = existingBlock.rows || [];
      const existingRowIndex = existingRows.findIndex((r) => r.assetId === assetId);
      let nextRows: SheetRow[];

      if (existingRowIndex >= 0) {
        nextRows = existingRows.map((r, i) =>
          i === existingRowIndex
            ? {
                ...r,
                size: spec.size,
              }
            : r
        );
      } else {
        nextRows = [
          ...existingRows,
          {
            assetId,
            size: spec.size,
            qty: 1,
          },
        ];
      }

      return state.updateBlock(
        jobId,
        existingBlock.id,
        {
          kind: 'sheet',
          rows: nextRows,
          assetIds: nextRows.map((r) => r.assetId),
        },
        opts
      );
    }

    if (existingBlock.kind === 'collage') {
      const blockElements = existingPages.flatMap((p) => p.elements);
      const nextRows: SheetRow[] = [];

      for (const id of existingBlock.assetIds) {
        if (id === assetId) {
          nextRows.push({
            assetId,
            size: spec.size,
            qty: 1,
            crop: false,
          });
        } else {
          const el = blockElements.find((e) => e.assetId === id);
          let wMm: number;
          let hMm: number;
          if (el) {
            wMm = el.wMm;
            hMm = el.hMm;
          } else {
            const asset = state.assets.find((a) => a.id === id);
            const ctx = ctxForJob(job, state.assets);
            const maxW = Math.max(10, ctx.pageWMm - 2 * ctx.marginMm);
            const maxH = Math.max(10, ctx.pageHMm - 2 * ctx.marginMm);
            if (asset) {
              const aspect = asset.pxW / asset.pxH;
              if (aspect >= maxW / maxH) {
                wMm = maxW;
                hMm = maxW / aspect;
              } else {
                hMm = maxH;
                wMm = maxH * aspect;
              }
            } else {
              wMm = 50.8;
              hMm = 50.8;
            }
          }
          nextRows.push({
            assetId: id,
            size: {
              id: 'custom',
              wMm: Math.round(wMm * 10) / 10,
              hMm: Math.round(hMm * 10) / 10,
            },
            qty: 1,
            crop: false,
          });
        }
      }

      return state.updateBlock(
        jobId,
        existingBlock.id,
        {
          kind: 'sheet',
          collageOption: undefined,
          rows: nextRows,
          assetIds: nextRows.map((r) => r.assetId),
        },
        opts
      );
    }

    return state.updateBlock(
      jobId,
      existingBlock.id,
      {
        kind: 'sheet',
        rows: [
          {
            assetId,
            size: spec.size,
            qty: 1,
          },
        ],
        assetIds: [assetId],
      },
      opts
    );
  },

  setPictureQty: (
    jobId: string,
    assetId: string,
    qty: number,
    opts?: { force?: boolean }
  ) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return 'ok';

    const block = job.blocks.find((b) => b.assetIds.includes(assetId));
    if (!block || block.kind !== 'sheet' || !block.rows) return 'ok';

    const clamped = Math.min(500, Math.max(1, Math.round(qty) || 1));
    const nextRows = block.rows.map((row) =>
      row.assetId === assetId
        ? { ...row, qty: clamped, fillPage: false }
        : row
    );

    return state.updateBlock(jobId, block.id, { rows: nextRows }, opts);
  },

  setPictureFillPage: (
    jobId: string,
    assetId: string,
    value: boolean,
    opts?: { force?: boolean }
  ) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return 'ok';

    const block = job.blocks.find((b) => b.assetIds.includes(assetId));
    if (!block || block.kind !== 'sheet' || !block.rows) return 'ok';

    const nextRows = block.rows.map((row) =>
      row.assetId === assetId
        ? { ...row, fillPage: value }
        : row
    );

    return state.updateBlock(jobId, block.id, { rows: nextRows }, opts);
  },

  addAssets: (newAssets: ImageAsset[]) => {
    set((state) => ({
      assets: [...state.assets, ...newAssets],
    }));
  },

  discardAssets: (ids: string[]) => {
    const idsSet = new Set(ids);
    const { assets } = get();
    for (const asset of assets) {
      if (idsSet.has(asset.id)) {
        try {
          URL.revokeObjectURL(asset.objectUrl);
        } catch {
          // Ignore revoke errors
        }
      }
    }

    set((state) => ({
      assets: state.assets.filter((a) => !idsSet.has(a.id)),
    }));
  },

  removeAsset: (assetId: string) => {
    const { assets } = get();
    const assetToRemove = assets.find((a) => a.id === assetId);
    if (assetToRemove) {
      try {
        URL.revokeObjectURL(assetToRemove.objectUrl);
      } catch {
        // Ignore revoke errors
      }
    }

    const remainingAssets = assets.filter((a) => a.id !== assetId);

    set((state) => {
      const updatedJobs = state.jobs.map((job) => {
        const blocks = job.blocks || [];
        const blocksToRemove = new Set<string>();
        const updatedBlocks: Block[] = [];
        const regeneratedPagesMap = new Map<string, Page[]>();

        const ctx = ctxForJob(job, remainingAssets);

        for (const block of blocks) {
          if (!block.assetIds.includes(assetId)) {
            updatedBlocks.push(block);
            continue;
          }

          if (block.assetIds.length <= 1) {
            blocksToRemove.add(block.id);
          } else {
            const nextAssetIds = block.assetIds.filter((id) => id !== assetId);
            const nextKind: BlockKind = nextAssetIds.length === 1 ? 'fit' : block.kind;
            const updatedBlock: Block = {
              ...block,
              kind: nextKind,
              assetIds: nextAssetIds,
              collageOption: nextKind === 'fit' ? undefined : block.collageOption,
            };
            const newPages = generateBlockPages(updatedBlock, ctx);
            updatedBlock.generatedSig = blockSignature(newPages);
            updatedBlocks.push(updatedBlock);
            regeneratedPagesMap.set(block.id, newPages);
          }
        }

        const reconstructedPages: Page[] = [];
        const insertedBlockIds = new Set<string>();

        for (const page of job.pages) {
          if (!page.blockId) {
            reconstructedPages.push({
              ...page,
              elements: page.elements.filter((el) => el.assetId !== assetId),
            });
          } else if (blocksToRemove.has(page.blockId)) {
            continue;
          } else if (regeneratedPagesMap.has(page.blockId)) {
            if (!insertedBlockIds.has(page.blockId)) {
              insertedBlockIds.add(page.blockId);
              const newPages = regeneratedPagesMap.get(page.blockId);
              if (newPages) {
                reconstructedPages.push(...newPages);
              }
            }
          } else {
            reconstructedPages.push(page);
          }
        }

        if (reconstructedPages.length === 0) {
          const firstPage = job.pages[0];
          reconstructedPages.push({
            id: nanoid(),
            paperId: firstPage ? firstPage.paperId : 'letter',
            orientation: firstPage ? firstPage.orientation : 'portrait',
            elements: [],
          });
        }

        return {
          ...job,
          blocks: updatedBlocks,
          pages: reconstructedPages,
        };
      });

      return {
        assets: remainingAssets,
        history: {},
        jobs: updatedJobs,
      };
    });
    checkAndClearSelection();
  },

  applyPlacements: (
    jobId: string,
    placements: { pageIndex: number; element: PageElement }[]
  ) => {
    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;

        const isStartState = job.pages.every(
          (p) => !p.elements || p.elements.length === 0
        );

        // Determine if additional pages are required
        const maxPageIndexNeeded = Math.max(
          job.pages.length - 1,
          ...placements.map((p) => p.pageIndex)
        );

        let updatedPages = [...job.pages];
        const lastPage = updatedPages[updatedPages.length - 1];
        const paperId = lastPage ? lastPage.paperId : 'letter';
        const orientation = lastPage ? lastPage.orientation : 'portrait';

        while (updatedPages.length <= maxPageIndexNeeded) {
          updatedPages.push({
            id: nanoid(),
            paperId,
            orientation,
            elements: [],
          });
        }

        // Add elements to their designated pages
        for (const placement of placements) {
          const target = updatedPages[placement.pageIndex];
          if (target) {
            target.elements = [...target.elements, placement.element];
          }
        }

        if (isStartState) {
          // Leave no stray empty pages when replacing empty initial page(s)
          updatedPages = updatedPages.slice(0, maxPageIndexNeeded + 1);
        }

        return {
          ...job,
          pages: updatedPages,
        };
      }),
    }));
  },

  updateSettings: (jobId: string, partial: Partial<Settings>) => {
    get().commit(jobId);
    set((state) => {
      const relayoutNeeded =
        partial.marginMm !== undefined ||
        partial.gapMm !== undefined ||
        partial.borderless !== undefined;

      return {
        jobs: state.jobs.map((job) => {
          if (job.id !== jobId) return job;
          const updatedJob = {
            ...job,
            settings: { ...job.settings, ...partial },
          };
          if (relayoutNeeded) {
            const ctx = ctxForJob(updatedJob, state.assets);
            return relayoutJobBlocks(updatedJob, ctx);
          }
          return updatedJob;
        }),
      };
    });
    if (
      partial.marginMm !== undefined ||
      partial.gapMm !== undefined ||
      partial.borderless !== undefined
    ) {
      checkAndClearSelection();
    }
  },
}));
