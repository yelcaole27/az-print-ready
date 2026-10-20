import type { Job, ImageAsset } from '@/types';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { preflight } from './preflight';
import { executePrint } from './printEngine';
import { exportPdf } from './exportPdf';
import { getBackNudge } from './backNudge';
import { mirrorPageForOutput } from './backMirror';
import { generateTestSheetJob } from './testSheet';

let exportAbortController: AbortController | null = null;

export interface OutputOptions {
  sideFilter?: 'all' | 'fronts' | 'backs';
  reverseBacks?: boolean;
  customJob?: Job;
}

export function getOutputPageIndexes(options?: OutputOptions): {
  job: Job;
  pageIndexes: number[];
  assetsById: Map<string, ImageAsset>;
} | null {
  const { jobs, activeJobId, assets } = useSessionStore.getState();
  const baseJob = options?.customJob || jobs.find((j) => j.id === activeJobId) || jobs[0];
  if (!baseJob) return null;

  const assetsById = new Map(assets.map((a) => [a.id, a]));
  const nudge = getBackNudge();

  // Create an effective job where any back page has mirrored elements applied
  const effectiveJob: Job = {
    ...baseJob,
    pages: baseJob.pages.map((p) => {
      if (p.isBack) {
        return mirrorPageForOutput(p, nudge);
      }
      return p;
    }),
  };

  const sideFilter = options?.sideFilter || 'all';

  let pageIndexes = effectiveJob.pages
    .map((page, idx) => ({ page, idx }))
    .filter(({ page }) => {
      if (page.elements.length === 0) return false;
      if (sideFilter === 'fronts') return !page.isBack;
      if (sideFilter === 'backs') return Boolean(page.isBack);
      return true;
    })
    .map((p) => p.idx);

  if (sideFilter === 'backs' && options?.reverseBacks) {
    pageIndexes = [...pageIndexes].reverse();
  }

  return { job: effectiveJob, pageIndexes, assetsById };
}

export function requestPrint(): void {
  useUiStore.getState().setMessage(null);

  const { jobs, activeJobId } = useSessionStore.getState();
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  if (!activeJob) return;

  const hasBackPage = activeJob.pages.some((p) => p.isBack);
  if (hasBackPage) {
    useUiStore.getState().openPrintChooser('print');
    return;
  }

  executePrintWithOptions();
}

export function requestExportPdf(): void {
  useUiStore.getState().setMessage(null);

  const { jobs, activeJobId } = useSessionStore.getState();
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  if (!activeJob) return;

  const hasBackPage = activeJob.pages.some((p) => p.isBack);
  if (hasBackPage) {
    useUiStore.getState().openPrintChooser('export');
    return;
  }

  startExportPdfWithOptions();
}

export function executePrintWithOptions(options?: OutputOptions): void {
  useUiStore.getState().setMessage(null);

  const outputData = getOutputPageIndexes(options);
  if (!outputData || outputData.pageIndexes.length === 0) return;

  const { job, pageIndexes, assetsById } = outputData;
  const { overflowIds, setCheckNotice } = useUiStore.getState();

  const lines = preflight({
    job,
    pageIndexes,
    assetsById,
    overflowIds,
  });

  if (lines.length > 0) {
    setCheckNotice({ action: 'print', lines, options });
  } else {
    executePrint(options);
  }
}

export function startExportPdfWithOptions(options?: OutputOptions): void {
  const outputData = getOutputPageIndexes(options);
  if (!outputData || outputData.pageIndexes.length === 0) return;

  const { job, pageIndexes, assetsById } = outputData;
  const { overflowIds, setCheckNotice } = useUiStore.getState();

  const lines = preflight({
    job,
    pageIndexes,
    assetsById,
    overflowIds,
  });

  if (lines.length > 0) {
    setCheckNotice({ action: 'export', lines, options });
  } else {
    runExportPdf(outputData);
  }
}

export function startExportPdf(): void {
  startExportPdfWithOptions();
}

function runExportPdf(outputData: {
  job: Job;
  pageIndexes: number[];
  assetsById: Map<string, ImageAsset>;
}): void {
  if (exportAbortController) {
    exportAbortController.abort();
  }
  exportAbortController = new AbortController();

  exportPdf({
    job: outputData.job,
    pageIndexes: outputData.pageIndexes,
    assetsById: outputData.assetsById,
    signal: exportAbortController.signal,
  }).catch((err) => {
    console.error('PDF export failed:', err);
    useUiStore.getState().setOutputMode(null);
    useUiStore.getState().setExportProgress(null);
  });
}

export function cancelExportPdf(): void {
  if (exportAbortController) {
    exportAbortController.abort();
    exportAbortController = null;
  }
  useUiStore.getState().setOutputMode(null);
  useUiStore.getState().setExportProgress(null);
}

export function confirmNotice(): void {
  const { checkNotice, setCheckNotice, setMessage } = useUiStore.getState();
  if (!checkNotice) return;

  const { action, options } = checkNotice;
  setCheckNotice(null);
  setMessage(null);

  if (action === 'print') {
    executePrint(options);
  } else if (action === 'export') {
    const outputData = getOutputPageIndexes(options);
    if (outputData && outputData.pageIndexes.length > 0) {
      runExportPdf(outputData);
    }
  }
}

export function executePrintTestSheet(side: 'front' | 'back'): void {
  const { jobs, activeJobId } = useSessionStore.getState();
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const firstPage = activeJob?.pages[0];
  const paperId = firstPage?.paperId || 'letter';
  const orientation = firstPage?.orientation || 'portrait';
  const firstBack = activeJob?.pages.find((p) => p.isBack);
  const flipMode = firstBack?.flipMode || 'sideways';

  const testJobData = generateTestSheetJob(paperId, orientation, flipMode);

  executePrint({
    customJob: testJobData.job,
    sideFilter: side === 'front' ? 'fronts' : 'backs',
  });
}
