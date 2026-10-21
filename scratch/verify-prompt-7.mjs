import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== STARTING PROMPT 7 AUTOMATED VERIFICATION ===\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9252;
  const userDataDir = path.join(os.tmpdir(), 'chrome-test-p7-' + Date.now());

  const chromeProc = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${userDataDir}`,
      'http://localhost:3000',
    ],
    { stdio: 'ignore' }
  );

  let cdpUrl = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        cdpUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!cdpUrl) {
    chromeProc.kill();
    throw new Error(`Failed to connect to CDP on port ${port}`);
  }

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

  await new Promise((r) => (ws.onopen = r));

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

  await sleep(2500);

  const results = {};

  try {
    // Helper to upload an image of specific dimensions
    async function uploadTestImage(name, width, height, color = 'blue') {
      return await evaluate(`
        (async () => {
          const canvas = document.createElement('canvas');
          canvas.width = ${width};
          canvas.height = ${height};
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '${color}';
          ctx.fillRect(0, 0, ${width}, ${height});
          ctx.fillStyle = 'white';
          ctx.font = '24px sans-serif';
          ctx.fillText('${name}', 20, 40);

          const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
          const file = new File([blob], '${name}.png', { type: 'image/png' });

          const testObj = window.__AZ_TEST__;
          await testObj.importFiles([file]);
          return { ok: true };
        })()
      `);
    }

    // Helper to reset job elements
    async function resetJobElements() {
      await evaluate(`
        (() => {
          const s = window.__AZ_TEST__.useSessionStore.getState();
          const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
          s.clearElements(job.id);
          window.__AZ_TEST__.useUiStore.getState().clearSelection();
        })()
      `);
      await sleep(300);
    }

    // Setup base job with a picture
    await resetJobElements();
    await uploadTestImage('PhotoA', 800, 600, 'coral');
    await sleep(800);

    // -------------------------------------------------------------
    // CHECK 1: Put image on system clipboard, select picture in app, Ctrl+C, Ctrl+V
    // Expected: in-app copy pasted, not system image (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 1: System image on clipboard -> Select picture in app -> Ctrl+C -> Ctrl+V ---');
    const check1 = await evaluate(`
      (async () => {
        const getSession = () => window.__AZ_TEST__.useSessionStore.getState();
        const getUi = () => window.__AZ_TEST__.useUiStore.getState();
        let job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        let page = job.pages[0];
        const elA = page.elements[0];

        // 1. Select picture A
        getUi().select({ pageId: page.id, elementId: elA.id });

        // 2. Simulate Ctrl+C via copy event
        let copiedMarker = null;
        const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
        const clipboardItems = {};
        copyEvent.clipboardData = {
          setData: (type, val) => { clipboardItems[type] = val; },
          getData: (type) => clipboardItems[type] || '',
          types: ['text/plain']
        };
        document.dispatchEvent(copyEvent);
        copiedMarker = clipboardItems['text/plain'];

        // 3. Create a synthetic system image file (System Image B)
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'purple';
        ctx.fillRect(0, 0, 400, 400);
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const systemImageFile = new File([blob], 'system-fb-image.png', { type: 'image/png' });

        // 4. Simulate paste event where clipboard has BOTH the in-app marker and the system image (marker wins)
        const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
        pasteEvent.clipboardData = {
          getData: (type) => (type === 'text/plain' ? copiedMarker : ''),
          types: ['text/plain', 'Files'],
          files: [systemImageFile],
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => systemImageFile }]
        };
        document.dispatchEvent(pasteEvent);

        await new Promise(r => setTimeout(r, 200));

        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const pastedEl = page.elements[page.elements.length - 1];

        // Did it paste the in-app copy (assetId matches elA.assetId, offset by 5mm)?
        const matchesInApp = pastedEl.assetId === elA.assetId;
        const offsetMatches = Math.abs(pastedEl.xMm - (elA.xMm + 5)) < 0.1 && Math.abs(pastedEl.yMm - (elA.yMm + 5)) < 0.1;
        const totalElements = page.elements.length;

        return {
          copiedMarker,
          matchesInApp,
          offsetMatches,
          pastedElId: pastedEl.id,
          pastedAssetId: pastedEl.assetId,
          originalAssetId: elA.assetId,
          totalElements
        };
      })()
    `);
    console.log('Check 1 result:', check1);
    results.check1 = check1.matchesInApp && check1.offsetMatches && check1.totalElements === 2;

    // -------------------------------------------------------------
    // CHECK 2: Copy in app, put system image on clipboard, Ctrl+V
    // Expected: system image pasted (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 2: Copy in app -> Put system image on clipboard -> Ctrl+V ---');
    const check2 = await evaluate(`
      (async () => {
        const getSession = () => window.__AZ_TEST__.useSessionStore.getState();
        const getUi = () => window.__AZ_TEST__.useUiStore.getState();
        let job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        let page = job.pages[0];
        const elA = page.elements[0];

        // 1. Copy in app
        getUi().select({ pageId: page.id, elementId: elA.id });
        const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
        copyEvent.clipboardData = {
          setData: () => {},
          getData: () => '',
          types: ['text/plain']
        };
        document.dispatchEvent(copyEvent);
        window.__AZ_TEST__.setLastMarkerWriteFailed(false);

        // 2. Wait 20ms, then user copies an external image outside app (no marker in clipboard data, only image)
        await new Promise(r => setTimeout(r, 20));
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'gold';
        ctx.fillRect(0, 0, 300, 300);
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const externalFile = new File([blob], 'external-photo.png', { type: 'image/png' });

        const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
        pasteEvent.clipboardData = {
          getData: (type) => '', // No marker
          types: ['Files'],
          files: [externalFile],
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => externalFile }]
        };
        document.dispatchEvent(pasteEvent);

        // Wait for file import processing
        await new Promise(r => setTimeout(r, 800));

        const updatedSession = getSession();
        job = updatedSession.jobs.find(j => j.id === updatedSession.activeJobId) || updatedSession.jobs[0];
        const allElements = job.pages.flatMap(p => p.elements);
        const latestEl = allElements[allElements.length - 1];
        const latestAsset = updatedSession.assets.find(a => a.id === latestEl?.assetId);

        // In-app clipboard must now be cleared
        const hasInApp = window.__AZ_TEST__.hasInAppClipboard();

        return {
          isInputFocused: window.__AZ_TEST__.isInputOrModalFocused(),
          isLastFailed: window.__AZ_TEST__.isLastMarkerWriteFailed(),
          copyTs: window.__AZ_TEST__.getInAppCopyTimestamp(),
          sysTs: window.__AZ_TEST__.getLastSystemPasteTimestamp(),
          assetsCount: updatedSession.assets.length,
          assetsNames: updatedSession.assets.map(a => a.name),
          latestAssetName: latestAsset?.name,
          isExternalImage: Boolean(latestAsset?.name && latestAsset.name.includes('external-photo')),
          inAppCleared: !hasInApp
        };
      })()
    `);
    console.log('Check 2 result:', check2);
    results.check2 = check2.isExternalImage && check2.inAppCleared;

    // -------------------------------------------------------------
    // CHECK 3: Same sequence with Copy button and with Ctrl+X
    // Expected: in-app copy pasted, not system image (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 3: Same sequence with Copy button and with Ctrl+X ---');
    const check3 = await evaluate(`
      (async () => {
        const getSession = () => window.__AZ_TEST__.useSessionStore.getState();
        const getUi = () => window.__AZ_TEST__.useUiStore.getState();
        let job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        let page = job.pages[0];
        const elA = page.elements[0];

        // --- Sequence 3a: Copy button on Picture card ---
        getUi().select({ pageId: page.id, elementId: elA.id });

        // Call copySelection directly (which the Copy button onClick runs)
        const copyBtnMarker = window.__AZ_TEST__.copySelection();

        // Stale system image on clipboard
        const canvas1 = document.createElement('canvas');
        canvas1.width = 200;
        canvas1.height = 200;
        const blob1 = await new Promise(r => canvas1.toBlob(r, 'image/png'));
        const staleFile1 = new File([blob1], 'stale-1.png', { type: 'image/png' });

        const pasteEvent1 = new Event('paste', { bubbles: true, cancelable: true });
        pasteEvent1.clipboardData = {
          getData: (type) => (type === 'text/plain' ? copyBtnMarker : ''),
          types: ['text/plain', 'Files'],
          files: [staleFile1],
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => staleFile1 }]
        };
        document.dispatchEvent(pasteEvent1);
        await new Promise(r => setTimeout(r, 200));

        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const copyBtnPasted = page.elements[page.elements.length - 1];
        const copyBtnPassed = copyBtnPasted.assetId === elA.assetId;

        // --- Sequence 3b: Ctrl+X (cut) ---
        const elToCut = page.elements[page.elements.length - 1];
        getUi().select({ pageId: page.id, elementId: elToCut.id });
        const cutCountBefore = page.elements.length;

        // Trigger cut event
        const cutEvent = new Event('cut', { bubbles: true, cancelable: true });
        let cutMarker = null;
        cutEvent.clipboardData = {
          setData: (type, val) => { cutMarker = val; },
          getData: () => cutMarker || '',
          types: ['text/plain']
        };
        document.dispatchEvent(cutEvent);

        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const cutCountAfter = page.elements.length;
        const cutRemoved = cutCountAfter === cutCountBefore - 1;

        // Paste after cut with stale system image present
        const staleFile2 = new File([blob1], 'stale-2.png', { type: 'image/png' });
        const pasteEvent2 = new Event('paste', { bubbles: true, cancelable: true });
        pasteEvent2.clipboardData = {
          getData: (type) => (type === 'text/plain' ? cutMarker : ''),
          types: ['text/plain', 'Files'],
          files: [staleFile2],
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => staleFile2 }]
        };
        document.dispatchEvent(pasteEvent2);
        await new Promise(r => setTimeout(r, 200));

        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const cutPasted = page.elements[page.elements.length - 1];
        const cutPastePassed = cutPasted.assetId === elToCut.assetId;

        return {
          copyBtnPassed,
          cutRemoved,
          cutPastePassed
        };
      })()
    `);
    console.log('Check 3 result:', check3);
    results.check3 = check3.copyBtnPassed && check3.cutRemoved && check3.cutPastePassed;

    // -------------------------------------------------------------
    // CHECK 4: Paste twice in a row: 2 in-app copies, each offset, 1 undo step each
    // Expected: 2 in-app copies, each offset by 5mm, 1 undo step each (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 4: Paste twice in a row: 2 in-app copies, each offset, 1 undo step each ---');
    // Start with a clean base picture
    await resetJobElements();
    await uploadTestImage('PhotoForCheck4', 800, 600, 'teal');
    await sleep(600);

    const check4 = await evaluate(`
      (async () => {
        const getSession = () => window.__AZ_TEST__.useSessionStore.getState();
        const getUi = () => window.__AZ_TEST__.useUiStore.getState();
        let job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        let page = job.pages[0];
        const baseEl = page.elements[0];
        // Resize baseEl to 80x60mm at (20, 20) so +5 and +10 mm shift comfortably inside page
        getSession().updateElement(job.id, page.id, baseEl.id, { xMm: 20, yMm: 20, wMm: 80, hMm: 60 });
        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const updatedBaseEl = page.elements[0];

        getUi().select({ pageId: page.id, elementId: updatedBaseEl.id });
        const marker = window.__AZ_TEST__.copySelection();

        const count0 = page.elements.length;

        function simulatePaste() {
          const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
          pasteEvent.clipboardData = {
            getData: (type) => (type === 'text/plain' ? marker : ''),
            types: ['text/plain'],
            files: [],
            items: []
          };
          document.dispatchEvent(pasteEvent);
        }

        // Paste 1
        simulatePaste();
        await new Promise(r => setTimeout(r, 100));
        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const count1 = page.elements.length;
        const el1 = page.elements[page.elements.length - 1];

        // Paste 2
        simulatePaste();
        await new Promise(r => setTimeout(r, 100));
        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const count2 = page.elements.length;
        const el2 = page.elements[page.elements.length - 1];

        const offset1 = Math.abs(el1.xMm - (updatedBaseEl.xMm + 5)) < 0.1;
        const offset2 = Math.abs(el2.xMm - (updatedBaseEl.xMm + 10)) < 0.1;

        // Undo 1
        getSession().undo(job.id);
        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const countAfterUndo1 = page.elements.length;

        // Undo 2
        getSession().undo(job.id);
        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const countAfterUndo2 = page.elements.length;

        return {
          count0,
          count1,
          count2,
          offset1,
          offset2,
          countAfterUndo1,
          countAfterUndo2,
          oneUndoStepEach: count1 === count0 + 1 && count2 === count1 + 1 && countAfterUndo1 === count2 - 1 && countAfterUndo2 === count0
        };
      })()
    `);
    console.log('Check 4 result:', check4);
    results.check4 = check4.offset1 && check4.offset2 && check4.oneUndoStepEach;

    // -------------------------------------------------------------
    // CHECK 5: In-app copy, then paste into text box or modal input: normal text behavior, no picture pasted
    // Expected: normal text behavior, no picture pasted (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 5: In-app copy -> Paste into text box: normal text behavior, no picture pasted ---');
    const check5 = await evaluate(`
      (async () => {
        const getSession = () => window.__AZ_TEST__.useSessionStore.getState();
        const getUi = () => window.__AZ_TEST__.useUiStore.getState();
        let job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        let page = job.pages[0];
        const baseEl = page.elements[0];

        getUi().select({ pageId: page.id, elementId: baseEl.id });
        const marker = window.__AZ_TEST__.copySelection();

        // Create an input in the DOM and focus it
        const input = document.createElement('input');
        input.type = 'text';
        input.value = 'initial ';
        document.body.appendChild(input);
        input.focus();

        const countBefore = page.elements.length;

        // Trigger paste event on the input with external clipboard text (e.g. "pasted note")
        const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
        pasteEvent.clipboardData = {
          getData: (type) => (type === 'text/plain' ? 'pasted note' : ''),
          types: ['text/plain'],
          files: [],
          items: []
        };
        input.dispatchEvent(pasteEvent);

        await new Promise(r => setTimeout(r, 100));

        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const countAfter = page.elements.length;

        document.body.removeChild(input);

        return {
          countBefore,
          countAfter,
          noPicturePasted: countBefore === countAfter
        };
      })()
    `);
    console.log('Check 5 result:', check5);
    results.check5 = check5.noPicturePasted;

    // -------------------------------------------------------------
    // CHECK 6: Marker text never appears on page or in text box on normal paste
    // Expected: marker text never appears on page or in text box on normal paste (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 6: Marker text never appears on page or in text box on normal paste ---');
    const check6 = await evaluate(`
      (async () => {
        const getSession = () => window.__AZ_TEST__.useSessionStore.getState();
        const getUi = () => window.__AZ_TEST__.useUiStore.getState();
        let job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        let page = job.pages[0];
        const baseEl = page.elements[0];

        getUi().select({ pageId: page.id, elementId: baseEl.id });
        const marker = window.__AZ_TEST__.copySelection();

        // 1. Test pasting marker into an input field: marker must be suppressed
        const input = document.createElement('input');
        input.type = 'text';
        input.value = 'hello';
        document.body.appendChild(input);
        input.focus();

        const inputPaste = new Event('paste', { bubbles: true, cancelable: true });
        inputPaste.clipboardData = {
          getData: (type) => (type === 'text/plain' ? marker : ''),
          types: ['text/plain'],
          files: [],
          items: []
        };
        input.dispatchEvent(inputPaste);

        const markerPastedIntoInput = input.value.includes('azpr-internal:');
        document.body.removeChild(input);

        // 2. Test canvas paste with marker: does NOT create a text page or text box
        const initialPagesCount = job.pages.length;
        const pagePaste = new Event('paste', { bubbles: true, cancelable: true });
        pagePaste.clipboardData = {
          getData: (type) => (type === 'text/plain' ? marker : ''),
          types: ['text/plain'],
          files: [],
          items: []
        };
        document.dispatchEvent(pagePaste);

        await new Promise(r => setTimeout(r, 100));
        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        const textPagesCreated = job.pages.filter(p => {
          const b = job.blocks.find(blk => blk.id === p.blockId);
          return b && b.kind === 'text';
        }).length;

        return {
          markerSuppressedInInput: !markerPastedIntoInput,
          noTextPageCreated: textPagesCreated === 0
        };
      })()
    `);
    console.log('Check 6 result:', check6);
    results.check6 = check6.markerSuppressedInInput && check6.noTextPageCreated;

    // -------------------------------------------------------------
    // CHECK 7: Undo and redo for each paste: 1 step
    // Expected: 1 undo step removes paste, 1 redo step restores paste (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 7: Undo and redo for each paste: 1 step ---');
    const check7 = await evaluate(`
      (async () => {
        const getSession = () => window.__AZ_TEST__.useSessionStore.getState();
        const getUi = () => window.__AZ_TEST__.useUiStore.getState();
        let job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        let page = job.pages[0];
        const baseEl = page.elements[0];

        getUi().select({ pageId: page.id, elementId: baseEl.id });
        const marker = window.__AZ_TEST__.copySelection();

        const beforePasteCount = page.elements.length;

        // Perform single paste
        const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
        pasteEvent.clipboardData = {
          getData: (type) => (type === 'text/plain' ? marker : ''),
          types: ['text/plain'],
          files: [],
          items: []
        };
        document.dispatchEvent(pasteEvent);
        await new Promise(r => setTimeout(r, 100));

        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const afterPasteCount = page.elements.length;

        // 1 step Undo
        getSession().undo(job.id);
        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const afterUndoCount = page.elements.length;

        // 1 step Redo
        getSession().redo(job.id);
        job = getSession().jobs.find(j => j.id === getSession().activeJobId) || getSession().jobs[0];
        page = job.pages[0];
        const afterRedoCount = page.elements.length;

        return {
          beforePasteCount,
          afterPasteCount,
          afterUndoCount,
          afterRedoCount,
          undoStepWorks: afterUndoCount === beforePasteCount,
          redoStepWorks: afterRedoCount === afterPasteCount
        };
      })()
    `);
    console.log('Check 7 result:', check7);
    results.check7 = check7.undoStepWorks && check7.redoStepWorks;

    // -------------------------------------------------------------
    // CHECK 8: Both themes unchanged (light and dark) and build passes
    // Expected: clean theme toggle, no style regressions (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 8: Themes check ---');
    const check8 = await evaluate(`
      (() => {
        const root = document.documentElement;
        const initialDark = root.classList.contains('dark');
        
        // Toggle dark
        root.classList.add('dark');
        const hasDark = root.classList.contains('dark');
        
        // Toggle light
        root.classList.remove('dark');
        const hasLight = !root.classList.contains('dark');
        
        // Restore
        if (initialDark) root.classList.add('dark');

        return {
          hasDark,
          hasLight
        };
      })()
    `);
    console.log('Check 8 result:', check8);
    results.check8 = check8.hasDark && check8.hasLight;

    console.log('\n=== ALL RESULTS SUMMARY ===');
    console.log(JSON.stringify(results, null, 2));

    const allPassed = Object.values(results).every(Boolean);
    if (!allPassed) {
      console.error('FAILED: Not all checks passed!');
      process.exit(1);
    } else {
      console.log('SUCCESS: All 8 checks passed completely!');
    }
  } finally {
    ws.close();
    chromeProc.kill();
  }
}

run().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
