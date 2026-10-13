import type { Job, ImageAsset } from '@/types';
import { getPageDimensionsMm } from '@/lib/pageGeometry';
import { getFontEmbedCSS } from './pdfFonts';
import { useUiStore } from '@/store/useUiStore';

export interface ExportPdfOptions {
  job: Job;
  pageIndexes: number[];
  assetsById: Map<string, ImageAsset>;
  signal?: AbortSignal;
}

export async function exportPdf({
  job,
  pageIndexes,
  signal,
}: ExportPdfOptions): Promise<void> {
  const { setExportProgress, setOutputMode } = useUiStore.getState();

  // Dynamically import html-to-image and jspdf client-side
  const [htmlToImage, { jsPDF }] = await Promise.all([
    import('html-to-image'),
    import('jspdf'),
  ]);

  if (signal?.aborted) return;

  const total = pageIndexes.length;
  setExportProgress({ done: 0, total });

  // Make sure print root is mounted
  setOutputMode('export');

  // Wait 2 animation frames + font readiness
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }

  // Pre-load / decode any image elements
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

  if (signal?.aborted) {
    setOutputMode(null);
    setExportProgress(null);
    return;
  }

  const fontEmbedCSS = getFontEmbedCSS();

  // Create jsPDF instance
  // First page specs
  const firstPage = job.pages[pageIndexes[0]];
  const { wMm: firstWMm, hMm: firstHMm } = getPageDimensionsMm(firstPage);
  const isFirstLandscape = firstWMm > firstHMm;

  const pdf = new jsPDF({
    orientation: isFirstLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [firstWMm, firstHMm],
    compress: true,
  });

  const pageElements = printRoot?.querySelectorAll<HTMLElement>('.print-page');

  for (let i = 0; i < pageIndexes.length; i++) {
    if (signal?.aborted) {
      setOutputMode(null);
      setExportProgress(null);
      return;
    }

    const pageIdx = pageIndexes[i];
    const page = job.pages[pageIdx];
    const pageNode = pageElements ? pageElements[i] : null;

    if (!pageNode) continue;

    const { wMm, hMm } = getPageDimensionsMm(page);

    // Determine if page has images or is text-only
    const hasImage = page.elements.some((el) => el.type === 'image');

    // 300 DPI pixel ratio = 300 / 96
    const pixelRatio = 300 / 96;

    let dataUrl: string;
    let format: 'JPEG' | 'PNG';

    if (hasImage) {
      format = 'JPEG';
      dataUrl = await htmlToImage.toJpeg(pageNode, {
        pixelRatio,
        quality: 0.95,
        backgroundColor: '#FFFFFF',
        fontEmbedCSS,
        cacheBust: false,
      });
    } else {
      format = 'PNG';
      dataUrl = await htmlToImage.toPng(pageNode, {
        pixelRatio,
        backgroundColor: '#FFFFFF',
        fontEmbedCSS,
        cacheBust: false,
      });
    }

    if (signal?.aborted) {
      setOutputMode(null);
      setExportProgress(null);
      return;
    }

    if (i > 0) {
      const isLandscape = wMm > hMm;
      pdf.addPage([wMm, hMm], isLandscape ? 'landscape' : 'portrait');
    }

    pdf.addImage(dataUrl, format, 0, 0, wMm, hMm, undefined, 'FAST');

    setExportProgress({ done: i + 1, total });
  }

  // Sanitize filename
  const cleanName = job.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').trim() || 'print_ready';
  pdf.save(`${cleanName}.pdf`);

  setOutputMode(null);
  setExportProgress(null);
}
