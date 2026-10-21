import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== STARTING PROMPT 9 AUTOMATED VERIFICATION ===\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9268;
  const userDataDir = path.join(os.tmpdir(), 'chrome-test-p9-' + Date.now());

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

  for (let i = 0; i < 30; i++) {
    const ready = await evaluate(`typeof window.__AZ_TEST__ !== 'undefined'`);
    if (ready) break;
    await sleep(200);
  }

  // Ensure there is a picture in active job so PRICE card is visible
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

  const results = {};

  // -------------------------------------------------------------
  // CHECK 1: Settings opens on General and shows no price controls (ran)
  // -------------------------------------------------------------
  console.log('--- CHECK 1: Settings opens on General and shows no price controls ---');
  await evaluate(`
    (() => {
      const gearBtn = document.querySelector('button[aria-label="Settings"]');
      if (gearBtn) gearBtn.click();
      else window.__AZ_TEST__.useUiStore.getState().setSettingsOpen(true, 'general');
    })()
  `);
  await sleep(200);

  const check1 = await evaluate(`
    (() => {
      const freshUi = window.__AZ_TEST__.useUiStore.getState();
      const isGeneral = freshUi.settingsTab === 'general' && freshUi.isSettingsOpen === true;

      const genTab = document.getElementById('tab-general');
      const genSelected = genTab?.getAttribute('aria-selected') === 'true';

      const panelGen = document.getElementById('panel-general');
      const panelPrices = document.getElementById('panel-prices');

      // General panel exists and has General controls
      const hasUnits = panelGen?.textContent.includes('Units');
      const hasSpace = panelGen?.textContent.includes('Space');
      const hasCutLines = panelGen?.textContent.includes('Cut lines');
      const hasBackAlign = panelGen?.textContent.includes('Back alignment');
      const hasText = panelGen?.textContent.includes('Text');
      const hasStartOver = panelGen?.textContent.includes('Start over');

      // No price controls inside panel-general
      const hasShowPriceTotalInGen = panelGen?.textContent.includes('Show price total');
      const hasPaperTypesInGen = panelGen?.textContent.includes('Paper Types');

      return {
        isGeneral,
        genSelected,
        hasPanelGen: !!panelGen,
        panelPricesAbsent: !panelPrices,
        hasUnits,
        hasSpace,
        hasCutLines,
        hasBackAlign,
        hasText,
        hasStartOver,
        hasShowPriceTotalInGen,
        hasPaperTypesInGen,
        passed: isGeneral && genSelected && !!panelGen && !panelPrices && hasUnits && hasSpace && hasCutLines && hasBackAlign && hasText && hasStartOver && !hasShowPriceTotalInGen && !hasPaperTypesInGen
      };
    })()
  `);
  console.log('Check 1 result:', check1);
  results.check1 = check1.passed;

  // -------------------------------------------------------------
  // CHECK 2: The Prices tab shows all price controls, live update (ran)
  // -------------------------------------------------------------
  console.log('\n--- CHECK 2: Prices tab controls and live price update ---');
  await evaluate(`
    (() => {
      const pricesTab = document.getElementById('tab-prices');
      if (pricesTab) pricesTab.click();
      else window.__AZ_TEST__.useUiStore.getState().setSettingsTab('prices');
    })()
  `);
  await sleep(200);

  const check2 = await evaluate(`
    (async () => {
      const freshUi = window.__AZ_TEST__.useUiStore.getState();
      const isPrices = freshUi.settingsTab === 'prices';

      const pricesTab = document.getElementById('tab-prices');
      const pricesSelected = pricesTab?.getAttribute('aria-selected') === 'true';

      const panelPrices = document.getElementById('panel-prices');
      const hasShowPriceTotal = panelPrices?.textContent.includes('Show price total');
      const hasPaperTypes = panelPrices?.textContent.includes('Paper Types');
      const hasReset = panelPrices?.textContent.includes('Reset to suggested');

      // Click "Photo" pill to verify ID photo packages in by-photo view
      const photoPill = Array.from(panelPrices?.querySelectorAll('button') || []).find(b => b.textContent.trim() === 'Photo');
      if (photoPill) photoPill.click();
      await new Promise(r => setTimeout(r, 80));

      const hasPackages = panelPrices?.textContent.includes('ID photo packages');

      // Click "Standard" pill back
      const stdPill = Array.from(panelPrices?.querySelectorAll('button') || []).find(b => b.textContent.trim() === 'Standard');
      if (stdPill) stdPill.click();
      await new Promise(r => setTimeout(r, 80));

      // Live update test: change Wallet photo size from 10 to 5 (under full-page cap of 10)
      const priceStore = window.__AZ_TEST__.usePriceStore.getState();
      priceStore.updatePaperType('standard', (pt) => ({
        ...pt,
        byPage: {
          ...pt.byPage,
          photoSizes: {
            ...pt.byPage.photoSizes,
            wallet: 5
          }
        }
      }));
      await new Promise(r => setTimeout(r, 100));

      // Check live total in PRICE card (span followed by 'total' label)
      const totalSpan = Array.from(document.querySelectorAll('span')).find(s => s.nextElementSibling?.textContent === 'total') || document.querySelector('.font-heading.font-extrabold');
      const liveTotalText = totalSpan?.textContent?.trim();

      // Reset back
      priceStore.resetToDefaults();
      await new Promise(r => setTimeout(r, 100));
      const resetTotalText = totalSpan?.textContent?.trim();

      return {
        isPrices,
        pricesSelected,
        hasPanelPrices: !!panelPrices,
        hasShowPriceTotal,
        hasPaperTypes,
        hasReset,
        hasPackages,
        liveTotalText,
        resetTotalText,
        passed: isPrices && pricesSelected && !!panelPrices && hasShowPriceTotal && hasPaperTypes && hasReset && hasPackages && liveTotalText === '₱5' && resetTotalText === '₱10'
      };
    })()
  `);
  console.log('Check 2 result:', check2);
  results.check2 = check2.passed;

  // -------------------------------------------------------------
  // CHECK 3: Edit prices opens Prices tab; gear opens General (ran)
  // -------------------------------------------------------------
  console.log('\n--- CHECK 3: Edit prices button & gear icon tab routing ---');
  const check3 = await evaluate(`
    (async () => {
      const ui = window.__AZ_TEST__.useUiStore.getState();

      // 1. Close settings
      ui.setSettingsOpen(false);
      await new Promise(r => setTimeout(r, 100));

      // 2. Click "Edit prices" button in PRICE card
      const editPricesBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Edit prices');
      if (!editPricesBtn) {
        return { error: 'Edit prices button not found in DOM', passed: false };
      }
      editPricesBtn.click();
      await new Promise(r => setTimeout(r, 100));

      const stateAfterEditPrices = window.__AZ_TEST__.useUiStore.getState();
      const openedOnPrices = stateAfterEditPrices.isSettingsOpen === true && stateAfterEditPrices.settingsTab === 'prices';

      // 3. Close settings
      stateAfterEditPrices.setSettingsOpen(false);
      await new Promise(r => setTimeout(r, 100));

      // 4. Click gear icon in TopBar
      const gearBtn = document.querySelector('button[aria-label="Settings"]');
      if (!gearBtn) {
        return { error: 'Gear button not found in DOM', passed: false };
      }
      gearBtn.click();
      await new Promise(r => setTimeout(r, 100));

      const stateAfterGear = window.__AZ_TEST__.useUiStore.getState();
      const openedOnGeneral = stateAfterGear.isSettingsOpen === true && stateAfterGear.settingsTab === 'general';

      return {
        openedOnPrices,
        openedOnGeneral,
        passed: openedOnPrices && openedOnGeneral
      };
    })()
  `);
  console.log('Check 3 result:', check3);
  results.check3 = check3.passed;

  // -------------------------------------------------------------
  // CHECK 4: Modal dimensions stable & scroll resets (ran)
  // -------------------------------------------------------------
  console.log('\n--- CHECK 4: Modal size stability and scroll reset ---');
  await evaluate(`
    (() => {
      const ui = window.__AZ_TEST__.useUiStore.getState();
      ui.setSettingsOpen(true, 'general');
    })()
  `);
  await sleep(150);

  const check4 = await evaluate(`
    (async () => {
      const modalEl = document.querySelector('[role="dialog"]') || document.getElementById('settings-modal-title')?.closest('.bg-surface');
      if (!modalEl) return { error: 'Modal element not found', passed: false };

      const rectGen = modalEl.getBoundingClientRect();

      // Switch to Prices
      const pricesTabBtn = document.getElementById('tab-prices');
      pricesTabBtn.click();
      await new Promise(r => setTimeout(r, 100));
      const rectPrices = modalEl.getBoundingClientRect();

      // Switch back to General
      const genTabBtn = document.getElementById('tab-general');
      genTabBtn.click();
      await new Promise(r => setTimeout(r, 100));
      const rectGenAgain = modalEl.getBoundingClientRect();

      const widthStable = Math.abs(rectGen.width - rectPrices.width) < 1 && Math.abs(rectGen.width - rectGenAgain.width) < 1;
      const heightStable = Math.abs(rectGen.height - rectPrices.height) < 1 && Math.abs(rectGen.height - rectGenAgain.height) < 1;

      // Scroll test: scroll inside General tab
      const scrollContainer = modalEl.querySelector('.overflow-y-auto');
      let scrollResetPassed = false;
      if (scrollContainer) {
        scrollContainer.scrollTop = 150;
        await new Promise(r => setTimeout(r, 50));

        // Switch to Prices
        pricesTabBtn.click();
        await new Promise(r => setTimeout(r, 50));
        const topAfterSwitch = scrollContainer.scrollTop;

        scrollResetPassed = topAfterSwitch === 0;
      }

      return {
        rectGen: { w: rectGen.width, h: rectGen.height },
        rectPrices: { w: rectPrices.width, h: rectPrices.height },
        rectGenAgain: { w: rectGenAgain.width, h: rectGenAgain.height },
        widthStable,
        heightStable,
        scrollResetPassed,
        passed: widthStable && heightStable && scrollResetPassed
      };
    })()
  `);
  console.log('Check 4 result:', check4);
  results.check4 = check4.passed;

  // -------------------------------------------------------------
  // CHECK 5: Every General setting still works (ran)
  // -------------------------------------------------------------
  console.log('\n--- CHECK 5: General settings functionality ---');
  const check5 = await evaluate(`
    (() => {
      const s = window.__AZ_TEST__.useSessionStore.getState();
      const ui = window.__AZ_TEST__.useUiStore.getState();
      let job = s.jobs.find(j => j.id === s.activeJobId) || s.jobs[0];

      // Switch to General tab
      ui.setSettingsTab('general');

      // 1. Units: change to cm
      s.setUnit('cm');
      const fresh1 = window.__AZ_TEST__.useSessionStore.getState();
      const unitUpdated = fresh1.jobs.find(j => j.id === job.id).settings.unit === 'cm';

      // 2. Gap (space between): change to 4 mm
      s.updateSettings(job.id, { gapMm: 4 });
      const fresh2 = window.__AZ_TEST__.useSessionStore.getState();
      const gapUpdated = fresh2.jobs.find(j => j.id === job.id).settings.gapMm === 4;

      // 3. Margin (space around): change to 10 mm
      s.updateSettings(job.id, { marginMm: 10 });
      const fresh3 = window.__AZ_TEST__.useSessionStore.getState();
      const marginUpdated = fresh3.jobs.find(j => j.id === job.id).settings.marginMm === 10;

      // 4. Cut lines: change to outline
      s.updateSettings(job.id, { cutStyle: 'outline' });
      const fresh4 = window.__AZ_TEST__.useSessionStore.getState();
      const cutUpdated = fresh4.jobs.find(j => j.id === job.id).settings.cutStyle === 'outline';

      // Reset to original values
      s.setUnit('in');
      s.updateSettings(job.id, { gapMm: 0, marginMm: 6.35, cutStyle: 'none' });

      return {
        unitUpdated,
        gapUpdated,
        marginUpdated,
        cutUpdated,
        passed: unitUpdated && gapUpdated && marginUpdated && cutUpdated
      };
    })()
  `);
  console.log('Check 5 result:', check5);
  results.check5 = check5.passed;

  // -------------------------------------------------------------
  // CHECK 6: Keyboard navigation & Esc closes (ran)
  // -------------------------------------------------------------
  console.log('\n--- CHECK 6: Keyboard tabs navigation and Esc closes ---');
  await evaluate(`
    (() => {
      const ui = window.__AZ_TEST__.useUiStore.getState();
      ui.setSettingsOpen(true, 'general');
    })()
  `);
  await sleep(150);

  const check6 = await evaluate(`
    (async () => {
      const genTab = document.getElementById('tab-general');
      const pricesTab = document.getElementById('tab-prices');
      genTab.focus();

      // Dispatch ArrowRight
      genTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await new Promise(r => setTimeout(r, 80));
      const uiAfterRight = window.__AZ_TEST__.useUiStore.getState();
      const rightSwitched = uiAfterRight.settingsTab === 'prices';

      // Dispatch ArrowLeft
      pricesTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await new Promise(r => setTimeout(r, 80));
      const uiAfterLeft = window.__AZ_TEST__.useUiStore.getState();
      const leftSwitched = uiAfterLeft.settingsTab === 'general';

      // Dispatch Escape on document
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 80));
      const uiAfterEsc = window.__AZ_TEST__.useUiStore.getState();
      const escClosed = uiAfterEsc.isSettingsOpen === false;

      return {
        rightSwitched,
        leftSwitched,
        escClosed,
        passed: rightSwitched && leftSwitched && escClosed
      };
    })()
  `);
  console.log('Check 6 result:', check6);
  results.check6 = check6.passed;

  // -------------------------------------------------------------
  // CHECK 7: Themes and local storage keys (ran)
  // -------------------------------------------------------------
  console.log('\n--- CHECK 7: Both themes inspection and no new storage keys ---');
  const check7 = await evaluate(`
    (() => {
      const ui = window.__AZ_TEST__.useUiStore.getState();
      ui.setSettingsOpen(true, 'general');

      // Check dark theme
      document.documentElement.dataset.theme = 'dark';
      const darkBg = window.getComputedStyle(document.body).backgroundColor;

      // Check light theme
      document.documentElement.dataset.theme = 'light';
      const lightBg = window.getComputedStyle(document.body).backgroundColor;

      // Restore dark
      document.documentElement.dataset.theme = 'dark';

      // Check localStorage keys (no new settings tab key)
      const allKeys = Object.keys(localStorage);
      const hasTabKey = allKeys.some(k => k.includes('tab') || k.includes('settings-tab'));

      return {
        darkBg,
        lightBg,
        hasTabKey,
        passed: darkBg !== lightBg && !hasTabKey
      };
    })()
  `);
  console.log('Check 7 result:', check7);
  results.check7 = check7.passed;

  console.log('\n=== ALL RESULTS SUMMARY ===');
  console.log(JSON.stringify(results, null, 2));

  ws.close();
  chromeProc.kill();

  const allPassed = Object.values(results).every(Boolean);
  if (!allPassed) {
    console.error('FAILED: Not all checks passed!');
    process.exit(1);
  }
  console.log('\nSUCCESS: All Prompt 9 checks passed completely!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
