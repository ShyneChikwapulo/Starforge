import { localMatrix, multiply, type Json } from './gltf';
import { readAccessor } from './gltf';

/** One animated property of one node: keyframe times and the values at them. */
export interface Channel {
  node: number;
  path: 'translation' | 'rotation' | 'scale';
  times: Float64Array;
  values: Float64Array;
  step: boolean;
}

export interface Clip {
  name: string;
  duration: number;
  channels: Channel[];
}

export function readClips(gltf: Json, buffers: Buffer[]): Clip[] {
  return ((gltf.animations ?? []) as Json[]).map((animation, index): Clip => {
    const channels: Channel[] = [];
    let duration = 0;
    for (const channel of animation.channels as Json[]) {
      const path = channel.target.path as string;
      if (channel.target.node === undefined) continue;
      if (path !== 'translation' && path !== 'rotation' && path !== 'scale') continue;
      const sampler = animation.samplers[channel.sampler];
      const times = readAccessor(gltf, buffers, sampler.input);
      let values = readAccessor(gltf, buffers, sampler.output);
      const width = path === 'rotation' ? 4 : 3;
      if (sampler.interpolation === 'CUBICSPLINE') {
        // Keep only the keyframe values, not their tangents.
        const picked = new Float64Array(times.length * width);
        for (let k = 0; k < times.length; k++) {
          for (let c = 0; c < width; c++) picked[k * width + c] = values[(k * 3 + 1) * width + c]!;
        }
        values = picked;
      }
      duration = Math.max(duration, times[times.length - 1] ?? 0);
      channels.push({
        node: channel.target.node,
        path,
        times,
        values,
        step: sampler.interpolation === 'STEP',
      });
    }
    return { name: animation.name ?? `clip-${index}`, duration, channels };
  });
}

function slerp(
  a: Float64Array,
  ao: number,
  b: Float64Array,
  bo: number,
  f: number,
  out: number[],
): void {
  let dot =
    a[ao]! * b[bo]! + a[ao + 1]! * b[bo + 1]! + a[ao + 2]! * b[bo + 2]! + a[ao + 3]! * b[bo + 3]!;
  const sign = dot < 0 ? -1 : 1;
  dot *= sign;
  let wa: number;
  let wb: number;
  if (dot > 0.9995) {
    wa = 1 - f;
    wb = f * sign;
  } else {
    const theta = Math.acos(Math.min(1, dot));
    const s = Math.sin(theta);
    wa = Math.sin((1 - f) * theta) / s;
    wb = (Math.sin(f * theta) / s) * sign;
  }
  let length = 0;
  for (let k = 0; k < 4; k++) {
    out[k] = wa * a[ao + k]! + wb * b[bo + k]!;
    length += out[k]! * out[k]!;
  }
  length = Math.sqrt(length) || 1;
  for (let k = 0; k < 4; k++) out[k] = out[k]! / length;
}

function sampleChannel(channel: Channel, time: number, out: number[]): void {
  const { times, values, path } = channel;
  const width = path === 'rotation' ? 4 : 3;
  const last = times.length - 1;
  if (last === 0 || time <= times[0]!) {
    for (let k = 0; k < width; k++) out[k] = values[k]!;
    return;
  }
  if (time >= times[last]!) {
    for (let k = 0; k < width; k++) out[k] = values[last * width + k]!;
    return;
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= time) lo = mid;
    else hi = mid;
  }
  const span = times[hi]! - times[lo]!;
  const f = channel.step || span <= 0 ? 0 : (time - times[lo]!) / span;
  if (path === 'rotation') {
    slerp(values, lo * 4, values, hi * 4, f, out);
  } else {
    for (let k = 0; k < 3; k++) {
      out[k] = values[lo * 3 + k]! + (values[hi * 3 + k]! - values[lo * 3 + k]!) * f;
    }
  }
}

/**
 * World matrix of every node when `clip` is at `time` seconds (looping). Without a clip the
 * nodes keep their rest transforms.
 */
export function poseWorld(gltf: Json, clip: Clip | null, time: number): number[][] {
  const nodes: Json[] = gltf.nodes ?? [];
  const overrides = new Map<number, Partial<Record<Channel['path'], number[]>>>();
  if (clip) {
    const t = clip.duration > 0 ? ((time % clip.duration) + clip.duration) % clip.duration : 0;
    for (const channel of clip.channels) {
      let entry = overrides.get(channel.node);
      if (!entry) {
        entry = {};
        overrides.set(channel.node, entry);
      }
      const out = new Array<number>(channel.path === 'rotation' ? 4 : 3).fill(0);
      sampleChannel(channel, t, out);
      entry[channel.path] = out;
    }
  }
  const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const world: number[][] = new Array(nodes.length);
  const walk = (index: number, parent: number[]): void => {
    const node = nodes[index]!;
    const override = overrides.get(index);
    const local = override
      ? localMatrix({
          translation: node.translation,
          rotation: node.rotation,
          scale: node.scale,
          ...override,
        })
      : localMatrix(node);
    world[index] = multiply(parent, local);
    for (const child of node.children ?? []) walk(child, world[index]!);
  };
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const root of scene?.nodes ?? []) walk(root, IDENT);
  return world;
}
