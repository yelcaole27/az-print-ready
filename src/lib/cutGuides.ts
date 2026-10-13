import type { Page, Settings } from '@/types';
import { getPageDimensionsMm } from './pageGeometry';

export interface CutGuidesResult {
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  boxes: { x: number; y: number; w: number; h: number }[];
  warning?: string;
}

/**
 * Pure function to compute cut lines or outline boxes.
 * Only elements of type 'image' WITHOUT sliceIndex take part.
 */
export function computeCutGuides(
  page: Page,
  settings: Settings
): CutGuidesResult {
  const { cutStyle, marginMm } = settings;
  if (!cutStyle || cutStyle === 'none') {
    return { lines: [], boxes: [] };
  }

  // Filter valid image elements (excluding document slices)
  const imageElements = page.elements.filter(
    (el) => el.type === 'image' && el.sliceIndex === undefined
  );

  if (imageElements.length === 0) {
    return { lines: [], boxes: [] };
  }

  const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(page);

  if (cutStyle === 'outline') {
    // 'outline': one box per element placed 0.1 mm OUTSIDE its footprint
    const boxes = imageElements.map((el) => ({
      x: el.xMm - 0.1,
      y: el.yMm - 0.1,
      w: el.wMm + 0.2,
      h: el.hMm + 0.2,
    }));
    return { lines: [], boxes };
  }

  if (cutStyle === 'ticks') {
    const m = marginMm;
    if (m < 2) {
      return {
        lines: [],
        boxes: [],
        warning: 'Cut ticks need a margin of at least 2 mm.',
      };
    }

    const L = Math.min(3, m - 1);

    // Collect distinct x and y edges rounded to 0.1 mm
    const xEdgeSet = new Set<number>();
    const yEdgeSet = new Set<number>();

    for (const el of imageElements) {
      const x1 = Math.round(el.xMm * 10) / 10;
      const x2 = Math.round((el.xMm + el.wMm) * 10) / 10;
      const y1 = Math.round(el.yMm * 10) / 10;
      const y2 = Math.round((el.yMm + el.hMm) * 10) / 10;

      // Keep only edges inside the page boundaries (0 <= edge <= page dimension)
      if (x1 >= 0 && x1 <= pageW) xEdgeSet.add(x1);
      if (x2 >= 0 && x2 <= pageW) xEdgeSet.add(x2);
      if (y1 >= 0 && y1 <= pageH) yEdgeSet.add(y1);
      if (y2 >= 0 && y2 <= pageH) yEdgeSet.add(y2);
    }

    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];

    // For each x edge:
    // TOP band: y = m - 0.5 - L to y = m - 0.5
    // BOTTOM band: y = pageH - m + 0.5 to y = pageH - m + 0.5 + L
    for (const x of xEdgeSet) {
      lines.push({
        x1: x,
        y1: m - 0.5 - L,
        x2: x,
        y2: m - 0.5,
      });
      lines.push({
        x1: x,
        y1: pageH - m + 0.5,
        x2: x,
        y2: pageH - m + 0.5 + L,
      });
    }

    // For each y edge:
    // LEFT band: x = m - 0.5 - L to x = m - 0.5
    // RIGHT band: x = pageW - m + 0.5 to x = pageW - m + 0.5 + L
    for (const y of yEdgeSet) {
      lines.push({
        x1: m - 0.5 - L,
        y1: y,
        x2: m - 0.5,
        y2: y,
      });
      lines.push({
        x1: pageW - m + 0.5,
        y1: y,
        x2: pageW - m + 0.5 + L,
        y2: y,
      });
    }

    return { lines, boxes: [] };
  }

  return { lines: [], boxes: [] };
}
