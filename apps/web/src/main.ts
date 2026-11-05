import './style.css';
import { Simulation } from '@starforge/core';
import { createSampleMetrics, parseMetrics, type Metrics } from '@starforge/github-data';
import { buildGalaxy } from '@starforge/presets';
import { createViewer } from '@starforge/renderer-webgl';
import { renderOverlay } from './overlay';
import { parseViewerParams, type MetricsSource } from './params';
import { createTooltip } from './tooltip';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const status = document.querySelector<HTMLElement>('#status')!;
const marker = document.querySelector<HTMLElement>('#marker')!;
const tip = document.querySelector<HTMLElement>('#tooltip')!;

async function loadMetrics(source: MetricsSource): Promise<{ metrics: Metrics; label: string }> {
  if (source.kind === 'sample') return { metrics: createSampleMetrics(), label: 'sample data' };
  if (source.kind === 'error') throw new Error(source.message);

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(
      `Could not load data for ${source.label} (HTTP ${response.status}). Has the Starforge Action run in that repository?`,
    );
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(`The data for ${source.label} is not valid JSON.`);
  }
  try {
    return { metrics: parseMetrics(json), label: source.label };
  } catch {
    throw new Error(`The data for ${source.label} is not valid Starforge metrics.`);
  }
}

async function main(): Promise<void> {
  const params = parseViewerParams(window.location.search);
  try {
    const { metrics, label } = await loadMetrics(params.source);

    const { state, behaviours, seed, entities } = buildGalaxy(metrics, {
      seed: params.seed,
      particleCount: params.particles,
    });
    const simulation = new Simulation({ state, behaviours, seed });
    simulation.run(60);

    const viewer = createViewer({
      canvas,
      bloomStrength: params.bloom,
      exposure: params.exposure,
      brightness: params.brightness,
    });
    viewer.setParticles(state);
    viewer.onFrame(() => simulation.step());

    const tooltip = createTooltip(marker, tip);
    viewer.setHoverTargets(entities.map((entity) => entity.particle));
    viewer.onHover((hit) => {
      if (hit) tooltip.show(entities[hit.index], hit.x, hit.y);
      else tooltip.hide();
    });

    viewer.resize();
    window.addEventListener('resize', () => viewer.resize());

    renderOverlay(overlay, metrics, label);
    status.textContent =
      params.source.kind === 'sample'
        ? 'Showing sample data. Add ?user=YOUR-LOGIN or ?repo=owner/name to see real data.'
        : '';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Something went wrong.';
  }
}

void main();
