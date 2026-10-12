import { nanoid } from 'nanoid';
import { PageElement } from '@/types';
import { getPageDimensionsMm, clampToPage } from '@/lib/pageGeometry';
import { printableRect } from '@/lib/packing';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';

export function addTextBox() {
  const { jobs, activeJobId, applyPlacements } = useSessionStore.getState();
  const { activePageId, select, setEditingElement } = useUiStore.getState();

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const activePageIndex = Math.max(
    0,
    activeJob.pages.findIndex((p) => p.id === activePageId)
  );
  const targetPage = activeJob.pages[activePageIndex];
  const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(targetPage);
  const pRect = printableRect(pageW, pageH, activeJob.settings.marginMm);

  const boxW = Math.min(100, pRect.w > 0 ? pRect.w : 100);
  const boxH = Math.min(30, pRect.h > 0 ? pRect.h : 30);

  // Centered inside printable area
  const rawX = pRect.x + (pRect.w - boxW) / 2;
  const rawY = pRect.y + (pRect.h - boxH) / 2;
  const clamped = clampToPage(rawX, rawY, boxW, boxH, pageW, pageH, 10);

  const newElementId = nanoid();
  const textElement: PageElement = {
    id: newElementId,
    type: 'text',
    xMm: clamped.x,
    yMm: clamped.y,
    wMm: clamped.w,
    hMm: clamped.h,
    rotation: 0,
    html: '<p></p>',
    vAlign: 'top',
    paddingMm: 2,
    fillColor: null,
    borderMm: 0,
    borderColor: '#111111',
    autoGrow: true,
  };

  applyPlacements(activeJob.id, [
    { pageIndex: activePageIndex, element: textElement },
  ]);

  select({ pageId: targetPage.id, elementId: newElementId });
  setEditingElement({ pageId: targetPage.id, elementId: newElementId });
}

export function newTextPage(initialText?: string) {
  const { jobs, activeJobId, applyPlacements } = useSessionStore.getState();
  const { select, setEditingElement, setMessage, setActivePage } = useUiStore.getState();

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const lastPage = activeJob.pages[activeJob.pages.length - 1];

  let targetPageIndex: number;

  if (lastPage && lastPage.elements.length === 0) {
    targetPageIndex = activeJob.pages.length - 1;
  } else {
    if (activeJob.pages.length >= 50) {
      setMessage({
        type: 'warn',
        text: 'Safety limit reached: cannot exceed 50 pages.',
      });
      return;
    }
    targetPageIndex = activeJob.pages.length;
  }

  // Get paper geometry from template/last page
  const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(lastPage);
  const pRect = printableRect(pageW, pageH, activeJob.settings.marginMm);

  // Convert plain text into paragraphs if provided
  let html = '<p></p>';
  if (initialText && initialText.trim().length > 0) {
    const paragraphs = initialText
      .split(/\r?\n/)
      .map((line) => {
        const escaped = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<p>${escaped || '<br>'}</p>`;
      });
    html = paragraphs.join('');
  }

  const newElementId = nanoid();
  const textElement: PageElement = {
    id: newElementId,
    type: 'text',
    xMm: pRect.x,
    yMm: pRect.y,
    wMm: pRect.w,
    hMm: pRect.h,
    rotation: 0,
    html,
    vAlign: 'top',
    paddingMm: 2,
    fillColor: null,
    borderMm: 0,
    borderColor: '#111111',
    autoGrow: false,
  };

  applyPlacements(activeJob.id, [
    { pageIndex: targetPageIndex, element: textElement },
  ]);

  // Update target page ID after placement creation
  const updatedJob = useSessionStore.getState().jobs.find((j) => j.id === activeJob.id)!;
  const actualTargetPage = updatedJob.pages[targetPageIndex];

  setActivePage(actualTargetPage.id);
  select({ pageId: actualTargetPage.id, elementId: newElementId });
  if (!initialText) {
    setEditingElement({ pageId: actualTargetPage.id, elementId: newElementId });
  }
}
