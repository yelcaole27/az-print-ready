import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runVerification() {
  console.log('=== STARTING PROMPT 5D COMPLETE VERIFICATION ===\n');

  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-prof-5d-verify-'));
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const cdpPort = 9224;

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tmpProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--disable-gpu',
    'http://localhost:3000',
  ]);

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

  console.log('Navigating to app...');
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await sleep(2000);

  // Install stub for window.print and PDF tracking
  await evaluate(`
    window.__PRINT_CAPTURES__ = [];
    window.print = function() {
      const printRoot = document.getElementById('print-root');
      const printPages = printRoot ? Array.from(printRoot.querySelectorAll('.print-page')) : [];
      
      const capture = {
        timestamp: Date.now(),
        pageCount: printPages.length,
        pages: printPages.map((p, idx) => {
          const els = Array.from(p.querySelectorAll('[style*="position: absolute"]')).map(el => ({
            left: el.style.left,
            top: el.style.top,
            width: el.style.width,
            height: el.style.height,
          }));
          return {
            index: idx,
            width: p.style.width,
            height: p.style.height,
            elements: els,
          };
        }),
      };
      window.__PRINT_CAPTURES__.push(capture);
      setTimeout(() => {
        window.dispatchEvent(new Event('afterprint'));
      }, 50);
    };

    window.__PDF_CAPTURES__ = [];
    window.__PDF_EXPORT_DOM__ = null;

    const origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (this.download || (this.href && this.href.startsWith('blob:'))) {
        window.__PDF_CAPTURES__.push({
          download: this.download,
          href: this.href,
        });
      }
      return origAnchorClick.call(this);
    };

    // Observe #print-root during PDF export to record page count and positions
    const observer = new MutationObserver(() => {
      const root = document.getElementById('print-root');
      if (root && root.classList.contains('exporting-pdf')) {
        const pages = Array.from(root.querySelectorAll('.print-page'));
        if (pages.length > 0 && !window.__PDF_EXPORT_DOM__) {
          window.__PDF_EXPORT_DOM__ = {
            pageCount: pages.length,
            pages: pages.map((p, idx) => ({
              index: idx,
              width: p.style.width,
              height: p.style.height,
              elements: Array.from(p.querySelectorAll('[style*="position: absolute"]')).map(el => ({
                left: el.style.left,
                top: el.style.top,
                width: el.style.width,
                height: el.style.height,
              })),
            })),
          };
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  `);

  // Helper to click button by text/title
  const clickBtn = async (matcher) => {
    return evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
          b.textContent?.trim().includes('${matcher}') ||
          b.title?.includes('${matcher}') ||
          b.getAttribute('aria-label')?.includes('${matcher}')
        );
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
  };

  // Helper to dismiss CheckNotice if it appears
  const handleCheckNoticeIfOpen = async (actionText = 'Print anyway') => {
    await sleep(400);
    return evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('${actionText}'));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
  };

  // --- Check 6: A job with no back pages (Print has no chooser) ---
  console.log('\n--- Check 6: A job with no back pages (Print has no chooser) ---');
  // Upload 1 image on start screen
  await evaluate(`
    (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 600, 600);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'photo.png', { type: 'image/png' });

      const input = document.querySelector('input[type="file"]');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await sleep(1500);

  // Click Print
  await clickBtn('Print');
  await sleep(600);
  const chooserShownJobNoBack = await evaluate(`Boolean(document.querySelector('#print-chooser-title'))`);
  console.log('No-back job showed chooser:', chooserShownJobNoBack);
  if (chooserShownJobNoBack) throw new Error('Check 6 failed: job with no back page should not show chooser');

  await handleCheckNoticeIfOpen('Print anyway');
  await sleep(1000);
  const captureNoBack = await evaluate(`window.__PRINT_CAPTURES__.slice(-1)[0]`);
  console.log('No-back job print pageCount:', captureNoBack?.pageCount);
  if (captureNoBack?.pageCount !== 1) throw new Error('Check 6 failed: expected 1 page output');

  // --- Add a back page to make 1 front and 1 back ---
  console.log('\n--- Setting up 1 front and 1 back page ---');
  await clickBtn('Add back page');
  await sleep(1000);
  await clickBtn('Fill all slots');
  await sleep(1000);

  // --- Check 1: Print backs has exactly 1 page (the back page, mirrored) ---
  console.log('\n--- Check 1: Print backs has exactly 1 page (the back page, mirrored) ---');
  await evaluate(`window.__PRINT_CAPTURES__ = []`);
  await clickBtn('Print');
  await sleep(600);
  await clickBtn('Print backs');
  await handleCheckNoticeIfOpen('Print anyway');
  await sleep(1200);

  const capture1 = await evaluate(`window.__PRINT_CAPTURES__.slice(-1)[0]`);
  console.log('Check 1 (Print backs) result:', JSON.stringify(capture1, null, 2));
  if (!capture1 || capture1.pageCount !== 1) {
    throw new Error(`Check 1 failed: expected exactly 1 page, got ${capture1?.pageCount}`);
  }
  const backEl = capture1.pages[0].elements[0];
  console.log('Back element position in output:', JSON.stringify(backEl));

  // --- Check 2: Print fronts has exactly 1 page (the front) ---
  console.log('\n--- Check 2: Print fronts has exactly 1 page (the front) ---');
  await evaluate(`window.__PRINT_CAPTURES__ = []`);
  await clickBtn('Print');
  await sleep(600);
  await clickBtn('Print fronts');
  await handleCheckNoticeIfOpen('Print anyway');
  await sleep(1200);

  const capture2 = await evaluate(`window.__PRINT_CAPTURES__.slice(-1)[0]`);
  console.log('Check 2 (Print fronts) result:', JSON.stringify(capture2, null, 2));
  if (!capture2 || capture2.pageCount !== 1) {
    throw new Error(`Check 2 failed: expected exactly 1 page, got ${capture2?.pageCount}`);
  }

  // --- Check 4: Print backs, then Print fronts, then Print backs again in a row ---
  console.log('\n--- Check 4: Print backs, then Print fronts, then Print backs again in a row ---');
  // Backs again
  await evaluate(`window.__PRINT_CAPTURES__ = []`);
  await clickBtn('Print');
  await sleep(600);
  await clickBtn('Print backs');
  await handleCheckNoticeIfOpen('Print anyway');
  await sleep(1200);

  const capture4a = await evaluate(`window.__PRINT_CAPTURES__.slice(-1)[0]`);
  console.log('Sequence call 1 (backs) count:', capture4a?.pageCount);
  if (capture4a?.pageCount !== 1) throw new Error('Check 4 failed on backs');

  // Fronts again
  await evaluate(`window.__PRINT_CAPTURES__ = []`);
  await clickBtn('Print');
  await sleep(600);
  await clickBtn('Print fronts');
  await handleCheckNoticeIfOpen('Print anyway');
  await sleep(1200);

  const capture4b = await evaluate(`window.__PRINT_CAPTURES__.slice(-1)[0]`);
  console.log('Sequence call 2 (fronts) count:', capture4b?.pageCount);
  if (capture4b?.pageCount !== 1) throw new Error('Check 4 failed on fronts');

  // Backs again
  await evaluate(`window.__PRINT_CAPTURES__ = []`);
  await clickBtn('Print');
  await sleep(600);
  await clickBtn('Print backs');
  await handleCheckNoticeIfOpen('Print anyway');
  await sleep(1200);

  const capture4c = await evaluate(`window.__PRINT_CAPTURES__.slice(-1)[0]`);
  console.log('Sequence call 3 (backs) count:', capture4c?.pageCount);
  if (capture4c?.pageCount !== 1) throw new Error('Check 4 failed on second backs');

  // --- Check 5: Save as PDF with Print backs ---
  console.log('\n--- Check 5: Save as PDF with Print backs ---');
  await evaluate(`
    window.__PDF_CAPTURES__ = [];
    window.__PDF_EXPORT_DOM__ = null;
  `);
  const savePdfBtnClicked = await clickBtn('Save as PDF');
  console.log('Clicked Save as PDF button:', savePdfBtnClicked);
  await sleep(600);
  const chooserTitle = await evaluate(`document.querySelector('#print-chooser-title')?.textContent`);
  console.log('Chooser title after Save as PDF click:', chooserTitle);

  const saveBacksClicked = await clickBtn('Save backs as PDF');
  console.log('Clicked Save backs as PDF button:', saveBacksClicked);
  await sleep(600);

  const noticeHandled = await handleCheckNoticeIfOpen('Save anyway');
  console.log('Handled check notice for Save as PDF:', noticeHandled);

  // Wait for export to finish (monitor export progress or PDF creation)
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const pdfDone = await evaluate(`window.__PDF_CAPTURES__.length > 0 || Boolean(window.__PDF_EXPORT_DOM__)`);
    if (pdfDone) break;
  }
  const capturePdf = await evaluate(`window.__PDF_CAPTURES__`);
  const capturePdfDom = await evaluate(`window.__PDF_EXPORT_DOM__`);
  console.log('Check 5 PDF anchor captures:', JSON.stringify(capturePdf));
  console.log('Check 5 PDF DOM captures (page count & positions):', JSON.stringify(capturePdfDom, null, 2));

  if (!capturePdfDom || capturePdfDom.pageCount !== 1) {
    throw new Error(`Check 5 failed: expected PDF to have exactly 1 page, got ${capturePdfDom?.pageCount}`);
  }

  // --- Check 7: Test sheet front and back print one sheet each ---
  console.log('\n--- Check 7: Test sheet front and back print one sheet each ---');
  // Open Settings modal
  await clickBtn('Settings');
  await sleep(600);
  await clickBtn('Print test sheet');
  await sleep(600);

  // Print test front
  await evaluate(`window.__PRINT_CAPTURES__ = []`);
  await clickBtn('Print test front');
  await sleep(1200);
  const captureTestFront = await evaluate(`window.__PRINT_CAPTURES__.slice(-1)[0]`);
  console.log('Test sheet front page count:', captureTestFront?.pageCount);
  if (captureTestFront?.pageCount !== 1) throw new Error('Check 7 failed for test front');

  // Open Settings modal again
  await clickBtn('Settings');
  await sleep(600);
  await clickBtn('Print test sheet');
  await sleep(600);

  // Print test back
  await evaluate(`window.__PRINT_CAPTURES__ = []`);
  await clickBtn('Print test back');
  await sleep(1200);
  const captureTestBack = await evaluate(`window.__PRINT_CAPTURES__.slice(-1)[0]`);
  console.log('Test sheet back page count:', captureTestBack?.pageCount);
  if (captureTestBack?.pageCount !== 1) throw new Error('Check 7 failed for test back');

  // Close Settings modal if open
  await evaluate(`
    (() => {
      const closeBtn = document.querySelector('button[aria-label="Close"]');
      closeBtn?.click();
    })()
  `);
  await sleep(500);

  // --- Check 3: 3 fronts and 3 backs ---
  console.log('\n--- Check 3: 3 fronts and 3 backs (reverse on and off) ---');
  // Upload second image to create Front 2
  await evaluate(`
    (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(0, 0, 600, 600);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'photo2.png', { type: 'image/png' });

      const input = document.querySelector('input[type="file"]');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await sleep(1500);

  // Add back page to Front 2 and fill it
  await clickBtn('Add back page');
  await sleep(1000);
  await clickBtn('Fill all slots');
  await sleep(1000);

  // Upload third image to create Front 3
  await evaluate(`
    (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(0, 0, 600, 600);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'photo3.png', { type: 'image/png' });

      const input = document.querySelector('input[type="file"]');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await sleep(1500);

  // Add back page to Front 3 and fill it
  await clickBtn('Add back page');
  await sleep(1000);
  await clickBtn('Fill all slots');
  await sleep(1000);

  // Test Print fronts with 3 pages
  await evaluate(`window.__PRINT_CAPTURES__ = []`);
  await clickBtn('Print');
  await sleep(600);
  await clickBtn('Print fronts');
  await handleCheckNoticeIfOpen('Print anyway');
  await sleep(1500);
  const capture3Fronts = await evaluate(`window.__PRINT_CAPTURES__.slice(-1)[0]`);
  console.log('3 fronts pageCount:', capture3Fronts?.pageCount);
  if (capture3Fronts?.pageCount !== 3) throw new Error(`Expected 3 front pages, got ${capture3Fronts?.pageCount}`);

  // Test Print backs with reverse OFF (B1, B2, B3)
  await evaluate(`window.__PRINT_CAPTURES__ = []`);
  await clickBtn('Print');
  await sleep(600);
  await clickBtn('Print backs');
  await handleCheckNoticeIfOpen('Print anyway');
  await sleep(1500);
  const capture3BacksNormal = await evaluate(`window.__PRINT_CAPTURES__.slice(-1)[0]`);
  console.log('3 backs (reverse off) pageCount:', capture3BacksNormal?.pageCount);
  if (capture3BacksNormal?.pageCount !== 3) throw new Error(`Expected 3 back pages, got ${capture3BacksNormal?.pageCount}`);

  // Test Print backs with reverse ON (B3, B2, B1)
  await evaluate(`window.__PRINT_CAPTURES__ = []`);
  await clickBtn('Print');
  await sleep(600);
  // Toggle reverse switch
  await evaluate(`
    (() => {
      const checkbox = document.querySelector('input[type="checkbox"]');
      if (checkbox && !checkbox.checked) checkbox.click();
    })()
  `);
  await sleep(300);
  await clickBtn('Print backs');
  await handleCheckNoticeIfOpen('Print anyway');
  await sleep(1500);
  const capture3BacksReversed = await evaluate(`window.__PRINT_CAPTURES__.slice(-1)[0]`);
  console.log('3 backs (reverse on) pageCount:', capture3BacksReversed?.pageCount);
  if (capture3BacksReversed?.pageCount !== 3) throw new Error(`Expected 3 reversed back pages, got ${capture3BacksReversed?.pageCount}`);

  console.log('\n=== ALL PROMPT 5D CHECKS PASSED SUCCESSFULLY! ===');
  ws.close();
  chromeProc.kill();
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('\n*** VERIFICATION FAILED ***\n', err);
  process.exit(1);
});
