import * as THREE from 'three';
import { rng } from './core.js';
import { dustVert, dustFrag } from './shaders.js';

/*
 * Cor própria, fora da PALETTE compartilhada: no tema escuro esses pontos
 * eram estrelas claras contra o espaço; usar PALETTE.ice aqui herdaria o tom
 * escuro que essa cor passou a ter no tema claro (para servir de destaque nos
 * outros capítulos) — e a poeira viraria pontos pretos flutuando sobre o
 * texto em toda a página. Um cinza-azulado bem claro lê como textura sutil,
 * não como manchas.
 */
const DUST_COLOR = new THREE.Color('#c7d1e6');

/**
 * Camada sempre ativa: nuvem de partículas que acompanha a câmera.
 * Garante que o canvas nunca fique vazio entre um capítulo e o próximo —
 * é o que faz a experiência WebGL parecer contínua em vez de "cenas soltas".
 */
export class Ambient {
  constructor(stage) {
    this.stage = stage;
    const count = stage.q.dust;
    const rand = rng(7351);

    const pos = new Float32Array(count * 3);
    const scale = new Float32Array(count);
    const seed = new Float32Array(count);

    // Distribuição em casca: nada exatamente sobre a câmera, nada muito longe.
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.pow(rand(), 0.6) * 34;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(rand() * 2 - 1);

      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.cos(phi) * r * 0.55;
      pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;

      scale[i] = 0.35 + Math.pow(rand(), 2) * 1.5;
      seed[i] = rand();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 1.3 },
        uPix: { value: 1 },
        uColor: { value: DUST_COLOR.clone() },
        uOpacity: { value: 0.22 },
      },
    });

    this.object = new THREE.Points(geo, this.mat);
    this.object.frustumCulled = false;
  }

  resize(vp) {
    this.mat.uniforms.uPix.value = vp.dpr;
  }

  update(t, dt, stage) {
    this.mat.uniforms.uTime.value = t;
    // Segue a câmera com folga, para o campo nunca "acabar".
    this.object.position.copy(stage.camera.position);
    this.object.rotation.y = t * 0.008;
  }
}
