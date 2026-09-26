/**
 * Efeitos de ponteiro: cursor customizado, luz que segue o mouse nos cards e
 * inclinação 3D. Só liga em dispositivos com mouse de precisão — em toque
 * seria peso morto e atrapalharia o tap.
 */

const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initCursor() {
  if (!fine || reduced) return;

  const el = document.createElement('div');
  el.className = 'cursor';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let tx = x;
  let ty = y;
  let on = false;

  window.addEventListener(
    'pointermove',
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!on) {
        on = true;
        x = tx;
        y = ty;
        el.classList.add('is-on');
      }
    },
    { passive: true },
  );

  document.addEventListener('pointerleave', () => el.classList.remove('is-on'));
  document.addEventListener('pointerenter', () => on && el.classList.add('is-on'));

  // Cresce sobre alvos clicáveis — dá a sensação de "engate".
  const HOT = 'a, button, input, textarea, select, .card, .svc, [data-magnetic]';
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest(HOT)) el.classList.add('is-hot');
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest(HOT)) el.classList.remove('is-hot');
  });

  const raf = () => {
    x += (tx - x) * 0.18;
    y += (ty - y) * 0.18;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}

/** Gradiente radial acompanhando o cursor dentro de cada superfície. */
export function initSpotlight() {
  if (!fine) return;

  const targets = document.querySelectorAll('.card, .svc, .cta, .console');
  targets.forEach((el) => {
    el.addEventListener(
      'pointermove',
      (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      },
      { passive: true },
    );
  });
}

/** Inclinação em perspectiva. */
export function initTilt() {
  if (!fine || reduced) return;

  document.querySelectorAll('.card--tilt').forEach((el) => {
    const MAX = 9;
    let raf = 0;
    let rx = 0;
    let ry = 0;

    const apply = () => {
      raf = 0;
      el.style.transform = `perspective(750px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-6px) scale(1.015)`;
    };

    el.addEventListener(
      'pointermove',
      (e) => {
        const r = el.getBoundingClientRect();
        ry = ((e.clientX - r.left) / r.width - 0.5) * 2 * MAX;
        rx = -((e.clientY - r.top) / r.height - 0.5) * 2 * MAX;
        if (!raf) raf = requestAnimationFrame(apply);
      },
      { passive: true },
    );

    el.addEventListener('pointerleave', () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.style.transform = '';
    });
  });
}

/** Botões que "puxam" levemente na direção do cursor. */
export function initMagnetic() {
  if (!fine || reduced) return;

  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const PULL = 6;

    el.addEventListener(
      'pointermove',
      (e) => {
        const r = el.getBoundingClientRect();
        const dx = ((e.clientX - r.left) / r.width - 0.5) * 2 * PULL;
        const dy = ((e.clientY - r.top) / r.height - 0.5) * 2 * PULL;
        el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      },
      { passive: true },
    );

    el.addEventListener('pointerleave', () => {
      el.style.transform = '';
    });
  });
}
