import { Stage, supportsWebGL } from './gl/core.js';
import { Ambient } from './gl/ambient.js';
import { HeroRoutes } from './gl/hero.js';
import { CredSeal } from './gl/creds.js';
import { CargoField } from './gl/cargo.js';
import { SpMap } from './gl/mapa.js';
import { SignalNet } from './gl/tech.js';
import { Convergence } from './gl/finale.js';
import { World } from './gl/world.js';

import { initPreloader, initNav, initPageTransition, markCurrentLink } from './ui/nav.js';
import {
  initSmoothScroll,
  initProgressBar,
  initReveal,
  initCounters,
  initMarquee,
  initTrackConsole,
  revealLines,
} from './ui/motion.js';
import { initCursor, initSpotlight, initTilt, initMagnetic } from './ui/pointer.js';
import { initForms } from './ui/forms.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
 * Todos os capítulos compartilham a origem do mundo e trocam por crossfade.
 *
 * A alternativa — espalhar os capítulos pelo espaço e voar a câmera de um ao
 * outro — não funciona neste layout: as seções são adjacentes, sem intervalo de
 * rolagem entre elas, então a câmera não teria distância para percorrer e a
 * troca sairia como um salto. Na mesma origem, cada capítulo só faz o seu
 * movimento local e a dissolução resolve a passagem de um para o outro.
 */
const HERO_Y = 0;
const CRED_Y = 0;
const CARGO_Y = 0;
const MAP_Y = 0;
const TECH_Y = 0;
const FIN_Y = 0;

function buildWorld() {
  const canvas = document.getElementById('gl');
  if (!canvas) return;

  // O poster estático (.gl-fallback) já está pintado atrás do canvas. Remover
  // o canvas é tudo o que precisa acontecer para cair nele.
  if (reduced || !supportsWebGL()) {
    canvas.remove();
    return;
  }

  let stage;
  try {
    stage = new Stage(canvas);
  } catch (err) {
    console.warn('[way] WebGL indisponível, usando poster estático.', err);
    canvas.remove();
    return;
  }

  document.documentElement.dataset.glTier = stage.tierName;

  // Camada contínua: nunca desliga, garante que o canvas jamais fique vazio.
  stage.add(new Ambient(stage));

  const chapters = [];

  const heroEl = document.querySelector('#hero') || document.querySelector('[data-gl-hero]');
  if (heroEl) {
    const hero = stage.add(new HeroRoutes(stage, { y: HERO_Y }));
    chapters.push({
      el: heroEl,
      y: HERO_Y,
      chapter: hero,
      shots: [
        { at: 0, cam: [0, 2.4, 25], tgt: [0, 1.0, 0] },
        { at: 1, cam: [3.6, -1.2, 12.5], tgt: [-1.0, 0.4, -4] },
      ],
    });
  }

  const credEl = document.querySelector('#credenciais');
  if (credEl) {
    const seal = stage.add(new CredSeal(stage, { y: CRED_Y }));
    chapters.push({
      el: credEl,
      y: CRED_Y,
      chapter: seal,
      // Dolly curto e quase parado: o selo é um medalhão fixo, não um túnel
      // pra atravessar.
      shots: [
        { at: 0, cam: [0, 1.4, 8], tgt: [0, 1, -14] },
        { at: 1, cam: [0, 1.6, 3], tgt: [0, 1, -14] },
      ],
    });
  }

  const cargoEl = document.querySelector('#servicos');
  if (cargoEl) {
    const cargo = stage.add(new CargoField(stage, { y: CARGO_Y }));
    chapters.push({
      el: cargoEl,
      y: CARGO_Y,
      chapter: cargo,
      shots: [
        { at: 0, cam: [-2.0, 5.0, 26], tgt: [0, 0.5, 0] },
        { at: 1, cam: [2.5, -4.0, 12], tgt: [0, 0, -2] },
      ],
    });
  }

  const mapEl = document.querySelector('#regioes');
  if (mapEl) {
    const map = stage.add(
      new SpMap(stage, {
        y: MAP_Y,
        pinHost: document.getElementById('map-pins'),
        stageEl: mapEl.querySelector('.map__stage'),
        refDist: 22,
      }),
    );
    chapters.push({
      el: mapEl,
      y: MAP_Y,
      chapter: map,
      // Dolly puro: o mapa se ancora sozinho na sua coluna, então mover a
      // câmera na horizontal ou na vertical aqui seria cancelado.
      shots: [
        { at: 0, cam: [0, 0, 27], tgt: [0, 0, 0] },
        { at: 1, cam: [0, 0, 17.5], tgt: [0, 0, 0] },
      ],
    });
  }

  const techEl = document.querySelector('#tecnologia');
  if (techEl) {
    const tech = stage.add(new SignalNet(stage, { y: TECH_Y }));
    chapters.push({
      el: techEl,
      y: TECH_Y,
      chapter: tech,
      shots: [
        { at: 0, cam: [-3, 3.5, 14], tgt: [0, 1, -8] },
        { at: 1, cam: [2, -1.5, 4], tgt: [-2, 0.5, -14] },
      ],
    });
  }

  const finEl = document.querySelector('#fechamento');
  if (finEl) {
    const finale = stage.add(new Convergence(stage, { y: FIN_Y }));
    chapters.push({
      el: finEl,
      y: FIN_Y,
      chapter: finale,
      shots: [
        { at: 0, cam: [0, 1.2, 18], tgt: [0, 0.6, -3] },
        { at: 1, cam: [0, 2.0, 13], tgt: [0, 0.6, -2] },
      ],
    });
  }

  if (!chapters.length) {
    // Página sem capítulos declarados: mantém só a atmosfera.
    stage.camera.position.set(0, 0, 20);
    stage.start();
    canvas.classList.add('is-ready');
    return;
  }

  const world = stage.add(new World(stage, chapters));
  stage.resize(); // aplica fit/dpr agora que os capítulos existem
  stage.start();

  // Alça de inspeção: `window.__WAY_DEBUG = true` antes do carregamento expõe a
  // cena para depurar o trilho de câmera pelo console. Fora daí, custo zero.
  if (window.__WAY_DEBUG) window.way = { stage, world, chapters };

  requestAnimationFrame(() => canvas.classList.add('is-ready'));

  // A altura do documento muda com fontes, imagens e quebras de linha.
  // Sem remedir, o trilho de câmera fica dessincronizado do conteúdo.
  const remeasure = () => world.measure();
  let debounce;
  const onResize = () => {
    clearTimeout(debounce);
    debounce = setTimeout(remeasure, 120);
  };

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('load', remeasure);
  document.fonts?.ready.then(remeasure);
  setTimeout(remeasure, 900);

  if ('ResizeObserver' in window) {
    new ResizeObserver(onResize).observe(document.body);
  }
}

function boot() {
  markCurrentLink();
  initNav();
  initPageTransition();
  initSmoothScroll();
  initProgressBar();
  initReveal();
  initCounters();
  initMarquee();
  initTrackConsole();
  initSpotlight();
  initTilt();
  initMagnetic();
  initCursor();
  initForms();

  initPreloader(() => {
    revealLines();
    buildWorld();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
