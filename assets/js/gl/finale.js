import * as THREE from 'three';
import { PALETTE, smoothstep } from './core.js';
import { haloVert, haloFrag } from './shaders.js';

/**
 * Capítulo de encerramento — "respiração".
 * Nada de feixes convergindo: só um halo único e suave atrás do card da CTA
 * final, crescendo bem devagar conforme a seção entra em cena. É a menor
 * presença de todos os capítulos de propósito — aqui quem tem que segurar a
 * atenção é o texto e os botões, não a cena.
 */
export class Convergence {
  constructor(stage, { y = 0 } = {}) {
    this.stage = stage;
    this.y = y;
    this.weight = 0;
    this.progress = 0;

    this.object = new THREE.Group();
    this.object.position.set(0, y + 0.6, -4);

    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: haloVert,
      fragmentShader: haloFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: PALETTE.orangeHot.clone() },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uPhase: { value: 0 },
      },
    });
    this.core = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), this.coreMat);
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
    // Cresce bem devagar e nunca passa de um brilho de fundo.
    this.coreMat.uniforms.uOpacity.value =
      this.weight * smoothstep(0.1, 0.9, this.progress) * 0.14;
  }

  update(t, dt, stage) {
    if (!this.object.visible) return;
    this.coreMat.uniforms.uTime.value = t;
    // Sempre de frente pra câmera — é um brilho de fundo, não um objeto 3D.
    this.core.quaternion.copy(stage.camera.quaternion);
  }
}
