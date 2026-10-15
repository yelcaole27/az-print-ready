import { Page } from '@/types';
import { PAPERS } from '@/lib/constants/papers';

export const MM_TO_PX = 96 / 25.4;

export function getPageDimensionsMm(page: Page): { wMm: number; hMm: number } {
  const paper = PAPERS.find((p) => p.id === page.paperId) || PAPERS[0];
  if (page.orientation === 'landscape') {
    return { wMm: paper.heightMm, hMm: paper.widthMm };
  }
  return { wMm: paper.widthMm, hMm: paper.heightMm };
}

export function mmToScreenPx(mm: number, zoom: number): number {
  return mm * MM_TO_PX * zoom;
}

export function screenPxToMm(px: number, zoom: number): number {
  return px / (MM_TO_PX * zoom);
}

export function clampToPage(
  x: number,
  y: number,
  w: number,
  h: number,
  pageW: number,
  pageH: number,
  minSizeMm: number = 5
): { x: number; y: number; w: number; h: number } {
  const clampedW = Math.max(minSizeMm, Math.min(pageW, w));
  const clampedH = Math.max(minSizeMm, Math.min(pageH, h));
  const clampedX = Math.max(0, Math.min(pageW - clampedW, x));
  const clampedY = Math.max(0, Math.min(pageH - clampedH, y));
  return { x: clampedX, y: clampedY, w: clampedW, h: clampedH };
}
