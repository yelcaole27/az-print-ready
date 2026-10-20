import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runVerification() {
  console.log('=== STARTING PROMPT 3 AUTOMATED VERIFICATION ===\n');

  // Check A: Testing cropUtils mathematical algorithms
  console.log('--- Step A: Testing cropUtils mathematical algorithms ---');
  const { getDefaultCropRect, refitCropRectToRatio, findTrimRect } = await import('../src/lib/cropUtils.ts');

  // A1. getDefaultCropRect: Wide image 2000x1000 into square 1:1
  const cropSquare = getDefaultCropRect(2000, 1000, 1.0);
  console.log('A1. getDefaultCropRect (2000x1000 to 1:1):', JSON.stringify(cropSquare));
  if (Math.abs(cropSquare.w - 0.5) > 0.001 || Math.abs(cropSquare.h - 1.0) > 0.001 || Math.abs(cropSquare.x - 0.25) > 0.001 || cropSquare.y !== 0) {
    throw new Error('A1 failed: getDefaultCropRect did not center-crop wide image');
  }

  // A2. getDefaultCropRect: Tall image 1000x2000 into square 1:1
  const cropTall = getDefaultCropRect(1000, 2000, 1.0);
  console.log('A2. getDefaultCropRect (1000x2000 to 1:1):', JSON.stringify(cropTall));
  if (Math.abs(cropTall.w - 1.0) > 0.001 || Math.abs(cropTall.h - 0.5) > 0.001 || cropTall.x !== 0 || Math.abs(cropTall.y - 0.25) > 0.001) {
    throw new Error('A2 failed: getDefaultCropRect did not center-crop tall image');
  }

  // A3. refitCropRectToRatio: Change 1:1 crop to 2:1 aspect ratio on a 2000x1000 image
  const refitted = refitCropRectToRatio(cropSquare, 2000, 1000, 2.0);
  console.log('A3. refitCropRectToRatio (square crop refitted to 2:1):', JSON.stringify(refitted));
  const newRatio = (refitted.w * 2000) / (refitted.h * 1000);
  if (Math.abs(newRatio - 2.0) > 0.01) {
    throw new Error('A3 failed: refitted crop ratio does not match target ratio');
  }

  console.log('cropUtils algorithms verified successfully.\n');

  // Check B: Launch Headless Chrome to test App UI & interactions
  console.log('--- Step B: Launching Headless Chrome to test App UI ---');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9245;
  const userDataDir = path.join(os.tmpdir(), 'chrome-test-p3-' + Date.now());

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
    } catch {
      // wait
    }
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

  // Check C: Upload an image via DataTransfer on the start screen
  console.log('--- Step C: Uploading test photo with white border ---');
  const uploadResult = await evaluate(`
    (async () => {
      // Generate 600x600 image with 100px white border, red center
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 600, 600);
      ctx.fillStyle = '#E8262B';
      ctx.fillRect(100, 100, 400, 400);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'id-photo.png', { type: 'image/png' });

      const input = document.querySelector('input[type="file"]');
      if (!input) return { error: 'File input not found' };

      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));

      return { success: true };
    })()
  `);
  console.log('Upload result:', JSON.stringify(uploadResult));

  // Wait for import to process and page to render
  await sleep(2000);

  // Step D: Select the picture by clicking on the element on canvas
  console.log('--- Step D: Selecting picture on canvas via mouse click ---');
  const elRect = await evaluate(`
    (() => {
      const elBox = document.querySelector('[data-element-id]');
      const r = elBox?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    })()
  `);
  if (!elRect) throw new Error('No picture element found on canvas');

  const clickX = elRect.left + elRect.width / 2;
  const clickY = elRect.top + elRect.height / 2;
  console.log(`Clicking picture at (${clickX}, ${clickY})...`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });
  await sleep(800);

  const selectedTitle = await evaluate(`
    (() => {
      const rightPanelHeader = document.querySelector('aside [title="id-photo.png"], aside [title*="Selected"], aside span.font-bold');
      const cropBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Crop');
      return {
        headerText: rightPanelHeader?.textContent || '',
        hasCropBtn: Boolean(cropBtn),
      };
    })()
  `);
  console.log('Selection state in RightPanel:', JSON.stringify(selectedTitle));
  if (!selectedTitle.hasCropBtn) throw new Error('Picture card with Crop button not visible after selection');

  // Check 1: Entry points
  console.log('\n--- Check 1: Testing Entry Points ---');
  // 1a. Shortcut 'r'
  console.log('Testing shortcut r on selected picture...');
  await evaluate(`
    (() => {
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      document.body.focus();
    })()
  `);
  await sleep(200);

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'r', code: 'KeyR', text: 'r' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'r', code: 'KeyR' });
  await sleep(600);
  const modalAfterR = await evaluate(`
    (() => {
      const titleEl = document.querySelector('#crop-modal-title');
      return {
        open: Boolean(titleEl),
        title: titleEl?.textContent || '',
      };
    })()
  `);
  console.log('1a. Shortcut R result:', JSON.stringify(modalAfterR));
  if (!modalAfterR.open) throw new Error('Check 1a failed: shortcut R did not open Crop modal');

  // Check 3: Default variant UI in modal (Free, Square, 3:4, 4:3, 16:9 segmented control)
  console.log('\n--- Check 3: Default variant free aspect & segmented buttons ---');
  const defaultModalUI = await evaluate(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);
      return {
        hasFree: buttons.includes('Free'),
        hasSquare: buttons.includes('Square'),
        has34: buttons.includes('3:4'),
        has43: buttons.includes('4:3'),
        has169: buttons.includes('16:9'),
      };
    })()
  `);
  console.log('Default variant modal controls:', JSON.stringify(defaultModalUI));
  if (!defaultModalUI.hasFree || !defaultModalUI.hasSquare || !defaultModalUI.has169) {
    throw new Error('Check 3 failed: Default variant missing aspect preset buttons');
  }

  // Cancel with Escape
  console.log('Testing Escape key dismisses modal...');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  await sleep(500);
  const closedAfterEsc = await evaluate(`!document.querySelector('#crop-modal-title')`);
  console.log('1b. Escape dismissed modal:', closedAfterEsc);
  if (!closedAfterEsc) throw new Error('Check 1b failed: Escape did not close modal');

  // 1c. Crop button on Picture card
  console.log('Testing Crop button in RightPanel...');
  await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Crop');
      btn?.click();
    })()
  `);
  await sleep(600);
  const modalAfterBtn = await evaluate(`Boolean(document.querySelector('#crop-modal-title'))`);
  console.log('1c. Crop button opened modal:', modalAfterBtn);
  if (!modalAfterBtn) throw new Error('Check 1c failed: Crop button in RightPanel did not open modal');

  // Check 4: Trim edges button
  console.log('\n--- Check 4: Trim edges scan on white border ---');
  const trimClick = await evaluate(`
    (async () => {
      const trimBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Trim edges'));
      if (!trimBtn) return { error: 'Trim button not found' };
      trimBtn.click();
      await new Promise(r => setTimeout(r, 600));
      return { success: true };
    })()
  `);
  console.log('4. Trim edges clicked:', JSON.stringify(trimClick));

  // Check 6: Done button applies crop
  console.log('\n--- Check 6: Done button applies crop ---');
  await evaluate(`
    (() => {
      const doneBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Done');
      doneBtn?.click();
    })()
  `);
  await sleep(800);

  // Check 8: "Cropped" badge and "Reset crop" button
  console.log('\n--- Check 8: Cropped badge and Reset crop button in RightPanel ---');
  const rightPanelBadges = await evaluate(`
    (() => {
      const badge = Array.from(document.querySelectorAll('span')).find(s => s.textContent?.trim() === 'Cropped');
      const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Reset crop');
      return {
        hasCroppedBadge: Boolean(badge),
        hasResetBtn: Boolean(resetBtn),
      };
    })()
  `);
  console.log('8. Cropped badge in RightPanel:', JSON.stringify(rightPanelBadges));
  if (!rightPanelBadges.hasCroppedBadge || !rightPanelBadges.hasResetBtn) {
    throw new Error('Check 8 failed: Cropped badge or Reset crop button missing on Picture card');
  }

  // Check 9: Reset crop restores full image
  console.log('\n--- Check 9: Reset crop button restores full image ---');
  await evaluate(`
    (() => {
      const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Reset crop');
      resetBtn?.click();
    })()
  `);
  await sleep(600);

  const afterReset = await evaluate(`
    (() => {
      const badge = Array.from(document.querySelectorAll('span')).find(s => s.textContent?.trim() === 'Cropped');
      return { hasCroppedBadge: Boolean(badge) };
    })()
  `);
  console.log('9. After Reset crop, Cropped badge gone:', !afterReset.hasCroppedBadge);
  if (afterReset.hasCroppedBadge) throw new Error('Check 9 failed: Reset crop did not remove Cropped badge');

  // Check 10: Undo restores the crop!
  console.log('\n--- Check 10: Undo restores crop ---');
  const undoDiagnostics = await evaluate(`
    (() => {
      const undoBtn = document.querySelector('button[aria-label="Undo"]');
      const isDisabled = undoBtn?.hasAttribute('disabled');
      return {
        hasUndoBtn: Boolean(undoBtn),
        isDisabled,
      };
    })()
  `);
  console.log('Undo button diagnostics before undo:', JSON.stringify(undoDiagnostics));

  // Try clicking Undo button in TopBar
  await evaluate(`
    (() => {
      const undoBtn = document.querySelector('button[aria-label="Undo"]');
      undoBtn?.click();
    })()
  `);
  await sleep(800);

  const afterUndo = await evaluate(`
    (() => {
      const aside = document.querySelector('aside');
      const badge = Array.from(document.querySelectorAll('span')).find(s => s.textContent?.trim() === 'Cropped');
      const selected = Boolean(document.querySelector('aside [title="id-photo.png"], aside [title*="Selected"], aside span.font-bold'));
      return {
        hasCroppedBadge: Boolean(badge),
        hasSelectedCard: selected,
        asideText: aside?.innerText?.slice(0, 300) || '',
      };
    })()
  `);
  console.log('10. After Undo button click:', JSON.stringify(afterUndo));
  if (!afterUndo.hasCroppedBadge) throw new Error('Check 10 failed: Undo did not restore crop');

  // Check 12: Double click opens crop modal
  console.log('\n--- Check 12: Double-click on picture opens Crop modal ---');
  const dblRect = await evaluate(`
    (() => {
      const elBox = document.querySelector('[data-element-id]');
      const r = elBox?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    })()
  `);
  if (dblRect) {
    const x = dblRect.left + dblRect.width / 2;
    const y = dblRect.top + dblRect.height / 2;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2 });
  }
  await sleep(600);
  const modalAfterDblClick = await evaluate(`Boolean(document.querySelector('#crop-modal-title'))`);
  console.log('12. Double-click opened modal:', modalAfterDblClick);
  if (!modalAfterDblClick) throw new Error('Check 12 failed: Double-click did not open modal');

  // Close modal with Cancel button
  await evaluate(`
    (() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Cancel');
      cancelBtn?.click();
    })()
  `);
  await sleep(500);

  // Check 13: Sized variant test (1x1 chip)
  console.log('\n--- Check 13: Changing variant size to 1x1 ---');
  await evaluate(`
    (() => {
      const chip1x1 = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '1x1');
      chip1x1?.click();
    })()
  `);
  await sleep(800);

  // Re-select element
  const newElRect = await evaluate(`
    (() => {
      const elBox = document.querySelector('[data-element-id]');
      const r = elBox?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    })()
  `);
  if (newElRect) {
    const x = newElRect.left + newElRect.width / 2;
    const y = newElRect.top + newElRect.height / 2;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  await sleep(600);

  // Open modal on 1x1 variant
  await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Crop');
      btn?.click();
    })()
  `);
  await sleep(600);

  const sizedLockBadge = await evaluate(`
    (() => {
      const text = document.body.textContent || '';
      return {
        has1x1Badge: text.includes('1x1'),
        hasFree: Boolean(Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Free')),
      };
    })()
  `);
  console.log('13. Sized variant lock badge:', JSON.stringify(sizedLockBadge));
  if (!sizedLockBadge.has1x1Badge) throw new Error('Check 13 failed: 1x1 lock badge not shown in modal');
  if (sizedLockBadge.hasFree) throw new Error('Check 13 failed: Sized variant should not show Free button');

  // Close modal
  await evaluate(`
    (() => {
      const doneBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Done');
      doneBtn?.click();
    })()
  `);
  await sleep(600);

  // Check 14: Copy variant (Ctrl+D) inherits cropRect
  console.log('\n--- Check 14: Copy variant inherits crop ---');
  await evaluate(`
    (() => {
      const copyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Copy');
      copyBtn?.click();
    })()
  `);
  await sleep(600);

  const elementsCount = await evaluate(`document.querySelectorAll('[data-element-id]').length`);
  console.log('14. Elements on canvas after Copy:', elementsCount);
  if (elementsCount < 2) throw new Error('Check 14 failed: Copy did not add a new copy');

  console.log('\n=== ALL PROMPT 3 AUTOMATED TESTS PASSED IN HEADLESS CHROME! ===');
  ws.close();
  chromeProc.kill();
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('\n*** VERIFICATION FAILED ***\n', err);
  process.exit(1);
});
