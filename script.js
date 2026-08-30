/* ════════════════════════════════════════════════════
   ZYNTRIX v3 — script.js
   Premium interactions · Vanilla JS
   ════════════════════════════════════════════════════ */

'use strict';

// ════════════════════════
// CUSTOM CURSOR
// ════════════════════════
(function initCursor() {
  const cursor   = document.getElementById('cursor');
  const follower = document.getElementById('cursorFollower');
  if (!cursor || !follower) return;
  if (window.matchMedia('(hover: none)').matches) return;

  let mx = -100, my = -100, fx = -100, fy = -100;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  function tick() {
    cursor.style.left = mx + 'px';
    cursor.style.top  = my + 'px';
    fx += (mx - fx) * 0.1;
    fy += (my - fy) * 0.1;
    follower.style.left = fx + 'px';
    follower.style.top  = fy + 'px';
    requestAnimationFrame(tick);
  }
  tick();

  document.querySelectorAll('[data-cursor="cta"]').forEach(el => {
    el.addEventListener('mouseenter', () => { cursor.classList.add('cta-hover'); follower.classList.add('cta-hover'); });
    el.addEventListener('mouseleave', () => { cursor.classList.remove('cta-hover'); follower.classList.remove('cta-hover'); });
  });

  document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; follower.style.opacity = '0'; });
  document.addEventListener('mouseenter', () => { cursor.style.opacity = '1'; follower.style.opacity = '1'; });
})();

// ════════════════════════
// NAV SCROLL + MOBILE
// ════════════════════════
(function initNav() {
  const nav       = document.getElementById('nav');
  const hamburger = document.getElementById('hamburger');
  const navMobile = document.getElementById('navMobile');

  window.addEventListener('scroll', () => {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });

  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navMobile?.classList.toggle('open');
  });

  navMobile?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger?.classList.remove('open');
      navMobile?.classList.remove('open');
    });
  });
})();

// ════════════════════════
// HERO CANVAS — Grid + Particles
// ════════════════════════
(function initCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, frame = 0;
  const CELL = 90;
  const PARTS = 50;
  const particles = [];

  function mkParticle(w, h) {
    return { x: Math.random() * (w||1400), y: Math.random() * (h||900), vx: (Math.random()-0.5)*0.3, vy: (Math.random()-0.5)*0.3, r: 0.5+Math.random()*1.8, a: 0.15+Math.random()*0.4 };
  }

  const dotPhases = [];
  function resetDots(w, h) {
    dotPhases.length = 0;
    const cols = Math.ceil((w||1400)/CELL)+1;
    const rows = Math.ceil((h||900)/CELL)+1;
    for (let y=0;y<=rows;y++) for (let x=0;x<=cols;x++) dotPhases.push(Math.random()*Math.PI*2);
  }

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
    particles.length = 0;
    for (let i=0;i<PARTS;i++) particles.push(mkParticle(W,H));
    resetDots(W,H);
  }

  function draw() {
    ctx.clearRect(0,0,W,H);
    const cols = Math.ceil(W/CELL)+1;
    const rows = Math.ceil(H/CELL)+1;
    ctx.lineWidth = 1;
    for (let x=0;x<=cols;x++) {
      ctx.beginPath(); ctx.moveTo(x*CELL,0); ctx.lineTo(x*CELL,H);
      ctx.strokeStyle='rgba(0,212,255,0.035)'; ctx.stroke();
    }
    for (let y=0;y<=rows;y++) {
      ctx.beginPath(); ctx.moveTo(0,y*CELL); ctx.lineTo(W,y*CELL);
      ctx.strokeStyle='rgba(99,102,241,0.028)'; ctx.stroke();
    }
    const t = frame*0.016;
    let di=0;
    for (let y=0;y<=rows;y++) {
      for (let x=0;x<=cols;x++) {
        const a = (Math.sin(t+(dotPhases[di++]||0))*0.5+0.5)*0.5;
        if (a<0.1) continue;
        ctx.beginPath(); ctx.arc(x*CELL,y*CELL,1.5,0,Math.PI*2);
        ctx.fillStyle=`rgba(0,212,255,${a*0.4})`; ctx.fill();
      }
    }
    for (const p of particles) {
      p.x+=p.vx; p.y+=p.vy;
      if (p.x<0) p.x=W; if (p.x>W) p.x=0;
      if (p.y<0) p.y=H; if (p.y>H) p.y=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(0,212,255,${p.a*0.3})`; ctx.fill();
    }
    const sweepY = ((frame*0.22)%(H+60))-30;
    const sg = ctx.createLinearGradient(0,sweepY-28,0,sweepY+28);
    sg.addColorStop(0,'transparent'); sg.addColorStop(0.5,'rgba(0,212,255,0.02)'); sg.addColorStop(1,'transparent');
    ctx.fillStyle=sg; ctx.fillRect(0,sweepY-28,W,56);
    frame++; requestAnimationFrame(draw);
  }
  resize();
  window.addEventListener('resize', resize);
  draw();
})();

// ════════════════════════
// REVEAL ON SCROLL
// ════════════════════════
(function initReveal() {
  const elements = document.querySelectorAll('[data-reveal]');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('revealed');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.07, rootMargin: '0px 0px -20px 0px' });
  elements.forEach(el => io.observe(el));

  // Hero: trigger immediately
  document.querySelectorAll('.hero [data-reveal]').forEach((el, i) => {
    setTimeout(() => el.classList.add('revealed'), 200 + i * 130);
  });
})();

// ════════════════════════
// COUNTER ANIMATION
// ════════════════════════
(function initCounters() {
  const counters = document.querySelectorAll('.stat-num[data-target]');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseFloat(el.dataset.target);
      const suffix = el.dataset.suffix||'';
      const duration = 1600;
      const start = performance.now();
      function update(now) {
        const t = Math.min((now-start)/duration,1);
        const eased = t===1 ? 1 : 1-Math.pow(2,-10*t);
        const val = target*eased;
        el.textContent=(Number.isInteger(target)?Math.round(val):val.toFixed(1))+suffix;
        if (t<1) requestAnimationFrame(update);
      }
      requestAnimationFrame(update);
      io.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(el => io.observe(el));
})();

// ════════════════════════
// MAGNETIC BUTTONS
// ════════════════════════
(function initMagnetic() {
  document.querySelectorAll('.magnetic').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width/2;
      const y = e.clientY - r.top  - r.height/2;
      btn.style.transform = `translate(${x*0.22}px, ${y*0.22}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
})();

// ════════════════════════
// USE CASE TABS
// ════════════════════════
(function initUCTabs() {
  const tabs   = document.querySelectorAll('.uc-tab');
  const panels = document.querySelectorAll('.uc-panel');
  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.querySelector(`.uc-panel[data-panel="${id}"]`);
      if (panel) panel.classList.add('active');
    });
  });
})();

// ════════════════════════
// CONTACT FORM
// ════════════════════════
(function initForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const btn  = form.querySelector('button[type="submit"]');
    const span = btn.querySelector('.btn-text');
    const orig = span.textContent;
    btn.disabled = true;
    span.textContent = 'Wird gesendet …';
    setTimeout(() => {
      span.textContent = '✓ Anfrage gesendet!';
      btn.style.background = 'linear-gradient(135deg,#00b894,#0984e3)';
      setTimeout(() => {
        span.textContent = orig;
        btn.disabled = false;
        btn.style.background = '';
        form.reset();
      }, 3500);
    }, 1000);
  });
})();

// ════════════════════════
// SMOOTH ACTIVE NAV
// ════════════════════════
(function initActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const links    = document.querySelectorAll('.nav-center a[href^="#"]');
  window.addEventListener('scroll', () => {
    let cur = '';
    sections.forEach(s => { if (window.scrollY >= s.offsetTop - 140) cur = s.id; });
    links.forEach(a => { a.style.color = a.getAttribute('href') === `#${cur}` ? 'var(--white)' : ''; });
  }, { passive: true });
})();

// ════════════════════════
// PARALLAX — hero
// ════════════════════════
(function initParallax() {
  const title = document.querySelector('.hero-title');
  const sub   = document.querySelector('.hero-sub');
  if (!title) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (title) title.style.transform = `translateY(${y * 0.2}px)`;
        if (sub)   sub.style.transform   = `translateY(${y * 0.12}px)`;
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();

// Video player interaction
const vpPlay = document.querySelector('.vp-play');
const vpProgress = document.querySelector('.vp-progress');
const vpTime = document.querySelector('.vp-time');
if (vpPlay) {
  vpPlay.addEventListener('click', () => {
    // Animate progress as "playing"
    vpPlay.style.opacity = '0.5';
    vpPlay.style.transform = 'translate(-50%,-50%) scale(0.9)';
    setTimeout(() => {
      vpPlay.style.opacity = '1';
      vpPlay.style.transform = 'translate(-50%,-50%)';
    }, 200);
    // Show a toast
    const toast = document.createElement('div');
    toast.textContent = '🎬 Video wird bald verfügbar';
    toast.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.3);color:#fff;padding:12px 24px;border-radius:100px;font-size:14px;z-index:9999;backdrop-filter:blur(12px);pointer-events:none;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  });
}
