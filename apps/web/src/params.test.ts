import { describe, expect, it } from 'vitest';
import { parseViewerParams } from './params';

const source = (search: string) => parseViewerParams(search).source;

describe('parseViewerParams', () => {
  it('falls back to sample data when nothing is specified', () => {
    expect(source('')).toEqual({ kind: 'sample' });
  });

  it('maps a user to their profile repository', () => {
    expect(source('?user=octo')).toEqual({
      kind: 'url',
      url: 'https://raw.githubusercontent.com/octo/octo/main/starforge/metrics.json',
      label: 'octo/octo',
    });
  });

  it('prefers an explicit repository over a user', () => {
    expect(source('?user=octo&repo=octo/demo')).toMatchObject({ kind: 'url', label: 'octo/demo' });
  });

  it('reads a custom branch', () => {
    expect(source('?repo=octo/demo&branch=data')).toMatchObject({
      url: 'https://raw.githubusercontent.com/octo/demo/data/starforge/metrics.json',
    });
  });

  it('rejects malformed repositories, users and branches', () => {
    for (const search of [
      '?repo=octo',
      '?repo=a/b/c',
      '?repo=../x',
      '?repo=./x',
      '?user=bad%20name',
      '?repo=octo/demo&branch=a..b',
    ]) {
      expect(source(search).kind, search).toBe('error');
    }
  });

  it('accepts only https metrics URLs', () => {
    expect(source('?metrics=http://example.com/m.json').kind).toBe('error');
    expect(source('?metrics=javascript:alert(1)').kind).toBe('error');
    expect(source('?metrics=https://example.com/m.json')).toMatchObject({
      kind: 'url',
      label: 'example.com',
    });
  });

  it('clamps the particle count and ignores junk', () => {
    expect(parseViewerParams('').particles).toBe(12000);
    expect(parseViewerParams('?particles=999999').particles).toBe(60000);
    expect(parseViewerParams('?particles=5').particles).toBe(1000);
    expect(parseViewerParams('?particles=abc').particles).toBe(12000);
  });

  it('reads the seed', () => {
    expect(parseViewerParams('?seed=7').seed).toBe(7);
    expect(parseViewerParams('?seed=-3').seed).toBe(0);
    expect(parseViewerParams('?seed=x').seed).toBe(1);
  });
});

describe('lighting parameters', () => {
  it('has calm defaults', () => {
    expect(parseViewerParams('')).toMatchObject({ bloom: 0.35, exposure: 1.2, brightness: 0.9 });
  });

  it('clamps values and ignores junk', () => {
    expect(parseViewerParams('?bloom=50').bloom).toBe(2);
    expect(parseViewerParams('?bloom=-1').bloom).toBe(0);
    expect(parseViewerParams('?exposure=abc').exposure).toBe(1.2);
    expect(parseViewerParams('?brightness=0').brightness).toBe(0.1);
    expect(parseViewerParams('?brightness=1.5').brightness).toBe(1.5);
  });
});

describe('preset parameter', () => {
  it('defaults to the galaxy', () => {
    expect(parseViewerParams('').preset).toBe('galaxy');
  });

  it('accepts known presets and ignores unknown ones', () => {
    expect(parseViewerParams('?preset=tunnel').preset).toBe('tunnel');
    expect(parseViewerParams('?preset=nope').preset).toBe('galaxy');
    expect(parseViewerParams('?preset=constructor').preset).toBe('galaxy');
  });
});
