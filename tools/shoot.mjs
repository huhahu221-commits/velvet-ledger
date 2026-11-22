// Capture the four screenshot scenes with headless Chrome, exactly as the gate will see them:
// 1280x720, the shot page's own staging, and window.__shotReady waited on before the shutter.
//
//   node tools/shoot.mjs [port] [outdir]
//
// Chrome is driven by the DevTools protocol over a WebSocket, because Node has no built-in
// screenshot API and the project takes no dependencies. It writes JPEGs, which keeps every file
// well under the gate's 256 KiB cap at this size.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const port = Number(process.argv[2] ?? 8092);
const outDir = process.argv[3] ?? 'screenshots';
const SHOTS = [
  ['1-gallery.jpg', 'play', 'the thief crossing the gallery: a guard cone on him, a lens above, the cases lit'],
  ['2-alarm.jpg', 'alarm', 'the meter past HUNTED, two guards turned and chasing'],
  ['3-vault.jpg', 'win', 'late night: two pieces lifted, the Ledger half worked, a cone at his back'],
  ['4-title.jpg', 'start', 'the title card over the quiet house'],
];

mkdirSync(outDir, { recursive: true });

const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--remote-debugging-port=9333',
  '--window-size=1280,720',
  '--force-device-scale-factor=1',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let chromeErr = '';
chrome.stderr.on('data', (chunk) => { chromeErr += chunk.toString(); });

/** Wait for the DevTools endpoint to answer, then hand back the page target's socket URL. */
async function devtoolsTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:9333/json/list');
      const targets = await response.json();
      const page = targets.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is not listening yet.
    }
    await sleep(150);
  }
  throw new Error(`Chrome never came up.\n${chromeErr}`);
}

/** A tiny CDP client: send a command, await the matching id, ignore the event stream. */
function connect(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', () => reject(new Error('CDP socket failed')));
  });
  return {
    ready,
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() { socket.close(); },
  };
}

const cdp = connect(await devtoolsTarget());
await cdp.ready;
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
});

for (const [file, scene, note] of SHOTS) {
  const url = `http://127.0.0.1:${port}/?shot=${scene}&seed=1`;
  await cdp.send('Page.navigate', { url });
  // Wait for the page to say it has painted the staged scene twice.
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await sleep(120);
    const result = await cdp.send('Runtime.evaluate', {
      expression: 'window.__shotReady === true',
      returnByValue: true,
    });
    if (result.result?.value === true) { ready = true; break; }
  }
  if (!ready) {
    const status = await cdp.send('Runtime.evaluate', {
      expression: 'document.getElementById("status")?.textContent ?? "(no status)"',
      returnByValue: true,
    });
    throw new Error(`${scene}: never became ready. status="${status.result?.value}"`);
  }
  // One more frame, so the compositor has the final paint.
  await sleep(320);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
  const bytes = Buffer.from(shot.data, 'base64');
  writeFileSync(join(outDir, file), bytes);
  console.log(`${file}  ${bytes.length} bytes  ${note}`);
}

cdp.close();
chrome.kill('SIGTERM');
await sleep(300);
console.log('done');
