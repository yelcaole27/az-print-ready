import { nanoid } from 'nanoid';
import type { Job, Page, PageElement } from '@/types';
import { PAPERS } from '@/lib/constants/papers';
import { getBackNudge } from './backNudge';
import { mirrorPageForOutput } from './backMirror';

function createCrosshairElement(
  cxMm: number,
  cyMm: number,
  num: number
): PageElement {
  // 8mm crosshair (center at 4mm) with number inside upper-right quadrant = 8mm width, 8mm height
  const wMm = 8;
  const hMm = 8;
  const xMm = Math.round((cxMm - 4) * 100) / 100;
  const yMm = Math.round((cyMm - 4) * 100) / 100;

  const svgHtml = `<svg width="100%" height="100%" viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg" style="display:block;"><line x1="0" y1="4" x2="8" y2="4" stroke="#000000" stroke-width="0.25" /><line x1="4" y1="0" x2="4" y2="8" stroke="#000000" stroke-width="0.25" /><text x="5" y="3.2" font-family="sans-serif" font-size="2.6" font-weight="bold" fill="#000000">${num}</text></svg>`;

  return {
    id: nanoid(),
    type: 'text',
    xMm,
    yMm,
    wMm,
    hMm,
    rotation: 0,
    paddingMm: 0,
    fillColor: 'transparent',
    borderMm: 0,
    html: svgHtml,
  };
}

function createLabelElement(
  pageWMm: number,
  yMm: number,
  label: string
): PageElement {
  const wMm = 60;
  const hMm = 12;
  const xMm = Math.round(((pageWMm - wMm) / 2) * 100) / 100;
  const html = `<div style="font-family:sans-serif;font-size:16px;font-weight:800;letter-spacing:0.1em;text-align:center;color:#000000;">TEST SHEET · ${label.toUpperCase()}</div>`;

  return {
    id: nanoid(),
    type: 'text',
    xMm,
    yMm,
    wMm,
    hMm,
    rotation: 0,
    paddingMm: 0,
    fillColor: 'transparent',
    borderMm: 0,
    html,
  };
}

export function generateTestSheetJob(
  paperId: string = 'letter',
  orientation: 'portrait' | 'landscape' = 'portrait',
  flipMode: 'sideways' | 'upward' = 'sideways'
): {
  job: Job;
  frontPage: Page;
  rawBackPage: Page;
  mirroredBackPage: Page;
  frontPageIndex: number;
  backPageIndex: number;
} {
  const paper = PAPERS.find((p) => p.id === paperId) || PAPERS[0];
  const isLandscape = orientation === 'landscape';
  const pageWMm = isLandscape
    ? Math.max(paper.widthMm, paper.heightMm)
    : Math.min(paper.widthMm, paper.heightMm);
  const pageHMm = isLandscape
    ? Math.min(paper.widthMm, paper.heightMm)
    : Math.max(paper.widthMm, paper.heightMm);

  const frontElements: PageElement[] = [
    createLabelElement(pageWMm, 24, 'Front'),
    createCrosshairElement(15, 15, 1),
    createCrosshairElement(pageWMm - 15, 15, 2),
    createCrosshairElement(15, pageHMm - 15, 3),
    createCrosshairElement(pageWMm - 15, pageHMm - 15, 4),
    createCrosshairElement(pageWMm / 2, pageHMm / 2, 5),
  ];

  const frontPage: Page = {
    id: 'test-front-page',
    paperId,
    orientation,
    elements: frontElements,
  };

  const rawBackElements: PageElement[] = [
    createLabelElement(pageWMm, 24, 'Back'),
    createCrosshairElement(15, 15, 1),
    createCrosshairElement(pageWMm - 15, 15, 2),
    createCrosshairElement(15, pageHMm - 15, 3),
    createCrosshairElement(pageWMm - 15, pageHMm - 15, 4),
    createCrosshairElement(pageWMm / 2, pageHMm / 2, 5),
  ];

  const rawBackPage: Page = {
    id: 'test-back-page',
    paperId,
    orientation,
    isBack: true,
    frontPageId: frontPage.id,
    flipMode,
    elements: rawBackElements,
  };

  const nudge = getBackNudge();
  const mirroredBackPage = mirrorPageForOutput(rawBackPage, nudge);

  const testJob: Job = {
    id: 'test-sheet-job',
    name: 'Alignment Test Sheet',
    settings: {
      unit: 'mm',
      marginMm: 0,
      gapMm: 0,
      cutStyle: 'none',
      borderless: true,
    },
    pages: [frontPage, rawBackPage],
    blocks: [],
  };

  return {
    job: testJob,
    frontPage,
    rawBackPage,
    mirroredBackPage,
    frontPageIndex: 0,
    backPageIndex: 1,
  };
}
