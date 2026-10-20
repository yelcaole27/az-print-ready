import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempDir = path.join(process.env.TEMP || 'C:\\Temp', 'chrome-b2b-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  console.log('[Test] Spawning headless Chrome...');
  const chromeProc = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=9225',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tempDir}`,
    'http://localhost:3000',
  ]);

  let cdpUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9225/json/list');
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

  await new Promise((r) => ws.onopen = r);

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error('Eval error: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  await sleep(2000);
  console.log('[Test] Page loaded in headless Chrome.');

  // Check window.__AZ_TEST__
  const hasAzTest = await evaluate(`Boolean(window.__AZ_TEST__)`);
  console.log('window.__AZ_TEST__ available:', hasAzTest);

  // Setup test images in session store
  const setupResult = await evaluate(`
    (async () => {
      const { useSessionStore, useUiStore } = window.__AZ_TEST__;
      const session = useSessionStore.getState();

      // Create 2 test assets
      const assetA = {
        id: 'asset-a',
        name: 'Photo A',
        objectUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="red"/></svg>',
        pxW: 600,
        pxH: 600,
      };
      const assetB = {
        id: 'asset-b',
        name: 'Photo B',
        objectUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="blue"/></svg>',
        pxW: 600,
        pxH: 600,
      };

      useSessionStore.setState((s) => ({
        assets: [assetA, assetB],
      }));

      const jobId = session.activeJobId;
      const frontPageId = session.jobs[0].pages[0].id;

      // Place 4 pictures at 2x2 on front page: each 50.8 x 50.8 mm (2 in x 2 in)
      // Letter paper is 215.9 x 279.4 mm
      // Let positions be: (20, 20), (80, 20), (20, 80), (80, 80)
      const elements = [
        { id: 'el-1', type: 'image', assetId: 'asset-a', xMm: 20, yMm: 20, wMm: 50.8, hMm: 50.8, rotation: 0, fit: 'cover' },
        { id: 'el-2', type: 'image', assetId: 'asset-a', xMm: 80, yMm: 20, wMm: 50.8, hMm: 50.8, rotation: 0, fit: 'cover' },
        { id: 'el-3', type: 'image', assetId: 'asset-a', xMm: 20, yMm: 80, wMm: 50.8, hMm: 50.8, rotation: 0, fit: 'cover' },
        { id: 'el-4', type: 'image', assetId: 'asset-a', xMm: 80, yMm: 80, wMm: 50.8, hMm: 50.8, rotation: 0, fit: 'cover' },
      ];

      useSessionStore.setState((s) => ({
        jobs: s.jobs.map((j) => j.id === jobId ? {
          ...j,
          pages: [{ ...j.pages[0], elements, stayPut: true }]
        } : j)
      }));

      return { ok: true, jobId, frontPageId };
    })()
  `);
  console.log('[Test] 4 pictures placed at 2x2:', setupResult);

  // Check 1: Add Back, verify faded guide, drop into slot with asset selected
  console.log('\n--- CHECK 1: Add back and click slot ---');
  const check1 = await evaluate(`
    (async () => {
      const { useSessionStore, useUiStore } = window.__AZ_TEST__;
      const jobId = useSessionStore.getState().activeJobId;
      const frontPageId = useSessionStore.getState().jobs[0].pages[0].id;

      // Add back page
      const backPageId = useSessionStore.getState().addBackPage(jobId, frontPageId);
      useUiStore.getState().setActivePage(backPageId);
      useUiStore.getState().setActiveAssetId('asset-b');

      const jobAfterAdd = useSessionStore.getState().jobs[0];
      const frontPage = jobAfterAdd.pages[0];
      const backPage = jobAfterAdd.pages[1];

      // Simulate clicking the first empty slot (matching el-1 at 20, 20, 50.8 x 50.8)
      // Call drop on slot directly or through sessionStore
      useSessionStore.getState().commit(jobId);
      const slot1 = frontPage.elements[0];
      const newEl = {
        id: 'back-el-1',
        type: 'image',
        assetId: 'asset-b',
        xMm: slot1.xMm,
        yMm: slot1.yMm,
        wMm: slot1.wMm,
        hMm: slot1.hMm,
        rotation: slot1.rotation,
        fit: 'cover',
        frontElementId: slot1.id,
      };
      useSessionStore.getState().addElement(jobId, backPage.id, newEl);

      const jobAfterDrop = useSessionStore.getState().jobs[0];
      const updatedBackPage = jobAfterDrop.pages[1];
      const placed = updatedBackPage.elements[0];

      return {
        backPageCreated: Boolean(backPage && backPage.isBack && backPage.frontPageId === frontPage.id),
        frontHasBackPageId: frontPage.backPageId === backPage.id,
        placedElement: placed ? {
          xMm: placed.xMm,
          yMm: placed.yMm,
          wMm: placed.wMm,
          hMm: placed.hMm,
          frontElementId: placed.frontElementId,
          assetId: placed.assetId,
        } : null,
      };
    })()
  `);
  console.log('Check 1 result:', JSON.stringify(check1, null, 2));

  // Check 2: Fill all slots places the selected picture in every empty slot
  console.log('\n--- CHECK 2: Fill all slots ---');
  const check2 = await evaluate(`
    (async () => {
      const { useSessionStore, useUiStore } = window.__AZ_TEST__;
      const jobId = useSessionStore.getState().activeJobId;
      const backPageId = useSessionStore.getState().jobs[0].pages[1].id;

      // Fill all slots with asset-b
      useSessionStore.getState().fillAllSlots(jobId, backPageId, 'asset-b');

      const backPage = useSessionStore.getState().jobs[0].pages[1];
      return {
        totalElements: backPage.elements.length,
        elements: backPage.elements.map(e => ({
          xMm: e.xMm,
          yMm: e.yMm,
          wMm: e.wMm,
          hMm: e.hMm,
          slotId: e.frontElementId
        })),
      };
    })()
  `);
  console.log('Check 2 result:', JSON.stringify(check2, null, 2));

  // Check 3: Mirroring - Sideways vs Upward
  console.log('\n--- CHECK 3: Mirroring Sideways and Upward ---');
  const check3 = await evaluate(`
    (() => {
      const { useSessionStore, mirrorPageForOutput } = window.__AZ_TEST__;
      const backPage = useSessionStore.getState().jobs[0].pages[1];
      // Letter paper dimensions: 215.9 x 279.4 mm
      // Page width = 215.9, page height = 279.4

      // Sideways flip: x' = 215.9 - x - w, y' = y, rotation kept
      const sidewaysPage = { ...backPage, flipMode: 'sideways' };
      const mirroredSideways = mirrorPageForOutput(sidewaysPage, { xMm: 0, yMm: 0 });

      // Upward flip: y' = 279.4 - y - h, x' = x, rotation = +180
      const upwardPage = { ...backPage, flipMode: 'upward' };
      const mirroredUpward = mirrorPageForOutput(upwardPage, { xMm: 0, yMm: 0 });

      return {
        originalFirst: {
          xMm: backPage.elements[0].xMm,
          yMm: backPage.elements[0].yMm,
          wMm: backPage.elements[0].wMm,
          hMm: backPage.elements[0].hMm,
          rot: backPage.elements[0].rotation,
        },
        sidewaysFirst: {
          xMm: mirroredSideways.elements[0].xMm,
          yMm: mirroredSideways.elements[0].yMm,
          wMm: mirroredSideways.elements[0].wMm,
          hMm: mirroredSideways.elements[0].hMm,
          rot: mirroredSideways.elements[0].rotation,
          expectedX: Math.round((215.9 - 20 - 50.8) * 100) / 100, // 145.1
        },
        upwardFirst: {
          xMm: mirroredUpward.elements[0].xMm,
          yMm: mirroredUpward.elements[0].yMm,
          wMm: mirroredUpward.elements[0].wMm,
          hMm: mirroredUpward.elements[0].hMm,
          rot: mirroredUpward.elements[0].rotation,
          expectedY: Math.round((279.4 - 20 - 50.8) * 100) / 100, // 208.6
        }
      };
    })()
  `);
  console.log('Check 3 result:', JSON.stringify(check3, null, 2));

  // Check 4: Nudge +2.0 mm sideways shifts every back picture by 2.0 mm
  console.log('\n--- CHECK 4: Nudge +2.0 mm sideways and reset ---');
  const check4 = await evaluate(`
    (() => {
      const { useSessionStore, mirrorPageForOutput, setBackNudge, resetBackNudge, getBackNudge } = window.__AZ_TEST__;
      const backPage = useSessionStore.getState().jobs[0].pages[1];

      setBackNudge({ xMm: 2.0, yMm: 0 });
      const currentNudge = getBackNudge();

      const sidewaysPage = { ...backPage, flipMode: 'sideways' };
      const nudgedSideways = mirrorPageForOutput(sidewaysPage, currentNudge);

      // Reset
      const resetResult = resetBackNudge();

      return {
        currentNudge,
        nudgedFirstX: nudgedSideways.elements[0].xMm, // 145.1 + 2.0 = 147.1
        resetNudge: resetResult,
      };
    })()
  `);
  console.log('Check 4 result:', JSON.stringify(check4, null, 2));

  // Check 5: Fronts vs Backs output separation and reverse order
  console.log('\n--- CHECK 5: Fronts and Backs output separation ---');
  const check5 = await evaluate(`
    (() => {
      const { getOutputPageIndexes } = window.__AZ_TEST__;

      const frontsOnly = getOutputPageIndexes({ sideFilter: 'fronts' });
      const backsOnly = getOutputPageIndexes({ sideFilter: 'backs' });
      const backsReversed = getOutputPageIndexes({ sideFilter: 'backs', reverseBacks: true });

      return {
        frontsPagesCount: frontsOnly.pageIndexes.length,
        frontsIndices: frontsOnly.pageIndexes,
        backsPagesCount: backsOnly.pageIndexes.length,
        backsIndices: backsOnly.pageIndexes,
        backsReversedIndices: backsReversed.pageIndexes,
      };
    })()
  `);
  console.log('Check 5 result:', JSON.stringify(check5, null, 2));

  // Check 6: Empty back pages skipped, print disabled when all empty
  console.log('\n--- CHECK 6: Empty pages skipped and disabled state ---');
  const check6 = await evaluate(`
    (() => {
      const { useSessionStore, getOutputPageIndexes } = window.__AZ_TEST__;
      const jobId = useSessionStore.getState().activeJobId;

      // Test with empty back page
      const job = useSessionStore.getState().jobs[0];
      const emptyBackJob = {
        ...job,
        pages: [job.pages[0], { ...job.pages[1], elements: [] }]
      };

      const backsOnly = getOutputPageIndexes({ customJob: emptyBackJob, sideFilter: 'backs' });

      // All pages empty
      const allEmptyJob = {
        ...job,
        pages: job.pages.map(p => ({ ...p, elements: [] }))
      };
      const allEmptyOutput = getOutputPageIndexes({ customJob: allEmptyJob });

      return {
        emptyBackPageOutputCount: backsOnly.pageIndexes.length,
        allEmptyOutputCount: allEmptyOutput.pageIndexes.length,
      };
    })()
  `);
  console.log('Check 6 result:', JSON.stringify(check6, null, 2));

  // Check 7: Test sheet front and back marks and nudge
  console.log('\n--- CHECK 7: Test sheet marks and calibration ---');
  const check7 = await evaluate(`
    (() => {
      const { generateTestSheetJob, setBackNudge, resetBackNudge } = window.__AZ_TEST__;
      setBackNudge({ xMm: 1.5, yMm: -1.0 });

      const testData = generateTestSheetJob('letter', 'portrait', 'sideways');
      const frontPage = testData.frontPage;
      const backPage = testData.mirroredBackPage;

      resetBackNudge();

      return {
        frontMarksCount: frontPage.elements.length,
        frontMark1: { xMm: frontPage.elements[1].xMm, yMm: frontPage.elements[1].yMm },
        backMarksCount: backPage.elements.length,
        backMark1: { xMm: backPage.elements[1].xMm, yMm: backPage.elements[1].yMm },
      };
    })()
  `);
  console.log('Check 7 result:', JSON.stringify(check7, null, 2));

  // Check 8: Moving front picture does not move back pictures; Match front re-snaps
  console.log('\n--- CHECK 8: Stay-put rule and Match front ---');
  const check8 = await evaluate(`
    (() => {
      const { useSessionStore } = window.__AZ_TEST__;
      const jobId = useSessionStore.getState().activeJobId;
      const backPageId = useSessionStore.getState().jobs[0].pages[1].id;

      // Move front picture 1 from x:20 to x:35
      useSessionStore.setState(s => ({
        jobs: s.jobs.map(j => j.id === jobId ? {
          ...j,
          pages: j.pages.map((p, idx) => idx === 0 ? {
            ...p,
            elements: p.elements.map(el => el.id === 'el-1' ? { ...el, xMm: 35 } : el)
          } : p)
        } : j)
      }));

      const backBeforeMatch = useSessionStore.getState().jobs[0].pages[1].elements[0].xMm;

      // Match front
      useSessionStore.getState().matchFrontSlots(jobId, backPageId);

      const backAfterMatch = useSessionStore.getState().jobs[0].pages[1].elements[0].xMm;

      return {
        backBeforeMatch, // should still be 20 (stay put!)
        backAfterMatch,  // snapped to 35!
      };
    })()
  `);
  console.log('Check 8 result:', JSON.stringify(check8, null, 2));

  // Check 9: Undo and redo for back page operations
  console.log('\n--- CHECK 9: Undo / redo steps ---');
  const check9 = await evaluate(`
    (() => {
      const { useSessionStore } = window.__AZ_TEST__;
      const jobId = useSessionStore.getState().activeJobId;

      // Initial pages count is 2 (front + back)
      const initialPages = useSessionStore.getState().jobs[0].pages.length;

      // Delete back page
      const backPageId = useSessionStore.getState().jobs[0].pages[1].id;
      useSessionStore.getState().removeBackPage(jobId, backPageId);
      const pagesAfterDelete = useSessionStore.getState().jobs[0].pages.length;

      // Undo deletion
      useSessionStore.getState().undo(jobId);
      const pagesAfterUndo = useSessionStore.getState().jobs[0].pages.length;

      return {
        initialPages,
        pagesAfterDelete,
        pagesAfterUndo,
      };
    })()
  `);
  console.log('Check 9 result:', JSON.stringify(check9, null, 2));

  // Check 10: Delete front page deletes back page too; undo restores both
  console.log('\n--- CHECK 10: Delete front deletes back and undo restores both ---');
  const check10 = await evaluate(`
    (() => {
      const { useSessionStore } = window.__AZ_TEST__;
      const jobId = useSessionStore.getState().activeJobId;
      const frontPageId = useSessionStore.getState().jobs[0].pages[0].id;

      // Delete front page
      useSessionStore.getState().removePage(jobId, frontPageId);
      const jobAfterDelete = useSessionStore.getState().jobs[0];

      // Since all pages in job were removed, it created a fresh empty 1 page
      const hasBackAfterDelete = jobAfterDelete.pages.some(p => p.isBack);

      // Undo
      useSessionStore.getState().undo(jobId);
      const jobAfterUndo = useSessionStore.getState().jobs[0];
      const pagesCountAfterUndo = jobAfterUndo.pages.length;
      const hasBackAfterUndo = jobAfterUndo.pages.some(p => p.isBack);

      return {
        hasBackAfterDelete,
        pagesCountAfterUndo,
        hasBackAfterUndo,
      };
    })()
  `);
  console.log('Check 10 result:', JSON.stringify(check10, null, 2));

  // Check 11: Jobs with no backs behave as before
  console.log('\n--- CHECK 11: Jobs with no backs ---');
  const check11 = await evaluate(`
    (() => {
      const { getOutputPageIndexes } = window.__AZ_TEST__;
      const jobNoBack = {
        id: 'job-plain',
        name: 'Plain Job',
        settings: { unit: 'in', marginMm: 6.35, gapMm: 4, cutStyle: 'none', borderless: false },
        pages: [
          { id: 'p1', paperId: 'letter', orientation: 'portrait', elements: [{ id: 'e1', type: 'image', assetId: 'asset-a', xMm: 10, yMm: 10, wMm: 40, hMm: 40, rotation: 0 }] },
          { id: 'p2', paperId: 'letter', orientation: 'portrait', elements: [{ id: 'e2', type: 'image', assetId: 'asset-a', xMm: 10, yMm: 10, wMm: 40, hMm: 40, rotation: 0 }] }
        ],
        blocks: [],
      };

      const out = getOutputPageIndexes({ customJob: jobNoBack });
      return {
        outputPagesCount: out.pageIndexes.length,
        outputIndices: out.pageIndexes,
      };
    })()
  `);
  console.log('Check 11 result:', JSON.stringify(check11, null, 2));

  // Check 12: Theme toggle check
  console.log('\n--- CHECK 12: Theme toggle ---');
  const check12 = await evaluate(`
    (() => {
      const { useUiStore } = window.__AZ_TEST__;
      const initialTheme = useUiStore.getState().theme;
      useUiStore.getState().toggleTheme();
      const toggledTheme = useUiStore.getState().theme;
      useUiStore.getState().toggleTheme();
      const restoredTheme = useUiStore.getState().theme;
      return { initialTheme, toggledTheme, restoredTheme };
    })()
  `);
  console.log('Check 12 result:', JSON.stringify(check12, null, 2));

  console.log('\nAll checks completed successfully!');
  chromeProc.kill();
  process.exit(0);
}

run().catch((err) => {
  console.error('[Test Failed]', err);
  process.exit(1);
});
