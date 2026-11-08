import type { ParticleState, SolidBody, SolidMesh } from '@starforge/core';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ColorManagement,
  DoubleSide,
  DynamicDrawUsage,
  LinearSRGBColorSpace,
  Mesh,
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
/** Seconds for one loop of a preset's moving bodies, so a body turning once per loop takes this long. */
const LOOP_SECONDS = 36;

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

const meshVertexShader = /* glsl */ `
  attribute vec3 aColor;
  varying vec3 vColor;
  varying vec3 vNormal;

  void main() {
    vColor = aColor;
    vNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const meshFragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform float uExposure;
  varying vec3 vColor;
  varying vec3 vNormal;

  // The README renderer's key light, ambient level and rim, in view space.
  const vec3 LIGHT = vec3(-0.395, 0.543, 0.741);
  const vec3 RIM = vec3(0.12, 0.34, 0.3);

  void main() {
    vec3 n = normalize(vNormal);
    if (n.z < 0.0) n = -n;
    float lambert = max(dot(n, LIGHT), 0.0);
    float light = 0.32 + 0.68 * lambert;
    float edge = 1.0 - min(1.0, abs(n.z));
    vec3 color = min(vColor * light + RIM * edge * edge * 0.6, vec3(0.92));
    // Everything goes through tone mapping, so undo it here: the wood then lands on this colour.
    gl_FragColor = vec4(color / (vec3(1.0) - color) / uExposure, uOpacity);
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
  /** Index into the list passed to setHoverTargets, or into the bodies when `body` is true. */
  index: number;
  /** True when a solid body was hit instead of a particle. */
  body?: boolean;
  /** Where that particle is on screen, in viewport pixels. */
  x: number;
  y: number;
}

export interface Viewer {
  /** Show these particles. The viewer reads their positions every frame. */
  setParticles(state: ParticleState): void;
  /**
   * Show solid geometry (a preset's wood) as lit, depth-tested triangles that particles behind
   * it cannot show through. Pass null to fade it out. It eases in and out with the morph.
   */
  setMesh(mesh: SolidMesh | null): void;
  /**
   * Show solid bodies that move, such as orbiting balls. Each one is placed by its pose every
   * frame and turned to face the camera, so a logo on it stays readable. A body with a label can
   * be hovered. Pass null to fade them out together with the mesh.
   */
  setBodies(bodies: SolidBody[] | null): void;
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
  const exposure = options.exposure ?? 1.2;

  const renderer = new WebGLRenderer({ canvas, antialias: false });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = ReinhardToneMapping;
  renderer.toneMappingExposure = exposure;
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
    depthTest: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const meshMaterial = new ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uExposure: { value: exposure } },
    vertexShader: meshVertexShader,
    fragmentShader: meshFragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: true,
    side: DoubleSide,
  });
  let solid: Mesh | null = null;
  let wantMesh = false;
  let wantBodies = false;
  interface PlacedBody {
    body: SolidBody;
    mesh: Mesh;
    /** Radius of the body's mesh, for hit testing. */
    radius: number;
  }
  let placed: PlacedBody[] = [];

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
    if (!pointer) return null;
    const rect = canvas.getBoundingClientRect();
    camera.updateMatrixWorld();

    let best: HoverHit | null = null;
    let bestDistance = HIT_RADIUS;
    if (points && hoverTargets.length > 0) {
      const positions = (points.geometry.getAttribute('position') as BufferAttribute)
        .array as Float32Array;
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
    }

    // A solid body wins when the pointer is on it, however big it is on screen.
    const pixelsPerUnit = rect.height / 2 / Math.tan((camera.fov * Math.PI) / 360);
    for (let b = 0; b < placed.length; b++) {
      const item = placed[b];
      if (!item.body.label) continue;
      projected.copy(item.mesh.position).project(camera);
      if (projected.z > 1) continue;
      const x = (projected.x * 0.5 + 0.5) * rect.width;
      const y = (-projected.y * 0.5 + 0.5) * rect.height;
      const reach = Math.max(
        HIT_RADIUS,
        (item.radius * pixelsPerUnit) / camera.position.distanceTo(item.mesh.position),
      );
      if (Math.hypot(x - pointer.x, y - pointer.y) <= reach) {
        return { index: b, body: true, x: rect.left + x, y: rect.top + y };
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

  const geometryOf = (mesh: SolidMesh): BufferGeometry => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
    geometry.setAttribute('aColor', new BufferAttribute(mesh.colors, 3));
    geometry.setIndex(new BufferAttribute(mesh.indices, 1));
    return geometry;
  };

  function removeSolid(): void {
    if (!solid) return;
    scene.remove(solid);
    solid.geometry.dispose();
    solid = null;
  }

  function clearBodies(): void {
    for (const item of placed) {
      scene.remove(item.mesh);
      item.mesh.geometry.dispose();
    }
    placed = [];
  }

  function setMesh(mesh: SolidMesh | null): void {
    wantMesh = mesh !== null;
    if (!mesh) return;
    removeSolid();
    solid = new Mesh(geometryOf(mesh), meshMaterial);
    solid.frustumCulled = false;
    solid.renderOrder = -1;
    scene.add(solid);
  }

  function setBodies(bodies: SolidBody[] | null): void {
    wantBodies = bodies !== null && bodies.length > 0;
    if (!bodies || bodies.length === 0) return;
    clearBodies();
    for (const body of bodies) {
      const mesh = new Mesh(geometryOf(body.mesh), meshMaterial);
      mesh.frustumCulled = false;
      mesh.renderOrder = -1;
      scene.add(mesh);
      let radius = 0;
      const { positions } = body.mesh;
      for (let i = 0; i < positions.length; i += 3) {
        radius = Math.max(radius, Math.hypot(positions[i], positions[i + 1], positions[i + 2]));
      }
      placed.push({ body, mesh, radius });
    }
  }

  /** Ease the solids in or out so they follow the particles' morph, and place the moving bodies. */
  function stepMesh(): void {
    // Moving from a preset with one kind of solid to one with another swaps at once.
    if (!wantMesh && wantBodies) removeSolid();
    if (wantMesh && !wantBodies) clearBodies();
    if (!solid && placed.length === 0) return;

    const opacity = meshMaterial.uniforms.uOpacity;
    opacity.value += ((wantMesh || wantBodies ? 1 : 0) - opacity.value) * 0.05;
    if (!wantMesh && !wantBodies && opacity.value < 0.01) {
      removeSolid();
      clearBodies();
      opacity.value = 0;
      return;
    }

    const turns = performance.now() / 1000 / LOOP_SECONDS;
    for (const item of placed) {
      const pose = item.body.pose(turns);
      item.mesh.position.set(pose.x, pose.y, pose.z);
      // Turn the front towards the camera, so a logo stays readable from wherever you look.
      item.mesh.rotation.y = Math.atan2(camera.position.x - pose.x, camera.position.z - pose.z);
    }
  }

  renderer.setAnimationLoop(() => {
    frameCallback?.();
    if (points) (points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    stepView();
    stepMesh();
    controls.update();
    material.uniforms.uDistance.value = camera.position.length();
    updateHover();
    composer.render();
  });

  return {
    setParticles,
    setMesh,
    setBodies,
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
      solid?.geometry.dispose();
      clearBodies();
      meshMaterial.dispose();
      material.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
