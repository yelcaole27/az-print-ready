import { nanoid } from 'nanoid';
import { ImageAsset, PageElement } from '@/types';
import { DocFitMode, DocAlign } from '@/store/useUiStore';

export interface DocumentLayoutArgs {
  asset: ImageAsset;
  pageWMm: number;
  pageHMm: number;
  marginMm: number;
  fit: DocFitMode;
  autoRotate: boolean;
  align: DocAlign;
  cropRect?: { x: number; y: number; w: number; h: number };
}

export function layoutDocumentImage({
  asset,
  pageWMm,
  pageHMm,
  marginMm,
  fit,
  autoRotate,
  align,
  cropRect,
}: DocumentLayoutArgs): PageElement[][] {
  const P = {
    x: marginMm,
    y: marginMm,
    w: Math.max(0, pageWMm - 2 * marginMm),
    h: Math.max(0, pageHMm - 2 * marginMm),
  };

  const effW = cropRect ? asset.pxW * (cropRect.w || 1) : asset.pxW;
  const effH = cropRect ? asset.pxH * (cropRect.h || 1) : asset.pxH;

  if (P.w <= 0 || P.h <= 0 || effW <= 0 || effH <= 0) {
    return [];
  }

  // 1) Fit page
  if (fit === 'fit-page') {
    const candidate0: {
      rot: 0 | 90;
      cw: number;
      ch: number;
      scale: number;
    } = {
      rot: 0,
      cw: effW,
      ch: effH,
      scale: Math.min(P.w / effW, P.h / effH),
    };

    let chosen = candidate0;

    if (autoRotate) {
      const candidate90 = {
        rot: 90 as const,
        cw: effH,
        ch: effW,
        scale: Math.min(P.w / effH, P.h / effW),
      };

      if (candidate90.scale > candidate0.scale) {
        chosen = candidate90;
      }
    }

    const wMm = chosen.cw * chosen.scale;
    const hMm = chosen.ch * chosen.scale;
    const x = P.x + (P.w - wMm) / 2;
    const y = align === 'top' ? P.y : P.y + (P.h - hMm) / 2;

    const element: PageElement = {
      id: nanoid(),
      type: 'image',
      assetId: asset.id,
      xMm: x,
      yMm: y,
      wMm,
      hMm,
      rotation: chosen.rot,
      fit: 'cover',
      cropGuides: false,
      cropRect,
    };

    return [[element]];
  }

  // 2) Fill page (crop)
  if (fit === 'fill-page') {
    const scale0 = Math.max(P.w / asset.pxW, P.h / asset.pxH);
    let chosenRot: 0 | 90 = 0;

    if (autoRotate) {
      const scale90 = Math.max(P.w / asset.pxH, P.h / asset.pxW);
      if (scale90 < scale0) {
        chosenRot = 90;
      }
    }

    const element: PageElement = {
      id: nanoid(),
      type: 'image',
      assetId: asset.id,
      xMm: P.x,
      yMm: P.y,
      wMm: P.w,
      hMm: P.h,
      rotation: chosenRot,
      fit: 'cover',
      cropGuides: false,
    };

    return [[element]];
  }

  // 3) Fill width (rotation always 0, autoRotate ignored)
  const scale = P.w / asset.pxW;
  const totalH = asset.pxH * scale;

  if (totalH <= P.h + 0.01) {
    const y = align === 'top' ? P.y : P.y + (P.h - totalH) / 2;
    const element: PageElement = {
      id: nanoid(),
      type: 'image',
      assetId: asset.id,
      xMm: P.x,
      yMm: y,
      wMm: P.w,
      hMm: totalH,
      rotation: 0,
      fit: 'cover',
      cropGuides: false,
    };

    return [[element]];
  }

  // Multi-page slicing
  const sliceCount = Math.ceil(totalH / P.h - 0.0001);
  const result: PageElement[][] = [];

  for (let i = 0; i < sliceCount; i++) {
    const sliceH =
      i < sliceCount - 1 ? P.h : totalH - P.h * (sliceCount - 1);
    const crop = {
      x: 0,
      y: (i * P.h) / totalH,
      w: 1,
      h: sliceH / totalH,
    };

    const element: PageElement = {
      id: nanoid(),
      type: 'image',
      assetId: asset.id,
      xMm: P.x,
      yMm: P.y,
      wMm: P.w,
      hMm: sliceH,
      rotation: 0,
      fit: 'stretch',
      crop,
      sliceIndex: i + 1,
      sliceCount,
      cropGuides: false,
    };

    result.push([element]);
  }

  return result;
}
