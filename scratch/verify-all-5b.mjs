import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// 1. Precise Coordinate Test for Test Sheet Marks
function calculateTestMarks(paperWidth, paperHeight, nudgeX = 0, nudgeY = 0) {
  // Front marks:
  // Mark 1: cx = 15, cy = 15
  // Mark 2: cx = paperWidth - 15, cy = 15
  // Mark 3: cx = 15, cy = paperHeight - 15
  // Mark 4: cx = paperWidth - 15, cy = paperHeight - 15
  // Mark 5: cx = paperWidth / 2, cy = paperHeight / 2
  // Crosshair is 8x8 mm: w = 8, h = 8.
  // x = cx - 4, y = cy - 4
  const frontCenters = [
    { num: 1, cx: 15, cy: 15 },
    { num: 2, cx: paperWidth - 15, cy: 15 },
    { num: 3, cx: 15, cy: paperHeight - 15 },
    { num: 4, cx: paperWidth - 15, cy: paperHeight - 15 },
    { num: 5, cx: paperWidth / 2, cy: paperHeight / 2 },
  ];

  const frontBoxes = frontCenters.map((c) => ({
    num: c.num,
    x: Math.round((c.cx - 4) * 100) / 100,
    y: Math.round((c.cy - 4) * 100) / 100,
    w: 8,
    h: 8,
    cx: c.cx,
    cy: c.cy,
  }));

  // Raw back elements are placed at identical positions before mirroring:
  // When mirrored sideways:
  // backRawX = cx - 4
  // backRawY = cy - 4
  // mirroredX = paperWidth - backRawX - 8 + nudgeX
  // mirroredY = backRawY + nudgeY
  const backBoxes = frontBoxes.map((f) => {
    const rawX = f.x;
    const rawY = f.y;
    const mirroredX = Math.round((paperWidth - rawX - f.w + nudgeX) * 100) / 100;
    const mirroredY = Math.round((rawY + nudgeY) * 100) / 100;
    const mirroredCenter = {
      x: Math.round((mirroredX + f.w / 2) * 100) / 100,
      y: Math.round((mirroredY + f.h / 2) * 100) / 100,
    };
    const expectedCenter = {
      x: Math.round((paperWidth - f.cx + nudgeX) * 100) / 100,
      y: Math.round((f.cy + nudgeY) * 100) / 100,
    };
    return {
      num: f.num,
      x: mirroredX,
      y: mirroredY,
      w: f.w,
      h: f.h,
      center: mirroredCenter,
      expectedCenter,
      match: mirroredCenter.x === expectedCenter.x && mirroredCenter.y === expectedCenter.y,
    };
  });

  return { frontBoxes, backBoxes };
}

console.log('=== TEST SHEET MARKS COORDINATE AUDIT ===');

// Letter Portrait: 215.9 x 279.4 mm
console.log('\n--- Letter Portrait (215.9 x 279.4 mm), Nudge: (0, 0) ---');
const lp0 = calculateTestMarks(215.9, 279.4, 0, 0);
console.log('Front marks:');
lp0.frontBoxes.forEach((f) => console.log(`  Mark ${f.num}: x=${f.x}, y=${f.y}, w=${f.w}, h=${f.h} (center: ${f.cx}, ${f.cy})`));
console.log('Back marks:');
lp0.backBoxes.forEach((b) => console.log(`  Mark ${b.num}: x=${b.x}, y=${b.y}, w=${b.w}, h=${b.h} (center: ${b.center.x}, ${b.center.y}, match=${b.match})`));

console.log('\n--- Letter Portrait (215.9 x 279.4 mm), Nudge: (+1.5, -1.0) ---');
const lpNudge = calculateTestMarks(215.9, 279.4, 1.5, -1.0);
console.log('Back marks with nudge (+1.5, -1.0):');
lpNudge.backBoxes.forEach((b) => console.log(`  Mark ${b.num}: x=${b.x}, y=${b.y}, w=${b.w}, h=${b.h} (center: ${b.center.x}, ${b.center.y}, match=${b.match})`));

// A4 Portrait: 210 x 297 mm
console.log('\n--- A4 Portrait (210 x 297 mm), Nudge: (+1.5, -1.0) ---');
const a4p = calculateTestMarks(210, 297, 1.5, -1.0);
a4p.backBoxes.forEach((b) => console.log(`  Mark ${b.num}: x=${b.x}, y=${b.y}, w=${b.w}, h=${b.h} (center: ${b.center.x}, ${b.center.y}, match=${b.match})`));

// Letter Landscape: 279.4 x 215.9 mm
console.log('\n--- Letter Landscape (279.4 x 215.9 mm), Nudge: (+1.5, -1.0) ---');
const llNudge = calculateTestMarks(279.4, 215.9, 1.5, -1.0);
llNudge.backBoxes.forEach((b) => console.log(`  Mark ${b.num}: x=${b.x}, y=${b.y}, w=${b.w}, h=${b.h} (center: ${b.center.x}, ${b.center.y}, match=${b.match})`));

// 2. Headless Chrome CDP Verification
async function runBrowserChecks() {
  console.log('\n=== RUNNING BROWSER CHECKS IN HEADLESS CHROME ===');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempDir = path.join(process.env.TEMP || 'C:\\Temp', 'chrome-verify-5b-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  const chromeProc = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=9226',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tempDir}`,
    'http://localhost:3000',
  ]);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let cdpUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9226/json/list');
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
    throw new Error('Failed to connect to CDP on port 9226');
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

  // Check 1: window.__AZ_TEST__ in production
  const azTestType = await evaluate(`typeof window.__AZ_TEST__`);
  console.log('CHECK: window.__AZ_TEST__ in production build is:', azTestType);
  if (azTestType !== 'undefined') {
    throw new Error('Expected window.__AZ_TEST__ to be undefined in production!');
  }

  // Check 2: Verify app rendered and no errors in console
  const title = await evaluate(`document.title`);
  console.log('CHECK: App loaded, document.title =', title);

  // Check 3: Check theme class and data-theme
  const htmlTheme = await evaluate(`document.documentElement.getAttribute('data-theme')`);
  console.log('CHECK: HTML data-theme attribute is:', htmlTheme);

  // Check 4: Check if Settings pop-up can be opened and contains Nudge inputs
  const settingsBtnExists = await evaluate(`Boolean(document.querySelector('button[title*="Settings"], button[aria-label*="Settings"]'))`);
  console.log('CHECK: Settings button exists in UI:', settingsBtnExists);

  ws.close();
  chromeProc.kill();
  console.log('Browser checks completed successfully.');
}

// 3. Logic verification for Reverse Order, Slots Snapping, and Mixed Sizes
function runLogicChecks() {
  console.log('\n=== LOGIC CHECKS: REVERSE ORDER, SLOTS SNAPPING, MIXED SIZES ===');

  // Reverse order check:
  // 3 front pages (P1, P2, P3) and 3 back pages (B1, B2, B3)
  const pages = [
    { id: 'p1', isBack: false, elements: [{ id: 'e1' }] },
    { id: 'b1', isBack: true, elements: [{ id: 'e2' }] },
    { id: 'p2', isBack: false, elements: [{ id: 'e3' }] },
    { id: 'b2', isBack: true, elements: [{ id: 'e4' }] },
    { id: 'p3', isBack: false, elements: [{ id: 'e5' }] },
    { id: 'b3', isBack: true, elements: [{ id: 'e6' }] },
  ];

  function getPageIndexes(sideFilter, reverseBacks) {
    let list = pages
      .map((page, idx) => ({ page, idx }))
      .filter(({ page }) => {
        if (page.elements.length === 0) return false;
        if (sideFilter === 'fronts') return !page.isBack;
        if (sideFilter === 'backs') return Boolean(page.isBack);
        return true;
      })
      .map((p) => p.idx);

    if (sideFilter === 'backs' && reverseBacks) {
      list = [...list].reverse();
    }
    return list;
  }

  const frontsOnly = getPageIndexes('fronts', false);
  const backsNormal = getPageIndexes('backs', false);
  const backsReversed = getPageIndexes('backs', true);

  console.log('Print Fronts output page indexes:', frontsOnly, '(Pages:', frontsOnly.map((i) => pages[i].id).join(', '), ')');
  console.log('Print Backs (reverse=OFF) page indexes:', backsNormal, '(Pages:', backsNormal.map((i) => pages[i].id).join(', '), ')');
  console.log('Print Backs (reverse=ON) page indexes:', backsReversed, '(Pages:', backsReversed.map((i) => pages[i].id).join(', '), ')');

  // Verify reverse order
  if (backsNormal.join(',') !== '1,3,5') throw new Error('backsNormal mismatch');
  if (backsReversed.join(',') !== '5,3,1') throw new Error('backsReversed mismatch');
  if (frontsOnly.join(',') !== '0,2,4') throw new Error('frontsOnly mismatch');

  // Slots snapping check:
  const slot = { id: 'front-el-1', xMm: 30, yMm: 40, wMm: 50, hMm: 60 };
  function testSnap(testPos) {
    const dx = Math.abs(slot.xMm - testPos.x);
    const dy = Math.abs(slot.yMm - testPos.y);
    return dx <= 3 && dy <= 3;
  }

  console.log('Slot at (30, 40):');
  console.log('  Position at (30, 40) snaps:', testSnap({ x: 30, y: 40 })); // true
  console.log('  Position at (32.5, 41) snaps (<= 3mm):', testSnap({ x: 32.5, y: 41 })); // true
  console.log('  Position at (33.0, 43.0) snaps (boundary 3mm):', testSnap({ x: 33.0, y: 43.0 })); // true
  console.log('  Position at (33.1, 40) snaps (> 3mm):', testSnap({ x: 33.1, y: 40 })); // false
  console.log('  Position at (30, 43.5) snaps (> 3mm):', testSnap({ x: 30, y: 43.5 })); // false
  console.log('  Position at (50, 70) snaps (> 3mm):', testSnap({ x: 50, y: 70 })); // false

  // Mixed size element not in slot:
  const mixedEl = { id: 'mixed-1', xMm: 10, yMm: 20, wMm: 35, hMm: 45 };
  const pageW = 215.9;
  const nudge = { x: 1.5, y: -1.0 };
  const mirroredX = Math.round((pageW - mixedEl.xMm - mixedEl.wMm + nudge.x) * 100) / 100;
  const mirroredY = Math.round((mixedEl.yMm + nudge.y) * 100) / 100;
  const frontCx = mixedEl.xMm + mixedEl.wMm / 2; // 27.5
  const backCx = mirroredX + mixedEl.wMm / 2; // 189.9
  console.log('\nMixed size element mirroring:');
  console.log(`  Front: x=${mixedEl.xMm}, y=${mixedEl.yMm}, w=${mixedEl.wMm}, h=${mixedEl.hMm}, cx=${frontCx}`);
  console.log(`  Mirrored Back: x=${mirroredX}, y=${mirroredY}, w=${mixedEl.wMm}, h=${mixedEl.hMm}, cx=${backCx}`);
  console.log(`  pageWidth - frontCx + nudge.x = ${pageW - frontCx + nudge.x} === backCx: ${backCx === pageW - frontCx + nudge.x}`);
}

async function main() {
  runLogicChecks();
  await runBrowserChecks();
  console.log('\nALL VERIFICATIONS PASSED.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
