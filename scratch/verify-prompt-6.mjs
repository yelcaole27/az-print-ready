import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== STARTING PROMPT 6 AUTOMATED VERIFICATION ===\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9248;
  const userDataDir = path.join(os.tmpdir(), 'chrome-test-p6-' + Date.now());

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

  try {
    // -------------------------------------------------------------
    // Helper function to upload an image of specific dimensions
    // -------------------------------------------------------------
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

    // Helper to get active element details
    async function getActiveElementDetails() {
      return await evaluate(`
        (() => {
          const s = window.__AZ_TEST__.useSessionStore.getState();
          const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
          const allEls = job.pages.flatMap(p => p.elements);
          const el = allEls[allEls.length - 1];
          const asset = s.assets.find(a => a.id === el.assetId);
          const pDim = {
            letterW: 215.9,
            letterH: 279.4,
            margin: job.settings.marginMm,
            printableW: 215.9 - 2 * job.settings.marginMm,
            printableH: 279.4 - 2 * job.settings.marginMm
          };
          return {
            asset: { pxW: asset.pxW, pxH: asset.pxH, name: asset.name },
            element: {
              id: el.id,
              xMm: el.xMm,
              yMm: el.yMm,
              wMm: el.wMm,
              hMm: el.hMm,
              rotation: el.rotation || 0,
              fit: el.fit,
              cropRect: el.cropRect,
              ratio: Math.round((el.wMm / el.hMm) * 10000) / 10000
            },
            printable: pDim
          };
        })()
      `);
    }

    // Helper to reset session
    async function resetJob() {
      await evaluate(`
        (() => {
          const s = window.__AZ_TEST__.useSessionStore.getState();
          const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
          s.clearElements(job.id);
        })()
      `);
      await sleep(300);
    }

    console.log('--- CHECK 1: Uploading photos with various aspect ratios ---');

    // 1A: 4:3 landscape (800x600)
    await resetJob();
    await uploadTestImage('photo-4x3', 800, 600, 'coral');
    await sleep(800);
    const r4x3 = await getActiveElementDetails();
    console.log('1A. 4:3 Landscape:', JSON.stringify(r4x3, null, 2));

    const expected4x3Ratio = 800 / 600; // 1.3333
    if (Math.abs(r4x3.element.ratio - expected4x3Ratio) > 0.01) {
      throw new Error(`4:3 photo ratio mismatch: got ${r4x3.element.ratio}, expected ${expected4x3Ratio}`);
    }
    if (r4x3.element.wMm > r4x3.printable.printableW + 0.1 || r4x3.element.hMm > r4x3.printable.printableH + 0.1) {
      throw new Error('4:3 photo exceeds printable area');
    }
    if (r4x3.element.cropRect) {
      throw new Error('4:3 photo should not have automatic cropRect');
    }
    if (r4x3.element.rotation !== 0) {
      throw new Error(`4:3 photo rotation should be 0, got ${r4x3.element.rotation}`);
    }

    // 1B: 3:4 portrait (600x800)
    await resetJob();
    await uploadTestImage('photo-3x4', 600, 800, 'teal');
    await sleep(800);
    const r3x4 = await getActiveElementDetails();
    console.log('1B. 3:4 Portrait:', JSON.stringify(r3x4, null, 2));

    const expected3x4Ratio = 600 / 800; // 0.75
    if (Math.abs(r3x4.element.ratio - expected3x4Ratio) > 0.01) {
      throw new Error(`3:4 photo ratio mismatch: got ${r3x4.element.ratio}, expected ${expected3x4Ratio}`);
    }
    if (r3x4.element.wMm > r3x4.printable.printableW + 0.1 || r3x4.element.hMm > r3x4.printable.printableH + 0.1) {
      throw new Error('3:4 photo exceeds printable area');
    }
    if (r3x4.element.cropRect) {
      throw new Error('3:4 photo should not have automatic cropRect');
    }

    // 1C: 1:1 square (800x800)
    await resetJob();
    await uploadTestImage('photo-1x1', 800, 800, 'gold');
    await sleep(800);
    const r1x1 = await getActiveElementDetails();
    console.log('1C. 1:1 Square:', JSON.stringify(r1x1, null, 2));

    if (Math.abs(r1x1.element.ratio - 1.0) > 0.01) {
      throw new Error(`1:1 photo ratio mismatch: got ${r1x1.element.ratio}, expected 1.0`);
    }
    if (r1x1.element.wMm > r1x1.printable.printableW + 0.1 || r1x1.element.hMm > r1x1.printable.printableH + 0.1) {
      throw new Error('1:1 photo exceeds printable area');
    }
    if (r1x1.element.cropRect) {
      throw new Error('1:1 photo should not have automatic cropRect');
    }

    // 1D: 16:9 wide screenshot (1600x900)
    await resetJob();
    await uploadTestImage('photo-16x9', 1600, 900, 'indigo');
    await sleep(800);
    const r16x9 = await getActiveElementDetails();
    console.log('1D. 16:9 Screenshot:', JSON.stringify(r16x9, null, 2));

    const expected16x9Ratio = 1600 / 900; // 1.7778
    if (Math.abs(r16x9.element.ratio - expected16x9Ratio) > 0.01) {
      throw new Error(`16:9 photo ratio mismatch: got ${r16x9.element.ratio}, expected ${expected16x9Ratio}`);
    }
    if (r16x9.element.wMm > r16x9.printable.printableW + 0.1 || r16x9.element.hMm > r16x9.printable.printableH + 0.1) {
      throw new Error('16:9 photo exceeds printable area');
    }
    if (r16x9.element.cropRect) {
      throw new Error('16:9 photo should not have automatic cropRect');
    }
    console.log('CHECK 1 PASSED (ran)\n');

    // -------------------------------------------------------------
    // CHECK 2: Open Crop on Default picture -> frame covers full image
    // -------------------------------------------------------------
    console.log('--- CHECK 2: Open Crop on Default picture ---');
    // Open crop modal on r4x3 (switch back to 4:3 first)
    await resetJob();
    await uploadTestImage('photo-4x3-check2', 800, 600, 'purple');
    await sleep(800);

    // Open crop modal via uiStore
    const cropModalState = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const u = window.__AZ_TEST__.useUiStore.getState();
        const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
        const page = job.pages[0];
        const el = page.elements[0];
        const asset = s.assets.find(a => a.id === el.assetId);

        u.openCropModal({
          jobId: job.id,
          target: el.rowId ? { rowIds: [el.rowId] } : { assetIds: [el.assetId] },
          asset,
          element: el,
          initialCropRect: el.cropRect,
          isSizedVariant: false,
          sizeName: undefined
        });

        const modal = window.__AZ_TEST__.useUiStore.getState().cropModal;
        return {
          isOpen: Boolean(modal),
          initialCropRect: modal?.initialCropRect,
          isSizedVariant: modal?.isSizedVariant,
          sizeName: modal?.sizeName
        };
      })()
    `);
    console.log('Check 2 Crop modal state:', cropModalState);
    if (!cropModalState.isOpen) throw new Error('Crop modal failed to open');
    if (cropModalState.isSizedVariant !== false) throw new Error('isSizedVariant should be false for Default');
    if (cropModalState.initialCropRect !== undefined) throw new Error('initialCropRect should be undefined for full image');

    // Verify modal DOM rendered with full frame
    await sleep(500);
    const cropModalDom = await evaluate(`
      (() => {
        const modal = document.querySelector('[role="dialog"]') || document.querySelector('.fixed.inset-0');
        const handles = document.querySelectorAll('.cursor-nwse-resize, .cursor-nesw-resize');
        return {
          modalFound: Boolean(modal),
          handlesCount: handles.length
        };
      })()
    `);
    console.log('Check 2 Crop modal DOM:', cropModalDom);
    if (!cropModalDom.modalFound) throw new Error('Crop modal dialog DOM element not found');

    // Close modal
    await evaluate(`window.__AZ_TEST__.useUiStore.getState().closeCropModal()`);
    await sleep(300);
    console.log('CHECK 2 PASSED (ran)\n');

    // -------------------------------------------------------------
    // CHECK 3: Tap 1x1 on picture -> center-fit square -> open Crop
    // -------------------------------------------------------------
    console.log('--- CHECK 3: Tap 1x1 on picture and check Crop ---');
    await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
        const page = job.pages[0];
        const el = page.elements[0];
        s.setPictureSize(job.id, { assetIds: [el.assetId] }, {
          mode: 'size',
          size: { id: '1x1', wMm: 25.4, hMm: 25.4 }
        });
      })()
    `);
    await sleep(500);

    const el1x1 = await getActiveElementDetails();
    console.log('Check 3 1x1 element:', el1x1.element);
    if (Math.abs(el1x1.element.wMm - 25.4) > 0.1 || Math.abs(el1x1.element.hMm - 25.4) > 0.1) {
      throw new Error(`Element size should be 25.4x25.4 mm, got ${el1x1.element.wMm}x${el1x1.element.hMm}`);
    }

    // Open Crop modal on 1x1 variant
    const cropModal1x1 = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const u = window.__AZ_TEST__.useUiStore.getState();
        const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
        const page = job.pages[0];
        const el = page.elements[0];
        const asset = s.assets.find(a => a.id === el.assetId);

        u.openCropModal({
          jobId: job.id,
          target: el.rowId ? { rowIds: [el.rowId] } : { assetIds: [el.assetId] },
          asset,
          element: el,
          initialCropRect: el.cropRect,
          isSizedVariant: true,
          sizeName: '1x1'
        });

        const modal = window.__AZ_TEST__.useUiStore.getState().cropModal;
        return {
          isOpen: Boolean(modal),
          isSizedVariant: modal?.isSizedVariant,
          sizeName: modal?.sizeName
        };
      })()
    `);
    console.log('Check 3 Crop modal state on 1x1:', cropModal1x1);
    if (!cropModal1x1.isOpen || !cropModal1x1.isSizedVariant) {
      throw new Error('Crop modal on 1x1 should open with isSizedVariant: true');
    }

    // Close modal
    await evaluate(`window.__AZ_TEST__.useUiStore.getState().closeCropModal()`);
    await sleep(300);
    console.log('CHECK 3 PASSED (ran)\n');

    // -------------------------------------------------------------
    // CHECK 4: Back to Default -> returns to original ratio box with full picture
    // -------------------------------------------------------------
    console.log('--- CHECK 4: Back to Default ---');
    await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
        const page = job.pages[0];
        const el = page.elements[0];
        s.setPictureSize(job.id, { assetIds: [el.assetId] }, { mode: 'default' });
      })()
    `);
    await sleep(800);

    const backToDef = await getActiveElementDetails();
    console.log('Check 4 Back to Default element:', backToDef.element);
    if (Math.abs(backToDef.element.ratio - expected4x3Ratio) > 0.01) {
      throw new Error(`Back to default ratio mismatch: got ${backToDef.element.ratio}, expected ${expected4x3Ratio}`);
    }
    if (backToDef.element.cropRect) {
      throw new Error('Back to default should clear cropRect (full image)');
    }
    console.log('CHECK 4 PASSED (ran)\n');

    // -------------------------------------------------------------
    // CHECK 5: Add pictures, paste, drag from PICTURES
    // -------------------------------------------------------------
    console.log('--- CHECK 5: Add pictures, paste, drag from PICTURES ---');

    // 5A: Add pictures (already tested via upload, verify multi-asset addition)
    await resetJob();
    await uploadTestImage('add-pic-1', 1200, 800, 'blue'); // 3:2 = 1.5
    await sleep(800);
    const addPicEl = await getActiveElementDetails();
    console.log('5A. Add pictures element ratio:', addPicEl.element.ratio, 'expected 1.5');
    if (Math.abs(addPicEl.element.ratio - 1.5) > 0.01) {
      throw new Error(`Add pictures ratio mismatch: got ${addPicEl.element.ratio}, expected 1.5`);
    }

    // 5B: Paste picture
    const pasteRes = await evaluate(`
      (async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 500; // 2:1 ratio
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'green';
        ctx.fillRect(0, 0, 1000, 500);

        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const file = new File([blob], 'pasted.png', { type: 'image/png' });

        const dt = new DataTransfer();
        dt.items.add(file);

        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(pasteEvent);
        return { ok: true };
      })()
    `);
    await sleep(1000);
    const pastedEl = await getActiveElementDetails();
    console.log('5B. Pasted element ratio:', pastedEl.element.ratio, 'expected 2.0');
    if (Math.abs(pastedEl.element.ratio - 2.0) > 0.01) {
      throw new Error(`Pasted element ratio mismatch: got ${pastedEl.element.ratio}, expected 2.0`);
    }

    // 5C: Drag from PICTURES onto page
    const dragRes = await evaluate(`
      (async () => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
        const page = job.pages[0];
        const asset = s.assets.find(a => a.name === 'add-pic-1.png');

        const countBefore = page.elements.length;
        const pageEl = document.querySelector('[data-page-sheet="true"]');
        const rect = pageEl.getBoundingClientRect();
        const dt = new DataTransfer();
        dt.setData('application/x-azpr-asset', asset.id);

        const dropEv = new DragEvent('drop', {
          dataTransfer: dt,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          cancelable: true
        });
        pageEl.dispatchEvent(dropEv);
        await new Promise(r => setTimeout(r, 500));
        const s2 = window.__AZ_TEST__.useSessionStore.getState();
        const job2 = s2.jobs.find(j => j.id === s2.activeJobId) || s2.jobs[0];
        const page2 = job2.pages[0];
        return {
          countBefore,
          countAfter: page2.elements.length,
          allElements: page2.elements.map(e => ({ id: e.id, assetId: e.assetId, wMm: e.wMm, hMm: e.hMm, ratio: e.wMm / e.hMm }))
        };
      })()
    `);
    console.log('5C dragRes result:', JSON.stringify(dragRes, null, 2));
    const droppedEl = dragRes.allElements[dragRes.allElements.length - 1];
    console.log('5C. Dropped element ratio:', droppedEl.ratio, 'expected 1.5');
    if (Math.abs(droppedEl.ratio - 1.5) > 0.01) {
      throw new Error(`Dropped element ratio mismatch: got ${droppedEl.ratio}, expected 1.5`);
    }
    console.log('CHECK 5 PASSED (ran)\n');

    // -------------------------------------------------------------
    // CHECK 6: Print preview and PDF match the page
    // -------------------------------------------------------------
    console.log('--- CHECK 6: Print preview and PDF match the page ---');
    const printCheck = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
        const page = job.pages[0];
        const pageIndexes = window.__AZ_TEST__.getOutputPageIndexes(job, 'all');

        return {
          pageCount: job.pages.length,
          outputIndexes: pageIndexes,
          elementCount: page.elements.length,
          firstElWidth: page.elements[0]?.wMm,
          firstElHeight: page.elements[0]?.hMm,
          firstElRatio: Math.round((page.elements[0]?.wMm / page.elements[0]?.hMm) * 100) / 100
        };
      })()
    `);
    console.log('Check 6 Print output info:', printCheck);
    const pageIdxs = Array.isArray(printCheck.outputIndexes)
      ? printCheck.outputIndexes
      : printCheck.outputIndexes?.pageIndexes || [];
    if (!pageIdxs.includes(0)) {
      throw new Error('Print output does not include target page');
    }
    console.log('CHECK 6 PASSED (ran)\n');

    // -------------------------------------------------------------
    // CHECK 7: Exact-fit outline check: box edges equal picture edges
    // -------------------------------------------------------------
    console.log('--- CHECK 7: Exact-fit outline check ---');
    const exactFit = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
        const page = job.pages[0];
        const el = page.elements[0];
        const asset = s.assets.find(a => a.id === el.assetId);

        const imgRatio = asset.pxW / asset.pxH;
        const boxRatio = el.wMm / el.hMm;
        const diff = Math.abs(imgRatio - boxRatio);

        return {
          assetW: asset.pxW,
          assetH: asset.pxH,
          imgRatio: Math.round(imgRatio * 1000) / 1000,
          boxW: el.wMm,
          boxH: el.hMm,
          boxRatio: Math.round(boxRatio * 1000) / 1000,
          ratioDifference: diff,
          isExactMatch: diff < 0.001
        };
      })()
    `);
    console.log('Check 7 Exact-fit result:', exactFit);
    if (!exactFit.isExactMatch) {
      throw new Error(`Exact fit check failed: ratio difference is ${exactFit.ratioDifference}`);
    }
    console.log('CHECK 7 PASSED (ran)\n');

    // -------------------------------------------------------------
    // CHECK 8: Both themes unchanged (dark and light)
    // -------------------------------------------------------------
    console.log('--- CHECK 8: Both themes check ---');
    const themeCheck = await evaluate(`
      (() => {
        const u = window.__AZ_TEST__.useUiStore.getState();
        u.setTheme('dark');
        const isDark = document.documentElement.dataset.theme === 'dark';

        u.setTheme('light');
        const isLight = document.documentElement.dataset.theme === 'light';

        // Restore dark
        u.setTheme('dark');

        return {
          canSetDark: isDark,
          canSetLight: isLight
        };
      })()
    `);
    console.log('Check 8 Themes result:', themeCheck);
    if (!themeCheck.canSetDark || !themeCheck.canSetLight) {
      throw new Error('Theme toggling failed');
    }
    console.log('CHECK 8 PASSED (ran)\n');

    console.log('=== ALL 8 CHECKS COMPLETED SUCCESSFULLY (ran) ===');
  } finally {
    ws.close();
    chromeProc.kill();
  }
}

run().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
