import { nanoid } from 'nanoid';
import { PageElement } from '@/types';

export interface CollageItem {
  assetId: string;
  pxW: number;
  pxH: number;
}

export interface Placed {
  assetId: string;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

export interface CollageOption {
  id: 'best' | 'grid' | 'column' | 'row';
  label: string;
  items: Placed[];
}

export function collageOptions(
  items: CollageItem[],
  pageWMm: number,
  pageHMm: number,
  marginMm: number,
  gapMm: number
): CollageOption[] {
  const N = items.length;
  if (N < 2) return [];

  const P = {
    x: marginMm,
    y: marginMm,
    w: Math.max(0, pageWMm - 2 * marginMm),
    h: Math.max(0, pageHMm - 2 * marginMm),
  };
  const g = gapMm;

  const aspects = items.map((item) => item.pxW / item.pxH);

  // 1) Column layout: all images share width Wc, stacked vertically
  const sumInvA = aspects.reduce((sum, a) => sum + 1 / a, 0);
  const maxWByHeight = sumInvA > 0 ? (P.h - g * (N - 1)) / sumInvA : 0;
  const Wc = Math.max(0, Math.min(P.w, maxWByHeight));
  const colHeights = aspects.map((a) => Wc / a);
  const totalColH = colHeights.reduce((sum, h) => sum + h, 0) + g * (N - 1);
  const colStartX = P.x + (P.w - Wc) / 2;
  const colStartY = P.y + (P.h - totalColH) / 2;

  let currColY = colStartY;
  const columnPlaced: Placed[] = items.map((item, i) => {
    const placed: Placed = {
      assetId: item.assetId,
      xMm: colStartX,
      yMm: currColY,
      wMm: Wc,
      hMm: colHeights[i],
    };
    currColY += colHeights[i] + g;
    return placed;
  });

  // 2) Row layout: all images share height Hc, placed horizontally
  const sumA = aspects.reduce((sum, a) => sum + a, 0);
  const maxHByWidth = sumA > 0 ? (P.w - g * (N - 1)) / sumA : 0;
  const Hc = Math.max(0, Math.min(P.h, maxHByWidth));
  const rowWidths = aspects.map((a) => a * Hc);
  const totalRowW = rowWidths.reduce((sum, w) => sum + w, 0) + g * (N - 1);
  const rowStartX = P.x + (P.w - totalRowW) / 2;
  const rowStartY = P.y + (P.h - Hc) / 2;

  let currRowX = rowStartX;
  const rowPlaced: Placed[] = items.map((item, i) => {
    const placed: Placed = {
      assetId: item.assetId,
      xMm: currRowX,
      yMm: rowStartY,
      wMm: rowWidths[i],
      hMm: Hc,
    };
    currRowX += rowWidths[i] + g;
    return placed;
  });

  // 3) Grid layout: cols = 2..N, pick cols with largest drawn area (ties: fewer rows)
  let bestGridPlaced: Placed[] = [];
  let bestGridArea = -1;
  let bestGridRows = Infinity;

  for (let cols = 2; cols <= N; cols++) {
    const rows = Math.ceil(N / cols);
    const cw = (P.w - g * (cols - 1)) / cols;
    const ch = (P.h - g * (rows - 1)) / rows;
    if (cw <= 0 || ch <= 0) continue;

    const candidatePlaced: Placed[] = [];
    let area = 0;

    for (let r = 0; r < rows; r++) {
      const startIndex = r * cols;
      const endIndex = Math.min(N, (r + 1) * cols);
      const k = endIndex - startIndex;
      const rowW = k * cw + (k - 1) * g;
      const rowX = P.x + (P.w - rowW) / 2;
      const rowY = P.y + r * (ch + g);

      for (let c = 0; c < k; c++) {
        const idx = startIndex + c;
        const a = aspects[idx];
        let w = cw;
        let h = ch;
        if (cw / ch > a) {
          h = ch;
          w = ch * a;
        } else {
          w = cw;
          h = cw / a;
        }
        const x = rowX + c * (cw + g) + (cw - w) / 2;
        const y = rowY + (ch - h) / 2;
        candidatePlaced.push({
          assetId: items[idx].assetId,
          xMm: x,
          yMm: y,
          wMm: w,
          hMm: h,
        });
        area += w * h;
      }
    }

    if (
      area > bestGridArea + 1e-6 ||
      (Math.abs(area - bestGridArea) <= 1e-6 && rows < bestGridRows)
    ) {
      bestGridArea = area;
      bestGridRows = rows;
      bestGridPlaced = candidatePlaced;
    }
  }

  // 4) Best fit: justified rows over all 2^(N-1) compositions
  let bestScore = -1;
  let bestRowsCount = Infinity;
  let bestPlaced: Placed[] = [];

  const totalCompositions = 1 << (N - 1);
  for (let mask = 0; mask < totalCompositions; mask++) {
    const rowPartitions: number[][] = [];
    let currentRowIndices: number[] = [0];

    for (let m = 0; m < N - 1; m++) {
      if ((mask & (1 << m)) !== 0) {
        rowPartitions.push(currentRowIndices);
        currentRowIndices = [m + 1];
      } else {
        currentRowIndices.push(m + 1);
      }
    }
    rowPartitions.push(currentRowIndices);

    const R = rowPartitions.length;
    let isValid = true;
    const rowHeights: number[] = [];

    for (const rowIdxs of rowPartitions) {
      const k = rowIdxs.length;
      const sumRowA = rowIdxs.reduce((sum, idx) => sum + aspects[idx], 0);
      const rowAvailableW = P.w - g * (k - 1);
      if (rowAvailableW <= 0 || sumRowA <= 0) {
        isValid = false;
        break;
      }
      rowHeights.push(rowAvailableW / sumRowA);
    }

    if (!isValid) continue;

    const sumH = rowHeights.reduce((sum, h) => sum + h, 0);
    const available = P.h - g * (R - 1);
    if (available <= 0 || sumH <= 0) continue;

    const s = Math.min(1, available / sumH);
    if (s <= 0) continue;

    let compArea = 0;
    const compPlaced: Placed[] = [];
    const scaledRowHeights = rowHeights.map((rh) => s * rh);
    const totalStackH =
      scaledRowHeights.reduce((sum, h) => sum + h, 0) + g * (R - 1);
    let compRowY = P.y + (P.h - totalStackH) / 2;

    for (let r = 0; r < R; r++) {
      const rowIdxs = rowPartitions[r];
      const k = rowIdxs.length;
      const rh = scaledRowHeights[r];
      const widths = rowIdxs.map((idx) => aspects[idx] * rh);
      const rowTotalW = widths.reduce((sum, w) => sum + w, 0) + g * (k - 1);
      let compRowX = P.x + (P.w - rowTotalW) / 2;

      for (let j = 0; j < k; j++) {
        const idx = rowIdxs[j];
        const w = widths[j];
        const h = rh;
        compPlaced.push({
          assetId: items[idx].assetId,
          xMm: compRowX,
          yMm: compRowY,
          wMm: w,
          hMm: h,
        });
        compRowX += w + g;
        compArea += w * h;
      }
      compRowY += rh + g;
    }

    if (
      compArea > bestScore + 1e-6 ||
      (Math.abs(compArea - bestScore) <= 1e-6 && R < bestRowsCount)
    ) {
      bestScore = compArea;
      bestRowsCount = R;
      bestPlaced = compPlaced;
    }
  }

  // Assemble candidates in order: best, grid, column, row
  const candidates: CollageOption[] = [
    { id: 'best', label: 'Best fit', items: bestPlaced },
    { id: 'grid', label: 'Grid', items: bestGridPlaced },
    { id: 'column', label: 'One column', items: columnPlaced },
    { id: 'row', label: 'One row', items: rowPlaced },
  ];
  const rawOptions: CollageOption[] = candidates.filter(
    (opt) => opt.items && opt.items.length === N
  );

  // Deduplicate: drop any option matching an earlier option within 1 mm
  const deduplicated: CollageOption[] = [];
  for (const opt of rawOptions) {
    const isDuplicate = deduplicated.some((existing) => {
      return opt.items.every((item, idx) => {
        const ex = existing.items[idx];
        return (
          Math.abs(item.xMm - ex.xMm) <= 1.0 &&
          Math.abs(item.yMm - ex.yMm) <= 1.0 &&
          Math.abs(item.wMm - ex.wMm) <= 1.0 &&
          Math.abs(item.hMm - ex.hMm) <= 1.0
        );
      });
    });

    if (!isDuplicate) {
      deduplicated.push(opt);
    }
  }

  if (deduplicated.length === 0 && rawOptions.length > 0) {
    deduplicated.push(rawOptions[0]);
  }

  return deduplicated;
}

export function placedToElements(placed: Placed[]): PageElement[] {
  return placed.map((p) => ({
    id: nanoid(),
    type: 'image',
    assetId: p.assetId,
    xMm: p.xMm,
    yMm: p.yMm,
    wMm: p.wMm,
    hMm: p.hMm,
    rotation: 0,
    fit: 'cover',
    cropGuides: false,
  }));
}
