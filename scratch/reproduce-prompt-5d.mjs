import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runReproduction() {
  console.log('=== STARTING PROMPT 5D REPRODUCTION ===\n');

  // 1. Launch Chrome
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-prof-5d-'));
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const cdpPort = 9223;

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tmpProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--disable-gpu',
    'http://localhost:3000',
  ]);

  await sleep(2500);

  let cdpUrl = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
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
    throw new Error(`Failed to connect to CDP on port ${cdpPort}`);
  }

  const ws = new WebSocket(cdpUrl);
  let idCounter = 1;
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

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = idCounter++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(`Evaluation failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  };

  await send('Page.enable');
  await send('DOM.enable');

  console.log('Navigating to http://localhost:3000...');
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await sleep(2000);

  // Stub window.print to capture state
  await evaluate(`
    window.__PRINT_CAPTURES__ = [];
    window.print = function() {
      const printRoot = document.getElementById('print-root');
      const storeUi = window.__DEBUG_UI_STORE__ || {};
      const printPages = printRoot ? Array.from(printRoot.querySelectorAll('.print-page')) : [];
      
      const capture = {
        timestamp: Date.now(),
        hasPrintRoot: Boolean(printRoot),
        printRootStyle: printRoot ? {
          display: window.getComputedStyle(printRoot).display,
          position: window.getComputedStyle(printRoot).position,
        } : null,
        pageCount: printPages.length,
        pages: printPages.map((p, idx) => {
          const imgs = Array.from(p.querySelectorAll('img')).map(img => img.src.slice(0, 50));
          return {
            index: idx,
            width: p.style.width,
            height: p.style.height,
            elementsCount: p.querySelectorAll('[style*="position: absolute"]').length,
            imgSrcs: imgs,
            htmlSnippet: p.outerHTML.slice(0, 200),
          };
        }),
      };
      window.__PRINT_CAPTURES__.push(capture);
      console.log('[STUB] window.print() was called! Captured:', JSON.stringify(capture));
      // Trigger afterprint event asynchronously like a browser would
      setTimeout(() => {
        window.dispatchEvent(new Event('afterprint'));
      }, 50);
    };
  `);

  // Step A: Upload test photo via file input
  console.log('--- Step A: Uploading test photo 1 ---');
  const upload1 = await evaluate(`
    (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 400, 400);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'photo1.png', { type: 'image/png' });

      const input = document.querySelector('input[type="file"]');
      if (!input) return { error: 'File input not found' };
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    })()
  `);
  console.log('Upload 1 result:', JSON.stringify(upload1));
  await sleep(1500);

  // Step B: Create a Back page
  console.log('--- Step B: Creating Back page ---');
  const addBackRes = await evaluate(`
    (() => {
      const btn = document.querySelector('button[title="Add back page"]');
      if (btn) {
        btn.click();
        return { success: true };
      }
      return { success: false, reason: 'Add back page button not found' };
    })()
  `);
  console.log('Add Back page result:', JSON.stringify(addBackRes));
  await sleep(1500);

  // Step C: Place picture on the back page using Fill all slots or slot click
  console.log('--- Step C: Placing picture on back page ---');
  const placeRes = await evaluate(`
    (() => {
      const fillBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Fill all slots'));
      if (fillBtn) {
        fillBtn.click();
        return { method: 'fill-btn', success: true };
      }
      const slotEl = document.querySelector('[data-slot-id]');
      if (slotEl) {
        slotEl.click();
        return { method: 'slot-click', success: true };
      }
      return { success: false, reason: 'Neither Fill all slots button nor slot element found' };
    })()
  `);
  console.log('Place on back page result:', JSON.stringify(placeRes));
  await sleep(1500);

  // Inspect pages in session store
  const jobStatus = await evaluate(`
    (() => {
      // Let's inspect the active job pages
      const printBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Print');
      return {
        hasPrintBtn: Boolean(printBtn),
        pagesCount: document.querySelectorAll('.print-page').length,
      };
    })()
  `);
  console.log('Current DOM status before print:', JSON.stringify(jobStatus));

  // Step D: Test "Print backs"
  console.log('\n--- Step D: Clicking Print -> Print backs ---');
  await evaluate(`
    (() => {
      const printBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Print');
      printBtn?.click();
    })()
  `);
  await sleep(600);

  const chooserOpen = await evaluate(`Boolean(document.querySelector('#print-chooser-title'))`);
  console.log('Print chooser open:', chooserOpen);

  await evaluate(`
    (() => {
      const printBacksBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Print backs'));
      printBacksBtn?.click();
    })()
  `);
  await sleep(1200);

  const noticeState = await evaluate(`
    (() => {
      const noticeTitle = document.querySelector('#check-notice-title');
      const printRoot = document.getElementById('print-root');
      return {
        hasNotice: Boolean(noticeTitle),
        noticeText: noticeTitle?.textContent || '',
        hasPrintRoot: Boolean(printRoot),
        printPagesInDom: document.querySelectorAll('.print-page').length,
        capturesCount: window.__PRINT_CAPTURES__.length,
      };
    })()
  `);
  console.log('Status after "Print backs" click:', JSON.stringify(noticeState, null, 2));

  if (noticeState.hasNotice) {
    console.log('Clicking "Print anyway" in CheckNotice modal...');
    await evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Print anyway'));
        btn?.click();
      })()
    `);
    await sleep(1500);
  }

  const captureBacks = await evaluate(`window.__PRINT_CAPTURES__`);
  console.log('Capture after Print backs confirmation:\n', JSON.stringify(captureBacks, null, 2));
  await evaluate(`
    (() => {
      window.__PRINT_CAPTURES__ = [];
      const printBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Print');
      printBtn?.click();
    })()
  `);
  await sleep(600);

  await evaluate(`
    (() => {
      const printFrontsBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Print fronts'));
      printFrontsBtn?.click();
    })()
  `);
  await sleep(1000);

  // If check notice opens, click Print anyway
  await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Print anyway'));
      btn?.click();
    })()
  `);
  await sleep(1500);

  const captureFronts = await evaluate(`window.__PRINT_CAPTURES__`);
  console.log('Capture after "Print fronts":\n', JSON.stringify(captureFronts, null, 2));

  // Step F: Test "Save as PDF" with Print backs
  console.log('\n--- Step F: Testing Save as PDF with Backs ---');
  await evaluate(`
    window.__PDF_DOWNLOADS__ = [];
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = function(blob) {
      window.__PDF_DOWNLOADS__.push({ size: blob.size, type: blob.type });
      return origCreate.call(URL, blob);
    };
  `);

  await evaluate(`
    (() => {
      const pdfBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Save as PDF');
      pdfBtn?.click();
    })()
  `);
  await sleep(600);

  await evaluate(`
    (() => {
      const saveBacksBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Save backs as PDF'));
      saveBacksBtn?.click();
    })()
  `);
  await sleep(1000);

  // If check notice opens, click Save anyway
  await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Save anyway'));
      btn?.click();
    })()
  `);
  await sleep(2500);

  const pdfCaptures = await evaluate(`window.__PDF_DOWNLOADS__`);
  console.log('PDF captures after "Save backs as PDF":', JSON.stringify(pdfCaptures));


  ws.close();
  chromeProc.kill();
  process.exit(0);
}

runReproduction().catch((err) => {
  console.error('\n*** REPRODUCTION FAILED ***\n', err);
  process.exit(1);
});
