'use strict';
const PORT = Number(process.env.CDP_PORT || 9310);
const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  });
  function send(method, params = {}) {
    const mid = ++id;
    return new Promise((resolve, reject) => {
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function navigate(rel) {
    const loaded = new Promise((resolve) => {
      const timer = setTimeout(resolve, 10000);
      const handler = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Page.loadEventFired') {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          resolve();
        }
      };
      ws.addEventListener('message', handler);
    });
    await send('Page.navigate', { url: `${BASE}/${rel}` });
    await loaded;
    await sleep(900);
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  // 1. Entry first-screen weight, excluding images.
  await navigate('index.html');
  const size = await evaluate(`(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const resources = performance.getEntriesByType('resource').filter((r) => {
      const name = (r.name || '').split('?')[0].toLowerCase();
      return !/\\.(png|jpg|jpeg|webp|gif|svg|ico)$/.test(name) && r.initiatorType !== 'img';
    });
    const rows = resources.map((r) => ({
      name: r.name.replace(location.origin + '/', ''),
      transfer: r.transferSize || 0,
      encoded: r.encodedBodySize || 0,
      decoded: r.decodedBodySize || 0
    }));
    const totalTransfer = (nav.transferSize || 0) + rows.reduce((sum, r) => sum + r.transfer, 0);
    const totalEncoded = (nav.encodedBodySize || 0) + rows.reduce((sum, r) => sum + r.encoded, 0);
    const totalDecoded = (nav.decodedBodySize || 0) + rows.reduce((sum, r) => sum + r.decoded, 0);
    return {
      transferBytes: totalTransfer,
      encodedBytes: totalEncoded,
      decodedBytes: totalDecoded,
      resources: rows.sort((a, b) => b.transfer - a.transfer).slice(0, 12)
    };
  })()`);

  // 2. Transform drag: rAF cadence while dragging the e1 handle.
  await navigate('pages/01-transform.html');
  const geometry = await evaluate(`(() => {
    const canvas = document.getElementById('transform-canvas');
    const rect = canvas.getBoundingClientRect();
    const pad = Math.min(34, Math.min(rect.width, rect.height) * 0.09);
    const usable = Math.max(1, Math.min(rect.width, rect.height) - pad * 2);
    const scale = usable / 8.8;
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      x: rect.left + rect.width / 2 + scale,
      y: rect.top + rect.height / 2,
      beforeA: document.getElementById('matrix-a').value,
      beforeC: document.getElementById('matrix-c').value
    };
  })()`);

  await evaluate(`window.__perf = new Promise((resolve) => {
    const stamps = [];
    const start = performance.now();
    function tick(now) {
      stamps.push(now);
      if (now - start < 1800) {
        requestAnimationFrame(tick);
      } else {
        const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
        const sorted = gaps.slice().sort((a, b) => a - b);
        const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0;
        const max = sorted[sorted.length - 1] || 0;
        const elapsed = stamps[stamps.length - 1] - stamps[0];
        resolve({
          frames: stamps.length,
          elapsed,
          fps: elapsed > 0 ? (stamps.length - 1) / elapsed * 1000 : 0,
          p95,
          max
        });
      }
    }
    requestAnimationFrame(tick);
  }); true`);

  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: geometry.x, y: geometry.y, button: 'left', clickCount: 1
  });
  await sleep(80);
  for (let i = 1; i <= 100; i++) {
    const t = i / 100;
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: geometry.x + 150 * t,
      y: geometry.y - 55 * t,
      button: 'left',
      buttons: 1
    });
    await sleep(16);
  }
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: geometry.x + 150, y: geometry.y - 55, button: 'left', clickCount: 1
  });
  const perf = await evaluate('window.__perf');
  const after = await evaluate(`({
    a: document.getElementById('matrix-a').value,
    c: document.getElementById('matrix-c').value
  })`);

  const report = {
    firstScreen: {
      ...size,
      transferKB: +(size.transferBytes / 1024).toFixed(1),
      encodedKB: +(size.encodedBytes / 1024).toFixed(1),
      decodedKB: +(size.decodedBytes / 1024).toFixed(1)
    },
    transformDrag: {
      ...perf,
      fps: +perf.fps.toFixed(1),
      p95: +perf.p95.toFixed(2),
      max: +perf.max.toFixed(2),
      changed: after.a !== geometry.beforeA || after.c !== geometry.beforeC,
      before: { a: geometry.beforeA, c: geometry.beforeC },
      after
    }
  };
  console.log(JSON.stringify(report, null, 2));
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
