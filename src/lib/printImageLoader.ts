import type { PageElement, ImageAsset } from '@/types';
import { useUiStore } from '@/store/useUiStore';

export interface PageImageOverridesResult {
  overrides: Record<string, string>;
  cleanup: () => void;
}

/**
 * Loads high-resolution images for elements on a single page at 300 DPI,
 * never upscaled beyond original image dimensions.
 * Releases canvas and bitmaps immediately.
 */
export async function loadPagePrintImages(
  elements: PageElement[],
  assetsById: Map<string, ImageAsset>,
  options: { asDataUrl?: boolean; warnOnFallback?: boolean } = {}
): Promise<PageImageOverridesResult> {
  const { asDataUrl = false, warnOnFallback = true } = options;
  const overrides: Record<string, string> = {};
  const cleanupFns: Array<() => void> = [];
  let warned = false;

  // Find max dimensions per asset on this page
  const assetMaxDims = new Map<string, { maxWMm: number; maxHMm: number }>();
  for (const el of elements) {
    if (el.type === 'image' && el.assetId) {
      const curr = assetMaxDims.get(el.assetId);
      if (!curr) {
        assetMaxDims.set(el.assetId, { maxWMm: el.wMm, maxHMm: el.hMm });
      } else {
        assetMaxDims.set(el.assetId, {
          maxWMm: Math.max(curr.maxWMm, el.wMm),
          maxHMm: Math.max(curr.maxHMm, el.hMm),
        });
      }
    }
  }

  for (const [assetId, dims] of assetMaxDims) {
    const asset = assetsById.get(assetId);
    if (!asset) continue;

    if (!asset.originalBlob) {
      if (warnOnFallback && !warned) {
        warned = true;
        useUiStore.getState().setMessage({
          type: 'warn',
          text: 'Could not load original picture in full quality. Using preview.',
        });
      }
      overrides[assetId] = asset.previewUrl || asset.objectUrl;
      continue;
    }

    try {
      const targetPxW = Math.round((dims.maxWMm / 25.4) * 300);
      const targetPxH = Math.round((dims.maxHMm / 25.4) * 300);
      const maxTarget = Math.max(targetPxW, targetPxH);
      const maxOrig = Math.max(asset.pxW || 1, asset.pxH || 1);
      const scale = Math.min(1, maxTarget / maxOrig);
      const reqW = Math.max(1, Math.round((asset.pxW || 1) * scale));
      const reqH = Math.max(1, Math.round((asset.pxH || 1) * scale));

      let bitmap: ImageBitmap;
      if (typeof createImageBitmap === 'function') {
        try {
          bitmap = await createImageBitmap(asset.originalBlob, {
            resizeWidth: reqW,
            resizeHeight: reqH,
            resizeQuality: 'high',
            imageOrientation: 'from-image',
          });
        } catch {
          bitmap = await createImageBitmap(asset.originalBlob);
        }
      } else {
        throw new Error('createImageBitmap unavailable');
      }

      const hasAlpha =
        asset.originalBlob.type === 'image/png' ||
        asset.originalBlob.type === 'image/webp' ||
        asset.originalBlob.type === 'image/gif';
      const mimeType = hasAlpha ? 'image/png' : 'image/jpeg';

      if (asDataUrl) {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const dataUrl = canvas.toDataURL(mimeType, 0.95);
        canvas.width = 0;
        canvas.height = 0;
        overrides[assetId] = dataUrl;
      } else {
        let blob: Blob;
        if (typeof OffscreenCanvas !== 'undefined') {
          const off = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = off.getContext('2d');
          if (ctx) ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          blob = await off.convertToBlob({ type: mimeType, quality: 0.95 });
          off.width = 0;
          off.height = 0;
        } else {
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b || new Blob()), mimeType, 0.95);
          });
          canvas.width = 0;
          canvas.height = 0;
        }

        const tempUrl = URL.createObjectURL(blob);
        overrides[assetId] = tempUrl;
        cleanupFns.push(() => {
          try {
            URL.revokeObjectURL(tempUrl);
          } catch {
            // ignore
          }
        });
      }
    } catch {
      if (warnOnFallback && !warned) {
        warned = true;
        useUiStore.getState().setMessage({
          type: 'warn',
          text: 'Could not load original picture in full quality. Using preview.',
        });
      }
      overrides[assetId] = asset.previewUrl || asset.objectUrl;
    }
  }

  return {
    overrides,
    cleanup: () => {
      for (const fn of cleanupFns) fn();
    },
  };
}
