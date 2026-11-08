/**
 * Bakes small full-colour language logos from Devicon (MIT) for the atom preset's spheres.
 *
 *   pnpm exec tsx scripts/bake-language-icons.ts
 *
 * Each logo is rasterised to 64 x 64, quantised to a 15-colour palette and written to
 * packages/presets/src/language-icons-data.ts, with a contact sheet and a report in
 * .starforge/icons/. Languages Devicon has no logo for are skipped.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { decodePng, encodePng } from './lib/png';
import { lines } from './lib/sampling';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.starforge', 'cache', 'devicon');
const OUTPUT = join(ROOT, 'packages', 'presets', 'src', 'language-icons-data.ts');
const REPORT = join(ROOT, '.starforge', 'icons', 'report.json');
const SHEET = join(ROOT, '.starforge', 'icons', 'preview.png');

const DEVICON_VERSION = 'v2.16.0';
const BASE = `https://cdn.jsdelivr.net/gh/devicons/devicon@${DEVICON_VERSION}/icons`;
const VARIANTS = ['original', 'plain', 'original-wordmark', 'plain-wordmark'];
const USER_AGENT = 'starforge-bake (https://github.com/ShyneChikwapulo/Starforge)';
const SIZE = 64;
const COLORS = 15;
/** Pixels with less alpha than this are transparent. */
const ALPHA_CUTOFF = 96;

/** GitHub (linguist) language name to the Devicon folder that has its logo. */
const DEVICON: Record<string, string> = {
  Python: 'python',
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  Java: 'java',
  'C++': 'cplusplus',
  C: 'c',
  'C#': 'csharp',
  Go: 'go',
  Rust: 'rust',
  Ruby: 'ruby',
  PHP: 'php',
  Swift: 'swift',
  Kotlin: 'kotlin',
  HTML: 'html5',
  CSS: 'css3',
  Shell: 'bash',
  Dart: 'dart',
  Scala: 'scala',
  Lua: 'lua',
  R: 'r',
  Perl: 'perl',
  Haskell: 'haskell',
  Elixir: 'elixir',
  Clojure: 'clojure',
  'Objective-C': 'objectivec',
  Vue: 'vuejs',
  Svelte: 'svelte',
  'Jupyter Notebook': 'jupyter',
  Dockerfile: 'docker',
  MATLAB: 'matlab',
  Julia: 'julia',
  PowerShell: 'powershell',
  Groovy: 'groovy',
  Erlang: 'erlang',
  OCaml: 'ocaml',
  Zig: 'zig',
  SCSS: 'sass',
  Sass: 'sass',
  Less: 'less',
  TeX: 'latex',
  Nix: 'nixos',
  Solidity: 'solidity',
  'Vim Script': 'vim',
  'F#': 'fsharp',
  CoffeeScript: 'coffeescript',
  Astro: 'astro',
  Markdown: 'markdown',
  CMake: 'cmake',
  Pug: 'pug',
  Handlebars: 'handlebars',
  PLpgSQL: 'postgresql',
  TSQL: 'microsoftsqlserver',
  Gherkin: 'cucumber',
  'Emacs Lisp': 'emacs',
  Nim: 'nim',
  Crystal: 'crystal',
  Elm: 'elm',
  Racket: 'racket',
  D: 'd',
  Fortran: 'fortran',
};

async function fetchSvg(name: string): Promise<string | null> {
  await mkdir(CACHE, { recursive: true });
  for (const variant of VARIANTS) {
    const file = join(CACHE, `${name}-${variant}.svg`);
    if (existsSync(file)) return readFile(file, 'utf8');
    const response = await fetch(`${BASE}/${name}/${name}-${variant}.svg`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) continue;
    const text = await response.text();
    await writeFile(file, text);
    return text;
  }
  return null;
}

/** Rasterise an SVG to SIZE x SIZE RGBA, centred, keeping its aspect ratio. */
function rasterise(svg: string): Uint8Array {
  let image = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render();
  if (image.height > SIZE) {
    image = new Resvg(svg, { fitTo: { mode: 'height', value: SIZE } }).render();
  }
  const decoded = decodePng(Buffer.from(image.asPng()));
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  const ox = Math.floor((SIZE - decoded.width) / 2);
  const oy = Math.floor((SIZE - decoded.height) / 2);
  for (let y = 0; y < decoded.height; y++) {
    for (let x = 0; x < decoded.width; x++) {
      const from = (y * decoded.width + x) * 4;
      const to = ((y + oy) * SIZE + x + ox) * 4;
      for (let k = 0; k < 4; k++) rgba[to + k] = decoded.rgba[from + k]!;
    }
  }
  return rgba;
}

type Rgb = [number, number, number];

/** Median-cut palette of at most `count` colours. */
function palette(colors: Rgb[], count: number): Rgb[] {
  const boxes: Rgb[][] = [colors];
  while (boxes.length < count) {
    let pick = -1;
    let axis = 0;
    let widest = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let k = 0; k < 3; k++) {
        let lo = 255;
        let hi = 0;
        for (const c of box) {
          lo = Math.min(lo, c[k]!);
          hi = Math.max(hi, c[k]!);
        }
        if (hi - lo > widest) {
          widest = hi - lo;
          pick = i;
          axis = k;
        }
      }
    });
    if (pick < 0 || widest === 0) break;
    const box = boxes[pick]!.slice().sort((a, b) => a[axis]! - b[axis]!);
    const half = box.length >> 1;
    boxes.splice(pick, 1, box.slice(0, half), box.slice(half));
  }
  return boxes.map((box) => {
    const sum = [0, 0, 0];
    for (const c of box) for (let k = 0; k < 3; k++) sum[k]! += c[k]!;
    return sum.map((v) => Math.round(v / Math.max(1, box.length))) as Rgb;
  });
}

interface Icon {
  palette: Rgb[];
  indices: Uint8Array;
}

function quantise(rgba: Uint8Array): Icon | null {
  const visible: Rgb[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (rgba[i * 4 + 3]! >= ALPHA_CUTOFF)
      visible.push([rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!]);
  }
  if (visible.length < 40) return null;
  const colors = palette(visible, COLORS);
  const indices = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (rgba[i * 4 + 3]! < ALPHA_CUTOFF) continue;
    let best = 0;
    let bestDistance = Infinity;
    colors.forEach((c, j) => {
      const d =
        (c[0] - rgba[i * 4]!) ** 2 +
        (c[1] - rgba[i * 4 + 1]!) ** 2 +
        (c[2] - rgba[i * 4 + 2]!) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = j;
      }
    });
    indices[i] = best + 1;
  }
  return { palette: colors, indices };
}

function pack(icon: Icon): { palette: string; pixels: string } {
  const colors = Buffer.alloc(COLORS * 3);
  icon.palette.forEach((c, i) => c.forEach((v, k) => (colors[i * 3 + k] = v)));
  const pixels = Buffer.alloc((SIZE * SIZE) / 2);
  for (let i = 0; i < SIZE * SIZE; i += 2)
    pixels[i / 2] = (icon.indices[i]! << 4) | icon.indices[i + 1]!;
  return { palette: colors.toString('base64'), pixels: pixels.toString('base64') };
}

async function writeSheet(icons: [string, Icon][]): Promise<void> {
  const columns = 8;
  const cell = SIZE + 8;
  const rows = Math.ceil(icons.length / columns);
  const width = columns * cell;
  const height = rows * cell;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = 10;
    rgb[i + 1] = 14;
    rgb[i + 2] = 24;
  }
  icons.forEach(([, icon], n) => {
    const x0 = (n % columns) * cell + 4;
    const y0 = Math.floor(n / columns) * cell + 4;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const index = icon.indices[y * SIZE + x]!;
        if (index === 0) continue;
        const color = icon.palette[index - 1]!;
        const o = ((y0 + y) * width + x0 + x) * 3;
        rgb[o] = color[0];
        rgb[o + 1] = color[1];
        rgb[o + 2] = color[2];
      }
    }
  });
  await mkdir(dirname(SHEET), { recursive: true });
  await writeFile(SHEET, encodePng(width, height, rgb));
}

async function main(): Promise<void> {
  const baked: [string, Icon][] = [];
  const missing: string[] = [];
  for (const [language, folder] of Object.entries(DEVICON)) {
    try {
      const svg = await fetchSvg(folder);
      const icon = svg ? quantise(rasterise(svg)) : null;
      if (icon) baked.push([language, icon]);
      else missing.push(language);
    } catch (error) {
      console.warn(`${language}: ${(error as Error).message}`);
      missing.push(language);
    }
  }

  const entries = baked.map(([language, icon]) => {
    const { palette: colors, pixels } = pack(icon);
    return `  ${JSON.stringify(language)}: {\n    palette: ${JSON.stringify(colors)},\n    pixels: [\n${lines(pixels)}\n    ].join(''),\n  },`;
  });
  await writeFile(
    OUTPUT,
    `// Generated by scripts/bake-language-icons.ts. Do not edit by hand.
//
// Language logos from Devicon (https://devicon.dev, https://github.com/devicons/devicon, MIT).
// The logos themselves are trademarks of their owners.
//
// Each icon is ${SIZE} x ${SIZE}: a palette of up to ${COLORS} colours (base64 RGB triples, palette
// index 1 to ${COLORS}) and 4-bit palette indices row by row, two pixels per byte with the first
// pixel in the high nibble. Index 0 is transparent. Keys are GitHub language names.

export const ICON_SIZE = ${SIZE};
export const ICON_COLORS = ${COLORS};

export const languageIcons: Record<string, { palette: string; pixels: string }> = {
${entries.join('\n')}
};
`,
  );
  await writeSheet(baked);
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(
    REPORT,
    `${JSON.stringify({ version: DEVICON_VERSION, baked: baked.map(([name]) => name), missing }, null, 2)}\n`,
  );
  console.log(`baked ${baked.length} icons; missing: ${missing.join(', ') || 'none'}`);
  console.log(`wrote ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
