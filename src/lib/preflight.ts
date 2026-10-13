import type { Job, ImageAsset } from '@/types';
import { getEffectiveDpi } from './quality';
import { getPageDimensionsMm } from './pageGeometry';
import { computeCutGuides } from './cutGuides';

export interface PreflightOptions {
  job: Job;
  pageIndexes: number[]; // output pages (0-based)
  assetsById: Map<string, ImageAsset>;
  overflowIds: Set<string>;
}

export function preflight({
  job,
  pageIndexes,
  assetsById,
  overflowIds,
}: PreflightOptions): string[] {
  const lines: string[] = [];
  const { settings, pages } = job;
  const marginMm = settings.marginMm;

  // 1. Lowest effective DPI per asset on the output pages
  // Track min DPI per asset across all output pages
  const assetMinDpi = new Map<string, { dpi: number; name: string }>();

  for (const pageIdx of pageIndexes) {
    const page = pages[pageIdx];
    if (!page) continue;

    for (const el of page.elements) {
      if (el.type === 'image' && el.assetId) {
        const asset = assetsById.get(el.assetId);
        if (asset) {
          const dpi = getEffectiveDpi(el, asset);
          const current = assetMinDpi.get(asset.id);
          if (!current || dpi < current.dpi) {
            assetMinDpi.set(asset.id, { dpi, name: asset.name });
          }
        }
      }
    }
  }

  // Any asset with min DPI < 150 gets flagged
  for (const [, info] of assetMinDpi) {
    if (info.dpi < 150) {
      lines.push(`'${info.name}' may look blurry (${Math.round(info.dpi)} DPI, 300 recommended).`);
    }
  }

  // 2. Margin check: any item extending past printable margin by > 0.1 mm
  // Format: "Page {n}: some items are in the edge area that printers can't print."
  // Note: page numbers are 1-based (pageIdx + 1)
  for (const pageIdx of pageIndexes) {
    const page = pages[pageIdx];
    if (!page) continue;
    const { wMm, hMm } = getPageDimensionsMm(page);

    const minX = marginMm;
    const minY = marginMm;
    const maxX = wMm - marginMm;
    const maxY = hMm - marginMm;

    let hasMarginIssue = false;
    for (const el of page.elements) {
      const elMinX = el.xMm;
      const elMinY = el.yMm;
      const elMaxX = el.xMm + el.wMm;
      const elMaxY = el.yMm + el.hMm;

      // Check if extends past printable rect by > 0.1 mm
      if (
        elMinX < minX - 0.1 ||
        elMinY < minY - 0.1 ||
        elMaxX > maxX + 0.1 ||
        elMaxY > maxY + 0.1
      ) {
        hasMarginIssue = true;
        break;
      }
    }

    if (hasMarginIssue) {
      lines.push(`Page ${pageIdx + 1}: some items are in the edge area that printers can't print.`);
    }
  }

  // 3. Overflow text: any text element currently in overflowIds
  // Format: "Page {n}: some text is cut off."
  for (const pageIdx of pageIndexes) {
    const page = pages[pageIdx];
    if (!page) continue;

    let hasOverflow = false;
    for (const el of page.elements) {
      if (el.type === 'text' && overflowIds.has(el.id)) {
        hasOverflow = true;
        break;
      }
    }

    if (hasOverflow) {
      lines.push(`Page ${pageIdx + 1}: some text is cut off.`);
    }
  }

  // 4. Cut ticks margin check
  if (settings.cutStyle === 'ticks') {
    for (const pageIdx of pageIndexes) {
      const page = pages[pageIdx];
      if (!page) continue;
      const guideInfo = computeCutGuides(page, settings);
      if (guideInfo.warning) {
        lines.push(`Page ${pageIdx + 1}: cut marks need at least 5 mm margins to fit.`);
      }
    }
  }

  return lines;
}
