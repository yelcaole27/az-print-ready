async function run() {
  const res = await fetch('http://127.0.0.1:9227/json');
  const list = await res.json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d.result);
      pending.delete(d.id);
    }
  };
  await new Promise(r => ws.onopen = r);
  function call(method, params = {}) {
    return new Promise(r => {
      const msgId = id++;
      pending.set(msgId, r);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  async function evalExpr(expr) {
    const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  }
  const domInfo = await evalExpr(`(() => {
    return {
      elementBoxes: Array.from(document.querySelectorAll('[data-element-id]')).map(el => ({
        id: el.getAttribute('data-element-id'),
        rect: el.getBoundingClientRect(),
      })),
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean),
      h2s: Array.from(document.querySelectorAll('h2')).map(h => h.textContent?.trim()),
    };
  })()`);
  console.log(JSON.stringify(domInfo, null, 2));
  ws.close();
}
run().catch(console.error);
