import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

describe('theme and background options', () => {
  it('default to the original look', () => {
    const config = parseConfig({ username: 'octo' });
    expect(config.theme).toBe('dark');
    expect(config.background).toBeUndefined();
  });

  it('leave a config written before they existed unchanged', () => {
    expect(
      parseConfig({ username: 'octo', preset: 'atom', width: 480, height: 480, frames: 48 }),
    ).toMatchObject({
      preset: 'atom',
      width: 480,
      frames: 48,
      format: 'webp',
      theme: 'dark',
      legend: true,
    });
  });

  it('accept transparent or a six-digit colour', () => {
    expect(parseConfig({ username: 'octo', background: 'transparent' }).background).toBe(
      'transparent',
    );
    expect(parseConfig({ username: 'octo', background: '#0d1117' }).background).toBe('#0d1117');
  });

  it('reject anything else', () => {
    expect(() => parseConfig({ username: 'octo', background: 'red' })).toThrow();
    expect(() => parseConfig({ username: 'octo', background: '#fff' })).toThrow();
    expect(() => parseConfig({ username: 'octo', theme: 'blue' })).toThrow();
  });

  it('allow one solid colour with a single theme', () => {
    expect(() =>
      parseConfig({ username: 'octo', theme: 'light', background: '#ffffff' }),
    ).not.toThrow();
    expect(() =>
      parseConfig({ username: 'octo', theme: 'dark', background: '#0d1117' }),
    ).not.toThrow();
  });

  it('refuse a solid colour for both themes at once', () => {
    expect(() => parseConfig({ username: 'octo', theme: 'both', background: '#0d1117' })).toThrow(
      /transparent/,
    );
    expect(() =>
      parseConfig({ username: 'octo', theme: 'both', background: 'transparent' }),
    ).not.toThrow();
    expect(() => parseConfig({ username: 'octo', theme: 'both' })).not.toThrow();
  });
});
