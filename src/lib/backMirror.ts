import type { Page, PageElement } from '@/types';
import { getPageDimensionsMm } from './pageGeometry';
import type { BackNudge } from './backNudge';

export function mirrorElementForOutput(
  el: PageElement,
  pageWMm: number,
  pageHMm: number,
  flipMode: 'sideways' | 'upward',
  nudge: BackNudge
): PageElement {
  if (flipMode === 'upward') {
    const rawX = el.xMm + nudge.xMm;
    const rawY = pageHMm - el.yMm - el.hMm + nudge.yMm;
    const nextRotation = ((el.rotation + 180) % 360) as 0 | 90 | 180 | 270;
    return {
      ...el,
      xMm: Math.round(rawX * 100) / 100,
      yMm: Math.round(rawY * 100) / 100,
      rotation: nextRotation,
    };
  }

  // Sideways flip (default)
  const rawX = pageWMm - el.xMm - el.wMm + nudge.xMm;
  const rawY = el.yMm + nudge.yMm;
  return {
    ...el,
    xMm: Math.round(rawX * 100) / 100,
    yMm: Math.round(rawY * 100) / 100,
  };
}

export function mirrorPageForOutput(page: Page, nudge: BackNudge): Page {
  const { wMm, hMm } = getPageDimensionsMm(page);
  const flipMode = page.flipMode || 'sideways';

  const mirroredElements = page.elements.map((el) =>
    mirrorElementForOutput(el, wMm, hMm, flipMode, nudge)
  );

  return {
    ...page,
    elements: mirroredElements,
  };
}
