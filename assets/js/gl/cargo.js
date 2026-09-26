import * as THREE from 'three';
import { PALETTE, rng } from './core.js';
import { cargoVert, cargoFrag } from './shaders.js';

/** As 12 arestas de um cubo unitário, como pares de vértices. */
const CUBE_EDGES = (() => {
  const c = [
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5],
    [0.5, 0.5, -0.5],
    [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5],
    [0.5, -0.5, 0.5],
    [0.5, 0.5, 0.5],
    [-0.5, 0.5, 0.5],
  ];
  const pairs = [
    [0, 1], [1, 2], [2, 3], [3, 0], // face traseira
    [4, 5], [5, 6], [6, 7], [7, 4], // face frontal
    [0, 4], [1, 5], [2, 6], [3, 7], // ligações
  ];
  return pairs.flatMap(([a, b]) => [...c[a], ...c[b]]);
})();

const VERTS_PER_CRATE = 24; // 12 arestas × 2 vértices

/**
 * Capítulo 2 — "carga fracionada".
 * Campo de volumes de tamanhos diferentes, desenhados pelas arestas, girando e
 * flutuando. Toda a animação vive no vertex shader: um único draw call para o
 * campo inteiro, sem recompor matrizes na CPU.
 */
export class CargoField {
  constructor(stage, { y = 0 } = {}) {
    this.stage = stage;
    this.y = y;
    this.weight = 0;

    this.count = stage.tierName === 'high' ? 78 : stage.tierName === 'mid' ? 54 : 34;

    this.object = new THREE.Group();
    this.object.position.y = y;

    const rand = rng(41077);
    const n = this.count * VERTS_PER_CRATE;

    const position = new Float32Array(n * 3);
    const center = new Float32Array(n * 3);
    const scale = new Float32Array(n * 3);
    const spin = new Float32Array(n * 3);
    const seed = new Float32Array(n);

    for (let i = 0; i < this.count; i++) {
      // Tudo atrás da origem: os volumes emolduram o conteúdo em vez de passar
      // por cima dos cards de serviço.
      const cx = (rand() - 0.5) * 56;
      const cy = (rand() - 0.5) * 30;
      const cz = -7 - rand() * 36;

      const sx = 0.9 + rand() * 2.1;
      const sy = 0.7 + rand() * 1.7;
      const sz = 0.8 + rand() * 1.9;

      const rx = (rand() - 0.5) * 0.34;
      const ry = (rand() - 0.5) * 0.4;
      const rz = (rand() - 0.5) * 0.28;

      const s = rand();

      for (let v = 0; v < VERTS_PER_CRATE; v++) {
        const iv = i * VERTS_PER_CRATE + v;
        position[iv * 3] = CUBE_EDGES[v * 3];
        position[iv * 3 + 1] = CUBE_EDGES[v * 3 + 1];
        position[iv * 3 + 2] = CUBE_EDGES[v * 3 + 2];

        center[iv * 3] = cx;
        center[iv * 3 + 1] = cy;
        center[iv * 3 + 2] = cz;

        scale[iv * 3] = sx;
        scale[iv * 3 + 1] = sy;
        scale[iv * 3 + 2] = sz;

        spin[iv * 3] = rx;
        spin[iv * 3 + 1] = ry;
        spin[iv * 3 + 2] = rz;

        seed[iv] = s;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 3));
    geo.setAttribute('aSpin', new THREE.BufferAttribute(spin, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: cargoVert,
      fragmentShader: cargoFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uNear: { value: PALETTE.orange.clone() },
        uMid: { value: PALETTE.ice.clone() },
        uFar: { value: PALETTE.steel.clone() },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uFogNear: { value: 13 },
        uFogFar: { value: 72 },
      },
    });

    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.object.add(this.mesh);
  }

  setWeight(w) {
    this.weight = w;
    const on = w > 0.002;
    this.object.visible = on;
    // Presença contida: com bloom ligado o campo cheio disputava atenção com
    // os cards de serviço, que são o conteúdo desta seção.
    if (on) this.mat.uniforms.uOpacity.value = w * 0.58;
  }

  update(t, dt, stage) {
    if (!this.object.visible) return;
    this.mat.uniforms.uTime.value = t;
    this.object.rotation.y = stage.pointer.x * 0.08;
    this.object.rotation.x = -stage.pointer.y * 0.05;
  }
}
