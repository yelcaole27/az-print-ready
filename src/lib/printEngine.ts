import { useUiStore } from '@/store/useUiStore';
import { getOutputPageIndexes } from './outputManager';
import { loadPagePrintImages } from './printImageLoader';

let isPrinting = false;

export async function executePrint(): Promise<void> {
  if (isPrinting) return;
  isPrinting = true;

  const { setOutputMode, setMessage, setAssetSrcOverrides } = useUiStore.getState();

  // Close any open toast before print dialog opens
  setMessage(null);

  // Load 300 DPI original pictures for the pages being printed
  const outputData = getOutputPageIndexes();
  let printCleanup: (() => void) | null = null;

  if (outputData && outputData.pageIndexes.length > 0) {
    const allElements = outputData.pageIndexes.flatMap(
      (idx) => outputData.job.pages[idx]?.elements || []
    );
    const printImages = await loadPagePrintImages(
      allElements,
      outputData.assetsById,
      { asDataUrl: false, warnOnFallback: true }
    );
    setAssetSrcOverrides(printImages.overrides);
    printCleanup = printImages.cleanup;
  }

  // 1. Mount print root
  setOutputMode('print');

  // 2. Wait 2 animation frames for DOM rendering
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

  // 5. Cleanup listener on window.onafterprint
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    isPrinting = false;
    if (printCleanup) {
      printCleanup();
      printCleanup = null;
    }
    setAssetSrcOverrides(null);
    setOutputMode(null);
  };

  window.addEventListener('afterprint', cleanup, { once: true });

  // Fallback cleanup after print dialog opens or completes
  setTimeout(() => {
    if (isPrinting) {
      cleanup();
    }
  }, 3000);

  // 6. Trigger native print dialog directly
  window.print();
}
