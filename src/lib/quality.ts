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

  if (element.crop) {
    const scale = Math.max(
      element.wMm / (element.crop.w * asset.pxW),
      element.hMm / (element.crop.h * asset.pxH)
    );
    return scale > 0 ? 25.4 / scale : 0;
  }

  const rotation = element.rotation || 0;
  const cellW_mm = rotation === 90 ? element.hMm : element.wMm;
  const cellH_mm = rotation === 90 ? element.wMm : element.hMm;

  const scale =
    element.fit === 'contain'
      ? Math.min(cellW_mm / asset.pxW, cellH_mm / asset.pxH)
      : Math.max(cellW_mm / asset.pxW, cellH_mm / asset.pxH);

  return scale > 0 ? 25.4 / scale : 0;
}
