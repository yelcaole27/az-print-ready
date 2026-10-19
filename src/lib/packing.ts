import { nanoid } from 'nanoid';
import { Page, PageElement, Settings } from '@/types';
import { PAPERS } from '@/lib/constants/papers';
import { getPageDimensionsMm } from '@/lib/pageGeometry';
import { formatSize } from '@/lib/units';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PackCopiesArgs {
  pages: Page[];
  startPageIndex: number;
  itemWMm: number;
  itemHMm: number;
  qty: number;
  allowRotate: boolean;
  fillActiveOnly: boolean;
  settings: Settings;
  assetId: string;
  rowId?: string;
  fit: 'cover' | 'contain';
}

export interface PackCopiesResult {
  placements: { pageIndex: number; element: PageElement }[];
  placedCount: number;
  error?: string;
  pagesCreated?: number;
}

export function printableRect(
  pageW: number,
  pageH: number,
  margin: number
): Rect {
  return {
    x: margin,
    y: margin,
    w: Math.max(0, pageW - 2 * margin),
    h: Math.max(0, pageH - 2 * margin),
  };
}

export function findSpot(
  occupied: Rect[],
  w: number,
  h: number,
  printable: Rect,
  gap: number,
  nearPoint?: { x: number; y: number }
): Rect | null {
  const candidateXs = new Set<number>();
  const candidateYs = new Set<number>();

  candidateXs.add(printable.x);
  candidateYs.add(printable.y);

  for (const r of occupied) {
    candidateXs.add(r.x + r.w + gap);
    candidateYs.add(r.y + r.h + gap);
  }

  const sortedYs = Array.from(candidateYs).sort((a, b) => a - b);
  const sortedXs = Array.from(candidateXs).sort((a, b) => a - b);

  const validSpots: Rect[] = [];

  for (const y of sortedYs) {
    if (y + h > printable.y + printable.h + 0.01) continue;

    for (const x of sortedXs) {
      if (x + w > printable.x + printable.w + 0.01) continue;

      let overlaps = false;
      for (const r of occupied) {
        if (
          x < r.x + r.w + gap - 0.01 &&
          x + w + gap - 0.01 > r.x &&
          y < r.y + r.h + gap - 0.01 &&
          y + h + gap - 0.01 > r.y
        ) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        if (!nearPoint) {
          return { x, y, w, h };
        }
        validSpots.push({ x, y, w, h });
      }
    }
  }

  if (nearPoint && validSpots.length > 0) {
    validSpots.sort((a, b) => {
      const distA = Math.hypot(a.x + w / 2 - nearPoint.x, a.y + h / 2 - nearPoint.y);
      const distB = Math.hypot(b.x + w / 2 - nearPoint.x, b.y + h / 2 - nearPoint.y);
      return distA - distB;
    });
    return validSpots[0];
  }

  return null;
}

export function packCopies({
  pages,
  startPageIndex,
  itemWMm,
  itemHMm,
  qty,
  allowRotate,
  fillActiveOnly,
  settings,
  assetId,
  rowId,
  fit,
}: PackCopiesArgs): PackCopiesResult {
  const validStartPage = pages[startPageIndex] || pages[0];
  const { wMm: baseW, hMm: baseH } = getPageDimensionsMm(validStartPage);
  const basePrintable = printableRect(baseW, baseH, settings.marginMm);

  const fitsUpright =
    itemWMm <= basePrintable.w + 0.01 && itemHMm <= basePrintable.h + 0.01;
  const fitsRotated =
    allowRotate &&
    itemHMm <= basePrintable.w + 0.01 &&
    itemWMm <= basePrintable.h + 0.01;

  if (!fitsUpright && !fitsRotated) {
    const paper = PAPERS.find((p) => p.id === validStartPage.paperId) || PAPERS[0];
    const maxW = formatSize(basePrintable.w, settings.unit);
    const maxH = formatSize(basePrintable.h, settings.unit);
    return {
      placements: [],
      placedCount: 0,
      error: `This size doesn't fit on ${paper.name}. Largest printable area: ${maxW} × ${maxH}.`,
    };
  }

  const occupiedMap = new Map<number, Rect[]>();
  pages.forEach((page, idx) => {
    occupiedMap.set(
      idx,
      page.elements.map((el) => ({
        x: el.xMm,
        y: el.yMm,
        w: el.wMm,
        h: el.hMm,
      }))
    );
  });

  const placements: { pageIndex: number; element: PageElement }[] = [];
  const targetQty = fillActiveOnly ? Math.min(500, qty) : qty;
  let placed = 0;

  if (fillActiveOnly) {
    const pageIndex = startPageIndex;
    const page = pages[pageIndex] || validStartPage;
    const { wMm: pW, hMm: pH } = getPageDimensionsMm(page);
    const pPrintable = printableRect(pW, pH, settings.marginMm);
    const occupied = occupiedMap.get(pageIndex) || [];

    while (placed < targetQty) {
      let spot = findSpot(occupied, itemWMm, itemHMm, pPrintable, settings.gapMm);
      let rotation: 0 | 90 = 0;

      if (!spot && allowRotate && itemWMm !== itemHMm) {
        spot = findSpot(occupied, itemHMm, itemWMm, pPrintable, settings.gapMm);
        if (spot) rotation = 90;
      }

      if (!spot) break;

      const element: PageElement = {
        id: nanoid(),
        type: 'image',
        xMm: spot.x,
        yMm: spot.y,
        wMm: spot.w,
        hMm: spot.h,
        rotation,
        assetId,
        rowId,
        fit,
        cropGuides: false,
      };

      placements.push({ pageIndex, element });
      occupied.push(spot);
      occupiedMap.set(pageIndex, occupied);
      placed++;
    }
  } else {
    let currentPageIdx = startPageIndex;

    while (placed < targetQty) {
      let placedThisRound = false;

      while (currentPageIdx < 50) {
        const page =
          pages[currentPageIdx] ||
          pages[pages.length - 1] ||
          validStartPage;

        const { wMm: pW, hMm: pH } = getPageDimensionsMm(page);
        const pPrintable = printableRect(pW, pH, settings.marginMm);

        if (!occupiedMap.has(currentPageIdx)) {
          occupiedMap.set(currentPageIdx, []);
        }
        const occupied = occupiedMap.get(currentPageIdx)!;

        let spot = findSpot(occupied, itemWMm, itemHMm, pPrintable, settings.gapMm);
        let rotation: 0 | 90 = 0;

        if (!spot && allowRotate && itemWMm !== itemHMm) {
          spot = findSpot(occupied, itemHMm, itemWMm, pPrintable, settings.gapMm);
          if (spot) rotation = 90;
        }

        if (spot) {
          const element: PageElement = {
            id: nanoid(),
            type: 'image',
            xMm: spot.x,
            yMm: spot.y,
            wMm: spot.w,
            hMm: spot.h,
            rotation,
            assetId,
            rowId,
            fit,
            cropGuides: false,
          };

          placements.push({ pageIndex: currentPageIdx, element });
          occupied.push(spot);
          occupiedMap.set(currentPageIdx, occupied);
          placed++;
          placedThisRound = true;
          break;
        } else {
          currentPageIdx++;
        }
      }

      if (!placedThisRound) {
        break;
      }
    }
  }

  return {
    placements,
    placedCount: placed,
  };
}
