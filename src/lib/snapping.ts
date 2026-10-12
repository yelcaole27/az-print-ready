export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GuideLine {
  axis: 'x' | 'y';
  posMm: number;
}

export interface SnapMoveResult {
  x: number;
  y: number;
  guides: GuideLine[];
}

export function snapMove(
  rect: Rect,
  otherRects: Rect[],
  printable: Rect,
  pageW: number,
  pageH: number,
  thresholdMm: number,
  gapMm: number = 0
): SnapMoveResult {
  let bestDx: number | null = null;
  let bestGuideX: number | null = null;

  // 1) Targets for X
  const standardTargetsX: number[] = [
    printable.x,
    printable.x + printable.w,
    pageW / 2,
  ];

  for (const other of otherRects) {
    standardTargetsX.push(other.x);
    standardTargetsX.push(other.x + other.w);
    standardTargetsX.push(other.x + other.w / 2);
  }

  // Check moving rect left, right, and center against standard targets
  for (const t of standardTargetsX) {
    // Left edge
    const dxLeft = t - rect.x;
    if (Math.abs(dxLeft) <= thresholdMm) {
      if (bestDx === null || Math.abs(dxLeft) < Math.abs(bestDx)) {
        bestDx = dxLeft;
        bestGuideX = t;
      }
    }

    // Right edge
    const dxRight = t - (rect.x + rect.w);
    if (Math.abs(dxRight) <= thresholdMm) {
      if (bestDx === null || Math.abs(dxRight) < Math.abs(bestDx)) {
        bestDx = dxRight;
        bestGuideX = t;
      }
    }

    // Center X
    const dxCenter = t - (rect.x + rect.w / 2);
    if (Math.abs(dxCenter) <= thresholdMm) {
      if (bestDx === null || Math.abs(dxCenter) < Math.abs(bestDx)) {
        bestDx = dxCenter;
        bestGuideX = t;
      }
    }
  }

  // Gap targets for X
  for (const other of otherRects) {
    // moving left snaps to other.right + gap
    const targetLeftGap = other.x + other.w + gapMm;
    const dxGapLeft = targetLeftGap - rect.x;
    if (Math.abs(dxGapLeft) <= thresholdMm) {
      if (bestDx === null || Math.abs(dxGapLeft) < Math.abs(bestDx)) {
        bestDx = dxGapLeft;
        bestGuideX = targetLeftGap;
      }
    }

    // moving right snaps to other.left - gap
    const targetRightGap = other.x - gapMm;
    const dxGapRight = targetRightGap - (rect.x + rect.w);
    if (Math.abs(dxGapRight) <= thresholdMm) {
      if (bestDx === null || Math.abs(dxGapRight) < Math.abs(bestDx)) {
        bestDx = dxGapRight;
        bestGuideX = targetRightGap;
      }
    }
  }

  // 2) Targets for Y
  let bestDy: number | null = null;
  let bestGuideY: number | null = null;

  const standardTargetsY: number[] = [
    printable.y,
    printable.y + printable.h,
    pageH / 2,
  ];

  for (const other of otherRects) {
    standardTargetsY.push(other.y);
    standardTargetsY.push(other.y + other.h);
    standardTargetsY.push(other.y + other.h / 2);
  }

  // Check moving rect top, bottom, and center against standard targets
  for (const t of standardTargetsY) {
    // Top edge
    const dyTop = t - rect.y;
    if (Math.abs(dyTop) <= thresholdMm) {
      if (bestDy === null || Math.abs(dyTop) < Math.abs(bestDy)) {
        bestDy = dyTop;
        bestGuideY = t;
      }
    }

    // Bottom edge
    const dyBottom = t - (rect.y + rect.h);
    if (Math.abs(dyBottom) <= thresholdMm) {
      if (bestDy === null || Math.abs(dyBottom) < Math.abs(bestDy)) {
        bestDy = dyBottom;
        bestGuideY = t;
      }
    }

    // Center Y
    const dyCenter = t - (rect.y + rect.h / 2);
    if (Math.abs(dyCenter) <= thresholdMm) {
      if (bestDy === null || Math.abs(dyCenter) < Math.abs(bestDy)) {
        bestDy = dyCenter;
        bestGuideY = t;
      }
    }
  }

  // Gap targets for Y
  for (const other of otherRects) {
    // moving top snaps to other.bottom + gap
    const targetTopGap = other.y + other.h + gapMm;
    const dyGapTop = targetTopGap - rect.y;
    if (Math.abs(dyGapTop) <= thresholdMm) {
      if (bestDy === null || Math.abs(dyGapTop) < Math.abs(bestDy)) {
        bestDy = dyGapTop;
        bestGuideY = targetTopGap;
      }
    }

    // moving bottom snaps to other.top - gap
    const targetBottomGap = other.y - gapMm;
    const dyGapBottom = targetBottomGap - (rect.y + rect.h);
    if (Math.abs(dyGapBottom) <= thresholdMm) {
      if (bestDy === null || Math.abs(dyGapBottom) < Math.abs(bestDy)) {
        bestDy = dyGapBottom;
        bestGuideY = targetBottomGap;
      }
    }
  }

  const snappedX = bestDx !== null ? rect.x + bestDx : rect.x;
  const snappedY = bestDy !== null ? rect.y + bestDy : rect.y;

  const clampedX = Math.max(0, Math.min(pageW - rect.w, snappedX));
  const clampedY = Math.max(0, Math.min(pageH - rect.h, snappedY));

  const guides: GuideLine[] = [];
  if (bestGuideX !== null) {
    guides.push({ axis: 'x', posMm: bestGuideX });
  }
  if (bestGuideY !== null) {
    guides.push({ axis: 'y', posMm: bestGuideY });
  }

  return {
    x: clampedX,
    y: clampedY,
    guides,
  };
}

export function snapResizeEdge(
  edgePos: number,
  axis: 'x' | 'y',
  otherRects: Rect[],
  printable: Rect,
  pageDim: number,
  thresholdMm: number,
  gapMm: number = 0
): { pos: number; guide: GuideLine | null } {
  let bestDelta: number | null = null;
  let bestGuidePos: number | null = null;

  const standardTargets: number[] = [
    axis === 'x' ? printable.x : printable.y,
    axis === 'x' ? printable.x + printable.w : printable.y + printable.h,
    pageDim / 2,
  ];

  for (const other of otherRects) {
    if (axis === 'x') {
      standardTargets.push(other.x);
      standardTargets.push(other.x + other.w);
      standardTargets.push(other.x + other.w / 2);
      standardTargets.push(other.x + other.w + gapMm);
      standardTargets.push(other.x - gapMm);
    } else {
      standardTargets.push(other.y);
      standardTargets.push(other.y + other.h);
      standardTargets.push(other.y + other.h / 2);
      standardTargets.push(other.y + other.h + gapMm);
      standardTargets.push(other.y - gapMm);
    }
  }

  for (const t of standardTargets) {
    const delta = t - edgePos;
    if (Math.abs(delta) <= thresholdMm) {
      if (bestDelta === null || Math.abs(delta) < Math.abs(bestDelta)) {
        bestDelta = delta;
        bestGuidePos = t;
      }
    }
  }

  if (bestDelta !== null && bestGuidePos !== null) {
    return {
      pos: edgePos + bestDelta,
      guide: { axis, posMm: bestGuidePos },
    };
  }

  return {
    pos: edgePos,
    guide: null,
  };
}
