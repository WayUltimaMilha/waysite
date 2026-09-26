import * as THREE from 'three';
import { EffectComposer } from '../vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/postprocessing/OutputPass.js';

/** Cor de fundo do canvas — precisa casar com --bg no CSS. */
export const BG = 0xf5f7fb;

/*
 * Paleta invertida para o tema claro: no dark, as cores pálidas eram os
 * "pontos quentes" (brilho estourando pra branco via blending aditivo); sobre
 * fundo claro esse mesmo aditivo lava tudo, então os traços agora usam
 * blending normal e a hierarquia de contraste se inverte — o tom mais escuro
 * e saturado é que chama atenção, não o mais claro.
 */
export const PALETTE = {
  navy: new THREE.Color('#123a8f'),
  navyDeep: new THREE.Color('#0b2a6b'),
  steel: new THREE.Color('#2358c9'),
  orange: new THREE.Color('#f58220'),
  orangeHot: new THREE.Color('#d9600f'),
  cool: new THREE.Color('#2c4a82'),
  // Território precisa ficar legível sem depender do bloom (tier low não tem).
  dotCool: new THREE.Color('#3c5c96'),
  ice: new THREE.Color('#0e2c58'),
};

/**
 * Decide o nível de qualidade a partir do hardware disponível.
 * Evita ligar bloom e milhares de partículas em Android intermediário.
 */
function detectTier() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 700;
  const coarse = window.matchMedia('(hover: none)').matches;

  if (coarse && (cores <= 4 || narrow)) return 'low';
  if (coarse || cores <= 4 || mem <= 4) return 'mid';
  return 'high';
}

/*
 * Bloom desligado em todos os tiers: a técnica clareia pixels acima de um
 * limiar de luminância, e sobre um fundo já claro isso satura a cena inteira
 * numa neblina branca em vez de destacar só os traços — todos os shaders já
 * foram calibrados para ler bem sem bloom.
 */
export const QUALITY = {
  low: { dpr: 1, bloom: false, dust: 320, dots: 2400, tubeSeg: 60, radial: 4 },
  mid: { dpr: 1.5, bloom: false, dust: 750, dots: 4500, tubeSeg: 110, radial: 6 },
  high: { dpr: 2, bloom: false, dust: 1500, dots: 7200, tubeSeg: 180, radial: 8 },
};

export function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.tierName = detectTier();
    this.q = QUALITY[this.tierName];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    this.camera.position.set(0, 1.6, 22);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.tierName !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setClearColor(BG, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.clock = new THREE.Clock();
    this.time = 0;
    this.running = false;
    this.visible = true;

    // Ponteiro normalizado (-1..1) com suavização, usado para parallax.
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();

    this.updaters = [];
    this._buildComposer();
    this._bind();
    this.resize();
  }

  _buildComposer() {
    const { renderer, scene, camera } = this;

    if (!this.q.bloom) {
      this.composer = null;
      return;
    }

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      this.tierName === 'high' ? 0.82 : 0.62, // strength
      0.72, // radius
      0.2, // threshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  _bind() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('orientationchange', this._onResize, { passive: true });

    this._onPointer = (e) => {
      this.pointerTarget.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -((e.clientY / window.innerHeight) * 2 - 1),
      );
    };
    window.addEventListener('pointermove', this._onPointer, { passive: true });

    // Não queima bateria com a aba em segundo plano.
    document.addEventListener('visibilitychange', () => {
      this.visible = !document.hidden;
      if (this.visible) this.clock.getDelta();
    });

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.running = false;
      document.documentElement.classList.add('gl-lost');
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr);

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);

    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
    }

    this.viewport = { w, h, dpr };
    this.updaters.forEach((u) => u.resize?.(this.viewport));
  }

  add(updater) {
    this.updaters.push(updater);
    if (updater.object) this.scene.add(updater.object);
    return updater;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    this._loop();
  }

  stop() {
    this.running = false;
  }

  _loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    if (!this.visible) return;

    // Delta limitado: evita saltos gigantes após a aba voltar do background.
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    this.pointer.lerp(this.pointerTarget, 1 - Math.pow(0.0015, dt));

    for (const u of this.updaters) u.update?.(this.time, dt, this);

    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };
}

/* ------------------------------------------------------------------ utilidades */

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export const lerp = (a, b, t) => a + (b - a) * t;

/** Interpolação suave com derivada zero nas pontas. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Janela de peso: 0 fora, 1 no centro do intervalo. Usada para crossfade. */
export function window01(x, start, end, fade = 0.18) {
  return smoothstep(start - fade, start + fade, x) * (1 - smoothstep(end - fade, end + fade, x));
}

/** Gerador determinístico — a cena precisa ser idêntica entre recarregamentos. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
