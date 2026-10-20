import { spawn } from 'child_process';
import path from 'path';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.resolve('scratch/chrome-test-profile-p3');
  const chromeProc = spawn(
    chromePath,
    [
      '--headless=new',
      '--remote-debugging-port=9228',
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
      const res = await fetch('http://127.0.0.1:9228/json');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        cdpUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
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
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result?.value;
  }

  await sleep(2000);

  // Upload an image
  await evaluate(`
    (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 400;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#E8262B'; ctx.fillRect(0, 0, 400, 400);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'photo.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector('input[type="file"]');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);

  await sleep(1500);

  // Check what happened to selection
  const state1 = await evaluate(`
    (() => {
      const elBox = document.querySelector('[data-element-id]');
      const r = elBox?.getBoundingClientRect();
      const rect = r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
      return {
        hasElBox: Boolean(elBox),
        rect,
        rightPanelH2: Array.from(document.querySelectorAll('aside h2, aside span')).map(s => s.textContent?.trim()).filter(Boolean).slice(0, 5),
      };
    })()
  `);
  console.log('State after upload:', JSON.stringify(state1, null, 2));

  // Now click using CDP Input.dispatchMouseEvent to simulate real user click on the center of elBox!
  const rect = state1.rect;
  if (rect) {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    console.log('Dispatching mouse click at:', x, y);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  await sleep(800);

  const state2 = await evaluate(`
    (() => {
      return {
        rightPanelTexts: Array.from(document.querySelectorAll('aside span, aside h2')).map(s => s.textContent?.trim()).filter(Boolean).slice(0, 10),
        cropBtn: Boolean(Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Crop')),
      };
    })()
  `);
  console.log('State after click:', JSON.stringify(state2, null, 2));

  ws.close();
  chromeProc.kill();
}

run().catch(console.error);
