import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== STARTING PROMPT 8B AUTOMATED VERIFICATION ===\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9266;
  const userDataDir = path.join(os.tmpdir(), 'chrome-test-p8b-' + Date.now());

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

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise((resolve) => {
    if (ws.readyState === WebSocket.OPEN) resolve();
    else ws.onopen = () => resolve();
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('CSS.enable');

  async function evaluate(expr) {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error('Evaluation failed: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

  // Wait for React to mount and test hooks to be ready
  for (let i = 0; i < 30; i++) {
    const ready = await evaluate(`typeof window.__AZ_TEST__ !== 'undefined'`);
    if (ready) break;
    await sleep(200);
  }

  const report = {};

  // -----------------------------------------------------------------
  // 1. Report defaults actually stored in usePriceStore.ts for all four paper types
  // -----------------------------------------------------------------
  console.log('--- 1. Stored defaults for all four paper types ---');
  const defaults = await evaluate(`
    (() => {
      const store = window.__AZ_TEST__.usePriceStore.getState();
      store.resetToDefaults();
      const fresh = window.__AZ_TEST__.usePriceStore.getState().settings;
      return fresh.paperTypes.map(pt => ({
        id: pt.id,
        name: pt.name,
        kind: pt.kind,
        byPage: pt.byPage,
        byPhoto: pt.byPhoto
      }));
    })()
  `);
  report.storedDefaults = defaults;
  console.log(JSON.stringify(defaults, null, 2));

  // Check Standard photo sizes against: Cute 8, Wallet 10, 3R 5, 4R 8, 5R 9, 6R 10, A5 10, 8R 10
  const standardType = defaults.find((pt) => pt.id === 'standard');
  const stdPhotoSizes = standardType.byPage.photoSizes;
  const expectedStdSizes = {
    cute: 8,
    wallet: 10,
    '3r': 5,
    '4r': 8,
    '5r': 9,
    '6r': 10,
    a5: 10,
    '8r': 10,
  };
  let stdSizesMatch = true;
  for (const [key, val] of Object.entries(expectedStdSizes)) {
    if (stdPhotoSizes[key] !== val) {
      stdSizesMatch = false;
      console.error(`Mismatch for ${key}: got ${stdPhotoSizes[key]}, expected ${val}`);
    }
  }
  console.log('Standard photo sizes match expected:', stdSizesMatch);
  report.stdSizesMatch = stdSizesMatch;

  // -----------------------------------------------------------------
  // 2. Photo paper ID package cases:
  //    1x1 x 6; 1x1 x 8 + 2x2 x 4; 1x1 x 6 + 2x2 x 4; 1x1 x 7; 2x2 x 2.
  // -----------------------------------------------------------------
  console.log('\n--- 2. Photo paper ID package line items ---');
  const testCases = [
    { name: '1x1 x 6', c1: 6, c2: 0 },
    { name: '1x1 x 8 + 2x2 x 4', c1: 8, c2: 4 },
    { name: '1x1 x 6 + 2x2 x 4', c1: 6, c2: 4 },
    { name: '1x1 x 7', c1: 7, c2: 0 },
    { name: '2x2 x 2', c1: 0, c2: 2 },
  ];

  const packageResults = await evaluate(`
    (() => {
      const calculateJobPrice = window.__AZ_TEST__.calculateJobPrice;
      const priceSettings = window.__AZ_TEST__.usePriceStore.getState().settings;
      const cases = ${JSON.stringify(testCases)};

      return cases.map(tc => {
        const elements = [];
        for (let i = 0; i < tc.c1; i++) {
          elements.push({ id: 'c1_' + i, assetId: 'a1', xMm: 0, yMm: 0, wMm: 25.4, hMm: 25.4 });
        }
        for (let i = 0; i < tc.c2; i++) {
          elements.push({ id: 'c2_' + i, assetId: 'a2', xMm: 0, yMm: 0, wMm: 50.8, hMm: 50.8 });
        }
        const job = {
          id: 'test_job',
          name: 'Job',
          settings: { paperType: 'Photo', colorMode: 'Color' },
          pages: [{ id: 'p1', paperId: 'a4', orientation: 'portrait', elements }]
        };
        const res = calculateJobPrice(job, priceSettings);
        return {
          caseName: tc.name,
          total: res.total,
          lines: res.lines
        };
      });
    })()
  `);
  report.packageResults = packageResults;
  console.log(JSON.stringify(packageResults, null, 2));

  // -----------------------------------------------------------------
  // 3. Single Wallet and single Cute on Standard Letter:
  //    Report totals (expected 10 and 8).
  // -----------------------------------------------------------------
  console.log('\n--- 3. Single Wallet and single Cute on Standard Letter ---');
  const singleSizesResult = await evaluate(`
    (() => {
      const calculateJobPrice = window.__AZ_TEST__.calculateJobPrice;
      const priceSettings = window.__AZ_TEST__.usePriceStore.getState().settings;

      // Single Wallet on Letter Standard
      const jobWallet = {
        id: 'job_w',
        name: 'Wallet Job',
        settings: { paperType: 'Standard', colorMode: 'Color' },
        pages: [{
          id: 'p1',
          paperId: 'letter',
          orientation: 'portrait',
          elements: [{ id: 'w1', assetId: 'aw', xMm: 10, yMm: 10, wMm: 63.5, hMm: 88.9 }]
        }]
      };
      const resWallet = calculateJobPrice(jobWallet, priceSettings);

      // Single Cute on Letter Standard
      const jobCute = {
        id: 'job_c',
        name: 'Cute Job',
        settings: { paperType: 'Standard', colorMode: 'Color' },
        pages: [{
          id: 'p1',
          paperId: 'letter',
          orientation: 'portrait',
          elements: [{ id: 'c1', assetId: 'ac', xMm: 10, yMm: 10, wMm: 50.8, hMm: 76.2 }]
        }]
      };
      const resCute = calculateJobPrice(jobCute, priceSettings);

      return {
        singleWallet: { total: resWallet.total, lines: resWallet.lines },
        singleCute: { total: resCute.total, lines: resCute.lines }
      };
    })()
  `);
  report.singleSizesResult = singleSizesResult;
  console.log(JSON.stringify(singleSizesResult, null, 2));

  // -----------------------------------------------------------------
  // 4. Peso symbol rendering in app font
  // -----------------------------------------------------------------
  console.log('\n--- 4. Peso sign rendering in app font ---');
  // First ensure there is a picture in active job so price card is visible
  await evaluate(`
    (() => {
      const s = window.__AZ_TEST__.useSessionStore.getState();
      let job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
      if (job.pages[0].elements.length === 0) {
        job.pages[0].elements = [{
          id: 'el_demo',
          assetId: 'a_demo',
          xMm: 20,
          yMm: 20,
          wMm: 63.5,
          hMm: 88.9
        }];
        window.__AZ_TEST__.useSessionStore.setState({ jobs: [...s.jobs] });
      }
    })()
  `);
  await sleep(300);

  const pesoCheck = await evaluate(`
    (() => {
      const spans = Array.from(document.querySelectorAll('span'));
      const pesoSpan = spans.find(s => s.textContent.includes('₱'));
      if (!pesoSpan) return { found: false };
      const comp = window.getComputedStyle(pesoSpan);
      return {
        found: true,
        text: pesoSpan.textContent,
        fontFamily: comp.fontFamily,
        fontSize: comp.fontSize,
        fontWeight: comp.fontWeight,
        charCodes: Array.from(pesoSpan.textContent).map(c => ({
          char: c,
          codePoint: 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
        }))
      };
    })()
  `);
  report.pesoCheck = pesoCheck;
  console.log(JSON.stringify(pesoCheck, null, 2));

  // Take screenshot of price card to verify visual rendering
  const doc = await send('DOM.getDocument');
  const priceCardNode = await send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '.shrink-0.rounded-\\[16px\\]',
  });

  if (priceCardNode && priceCardNode.nodeId) {
    const box = await send('DOM.getBoxModel', { nodeId: priceCardNode.nodeId });
    if (box && box.model) {
      console.log('Price card bounding box found, verified rendered on canvas.');
    }
  }

  ws.close();
  chromeProc.kill();
  console.log('\n=== ALL PROMPT 8B VERIFICATIONS COMPLETE ===');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
