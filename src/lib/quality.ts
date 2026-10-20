import type { PageElement, ImageAsset } from '@/types';

/**
 * Computes the effective DPI of an image element.
 * scale = mm per source pixel actually drawn.
 * cover / default: max(cellW / pxW, cellH / pxH)
 * contain: min(cellW / pxW, cellH / pxH)
 * crop: max(wMm / (crop.w * pxW), hMm / (crop.h * pxH))
 * DPI = 25.4 / scale
 */
export function getEffectiveDpi(
  element: PageElement,
  asset?: ImageAsset | null
): number {
  if (!asset || asset.pxW <= 0 || asset.pxH <= 0) return 0;

  const crop = element.cropRect || element.crop;
  const isRotated = element.rotation === 90 || element.rotation === 270;
  const cellW_mm = isRotated ? element.hMm : element.wMm;
  const cellH_mm = isRotated ? element.wMm : element.hMm;

  if (crop) {
    const croppedPxW = asset.pxW * (crop.w || 1);
    const croppedPxH = asset.pxH * (crop.h || 1);
    const scale =
      element.fit === 'contain'
        ? Math.min(cellW_mm / croppedPxW, cellH_mm / croppedPxH)
        : Math.max(cellW_mm / croppedPxW, cellH_mm / croppedPxH);
    return scale > 0 ? 25.4 / scale : 0;
  }

  const scale =
    element.fit === 'contain'
      ? Math.min(cellW_mm / asset.pxW, cellH_mm / asset.pxH)
      : Math.max(cellW_mm / asset.pxW, cellH_mm / asset.pxH);

  return scale > 0 ? 25.4 / scale : 0;
}
