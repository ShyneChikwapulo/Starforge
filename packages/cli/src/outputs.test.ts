import { describe, expect, it } from 'vitest';
import type { GenerateResult } from './generate';
import { formatStepOutputs } from './outputs';

const result: GenerateResult = {
  directory: '/out',
  animation: '/out/galaxy.webp',
  poster: '/out/galaxy-poster.png',
  legend: '/out/galaxy-legend.svg',
  metrics: '/out/metrics.json',
  animationBytes: 1,
};

describe('formatStepOutputs', () => {
  it('lists the directory and the publishable files', () => {
    expect(formatStepOutputs(result)).toBe(
      'directory=/out\nfiles=galaxy.webp galaxy-poster.png galaxy-legend.svg\n',
    );
  });

  it('leaves out the legend when there is none', () => {
    expect(formatStepOutputs({ ...result, legend: undefined })).toBe(
      'directory=/out\nfiles=galaxy.webp galaxy-poster.png\n',
    );
  });

  it('never publishes the metrics snapshot', () => {
    expect(formatStepOutputs(result)).not.toContain('metrics.json');
  });
});
