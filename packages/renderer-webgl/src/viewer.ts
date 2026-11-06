import type { ParticleState } from '@starforge/core';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ColorManagement,
  DynamicDrawUsage,
  LinearSRGBColorSpace,
  PerspectiveCamera,
  Points,
  ReinhardToneMapping,
  Scene,
  ShaderMaterial,
  Spherical,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Starforge colours are display-referred sRGB, so stop three.js from converting them.
ColorManagement.enabled = false;

/** Particle count the base brightness and sprite size were tuned for. */
const REFERENCE_PARTICLES = 6000;
/** How close, in CSS pixels, the pointer must be to a data particle to select it. */
const HIT_RADIUS = 22;
/** A touch that moves less than this many pixels counts as a tap, not a drag. */
const TAP_SLOP = 8;

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float size;
  uniform float uScale;
  uniform float uDistance;
  varying vec3 vColor;
  varying float vFade;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float depth = max(-viewPosition.z, 0.1);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(size * uScale / depth, 1.5, 96.0);
    vFade = clamp(uDistance / depth, 0.3, 1.5);
    vColor = aColor;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uGain;
  varying vec3 vColor;
  varying float vFade;

  void main() {
    vec2 offset = gl_PointCoord - 0.5;
    float edge = dot(offset, offset) * 4.0;
    if (edge >= 1.0) discard;
    float falloff = (1.0 - edge) * (1.0 - edge);
    gl_FragColor = vec4(vColor * vFade * falloff * uGain, 1.0);
  }
`;

export interface ViewerOptions {
  canvas: HTMLCanvasElement;
  /** Background as "#rrggbb". Default matches the README renderer. */
  background?: string;
  /** Strength of the glow around bright particles. Default 0.35. */
  bloomStrength?: number;
  /** Exposure applied before tone mapping. Default 1.2. */
  exposure?: number;
  /** Multiplies every particle's light. Default 0.9. Scaled down automatically for dense scenes. */
  brightness?: number;
  autoRotate?: boolean;
}

export interface HoverHit {
  /** Index into the list passed to setHoverTargets. */
  index: number;
  /** Where that particle is on screen, in viewport pixels. */
  x: number;
  y: number;
}

export interface Viewer {
  /** Show these particles. The viewer reads their positions every frame. */
  setParticles(state: ParticleState): void;
  /** Called once per frame before rendering, for example to advance a simulation. */
  onFrame(callback: (() => void) | null): void;
  /** Which particles can be hovered or tapped, as indices into the particle state. */
  setHoverTargets(particles: number[]): void;
  /**
   * Called every frame while a target is under the pointer or finger, and once with null
   * when it stops being selected. Auto-rotation pauses while something is selected.
   */
  onHover(callback: ((hit: HoverHit | null) => void) | null): void;
  /** Call after changing colours or sizes in the particle state, so they are uploaded again. */
  invalidateAppearance(): void;
  /** Smoothly move the camera to this tilt and distance, keeping the current rotation. */
  setView(view: { pitch: number; distance: number }): void;
  /** Call after the canvas changes size. */
  resize(): void;
  dispose(): void;
}

export function createViewer(options: ViewerOptions): Viewer {
  const { canvas } = options;
  const brightness = options.brightness ?? 0.9;
  const autoRotate = options.autoRotate ?? true;

  const renderer = new WebGLRenderer({ canvas, antialias: false });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = ReinhardToneMapping;
  renderer.toneMappingExposure = options.exposure ?? 1.2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  scene.background = new Color(options.background ?? '#05080f');

  const camera = new PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(0, 14, 24);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 0.6;
  controls.minDistance = 8;
  controls.maxDistance = 70;

  const material = new ShaderMaterial({
    uniforms: {
      uScale: { value: 1 },
      uDistance: { value: 28 },
      uGain: { value: brightness },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(new Vector2(1, 1), options.bloomStrength ?? 0.35, 0.5, 0.55),
  );
  composer.addPass(new OutputPass());

  let points: Points | null = null;
  let frameCallback: (() => void) | null = null;

  let hoverTargets: number[] = [];
  let hoverCallback: ((hit: HoverHit | null) => void) | null = null;
  let pointer: { x: number; y: number } | null = null;
  let pointerKind = 'mouse';
  let downAt: { x: number; y: number } | null = null;
  let hadHit = false;
  const projected = new Vector3();

  const local = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    pointerKind = event.pointerType;
    pointer = event.buttons === 0 ? local(event) : null;
  };

  const onPointerLeave = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') pointer = null;
  };

  const onPointerDown = (event: PointerEvent): void => {
    pointerKind = event.pointerType;
    downAt = { x: event.clientX, y: event.clientY };
    pointer = null;
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      const tapped =
        downAt !== null &&
        Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) < TAP_SLOP;
      pointer = tapped ? local(event) : null;
    } else {
      pointer = local(event);
    }
    downAt = null;
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);

  function pick(): HoverHit | null {
    if (!pointer || !points || hoverTargets.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const positions = (points.geometry.getAttribute('position') as BufferAttribute)
      .array as Float32Array;
    camera.updateMatrixWorld();

    let best: HoverHit | null = null;
    let bestDistance = HIT_RADIUS;
    for (let k = 0; k < hoverTargets.length; k++) {
      const offset = hoverTargets[k] * 3;
      projected
        .set(positions[offset], positions[offset + 1], positions[offset + 2])
        .project(camera);
      if (projected.z > 1) continue;
      const x = (projected.x * 0.5 + 0.5) * rect.width;
      const y = (-projected.y * 0.5 + 0.5) * rect.height;
      const distance = Math.hypot(x - pointer.x, y - pointer.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { index: k, x: rect.left + x, y: rect.top + y };
      }
    }
    return best;
  }

  function updateHover(): void {
    if (!hoverCallback) return;
    const hit = pick();
    controls.autoRotate = hit ? false : autoRotate;
    canvas.style.cursor = hit ? 'pointer' : '';
    if (!hit && pointerKind === 'touch') pointer = null;
    if (hit || hadHit) hoverCallback(hit);
    hadHit = hit !== null;
  }

  function resize(): void {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const focalPixels =
      (height * renderer.getPixelRatio()) / 2 / Math.tan((camera.fov * Math.PI) / 360);
    material.uniforms.uScale.value = 0.22 * focalPixels;
  }

  let viewTarget: { pitch: number; distance: number } | null = null;
  const spherical = new Spherical();
  const viewOffset = new Vector3();

  function stepView(): void {
    if (!viewTarget) return;
    viewOffset.copy(camera.position).sub(controls.target);
    spherical.setFromVector3(viewOffset);
    const pitch = Math.PI / 2 - spherical.phi;
    const nextPitch = pitch + (viewTarget.pitch - pitch) * 0.06;
    const nextRadius = spherical.radius + (viewTarget.distance - spherical.radius) * 0.06;
    spherical.phi = Math.PI / 2 - nextPitch;
    spherical.radius = nextRadius;
    viewOffset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(viewOffset);
    camera.lookAt(controls.target);
    if (
      Math.abs(nextPitch - viewTarget.pitch) < 0.002 &&
      Math.abs(nextRadius - viewTarget.distance) < 0.05
    ) {
      viewTarget = null;
    }
  }

  function invalidateAppearance(): void {
    if (!points) return;
    (points.geometry.getAttribute('aColor') as BufferAttribute).needsUpdate = true;
    (points.geometry.getAttribute('size') as BufferAttribute).needsUpdate = true;
  }

  function setParticles(state: ParticleState): void {
    if (points) {
      scene.remove(points);
      points.geometry.dispose();
    }
    const density = Math.sqrt(REFERENCE_PARTICLES / Math.max(state.count, 1));
    material.uniforms.uGain.value = brightness * Math.min(density, 1.5);

    const geometry = new BufferGeometry();
    const position = new BufferAttribute(state.position, 3);
    position.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('aColor', new BufferAttribute(state.color, 3));
    geometry.setAttribute('size', new BufferAttribute(state.size, 1));
    points = new Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
  }

  renderer.setAnimationLoop(() => {
    frameCallback?.();
    if (points) (points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    stepView();
    controls.update();
    material.uniforms.uDistance.value = camera.position.length();
    updateHover();
    composer.render();
  });

  return {
    setParticles,
    onFrame(callback) {
      frameCallback = callback;
    },
    setHoverTargets(particles) {
      hoverTargets = particles;
    },
    onHover(callback) {
      hoverCallback = callback;
      if (!callback) hadHit = false;
    },
    resize,
    invalidateAppearance,
    setView(view) {
      viewTarget = { pitch: view.pitch, distance: view.distance };
    },
    dispose() {
      renderer.setAnimationLoop(null);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      points?.geometry.dispose();
      material.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
