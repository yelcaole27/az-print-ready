import { nanoid } from 'nanoid';
import { Block, Job, Page, PageElement, SheetRow } from '@/types';
import { blockSignature, pageSignature } from '@/lib/blocks';
import { findSpot, printableRect, Rect } from '@/lib/packing';
import { getPageDimensionsMm } from '@/lib/pageGeometry';

export function isPageStayPut(page: Page, job?: Job): boolean {
  if (!page || page.elements.length === 0) return false;
  if (page.stayPut) return true;
  if (!page.blockId) return true;
  if (page.generatedSig) {
    return pageSignature(page) !== page.generatedSig;
  }
  if (job) {
    const block = job.blocks?.find((b) => b.id === page.blockId);
    if (!block || !block.generatedSig) return true;
    const bPages = job.pages.filter((p) => p.blockId === block.id);
    return blockSignature(bPages) !== block.generatedSig;
  }
  return true;
}

export function rectsOverlap(r1: Rect, r2: Rect): boolean {
  return (
    r1.x < r2.x + r2.w - 0.01 &&
    r1.x + r1.w - 0.01 > r2.x &&
    r1.y < r2.y + r2.h - 0.01 &&
    r1.y + r1.h - 0.01 > r2.y
  );
}

export interface StayPutVariantSizeArgs {
  page: Page;
  targetAssetIds: string[];
  targetRowIds: string[];
  newSize: { id: string; wMm: number; hMm: number };
  pRect: Rect;
  gapMm: number;
}

export function applyStayPutVariantSizeOnPage({
  page,
  targetAssetIds,
  targetRowIds,
  newSize,
  pRect,
  gapMm,
}: StayPutVariantSizeArgs): {
  updatedElements: PageElement[];
  overflowElements: PageElement[];
} {
  const isTarget = (el: PageElement): boolean => {
    if (targetRowIds.length > 0) {
      return Boolean(el.rowId && targetRowIds.includes(el.rowId));
    }
    return Boolean(el.assetId && targetAssetIds.includes(el.assetId));
  };

  const targetElements: PageElement[] = [];
  const otherElements: PageElement[] = [];

  for (const el of page.elements) {
    if (isTarget(el)) {
      targetElements.push(el);
    } else {
      otherElements.push(el);
    }
  }

  const placedElements: PageElement[] = [...otherElements];
  const occupied: Rect[] = placedElements.map((el) => ({
    x: el.xMm,
    y: el.yMm,
    w: el.wMm,
    h: el.hMm,
  }));
  const overflowElements: PageElement[] = [];

  for (const copy of targetElements) {
    const cx = copy.xMm + copy.wMm / 2;
    const cy = copy.yMm + copy.hMm / 2;

    const tarX = cx - newSize.wMm / 2;
    const tarY = cy - newSize.hMm / 2;
    const clampedX = Math.max(pRect.x, Math.min(tarX, pRect.x + pRect.w - newSize.wMm));
    const clampedY = Math.max(pRect.y, Math.min(tarY, pRect.y + pRect.h - newSize.hMm));
    const candRect: Rect = {
      x: clampedX,
      y: clampedY,
      w: newSize.wMm,
      h: newSize.hMm,
    };

    const fitsInPrintable =
      newSize.wMm <= pRect.w + 0.01 && newSize.hMm <= pRect.h + 0.01;

    const overlaps = occupied.some((r) => rectsOverlap(candRect, r));

    if (fitsInPrintable && !overlaps) {
      placedElements.push({
        ...copy,
        xMm: candRect.x,
        yMm: candRect.y,
        wMm: candRect.w,
        hMm: candRect.h,
      });
      occupied.push(candRect);
    } else {
      const spot = fitsInPrintable
        ? findSpot(occupied, newSize.wMm, newSize.hMm, pRect, gapMm, { x: cx, y: cy })
        : null;

      if (spot) {
        placedElements.push({
          ...copy,
          xMm: spot.x,
          yMm: spot.y,
          wMm: spot.w,
          hMm: spot.h,
        });
        occupied.push(spot);
      } else {
        overflowElements.push({
          ...copy,
          wMm: newSize.wMm,
          hMm: newSize.hMm,
        });
      }
    }
  }

  return {
    updatedElements: placedElements,
    overflowElements,
  };
}

export interface StayPutQuantityArgs {
  page: Page;
  targetAssetIds: string[];
  targetRowIds: string[];
  newQty: number;
  itemSize: { id: string; wMm: number; hMm: number };
  pRect: Rect;
  gapMm: number;
}

export function applyStayPutQuantityOnPage({
  page,
  targetAssetIds,
  targetRowIds,
  newQty,
  itemSize,
  pRect,
  gapMm,
}: StayPutQuantityArgs): {
  updatedElements: PageElement[];
  overflowElements: PageElement[];
} {
  const isTarget = (el: PageElement): boolean => {
    if (targetRowIds.length > 0) {
      return Boolean(el.rowId && targetRowIds.includes(el.rowId));
    }
    return Boolean(el.assetId && targetAssetIds.includes(el.assetId));
  };

  const targetElements: PageElement[] = [];
  const otherElements: PageElement[] = [];

  for (const el of page.elements) {
    if (isTarget(el)) {
      targetElements.push(el);
    } else {
      otherElements.push(el);
    }
  }

  const currentQty = targetElements.length;
  const primaryTarget = targetElements[0];
  const targetAssetId = primaryTarget?.assetId || targetAssetIds[0] || '';
  const targetRowId = primaryTarget?.rowId || targetRowIds[0];

  if (newQty <= currentQty) {
    const keepTarget = targetElements.slice(0, newQty);
    return {
      updatedElements: [...otherElements, ...keepTarget],
      overflowElements: [],
    };
  }

  const placedElements: PageElement[] = [...otherElements, ...targetElements];
  const occupied: Rect[] = placedElements.map((el) => ({
    x: el.xMm,
    y: el.yMm,
    w: el.wMm,
    h: el.hMm,
  }));
  const overflowElements: PageElement[] = [];
  const addCount = newQty - currentQty;

  for (let i = 0; i < addCount; i++) {
    const spot = findSpot(occupied, itemSize.wMm, itemSize.hMm, pRect, gapMm);
    if (spot) {
      const newEl: PageElement = {
        id: nanoid(),
        type: 'image',
        xMm: spot.x,
        yMm: spot.y,
        wMm: spot.w,
        hMm: spot.h,
        rotation: 0,
        assetId: targetAssetId,
        rowId: targetRowId,
        fit: primaryTarget?.fit || 'contain',
        cropGuides: false,
      };
      placedElements.push(newEl);
      occupied.push(spot);
    } else {
      overflowElements.push({
        id: nanoid(),
        type: 'image',
        xMm: pRect.x,
        yMm: pRect.y,
        wMm: itemSize.wMm,
        hMm: itemSize.hMm,
        rotation: 0,
        assetId: targetAssetId,
        rowId: targetRowId,
        fit: primaryTarget?.fit || 'contain',
        cropGuides: false,
      });
    }
  }

  return {
    updatedElements: placedElements,
    overflowElements,
  };
}

export interface StayPutFillPageArgs {
  page: Page;
  targetAssetIds: string[];
  targetRowIds: string[];
  itemSize: { id: string; wMm: number; hMm: number };
  pRect: Rect;
  gapMm: number;
}

export function applyStayPutFillPageOnPage({
  page,
  targetAssetIds,
  targetRowIds,
  itemSize,
  pRect,
  gapMm,
}: StayPutFillPageArgs): {
  updatedElements: PageElement[];
  totalPlaced: number;
} {
  const isTarget = (el: PageElement): boolean => {
    if (targetRowIds.length > 0) {
      return Boolean(el.rowId && targetRowIds.includes(el.rowId));
    }
    return Boolean(el.assetId && targetAssetIds.includes(el.assetId));
  };

  const primaryTarget = page.elements.find(isTarget);
  const targetAssetId = primaryTarget?.assetId || targetAssetIds[0] || '';
  const targetRowId = primaryTarget?.rowId || targetRowIds[0];

  const placedElements: PageElement[] = [...page.elements];
  const occupied: Rect[] = placedElements.map((el) => ({
    x: el.xMm,
    y: el.yMm,
    w: el.wMm,
    h: el.hMm,
  }));

  while (placedElements.length < 500) {
    const spot = findSpot(occupied, itemSize.wMm, itemSize.hMm, pRect, gapMm);
    if (!spot) break;

    const newEl: PageElement = {
      id: nanoid(),
      type: 'image',
      xMm: spot.x,
      yMm: spot.y,
      wMm: spot.w,
      hMm: spot.h,
      rotation: 0,
      assetId: targetAssetId,
      rowId: targetRowId,
      fit: primaryTarget?.fit || 'contain',
      cropGuides: false,
    };
    placedElements.push(newEl);
    occupied.push(spot);
  }

  const totalVariantCount = placedElements.filter(isTarget).length;

  return {
    updatedElements: placedElements,
    totalPlaced: totalVariantCount,
  };
}

export interface StayPutGeometryChangeArgs {
  page: Page;
  oldDimensions: { wMm: number; hMm: number };
  newDimensions: { wMm: number; hMm: number };
  pRect: Rect;
  gapMm: number;
}

export function applyStayPutGeometryChangeOnPage({
  page,
  oldDimensions,
  newDimensions,
  pRect,
  gapMm,
}: StayPutGeometryChangeArgs): {
  placedElements: PageElement[];
  overflowElements: PageElement[];
} {
  const placedElements: PageElement[] = [];
  const occupied: Rect[] = [];
  const overflowElements: PageElement[] = [];

  const { wMm: oldW, hMm: oldH } = oldDimensions;
  const { wMm: newW, hMm: newH } = newDimensions;

  for (const el of page.elements) {
    const oldCx = el.xMm + el.wMm / 2;
    const oldCy = el.yMm + el.hMm / 2;

    const fracX = oldW > 0 ? oldCx / oldW : 0.5;
    const fracY = oldH > 0 ? oldCy / oldH : 0.5;

    const targetCx = fracX * newW;
    const targetCy = fracY * newH;

    const tarX = targetCx - el.wMm / 2;
    const tarY = targetCy - el.hMm / 2;

    const clampedX = Math.max(pRect.x, Math.min(tarX, pRect.x + pRect.w - el.wMm));
    const clampedY = Math.max(pRect.y, Math.min(tarY, pRect.y + pRect.h - el.hMm));

    const candRect: Rect = {
      x: clampedX,
      y: clampedY,
      w: el.wMm,
      h: el.hMm,
    };

    const fitsInPrintable =
      el.wMm <= pRect.w + 0.01 && el.hMm <= pRect.h + 0.01;

    if (!fitsInPrintable) {
      overflowElements.push(el);
      continue;
    }

    const overlaps = occupied.some((r) => rectsOverlap(candRect, r));

    if (!overlaps) {
      placedElements.push({
        ...el,
        xMm: candRect.x,
        yMm: candRect.y,
      });
      occupied.push(candRect);
    } else {
      const spot = findSpot(occupied, el.wMm, el.hMm, pRect, gapMm, {
        x: targetCx,
        y: targetCy,
      });

      if (spot) {
        placedElements.push({
          ...el,
          xMm: spot.x,
          yMm: spot.y,
        });
        occupied.push(spot);
      } else {
        overflowElements.push(el);
      }
    }
  }

  return {
    placedElements,
    overflowElements,
  };
}

export function placeOverflowElements(
  overflow: PageElement[],
  pages: Page[],
  paperId: string,
  orientation: 'portrait' | 'landscape',
  marginMm: number,
  gapMm: number,
  startPageIdx: number
): Page[] {
  let pageIdx = startPageIdx + 1;
  const remaining = [...overflow];
  const resultPages = [...pages];

  while (remaining.length > 0 && pageIdx < 50) {
    let targetPage = resultPages[pageIdx];
    if (!targetPage) {
      targetPage = {
        id: nanoid(),
        paperId,
        orientation,
        elements: [],
      };
      resultPages.push(targetPage);
    }

    const { wMm, hMm } = getPageDimensionsMm(targetPage);
    const pRect = printableRect(wMm, hMm, marginMm);
    const occupied: Rect[] = targetPage.elements.map((e) => ({
      x: e.xMm,
      y: e.yMm,
      w: e.wMm,
      h: e.hMm,
    }));

    let placedAny = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const el = remaining[i];
      const spot = findSpot(occupied, el.wMm, el.hMm, pRect, gapMm);
      if (spot) {
        targetPage.elements.push({
          ...el,
          xMm: spot.x,
          yMm: spot.y,
        });
        occupied.push(spot);
        remaining.splice(i, 1);
        placedAny = true;
      }
    }

    if (!placedAny && remaining.length > 0) {
      pageIdx++;
    }
  }

  return resultPages;
}
