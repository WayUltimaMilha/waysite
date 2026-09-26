import * as THREE from 'three';
import { PALETTE, rng, clamp } from './core.js';
import {
  routeVert,
  routeFrag,
  floorVert,
  floorFrag,
  haloVert,
  haloFrag,
} from './shaders.js';

/**
 * Capítulo 1 — "malha de rotas".
 * Feixes de luz atravessando o espaço com pulsos correndo neles, um piso em
 * grade em perspectiva e cabeças de pulso brilhantes. Leitura pretendida:
 * rotas de distribuição vivas, não um plano de fundo decorativo.
 */
export class HeroRoutes {
  constructor(stage, { y = 0 } = {}) {
    this.stage = stage;
    this.y = y;
    this.weight = 0;

    this.object = new THREE.Group();
    this.object.position.y = y;

    this.routes = [];
    this.halos = [];

    this._buildRoutes();
    this._buildFloor();
  }

  _buildRoutes() {
    const q = this.stage.q;
    const rand = rng(20260817);
    const COUNT = 7;

    for (let i = 0; i < COUNT; i++) {
      // Cada rota atravessa a cena da esquerda para a direita, serpenteando.
      const lane = (i / (COUNT - 1) - 0.5) * 2; // -1 → 1
      const pts = [];
      const SEGMENTS = 5;

      for (let s = 0; s <= SEGMENTS; s++) {
        const u = s / SEGMENTS;
        pts.push(
          new THREE.Vector3(
            -30 + u * 60,
            lane * 6.5 + Math.sin(u * Math.PI * 1.6 + i) * 2.6 + (rand() - 0.5) * 1.4,
            -14 + rand() * 20 + Math.cos(u * Math.PI * 1.2 + i * 1.7) * 4,
          ),
        );
      }

      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.55);
      const geo = new THREE.TubeGeometry(curve, q.tubeSeg, 0.055 + rand() * 0.03, q.radial, false);

      const mat = new THREE.ShaderMaterial({
        vertexShader: routeVert,
        fragmentShader: routeFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: 0.045 + rand() * 0.05 },
          uOffset: { value: rand() },
          uOpacity: { value: 0 },
          uBase: { value: 0.05 + rand() * 0.04 },
          uColorLow: { value: PALETTE.steel.clone() },
          uColorHot: { value: (i % 3 === 0 ? PALETTE.orangeHot : PALETTE.ice).clone() },
        },
      });

      const mesh = new THREE.Mesh(geo, mat);
      this.object.add(mesh);
      this.routes.push({ mesh, mat, curve });

      // Cabeça luminosa acompanhando o pulso — só nas rotas "quentes".
      if (i % 3 === 0) {
        const halo = this._makeHalo(PALETTE.orangeHot, rand());
        this.object.add(halo.mesh);
        this.halos.push({ mesh: halo.mesh, haloMat: halo.mat, routeMat: mat, curve });
      }
    }
  }

  _makeHalo(color, phase) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: haloVert,
      fragmentShader: haloFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: color.clone() },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uPhase: { value: phase },
      },
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), mat);
    return { mesh, mat };
  }

  _buildFloor() {
    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: floorVert,
      fragmentShader: floorFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uLine: { value: PALETTE.cool.clone() },
        uGlow: { value: PALETTE.orange.clone() },
        uDensity: { value: 46 },
      },
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 260, 1, 1), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -9.5, -60);
    this.object.add(floor);
  }

  setWeight(w) {
    this.weight = w;
    const on = w > 0.002;
    this.object.visible = on;
    if (!on) return;

    for (const r of this.routes) r.mat.uniforms.uOpacity.value = w;
    for (const h of this.halos) h.haloMat.uniforms.uOpacity.value = w * 0.9;
    this.floorMat.uniforms.uOpacity.value = w * 0.85;
  }

  update(t, dt, stage) {
    if (!this.object.visible) return;

    for (const r of this.routes) r.mat.uniforms.uTime.value = t;
    this.floorMat.uniforms.uTime.value = t;

    // Halo cavalga a mesma fase do pulso do shader, então os dois coincidem.
    // O shader usa fract(u - t*speed + offset); a cabeça está em u = t*speed - offset.
    for (const h of this.halos) {
      const u = h.routeMat.uniforms;
      const raw = t * u.uSpeed.value - u.uOffset.value;
      const p = ((raw % 1) + 1) % 1;
      h.curve.getPointAt(clamp(p, 0.001, 0.999), h.mesh.position);
      h.mesh.quaternion.copy(stage.camera.quaternion);
      h.haloMat.uniforms.uTime.value = t;
    }

    // Parallax discreto: a malha reage ao ponteiro sem competir com o texto.
    this.object.rotation.y = stage.pointer.x * 0.05;
    this.object.rotation.x = -stage.pointer.y * 0.03;
  }
}
