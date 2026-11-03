/**
 * Turn a recording into a seamless loop.
 *
 * Record `length + overlap` frames. The output has `length` frames: the last
 * `length - overlap` are untouched, and the first `overlap` blend from the
 * simulation's natural continuation (frames[length + i]) into the real start
 * (frames[i]). Frame `length - 1` is followed by frames[length], exactly what
 * the simulation would have produced next, so there is no visible jump.
 */
export function blendLoop(frames: readonly Float32Array[], overlap: number): Float32Array[] {
  const length = frames.length - overlap;
  if (!Number.isInteger(overlap) || overlap < 1 || overlap > length) {
    throw new RangeError('overlap must be an integer from 1 to half the frame count');
  }

  const output: Float32Array[] = [];
  for (let i = 0; i < length; i++) {
    if (i >= overlap) {
      output.push(frames[i].slice());
      continue;
    }
    const weight = i / overlap;
    const from = frames[length + i];
    const to = frames[i];
    const blended = new Float32Array(from.length);
    for (let j = 0; j < blended.length; j++) {
      blended[j] = from[j] * (1 - weight) + to[j] * weight;
    }
    output.push(blended);
  }
  return output;
}
