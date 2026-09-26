/**
 * Movimento ligado ao scroll: revelações, contadores, marquee e o console de
 * rastreamento. Usa IntersectionObserver — sem custo por frame quando parado.
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------- rolagem suave (Lenis) */

export function initSmoothScroll() {
  if (reduced || !window.Lenis) return null;

  const lenis = new window.Lenis({
    duration: 1.05,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    // Toque nativo continua nativo: mexer nisso destrói a sensação no celular.
    syncTouch: false,
  });

  const raf = (time) => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);

  // Âncoras internas passam a usar o mesmo easing do resto da página.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (!id || id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: -80 });
  });

  return lenis;
}

/* --------------------------------------------------------- barra de progresso */

export function initProgressBar() {
  const bar = document.querySelector('.progress');
  if (!bar) return;

  const paint = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    bar.style.transform = `scaleX(${Math.min(Math.max(p, 0), 1)})`;
  };

  paint();
  window.addEventListener('scroll', paint, { passive: true });
  window.addEventListener('resize', paint, { passive: true });
}

/* ----------------------------------------------------------------- revelações */

export function initReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;

  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
  );

  items.forEach((el) => {
    // Escada automática entre irmãos marcados com data-stagger no pai.
    const host = el.closest('[data-stagger]');
    if (host && !el.style.getPropertyValue('--d')) {
      const sibs = [...host.querySelectorAll('[data-reveal]')];
      el.style.setProperty('--d', `${sibs.indexOf(el) * 90}ms`);
    }
    io.observe(el);
  });
}

/* ----------------------------------------------------------------- contadores */

export function initCounters() {
  const nodes = document.querySelectorAll('[data-count]');
  if (!nodes.length) return;

  const run = (el) => {
    const to = parseFloat(el.dataset.count);
    const dur = parseInt(el.dataset.countDur || '1400', 10);
    const dec = (el.dataset.count.split('.')[1] || '').length;

    if (reduced) {
      el.textContent = to.toFixed(dec);
      return;
    }

    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      // easeOutExpo: rápido no começo, assenta no fim.
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = (to * e).toFixed(dec);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if (!('IntersectionObserver' in window)) {
    nodes.forEach(run);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        run(entry.target);
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.5 },
  );

  nodes.forEach((el) => {
    el.textContent = '0';
    io.observe(el);
  });
}

/* -------------------------------------------------------------------- marquee */

export function initMarquee() {
  document.querySelectorAll('.marquee').forEach((m) => {
    const track = m.querySelector('.marquee__track');
    if (!track || track.dataset.cloned) return;
    // Duplica a faixa: a animação de -100% fica perfeitamente contínua.
    const clone = track.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.dataset.cloned = '1';
    m.appendChild(clone);
  });
}

/* --------------------------------------------------- console de rastreamento */

export function initTrackConsole() {
  const consoles = document.querySelectorAll('.console');
  if (!consoles.length) return;

  const fill = (root) => {
    root.querySelectorAll('.track-row__bar i').forEach((bar, i) => {
      const to = bar.dataset.to || '60';
      setTimeout(() => {
        bar.style.width = `${to}%`;
      }, 180 + i * 220);
    });
  };

  if (!('IntersectionObserver' in window)) {
    consoles.forEach(fill);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        fill(entry.target);
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.3 },
  );

  consoles.forEach((el) => io.observe(el));
}

/* --------------------------------------------- revelação por linha (títulos) */

export function revealLines(selector = '[data-lines]') {
  document.querySelectorAll(selector).forEach((el, i) => {
    setTimeout(() => el.classList.add('is-revealed'), 120 + i * 90);
  });
}
