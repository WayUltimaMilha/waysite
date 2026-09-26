import * as THREE from 'three';
import { clamp, smoothstep } from './core.js';

const EASE = (t) => t * t * (3 - 2 * t);

/**
 * Trilho de câmera único ligado ao DOM.
 *
 * Cada capítulo declara os elementos a que está ancorado e dois ou mais
 * "shots" (posição de câmera + alvo) em progressos locais. Os shots de todos
 * os capítulos são achatados numa linha do tempo ordenada por posição de
 * scroll; a câmera interpola continuamente entre shots vizinhos. É isso que
 * costura os capítulos numa única viagem em vez de cenas independentes.
 */
export class World {
  constructor(stage, chapters) {
    this.stage = stage;
    this.chapters = chapters.filter((c) => c.el);

    this.camPos = new THREE.Vector3().copy(stage.camera.position);
    this.camTgt = new THREE.Vector3(0, 0, 0);
    this._pos = new THREE.Vector3();
    this._tgt = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();

    this.shots = [];
    this.measure();

    // Estado inicial sem interpolação, para o primeiro frame já nascer certo.
    this._sample(window.scrollY || 0, true);
  }

  /**
   * Recalcula a linha do tempo. Precisa rodar depois de fontes e imagens
   * assentarem — a altura do documento muda e os shots iriam para o lugar errado.
   */
  measure() {
    const vh = window.innerHeight;
    const scrollY = window.scrollY || 0;
    this.shots = [];

    // Ordena por posição no documento e impede que uma janela comece antes do
    // fim da anterior. Sem isso os shots de capítulos vizinhos se intercalam na
    // linha do tempo e a câmera anda para trás no meio da rolagem.
    const ordered = [...this.chapters].sort(
      (a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top,
    );

    let prevEnd = 0;

    ordered.forEach((ch, index) => {
      const rect = ch.el.getBoundingClientRect();
      const top = rect.top + scrollY;
      const height = rect.height;

      // O primeiro capítulo começa no topo absoluto; os demais, um pouco antes
      // de entrar em tela, para o capítulo já estar montado quando aparece.
      const enterBias = index === 0 ? 0 : vh * 0.7;
      const start = Math.max(0, top - enterBias, prevEnd);
      const end = Math.max(start + 1, top + height - vh * 0.3);
      prevEnd = end;

      ch._start = start;
      ch._end = end;

      // Capítulos que precisam ficar presos a uma coluna do layout fazem esse
      // alinhamento por conta própria, frame a frame (ver SpMap._align). Aqui
      // só existe o trilho de câmera.
      for (const shot of ch.shots) {
        this.shots.push({
          s: start + shot.at * (end - start),
          cam: new THREE.Vector3(shot.cam[0], shot.cam[1] + ch.y, shot.cam[2]),
          tgt: new THREE.Vector3(shot.tgt[0], shot.tgt[1] + ch.y, shot.tgt[2]),
        });
      }
    });

    this.shots.sort((a, b) => a.s - b.s);
  }

  _sample(scrollY, snap = false) {
    const shots = this.shots;
    if (!shots.length) return;

    if (scrollY <= shots[0].s) {
      this._pos.copy(shots[0].cam);
      this._tgt.copy(shots[0].tgt);
    } else if (scrollY >= shots[shots.length - 1].s) {
      this._pos.copy(shots[shots.length - 1].cam);
      this._tgt.copy(shots[shots.length - 1].tgt);
    } else {
      let i = 0;
      while (i < shots.length - 1 && shots[i + 1].s < scrollY) i++;
      const a = shots[i];
      const b = shots[i + 1];
      const span = Math.max(b.s - a.s, 1);
      const t = EASE(clamp((scrollY - a.s) / span));
      this._pos.copy(a.cam).lerp(b.cam, t);
      this._tgt.copy(a.tgt).lerp(b.tgt, t);
    }

    if (snap) {
      this.camPos.copy(this._pos);
      this.camTgt.copy(this._tgt);
    }
  }

  update(t, dt, stage) {
    const scrollY = window.scrollY || 0;
    this._sample(scrollY);

    // Amortecimento exponencial independente do framerate.
    const k = 1 - Math.pow(0.0009, dt);
    this.camPos.lerp(this._pos, k);
    this.camTgt.lerp(this._tgt, k);

    // Parallax de ponteiro somado por cima do trilho.
    stage.camera.position.set(
      this.camPos.x + stage.pointer.x * 0.85,
      this.camPos.y + stage.pointer.y * 0.55,
      this.camPos.z,
    );
    this._lookAt.set(
      this.camTgt.x + stage.pointer.x * 0.25,
      this.camTgt.y + stage.pointer.y * 0.18,
      this.camTgt.z,
    );
    stage.camera.lookAt(this._lookAt);

    // Peso e progresso por capítulo.
    for (const ch of this.chapters) {
      const span = ch._end - ch._start;
      const raw = span > 0 ? (scrollY - ch._start) / span : 0;

      // Janela deliberadamente maior que [0,1]: gera sobreposição na virada
      // entre capítulos, evitando um frame de tela vazia.
      const w = smoothstep(-0.16, 0.16, raw) * (1 - smoothstep(0.84, 1.16, raw));

      ch.chapter.setWeight?.(w);
      ch.chapter.setProgress?.(clamp(raw));
    }
  }
}
