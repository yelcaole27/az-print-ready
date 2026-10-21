import { nanoid } from 'nanoid';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { getPageDimensionsMm } from '@/lib/pageGeometry';
import { findSpot, printableRect } from '@/lib/packing';
import { BlockCtx, generateBlockPages, blockSignature } from '@/lib/blocks';
import type { PageElement, Block, SheetRow } from '@/types';

interface InAppClipboard {
  elements: PageElement[];
  sourcePageId: string;
  pasteCount: number;
}

const CLIPBOARD_SESSION_ID = nanoid();
let inAppCopyCounter = 0;
let inAppCopyTimestamp = 0;
let lastSystemPasteTimestamp = 0;
let lastMarkerWriteFailed = false;

let inAppClipboard: InAppClipboard | null = null;

export function hasInAppClipboard(): boolean {
  return Boolean(inAppClipboard && inAppClipboard.elements.length > 0);
}

export function clearInAppClipboard(): void {
  inAppClipboard = null;
}

export function parseMarker(text: string): { sessionId: string; counter: number } | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('azpr-internal:')) return null;
  const parts = trimmed.split(':');
  if (parts.length !== 3) return null;
  const counter = parseInt(parts[2], 10);
  if (isNaN(counter)) return null;
  return { sessionId: parts[1], counter };
}

export function isCurrentMarker(text: string): boolean {
  const parsed = parseMarker(text);
  if (!parsed) return false;
  return parsed.sessionId === CLIPBOARD_SESSION_ID && parsed.counter === inAppCopyCounter;
}

export function getInAppCopyTimestamp(): number {
  return inAppCopyTimestamp;
}

export function getLastSystemPasteTimestamp(): number {
  return lastSystemPasteTimestamp;
}

export function recordSystemPaste(): void {
  lastSystemPasteTimestamp = Date.now();
}

export function isLastMarkerWriteFailed(): boolean {
  return lastMarkerWriteFailed;
}

export function setLastMarkerWriteFailed(val: boolean): void {
  lastMarkerWriteFailed = val;
}

export function getClipboardSessionId(): string {
  return CLIPBOARD_SESSION_ID;
}

export function getInAppCopyCounter(): number {
  return inAppCopyCounter;
}

export function hasSelectionToCopy(): boolean {
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
  return page.elements.some((el) => elementIds.includes(el.id));
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

export function copySelection(options?: { skipWriteText?: boolean }): string | null {
  const { selected, selectedIds, selectedPageId } = useUiStore.getState();
  const { jobs, activeJobId } = useSessionStore.getState();
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  if (!activeJob) return null;

  let pageId: string | null = null;
  let elementIds: string[] = [];

  if (selectedIds.length > 0 && selectedPageId) {
    pageId = selectedPageId;
    elementIds = selectedIds;
  } else if (selected) {
    pageId = selected.pageId;
    elementIds = [selected.elementId];
  }

  if (!pageId || elementIds.length === 0) return null;

  const page = activeJob.pages.find((p) => p.id === pageId);
  if (!page) return null;

  const elementsToCopy = page.elements.filter((el) => elementIds.includes(el.id));
  const now = Date.now();
  if (now - inAppCopyTimestamp < 150 && inAppClipboard) {
    const marker = `azpr-internal:${CLIPBOARD_SESSION_ID}:${inAppCopyCounter}`;
    if (!options?.skipWriteText && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(marker)
        .then(() => {
          lastMarkerWriteFailed = false;
        })
        .catch(() => {
          lastMarkerWriteFailed = true;
        });
    } else if (options?.skipWriteText) {
      lastMarkerWriteFailed = false;
    }
    return marker;
  }

  inAppClipboard = {
    elements: elementsToCopy.map((el) => ({ ...el })),
    sourcePageId: pageId,
    pasteCount: 0,
  };

  inAppCopyCounter += 1;
  inAppCopyTimestamp = Date.now();
  const marker = `azpr-internal:${CLIPBOARD_SESSION_ID}:${inAppCopyCounter}`;

  if (!options?.skipWriteText && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(marker)
      .then(() => {
        lastMarkerWriteFailed = false;
      })
      .catch(() => {
        lastMarkerWriteFailed = true;
      });
  } else if (options?.skipWriteText) {
    lastMarkerWriteFailed = false;
  }

  return marker;
}

export function cutSelection(options?: { skipWriteText?: boolean }): string | null {
  const marker = copySelection(options);
  if (!marker || !inAppClipboard) return null;

  const { clearSelection } = useUiStore.getState();
  const { jobs, activeJobId, commit } = useSessionStore.getState();
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  if (!activeJob) return null;

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
  return marker;
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

  const block = activeJob.blocks?.find((b) => b.id === targetPage.blockId);
  if (block && block.kind === 'sheet') {
    commit(activeJob.id);
    const existingRows = (block.rows || []).map((r) => ({ ...r, id: r.id || nanoid() }));
    const newRowIds: string[] = [];
    const addedRows: SheetRow[] = [];

    for (const el of inAppClipboard.elements) {
      if (!el.assetId) continue;
      const newRowId = nanoid();
      newRowIds.push(newRowId);
      const sourceRow = existingRows.find((r) => r.id === el.rowId) ||
        existingRows.find((r) => r.assetId === el.assetId);

      const size = sourceRow
        ? { ...sourceRow.size }
        : { id: `custom-${Math.round(el.wMm)}x${Math.round(el.hMm)}`, wMm: el.wMm, hMm: el.hMm };

      addedRows.push({
        id: newRowId,
        assetId: el.assetId,
        size,
        qty: 1,
        fillPage: false,
        crop: sourceRow ? Boolean(sourceRow.crop) : false,
      });
    }

    if (addedRows.length > 0) {
      const updatedRows = [...existingRows, ...addedRows];
      const updatedBlock: Block = {
        ...block,
        assetIds: Array.from(new Set(updatedRows.map((r) => r.assetId))),
        rows: updatedRows,
        generatedSig: '',
      };

      const { wMm: pageWMm, hMm: pageHMm } = getPageDimensionsMm(targetPage);
      const effectiveMargin = activeJob.settings.borderless
        ? 0
        : (activeJob.settings.marginMm ?? 6.35);

      const ctx: BlockCtx = {
        paperId: targetPage.paperId,
        orientation: targetPage.orientation,
        pageWMm,
        pageHMm,
        marginMm: effectiveMargin,
        gapMm: activeJob.settings.gapMm,
        assetsById: Object.fromEntries(useSessionStore.getState().assets.map((a) => [a.id, a])),
      };

      const newPages = generateBlockPages(updatedBlock, ctx);
      updatedBlock.generatedSig = blockSignature(newPages);

      const firstIndex = activeJob.pages.findIndex((p) => p.blockId === block.id);
      const pagesBefore = firstIndex === -1
        ? activeJob.pages.filter((p) => p.blockId !== block.id)
        : activeJob.pages.slice(0, firstIndex).filter((p) => p.blockId !== block.id);
      const pagesAfter = firstIndex === -1
        ? []
        : activeJob.pages.slice(firstIndex).filter((p) => p.blockId !== block.id);
      const finalPages = [...pagesBefore, ...newPages, ...pagesAfter];

      useSessionStore.setState((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === activeJob.id
            ? {
                ...j,
                blocks: (j.blocks || []).map((b) => (b.id === block.id ? updatedBlock : b)),
                pages: finalPages,
              }
            : j
        ),
      }));

      const createdEls = newPages.flatMap((p) => p.elements).filter((el) => newRowIds.includes(el.rowId || ''));
      if (createdEls.length > 0) {
        const firstEl = createdEls[0];
        const pageWithEl = newPages.find((p) => p.elements.some((e) => e.id === firstEl.id));
        if (pageWithEl) {
          setActivePage(pageWithEl.id);
          if (createdEls.length === 1) {
            useUiStore.getState().select({ pageId: pageWithEl.id, elementId: firstEl.id });
          } else {
            setSelection(pageWithEl.id, createdEls.map((e) => e.id));
          }
        }
      }
      return true;
    }
  }

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
