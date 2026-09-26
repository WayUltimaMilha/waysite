import * as THREE from 'three';
import { PALETTE, rng } from './core.js';
import { routeVert, routeFrag, haloVert, haloFrag, beamVert, beamFrag } from './shaders.js';

/**
 * Capítulo — "sinal".
 * Rede de nós conectados por pulsos de dados percorrendo uma grade em
 * serpentina — o mesmo motivo de tubo com pulso do herói, mas rígido como um
 * circuito, não fluido como uma rota. Dois feixes sobem como pacotes entrando
 * no sistema, ecoando o console de rastreamento ao lado. Presença contida de
 * propósito: fica atrás do texto e do mock do console, não compete com eles.
 */
export class SignalNet {
  constructor(stage, { y = 0 } = {}) {
    this.stage = stage;
    this.y = y;
    this.weight = 0;

    this.object = new THREE.Group();
    this.object.position.y = y;

    this.links = [];
    this.nodesLit = [];
    this.beams = [];

    this._buildGrid();
  }

  _buildGrid() {
    const q = this.stage.q;
    const rand = rng(88301);

    // Grade 3×3 com jitter, percorrida em serpentina — dá o desenho de um
    // circuito sem precisar de um solver de grafo.
    const cols = [-9, 0, 9];
    const rows = [7, 1.2, -4.6];
    const depths = [-10, -19, -28];

    const nodes = [];
    for (let r = 0; r < 3; r++) {
      const order = r % 2 === 0 ? [0, 1, 2] : [2, 1, 0];
      for (const c of order) {
        nodes.push(
          new THREE.Vector3(
            cols[c] + (rand() - 0.5) * 1.6,
            rows[r] + (rand() - 0.5) * 1.1,
            depths[r] + (rand() - 0.5) * 2.2,
          ),
        );
      }
    }

    for (let i = 0; i < nodes.length - 1; i++) {
      const curve = new THREE.LineCurve3(nodes[i], nodes[i + 1]);
      const geo = new THREE.TubeGeometry(
        curve,
        Math.max(6, Math.round(q.tubeSeg * 0.25)),
        0.05,
        q.radial,
        false,
      );
      const hot = i % 2 === 0;

      const mat = new THREE.ShaderMaterial({
        vertexShader: routeVert,
        fragmentShader: routeFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: 0.09 + rand() * 0.06 },
          uOffset: { value: rand() },
          uOpacity: { value: 0 },
          uBase: { value: 0.06 },
          uColorLow: { value: PALETTE.navyDeep.clone() },
          uColorHot: { value: (hot ? PALETTE.orangeHot : PALETTE.ice).clone() },
        },
      });

      const mesh = new THREE.Mesh(geo, mat);
      this.object.add(mesh);
      this.links.push(mat);
    }

    nodes.forEach((p, i) => {
      const hot = i % 3 === 0;
      const haloMat = new THREE.ShaderMaterial({
        vertexShader: haloVert,
        fragmentShader: haloFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uColor: { value: (hot ? PALETTE.orangeHot : PALETTE.dotCool).clone() },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uPhase: { value: i * 0.19 },
        },
      });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), haloMat);
      halo.position.copy(p);
      this.object.add(halo);
      this.nodesLit.push({ mat: haloMat, halo });

      // Só dois nós viram fonte de feixe — "coleta" e "entrega" da linha do
      // tempo do console, não cada nó da grade.
      if (i === 2 || i === 6) {
        const beamMat = new THREE.ShaderMaterial({
          vertexShader: beamVert,
          fragmentShader: beamFrag,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          uniforms: {
            uColor: { value: PALETTE.orange.clone() },
            uOpacity: { value: 0 },
            uTime: { value: 0 },
            uPhase: { value: i * 0.4 },
          },
        });
        const h = 3.2;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, h, 10, 1, true), beamMat);
        beam.position.set(p.x, p.y + h / 2, p.z);
        this.object.add(beam);
        this.beams.push(beamMat);
      }
    });
  }

  setWeight(w) {
    this.weight = w;
    const on = w > 0.002;
    this.object.visible = on;
    if (!on) return;

    for (const m of this.links) m.uniforms.uOpacity.value = w * 0.55;
    for (const n of this.nodesLit) n.mat.uniforms.uOpacity.value = w * 0.5;
    for (const m of this.beams) m.uniforms.uOpacity.value = w * 0.45;
  }

  update(t, dt, stage) {
    if (!this.object.visible) return;

    for (const m of this.links) m.uniforms.uTime.value = t;
    for (const n of this.nodesLit) {
      n.mat.uniforms.uTime.value = t;
      n.halo.quaternion.copy(stage.camera.quaternion);
    }
    for (const m of this.beams) m.uniforms.uTime.value = t;

    this.object.rotation.y = stage.pointer.x * 0.045;
    this.object.rotation.x = -stage.pointer.y * 0.03;
  }
}
