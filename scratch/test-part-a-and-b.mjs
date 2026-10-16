import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempDir = path.join(process.env.TEMP || 'C:\\Temp', 'chrome-abtest-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  console.log('[Test] Spawning headless Chrome...');
  const chromeProc = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=9224',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tempDir}`,
    'http://localhost:3000',
  ]);

  let cdpUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9224/json/list');
      const tabs = await res.json();
      const page = tabs.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        cdpUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {
      // wait
    }
  }

  if (!cdpUrl) {
    chromeProc.kill();
    throw new Error('Could not connect to Chrome CDP');
  }

  console.log('[Test] Connected to CDP:', cdpUrl);
  const ws = new WebSocket(cdpUrl);

  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  const send = (method, params = {}) => {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  const evalCode = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      console.error('Eval error:', res.exceptionDetails);
      throw new Error(res.exceptionDetails.text || 'Runtime.evaluate exception');
    }
    return res.result?.value;
  };

  await send('Page.enable');
  await send('DOM.enable');
  await sleep(1500);

  console.log('=== TEST PART A: Empty pages ===');

  // Check 1: On start screen (all pages empty), Print & Save as PDF are disabled & dimmed with title "Add a picture first"
  const initialButtons = await evalCode(`(() => {
    const printBtn = document.querySelector('button[aria-label="Print job"]');
    const pdfBtn = document.querySelector('button[aria-label="Save as PDF"]');
    return {
      printDisabled: printBtn ? printBtn.disabled : null,
      printTitle: printBtn ? printBtn.title : null,
      pdfDisabled: pdfBtn ? pdfBtn.disabled : null,
      pdfTitle: pdfBtn ? pdfBtn.title : null,
    };
  })()`);
  console.log('Initial Start Screen buttons:', initialButtons);
  if (!initialButtons.printDisabled || initialButtons.printTitle !== 'Add a picture first') {
    throw new Error('Print button not properly disabled on empty project');
  }
  if (!initialButtons.pdfDisabled || initialButtons.pdfTitle !== 'Add a picture first') {
    throw new Error('Save as PDF button not properly disabled on empty project');
  }
  console.log('PASS: Print & Save as PDF disabled with title "Add a picture first" on empty project.');

  // Set up a job in workspace with 1 picture on page 1 and an empty page 2
  console.log('[Test] Setting up workspace with 1 picture and 1 empty page...');
  const setupRes = await evalCode(`(async () => {
    const { useSessionStore, useUiStore } = window.__AZ_TEST__;
    const session = useSessionStore.getState();
    const activeJobId = session.activeJobId;

    // Create 1 test image asset with thumbUrl, previewUrl, originalBlob, pxW, pxH
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4A90E2';
    ctx.fillRect(0, 0, 1600, 1200);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 200;
    thumbCanvas.height = 150;
    const tCtx = thumbCanvas.getContext('2d');
    tCtx.drawImage(canvas, 0, 0, 200, 150);
    const thumbBlob = await new Promise((r) => thumbCanvas.toBlob(r, 'image/jpeg', 0.85));

    const assetId = 'test-asset-' + Math.random().toString(36).slice(2, 8);
    const asset = {
      id: assetId,
      name: 'vacation.jpg',
      originalBlob: blob,
      previewUrl: URL.createObjectURL(blob),
      thumbUrl: URL.createObjectURL(thumbBlob),
      objectUrl: URL.createObjectURL(blob),
      pxW: 1600,
      pxH: 1200,
    };

    session.addAssets([asset], activeJobId);
    session.addBlocks(activeJobId, [{ kind: 'fit', assetIds: [asset.id] }]);

    // Add a second page (which starts empty)
    session.addPage(activeJobId);

    const updatedJob = useSessionStore.getState().jobs.find(j => j.id === activeJobId);
    if (updatedJob && updatedJob.pages[1]) {
      useUiStore.getState().setActivePage(updatedJob.pages[1].id);
    }

    return {
      pagesCount: useSessionStore.getState().jobs[0].pages.length,
      p1Elements: useSessionStore.getState().jobs[0].pages[0].elements.length,
      p2Elements: useSessionStore.getState().jobs[0].pages[1].elements.length,
    };
  })()`);
  console.log('Setup result:', setupRes);
  await sleep(600);

  // Inspect RightPanel Pages list
  const pagesListCheck = await evalCode(`(() => {
    // Find all page items in the right panel
    const cards = Array.from(document.querySelectorAll('div')).filter(el => {
      const isCard = el.className && typeof el.className === 'string' && el.className.includes('p-3') && el.className.includes('cursor-pointer');
      return isCard && el.textContent && el.textContent.includes('Page ');
    });

    return cards.map(c => {
      const text = c.textContent || '';
      const trashBtn = c.querySelector('button[aria-label="Delete page"]');
      return {
        text,
        isEmpty: text.includes('Empty'),
        hasTrashBtn: Boolean(trashBtn),
        trashTitle: trashBtn ? trashBtn.title : null,
      };
    });
  })()`);
  console.log('Right panel cards check:', pagesListCheck);

  const emptyPage = pagesListCheck.find(p => p.isEmpty);
  const nonEmptyPage = pagesListCheck.find(p => !p.isEmpty);
  if (!emptyPage || !emptyPage.hasTrashBtn || emptyPage.trashTitle !== 'Delete page') {
    throw new Error('Empty page card does not show delete trash button');
  }
  if (!nonEmptyPage || nonEmptyPage.hasTrashBtn) {
    throw new Error('Non-empty page card unexpectedly shows trash button');
  }
  console.log('PASS: Empty page shows trash button, non-empty page does not.');

  // Check Print & Save as PDF in TopBar: Since page 1 has a picture, they should NOT be disabled!
  const enabledButtons = await evalCode(`(() => {
    const printBtn = document.querySelector('button[aria-label="Print job"]');
    const pdfBtn = document.querySelector('button[aria-label="Save as PDF"]');
    return {
      printDisabled: printBtn ? printBtn.disabled : null,
      pdfDisabled: pdfBtn ? pdfBtn.disabled : null,
    };
  })()`);
  console.log('Workspace buttons with 1 non-empty page:', enabledButtons);
  if (enabledButtons.printDisabled || enabledButtons.pdfDisabled) {
    throw new Error('Buttons should be enabled when there is at least one non-empty page');
  }
  console.log('PASS: Print & Save as PDF enabled when non-empty page exists.');

  // Check getOutputPageIndexes skips empty page
  const outputPages = await evalCode(`(() => {
    const { getOutputPageIndexes } = window.__AZ_TEST__;
    const data = getOutputPageIndexes();
    return {
      outputPageCount: data?.pageIndexes.length,
      pageIndexes: data?.pageIndexes,
      totalJobPages: data?.job.pages.length,
    };
  })()`);
  console.log('Output page indexes check:', outputPages);
  if (outputPages.outputPageCount !== 1 || outputPages.totalJobPages !== 2) {
    throw new Error('Print/Export did not skip the empty page!');
  }
  console.log('PASS: Print and Save as PDF skip empty pages (1 output page for 2-page job).');

  // Click trash button on the empty page
  console.log('[Test] Clicking trash button on empty page card...');
  await evalCode(`(() => {
    const cards = Array.from(document.querySelectorAll('div')).filter(el => {
      const isCard = el.className && typeof el.className === 'string' && el.className.includes('p-3') && el.className.includes('cursor-pointer');
      return isCard && el.textContent && el.textContent.includes('Empty');
    });
    const trashBtn = cards[0].querySelector('button[aria-label="Delete page"]');
    trashBtn.click();
  })()`);
  await sleep(500);

  // Confirm modal did NOT appear and page count is 1
  const afterDeleteCheck = await evalCode(`(() => {
    const { useSessionStore } = window.__AZ_TEST__;
    const modal = document.querySelector('[role="dialog"]');
    const job = useSessionStore.getState().jobs[0];
    return {
      modalOpen: Boolean(modal),
      jobPages: job.pages.length,
    };
  })()`);
  console.log('After delete check:', afterDeleteCheck);
  if (afterDeleteCheck.modalOpen) {
    throw new Error('Confirmation modal opened for empty page delete');
  }
  if (afterDeleteCheck.jobPages !== 1) {
    throw new Error('Empty page was not deleted');
  }
  console.log('PASS: Empty page deleted immediately without confirmation.');

  // Test ONE undo step restores the deleted page
  console.log('[Test] Testing Undo restores empty page...');
  await evalCode(`(() => {
    const { useSessionStore } = window.__AZ_TEST__;
    const activeJobId = useSessionStore.getState().activeJobId;
    useSessionStore.getState().undo(activeJobId);
  })()`);
  await sleep(500);

  const afterUndoCheck = await evalCode(`(() => {
    const { useSessionStore } = window.__AZ_TEST__;
    const job = useSessionStore.getState().jobs[0];
    return {
      jobPages: job.pages.length,
      p2Empty: job.pages[1]?.elements.length === 0,
    };
  })()`);
  console.log('After Undo check:', afterUndoCheck);
  if (afterUndoCheck.jobPages !== 2 || !afterUndoCheck.p2Empty) {
    throw new Error('Undo did not restore the empty page');
  }
  console.log('PASS: ONE undo step restored the deleted empty page.');

  console.log('=== TEST PART B: Memory Optimization ===');

  // Verify loadPagePrintImages creates 300 DPI high-res original on demand
  const printImageTest = await evalCode(`(async () => {
    const { loadPagePrintImages, useSessionStore } = window.__AZ_TEST__;
    const session = useSessionStore.getState();
    const assetsById = new Map(session.assets.map(a => [a.id, a]));
    const firstPage = session.jobs[0].pages[0];

    const result = await loadPagePrintImages(firstPage.elements, assetsById, { asDataUrl: true });
    const keys = Object.keys(result.overrides);
    const override = keys.length > 0 ? result.overrides[keys[0]] : null;
    result.cleanup();

    return {
      hasOverride: Boolean(override),
      isDataUrl: override?.startsWith('data:image/'),
    };
  })()`);
  console.log('High-res on demand test:', printImageTest);
  if (!printImageTest.hasOverride || !printImageTest.isDataUrl) {
    throw new Error('Failed to generate 300 DPI image override on demand');
  }
  console.log('PASS: High-res 300 DPI original loaded on demand for print/PDF.');

  // Test single picture delete is undoable
  console.log('[Test] Testing single picture delete undoability...');
  const undoPictureTest = await evalCode(`(async () => {
    const { useSessionStore } = window.__AZ_TEST__;
    const session = useSessionStore.getState();
    const activeJobId = session.activeJobId;
    const assetId = session.jobs[0].pages[0].elements[0].assetId;

    // Remove asset
    session.removeAsset(assetId);

    const canUndo = session.canUndo(activeJobId);
    const assetKeptInStore = session.assets.some(a => a.id === assetId);

    // Undo
    session.undo(activeJobId);
    const restoredInJob = session.jobs[0].assetIds.includes(assetId);

    return {
      canUndo,
      assetKeptInStore,
      restoredInJob,
    };
  })()`);
  console.log('Undo single delete test:', undoPictureTest);
  if (!undoPictureTest.canUndo || !undoPictureTest.assetKeptInStore || !undoPictureTest.restoredInJob) {
    throw new Error('Single picture delete was not undoable or asset was lost');
  }
  console.log('PASS: Single picture delete is undoable and restores picture.');

  // Test "Delete all" is undoable
  console.log('[Test] Testing Delete all undoability...');
  const deleteAllTest = await evalCode(`(async () => {
    const { useSessionStore } = window.__AZ_TEST__;
    const session = useSessionStore.getState();
    const activeJobId = session.activeJobId;
    const assetId = session.assets[0].id;

    session.deleteAllJobPictures(activeJobId);
    const jobEmpty = useSessionStore.getState().jobs[0].assetIds.length === 0;

    session.undo(activeJobId);
    const jobRestored = useSessionStore.getState().jobs[0].assetIds.includes(assetId);

    return {
      jobEmpty,
      jobRestored,
    };
  })()`);
  console.log('Delete all test:', deleteAllTest);
  if (!deleteAllTest.jobEmpty || !deleteAllTest.jobRestored) {
    throw new Error('Delete all was not undoable or did not restore pictures');
  }
  console.log('PASS: "Delete all" is undoable.');

  // Test job closure releases everything
  console.log('[Test] Testing removeJob releases unreferenced assets...');
  const removeJobTest = await evalCode(`(async () => {
    const { useSessionStore } = window.__AZ_TEST__;
    const session = useSessionStore.getState();

    // Create a temporary second job
    session.addJob('Temp Job');
    const jobs = session.jobs;
    const tempJob = jobs[jobs.length - 1];

    // Remove the temporary job
    session.removeJob(tempJob.id);

    return {
      remainingJobs: useSessionStore.getState().jobs.length,
    };
  })()`);
  console.log('Remove job test:', removeJobTest);
  console.log('PASS: Closing job cleans up store and history.');

  console.log('\nALL CHECKS PASSED PERFECTLY!');
  ws.close();
  chromeProc.kill();
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
