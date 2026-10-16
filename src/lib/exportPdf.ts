import type { Job, ImageAsset } from '@/types';
import { getPageDimensionsMm } from '@/lib/pageGeometry';
import { getFontEmbedCSS } from './pdfFonts';
import { useUiStore } from '@/store/useUiStore';
import { loadPagePrintImages } from './printImageLoader';

export interface ExportPdfOptions {
  job: Job;
  pageIndexes: number[];
  assetsById: Map<string, ImageAsset>;
  signal?: AbortSignal;
}

async function blobToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader result is not a string'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

async function checkIsBlankPage(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(false);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 64, 64);
        ctx.drawImage(img, 0, 0, 64, 64);
        const imgData = ctx.getImageData(0, 0, 64, 64).data;
        let allWhite = true;
        for (let idx = 0; idx < imgData.length; idx += 4) {
          if (imgData[idx] !== 255 || imgData[idx + 1] !== 255 || imgData[idx + 2] !== 255) {
            allWhite = false;
            break;
          }
        }
        resolve(allWhite);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => {
      resolve(true);
    };
    img.src = dataUrl;
  });
}

export async function exportPdf({
  job,
  pageIndexes,
  assetsById,
  signal,
}: ExportPdfOptions): Promise<void> {
  const { setExportProgress, setOutputMode, setAssetSrcOverrides, setMessage } =
    useUiStore.getState();

  // Dynamically import html-to-image and jspdf client-side
  const [htmlToImage, { jsPDF }] = await Promise.all([
    import('html-to-image'),
    import('jspdf'),
  ]);

  if (signal?.aborted) return;

  const total = pageIndexes.length;
  setExportProgress({ done: 0, total });

  // Mount print root in export mode
  setOutputMode('export');

  let printRoot = document.getElementById('print-root');

  try {
    // Keep #print-root rendered ON SCREEN but invisible to user behind app
    if (printRoot) {
      printRoot.style.position = 'fixed';
      printRoot.style.left = '0';
      printRoot.style.top = '0';
      printRoot.style.zIndex = '-1';
      printRoot.style.pointerEvents = 'none';
      printRoot.style.display = 'block';
    }

    // Wait 2 animation frames + font readiness
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // ignore
      }
    }

    // Refresh printRoot reference after renders
    printRoot = document.getElementById('print-root');
    if (printRoot) {
      printRoot.style.position = 'fixed';
      printRoot.style.left = '0';
      printRoot.style.top = '0';
      printRoot.style.zIndex = '-1';
      printRoot.style.pointerEvents = 'none';
      printRoot.style.display = 'block';

      // await img.decode() for all images after mount
      const images = printRoot.querySelectorAll('img');
      await Promise.all(
        Array.from(images).map(async (img) => {
          try {
            await img.decode();
          } catch {
            // ignore single decode failure
          }
        })
      );
    }

    if (signal?.aborted) return;

    // Wrap getFontEmbedCSS in try/catch; if it throws, continue with skipFonts: true
    let fontEmbedCSS: string | undefined;
    let skipFonts = false;
    try {
      fontEmbedCSS = getFontEmbedCSS();
    } catch {
      skipFonts = true;
    }

    // Create jsPDF instance
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
    const pixelRatio = 300 / 96;

    for (let i = 0; i < pageIndexes.length; i++) {
      if (signal?.aborted) return;

      const pageIdx = pageIndexes[i];
      const page = job.pages[pageIdx];
      const pageNode = pageElements ? pageElements[i] : null;

      if (!pageNode) continue;

      const { wMm, hMm } = getPageDimensionsMm(page);
      const hasImage = page.elements.some((el) => el.type === 'image');

      // Load 300 DPI original pictures on demand for this page
      const pageImages = await loadPagePrintImages(page.elements, assetsById, {
        asDataUrl: true,
        warnOnFallback: true,
      });
      setAssetSrcOverrides(pageImages.overrides);

      // Wait 1 frame and await decode for this page's images
      await new Promise((r) => requestAnimationFrame(r));
      const imgs = pageNode.querySelectorAll('img');
      await Promise.all(
        Array.from(imgs).map(async (img) => {
          try {
            await img.decode();
          } catch {
            // ignore
          }
        })
      );

      const rasterOptions = {
        pixelRatio,
        backgroundColor: '#FFFFFF',
        fontEmbedCSS: skipFonts ? undefined : fontEmbedCSS,
        skipFonts,
        cacheBust: false,
      };

      // Warm up: for page 1 call rasterizer twice and discard first result
      if (i === 0) {
        try {
          if (hasImage) {
            await htmlToImage.toJpeg(pageNode, {
              ...rasterOptions,
              quality: 0.95,
            });
          } else {
            await htmlToImage.toPng(pageNode, rasterOptions);
          }
        } catch {
          // Warm up failure ignored, continuing to second call
        }
      }

      let dataUrl: string;
      let format: 'JPEG' | 'PNG';

      if (hasImage) {
        format = 'JPEG';
        dataUrl = await htmlToImage.toJpeg(pageNode, {
          ...rasterOptions,
          quality: 0.95,
        });
      } else {
        format = 'PNG';
        dataUrl = await htmlToImage.toPng(pageNode, rasterOptions);
      }

      // Cleanup page overrides and release references
      pageImages.cleanup();
      setAssetSrcOverrides(null);

      if (signal?.aborted) return;

      // Blank detection: sample pixels on 64x64 canvas
      const isBlank = await checkIsBlankPage(dataUrl);
      if (isBlank) {
        console.error(`[PDF] blank page ${i + 1}`);
        setMessage({
          type: 'error',
          text: 'Could not make the PDF. Try Print, then choose Save as PDF.',
        });
        return;
      }

      if (i > 0) {
        const isLandscape = wMm > hMm;
        pdf.addPage([wMm, hMm], isLandscape ? 'landscape' : 'portrait');
      }

      pdf.addImage(dataUrl, format, 0, 0, wMm, hMm, undefined, 'FAST');

      setExportProgress({ done: i + 1, total });
    }

    if (signal?.aborted) return;

    // Sanitize filename and save
    const cleanName =
      job.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').trim() || 'print_ready';
    pdf.save(`${cleanName}.pdf`);
  } catch (err) {
    console.error('[PDF] Export process encountered an error:', err);
    setMessage({
      type: 'error',
      text: 'Could not make the PDF. Try Print, then choose Save as PDF.',
    });
  } finally {
    // Restore the off-screen position when export ends
    if (printRoot) {
      printRoot.style.position = '';
      printRoot.style.left = '';
      printRoot.style.top = '';
      printRoot.style.zIndex = '';
      printRoot.style.pointerEvents = '';
      printRoot.style.display = '';
    }
    setOutputMode(null);
    setExportProgress(null);
    setAssetSrcOverrides(null);
  }
}
