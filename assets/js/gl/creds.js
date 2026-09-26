import * as THREE from 'three';
import { PALETTE, smoothstep } from './core.js';
import { outlineVert, dialFrag, haloVert, haloFrag } from './shaders.js';

const RING_SEGMENTS = 144;
const RINGS = [
  { radius: 2.6, speed: 0.06, hot: false, ticks: 36 },
  { radius: 3.6, speed: -0.04, hot: true, ticks: 72 },
  { radius: 4.6, speed: 0.025, hot: false, ticks: 108 },
];
const TICKS = 6; // AE, AFE ×3, SIVISA, CRF

/**
 * Capítulo — "selo de licença".
 * Um único medalhão centralizado, não um túnel de portais: três anéis
 * concêntricos giram devagar como o mecanismo de um selo oficial, e seis
 * marcas ao redor do anel do meio acendem uma a uma conforme o scroll avança
 * — uma por credencial. Câmera quase parada de propósito: o efeito ancora a
 * seção sem competir com os cards de credenciais.
 */
export class CredSeal {
  constructor(stage, { y = 0 } = {}) {
    this.stage = stage;
    this.y = y;
    this.weight = 0;
    this.progress = 0;

    this.object = new THREE.Group();
    this.object.position.set(0, y + 1, -14);

    this.rings = [];
    this.ticks = [];

    this._buildRings();
    this._buildTicks();
    this._buildCore();
  }

  _buildRings() {
    for (const r of RINGS) {
      const pos = new Float32Array((RING_SEGMENTS + 1) * 3);
      const prog = new Float32Array(RING_SEGMENTS + 1);

      for (let s = 0; s <= RING_SEGMENTS; s++) {
        const a = (s / RING_SEGMENTS) * Math.PI * 2;
        pos[s * 3] = Math.cos(a) * r.radius;
        pos[s * 3 + 1] = Math.sin(a) * r.radius;
        pos[s * 3 + 2] = 0;
        prog[s] = s / RING_SEGMENTS;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aProgress', new THREE.BufferAttribute(prog, 1));

      const mat = new THREE.ShaderMaterial({
        vertexShader: outlineVert,
        fragmentShader: dialFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uDraw: { value: 0 },
          uOpacity: { value: 0 },
          uTicks: { value: r.ticks },
          uColor: { value: (r.hot ? PALETTE.steel : PALETTE.navy).clone() },
          uHot: { value: (r.hot ? PALETTE.orangeHot : PALETTE.ice).clone() },
        },
      });

      const line = new THREE.Line(geo, mat);
      this.object.add(line);
      this.rings.push({ line, mat, speed: r.speed });
    }
  }

  /** Seis marcas fixas ao redor do anel do meio — uma por credencial. */
  _buildTicks() {
    const midRadius = RINGS[1].radius;

    for (let i = 0; i < TICKS; i++) {
      const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2;

      const haloMat = new THREE.ShaderMaterial({
        vertexShader: haloVert,
        fragmentShader: haloFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uColor: { value: PALETTE.orangeHot.clone() },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uPhase: { value: i * 0.31 },
        },
      });

      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), haloMat);
      tick.position.set(Math.cos(a) * midRadius, Math.sin(a) * midRadius, 0.06);
      this.object.add(tick);
      this.ticks.push({ mat: haloMat, mesh: tick });
    }
  }

  _buildCore() {
    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: haloVert,
      fragmentShader: haloFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: PALETTE.navyDeep.clone() },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uPhase: { value: 0 },
      },
    });
    this.core = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), this.coreMat);
    this.object.add(this.core);
  }

  setWeight(w) {
    this.weight = w;
    const on = w > 0.002;
    this.object.visible = on;
    if (!on) return;
    this._apply();
  }

  setProgress(p) {
    this.progress = p;
    this._apply();
  }

  _apply() {
    // Os três anéis se traçam juntos logo no início da seção — o selo
    // "aparece completo" cedo, e o resto do scroll é sobre os ticks acendendo.
    const ringDraw = smoothstep(0, 0.3, this.progress);
    for (const r of this.rings) {
      r.mat.uniforms.uDraw.value = ringDraw;
      r.mat.uniforms.uOpacity.value = this.weight * ringDraw * 0.6;
    }

    const n = this.ticks.length;
    this.ticks.forEach((t, i) => {
      const start = 0.15 + (i / n) * 0.75;
      const reveal = smoothstep(start, start + 0.12, this.progress);
      t.mat.uniforms.uOpacity.value = this.weight * reveal * 0.85;
    });

    this.coreMat.uniforms.uOpacity.value =
      this.weight * smoothstep(0.05, 0.35, this.progress) * 0.4;
  }

  update(t, dt, stage) {
    if (!this.object.visible) return;

    for (const r of this.rings) {
      r.mat.uniforms.uTime.value = t;
      r.line.rotation.z += r.speed * dt;
    }
    for (const tk of this.ticks) {
      tk.mat.uniforms.uTime.value = t;
      tk.mesh.quaternion.copy(stage.camera.quaternion);
    }
    this.coreMat.uniforms.uTime.value = t;
    this.core.quaternion.copy(stage.camera.quaternion);

    this.object.rotation.y = stage.pointer.x * 0.03;
  }
}
