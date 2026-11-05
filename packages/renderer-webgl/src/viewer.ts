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
  Vector2,
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

export interface Viewer {
  /** Show these particles. The viewer reads their positions every frame. */
  setParticles(state: ParticleState): void;
  /** Called once per frame before rendering, for example to advance a simulation. */
  onFrame(callback: (() => void) | null): void;
  /** Call after the canvas changes size. */
  resize(): void;
  dispose(): void;
}

export function createViewer(options: ViewerOptions): Viewer {
  const { canvas } = options;
  const brightness = options.brightness ?? 0.9;

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
  controls.autoRotate = options.autoRotate ?? true;
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
    controls.update();
    material.uniforms.uDistance.value = camera.position.length();
    composer.render();
  });

  return {
    setParticles,
    onFrame(callback) {
      frameCallback = callback;
    },
    resize,
    dispose() {
      renderer.setAnimationLoop(null);
      controls.dispose();
      points?.geometry.dispose();
      material.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
