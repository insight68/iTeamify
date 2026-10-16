import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { Buffer } from "node:buffer";
import process from "node:process";
import { URL } from "node:url";

/* global fetch */

const target = process.argv[2] || "http://127.0.0.1:3000/";
const response = await fetch(target);
if (!response.ok) {
  throw new Error(`${target} returned ${response.status}`);
}

const html = await response.text();
const nextDir = resolve(import.meta.dirname, "../.next");
const unique = (values) => [...new Set(values)];
const scripts = unique(
  [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]),
);
const stylesheets = unique(
  [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(
    (match) => match[1],
  ),
);
const fonts = unique(
  [...(response.headers.get("link") || "").matchAll(/<([^>]+\.woff2)>/g)].map(
    (match) => match[1],
  ),
);

async function measure(urls) {
  let raw = 0;
  let gzip = 0;
  const files = [];
  for (const url of urls) {
    const pathname = new URL(url, target).pathname;
    if (!pathname.startsWith("/_next/")) continue;
    const contents = await readFile(resolve(nextDir, pathname.slice("/_next/".length)));
    raw += contents.byteLength;
    gzip += gzipSync(contents).byteLength;
    files.push({ pathname, raw: contents.byteLength, gzip: gzipSync(contents).byteLength });
  }
  return { count: files.length, raw, gzip, files };
}

const htmlBytes = Buffer.byteLength(html);
const result = {
  target,
  status: response.status,
  html: { raw: htmlBytes, gzip: gzipSync(html).byteLength },
  scripts: await measure(scripts),
  stylesheets: await measure(stylesheets),
  fonts: await measure(fonts),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
