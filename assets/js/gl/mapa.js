import * as THREE from 'three';
import { PALETTE, rng, smoothstep } from './core.js';
import { SP_RINGS } from '../../data/sp-rings.js';
import { HUBS, LINHAS, CAPITAL } from '../../data/regioes.js';
import {
  mapDotVert,
  mapDotFrag,
  outlineVert,
  outlineFrag,
  arcVert,
  arcFrag,
  haloVert,
  haloFrag,
  beamVert,
  beamFrag,
} from './shaders.js';

const DEG = Math.PI / 180;
const TARGET_W = 16; // largura do estado em unidades de mundo
const HUB_R = 0.3; // raio, em unidades, considerado "dentro do polo"

/**
 * Projeção equirretangular local com correção de longitude na latitude média.
 * Não é cartografia de precisão — é uma silhueta fiel o suficiente para o
 * estado ser reconhecido de imediato, usando a malha oficial do IBGE.
 */
function makeProjector(rings) {
  let minLng = 1e9;
  let maxLng = -1e9;
  let minLat = 1e9;
  let maxLat = -1e9;

  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  const lng0 = (minLng + maxLng) / 2;
  const lat0 = (minLat + maxLat) / 2;
  const kx = Math.cos(lat0 * DEG);

  const rawW = (maxLng - minLng) * kx;
  const rawH = maxLat - minLat;
  const scale = TARGET_W / Math.max(rawW, rawH);

  const project = (lng, lat) => ({
    x: (lng - lng0) * kx * scale,
    y: (lat - lat0) * scale,
  });

  return { project, scale, bbox: { minLng, maxLng, minLat, maxLat }, rawW, rawH };
}

/** Ray casting padrão. Anéis do IBGE vêm fechados o suficiente para isso. */
function insideRing(ring, lng, lat) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Capítulo 3 — "regiões atendidas".
 * Contorno real do estado de São Paulo traçado em luz, matriz de pontos
 * preenchendo o território, polos operacionais com feixe vertical e arcos de
 * rota saindo do polo de Barueri. Rótulos são HTML projetado, não textura.
 */
export class SpMap {
  constructor(stage, { y = -130, pinHost = null, stageEl = null, refDist = 18 } = {}) {
    this.stage = stage;
    this.y = y;
    this.weight = 0;
    this.progress = 0;
    this.pinHost = pinHost;
    this.stageEl = stageEl;
    this.refDist = refDist;

    this.object = new THREE.Group();
    this.object.position.y = y;
    this.object.rotation.x = -0.34; // leve inclinação: dá volume sem distorcer

    this.proj = makeProjector(SP_RINGS);

    this.nodes = [...HUBS, ...LINHAS].map((n) => {
      const p = this.proj.project(n.lng, n.lat);
      return { ...n, x: p.x, y: p.y };
    });
    const cap = this.proj.project(CAPITAL.lng, CAPITAL.lat);
    this.capital = { ...CAPITAL, x: cap.x, y: cap.y };

    this.outlines = [];
    this.arcs = [];
    this.beams = [];
    this.halos = [];
    this.pins = [];

    this._buildOutline();
    this._buildDots();
    this._buildNodes();
    this._buildArcs();
    if (pinHost) this._buildPins();

    this._v = new THREE.Vector3();
  }

  /* --------------------------------------------------------------- contorno */

  _buildOutline() {
    for (const ring of SP_RINGS) {
      const pts = ring.map(([lng, lat]) => this.proj.project(lng, lat));
      pts.push(pts[0]); // fecha o anel

      const pos = new Float32Array(pts.length * 3);
      const prog = new Float32Array(pts.length);

      let total = 0;
      const seg = [0];
      for (let i = 1; i < pts.length; i++) {
        total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        seg.push(total);
      }

      for (let i = 0; i < pts.length; i++) {
        pos[i * 3] = pts[i].x;
        pos[i * 3 + 1] = pts[i].y;
        pos[i * 3 + 2] = 0;
        prog[i] = total > 0 ? seg[i] / total : 0;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aProgress', new THREE.BufferAttribute(prog, 1));

      const mat = new THREE.ShaderMaterial({
        vertexShader: outlineVert,
        fragmentShader: outlineFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uDraw: { value: 0 },
          uOpacity: { value: 0 },
          uColor: { value: PALETTE.steel.clone() },
          uHot: { value: PALETTE.orangeHot.clone() },
        },
      });

      const line = new THREE.Line(geo, mat);
      this.object.add(line);
      this.outlines.push(mat);
    }
  }

  /* ------------------------------------------------------- matriz de pontos */

  _buildDots() {
    const { bbox, rawW, rawH } = this.proj;
    const want = this.stage.q.dots;

    // São Paulo ocupa ~44% da própria bounding box (248 mil km² contra ~564
    // mil). Sem esse fator o passo sai grande e a malha nasce rala.
    const FILL = 0.44;
    const step = Math.sqrt((rawW * rawH * FILL) / want);
    const stepLng = step / Math.cos(((bbox.minLat + bbox.maxLat) / 2) * DEG);
    const stepLat = step;

    const rand = rng(90210);
    const xs = [];
    const ys = [];

    for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += stepLat) {
      for (let lng = bbox.minLng; lng <= bbox.maxLng; lng += stepLng) {
        // Jitter leve evita moiré e o aspecto de papel milimetrado.
        const jl = lng + (rand() - 0.5) * stepLng * 0.55;
        const ja = lat + (rand() - 0.5) * stepLat * 0.55;

        let inside = false;
        for (const ring of SP_RINGS) {
          if (insideRing(ring, jl, ja)) {
            inside = true;
            break;
          }
        }
        if (!inside) continue;

        const p = this.proj.project(jl, ja);
        xs.push(p.x);
        ys.push(p.y);
      }
    }

    const n = xs.length;
    const pos = new Float32Array(n * 3);
    const dist = new Float32Array(n);
    const seed = new Float32Array(n);
    const hub = new Float32Array(n);

    let maxD = 0;
    const raw = new Float32Array(n);
    const seedGen = rng(5150);

    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (const node of this.nodes) {
        const d = Math.hypot(xs[i] - node.x, ys[i] - node.y);
        if (d < best) best = d;
      }
      raw[i] = best;
      if (best > maxD) maxD = best;
    }

    for (let i = 0; i < n; i++) {
      pos[i * 3] = xs[i];
      pos[i * 3 + 1] = ys[i];
      pos[i * 3 + 2] = 0;
      dist[i] = maxD > 0 ? raw[i] / maxD : 0;
      hub[i] = raw[i] < HUB_R ? 1 : 0;
      seed[i] = seedGen();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aHub', new THREE.BufferAttribute(hub, 1));

    this.dotMat = new THREE.ShaderMaterial({
      vertexShader: mapDotVert,
      fragmentShader: mapDotFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uWave: { value: 0 },
        uSize: { value: 1.7 },
        uPix: { value: 1 },
        uReveal: { value: 0 },
        uCool: { value: PALETTE.dotCool.clone() },
        uHot: { value: PALETTE.orange.clone() },
        uOpacity: { value: 0 },
      },
    });

    this.dots = new THREE.Points(geo, this.dotMat);
    this.dots.frustumCulled = false;
    this.object.add(this.dots);
    this.dotCount = n;
  }

  /* ------------------------------------------------------- polos e feixes */

  _buildNodes() {
    this.nodes.forEach((node, i) => {
      const isPolo = node.tipo === 'polo';
      const color = isPolo ? PALETTE.orange : PALETTE.orangeHot;

      // Mancha de luz sobre o território.
      const haloMat = new THREE.ShaderMaterial({
        vertexShader: haloVert,
        fragmentShader: haloFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uColor: { value: color.clone() },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uPhase: { value: i * 0.23 },
        },
      });
      const size = isPolo ? 1.5 : 1.2;
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(size, size), haloMat);
      halo.position.set(node.x, node.y, 0.02);
      this.object.add(halo);
      this.halos.push(haloMat);

      // Feixe vertical: cone aberto, simétrico — dispensa billboard.
      const h = isPolo ? 2.4 : 1.7;
      const beamMat = new THREE.ShaderMaterial({
        vertexShader: beamVert,
        fragmentShader: beamFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        uniforms: {
          uColor: { value: color.clone() },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uPhase: { value: i * 0.31 },
        },
      });
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.16, h, 10, 1, true),
        beamMat,
      );
      beam.rotation.x = Math.PI / 2; // eixo Y do cilindro → +Z do mapa
      beam.position.set(node.x, node.y, h / 2);
      this.object.add(beam);
      this.beams.push({ mat: beamMat, h });

      node.beamTop = h;
    });
  }

  /* ------------------------------------------------------------------ arcos */

  _buildArcs() {
    // Barueri concentra a operação da Grande SP: é a origem visual das rotas.
    const origin = this.nodes.find((n) => n.id === 'barueri') || this.nodes[0];

    for (const node of this.nodes) {
      if (node === origin) continue;

      const a = new THREE.Vector3(origin.x, origin.y, 0.05);
      const b = new THREE.Vector3(node.x, node.y, 0.05);
      const span = a.distanceTo(b);

      const mid = a.clone().lerp(b, 0.5);
      mid.z += span * 0.46 + 0.6;

      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const radial = this.stage.tierName === 'low' ? 5 : 7;
      const geo = new THREE.TubeGeometry(curve, 88, 0.038, radial, false);

      const isLinha = node.tipo === 'linha';
      const mat = new THREE.ShaderMaterial({
        vertexShader: arcVert,
        fragmentShader: arcFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: isLinha ? 0.16 : 0.24 },
          uOffset: { value: Math.random() * 0.5 },
          uDraw: { value: 0 },
          uOpacity: { value: 0 },
          uColor: { value: (isLinha ? PALETTE.steel : PALETTE.dotCool).clone() },
          uHot: { value: (isLinha ? PALETTE.orangeHot : PALETTE.orange).clone() },
        },
      });

      this.object.add(new THREE.Mesh(geo, mat));
      this.arcs.push(mat);
    }
  }

  /* ------------------------------------------------------------ rótulos DOM */

  _buildPins() {
    for (const node of this.nodes) {
      const left = node.lado === 'esquerda';

      const el = document.createElement('div');
      el.className = [
        'pin',
        node.tipo === 'linha' ? 'pin--linha' : '',
        left ? 'pin--esquerda' : 'pin--direita',
      ]
        .filter(Boolean)
        .join(' ');
      el.innerHTML = `<b>${node.unidade}</b><i>${node.regiao}</i>`;
      this.pinHost.appendChild(el);

      this.pins.push({
        el,
        // Etiqueta ancorada pela borda, não pelo centro: sai lateralmente do
        // polo em vez de cobri-lo, e polos em latitude parecida (Barueri e
        // Votorantim) apontam para lados opostos e deixam de se sobrepor.
        prefersLeft: left,
        local: new THREE.Vector3(node.x, node.y, (node.beamTop || 1.8) + 0.3),
      });
    }
  }

  /* ----------------------------------------------------------------- ciclo */

  resize(vp) {
    if (this.dotMat) this.dotMat.uniforms.uPix.value = vp.dpr;
    this.fit(vp);
  }

  /**
   * Escala o estado para caber na coluna que o layout reservou.
   * Sem isso, no celular (coluna estreita, aspecto vertical) o mapa nasceria
   * duas vezes mais largo que a tela.
   */
  fit(vp) {
    const cam = this.stage.camera;
    const visibleW = 2 * Math.tan((cam.fov * Math.PI) / 360) * this.refDist * cam.aspect;

    let fraction = 0.9;
    if (this.stageEl) {
      const r = this.stageEl.getBoundingClientRect();
      // Um pouco mais largo que a coluna: o mapa sangra de propósito na borda,
      // mas o teto evita que a altura estoure o frustum no shot mais próximo.
      if (r.width > 0) fraction = Math.min((r.width / vp.w) * 0.94, 0.94);
    }

    const scale = Math.min(Math.max((visibleW * fraction) / TARGET_W, 0.34), 1.15);
    this.object.scale.setScalar(scale);
    this.scaleNow = scale;
  }

  setWeight(w) {
    this.weight = w;
    const on = w > 0.002;
    this.object.visible = on;

    for (const m of this.outlines) m.uniforms.uOpacity.value = w;
    for (const m of this.arcs) m.uniforms.uOpacity.value = w;
    for (const m of this.halos) m.uniforms.uOpacity.value = w * 0.6;
    for (const b of this.beams) b.mat.uniforms.uOpacity.value = w;
    if (this.dotMat) this.dotMat.uniforms.uOpacity.value = w;

    if (!on) {
      for (const p of this.pins) p.el.classList.remove('is-on');
    }
  }

  setProgress(p) {
    this.progress = p;

    const draw = smoothstep(0.0, 0.34, p);
    for (const m of this.outlines) m.uniforms.uDraw.value = draw;

    if (this.dotMat) this.dotMat.uniforms.uReveal.value = smoothstep(0.05, 0.5, p);

    const arcDraw = smoothstep(0.22, 0.62, p);
    for (const m of this.arcs) m.uniforms.uDraw.value = arcDraw;
  }

  /**
   * Ancora o mapa no elemento que o layout reservou para ele, a cada frame.
   *
   * Um deslocamento fixo calculado na medição não resolve: no mobile a coluna
   * do mapa fica *abaixo* do texto, então sem alinhamento vertical o estado
   * renderizava por cima dos parágrafos. Aqui o objeto é projetado de volta
   * para o centro do elemento, e passa a se comportar como se fosse ele.
   */
  _align(stage) {
    if (!this.stageEl) return;
    const r = this.stageEl.getBoundingClientRect();
    if (!r.width) return;

    const { w, h } = stage.viewport;
    const cam = stage.camera;

    const ndcX = ((r.left + r.width / 2) / w) * 2 - 1;
    const ndcY = -(((r.top + r.height / 2) / h) * 2 - 1);

    const dist = Math.max(cam.position.z, 1);
    const halfH = Math.tan((cam.fov * Math.PI) / 360) * dist;
    const halfW = halfH * cam.aspect;

    this.object.position.x = cam.position.x + ndcX * halfW;
    this.object.position.y = cam.position.y + ndcY * halfH;
  }

  update(t, dt, stage) {
    if (!this.object.visible) return;

    // Lê layout antes de escrever os transforms dos rótulos, para não forçar
    // dois reflows no mesmo frame.
    this._align(stage);

    for (const m of this.outlines) m.uniforms.uTime.value = t;
    for (const m of this.arcs) m.uniforms.uTime.value = t;
    for (const m of this.halos) m.uniforms.uTime.value = t;
    for (const b of this.beams) b.mat.uniforms.uTime.value = t;

    if (this.dotMat) {
      this.dotMat.uniforms.uTime.value = t;
      // Onda de cobertura saindo dos polos, em loop.
      this.dotMat.uniforms.uWave.value = (t * 0.115) % 1.25;
    }

    // Rotação sutil respondendo ao ponteiro, mantendo a inclinação base.
    this.object.rotation.z = stage.pointer.x * 0.035;
    this.object.rotation.x = -0.34 - stage.pointer.y * 0.05;

    this._projectPins(stage);
  }

  _projectPins(stage) {
    if (!this.pins.length) return;

    const { w, h } = stage.viewport;

    // Em tela estreita cinco etiquetas sobre um mapa de ~350px viram sopa de
    // letrinhas — e os quatro polos já estão nomeados na legenda ao lado.
    const room = w >= 760;
    const show = room && this.weight > 0.3 && this.progress > 0.22;

    this.object.updateWorldMatrix(true, false);

    const pad = 12;
    const placed = [];

    for (const pin of this.pins) {
      if (!show) {
        pin.el.classList.remove('is-on');
        continue;
      }

      this._v.copy(pin.local).applyMatrix4(this.object.matrixWorld).project(stage.camera);

      // Atrás da câmera ou fora do frustum: esconde em vez de grudar na borda.
      if (this._v.z > 1 || Math.abs(this._v.x) > 1.15 || Math.abs(this._v.y) > 1.15) {
        pin.el.classList.remove('is-on');
        continue;
      }

      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;

      // Inverte o lado quando a etiqueta não caberia na borda da janela.
      const lw = pin.el.offsetWidth || 150;
      let left = pin.prefersLeft;
      if (left && x - lw < pad) left = false;
      else if (!left && x + lw > w - pad) left = true;

      placed.push({ pin, x, y, left, lw, lh: pin.el.offsetHeight || 26 });
    }

    // De-colisão vertical por lado de ancoragem.
    //
    // Barueri e Votorantim ficam a 0,04° de latitude um do outro: projetados,
    // caem praticamente na mesma linha. Escolher lados opostos resolve só
    // enquanto os dois couberem na janela — quando um deles inverte por falta
    // de espaço, as etiquetas voltam a se sobrepor. Aqui a separação é medida.
    for (const side of [true, false]) {
      const group = placed.filter((p) => p.left === side).sort((a, b) => a.y - b.y);
      for (let i = 1; i < group.length; i++) {
        const gap = group[i - 1].lh + 6;
        if (group[i].y - group[i - 1].y < gap) group[i].y = group[i - 1].y + gap;
      }
    }

    placed.forEach((p, i) => {
      p.pin.el.classList.toggle('pin--esquerda', p.left);
      p.pin.el.classList.toggle('pin--direita', !p.left);
      p.pin.el.style.transform =
        `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(${p.left ? '-100%' : '0%'}, -50%)`;
      // Entrada escalonada: os rótulos não aparecem todos de uma vez.
      p.pin.el.style.transitionDelay = `${i * 90}ms`;
      p.pin.el.classList.add('is-on');
    });
  }
}

export { TARGET_W as MAP_WIDTH };
