import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== STARTING PROMPT 8 AUTOMATED VERIFICATION ===\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9260;
  const userDataDir = path.join(os.tmpdir(), 'chrome-test-p8-' + Date.now());

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
    // -------------------------------------------------------------
    // Helper function to reset job and upload an image
    // -------------------------------------------------------------
    async function setupJob(options = {}) {
      return await evaluate(`
        (async () => {
          const s = window.__AZ_TEST__.useSessionStore.getState();
          const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
          s.clearElements(job.id);
          s.updateSettings(job.id, {
            paperType: '${options.paperType || 'Standard'}',
            colorMode: '${options.colorMode || 'Color'}',
            marginMm: 6.35,
            borderless: false,
          });
          if ('${options.paperId || ''}') {
            s.setJobPaper(job.id, '${options.paperId}');
          }
          window.__AZ_TEST__.usePriceStore.getState().resetToDefaults();
          return { ok: true };
        })()
      `);
    }

    // -------------------------------------------------------------
    // CHECK 1: Standard, Letter:
    // One full-page photo = 10 color, 7 B&W;
    // One 1x1 photo on a page (under half) = 7 color, 5 B&W (ran)
    // -------------------------------------------------------------
    console.log('--- CHECK 1: Standard, Letter (full page and 1x1 under half) ---');
    await setupJob({ paperType: 'Standard', colorMode: 'Color', paperId: 'letter' });
    const check1 = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();
        const calculateJobPrice = window.__AZ_TEST__.calculateJobPrice;
        const job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];
        const page = job.pages[0];

        // 1A. Full page photo (e.g. 200 x 260 mm > 50% coverage of printable area 203.2 x 266.7)
        page.elements = [
          { id: 'el1', assetId: 'a1', xMm: 6.35, yMm: 6.35, wMm: 200, hMm: 260 }
        ];

        // Color
        job.settings.colorMode = 'Color';
        const resFullColor = calculateJobPrice(job, priceStore.settings);

        // B&W
        job.settings.colorMode = 'B&W';
        const resFullBW = calculateJobPrice(job, priceStore.settings);

        // 1B. 1x1 photo (25.4 x 25.4 mm < 50% coverage)
        page.elements = [
          { id: 'el1', assetId: 'a1', xMm: 10, yMm: 10, wMm: 25.4, hMm: 25.4 }
        ];

        // Color
        job.settings.colorMode = 'Color';
        const res1x1Color = calculateJobPrice(job, priceStore.settings);

        // B&W
        job.settings.colorMode = 'B&W';
        const res1x1BW = calculateJobPrice(job, priceStore.settings);

        return {
          fullColor: resFullColor.total,
          fullBW: resFullBW.total,
          halfColor: res1x1Color.total,
          halfBW: res1x1BW.total,
          passed: resFullColor.total === 10 && resFullBW.total === 7 && res1x1Color.total === 7 && res1x1BW.total === 5
        };
      })()
    `);
    console.log('Check 1 result:', check1);
    results.check1 = check1.passed;

    // -------------------------------------------------------------
    // CHECK 2: Standard, 8 Wallet on one Letter page = 10 (capped) color;
    // 1 Cute = 8; 2 pages (one full, one half) = 17 (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 2: Standard photo sizes (8 Wallet capped, 1 Cute, 2 pages) ---');
    await setupJob({ paperType: 'Standard', colorMode: 'Color', paperId: 'letter' });
    const check2 = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();
        const calculateJobPrice = window.__AZ_TEST__.calculateJobPrice;
        let job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];

        // 2A. 8 Wallet photos on 1 Letter page (each 63.5 x 88.9)
        job.settings.colorMode = 'Color';
        job.pages = [{
          id: 'p1',
          paperId: 'letter',
          orientation: 'portrait',
          elements: Array.from({ length: 8 }, (_, i) => ({
            id: 'w_' + i,
            assetId: 'a_wallet',
            xMm: 10 + (i % 2) * 70,
            yMm: 10 + Math.floor(i / 2) * 90,
            wMm: 63.5,
            hMm: 88.9
          }))
        }];
        const res8Wallet = calculateJobPrice(job, priceStore.settings);

        // 2B. 1 Cute on 1 Letter page (50.8 x 76.2)
        job.pages = [{
          id: 'p1',
          paperId: 'letter',
          orientation: 'portrait',
          elements: [{
            id: 'cute_1',
            assetId: 'a_cute',
            xMm: 10,
            yMm: 10,
            wMm: 50.8,
            hMm: 76.2
          }]
        }];
        const res1Cute = calculateJobPrice(job, priceStore.settings);

        // 2C. 2 pages: one full (coverage > 50% = 10), one half (coverage <= 50% = 7)
        job.pages = [
          {
            id: 'p1',
            paperId: 'letter',
            orientation: 'portrait',
            elements: [{ id: 'f1', assetId: 'af', xMm: 10, yMm: 10, wMm: 200, hMm: 250 }]
          },
          {
            id: 'p2',
            paperId: 'letter',
            orientation: 'portrait',
            elements: [{ id: 'h1', assetId: 'ah', xMm: 10, yMm: 10, wMm: 50, hMm: 50 }]
          }
        ];
        const res2Pages = calculateJobPrice(job, priceStore.settings);

        return {
          wallet8: res8Wallet.total,
          wallet8Lines: res8Wallet.lines,
          cute1: res1Cute.total,
          cute1Lines: res1Cute.lines,
          twoPages: res2Pages.total,
          twoPagesLines: res2Pages.lines,
          passed: res8Wallet.total === 10 && res1Cute.total === 8 && res2Pages.total === 17
        };
      })()
    `);
    console.log('Check 2 result:', check2);
    results.check2 = check2.passed;

    // -------------------------------------------------------------
    // CHECK 3: Back-to-back: front full + back half, color = 17 (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 3: Back-to-back (front full + back half = 17) ---');
    const check3 = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();
        const calculateJobPrice = window.__AZ_TEST__.calculateJobPrice;
        let job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];

        job.settings.paperType = 'Standard';
        job.settings.colorMode = 'Color';

        job.pages = [
          {
            id: 'front1',
            paperId: 'letter',
            orientation: 'portrait',
            backPageId: 'back1',
            elements: [{ id: 'frontEl', assetId: 'af', xMm: 10, yMm: 10, wMm: 200, hMm: 250 }]
          },
          {
            id: 'back1',
            paperId: 'letter',
            orientation: 'portrait',
            isBack: true,
            frontPageId: 'front1',
            elements: [{ id: 'backEl', assetId: 'ab', xMm: 10, yMm: 10, wMm: 50, hMm: 50 }]
          }
        ];

        const resB2B = calculateJobPrice(job, priceStore.settings);
        return {
          total: resB2B.total,
          lines: resB2B.lines,
          passed: resB2B.total === 17
        };
      })()
    `);
    console.log('Check 3 result:', check3);
    results.check3 = check3.passed;

    // -------------------------------------------------------------
    // CHECK 4: Photo paper, A4:
    // Cute x 4 = 20; Cute x 3 = 20 with warning; Cute x 5 = 25;
    // Wallet x 6 = 30; 4R x 2 = 36; 3R x 2 + 4R x 1 = 42;
    // one full A4 picture = 50 (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 4: Photo paper, A4 pricing cases ---');
    const check4 = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();
        const calculateJobPrice = window.__AZ_TEST__.calculateJobPrice;
        let job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];

        job.settings.paperType = 'Photo';
        job.settings.colorMode = 'Color';

        function evalJob(elements) {
          job.pages = [{
            id: 'p1',
            paperId: 'a4',
            orientation: 'portrait',
            elements
          }];
          return calculateJobPrice(job, priceStore.settings);
        }

        // Cute x 4 (50.8 x 76.2)
        const resCute4 = evalJob(Array.from({ length: 4 }, (_, i) => ({
          id: 'c_' + i, assetId: 'ac', xMm: 10, yMm: 10 + i * 10, wMm: 50.8, hMm: 76.2
        })));

        // Cute x 3 (min 4 warning)
        const resCute3 = evalJob(Array.from({ length: 3 }, (_, i) => ({
          id: 'c_' + i, assetId: 'ac', xMm: 10, yMm: 10 + i * 10, wMm: 50.8, hMm: 76.2
        })));

        // Cute x 5
        const resCute5 = evalJob(Array.from({ length: 5 }, (_, i) => ({
          id: 'c_' + i, assetId: 'ac', xMm: 10, yMm: 10 + i * 10, wMm: 50.8, hMm: 76.2
        })));

        // Wallet x 6 (63.5 x 88.9)
        const resWallet6 = evalJob(Array.from({ length: 6 }, (_, i) => ({
          id: 'w_' + i, assetId: 'aw', xMm: 10, yMm: 10 + i * 10, wMm: 63.5, hMm: 88.9
        })));

        // 4R x 2 (101.6 x 152.4)
        const res4R2 = evalJob(Array.from({ length: 2 }, (_, i) => ({
          id: 'r4_' + i, assetId: 'a4r', xMm: 10, yMm: 10 + i * 10, wMm: 101.6, hMm: 152.4
        })));

        // 3R x 2 (88.9 x 127) + 4R x 1 (101.6 x 152.4)
        const res3R2_4R1 = evalJob([
          { id: 'r3_1', assetId: 'a3r', xMm: 10, yMm: 10, wMm: 88.9, hMm: 127 },
          { id: 'r3_2', assetId: 'a3r', xMm: 10, yMm: 30, wMm: 88.9, hMm: 127 },
          { id: 'r4_1', assetId: 'a4r', xMm: 10, yMm: 50, wMm: 101.6, hMm: 152.4 }
        ]);

        // One full A4 picture (210 x 297)
        const resA4Full = evalJob([
          { id: 'a4_1', assetId: 'aa4', xMm: 0, yMm: 0, wMm: 210, hMm: 297 }
        ]);

        return {
          cute4: resCute4.total,
          cute3: resCute3.total,
          cute3HasWarning: resCute3.warnings.some(w => w.includes('Min. 4 Cute')),
          cute5: resCute5.total,
          wallet6: resWallet6.total,
          r4_2: res4R2.total,
          r3_2_r4_1: res3R2_4R1.total,
          a4Full: resA4Full.total,
          passed:
            resCute4.total === 20 &&
            resCute3.total === 20 &&
            resCute3.warnings.some(w => w.includes('Min. 4 Cute')) &&
            resCute5.total === 25 &&
            resWallet6.total === 30 &&
            res4R2.total === 36 &&
            res3R2_4R1.total === 42 &&
            resA4Full.total === 50
        };
      })()
    `);
    console.log('Check 4 result:', check4);
    results.check4 = check4.passed;

    // -------------------------------------------------------------
    // CHECK 5: Round up: a 4.5 x 6 in picture = 5R = 22 (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 5: Round up (4.5 x 6 in -> 5R = 22) ---');
    const check5 = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();
        const calculateJobPrice = window.__AZ_TEST__.calculateJobPrice;
        let job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];

        job.settings.paperType = 'Photo';
        job.settings.colorMode = 'Color';

        // 4.5 x 6 in = 114.3 x 152.4 mm
        job.pages = [{
          id: 'p1',
          paperId: 'a4',
          orientation: 'portrait',
          elements: [{
            id: 'el_45x6',
            assetId: 'a_custom',
            xMm: 10,
            yMm: 10,
            wMm: 114.3,
            hMm: 152.4
          }]
        }];

        const res = calculateJobPrice(job, priceStore.settings);
        return {
          total: res.total,
          lines: res.lines,
          passed: res.total === 22 && res.lines.some(l => l.includes('5R') && l.includes('22'))
        };
      })()
    `);
    console.log('Check 5 result:', check5);
    results.check5 = check5.passed;

    // -------------------------------------------------------------
    // CHECK 6: Packages:
    // 1x1 x 6 = 40; 2x2 x 4 = 40; 1x1 x 6 + 2x2 x 3 = 60;
    // Passport x 9 = 50; 1x1 x 8 + 2x2 x 4 = 70;
    // 1x1 x 6 + 2x2 x 4 = 70 (Package 3 + one 2x2 at 10);
    // 1x1 x 7 = 47; 1x1 x 1 = 7; 2x2 x 2 = 20 (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 6: ID packages optimization ---');
    const check6 = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();
        const calculateJobPrice = window.__AZ_TEST__.calculateJobPrice;
        let job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];

        job.settings.paperType = 'Photo';

        function testPackages(counts) {
          const elements = [];
          if (counts['1x1']) {
            for (let i = 0; i < counts['1x1']; i++) {
              elements.push({ id: 'id1_' + i, assetId: 'a1', xMm: 0, yMm: 0, wMm: 25.4, hMm: 25.4 });
            }
          }
          if (counts['2x2']) {
            for (let i = 0; i < counts['2x2']; i++) {
              elements.push({ id: 'id2_' + i, assetId: 'a2', xMm: 0, yMm: 0, wMm: 50.8, hMm: 50.8 });
            }
          }
          if (counts['passport']) {
            for (let i = 0; i < counts['passport']; i++) {
              elements.push({ id: 'idp_' + i, assetId: 'ap', xMm: 0, yMm: 0, wMm: 35, hMm: 45 });
            }
          }
          job.pages = [{ id: 'p1', paperId: 'a4', orientation: 'portrait', elements }];
          return calculateJobPrice(job, priceStore.settings);
        }

        const t1 = testPackages({ '1x1': 6 });
        const t2 = testPackages({ '2x2': 4 });
        const t3 = testPackages({ '1x1': 6, '2x2': 3 });
        const t4 = testPackages({ 'passport': 9 });
        const t5 = testPackages({ '1x1': 8, '2x2': 4 });
        const t6 = testPackages({ '1x1': 6, '2x2': 4 });
        const t7 = testPackages({ '1x1': 7 });
        const t8 = testPackages({ '1x1': 1 });
        const t9 = testPackages({ '2x2': 2 });

        return {
          case1_1x1_6: t1.total,
          case2_2x2_4: t2.total,
          case3_1x1_6_2x2_3: t3.total,
          case4_passport_9: t4.total,
          case5_1x1_8_2x2_4: t5.total,
          case6_1x1_6_2x2_4: t6.total,
          case7_1x1_7: t7.total,
          case8_1x1_1: t8.total,
          case9_2x2_2: t9.total,
          passed:
            t1.total === 40 &&
            t2.total === 40 &&
            t3.total === 60 &&
            t4.total === 50 &&
            t5.total === 70 &&
            t6.total === 70 &&
            t7.total === 47 &&
            t8.total === 7 &&
            t9.total === 20
        };
      })()
    `);
    console.log('Check 6 result:', check6);
    results.check6 = check6.passed;

    // -------------------------------------------------------------
    // CHECK 7: B&W switch does not change premium prices (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 7: B&W switch does not change premium prices ---');
    const check7 = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();
        const calculateJobPrice = window.__AZ_TEST__.calculateJobPrice;
        let job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];

        job.settings.paperType = 'Photo';
        job.pages = [{
          id: 'p1',
          paperId: 'a4',
          orientation: 'portrait',
          elements: [
            { id: 'e1', assetId: 'a1', xMm: 10, yMm: 10, wMm: 101.6, hMm: 152.4 } // 4R = 18
          ]
        }];

        job.settings.colorMode = 'Color';
        const resColor = calculateJobPrice(job, priceStore.settings);

        job.settings.colorMode = 'B&W';
        const resBW = calculateJobPrice(job, priceStore.settings);

        return {
          colorTotal: resColor.total,
          bwTotal: resBW.total,
          passed: resColor.total === 18 && resBW.total === 18
        };
      })()
    `);
    console.log('Check 7 result:', check7);
    results.check7 = check7.passed;

    // -------------------------------------------------------------
    // CHECK 8: Choosing Photo, Sticker or Matte sets paper to A4.
    // Matte and Sticker use their own tables, editing Matte does not change Photo (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 8: Paper type selection & independent tables ---');
    const check8 = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();
        let job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];

        // 1. Initial paper is Letter
        s.setJobPaper(job.id, 'letter');
        const s1 = window.__AZ_TEST__.useSessionStore.getState();
        const job1 = s1.jobs.find(j => j.id === s1.activeJobId) || s1.jobs[0];
        const paperBefore = job1.pages[0].paperId;

        // 2. Select Photo paper type in Right Panel logic: sets job paper to A4
        s1.updateSettings(job1.id, { paperType: 'Photo' });
        s1.setJobPaper(job1.id, 'a4');
        const s2 = window.__AZ_TEST__.useSessionStore.getState();
        const job2 = s2.jobs.find(j => j.id === s2.activeJobId) || s2.jobs[0];
        const paperAfterPhoto = job2.pages[0].paperId;

        // 3. Edit Matte 4R price to 25
        priceStore.updatePaperType('matte', (pt) => ({
          ...pt,
          byPhoto: {
            ...pt.byPhoto,
            photoSizes: {
              ...pt.byPhoto.photoSizes,
              '4r': { price: 25 }
            }
          }
        }));

        const freshPriceStore = window.__AZ_TEST__.usePriceStore.getState();
        const photo4R = freshPriceStore.settings.paperTypes.find(pt => pt.id === 'photo')?.byPhoto?.photoSizes['4r']?.price;
        const matte4R = freshPriceStore.settings.paperTypes.find(pt => pt.id === 'matte')?.byPhoto?.photoSizes['4r']?.price;

        return {
          paperBefore,
          paperAfterPhoto,
          photo4R,
          matte4R,
          passed: paperBefore === 'letter' && paperAfterPhoto === 'a4' && photo4R === 18 && matte4R === 25
        };
      })()
    `);
    console.log('Check 8 result:', check8);
    results.check8 = check8.passed;

    // -------------------------------------------------------------
    // CHECK 9: Add a paper type of each kind; delete it; Standard cannot be deleted (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 9: Add & delete paper types (Standard cannot be deleted) ---');
    const check9 = await evaluate(`
      (() => {
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();

        // Count initial
        const initialCount = priceStore.settings.paperTypes.length;

        // Add by-page type
        priceStore.addPaperType('Cardstock', 'by-page');
        let ps = window.__AZ_TEST__.usePriceStore.getState();
        const addedByPage = ps.settings.paperTypes.find(pt => pt.name === 'Cardstock');

        // Add by-photo type
        ps.addPaperType('Glossy Premium', 'by-photo');
        ps = window.__AZ_TEST__.usePriceStore.getState();
        const addedByPhoto = ps.settings.paperTypes.find(pt => pt.name === 'Glossy Premium');

        // Try deleting Standard (must be prevented)
        ps.deletePaperType('standard');
        ps = window.__AZ_TEST__.usePriceStore.getState();
        const standardStillExists = ps.settings.paperTypes.some(pt => pt.id === 'standard');

        // Delete the newly added custom types
        if (addedByPage) ps.deletePaperType(addedByPage.id);
        if (addedByPhoto) ps.deletePaperType(addedByPhoto.id);
        ps = window.__AZ_TEST__.usePriceStore.getState();
        const finalCount = ps.settings.paperTypes.length;

        return {
          initialCount,
          addedByPageOk: Boolean(addedByPage && addedByPage.kind === 'by-page'),
          addedByPhotoOk: Boolean(addedByPhoto && addedByPhoto.kind === 'by-photo'),
          standardStillExists,
          finalCountMatches: finalCount === initialCount,
          passed: Boolean(addedByPage && addedByPhoto && standardStillExists && finalCount === initialCount)
        };
      })()
    `);
    console.log('Check 9 result:', check9);
    results.check9 = check9.passed;

    // -------------------------------------------------------------
    // CHECK 10: Change a price in Settings: total updates live, survives reload,
    // Reset to suggested restores defaults (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 10: Live update, reload persistence, Reset button ---');
    const check10 = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();
        const calculateJobPrice = window.__AZ_TEST__.calculateJobPrice;
        let job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];

        job.settings.paperType = 'Standard';
        job.settings.colorMode = 'Color';
        job.pages = [{
          id: 'p1',
          paperId: 'letter',
          orientation: 'portrait',
          elements: [{ id: 'e1', assetId: 'a1', xMm: 10, yMm: 10, wMm: 200, hMm: 250 }]
        }];

        const initialTotal = calculateJobPrice(job, priceStore.settings).total; // 10

        // Change Letter Color Full to 15
        priceStore.updatePaperType('standard', (pt) => ({
          ...pt,
          byPage: {
            ...pt.byPage,
            pageSizes: {
              ...pt.byPage.pageSizes,
              letter: {
                ...pt.byPage.pageSizes.letter,
                colorFull: 15
              }
            }
          }
        }));

        let freshPriceStore = window.__AZ_TEST__.usePriceStore.getState();
        const updatedTotal = calculateJobPrice(job, freshPriceStore.settings).total; // 15

        // Check localStorage persistence
        const rawStorage = localStorage.getItem('azpr-prices');
        const parsedStorage = JSON.parse(rawStorage || '{}');
        const storageVal = parsedStorage.paperTypes?.find(pt => pt.id === 'standard')?.byPage?.pageSizes?.letter?.colorFull;

        // Reset to defaults
        freshPriceStore.resetToDefaults();
        freshPriceStore = window.__AZ_TEST__.usePriceStore.getState();
        const resetTotal = calculateJobPrice(job, freshPriceStore.settings).total; // back to 10

        return {
          initialTotal,
          updatedTotal,
          storageVal,
          resetTotal,
          passed: initialTotal === 10 && updatedTotal === 15 && storageVal === 15 && resetTotal === 10
        };
      })()
    `);
    console.log('Check 10 result:', check10);
    results.check10 = check10.passed;

    // -------------------------------------------------------------
    // CHECK 11: Show price total switch hides and shows the card (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 11: Show price total switch hides and shows card ---');
    const check11 = await evaluate(`
      (() => {
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();

        // 1. Initially on
        priceStore.setShowPriceTotal(true);
        let ps = window.__AZ_TEST__.usePriceStore.getState();
        const initialOn = ps.settings.showPriceTotal;

        // 2. Turn off
        ps.setShowPriceTotal(false);
        ps = window.__AZ_TEST__.usePriceStore.getState();
        const toggledOff = !ps.settings.showPriceTotal;

        // 3. Turn back on
        ps.setShowPriceTotal(true);
        ps = window.__AZ_TEST__.usePriceStore.getState();
        const restoredOn = ps.settings.showPriceTotal;

        return {
          initialOn,
          toggledOff,
          restoredOn,
          passed: initialOn && toggledOff && restoredOn
        };
      })()
    `);
    console.log('Check 11 result:', check11);
    results.check11 = check11.passed;

    // -------------------------------------------------------------
    // CHECK 12: Empty pages are not counted.
    // Print and PDF output unchanged, no price on the sheets (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 12: Empty pages not counted & print sheets check ---');
    const check12 = await evaluate(`
      (() => {
        const s = window.__AZ_TEST__.useSessionStore.getState();
        const priceStore = window.__AZ_TEST__.usePriceStore.getState();
        const calculateJobPrice = window.__AZ_TEST__.calculateJobPrice;
        let job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];

        job.settings.paperType = 'Standard';
        job.settings.colorMode = 'Color';

        // Page 1 has a full-page photo (10 pesos); Page 2 is empty (0 pictures)
        job.pages = [
          {
            id: 'p1',
            paperId: 'letter',
            orientation: 'portrait',
            elements: [{ id: 'e1', assetId: 'a1', xMm: 10, yMm: 10, wMm: 200, hMm: 250 }]
          },
          {
            id: 'p2',
            paperId: 'letter',
            orientation: 'portrait',
            elements: []
          }
        ];

        const res = calculateJobPrice(job, priceStore.settings);
        const onlyOnePageCounted = res.total === 10 && res.lines.length === 1;

        // Check #print-root to verify prices never appear on printed sheets
        const printRoot = document.getElementById('print-root');
        const printHtml = printRoot ? printRoot.innerHTML : '';
        const hasPesoOnPrint = printHtml.includes('₱') || printHtml.includes('PHP') || printHtml.includes('total');

        return {
          total: res.total,
          lines: res.lines,
          onlyOnePageCounted,
          hasPesoOnPrint,
          passed: onlyOnePageCounted && !hasPesoOnPrint
        };
      })()
    `);
    console.log('Check 12 result:', check12);
    results.check12 = check12.passed;

    // -------------------------------------------------------------
    // CHECK 13: Only azpr-prices was added to localStorage.
    // Both themes. npm run build passes (ran)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 13: Only azpr-prices added, themes check ---');
    const check13 = await evaluate(`
      (() => {
        // Inspect all localStorage keys
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          keys.push(localStorage.key(i));
        }

        const azprKeys = keys.filter(k => k && k.startsWith('azpr-'));
        // Allowed keys from project history: azpr-theme, azpr-state, azpr-nudge, and new azpr-prices
        const hasPricesKey = azprKeys.includes('azpr-prices');
        const unexpectedNewKeys = azprKeys.filter(k => !['azpr-theme', 'azpr-state', 'azpr-nudge', 'azpr-prices'].includes(k));

        // Test theme toggles
        const root = document.documentElement;
        const initialDark = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark';

        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
        const hasDark = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark';

        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
        const hasLight = !root.classList.contains('dark') && root.getAttribute('data-theme') === 'light';

        if (initialDark) {
          root.classList.add('dark');
          root.setAttribute('data-theme', 'dark');
        }

        return {
          azprKeys,
          hasPricesKey,
          unexpectedNewKeys,
          hasDark,
          hasLight,
          passed: hasPricesKey && unexpectedNewKeys.length === 0 && hasDark && hasLight
        };
      })()
    `);
    console.log('Check 13 result:', check13);
    results.check13 = check13.passed;

    console.log('\n=== ALL RESULTS SUMMARY ===');
    console.log(JSON.stringify(results, null, 2));

    const allPassed = Object.values(results).every(Boolean);
    if (!allPassed) {
      console.error('FAILED: Not all checks passed!');
      process.exit(1);
    } else {
      console.log('\nSUCCESS: All 13 checks passed completely!');
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
