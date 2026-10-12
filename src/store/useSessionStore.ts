import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { Session, Job, Page, PageElement, ImageAsset, Unit, Settings } from '@/types';
import { getPageDimensionsMm, clampToPage } from '@/lib/pageGeometry';
import { useUiStore } from '@/store/useUiStore';

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

  addAssets: (newAssets: ImageAsset[]) => void;
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
  cutMarks: false,
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
};

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
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          pages: job.pages.map((p) => ({ ...p, paperId })),
        };
      }),
    }));
  },

  setJobOrientation: (jobId: string, orientation: 'portrait' | 'landscape') => {
    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          pages: job.pages.map((p) => ({ ...p, orientation })),
        };
      }),
    }));
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
          pages: job.pages.map((p) => ({ ...p, elements: [] })),
        };
      }),
    }));
  },

  addAssets: (newAssets: ImageAsset[]) => {
    set((state) => ({
      assets: [...state.assets, ...newAssets],
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

    set((state) => ({
      assets: state.assets.filter((a) => a.id !== assetId),
      history: {}, // Clearing undo history of all jobs
      jobs: state.jobs.map((job) => ({
        ...job,
        pages: job.pages.map((page) => ({
          ...page,
          elements: page.elements.filter((el) => el.assetId !== assetId),
        })),
      })),
    }));
  },

  applyPlacements: (
    jobId: string,
    placements: { pageIndex: number; element: PageElement }[]
  ) => {
    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;

        // Determine if additional pages are required
        const maxPageIndexNeeded = Math.max(
          job.pages.length - 1,
          ...placements.map((p) => p.pageIndex)
        );

        const updatedPages = [...job.pages];
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

        return {
          ...job,
          pages: updatedPages,
        };
      }),
    }));
  },

  updateSettings: (jobId: string, partial: Partial<Settings>) => {
    get().commit(jobId);
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === jobId
          ? { ...job, settings: { ...job.settings, ...partial } }
          : job
      ),
    }));
  },
}));
