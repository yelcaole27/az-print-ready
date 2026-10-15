import { nanoid } from 'nanoid';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { getPageDimensionsMm } from '@/lib/pageGeometry';
import { findSpot, printableRect } from '@/lib/packing';
import type { PageElement } from '@/types';

interface InAppClipboard {
  elements: PageElement[];
  sourcePageId: string;
  pasteCount: number;
}

let inAppClipboard: InAppClipboard | null = null;

export function hasInAppClipboard(): boolean {
  return Boolean(inAppClipboard && inAppClipboard.elements.length > 0);
}

export function clearInAppClipboard(): void {
  inAppClipboard = null;
}

export function isInputOrModalFocused(): boolean {
  if (typeof document === 'undefined') return false;

  const active = document.activeElement as HTMLElement | null;
  if (
    active &&
    (active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      active.isContentEditable ||
      active.getAttribute('contenteditable') === 'true' ||
      active.getAttribute('role') === 'textbox' ||
      Boolean(
        active.closest(
          'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="dialog"]'
        )
      ))
  ) {
    return true;
  }

  const ui = useUiStore.getState();
  if (
    ui.isSettingsOpen ||
    ui.multiImport ||
    ui.checkNotice ||
    ui.confirmModal ||
    ui.editingBlockLayoutId ||
    ui.outputMode !== null
  ) {
    return true;
  }

  if (document.querySelector('[role="dialog"]')) {
    return true;
  }

  return false;
}

export function copySelection(): boolean {
  const { selected, selectedIds, selectedPageId } = useUiStore.getState();
  const { jobs, activeJobId } = useSessionStore.getState();
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  if (!activeJob) return false;

  let pageId: string | null = null;
  let elementIds: string[] = [];

  if (selectedIds.length > 0 && selectedPageId) {
    pageId = selectedPageId;
    elementIds = selectedIds;
  } else if (selected) {
    pageId = selected.pageId;
    elementIds = [selected.elementId];
  }

  if (!pageId || elementIds.length === 0) return false;

  const page = activeJob.pages.find((p) => p.id === pageId);
  if (!page) return false;

  const elementsToCopy = page.elements.filter((el) => elementIds.includes(el.id));
  if (elementsToCopy.length === 0) return false;

  inAppClipboard = {
    elements: elementsToCopy.map((el) => ({ ...el })),
    sourcePageId: pageId,
    pasteCount: 0,
  };

  return true;
}

export function cutSelection(): boolean {
  const copied = copySelection();
  if (!copied || !inAppClipboard) return false;

  const { clearSelection } = useUiStore.getState();
  const { jobs, activeJobId, commit } = useSessionStore.getState();
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  if (!activeJob) return false;

  const pageId = inAppClipboard.sourcePageId;
  const elementIdsToRemove = new Set(inAppClipboard.elements.map((el) => el.id));

  // Exactly one undo entry
  commit(activeJob.id);

  useSessionStore.setState((state) => ({
    jobs: state.jobs.map((j) => {
      if (j.id !== activeJob.id) return j;
      return {
        ...j,
        pages: j.pages.map((p) => {
          if (p.id !== pageId) return p;
          return {
            ...p,
            elements: p.elements.filter((el) => !elementIdsToRemove.has(el.id)),
          };
        }),
      };
    }),
  }));

  clearSelection();
  return true;
}

export function duplicateSelection(): boolean {
  const { selected, selectedIds, selectedPageId, setSelection } = useUiStore.getState();
  const { jobs, activeJobId, duplicateElement, commit } = useSessionStore.getState();
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  if (!activeJob) return false;

  if (selected) {
    const newId = duplicateElement(activeJob.id, selected.pageId, selected.elementId);
    if (newId) {
      setSelection(selected.pageId, [newId]);
      return true;
    }
    return false;
  }

  if (selectedIds.length > 0 && selectedPageId) {
    const page = activeJob.pages.find((p) => p.id === selectedPageId);
    if (!page) return false;

    const elementsToDup = page.elements.filter((el) => selectedIds.includes(el.id));
    if (elementsToDup.length === 0) return false;

    commit(activeJob.id);

    const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(page);
    const newIds: string[] = [];
    const newElements: PageElement[] = [];

    for (const el of elementsToDup) {
      const newId = nanoid();
      newIds.push(newId);
      const clampedX = Math.min(pageW - el.wMm, el.xMm + 5);
      const clampedY = Math.min(pageH - el.hMm, el.yMm + 5);
      newElements.push({
        ...el,
        id: newId,
        xMm: Math.max(0, clampedX),
        yMm: Math.max(0, clampedY),
      });
    }

    useSessionStore.setState((state) => ({
      jobs: state.jobs.map((j) => {
        if (j.id !== activeJob.id) return j;
        return {
          ...j,
          pages: j.pages.map((p) => {
            if (p.id !== selectedPageId) return p;
            return {
              ...p,
              elements: [...p.elements, ...newElements],
            };
          }),
        };
      }),
    }));

    setSelection(selectedPageId, newIds);
    return true;
  }

  return false;
}

export function pasteInAppClipboard(): boolean {
  if (!inAppClipboard || inAppClipboard.elements.length === 0) return false;

  const { selected, selectedPageId, activePageId, setSelection, setActivePage } =
    useUiStore.getState();
  const { jobs, activeJobId, commit } = useSessionStore.getState();
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  if (!activeJob) return false;

  const targetPageId =
    selected?.pageId ||
    selectedPageId ||
    activePageId ||
    activeJob.pages[0]?.id;

  const targetPage =
    activeJob.pages.find((p) => p.id === targetPageId) || activeJob.pages[0];
  if (!targetPage) return false;

  inAppClipboard.pasteCount += 1;
  const shiftMm = inAppClipboard.pasteCount * 5;

  const { wMm: pageW, hMm: pageH } = getPageDimensionsMm(targetPage);
  const marginMm = activeJob.settings.borderless ? 0 : activeJob.settings.marginMm;
  const pPrintable = printableRect(pageW, pageH, marginMm);

  const newElements: PageElement[] = [];
  const newIds: string[] = [];

  // Track occupied boxes for findSpot
  const currentOccupied = targetPage.elements.map((e) => ({
    x: e.xMm,
    y: e.yMm,
    w: e.wMm,
    h: e.hMm,
  }));

  for (const el of inAppClipboard.elements) {
    let targetX = el.xMm + shiftMm;
    let targetY = el.yMm + shiftMm;

    // Wrap back near margin if shifted position would leave the page
    const maxSpanX = Math.max(0, pageW - marginMm - el.wMm);
    const maxSpanY = Math.max(0, pageH - marginMm - el.hMm);

    if (targetX + el.wMm > pageW || targetY + el.hMm > pageH) {
      if (maxSpanX > marginMm) {
        targetX = marginMm + ((targetX - marginMm) % (maxSpanX - marginMm + 5));
      } else {
        targetX = marginMm;
      }

      if (maxSpanY > marginMm) {
        targetY = marginMm + ((targetY - marginMm) % (maxSpanY - marginMm + 5));
      } else {
        targetY = marginMm;
      }
    }

    // If still off the page, use findSpot for the first free spot
    if (
      targetX + el.wMm > pageW ||
      targetY + el.hMm > pageH ||
      targetX < 0 ||
      targetY < 0
    ) {
      const spot = findSpot(
        currentOccupied,
        el.wMm,
        el.hMm,
        pPrintable,
        activeJob.settings.gapMm
      );
      if (spot) {
        targetX = spot.x;
        targetY = spot.y;
      } else {
        targetX = Math.max(0, Math.min(pageW - el.wMm, targetX));
        targetY = Math.max(0, Math.min(pageH - el.hMm, targetY));
      }
    }

    const newId = nanoid();
    newIds.push(newId);

    const pastedElement: PageElement = {
      ...el,
      id: newId,
      xMm: Math.round(targetX * 100) / 100,
      yMm: Math.round(targetY * 100) / 100,
    };

    newElements.push(pastedElement);
    currentOccupied.push({
      x: pastedElement.xMm,
      y: pastedElement.yMm,
      w: pastedElement.wMm,
      h: pastedElement.hMm,
    });
  }

  // Exactly one undo entry for the whole paste operation
  commit(activeJob.id);

  useSessionStore.setState((state) => ({
    jobs: state.jobs.map((j) => {
      if (j.id !== activeJob.id) return j;
      return {
        ...j,
        pages: j.pages.map((p) => {
          if (p.id !== targetPage.id) return p;
          return {
            ...p,
            elements: [...p.elements, ...newElements],
          };
        }),
      };
    }),
  }));

  setSelection(targetPage.id, newIds);
  setActivePage(targetPage.id);

  return true;
}
