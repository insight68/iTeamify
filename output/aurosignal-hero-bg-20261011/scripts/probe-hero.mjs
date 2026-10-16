#!/usr/bin/env node
// 零依赖 CDP 取证：盒模型 / 滚动容器 / 背景层 / 溢出 / 字号
import { spawn } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? 'true'] : [a, 'true']
}))
const URL_ = args.url, W = Number(args.w ?? 1440), H = Number(args.h ?? 900)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const port = await freePort()
const profile = `/tmp/wbprobe-${port}`
fs.rmSync(profile, { recursive: true, force: true })
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-proxy-server', '--hide-scrollbars', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--window-size=${W},1200`, URL_], { stdio: 'ignore' })
let ws
try {
  let list
  for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list?.some((t) => t.type === 'page')) break } catch {} await sleep(250) }
  const page = list.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0; const pending = new Map()
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j) })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const myId = ++id; pending.set(myId, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result))); ws.send(JSON.stringify({ id: myId, method, params })) })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 })
  await send('Page.navigate', { url: URL_ })
  await sleep(Number(args.settle ?? 3500))
  await send('Runtime.evaluate', { expression: 'document.fonts ? document.fonts.ready.then(()=>1) : 1', awaitPromise: true })
  await sleep(500)
  const out = await send('Runtime.evaluate', {
    expression: `(() => {
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return { x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1),
          bg: cs.backgroundColor, bgImage: cs.backgroundImage.slice(0,220), z: cs.zIndex, pos: cs.position, overflowX: cs.overflowX }; };
      const one = (s) => box(document.querySelector(s));
      // 滚动容器
      const scrollers = [...document.querySelectorAll('*')].filter(e => { const cs = getComputedStyle(e); return e.scrollHeight > e.clientHeight + 40 && cs.overflowY !== 'visible' }).map(e => ({ tag: e.tagName, cls: (e.className||'').toString().slice(0,80), sh: e.scrollHeight, ch: e.clientHeight }));
      // 溢出元素
      const over = [...document.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 2).slice(0,12).map(e => ({ tag: e.tagName, cls: (e.className||'').toString().slice(0,70), sw: e.scrollWidth, cw: e.clientWidth }));
      // 字号集合（叶子文本）
      const sizes = {};
      document.querySelectorAll('.service-site *').forEach(e => { if (e.children.length) return; const t = (e.textContent||'').trim(); if (!t) return; const fs2 = getComputedStyle(e).fontSize; sizes[fs2] = (sizes[fs2]||0)+1; });
      // atlas 覆盖率：hero 内在 Y 轴上 atlas 可见吗
      const heroEl = document.querySelector('.service-hero');
      const atlas = document.querySelector('.service-atlas-desktop');
      const globe = document.querySelector('.service-atlas-desktop ellipse');
      return JSON.stringify({
        vw: innerWidth, vh: innerHeight,
        scrollContainers: scrollers,
        hero: one('.service-hero'), heroBefore: (()=>{const el=document.querySelector('.service-hero'); const cs=getComputedStyle(el,'::before'); return {bgImage: cs.backgroundImage.slice(0,400), z: cs.zIndex};})(),
        copy: one('.service-hero-copy'), h1: (()=>{const el=document.querySelector('.service-hero h1'); const cs=getComputedStyle(el); const r=el.getBoundingClientRect(); return {x:+r.x.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),fontSize:cs.fontSize,color:cs.color,lineHeight:cs.lineHeight};})(),
        stage: one('.service-hero-stage'), preview: one('.service-preview'), previewWindow: one('.service-preview-window'),
        atlasWrap: one('.service-hero-atlas'), atlasSvg: one('.service-atlas-desktop'),
        audienceStrip: one('.service-audience-strip'),
        sizes, over,
        imgsInHero: [...document.querySelectorAll('.service-hero img')].map(i=>({src:i.currentSrc.split('/').pop(), nw:i.naturalWidth, nh:i.naturalHeight})),
      }, null, 1);
    })()`, returnByValue: true,
  })
  console.log(out.result.value)
} finally { try { ws?.close() } catch {} chrome.kill('SIGKILL'); try { fs.rmSync(profile, { recursive: true, force: true }) } catch {} }
process.exit(0)
