import { describe, expect, it } from 'vitest';
import { measureCardText } from './card-text';
import { DISPLAY_FONT } from './display-font-data';
import { HERO_NAME, layoutHeroName } from './hero';

const NAMES: (string | null)[] = [
  'Shine Chikwapulo',
  'Al',
  'J',
  '',
  null,
  'Alexandria Ocasio-Cortez',
  'José Álvarez',
  'J. R. R. Tolkien',
  'mary-jane watson',
  'R2D2 Bot 3000',
  '李雷',
  'Иван Петров',
  '🚀🚀🚀',
  '---',
  'WWWWWWWWWWWWWWWWWWWWWWWWWW',
  'MMMMMMMMMMMMMMMMMMMMMMMMMM',
  'IIIIIIIIIIIIIIIIIIIIIIIIII',
  'A'.repeat(200),
  'Supercalifragilistic Hippopotomonstrosesquippedalio',
  "O'Brien McDonald",
  'Anne-Marie de la Cruz-Fernández',
  'x'.repeat(3),
  'B B B B B B B B B B B B B',
  'KKKK WWWW XXXX YYYY',
  '  leading and trailing  ',
  'Ö Ü Ä ß',
  'Ng Văn Nguyễn',
  'Ωmega Σigma',
];

describe('the hero name box', () => {
  it('fits between the title bar’s top edge and the chips', () => {
    const { ascent, descent, leadScale } = DISPLAY_FONT;
    const top = HERO_NAME.baseline - (ascent * leadScale * HERO_NAME.maxSize) / 1000;
    const bottom = HERO_NAME.baseline + (descent * leadScale * HERO_NAME.maxSize) / 1000;
    expect(top).toBeGreaterThanOrEqual(HERO_NAME.top - 0.5);
    expect(bottom).toBeLessThanOrEqual(HERO_NAME.bottom + 0.5);
  });

  it('allows a large enough size', () => {
    expect(HERO_NAME.maxSize).toBeGreaterThanOrEqual(40);
  });
});

describe('layoutHeroName', () => {
  it('gives every name a size that fits the width and the box', () => {
    for (const name of NAMES) {
      const { text, size } = layoutHeroName({ name, login: 'sample-user' });
      const label = JSON.stringify(name);
      expect(text.length, label).toBeGreaterThan(0);
      expect(size, label).toBeLessThanOrEqual(HERO_NAME.maxSize);
      expect(size, label).toBeGreaterThanOrEqual(30);
      expect(measureCardText(text, size, 0, 'display', true), label).toBeLessThanOrEqual(
        HERO_NAME.width + 0.5,
      );
    }
  });

  it('keeps a short name at the largest size', () => {
    expect(layoutHeroName({ name: 'Al', login: 'al' }).size).toBe(HERO_NAME.maxSize);
  });

  it('shrinks a name that is too wide at the largest size, but not below a readable size', () => {
    const width = (text: string): number => measureCardText(text, 1, 0, 'display', true);
    const wide = [...'WMBDCKXHN'].map((c) => c.repeat(26)).sort((a, b) => width(b) - width(a))[0]!;
    const tooWide = width(wide) * HERO_NAME.maxSize > HERO_NAME.width;
    const { size } = layoutHeroName({ name: wide, login: 'w' });
    expect(size).toBeGreaterThanOrEqual(30);
    if (tooWide) expect(size).toBeLessThan(HERO_NAME.maxSize);
    else expect(size).toBe(HERO_NAME.maxSize);
  });

  it('cuts a name of more than 26 characters short with an ellipsis', () => {
    const { text } = layoutHeroName({ name: 'A'.repeat(80), login: 'long' });
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(26);
  });

  it('is the same every time', () => {
    const user = { name: 'José Álvarez', login: 'jose' };
    expect(layoutHeroName(user)).toEqual(layoutHeroName(user));
  });
});
