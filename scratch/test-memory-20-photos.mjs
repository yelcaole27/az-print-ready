import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempDir = path.join(process.env.TEMP || 'C:\\Temp', 'chrome-memtest-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  console.log('[Memory Test] Spawning headless Chrome...');
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
      throw new Error(res.exceptionDetails.text || 'Runtime.evaluate exception');
    }
    return res.result?.value;
  };

  await send('Page.enable');
  await send('DOM.enable');
  await sleep(1500);

  console.log('=== MEMORY BENCHMARK: 20 PHOTOS ===');

  const beforeMemory = await evalCode(`(() => {
    if (window.performance && window.performance.memory) {
      return {
        usedJSHeapSizeMB: Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024)),
        totalJSHeapSizeMB: Math.round(window.performance.memory.totalJSHeapSize / (1024 * 1024)),
      };
    }
    return null;
  })()`);
  console.log('Heap memory before import:', beforeMemory);

  // Generate and import 20 photos (3000 x 2000 px each) via importFiles
  console.log('[Test] Generating 20 photos (3000x2000 px each)...');
  const importBench = await evalCode(`(async () => {
    const { importFiles, useSessionStore } = window.__AZ_TEST__;

    // Create 20 images
    const files = [];
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 2000;
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = 'hsl(' + (i * 18) + ', 70%, 50%)';
      ctx.fillRect(0, 0, 3000, 2000);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
      files.push(new File([blob], 'photo_' + (i + 1) + '.jpg', { type: 'image/jpeg' }));
    }
    canvas.width = 0;
    canvas.height = 0;

    const startTime = performance.now();
    await importFiles(files);
    const durationMs = Math.round(performance.now() - startTime);

    const state = useSessionStore.getState();
    const assets = state.assets;

    return {
      durationMs,
      importedCount: assets.length,
      samplePxW: assets[0]?.pxW,
      samplePxH: assets[0]?.pxH,
      sampleHasBlob: Boolean(assets[0]?.originalBlob),
      sampleThumb: Boolean(assets[0]?.thumbUrl),
      samplePreview: Boolean(assets[0]?.previewUrl),
    };
  })()`);
  console.log('Import benchmark result:', importBench);

  const afterMemory = await evalCode(`(() => {
    if (window.performance && window.performance.memory) {
      return {
        usedJSHeapSizeMB: Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024)),
        totalJSHeapSizeMB: Math.round(window.performance.memory.totalJSHeapSize / (1024 * 1024)),
      };
    }
    return null;
  })()`);
  console.log('Heap memory after 20 photos import:', afterMemory);

  // Test warning toast when total pictures > 40
  console.log('[Test] Testing > 40 pictures warning toast with importFiles...');
  const toastResult = await evalCode(`(async () => {
    const { importFiles, useUiStore } = window.__AZ_TEST__;

    // We already have 20 pictures. Add 22 more small pictures to cross 40
    const files = [];
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#123456';
    ctx.fillRect(0, 0, 100, 100);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    canvas.width = 0;
    canvas.height = 0;

    for (let i = 0; i < 22; i++) {
      files.push(new File([blob], 'extra_' + i + '.jpg', { type: 'image/jpeg' }));
    }

    await importFiles(files);

    const toast = useUiStore.getState().message;
    return toast;
  })()`);
  console.log('Warning toast result:', toastResult);
  if (toastResult?.text !== 'Many pictures: the app may get slow.') {
    throw new Error('Warning toast did not trigger when pictures > 40');
  }
  console.log('PASS: > 40 pictures triggers warning toast "Many pictures: the app may get slow."');

  console.log('\nALL MEMORY TESTS PASSED!');
  ws.close();
  chromeProc.kill();
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
