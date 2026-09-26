/**
 * Cabeçalho, menu mobile, preloader e transição entre páginas.
 * Tudo degrada: sem JS o menu vira navegação normal e os links funcionam.
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ preloader */

export function initPreloader(onDone) {
  const el = document.querySelector('.preloader');
  if (!el) {
    onDone?.();
    return;
  }

  // A rede de segurança inline no HTML pode ter assumido antes deste módulo
  // chegar (rede lenta). Nesse caso não há o que fazer aqui — e re-travar o
  // scroll para um preloader já invisível prenderia a página.
  if (el.classList.contains('is-done')) {
    onDone?.();
    return;
  }

  const bar = el.querySelector('.preloader__bar span');
  const pct = el.querySelector('.preloader__pct');

  const imgs = [...document.images];
  const total = imgs.length + 1;
  let loaded = 0;
  let shown = 0;
  let finished = false;

  const paint = (v) => {
    if (bar) bar.style.width = `${v}%`;
    if (pct) pct.textContent = `${String(Math.round(v)).padStart(3, '0')}%`;
  };

  const tick = () => {
    const real = (loaded / total) * 100;
    // Sobe suave até o valor real, sem saltos bruscos de 0 → 100.
    shown += Math.max((real - shown) * 0.12, real > shown ? 0.4 : 0);
    paint(Math.min(shown, 100));
    if (shown < 99.4 && !finished) requestAnimationFrame(tick);
  };

  const bump = () => {
    loaded++;
  };

  imgs.forEach((img) => {
    if (img.complete) bump();
    else {
      img.addEventListener('load', bump, { once: true });
      img.addEventListener('error', bump, { once: true });
    }
  });

  const finish = () => {
    if (finished) return;
    finished = true;
    paint(100);
    setTimeout(() => {
      el.classList.add('is-done');
      document.body.classList.remove('is-locked');
      onDone?.();
      setTimeout(() => el.remove(), 900);
    }, reduced ? 0 : 320);
  };

  document.body.classList.add('is-locked');
  requestAnimationFrame(tick);

  window.addEventListener('load', () => {
    loaded = total;
    setTimeout(finish, reduced ? 0 : 260);
  });

  // Rede ruim não pode prender o visitante numa tela de carregamento.
  setTimeout(finish, 4200);
}

/* ------------------------------------------------------------------ cabeçalho */

export function initNav() {
  const nav = document.querySelector('.nav');
  const burger = document.querySelector('.nav__burger');
  const drawer = document.querySelector('.drawer');
  if (!nav) return;

  // O botão flutuante só entra depois do hero (ver .wa.is-idle no CSS).
  const wa = document.querySelector('.wa');
  const hero = document.querySelector('.hero');
  const waGate = hero ? Math.max(hero.offsetHeight * 0.55, 240) : 0;
  if (wa && hero) wa.classList.add('is-idle');

  let last = window.scrollY;

  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-stuck', y > 24);

    // Esconde ao descer, revela ao subir — mas nunca com o menu aberto.
    const open = drawer?.classList.contains('is-open');
    if (!open) nav.classList.toggle('is-hidden', y > 320 && y > last + 4);

    if (wa && hero) wa.classList.toggle('is-idle', y < waGate);

    last = y;
  };

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (!burger || !drawer) return;

  const links = [...drawer.querySelectorAll('.drawer__link')];

  const setOpen = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    drawer.classList.toggle('is-open', open);
    document.body.classList.toggle('is-locked', open);
    nav.classList.remove('is-hidden');
    // Escada de entrada dos itens.
    links.forEach((l, i) => {
      l.style.transitionDelay = open ? `${120 + i * 55}ms` : '0ms';
    });
    if (open) links[0]?.focus({ preventScroll: true });
  };

  burger.addEventListener('click', () => {
    setOpen(burger.getAttribute('aria-expanded') !== 'true');
  });

  drawer.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
      setOpen(false);
      burger.focus();
    }
  });

  // Ao voltar para desktop, o painel não pode ficar preso aberto.
  window.matchMedia('(width > 860px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

/* -------------------------------------------------------- transição de página */

export function initPageTransition() {
  const wipe = document.querySelector('.wipe');
  if (!wipe || reduced) return;

  // Voltar pelo histórico com página em cache não pode deixar a cortina no ar.
  window.addEventListener('pageshow', () => wipe.classList.remove('is-on'));

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;

    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.hash) return;

    e.preventDefault();
    wipe.classList.add('is-on');
    setTimeout(() => {
      location.href = url.href;
    }, 620);
  });
}

/* ----------------------------------------------------- link ativo no cabeçalho */

export function markCurrentLink() {
  const path = location.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav__link, .drawer__link').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http')) return;
    const p = new URL(href, location.href).pathname
      .replace(/\/index\.html$/, '/')
      .replace(/\/$/, '') || '/';
    if (p === path) a.setAttribute('aria-current', 'page');
  });
}
