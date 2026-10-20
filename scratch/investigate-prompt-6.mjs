import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-prof-6-inv-'));
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const cdpPort = 9225;

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

  // Helper to extract element details via React fiber
  const getFiberDetails = async () => {
    return evaluate(`
      (() => {
        const el = document.querySelector('[data-element-id]');
        const pageEl = document.querySelector('[data-page-id]');
        if (!el) return { error: 'no element' };

        // Find react fiber
        const key = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        let fiber = el[key];
        let elementProp = null;
        let pageProp = null;

        while (fiber) {
          if (fiber.memoizedProps?.element) {
            elementProp = fiber.memoizedProps.element;
          }
          if (fiber.memoizedProps?.page) {
            pageProp = fiber.memoizedProps.page;
          }
          if (elementProp && pageProp) break;
          fiber = fiber.return;
        }

        const img = el.querySelector('img');

        // Read Geometry inputs from RightPanel if present
        const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
        const inputValues = inputs.map(i => ({
          label: i.parentElement?.querySelector('label')?.textContent,
          value: i.value,
        }));

        return {
          elementProp,
          pageProp,
          imgStyle: img ? {
            width: img.style.width,
            height: img.style.height,
            objectFit: img.style.objectFit,
          } : null,
          inputValues,
        };
      })()
    `);
  };

  // 1. Upload 4:3 landscape photo: 800x600
  console.log('\n=== INVESTIGATING 4:3 LANDSCAPE PHOTO (800x600) ===');
  await evaluate(`
    (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 800, 600);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'landscape-4-3.png', { type: 'image/png' });

      const input = document.querySelector('input[type="file"]');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await sleep(1500);

  const data43 = await getFiberDetails();
  console.log('4:3 Data:', JSON.stringify(data43, null, 2));

  // Reset / Clear all pictures to test portrait photo
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await sleep(2000);

  // 2. Upload 3:4 portrait photo: 600x800
  console.log('\n=== INVESTIGATING 3:4 PORTRAIT PHOTO (600x800) ===');
  await evaluate(`
    (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(0, 0, 600, 800);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'portrait-3-4.png', { type: 'image/png' });

      const input = document.querySelector('input[type="file"]');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await sleep(1500);

  const data34 = await getFiberDetails();
  console.log('3:4 Data:', JSON.stringify(data34, null, 2));

  ws.close();
  chromeProc.kill();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
