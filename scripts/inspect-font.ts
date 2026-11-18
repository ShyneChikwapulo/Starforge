/**
 * Prints a font's name records (designer, copyright, licence) and which characters it covers, to
 * check whether it can be baked into a card.
 *
 *   pnpm exec tsx scripts/inspect-font.ts path/to/font.ttf
 */
import { readFile } from 'node:fs/promises';
import opentype from 'opentype.js';

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) throw new Error('usage: inspect-font.ts font.ttf');
  const file = await readFile(path);
  const font = opentype.parse(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  );
  console.log(`${path}: ${font.numGlyphs} glyphs, ${font.unitsPerEm} units per em`);
  console.log(JSON.stringify(font.names, null, 1).slice(0, 3500));
  const sets: Record<string, string> = {
    capitals: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    punctuation: ".,-_'@:/·",
  };
  for (const [label, chars] of Object.entries(sets)) {
    const missing = [...chars].filter((c) => font.charToGlyph(c).index === 0);
    console.log(
      `${label}: ${missing.length === 0 ? 'all present' : `missing ${missing.join(' ')}`}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
