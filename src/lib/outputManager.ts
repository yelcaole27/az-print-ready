import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { preflight } from './preflight';
import { executePrint } from './printEngine';
import { exportPdf } from './exportPdf';

let exportAbortController: AbortController | null = null;

export function getOutputPageIndexes(): {
  job: ReturnType<typeof useSessionStore.getState>['jobs'][0];
  pageIndexes: number[];
  assetsById: Map<string, ReturnType<typeof useSessionStore.getState>['assets'][0]>;
} | null {
  const { jobs, activeJobId, assets } = useSessionStore.getState();
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  if (!activeJob) return null;

  const assetsById = new Map(assets.map((a) => [a.id, a]));

  // Output pages = all pages with at least 1 element
  const pageIndexes = activeJob.pages
    .map((page, idx) => ({ hasElements: page.elements.length > 0, idx }))
    .filter((p) => p.hasElements)
    .map((p) => p.idx);

  return { job: activeJob, pageIndexes, assetsById };
}

export function requestPrint(): void {
  // Dismiss any open toast before print
  useUiStore.getState().setMessage(null);

  const outputData = getOutputPageIndexes();
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
    setCheckNotice({ action: 'print', lines });
  } else {
    executePrint();
  }
}

export function requestExportPdf(): void {
  const outputData = getOutputPageIndexes();
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
    setCheckNotice({ action: 'export', lines });
  } else {
    startExportPdf();
  }
}

export function startExportPdf(): void {
  const outputData = getOutputPageIndexes();
  if (!outputData || outputData.pageIndexes.length === 0) return;

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

  const action = checkNotice.action;
  setCheckNotice(null);
  setMessage(null);

  if (action === 'print') {
    executePrint();
  } else if (action === 'export') {
    startExportPdf();
  }
}
