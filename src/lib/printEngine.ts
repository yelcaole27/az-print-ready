import { useUiStore } from '@/store/useUiStore';
import { getOutputPageIndexes, type OutputOptions } from './outputManager';
import { loadPagePrintImages } from './printImageLoader';

let isPrinting = false;

export async function executePrint(options?: OutputOptions): Promise<void> {
  if (isPrinting) return;
  isPrinting = true;

  const { setMessage } = useUiStore.getState();

  // Close any open toast before print dialog opens
  setMessage(null);

  // Load 300 DPI original pictures for the pages being printed
  const outputData = getOutputPageIndexes(options);
  if (!outputData || outputData.pageIndexes.length === 0) {
    isPrinting = false;
    return;
  }

  let printCleanup: (() => void) | null = null;
  const allElements = outputData.pageIndexes.flatMap(
    (idx) => outputData.job.pages[idx]?.elements || []
  );
  const printImages = await loadPagePrintImages(
    allElements,
    outputData.assetsById,
    { asDataUrl: false, warnOnFallback: true }
  );
  printCleanup = printImages.cleanup;

  // 1. Mount print root with the exact output target pages atomically
  useUiStore.setState({
    outputJob: outputData.job,
    outputPageIndexes: outputData.pageIndexes,
    assetSrcOverrides: printImages.overrides,
    outputMode: 'print',
  });

  // 2. Wait 2 animation frames for DOM rendering and React commit
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // 3. Wait for document.fonts.ready
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }

  // 4. Preload and decode images in print root
  const printRoot = document.getElementById('print-root');
  if (printRoot) {
    const images = printRoot.querySelectorAll('img');
    await Promise.all(
      Array.from(images).map(async (img) => {
        if (!img.complete) {
          try {
            await img.decode();
          } catch {
            // ignore
          }
        }
      })
    );
  }

  // Wait an extra animation frame after image decoding to ensure layout repaint
  await new Promise((r) => requestAnimationFrame(r));

  // 5. Cleanup listener on window.onafterprint or window focus
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    window.removeEventListener('afterprint', cleanup);
    window.removeEventListener('focus', focusCleanup);
    isPrinting = false;
    if (printCleanup) {
      printCleanup();
      printCleanup = null;
    }
    useUiStore.setState({
      assetSrcOverrides: null,
      outputMode: null,
      outputJob: null,
      outputPageIndexes: [],
    });
  };

  const focusCleanup = () => {
    setTimeout(cleanup, 500);
  };

  window.addEventListener('afterprint', cleanup, { once: true });
  window.addEventListener('focus', focusCleanup, { once: true });

  // 6. Trigger native print dialog directly
  window.print();
}
