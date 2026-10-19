import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { Session, Job, Page, PageElement, ImageAsset, Unit, Settings, Block, BlockKind, SheetRow, PictureTarget } from '@/types';
import { getPageDimensionsMm, clampToPage } from '@/lib/pageGeometry';
import { useUiStore } from '@/store/useUiStore';
import { BlockCtx, generateBlockPages, blockSignature } from '@/lib/blocks';
import { printableRect, findSpot, Rect } from '@/lib/packing';
import {
  isPageStayPut,
  applyStayPutVariantSizeOnPage,
  applyStayPutQuantityOnPage,
  applyStayPutFillPageOnPage,
  applyStayPutGeometryChangeOnPage,
  placeOverflowElements,
} from '@/lib/stayPut';

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
  ) => 'ok';
  removeBlock: (jobId: string, blockId: string) => void;
  relayoutAll: (
    jobId: string,
    opts?: { force?: boolean }
  ) => 'ok';

  setBorderless: (jobId: string, borderless: boolean) => void;
  setPictureSize: (
    jobId: string,
    target: PictureTarget,
    spec:
      | { mode: 'default' }
      | { mode: 'size'; size: { id: string; wMm: number; hMm: number } }
      | { mode: 'fill' }
      | { mode: 'width' },
    opts?: { force?: boolean }
  ) => 'ok' | 'free' | 'not-found';
  setPictureQty: (
    jobId: string,
    target: PictureTarget,
    qty: number,
    opts?: { force?: boolean }
  ) => 'ok';
  setPictureFillPage: (
    jobId: string,
    target: PictureTarget,
    value: boolean,
    opts?: { force?: boolean }
  ) => 'ok';
  setPictureSizeAndQty: (
    jobId: string,
    target: PictureTarget,
    size: { id: string; wMm: number; hMm: number },
    qty: number,
    opts?: { force?: boolean }
  ) => 'ok' | 'not-found';

  addAssets: (newAssets: ImageAsset[], jobId?: string) => void;
  discardAssets: (ids: string[]) => void;
  removeAsset: (assetId: string) => void;
  deleteAllJobPictures: (jobId: string) => void;
  applyPlacements: (
    jobId: string,
    placements: { pageIndex: number; element: PageElement }[]
  ) => void;
  updateSettings: (jobId: string, partial: Partial<Settings>) => void;
}

export function getJobAssetIds(job: Job): string[] {
  if (job.assetIds !== undefined) {
    return job.assetIds;
  }
  const fromBlocks = job.blocks?.flatMap((b) => b.assetIds) || [];
  const fromPages = job.pages?.flatMap((p) =>
    p.elements.map((el) => el.assetId).filter((id): id is string => Boolean(id))
  ) || [];
  return Array.from(new Set([...fromBlocks, ...fromPages]));
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
  assetIds: [],
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

  // A block is clean if none of its pages are in stay-put mode
  const cleanBlockIds = new Set<string>();
  for (const block of remainingBlocks) {
    const bPages = job.pages.filter((p) => p.blockId === block.id);
    const hasStayPut = bPages.some((p) => isPageStayPut(p, job));
    if (!hasStayPut) {
      cleanBlockIds.add(block.id);
    }
  }

  const generatedMap = new Map<string, { block: Block; pages: Page[] }>();
  for (const block of remainingBlocks) {
    if (cleanBlockIds.has(block.id)) {
      const newPages = generateBlockPages(block, ctx);
      const updatedBlock: Block = {
        ...block,
        generatedSig: blockSignature(newPages),
      };
      generatedMap.set(block.id, { block: updatedBlock, pages: newPages });
    }
  }

  let reconstructedPages: Page[] = [];
  const insertedBlockIds = new Set<string>();
  const pRect = printableRect(ctx.pageWMm, ctx.pageHMm, ctx.marginMm);

  for (const page of job.pages) {
    if (page.elements.length === 0) {
      reconstructedPages.push({
        ...page,
        paperId: ctx.paperId,
        orientation: ctx.orientation,
        elements: [],
      });
      continue;
    }

    if (page.blockId && cleanBlockIds.has(page.blockId)) {
      if (!insertedBlockIds.has(page.blockId)) {
        insertedBlockIds.add(page.blockId);
        const gen = generatedMap.get(page.blockId);
        if (gen) {
          reconstructedPages.push(...gen.pages);
        }
      }
    } else {
      // Stay-put page: preserve relative position (center fraction) and exact size in mm
      const oldDimensions = getPageDimensionsMm(page);
      const newDimensions = { wMm: ctx.pageWMm, hMm: ctx.pageHMm };
      const { placedElements, overflowElements } = applyStayPutGeometryChangeOnPage({
        page,
        oldDimensions,
        newDimensions,
        pRect,
        gapMm: ctx.gapMm,
      });

      const updatedPage: Page = {
        ...page,
        paperId: ctx.paperId,
        orientation: ctx.orientation,
        elements: placedElements,
        stayPut: true,
      };
      reconstructedPages.push(updatedPage);

      if (overflowElements.length > 0) {
        reconstructedPages = placeOverflowElements(
          overflowElements,
          reconstructedPages,
          ctx.paperId,
          ctx.orientation,
          ctx.marginMm,
          ctx.gapMm,
          reconstructedPages.length - 1
        );
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

function parsePictureTarget(target: PictureTarget): { assetIds: string[]; rowIds?: string[] } {
  if (typeof target === 'string') {
    return { assetIds: [target] };
  }
  if (Array.isArray(target)) {
    return { assetIds: target };
  }
  return {
    assetIds: target.assetIds || [],
    rowIds: target.rowIds,
  };
}

function revokeAssetUrls(asset: ImageAsset) {
  const urls = [asset.objectUrl, asset.previewUrl, asset.thumbUrl, asset.originalUrl];
  for (const url of urls) {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
  }
}

function getAllReferencedAssetIds(
  jobs: Job[],
  history: Record<string, { past: Job[]; future: Job[] }>
): Set<string> {
  const referenced = new Set<string>();
  const addFromJob = (j: Job) => {
    if (!j) return;
    if (j.assetIds) {
      for (const id of j.assetIds) referenced.add(id);
    }
    if (j.pages) {
      for (const p of j.pages) {
        if (p.elements) {
          for (const el of p.elements) {
            if (el.assetId) referenced.add(el.assetId);
          }
        }
      }
    }
    if (j.blocks) {
      for (const b of j.blocks) {
        if (b.assetIds) {
          for (const id of b.assetIds) referenced.add(id);
        }
      }
    }
  };

  for (const j of jobs) addFromJob(j);
  for (const h of Object.values(history)) {
    if (h.past) {
      for (const j of h.past) addFromJob(j);
    }
    if (h.future) {
      for (const j of h.future) addFromJob(j);
    }
  }
  return referenced;
}

function pruneUnreferencedAssets(
  assets: ImageAsset[],
  jobs: Job[],
  history: Record<string, { past: Job[]; future: Job[] }>
): ImageAsset[] {
  const referenced = getAllReferencedAssetIds(jobs, history);
  const remaining: ImageAsset[] = [];
  for (const asset of assets) {
    if (referenced.has(asset.id)) {
      remaining.push(asset);
    } else {
      revokeAssetUrls(asset);
    }
  }
  return remaining;
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
    const nextHistory = {
      ...state.history,
      [jobId]: {
        past: updatedPast,
        future: [],
      },
    };
    const nextAssets = pruneUnreferencedAssets(state.assets, state.jobs, nextHistory);

    set({
      history: nextHistory,
      assets: nextAssets,
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
      assetIds: [],
    };

    set({
      jobs: [...currentJobs, newJob],
      activeJobId: newJobId,
    });
  },

  removeJob: (jobId: string) => {
    const { jobs, activeJobId, history, assets } = get();
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

    const nextAssets = pruneUnreferencedAssets(assets, nextJobs, nextHistory);

    set({
      jobs: nextJobs,
      activeJobId: nextActiveId,
      history: nextHistory,
      assets: nextAssets,
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
    if (!job) return;

    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((j) => {
        if (j.id !== jobId) return j;
        const remaining = j.pages.filter((p) => p.id !== pageId);
        if (remaining.length === 0) {
          const firstPage = j.pages[0];
          return {
            ...j,
            pages: [
              {
                id: nanoid(),
                paperId: firstPage ? firstPage.paperId : 'letter',
                orientation: firstPage ? firstPage.orientation : 'portrait',
                elements: [],
              },
            ],
            blocks: [],
          };
        }
        return {
          ...j,
          pages: remaining,
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
              stayPut: true,
              elements: [...p.elements, element],
            };
          }),
        };
      }),
    }));
  },

  removeElement: (jobId: string, pageId: string, elementId: string) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;
    const page = job.pages.find((p) => p.id === pageId);
    if (!page) return;
    const element = page.elements.find((el) => el.id === elementId);
    if (!element) return;

    const block = job.blocks?.find((b) => b.id === page.blockId);
    const isStayPut = isPageStayPut(page, job);

    if (isStayPut) {
      state.commit(jobId);
      const nextElements = page.elements.filter((el) => el.id !== elementId);
      let updatedBlocks = job.blocks || [];
      if (block && block.kind === 'sheet') {
        const rowId = element.rowId;
        const nextRows = (block.rows || []).map((r) => {
          const matches = rowId ? r.id === rowId : r.assetId === element.assetId;
          if (!matches) return r;
          const newQty = Math.max(0, (r.qty || 1) - 1);
          return { ...r, qty: newQty };
        }).filter((r) => r.qty > 0);
        updatedBlocks = updatedBlocks.map((b) =>
          b.id === block.id ? { ...b, rows: nextRows } : b
        );
      }
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                blocks: updatedBlocks,
                pages: j.pages.map((p) =>
                  p.id === pageId
                    ? { ...p, elements: nextElements, stayPut: true }
                    : p
                ),
              }
            : j
        ),
      }));
      useUiStore.getState().clearSelection();
      return;
    }

    if (block && block.kind === 'sheet') {
      state.commit(jobId);
      const rowId = element.rowId;
      const nextRows = (block.rows || []).map((r) => ({ ...r, id: r.id || nanoid() }));
      const targetIdx = nextRows.findIndex((r) => (rowId ? r.id === rowId : r.assetId === element.assetId));

      if (targetIdx >= 0) {
        const targetRow = nextRows[targetIdx];
        const newQty = targetRow.fillPage ? 0 : targetRow.qty - 1;
        if (newQty <= 0) {
          nextRows.splice(targetIdx, 1);
        } else {
          nextRows[targetIdx] = { ...targetRow, qty: newQty };
        }
      }

      const ctx = ctxForJob(job, state.assets);
      if (nextRows.length === 0) {
        const newBlocks = (job.blocks || []).filter((b) => b.id !== block.id);
        let newPages = job.pages.filter((p) => p.blockId !== block.id);
        if (newPages.length === 0) {
          newPages = [
            {
              id: nanoid(),
              paperId: page.paperId,
              orientation: page.orientation,
              elements: [],
            },
          ];
        }
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === jobId ? { ...j, blocks: newBlocks, pages: newPages } : j
          ),
        }));
      } else {
        const updatedBlock: Block = {
          ...block,
          assetIds: Array.from(new Set(nextRows.map((r) => r.assetId))),
          rows: nextRows,
          generatedSig: '',
        };
        const newPages = generateBlockPages(updatedBlock, ctx);
        updatedBlock.generatedSig = blockSignature(newPages);

        const firstIndex = job.pages.findIndex((p) => p.blockId === block.id);
        const pagesBefore = firstIndex === -1
          ? job.pages.filter((p) => p.blockId !== block.id)
          : job.pages.slice(0, firstIndex).filter((p) => p.blockId !== block.id);
        const pagesAfter = firstIndex === -1
          ? []
          : job.pages.slice(firstIndex).filter((p) => p.blockId !== block.id);
        const finalPages = [...pagesBefore, ...newPages, ...pagesAfter];

        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  blocks: (j.blocks || []).map((b) => (b.id === block.id ? updatedBlock : b)),
                  pages: finalPages,
                }
              : j
          ),
        }));
      }
      useUiStore.getState().clearSelection();
      return;
    }

    state.commit(jobId);
    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: j.pages.map((p) => {
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
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;
    const page = job.pages.find((p) => p.id === pageId);
    if (!page) return;

    const block = job.blocks?.find((b) => b.id === page.blockId);
    if (block && block.kind === 'sheet') {
      state.commit(jobId);
      const elementsToRemove = page.elements.filter((el) => elementIds.includes(el.id));
      const countsByRowId = new Map<string, number>();
      const countsByAssetId = new Map<string, number>();

      for (const el of elementsToRemove) {
        if (el.rowId) {
          countsByRowId.set(el.rowId, (countsByRowId.get(el.rowId) || 0) + 1);
        } else if (el.assetId) {
          countsByAssetId.set(el.assetId, (countsByAssetId.get(el.assetId) || 0) + 1);
        }
      }

      let nextRows = (block.rows || []).map((r) => ({ ...r, id: r.id || nanoid() }));
      nextRows = nextRows
        .map((r) => {
          const count = countsByRowId.get(r.id || '') || countsByAssetId.get(r.assetId) || 0;
          if (count === 0) return r;
          const newQty = r.fillPage ? 0 : r.qty - count;
          return { ...r, qty: newQty };
        })
        .filter((r) => r.qty > 0);

      const ctx = ctxForJob(job, state.assets);
      if (nextRows.length === 0) {
        const newBlocks = (job.blocks || []).filter((b) => b.id !== block.id);
        let newPages = job.pages.filter((p) => p.blockId !== block.id);
        if (newPages.length === 0) {
          newPages = [
            {
              id: nanoid(),
              paperId: page.paperId,
              orientation: page.orientation,
              elements: [],
            },
          ];
        }
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === jobId ? { ...j, blocks: newBlocks, pages: newPages } : j
          ),
        }));
      } else {
        const updatedBlock: Block = {
          ...block,
          assetIds: Array.from(new Set(nextRows.map((r) => r.assetId))),
          rows: nextRows,
          generatedSig: '',
        };
        const newPages = generateBlockPages(updatedBlock, ctx);
        updatedBlock.generatedSig = blockSignature(newPages);

        const firstIndex = job.pages.findIndex((p) => p.blockId === block.id);
        const pagesBefore = firstIndex === -1
          ? job.pages.filter((p) => p.blockId !== block.id)
          : job.pages.slice(0, firstIndex).filter((p) => p.blockId !== block.id);
        const pagesAfter = firstIndex === -1
          ? []
          : job.pages.slice(firstIndex).filter((p) => p.blockId !== block.id);
        const finalPages = [...pagesBefore, ...newPages, ...pagesAfter];

        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  blocks: (j.blocks || []).map((b) => (b.id === block.id ? updatedBlock : b)),
                  pages: finalPages,
                }
              : j
          ),
        }));
      }
      useUiStore.getState().clearSelection();
      return;
    }

    state.commit(jobId);
    const idSet = new Set(elementIds);
    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: j.pages.map((p) => {
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
              stayPut: true,
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
              stayPut: true,
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
              stayPut: true,
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
              stayPut: true,
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

    const block = job.blocks?.find((b) => b.id === page.blockId);
    const isStayPut = isPageStayPut(page, job);

    if (isStayPut) {
      state.commit(jobId);
      const { wMm, hMm } = getPageDimensionsMm(page);
      const effectiveMargin = job.settings.borderless ? 0 : job.settings.marginMm;
      const pRect = printableRect(wMm, hMm, effectiveMargin);
      const occupied: Rect[] = page.elements.map((el) => ({
        x: el.xMm,
        y: el.yMm,
        w: el.wMm,
        h: el.hMm,
      }));
      let spot = findSpot(occupied, element.wMm, element.hMm, pRect, job.settings.gapMm, {
        x: element.xMm + 5,
        y: element.yMm + 5,
      });
      if (!spot) {
        spot = findSpot(occupied, element.wMm, element.hMm, pRect, job.settings.gapMm);
      }
      const newElId = nanoid();
      const newEl: PageElement = {
        ...element,
        id: newElId,
        xMm: spot ? spot.x : Math.min(element.xMm + 5, pRect.x + pRect.w - element.wMm),
        yMm: spot ? spot.y : Math.min(element.yMm + 5, pRect.y + pRect.h - element.hMm),
      };

      let updatedBlocks = job.blocks || [];
      if (block && block.kind === 'sheet') {
        const rowId = element.rowId;
        const nextRows = (block.rows || []).map((r) => {
          const matches = rowId ? r.id === rowId : r.assetId === element.assetId;
          return matches ? { ...r, qty: (r.qty || 1) + 1 } : r;
        });
        updatedBlocks = updatedBlocks.map((b) =>
          b.id === block.id ? { ...b, rows: nextRows } : b
        );
      }

      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                blocks: updatedBlocks,
                pages: j.pages.map((p) =>
                  p.id === pageId
                    ? { ...p, elements: [...p.elements, newEl], stayPut: true }
                    : p
                ),
              }
            : j
        ),
      }));

      useUiStore.getState().setActivePage(page.id);
      useUiStore.getState().select({ pageId: page.id, elementId: newElId });
      if (element.assetId) {
        useUiStore.getState().setActiveAssetId(element.assetId);
      }
      return newElId;
    }

    if (block && block.kind === 'sheet' && element.assetId) {
      state.commit(jobId);
      const existingRows = (block.rows || []).map((r) => ({ ...r, id: r.id || nanoid() }));
      const sourceRow = existingRows.find((r) => r.id === element.rowId) ||
        existingRows.find((r) => r.assetId === element.assetId);

      const newRowId = nanoid();
      const newRow: SheetRow = {
        id: newRowId,
        assetId: element.assetId,
        size: sourceRow
          ? { ...sourceRow.size }
          : { id: `custom-${Math.round(element.wMm)}x${Math.round(element.hMm)}`, wMm: element.wMm, hMm: element.hMm },
        qty: 1,
        fillPage: false,
        crop: sourceRow ? Boolean(sourceRow.crop) : false,
      };

      const updatedRows = [...existingRows, newRow];
      const updatedBlock: Block = {
        ...block,
        assetIds: Array.from(new Set(updatedRows.map((r) => r.assetId))),
        rows: updatedRows,
        generatedSig: '',
      };

      const ctx = ctxForJob(job, state.assets);
      const newPages = generateBlockPages(updatedBlock, ctx);
      updatedBlock.generatedSig = blockSignature(newPages);

      const firstIndex = job.pages.findIndex((p) => p.blockId === block.id);
      const pagesBefore = firstIndex === -1
        ? job.pages.filter((p) => p.blockId !== block.id)
        : job.pages.slice(0, firstIndex).filter((p) => p.blockId !== block.id);
      const pagesAfter = firstIndex === -1
        ? []
        : job.pages.slice(firstIndex).filter((p) => p.blockId !== block.id);
      const finalPages = [...pagesBefore, ...newPages, ...pagesAfter];

      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                blocks: (j.blocks || []).map((b) => (b.id === block.id ? updatedBlock : b)),
                pages: finalPages,
              }
            : j
        ),
      }));

      const createdElement = newPages.flatMap((p) => p.elements).find((el) => el.rowId === newRowId);
      if (createdElement) {
        const targetPage = newPages.find((p) => p.elements.some((el) => el.id === createdElement.id));
        if (targetPage) {
          useUiStore.getState().setActivePage(targetPage.id);
          useUiStore.getState().select({ pageId: targetPage.id, elementId: createdElement.id });
          useUiStore.getState().setActiveAssetId(element.assetId);
        }
        return createdElement.id;
      }
      return null;
    }

    if (block && block.kind === 'fit' && element.assetId) {
      state.commit(jobId);
      const row1Id = nanoid();
      const row2Id = nanoid();
      const wMm = Math.round(element.wMm * 100) / 100;
      const hMm = Math.round(element.hMm * 100) / 100;
      const customSize = { id: `custom-${Math.round(wMm)}x${Math.round(hMm)}`, wMm, hMm };

      const sheetBlock: Block = {
        id: block.id,
        kind: 'sheet',
        assetIds: [element.assetId],
        rows: [
          { id: row1Id, assetId: element.assetId, size: customSize, qty: 1, fillPage: false, crop: false },
          { id: row2Id, assetId: element.assetId, size: customSize, qty: 1, fillPage: false, crop: false },
        ],
        generatedSig: '',
      };

      const ctx = ctxForJob(job, state.assets);
      const newPages = generateBlockPages(sheetBlock, ctx);
      sheetBlock.generatedSig = blockSignature(newPages);

      const firstIndex = job.pages.findIndex((p) => p.blockId === block.id);
      const pagesBefore = firstIndex === -1
        ? job.pages.filter((p) => p.blockId !== block.id)
        : job.pages.slice(0, firstIndex).filter((p) => p.blockId !== block.id);
      const pagesAfter = firstIndex === -1
        ? []
        : job.pages.slice(firstIndex).filter((p) => p.blockId !== block.id);
      const finalPages = [...pagesBefore, ...newPages, ...pagesAfter];

      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                blocks: (j.blocks || []).map((b) => (b.id === block.id ? sheetBlock : b)),
                pages: finalPages,
              }
            : j
        ),
      }));

      const createdElement = newPages.flatMap((p) => p.elements).find((el) => el.rowId === row2Id);
      if (createdElement) {
        const targetPage = newPages.find((p) => p.elements.some((el) => el.id === createdElement.id));
        if (targetPage) {
          useUiStore.getState().setActivePage(targetPage.id);
          useUiStore.getState().select({ pageId: targetPage.id, elementId: createdElement.id });
          useUiStore.getState().setActiveAssetId(element.assetId);
        }
        return createdElement.id;
      }
      return null;
    }

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
                stayPut: true,
                elements: p.elements.filter((el) => el.id !== elementId),
              };
            }
            if (p.id === toPageId) {
              return {
                ...p,
                stayPut: true,
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
      stayPut: true,
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
                  stayPut: true,
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

    const specAssetIds = specs.flatMap((s) =>
      s.rows ? s.rows.map((r) => r.assetId) : s.assetIds
    );
    const updatedAssetIds = Array.from(
      new Set([...getJobAssetIds(job), ...specAssetIds])
    );

    get().commit(jobId);

    set((state) => ({
      jobs: state.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          pages: finalPages,
          blocks: finalBlocks,
          assetIds: updatedAssetIds,
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
    target: PictureTarget,
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

    const { assetIds: targetAssetIds, rowIds: targetRowIds } = parsePictureTarget(target);
    if (targetAssetIds.length === 0 && (!targetRowIds || targetRowIds.length === 0)) return 'ok';
    const primaryAssetId = targetAssetIds[0] || '';

    const targetPage =
      job.pages.find((p) =>
        p.elements.some((el) =>
          (targetRowIds && targetRowIds.length > 0 && el.rowId && targetRowIds.includes(el.rowId)) ||
          (el.assetId && targetAssetIds.includes(el.assetId))
        )
      ) ||
      (useUiStore.getState().activePageId
        ? job.pages.find((p) => p.id === useUiStore.getState().activePageId)
        : undefined) ||
      job.pages[0];

    const affectedBlockIds = new Set<string>();
    if (targetPage?.blockId) {
      affectedBlockIds.add(targetPage.blockId);
    }
    for (const b of job.blocks || []) {
      if (
        b.assetIds.some((id) => targetAssetIds.includes(id)) ||
        (targetRowIds && targetRowIds.length > 0 && b.rows?.some((r) => r.id && targetRowIds.includes(r.id)))
      ) {
        affectedBlockIds.add(b.id);
      }
    }

    state.commit(jobId);
    const ctx = ctxForJob(job, state.assets);

    if (spec.mode === 'size') {
      const isStayPut = targetPage && isPageStayPut(targetPage, job);
      if (isStayPut && targetPage) {
        const { wMm, hMm } = getPageDimensionsMm(targetPage);
        const effectiveMargin = job.settings.borderless ? 0 : job.settings.marginMm;
        const pRect = printableRect(wMm, hMm, effectiveMargin);

        const { updatedElements, overflowElements } = applyStayPutVariantSizeOnPage({
          page: targetPage,
          targetAssetIds,
          targetRowIds: targetRowIds || [],
          newSize: spec.size,
          pRect,
          gapMm: job.settings.gapMm,
        });

        let updatedPages = job.pages.map((p) =>
          p.id === targetPage.id
            ? { ...p, elements: updatedElements, stayPut: true }
            : p
        );

        if (overflowElements.length > 0) {
          const startIdx = updatedPages.findIndex((p) => p.id === targetPage.id);
          updatedPages = placeOverflowElements(
            overflowElements,
            updatedPages,
            targetPage.paperId,
            targetPage.orientation,
            effectiveMargin,
            job.settings.gapMm,
            startIdx >= 0 ? startIdx : updatedPages.length - 1
          );
        }

        let updatedBlocks = [...(job.blocks || [])];
        if (targetPage.blockId) {
          updatedBlocks = updatedBlocks.map((b) => {
            if (b.id !== targetPage.blockId) return b;
            const nextRows = (b.rows || []).map((r) => {
              const matches =
                targetRowIds && targetRowIds.length > 0
                  ? targetRowIds.includes(r.id || '')
                  : targetAssetIds.includes(r.assetId);
              return matches ? { ...r, size: spec.size } : r;
            });
            return { ...b, rows: nextRows };
          });
        }

        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  blocks: updatedBlocks,
                  pages: updatedPages,
                }
              : j
          ),
        }));

        const reselectedIds = updatedElements
          .filter((el) =>
            targetRowIds && targetRowIds.length > 0
              ? targetRowIds.includes(el.rowId || '')
              : el.assetId && targetAssetIds.includes(el.assetId)
          )
          .map((el) => el.id);

        if (reselectedIds.length === 1) {
          useUiStore.getState().setActivePage(targetPage.id);
          useUiStore.getState().select({ pageId: targetPage.id, elementId: reselectedIds[0] });
        } else if (reselectedIds.length > 1) {
          useUiStore.getState().setActivePage(targetPage.id);
          useUiStore.getState().setSelection(targetPage.id, reselectedIds);
        }

        return 'ok';
      }

      const existingSheetBlock = targetPage?.blockId
        ? job.blocks.find((b) => b.id === targetPage.blockId && b.kind === 'sheet')
        : (job.blocks || []).find((b) => b.kind === 'sheet');

      if (existingSheetBlock?.id) {
        affectedBlockIds.add(existingSheetBlock.id);
      }

      const existingRows: SheetRow[] = existingSheetBlock?.rows
        ? existingSheetBlock.rows.map((r) => ({ ...r, id: r.id || nanoid() }))
        : [];

      const pageElements = targetPage ? targetPage.elements : [];
      const pageAssetIds = Array.from(
        new Set(pageElements.map((el) => el.assetId).filter((id): id is string => Boolean(id)))
      );

      const nextRows: SheetRow[] = [...existingRows];
      if (targetRowIds && targetRowIds.length > 0) {
        // Targeted by specific variant(s) on the canvas
        for (const rId of targetRowIds) {
          const rowIdx = nextRows.findIndex((r) => r.id === rId);
          if (rowIdx >= 0) {
            nextRows[rowIdx] = {
              ...nextRows[rowIdx],
              size: spec.size,
            };
          }
        }
      } else {
        // Thumbnail clicked in PICTURES menu:
        // Merge all variants of each target picture on that page into ONE variant with the new size!
        for (const id of targetAssetIds) {
          const matchingIndices: number[] = [];
          for (let i = 0; i < nextRows.length; i++) {
            if (nextRows[i].assetId === id) {
              matchingIndices.push(i);
            }
          }
          if (matchingIndices.length > 0) {
            const firstIdx = matchingIndices[0];
            const totalQty = matchingIndices.reduce((sum, idx) => sum + (nextRows[idx].qty || 1), 0);
            const firstRow = nextRows[firstIdx];
            for (let i = matchingIndices.length - 1; i > 0; i--) {
              nextRows.splice(matchingIndices[i], 1);
            }
            nextRows[firstIdx] = {
              ...firstRow,
              size: spec.size,
              qty: totalQty,
              fillPage: false,
              crop: false,
            };
          } else {
            nextRows.push({
              id: nanoid(),
              assetId: id,
              size: spec.size,
              qty: 1,
              fillPage: false,
              crop: false,
            });
          }
        }
      }

      for (const id of pageAssetIds) {
        if (!nextRows.some((r) => r.assetId === id)) {
          const el = pageElements.find((e) => e.assetId === id);
          let wMm = 50;
          let hMm = 50;
          if (el) {
            wMm = el.wMm;
            hMm = el.hMm;
          } else {
            const asset = state.assets.find((a) => a.id === id);
            if (asset) {
              const maxW = Math.max(10, ctx.pageWMm - 2 * ctx.marginMm);
              const maxH = Math.max(10, ctx.pageHMm - 2 * ctx.marginMm);
              const aspect = asset.pxW / asset.pxH;
              if (aspect >= maxW / maxH) {
                wMm = maxW;
                hMm = maxW / aspect;
              } else {
                hMm = maxH;
                wMm = maxH * aspect;
              }
            }
          }
          nextRows.push({
            id: nanoid(),
            assetId: id,
            size: { id: `custom-${Math.round(wMm)}x${Math.round(hMm)}`, wMm, hMm },
            qty: 1,
            fillPage: false,
            crop: false,
          });
        }
      }

      const sizedAssetIds = new Set(nextRows.map((r) => r.assetId));
      const detachedDefaultAssetIds = pageAssetIds.filter((id) => !sizedAssetIds.has(id));

      const sheetBlockId = existingSheetBlock?.id || targetPage?.blockId || nanoid();
      const sheetBlock: Block = {
        id: sheetBlockId,
        kind: 'sheet',
        assetIds: nextRows.map((r) => r.assetId),
        rows: nextRows,
        generatedSig: '',
      };
      const newSheetPages = generateBlockPages(sheetBlock, ctx);
      sheetBlock.generatedSig = blockSignature(newSheetPages);

      const detachedBlocks: Block[] = [];
      const detachedPages: Page[] = [];
      for (const defId of detachedDefaultAssetIds) {
        const dBlock: Block = {
          id: nanoid(),
          kind: 'fit',
          assetIds: [defId],
          generatedSig: '',
        };
        const dPages = generateBlockPages(dBlock, ctx);
        dBlock.generatedSig = blockSignature(dPages);
        detachedBlocks.push(dBlock);
        detachedPages.push(...dPages);
      }

      const updatedBlocks: Block[] = [];
      let sheetInserted = false;
      for (const b of job.blocks || []) {
        if (affectedBlockIds.has(b.id)) {
          if (!sheetInserted) {
            updatedBlocks.push(sheetBlock, ...detachedBlocks);
            sheetInserted = true;
          }
        } else {
          const remIds = b.assetIds.filter((id) => !targetAssetIds.includes(id));
          if (remIds.length > 0) {
            updatedBlocks.push({
              ...b,
              assetIds: remIds,
              rows: b.rows ? b.rows.filter((r) => remIds.includes(r.assetId)) : undefined,
            });
          }
        }
      }
      if (!sheetInserted) {
        updatedBlocks.push(sheetBlock, ...detachedBlocks);
      }

      const firstTargetPageIdx = targetPage ? job.pages.indexOf(targetPage) : 0;
      const pagesBefore = job.pages
        .slice(0, firstTargetPageIdx)
        .filter((p) => !affectedBlockIds.has(p.blockId || '') && p.id !== targetPage?.id);
      const pagesAfter = job.pages
        .slice(firstTargetPageIdx)
        .filter((p) => !affectedBlockIds.has(p.blockId || '') && p.id !== targetPage?.id);

      const finalPages = [...pagesBefore, ...newSheetPages, ...detachedPages, ...pagesAfter];

      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                blocks: updatedBlocks,
                pages: finalPages,
              }
            : j
        ),
      }));

      if (targetRowIds && targetRowIds.length > 0) {
        const matchingEls = newSheetPages.flatMap((p) => p.elements).filter((el) => targetRowIds.includes(el.rowId || ''));
        if (matchingEls.length > 0) {
          const firstEl = matchingEls[0];
          const pageWithEl = newSheetPages.find((p) => p.elements.some((e) => e.id === firstEl.id));
          if (pageWithEl) {
            useUiStore.getState().setActivePage(pageWithEl.id);
            if (matchingEls.length === 1) {
              useUiStore.getState().select({ pageId: pageWithEl.id, elementId: firstEl.id });
            } else {
              useUiStore.getState().setSelection(pageWithEl.id, matchingEls.map((e) => e.id));
            }
          }
        }
      } else {
        checkAndClearSelection();
      }
      return 'ok';
    }

    const targetKind = spec.mode === 'default' ? 'fit' : spec.mode;
    let currentBlocks = [...job.blocks];
    let currentPages = [...job.pages];

    for (const id of targetAssetIds) {
      const existingBlock = currentBlocks.find((b) => b.assetIds.includes(id));
      if (!existingBlock) continue;

      if (existingBlock.kind === 'sheet') {
        const remainingRows = (existingBlock.rows || []).filter((r) => r.assetId !== id);
        if (remainingRows.length > 0) {
          const updatedRemainingBlock: Block = {
            ...existingBlock,
            assetIds: remainingRows.map((r) => r.assetId),
            rows: remainingRows,
            generatedSig: '',
          };
          const updatedRemainingPages = generateBlockPages(updatedRemainingBlock, ctx);
          updatedRemainingBlock.generatedSig = blockSignature(updatedRemainingPages);

          const newDetachedBlock: Block = {
            id: nanoid(),
            kind: targetKind,
            assetIds: [id],
            generatedSig: '',
          };
          const newDetachedPages = generateBlockPages(newDetachedBlock, ctx);
          newDetachedBlock.generatedSig = blockSignature(newDetachedPages);

          const firstIndex = currentPages.findIndex((p) => p.blockId === existingBlock.id);
          const pagesBefore = firstIndex === -1
            ? currentPages.filter((p) => p.blockId !== existingBlock.id)
            : currentPages.slice(0, firstIndex).filter((p) => p.blockId !== existingBlock.id);
          const pagesAfter = firstIndex === -1
            ? []
            : currentPages.slice(firstIndex).filter((p) => p.blockId !== existingBlock.id);

          currentBlocks = currentBlocks.flatMap((b) =>
            b.id === existingBlock.id ? [updatedRemainingBlock, newDetachedBlock] : [b]
          );
          currentPages = [...pagesBefore, ...updatedRemainingPages, ...newDetachedPages, ...pagesAfter];
        } else {
          const updatedBlock: Block = {
            ...existingBlock,
            kind: targetKind,
            rows: undefined,
            collageOption: undefined,
            generatedSig: '',
          };
          const newPages = generateBlockPages(updatedBlock, ctx);
          updatedBlock.generatedSig = blockSignature(newPages);

          const firstIndex = currentPages.findIndex((p) => p.blockId === existingBlock.id);
          const pagesBefore = firstIndex === -1
            ? currentPages.filter((p) => p.blockId !== existingBlock.id)
            : currentPages.slice(0, firstIndex).filter((p) => p.blockId !== existingBlock.id);
          const pagesAfter = firstIndex === -1
            ? []
            : currentPages.slice(firstIndex).filter((p) => p.blockId !== existingBlock.id);

          currentBlocks = currentBlocks.map((b) => (b.id === existingBlock.id ? updatedBlock : b));
          currentPages = [...pagesBefore, ...newPages, ...pagesAfter];
        }
      } else if (existingBlock.kind === 'collage') {
        const remainingAssetIds = existingBlock.assetIds.filter((aid) => aid !== id);
        const newDetachedBlock: Block = {
          id: nanoid(),
          kind: targetKind,
          assetIds: [id],
          generatedSig: '',
        };
        const newDetachedPages = generateBlockPages(newDetachedBlock, ctx);
        newDetachedBlock.generatedSig = blockSignature(newDetachedPages);

        let updatedRemainingBlock: Block | null = null;
        let updatedRemainingPages: Page[] = [];
        if (remainingAssetIds.length > 0) {
          updatedRemainingBlock = {
            ...existingBlock,
            assetIds: remainingAssetIds,
            kind: remainingAssetIds.length === 1 ? 'fit' : 'collage',
            collageOption: remainingAssetIds.length === 1 ? undefined : existingBlock.collageOption,
            generatedSig: '',
          };
          updatedRemainingPages = generateBlockPages(updatedRemainingBlock, ctx);
          updatedRemainingBlock.generatedSig = blockSignature(updatedRemainingPages);
        }

        const firstIndex = currentPages.findIndex((p) => p.blockId === existingBlock.id);
        const pagesBefore = firstIndex === -1
          ? currentPages.filter((p) => p.blockId !== existingBlock.id)
          : currentPages.slice(0, firstIndex).filter((p) => p.blockId !== existingBlock.id);
        const pagesAfter = firstIndex === -1
          ? []
          : currentPages.slice(firstIndex).filter((p) => p.blockId !== existingBlock.id);

        currentBlocks = currentBlocks.flatMap((b) => {
          if (b.id !== existingBlock.id) return [b];
          return updatedRemainingBlock ? [updatedRemainingBlock, newDetachedBlock] : [newDetachedBlock];
        });
        currentPages = [...pagesBefore, ...updatedRemainingPages, ...newDetachedPages, ...pagesAfter];
      } else {
        const updatedBlock: Block = {
          ...existingBlock,
          kind: targetKind,
          rows: undefined,
          collageOption: undefined,
          generatedSig: '',
        };
        const newPages = generateBlockPages(updatedBlock, ctx);
        updatedBlock.generatedSig = blockSignature(newPages);

        const firstIndex = currentPages.findIndex((p) => p.blockId === existingBlock.id);
        const pagesBefore = firstIndex === -1
          ? currentPages.filter((p) => p.blockId !== existingBlock.id)
          : currentPages.slice(0, firstIndex).filter((p) => p.blockId !== existingBlock.id);
        const pagesAfter = firstIndex === -1
          ? []
          : currentPages.slice(firstIndex).filter((p) => p.blockId !== existingBlock.id);

        currentBlocks = currentBlocks.map((b) => (b.id === existingBlock.id ? updatedBlock : b));
        currentPages = [...pagesBefore, ...newPages, ...pagesAfter];
      }
    }

    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              blocks: currentBlocks,
              pages: currentPages,
            }
          : j
      ),
    }));

    checkAndClearSelection();
    return 'ok';
  },

  setPictureQty: (
    jobId: string,
    target: PictureTarget,
    qty: number,
    opts?: { force?: boolean }
  ) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return 'ok';

    const { assetIds: targetAssetIds, rowIds: targetRowIds } = parsePictureTarget(target);
    const clamped = Math.min(500, Math.max(1, Math.round(qty) || 1));

    const targetPage =
      job.pages.find((p) =>
        p.elements.some((el) =>
          (targetRowIds && targetRowIds.length > 0 && el.rowId && targetRowIds.includes(el.rowId)) ||
          (el.assetId && targetAssetIds.includes(el.assetId))
        )
      ) ||
      (useUiStore.getState().activePageId
        ? job.pages.find((p) => p.id === useUiStore.getState().activePageId)
        : undefined) ||
      job.pages[0];

    const isStayPut = targetPage && isPageStayPut(targetPage, job);
    if (isStayPut && targetPage) {
      state.commit(jobId);
      const { wMm, hMm } = getPageDimensionsMm(targetPage);
      const effectiveMargin = job.settings.borderless ? 0 : job.settings.marginMm;
      const pRect = printableRect(wMm, hMm, effectiveMargin);

      const targetEl = targetPage.elements.find((el) =>
        targetRowIds && targetRowIds.length > 0
          ? targetRowIds.includes(el.rowId || '')
          : el.assetId && targetAssetIds.includes(el.assetId)
      );
      const itemW = targetEl ? targetEl.wMm : 50;
      const itemH = targetEl ? targetEl.hMm : 50;

      const { updatedElements, overflowElements } = applyStayPutQuantityOnPage({
        page: targetPage,
        targetAssetIds,
        targetRowIds: targetRowIds || [],
        newQty: clamped,
        itemSize: { id: '', wMm: itemW, hMm: itemH },
        pRect,
        gapMm: job.settings.gapMm,
      });

      let updatedPages = job.pages.map((p) =>
        p.id === targetPage.id
          ? { ...p, elements: updatedElements, stayPut: true }
          : p
      );

      if (overflowElements.length > 0) {
        const startIdx = updatedPages.findIndex((p) => p.id === targetPage.id);
        updatedPages = placeOverflowElements(
          overflowElements,
          updatedPages,
          targetPage.paperId,
          targetPage.orientation,
          effectiveMargin,
          job.settings.gapMm,
          startIdx >= 0 ? startIdx : updatedPages.length - 1
        );
      }

      let updatedBlocks = [...(job.blocks || [])];
      if (targetPage.blockId) {
        updatedBlocks = updatedBlocks.map((b) => {
          if (b.id !== targetPage.blockId) return b;
          const nextRows = (b.rows || []).map((r) => {
            const matches =
              targetRowIds && targetRowIds.length > 0
                ? targetRowIds.includes(r.id || '')
                : targetAssetIds.includes(r.assetId);
            return matches ? { ...r, qty: clamped, fillPage: false } : r;
          });
          return { ...b, rows: nextRows };
        });
      }

      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                blocks: updatedBlocks,
                pages: updatedPages,
              }
            : j
        ),
      }));

      const reselectedIds = updatedElements
        .filter((el) =>
          targetRowIds && targetRowIds.length > 0
            ? targetRowIds.includes(el.rowId || '')
            : el.assetId && targetAssetIds.includes(el.assetId)
        )
        .map((el) => el.id);

      if (reselectedIds.length === 1) {
        useUiStore.getState().setActivePage(targetPage.id);
        useUiStore.getState().select({ pageId: targetPage.id, elementId: reselectedIds[0] });
      } else if (reselectedIds.length > 1) {
        useUiStore.getState().setActivePage(targetPage.id);
        useUiStore.getState().setSelection(targetPage.id, reselectedIds);
      }

      return 'ok';
    }

    const affectedBlocks = (job.blocks || []).filter(
      (b) =>
        b.kind === 'sheet' &&
        b.rows?.some((r) =>
          targetRowIds && targetRowIds.length > 0
            ? targetRowIds.includes(r.id || '')
            : targetAssetIds.includes(r.assetId)
        )
    );
    if (affectedBlocks.length === 0) return 'ok';

    state.commit(jobId);

    const ctx = ctxForJob(job, state.assets);
    let currentBlocks = [...job.blocks];
    let currentPages = [...job.pages];

    for (const block of affectedBlocks) {
      const nextRows = (block.rows || []).map((row) => {
        const matches =
          targetRowIds && targetRowIds.length > 0
            ? targetRowIds.includes(row.id || '')
            : targetAssetIds.includes(row.assetId);
        return matches ? { ...row, qty: clamped, fillPage: false } : row;
      });
      const updatedBlock: Block = {
        ...block,
        rows: nextRows,
        generatedSig: '',
      };
      const newPages = generateBlockPages(updatedBlock, ctx);
      updatedBlock.generatedSig = blockSignature(newPages);

      currentBlocks = currentBlocks.map((b) => (b.id === block.id ? updatedBlock : b));

      const firstPageIdx = currentPages.findIndex((p) => p.blockId === block.id);
      const pagesBefore = firstPageIdx === -1
        ? currentPages.filter((p) => p.blockId !== block.id)
        : currentPages.slice(0, firstPageIdx).filter((p) => p.blockId !== block.id);
      const pagesAfter = firstPageIdx === -1
        ? []
        : currentPages.slice(firstPageIdx).filter((p) => p.blockId !== block.id);

      currentPages = [...pagesBefore, ...newPages, ...pagesAfter];
    }

    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              blocks: currentBlocks,
              pages: currentPages,
            }
          : j
      ),
    }));

    if (targetRowIds && targetRowIds.length > 0) {
      const matchingEls = currentPages.flatMap((p) => p.elements).filter((el) => targetRowIds.includes(el.rowId || ''));
      if (matchingEls.length > 0) {
        const firstEl = matchingEls[0];
        const pageWithEl = currentPages.find((p) => p.elements.some((e) => e.id === firstEl.id));
        if (pageWithEl) {
          useUiStore.getState().setActivePage(pageWithEl.id);
          if (matchingEls.length === 1) {
            useUiStore.getState().select({ pageId: pageWithEl.id, elementId: firstEl.id });
          } else {
            useUiStore.getState().setSelection(pageWithEl.id, matchingEls.map((e) => e.id));
          }
        }
      }
    }

    return 'ok';
  },

  setPictureFillPage: (
    jobId: string,
    target: PictureTarget,
    value: boolean,
    opts?: { force?: boolean }
  ) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return 'ok';

    const { assetIds: targetAssetIds, rowIds: targetRowIds } = parsePictureTarget(target);

    const targetPage =
      job.pages.find((p) =>
        p.elements.some((el) =>
          (targetRowIds && targetRowIds.length > 0 && el.rowId && targetRowIds.includes(el.rowId)) ||
          (el.assetId && targetAssetIds.includes(el.assetId))
        )
      ) ||
      (useUiStore.getState().activePageId
        ? job.pages.find((p) => p.id === useUiStore.getState().activePageId)
        : undefined) ||
      job.pages[0];

    const isStayPut = targetPage && isPageStayPut(targetPage, job);
    if (isStayPut && targetPage) {
      state.commit(jobId);
      if (value) {
        const { wMm, hMm } = getPageDimensionsMm(targetPage);
        const effectiveMargin = job.settings.borderless ? 0 : job.settings.marginMm;
        const pRect = printableRect(wMm, hMm, effectiveMargin);

        const targetEl = targetPage.elements.find((el) =>
          targetRowIds && targetRowIds.length > 0
            ? targetRowIds.includes(el.rowId || '')
            : el.assetId && targetAssetIds.includes(el.assetId)
        );
        const itemW = targetEl ? targetEl.wMm : 50;
        const itemH = targetEl ? targetEl.hMm : 50;

        const { updatedElements, totalPlaced } = applyStayPutFillPageOnPage({
          page: targetPage,
          targetAssetIds,
          targetRowIds: targetRowIds || [],
          itemSize: { id: '', wMm: itemW, hMm: itemH },
          pRect,
          gapMm: job.settings.gapMm,
        });

        let updatedBlocks = [...(job.blocks || [])];
        if (targetPage.blockId) {
          updatedBlocks = updatedBlocks.map((b) => {
            if (b.id !== targetPage.blockId) return b;
            const nextRows = (b.rows || []).map((r) => {
              const matches =
                targetRowIds && targetRowIds.length > 0
                  ? targetRowIds.includes(r.id || '')
                  : targetAssetIds.includes(r.assetId);
              return matches ? { ...r, fillPage: true, qty: totalPlaced } : r;
            });
            return { ...b, rows: nextRows };
          });
        }

        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  blocks: updatedBlocks,
                  pages: j.pages.map((p) =>
                    p.id === targetPage.id
                      ? { ...p, elements: updatedElements, stayPut: true }
                      : p
                  ),
                }
              : j
          ),
        }));
      } else {
        let updatedBlocks = [...(job.blocks || [])];
        if (targetPage.blockId) {
          updatedBlocks = updatedBlocks.map((b) => {
            if (b.id !== targetPage.blockId) return b;
            const nextRows = (b.rows || []).map((r) => {
              const matches =
                targetRowIds && targetRowIds.length > 0
                  ? targetRowIds.includes(r.id || '')
                  : targetAssetIds.includes(r.assetId);
              return matches ? { ...r, fillPage: false } : r;
            });
            return { ...b, rows: nextRows };
          });
        }
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, blocks: updatedBlocks } : j)),
        }));
      }
      return 'ok';
    }

    const affectedBlocks = (job.blocks || []).filter(
      (b) =>
        b.kind === 'sheet' &&
        b.rows?.some((r) =>
          targetRowIds && targetRowIds.length > 0
            ? targetRowIds.includes(r.id || '')
            : targetAssetIds.includes(r.assetId)
        )
    );
    if (affectedBlocks.length === 0) return 'ok';

    state.commit(jobId);

    const ctx = ctxForJob(job, state.assets);
    let currentBlocks = [...job.blocks];
    let currentPages = [...job.pages];

    for (const block of affectedBlocks) {
      const nextRows = (block.rows || []).map((row) => {
        const matches =
          targetRowIds && targetRowIds.length > 0
            ? targetRowIds.includes(row.id || '')
            : targetAssetIds.includes(row.assetId);
        return matches ? { ...row, fillPage: value } : row;
      });
      const updatedBlock: Block = {
        ...block,
        rows: nextRows,
        generatedSig: '',
      };
      const newPages = generateBlockPages(updatedBlock, ctx);
      updatedBlock.generatedSig = blockSignature(newPages);

      currentBlocks = currentBlocks.map((b) => (b.id === block.id ? updatedBlock : b));

      const firstPageIdx = currentPages.findIndex((p) => p.blockId === block.id);
      const pagesBefore = firstPageIdx === -1
        ? currentPages.filter((p) => p.blockId !== block.id)
        : currentPages.slice(0, firstPageIdx).filter((p) => p.blockId !== block.id);
      const pagesAfter = firstPageIdx === -1
        ? []
        : currentPages.slice(firstPageIdx).filter((p) => p.blockId !== block.id);

      currentPages = [...pagesBefore, ...newPages, ...pagesAfter];
    }

    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              blocks: currentBlocks,
              pages: currentPages,
            }
          : j
      ),
    }));

    if (targetRowIds && targetRowIds.length > 0) {
      const matchingEls = currentPages.flatMap((p) => p.elements).filter((el) => targetRowIds.includes(el.rowId || ''));
      if (matchingEls.length > 0) {
        const firstEl = matchingEls[0];
        const pageWithEl = currentPages.find((p) => p.elements.some((e) => e.id === firstEl.id));
        if (pageWithEl) {
          useUiStore.getState().setActivePage(pageWithEl.id);
          if (matchingEls.length === 1) {
            useUiStore.getState().select({ pageId: pageWithEl.id, elementId: firstEl.id });
          } else {
            useUiStore.getState().setSelection(pageWithEl.id, matchingEls.map((e) => e.id));
          }
        }
      }
    }

    return 'ok';
  },

  setPictureSizeAndQty: (
    jobId: string,
    target: PictureTarget,
    size: { id: string; wMm: number; hMm: number },
    qty: number,
    opts?: { force?: boolean }
  ) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return 'not-found';

    const { assetIds: targetAssetIds, rowIds: targetRowIds } = parsePictureTarget(target);
    if (targetAssetIds.length === 0 && (!targetRowIds || targetRowIds.length === 0)) return 'ok';
    const primaryAssetId = targetAssetIds[0] || '';

    const targetPage =
      job.pages.find((p) =>
        p.elements.some((el) =>
          (targetRowIds && targetRowIds.length > 0 && el.rowId && targetRowIds.includes(el.rowId)) ||
          (el.assetId && targetAssetIds.includes(el.assetId))
        )
      ) ||
      (useUiStore.getState().activePageId
        ? job.pages.find((p) => p.id === useUiStore.getState().activePageId)
        : undefined) ||
      job.pages[0];

    const affectedBlockIds = new Set<string>();
    if (targetPage?.blockId) {
      affectedBlockIds.add(targetPage.blockId);
    }
    for (const b of job.blocks || []) {
      if (
        b.assetIds.some((id) => targetAssetIds.includes(id)) ||
        (targetRowIds && targetRowIds.length > 0 && b.rows?.some((r) => r.id && targetRowIds.includes(r.id)))
      ) {
        affectedBlockIds.add(b.id);
      }
    }

    state.commit(jobId);
    const ctx = ctxForJob(job, state.assets);
    const clampedQty = Math.min(500, Math.max(1, Math.round(qty) || 1));

    const isStayPut = targetPage && isPageStayPut(targetPage, job);
    if (isStayPut && targetPage) {
      const { wMm, hMm } = getPageDimensionsMm(targetPage);
      const effectiveMargin = job.settings.borderless ? 0 : job.settings.marginMm;
      const pRect = printableRect(wMm, hMm, effectiveMargin);

      // 1. Resize variant
      const { updatedElements: sizedElements, overflowElements: sizeOverflow } = applyStayPutVariantSizeOnPage({
        page: targetPage,
        targetAssetIds,
        targetRowIds: targetRowIds || [],
        newSize: size,
        pRect,
        gapMm: job.settings.gapMm,
      });

      // 2. Adjust quantity
      const { updatedElements: qtyElements, overflowElements: qtyOverflow } = applyStayPutQuantityOnPage({
        page: { ...targetPage, elements: sizedElements },
        targetAssetIds,
        targetRowIds: targetRowIds || [],
        newQty: clampedQty,
        itemSize: size,
        pRect,
        gapMm: job.settings.gapMm,
      });

      const allOverflow = [...sizeOverflow, ...qtyOverflow];
      let updatedPages = job.pages.map((p) =>
        p.id === targetPage.id
          ? { ...p, elements: qtyElements, stayPut: true }
          : p
      );

      if (allOverflow.length > 0) {
        const startIdx = updatedPages.findIndex((p) => p.id === targetPage.id);
        updatedPages = placeOverflowElements(
          allOverflow,
          updatedPages,
          targetPage.paperId,
          targetPage.orientation,
          effectiveMargin,
          job.settings.gapMm,
          startIdx >= 0 ? startIdx : updatedPages.length - 1
        );
      }

      let updatedBlocks = [...(job.blocks || [])];
      if (targetPage.blockId) {
        updatedBlocks = updatedBlocks.map((b) => {
          if (b.id !== targetPage.blockId) return b;
          const nextRows = (b.rows || []).map((r) => {
            const matches =
              targetRowIds && targetRowIds.length > 0
                ? targetRowIds.includes(r.id || '')
                : targetAssetIds.includes(r.assetId);
            return matches ? { ...r, size, qty: clampedQty, fillPage: false } : r;
          });
          return { ...b, rows: nextRows };
        });
      }

      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                blocks: updatedBlocks,
                pages: updatedPages,
              }
            : j
        ),
      }));

      const reselectedIds = qtyElements
        .filter((el) =>
          targetRowIds && targetRowIds.length > 0
            ? targetRowIds.includes(el.rowId || '')
            : el.assetId && targetAssetIds.includes(el.assetId)
        )
        .map((el) => el.id);

      if (reselectedIds.length === 1) {
        useUiStore.getState().setActivePage(targetPage.id);
        useUiStore.getState().select({ pageId: targetPage.id, elementId: reselectedIds[0] });
      } else if (reselectedIds.length > 1) {
        useUiStore.getState().setActivePage(targetPage.id);
        useUiStore.getState().setSelection(targetPage.id, reselectedIds);
      }

      return 'ok';
    }

    const existingSheetBlock = targetPage?.blockId
      ? job.blocks.find((b) => b.id === targetPage.blockId && b.kind === 'sheet')
      : (job.blocks || []).find((b) => b.kind === 'sheet');

    if (existingSheetBlock?.id) {
      affectedBlockIds.add(existingSheetBlock.id);
    }

    const existingRows: SheetRow[] = existingSheetBlock?.rows
      ? existingSheetBlock.rows.map((r) => ({ ...r, id: r.id || nanoid() }))
      : [];

    const pageElements = targetPage ? targetPage.elements : [];
    const pageAssetIds = Array.from(
      new Set(pageElements.map((el) => el.assetId).filter((id): id is string => Boolean(id)))
    );

    const nextRows: SheetRow[] = [...existingRows];
    if (targetRowIds && targetRowIds.length > 0) {
      for (const rId of targetRowIds) {
        const rowIdx = nextRows.findIndex((r) => r.id === rId);
        if (rowIdx >= 0) {
          nextRows[rowIdx] = {
            ...nextRows[rowIdx],
            size,
            qty: clampedQty,
            fillPage: false,
          };
        }
      }
    } else {
      for (const id of targetAssetIds) {
        const matchingIndices: number[] = [];
        for (let i = 0; i < nextRows.length; i++) {
          if (nextRows[i].assetId === id) {
            matchingIndices.push(i);
          }
        }
        if (matchingIndices.length > 0) {
          const firstIdx = matchingIndices[0];
          const firstRow = nextRows[firstIdx];
          for (let i = matchingIndices.length - 1; i > 0; i--) {
            nextRows.splice(matchingIndices[i], 1);
          }
          nextRows[firstIdx] = {
            ...firstRow,
            size,
            qty: clampedQty,
            fillPage: false,
          };
        } else {
          nextRows.push({
            id: nanoid(),
            assetId: id,
            size,
            qty: clampedQty,
            fillPage: false,
            crop: false,
          });
        }
      }
    }

    for (const id of pageAssetIds) {
      if (!nextRows.some((r) => r.assetId === id)) {
        const el = pageElements.find((e) => e.assetId === id);
        let wMm = 50;
        let hMm = 50;
        if (el) {
          wMm = el.wMm;
          hMm = el.hMm;
        } else {
          const asset = state.assets.find((a) => a.id === id);
          if (asset) {
            const maxW = Math.max(10, ctx.pageWMm - 2 * ctx.marginMm);
            const maxH = Math.max(10, ctx.pageHMm - 2 * ctx.marginMm);
            const aspect = asset.pxW / asset.pxH;
            if (aspect >= maxW / maxH) {
              wMm = maxW;
              hMm = maxW / aspect;
            } else {
              hMm = maxH;
              wMm = maxH * aspect;
            }
          }
        }
        nextRows.push({
          id: nanoid(),
          assetId: id,
          size: { id: `custom-${Math.round(wMm)}x${Math.round(hMm)}`, wMm, hMm },
          qty: 1,
          fillPage: false,
          crop: false,
        });
      }
    }

    const sheetBlockId = existingSheetBlock?.id || targetPage?.blockId || nanoid();
    const sheetBlock: Block = {
      id: sheetBlockId,
      kind: 'sheet',
      assetIds: nextRows.map((r) => r.assetId),
      rows: nextRows,
      generatedSig: '',
    };
    const newSheetPages = generateBlockPages(sheetBlock, ctx);
    sheetBlock.generatedSig = blockSignature(newSheetPages);

    const updatedBlocks: Block[] = [];
    let sheetInserted = false;
    for (const b of job.blocks || []) {
      if (affectedBlockIds.has(b.id)) {
        if (!sheetInserted) {
          updatedBlocks.push(sheetBlock);
          sheetInserted = true;
        }
      } else {
        const remIds = b.assetIds.filter((id) => !targetAssetIds.includes(id));
        if (remIds.length > 0) {
          updatedBlocks.push({
            ...b,
            assetIds: remIds,
            rows: b.rows ? b.rows.filter((r) => remIds.includes(r.assetId)) : undefined,
          });
        }
      }
    }
    if (!sheetInserted) {
      updatedBlocks.push(sheetBlock);
    }

    const firstTargetPageIdx = targetPage ? job.pages.indexOf(targetPage) : 0;
    const pagesBefore = job.pages
      .slice(0, firstTargetPageIdx)
      .filter((p) => !affectedBlockIds.has(p.blockId || '') && p.id !== targetPage?.id);
    const pagesAfter = job.pages
      .slice(firstTargetPageIdx)
      .filter((p) => !affectedBlockIds.has(p.blockId || '') && p.id !== targetPage?.id);

    const finalPages = [...pagesBefore, ...newSheetPages, ...pagesAfter];

    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              blocks: updatedBlocks,
              pages: finalPages,
            }
          : j
      ),
    }));

    if (targetRowIds && targetRowIds.length > 0) {
      const matchingEls = newSheetPages.flatMap((p) => p.elements).filter((el) => targetRowIds.includes(el.rowId || ''));
      if (matchingEls.length > 0) {
        const firstEl = matchingEls[0];
        const pageWithEl = newSheetPages.find((p) => p.elements.some((e) => e.id === firstEl.id));
        if (pageWithEl) {
          useUiStore.getState().setActivePage(pageWithEl.id);
          if (matchingEls.length === 1) {
            useUiStore.getState().select({ pageId: pageWithEl.id, elementId: firstEl.id });
          } else {
            useUiStore.getState().setSelection(pageWithEl.id, matchingEls.map((e) => e.id));
          }
        }
      }
    } else {
      checkAndClearSelection();
    }
    return 'ok';
  },

  addAssets: (newAssets: ImageAsset[], jobId?: string) => {
    set((state) => {
      const targetJobId = jobId || state.activeJobId;
      return {
        assets: [...state.assets, ...newAssets],
        jobs: state.jobs.map((job) => {
          if (job.id !== targetJobId) return job;
          const currentIds = getJobAssetIds(job);
          const newIds = newAssets.map((a) => a.id);
          const combined = Array.from(new Set([...currentIds, ...newIds]));
          return {
            ...job,
            assetIds: combined,
          };
        }),
      };
    });
  },

  discardAssets: (ids: string[]) => {
    const idsSet = new Set(ids);
    const { assets, jobs, history } = get();
    const referenced = getAllReferencedAssetIds(jobs, history);
    for (const asset of assets) {
      if (idsSet.has(asset.id) && !referenced.has(asset.id)) {
        revokeAssetUrls(asset);
      }
    }

    set((state) => ({
      assets: state.assets.filter((a) => !idsSet.has(a.id) || referenced.has(a.id)),
    }));
  },

  removeAsset: (assetId: string) => {
    const activeJobId = get().activeJobId;
    if (activeJobId) {
      get().commit(activeJobId);
    }

    set((state) => {
      const updatedJobs = state.jobs.map((job) => {
        if (activeJobId && job.id !== activeJobId) return job;
        const blocks = job.blocks || [];
        const blocksToRemove = new Set<string>();
        const updatedBlocks: Block[] = [];
        const regeneratedPagesMap = new Map<string, Page[]>();

        const ctx = ctxForJob(job, state.assets);

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
          assetIds: getJobAssetIds(job).filter((id) => id !== assetId),
        };
      });

      return {
        jobs: updatedJobs,
      };
    });
    checkAndClearSelection();
  },

  deleteAllJobPictures: (jobId: string) => {
    const job = get().jobs.find((j) => j.id === jobId);
    if (!job) return;

    get().commit(jobId);

    const firstPage = job.pages[0];
    const paperId = firstPage ? firstPage.paperId : 'letter';
    const orientation = firstPage ? firstPage.orientation : 'portrait';

    const cleanPage: Page = {
      id: nanoid(),
      paperId,
      orientation,
      elements: [],
    };

    set((state) => ({
      jobs: state.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          blocks: [],
          pages: [cleanPage],
          assetIds: [],
        };
      }),
    }));

    const uiStore = useUiStore.getState();
    uiStore.clearSelection();
    uiStore.setActiveAssetId(null);
    uiStore.setIsAllSelected(false);
    uiStore.setActivePage(cleanPage.id);
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
            target.stayPut = true;
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
