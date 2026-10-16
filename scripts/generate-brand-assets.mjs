/**
 * Regenerates every raster and inline brand asset from the two vector sources.
 *
 * Sources of truth (hand-authored; never generated):
 *   apps/web/public/brand/iteamify-icon.svg   the glyph alone, transparent
 *   apps/web/public/app-icon.svg              the glyph on a white rounded tile
 *
 * Hand-maintained vector aliases (same glyph; edit by hand if the mark moves):
 *   apps/web/public/favicon.svg               glyph inset on a 64x64 canvas
 *   apps/web/public/logo.svg                  byte-identical copy of favicon.svg
 *
 * Generated outputs, by consumer:
 *   app/(landing)/layout.tsx, brand-mark.tsx   public/brand/iteamify-icon.png
 *   app/layout.tsx, app/manifest.ts            public/icon-192.png, icon-512.png
 *   app/layout.tsx                             public/apple-touch-icon.png
 *   app/og-brand.tsx                           app/brand-glyph.ts
 *   @iteamify/ui `ITeamifyIcon`                packages/ui/.../iteamify-icon.tsx
 *   apps/mobile `iteamify-logo.tsx`            renders the glyph SVG directly
 *   electron-builder (desktop)                 build/icon.png, .ico, .icns, icons/
 *
 * Four different framings are in play, and they are not interchangeable:
 *   - transparent tile, rounded corners  desktop icons (the OS supplies depth)
 *   - opaque full-bleed square           favicon / manifest / apple-touch-icon
 *                                        (Android masks it itself, and iOS
 *                                        ignores alpha, so both need a solid
 *                                        backdrop reaching the edges)
 *   - transparent bare glyph, ink 15/16  in-app mark and OG glyph
 *   - hand-authored SVG                   favicon.svg / logo.svg
 *
 * Idempotent: re-running on unchanged sources writes byte-identical output and
 * leaves every file's mtime alone. Run from the repo root:
 *   node scripts/generate-brand-assets.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "apps/web/public");
const GLYPH_SVG = path.join(PUBLIC, "brand/iteamify-icon.svg");
const APP_ICON_SVG = path.join(PUBLIC, "app-icon.svg");
const BRAND_PNG = path.join(PUBLIC, "brand/iteamify-icon.png");
const BUILD = path.join(ROOT, "apps/desktop/build");
const ICONS = path.join(BUILD, "icons");
const ICON_TSX = path.join(ROOT, "packages/ui/components/common/iteamify-icon.tsx");
const GLYPH_TS = path.join(ROOT, "apps/web/app/brand-glyph.ts");

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const DATA_URI_PREFIX = "data:image/png;base64,";

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
/** Windows .ico frames. 256 is the largest size the format can address. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
/** Opaque, full-bleed web icons: [size, filename, why]. */
const OPAQUE_ICONS = [
  [512, "icon-512.png", "PWA install + Android splash"],
  [192, "icon-192.png", "PWA install; manifest declares it maskable"],
  [180, "apple-touch-icon.png", "iOS home screen; iOS ignores alpha"],
];
/**
 * Ink height as a fraction of the canvas for the bare-glyph rasters.
 *
 * The glyph is portrait (141 x 163.78), so `resize({ height })` fixes the ink
 * footprint and the width follows the aspect. 15/16 leaves a hairline margin
 * that keeps the antialiased edges off the canvas boundary.
 */
const INK_RATIO = 15 / 16;

/**
 * Rasterises an SVG square at `size` px, optionally flattening onto a backdrop.
 *
 * `density` multiplies the SVG's *declared* size, so the factor has to be
 * derived from the target rather than hardcoded — a fixed 300 dpi blows past
 * sharp's pixel limit as soon as the target grows. The clamp bounds it, and the
 * 4x headroom means the resize always downsamples.
 */
async function rasterise(svgPath, size, background = TRANSPARENT, flatten = false) {
  const declared = 256;
  const density = Math.min(
    4800,
    Math.max(240, Math.round((size / declared) * 72 * 4)),
  );
  let pipeline = sharp(svgPath, { density, failOn: "none" }).resize(size, size, {
    fit: "contain",
    background,
  });
  if (flatten) pipeline = pipeline.flatten({ background });
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * The bare glyph centred on a transparent square.
 *
 * `resize({ height })` preserves the aspect ratio, so the portrait glyph is
 * never stretched to the square. Ink fills `INK_RATIO` of the canvas height,
 * which keeps `ITeamifyIcon` at the same optical size everywhere it is already
 * placed.
 */
async function renderMark(canvas) {
  const inkHeight = Math.round(canvas * INK_RATIO);
  const inner = await sharp(GLYPH_SVG, { density: 2400, failOn: "none" })
    .resize({ height: inkHeight })
    .png()
    .toBuffer();
  const { width } = await sharp(inner).metadata();
  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite([
      {
        input: inner,
        top: Math.round((canvas - inkHeight) / 2),
        left: Math.round((canvas - width) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Wraps PNG frames in an ICO container.
 *
 * Hand-rolled rather than pulled from a dependency: the format is a 6-byte
 * header plus one 16-byte directory entry per frame, and PNG-compressed frames
 * have been valid since Vista. `sharp` cannot emit ICO at all.
 */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + frames.length * 16;
  const directory = Buffer.alloc(frames.length * 16);
  for (const [i, { size, data }] of frames.entries()) {
    const entry = i * 16;
    // 0 encodes 256 in a single byte — the field cannot hold the value itself.
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 0);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette size
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  }

  return Buffer.concat([header, directory, ...frames.map((f) => f.data)]);
}

async function writeDesktopIcons(master) {
  rmSync(ICONS, { recursive: true, force: true });
  mkdirSync(ICONS, { recursive: true });

  const downsize = (size) =>
    sharp(master)
      .resize(size, size, { fit: "contain", background: TRANSPARENT })
      .png({ compressionLevel: 9 })
      .toBuffer();

  writeIfChanged(path.join(BUILD, "icon.png"), master);

  for (const size of ICON_SIZES) {
    writeIfChanged(path.join(ICONS, `${size}x${size}.png`), await downsize(size));
  }

  // PNG-framed ICO.
  const frames = [];
  for (const size of ICO_SIZES) {
    frames.push({ size, data: await downsize(size) });
  }
  writeIfChanged(path.join(BUILD, "icon.ico"), buildIco(frames));

  // `iconutil` requires the exact @1x / @2x filenames, not a flat size list,
  // and it always writes its output — so build into a temp file and keep the
  // existing one when the bytes match, otherwise every run bumps the mtime.
  const iconset = path.join(BUILD, "icon.iconset");
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });
  const entries = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [size, name] of entries) {
    writeFileSync(path.join(iconset, name), await downsize(size));
  }
  const icns = path.join(BUILD, "icon.icns");
  // `iconutil` validates the output extension, so the staging path has to end
  // in `.icns` too — a `.next` suffix is rejected outright.
  const staged = path.join(BUILD, "icon.staged.icns");
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", staged], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  writeIfChanged(icns, readFileSync(staged));
  rmSync(staged, { force: true });
  rmSync(iconset, { recursive: true, force: true });
}

/**
 * Writes `data` only when it differs from what is on disk.
 *
 * The whole script has to be re-runnable without churning mtimes: a no-op run
 * must not make CI think the tree is dirty.
 */
function writeIfChanged(file, data) {
  try {
    if (readFileSync(file).equals(data)) return false;
  } catch {
    // Missing file — fall through and write.
  }
  writeFileSync(file, data);
  return true;
}

/**
 * Rewrites a multi-line base64 literal with the PNG's data URI.
 *
 * `declaration` is the literal's head (`const MARK_SRC =`,
 * `export const BRAND_GLYPH_DATA_URI =`) and doubles as the anchor, so the
 * match cannot drift onto a neighbouring constant.
 *
 * The chunks are joined with an explicit `+`. They must be: adjacent string
 * literals are **not** concatenated in JavaScript — `const x = "a" "b"` binds
 * `x` to `"a"` and evaluates `"b"` as a discarded expression statement. A
 * `+`-less literal therefore parses, typechecks and lints into a silent
 * truncation, which for a data URI means an undecodable image. `+` at the end
 * of the line is also what prettier emits.
 */
function writeDataUri(file, declaration, png, { indent = 4, width = 100 } = {}) {
  const uri = DATA_URI_PREFIX + png.toString("base64");
  const source = readFileSync(file, "utf8");

  const chunks = [];
  for (let i = 0; i < uri.length; i += width) chunks.push(uri.slice(i, i + width));
  const pad = " ".repeat(indent);
  const literal = chunks
    .map((c, i) => `${pad}"${c}"${i === chunks.length - 1 ? ";" : " +"}`)
    .join("\n");

  const anchor = declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `\+?` so a literal written without `+` (the truncating form this replaced)
  // is still recognised and repaired rather than reported as missing.
  const pattern = new RegExp(
    `${anchor}\\n(?:[ \\t]*"[^"]*"[ \\t]*\\+?\\n)*[ \\t]*"[^"]*";\\n*`,
  );
  if (!pattern.test(source)) {
    throw new Error(
      `could not locate the \`${declaration}\` literal in ${path.relative(ROOT, file)}`,
    );
  }
  const patched = source.replace(pattern, `${declaration}\n${literal}\n\n`);
  if (patched !== source) writeFileSync(file, patched);
  return uri.length;
}

// --- Desktop: rounded tile, transparent corners, macOS / Windows / Linux ----
const master = await rasterise(APP_ICON_SVG, 1024);
await writeDesktopIcons(master);

// --- Web: opaque full-bleed squares, plus the transparent brand PNG ---------
for (const [size, name, why] of OPAQUE_ICONS) {
  const png = await rasterise(APP_ICON_SVG, size, WHITE, true);
  writeIfChanged(path.join(PUBLIC, name), png);
  console.log(`public/${name.padEnd(22)} ${size}x${size}  opaque  ${why}`);
}

const brandPng = await renderMark(512);
writeIfChanged(BRAND_PNG, brandPng);

// --- Inline data URIs ------------------------------------------------------
const markUri = writeDataUri(ICON_TSX, "const MARK_SRC =", await renderMark(96));
const glyphUri = writeDataUri(
  GLYPH_TS,
  "export const BRAND_GLYPH_DATA_URI =",
  await renderMark(160),
  { indent: 2, width: 120 },
);

const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
console.log(`build/icon.png             1024x1024  ${kb(master.length)}`);
console.log(`build/icons/               ${ICON_SIZES.length} sizes`);
console.log(`build/icon.ico             ${ICO_SIZES.length} frames`);
console.log(`build/icon.icns            10 entries`);
console.log(`brand/iteamify-icon.png    512x512    ${kb(brandPng.length)}`);
console.log(`MARK_SRC                   96x96  data URI ${markUri} chars`);
console.log(`BRAND_GLYPH_DATA_URI       160x160  data URI ${glyphUri} chars`);
