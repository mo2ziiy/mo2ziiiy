/* ============================================================
   motion.js — GSAP + ScrollTrigger choreography
   - hero entrance (replaces the old fake loader)
   - staggered scroll reveals, section rules, timeline beam
   - magnetic buttons, tilt + spotlight cards, cursor glow
   - active-section highlighting in the nav
   Everything is skipped under prefers-reduced-motion; content is
   always visible without this file (see the motion gates in CSS).
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;

  /* ---------- Active section in nav (runs even with reduced motion) ---------- */
  (function activeNav() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav-desktop a[href^="#"], .menu-links a[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    var byId = {};
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      (byId[id] = byId[id] || []).push(a);
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
        (byId[en.target.id] || []).forEach(function (a) {
          a.classList.add('is-active'); a.setAttribute('aria-current', 'location');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  })();

  if (reduce || !gsap || !ScrollTrigger) {
    root.classList.remove('motion');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  root.classList.add('motion-ready');

  var EASE = 'expo.out';

  /* ---------- Hero entrance (~1.1s total) ---------- */
  var hero = document.querySelector('.hero');
  if (hero) {
    var tl = gsap.timeline({ defaults: { ease: EASE, duration: 0.7 } });
    var enter = function (sel, vars, at) {
      var els = hero.querySelectorAll(sel);
      if (els.length) tl.from(els, vars, at);
    };
    enter('.hero-eyebrow > *', { y: 12, autoAlpha: 0, stagger: 0.05, duration: 0.5 }, 0);
    enter('.hero-title .row > span', { yPercent: 110, stagger: 0.08, duration: 0.7 }, 0.05);
    enter('.portrait-card', { y: 28, autoAlpha: 0, scale: 0.97, duration: 0.7 }, 0.15);
    enter('.hero-stage', { autoAlpha: 0, duration: 0.7, ease: 'power2.out' }, 0.2);
    enter('.hero-role-line, .hero-desc, .hero-ctas > *', { y: 16, autoAlpha: 0, stagger: 0.06, duration: 0.55 }, 0.3);
    enter('.hero-term', { y: 16, autoAlpha: 0, duration: 0.6 }, 0.55);
    enter('.hero-foot', { autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, 0.6);

    /* portrait drifts up slower than the page — gentle parallax */
    var card = hero.querySelector('.portrait-card');
    if (card) {
      gsap.to(card, {
        yPercent: -7, ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6 }
      });
    }
  }

  /* ---------- Staggered scroll reveals ---------- */
  ScrollTrigger.batch('.rv', {
    start: 'top 88%',
    once: true,
    onEnter: function (batch) {
      gsap.to(batch, {
        autoAlpha: 1, y: 0, duration: 0.7, ease: EASE, stagger: 0.08, overwrite: 'auto'
      });
    }
  });

  /* section rules draw in from the left */
  gsap.utils.toArray('.sec-head .sec-rule').forEach(function (rule) {
    gsap.from(rule, {
      scaleX: 0, transformOrigin: 'left center', duration: 0.7, ease: EASE,
      scrollTrigger: { trigger: rule, start: 'top 90%', once: true }
    });
  });

  /* resume timeline: the beam grows and shrinks with scroll (both directions),
     a glowing tip rides its end, and each milestone lights up as the tip passes.
     The fill is spread over the whole time the timeline is on screen (enters near
     the bottom, completes as it leaves near the top) so it never runs ahead of you. */
  var phone = window.matchMedia('(max-width: 760px)');
  gsap.utils.toArray('.r-timeline').forEach(function (tlEl) {
    var beam = tlEl.querySelector('.r-beam');
    if (!beam) return;
    var tip = tlEl.querySelector('.r-tip');
    var items = tlEl.querySelectorAll('.r-item');
    var setTip = tip ? gsap.quickSetter(tip, 'y', 'px') : null;
    gsap.fromTo(beam, { scaleY: 0 }, {
      scaleY: 1, ease: 'none', transformOrigin: 'top center',
      scrollTrigger: {
        trigger: tlEl,
        start: 'top 85%',
        end: 'bottom 30%',
        scrub: phone.matches ? 0.25 : 0.5,
        invalidateOnRefresh: true
      },
      onUpdate: function () {
        var p = this.progress();
        var travel = beam.offsetHeight;
        if (setTip) setTip(p * travel);
        var reach = p * travel + 8;
        for (var i = 0; i < items.length; i++) {
          items[i].classList.toggle('is-lit', items[i].offsetTop + 4 <= reach);
        }
      }
    });
  });

  /* everything below needs a precise pointer */
  if (!fine) return;

  /* ---------- Magnetic buttons ---------- */
  gsap.utils.toArray('[data-magnetic]').forEach(function (el) {
    var strength = parseFloat(el.getAttribute('data-magnetic')) || 0.25;
    var xTo = gsap.quickTo(el, 'x', { duration: 0.45, ease: 'power3.out' });
    var yTo = gsap.quickTo(el, 'y', { duration: 0.45, ease: 'power3.out' });
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * strength);
      yTo((e.clientY - r.top - r.height / 2) * strength);
    });
    el.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
  });

  /* ---------- Tilt + pointer spotlight ---------- */
  gsap.utils.toArray('[data-tilt]').forEach(function (el) {
    var max = parseFloat(el.getAttribute('data-tilt')) || 4;
    gsap.set(el, { transformPerspective: 900 });
    var rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3.out' });
    var ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width;
      var py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      rx((0.5 - py) * max);
      ry((px - 0.5) * max);
    });
    el.addEventListener('pointerleave', function () { rx(0); ry(0); });
  });

  /* ---------- Cursor glow (system cursor stays) ---------- */
  var glow = document.getElementById('cursorGlow');
  if (glow) {
    var gx = gsap.quickTo(glow, 'x', { duration: 0.7, ease: 'power3.out' });
    var gy = gsap.quickTo(glow, 'y', { duration: 0.7, ease: 'power3.out' });
    var shown = false;
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      if (!shown) { shown = true; gsap.set(glow, { x: e.clientX, y: e.clientY }); glow.classList.add('on'); }
      gx(e.clientX); gy(e.clientY);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { glow.classList.remove('on'); shown = false; });
  }
})();
