import './style.css';
import { Simulation } from '@starforge/core';
import { createSampleMetrics, parseMetrics, type Metrics } from '@starforge/github-data';
import { PRESET_IDS, getPreset, presets, type PresetId } from '@starforge/presets';
import { createViewer } from '@starforge/renderer-webgl';
import { renderOverlay } from './overlay';
import { parseViewerParams, type MetricsSource } from './params';
import { createTooltip } from './tooltip';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const nav = document.querySelector<HTMLElement>('#presets')!;
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

    const buildOptions = { seed: params.seed, particleCount: params.particles };
    let current: PresetId = params.preset;
    const first = getPreset(current)!.build(metrics, buildOptions);
    const { state, behaviours, seed } = first;
    let entities = first.entities;

    const simulation = new Simulation({ state, behaviours, seed });
    simulation.run(60);

    const viewer = createViewer({
      canvas,
      bloomStrength: params.bloom,
      exposure: params.exposure,
      brightness: params.brightness,
    });
    viewer.setParticles(state);
    viewer.setView(presets[current].view);
    viewer.onFrame(() => simulation.step());

    const tooltip = createTooltip(marker, tip);
    viewer.setHoverTargets(entities.map((entity) => entity.particle));
    viewer.onHover((hit) => {
      if (hit) tooltip.show(entities[hit.index], hit.x, hit.y);
      else tooltip.hide();
    });

    const buttons = new Map<PresetId, HTMLButtonElement>();
    const refreshButtons = (): void => {
      for (const [id, button] of buttons)
        button.setAttribute('aria-pressed', String(id === current));
    };

    function switchPreset(id: PresetId): void {
      if (id === current) return;
      const next = getPreset(id)!.build(metrics, buildOptions);
      if (next.state.count !== state.count) return;

      // The spring behaviour pulls every particle toward its new target: that is the morph.
      state.target.set(next.state.target);
      state.color.set(next.state.color);
      state.size.set(next.state.size);
      viewer.invalidateAppearance();
      viewer.setView(presets[id].view);

      entities = next.entities;
      viewer.setHoverTargets(entities.map((entity) => entity.particle));
      tooltip.hide();

      current = id;
      refreshButtons();
      renderOverlay(overlay, metrics, label, presets[id].legend);

      const url = new URL(window.location.href);
      url.searchParams.set('preset', id);
      window.history.replaceState(null, '', url);
    }

    for (const id of PRESET_IDS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = presets[id].name;
      button.addEventListener('click', () => switchPreset(id));
      buttons.set(id, button);
      nav.append(button);
    }
    refreshButtons();

    viewer.resize();
    window.addEventListener('resize', () => viewer.resize());

    renderOverlay(overlay, metrics, label, presets[current].legend);
    status.textContent =
      params.source.kind === 'sample'
        ? 'Showing sample data. Add ?user=YOUR-LOGIN or ?repo=owner/name to see real data.'
        : '';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Something went wrong.';
  }
}

void main();
