import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { Session, Job, Page, PageElement, ImageAsset, Unit, Settings, Block, BlockKind } from '@/types';
import { getPageDimensionsMm, clampToPage } from '@/lib/pageGeometry';
import { useUiStore } from '@/store/useUiStore';
import { BlockCtx, generateBlockPages, blockSignature } from '@/lib/blocks';

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
  rotateElement: (jobId: string, pageId: string, elementId: string) => void;
  updateElement: (
    jobId: string,
    pageId: string,
    elementId: string,
    partial: Partial<PageElement>,
    skipCommit?: boolean
  ) => void;
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
  clearElements: (jobId: string) => void;

  hasManualEdits: (jobId: string) => boolean;
  addBlocks: (
    jobId: string,
    specs: {
      kind: BlockKind;
      assetIds: string[];
      collageOption?: 'best' | 'grid' | 'column' | 'row';
      size?: { id: string; wMm: number; hMm: number };
      qty?: number;
      fillPage?: boolean;
      crop?: boolean;
    }[]
  ) => { ok: boolean; reason?: string; firstPageId?: string };
  updateBlock: (
    jobId: string,
    blockId: string,
    patch: Partial<
      Pick<
        Block,
        'kind' | 'assetIds' | 'collageOption' | 'size' | 'qty' | 'fillPage' | 'crop'
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
  setBlockSize: (
    jobId: string,
    assetId: string,
    spec:
      | { mode: 'fit' | 'fill' | 'width' }
      | {
          mode: 'sheet';
          size: { id: string; wMm: number; hMm: number };
          qty?: number;
          fillPage?: boolean;
          crop?: boolean;
        },
    opts?: { force?: boolean }
  ) => 'ok' | 'needs-confirm' | 'collage' | 'free' | 'not-found';
  detachCollagePicture: (jobId: string, blockId: string, assetId: string) => void;

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
  cutStyle: 'none',
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
  const { selected, clearSelection } = useUiStore.getState();
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

    const { selected, activePageId, clearSelection, setActivePage } =
      useUiStore.getState();
    if (selected) {
      const page = previousJob.pages.find((p) => p.id === selected.pageId);
      const element = page?.elements.find((el) => el.id === selected.elementId);
      if (!element) {
        clearSelection();
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

    const { selected, activePageId, clearSelection, setActivePage } =
      useUiStore.getState();
    if (selected) {
      const page = nextJob.pages.find((p) => p.id === selected.pageId);
      const element = page?.elements.find((el) => el.id === selected.elementId);
      if (!element) {
        clearSelection();
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
    elementId: string
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
    const clamped = clampToPage(
      element.xMm,
      element.yMm,
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
      size?: { id: string; wMm: number; hMm: number };
      qty?: number;
      fillPage?: boolean;
      crop?: boolean;
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
        assetIds: spec.assetIds,
        collageOption: spec.collageOption,
        size: spec.size,
        qty: spec.qty,
        fillPage: spec.fillPage,
        crop: spec.crop,
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
        'kind' | 'assetIds' | 'collageOption' | 'size' | 'qty' | 'fillPage' | 'crop'
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

  setBlockSize: (
    jobId: string,
    assetId: string,
    spec:
      | { mode: 'fit' | 'fill' | 'width' }
      | {
          mode: 'sheet';
          size: { id: string; wMm: number; hMm: number };
          qty?: number;
          fillPage?: boolean;
          crop?: boolean;
        },
    opts?: { force?: boolean }
  ) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return 'not-found';

    const existingBlock = job.blocks.find((b) => b.assetIds.includes(assetId));

    if (existingBlock) {
      if (existingBlock.kind === 'collage' || existingBlock.assetIds.length > 1) {
        return 'collage';
      }

      if (spec.mode === 'sheet') {
        const nextQty =
          spec.qty !== undefined
            ? spec.qty
            : existingBlock.kind === 'sheet'
            ? existingBlock.qty ?? 1
            : 1;
        const nextFillPage =
          spec.fillPage !== undefined
            ? spec.fillPage
            : existingBlock.kind === 'sheet'
            ? existingBlock.fillPage ?? false
            : false;
        const nextCrop =
          spec.crop !== undefined
            ? spec.crop
            : existingBlock.kind === 'sheet'
            ? existingBlock.crop ?? false
            : false;

        return state.updateBlock(
          jobId,
          existingBlock.id,
          {
            kind: 'sheet',
            size: spec.size,
            qty: nextQty,
            fillPage: nextFillPage,
            crop: nextCrop,
          },
          opts
        );
      } else {
        return state.updateBlock(
          jobId,
          existingBlock.id,
          {
            kind: spec.mode,
            size: undefined,
            qty: undefined,
            fillPage: undefined,
            crop: undefined,
          },
          opts
        );
      }
    }

    const onFreePages = job.pages.some(
      (p) => !p.blockId && p.elements.some((el) => el.assetId === assetId)
    );
    if (onFreePages) {
      return 'free';
    }

    if (spec.mode === 'sheet') {
      state.addBlocks(jobId, [
        {
          kind: 'sheet',
          assetIds: [assetId],
          size: spec.size,
          qty: spec.qty ?? 1,
          fillPage: spec.fillPage ?? false,
          crop: spec.crop ?? false,
        },
      ]);
    } else {
      state.addBlocks(jobId, [{ kind: spec.mode, assetIds: [assetId] }]);
    }
    return 'ok';
  },

  detachCollagePicture: (jobId: string, blockId: string, assetId: string) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;
    const collageBlock = job.blocks.find((b) => b.id === blockId);
    if (!collageBlock || !collageBlock.assetIds.includes(assetId)) return;

    state.commit(jobId);

    const remainingAssets = collageBlock.assetIds.filter((id) => id !== assetId);
    const updatedCollageBlock: Block = {
      ...collageBlock,
      assetIds: remainingAssets,
      kind: remainingAssets.length === 1 ? 'fit' : 'collage',
      collageOption: remainingAssets.length === 1 ? undefined : collageBlock.collageOption,
    };

    const newFitBlock: Block = {
      id: nanoid(),
      kind: 'fit',
      assetIds: [assetId],
      generatedSig: '',
    };

    const ctx = ctxForJob(job, state.assets);
    const updatedCollagePages = generateBlockPages(updatedCollageBlock, ctx);
    updatedCollageBlock.generatedSig = blockSignature(updatedCollagePages);

    const newFitPages = generateBlockPages(newFitBlock, ctx);
    newFitBlock.generatedSig = blockSignature(newFitPages);

    const firstIndex = job.pages.findIndex((p) => p.blockId === blockId);
    let reconstructedPages: Page[] = [];
    if (firstIndex === -1) {
      reconstructedPages = [...job.pages, ...updatedCollagePages, ...newFitPages];
    } else {
      const before = job.pages.slice(0, firstIndex).filter((p) => p.blockId !== blockId);
      const after = job.pages.slice(firstIndex).filter((p) => p.blockId !== blockId);
      reconstructedPages = [...before, ...updatedCollagePages, ...newFitPages, ...after];
    }

    const updatedBlocks: Block[] = [];
    for (const b of job.blocks) {
      if (b.id === blockId) {
        updatedBlocks.push(updatedCollageBlock, newFitBlock);
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

    if (newFitPages[0]) {
      useUiStore.getState().setActivePage(newFitPages[0].id);
    }
    checkAndClearSelection();
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
