/* ══════════════════════════════════════════════════════════════════════
   STILL LIGHT — scroll choreography, particles, ambience
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var root = document.documentElement;
  var body = document.body;
  var stages = Array.prototype.slice.call(document.querySelectorAll('.stage'));
  var layers = Array.prototype.slice.call(document.querySelectorAll('.backdrop__layer'));
  var fx = document.getElementById('fx');
  var ctx = fx ? fx.getContext('2d') : null;

  /* ── motion preference ───────────────────────────────────────────── */
  var STORE_KEY = 'stilllight.motion';
  var reduceMotion = false;
  try {
    var stored = localStorage.getItem(STORE_KEY);
    reduceMotion = stored === null
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : stored === 'off';
  } catch (e) { reduceMotion = false; }

  function applyMotion() {
    body.classList.toggle('no-motion', reduceMotion);
    var btn = document.getElementById('motionToggle');
    if (btn) {
      btn.setAttribute('aria-pressed', reduceMotion ? 'false' : 'true');
      btn.setAttribute('aria-label', reduceMotion ? 'Enable motion' : 'Reduce motion');
    }
    try { localStorage.setItem(STORE_KEY, reduceMotion ? 'off' : 'on'); } catch (e) {}
  }
  applyMotion();

  /* ── scroll model ────────────────────────────────────────────────── */
  var smoothstep = function (a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  var presence = [0, 0, 0, 0];
  var weights = [0, 0, 0, 0];
  var dominant = 0;
  var stageProgress = [0, 0, 0, 0];

  function computePresence() {
    var raw = [0, 0, 0, 0];
    var i, p;
    for (i = 0; i < stages.length; i++) {
      p = stageProgress[i] || 0;
      raw[i] = smoothstep(0, 0.24, p) * (1 - smoothstep(0.76, 1, p));
    }
    var max = 0, sum = 0;
    for (i = 0; i < raw.length; i++) { if (raw[i] > max) max = raw[i]; sum += raw[i]; }
    if (max <= 0) { for (i = 0; i < raw.length; i++) presence[i] = 0; return; }
    var norm = raw.map(function (r) { return r / max; });
    var nsum = norm.reduce(function (a, b) { return a + b; }, 0);
    for (i = 0; i < raw.length; i++) presence[i] = nsum > 0 ? norm[i] / nsum : 0;
    weights = raw.map(function (r) { return r / (sum || 1); });
    var best = 0;
    for (i = 0; i < presence.length; i++) if (presence[i] > presence[best]) best = i;
    dominant = best;
  }

  /* ── gsap / scrolltrigger ────────────────────────────────────────── */
  var hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  var parallaxTweens = [];

  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);

    stages.forEach(function (stage, i) {
      ScrollTrigger.create({
        trigger: stage,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: function (self) { stageProgress[i] = self.progress; },
        onRefresh: function (self) { stageProgress[i] = self.progress; }
      });
    });

    // backdrop crossfade + ken burns + camera drift
    layers.forEach(function (layer, i) {
      var img = layer.querySelector('.backdrop__img');
      var stage = stages[i];
      if (!stage) return;

      if (img) {
        gsap.fromTo(img,
          { scale: 1.06 },
          {
            scale: 1.17,
            ease: 'none',
            scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 0.8 }
          });
        gsap.fromTo(img,
          { xPercent: i % 2 ? 1.4 : -1.4 },
          {
            xPercent: i % 2 ? -1.4 : 1.4,
            ease: 'none',
            scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 1.2 }
          });
      }

      gsap.fromTo(layer,
        { yPercent: 0 },
        {
          yPercent: i % 2 ? 2.4 : -2.4,
          ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 1.4 }
        });
    });

    // stage 3 → 4 : the blur dissolves, the light rises
    if (layers[2]) {
      gsap.fromTo(layers[2],
        { filter: 'blur(16px) saturate(.5) brightness(.66)' },
        {
          filter: 'blur(0px) saturate(.72) brightness(1.18)',
          ease: 'none',
          scrollTrigger: { trigger: stages[2], start: 'bottom 80%', end: 'bottom top', scrub: 0.6 }
        });
      gsap.set(layers[2], { filter: 'blur(16px) saturate(.5) brightness(.66)' });
    }
    if (layers[3]) {
      gsap.fromTo(layers[3],
        { filter: 'brightness(.72)' },
        {
          filter: 'brightness(1.05)',
          ease: 'none',
          scrollTrigger: { trigger: stages[3], start: 'top bottom', end: 'top top', scrub: 0.8 }
        });
    }

    // text emerging from the dark
    document.querySelectorAll('.stage__head').forEach(function (head) {
      var tl = gsap.timeline({
        scrollTrigger: { trigger: head, start: 'top 88%', end: 'top 42%', scrub: 0.7 }
      });
      var index = head.querySelector('.stage__index');
      var text = head.querySelector('.stage__text');
      tl.fromTo(index, { opacity: 0, y: 12 }, { opacity: 0.6, y: 0, ease: 'none' }, 0);
      tl.fromTo(text,
        { opacity: 0, y: 26, filter: 'blur(18px)', letterSpacing: '0.12em' },
        { opacity: 1, y: 0, filter: 'blur(0px)', letterSpacing: '0.015em', ease: 'none' },
        0);
    });

    buildParallax();
  }

  /* parallax is rebuilt whenever the motion preference changes so that the
     hand-sketch rotation (a CSS transform) is never lost.
     It animates `top` rather than `y` on purpose: a transform would make every
     board item its own stacking context, which traps the captions underneath
     the neighbouring photographs. `top` keeps the items flat so a label always
     floats above the board. */
  var parallaxTweens = [];
  function baseTopPx(el) {
    var prev = el.style.top;
    el.style.top = '';
    var v = parseFloat(getComputedStyle(el).top);
    el.style.top = prev;
    return isNaN(v) ? 0 : v;
  }
  function buildParallax() {
    killParallax();
    if (reduceMotion || !hasGSAP) return;
    if (!window.matchMedia('(min-width:901px)').matches) return;
    document.querySelectorAll('[data-parallax]').forEach(function (el) {
      var f = parseFloat(el.getAttribute('data-parallax')) || 0;
      var base = baseTopPx(el);
      var tw = gsap.fromTo(el,
        { top: base + f * 150 },
        {
          top: base - f * 150,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 0.9 }
        });
      parallaxTweens.push(tw);
    });
  }
  function killParallax() {
    parallaxTweens.forEach(function (tw) {
      if (tw.scrollTrigger) tw.scrollTrigger.kill();
      tw.kill();
    });
    parallaxTweens = [];
  }

  /* ── rail + palette ──────────────────────────────────────────────── */
  var railItems = Array.prototype.slice.call(document.querySelectorAll('.rail__item'));
  var railProgress = document.getElementById('railProgress');
  var ui = document.getElementById('ui');

  function updateRail() {
    if (railProgress) {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var p = max > 0 ? window.scrollY / max : 0;
      railProgress.style.height = (p * 100).toFixed(2) + '%';
    }
    railItems.forEach(function (li, i) {
      li.classList.toggle('is-active', i === dominant);
    });
    if (ui) {
      var day = weights[3] || 0;
      ui.style.setProperty('--ui-ink', mixInk(weights[0] + weights[1] + weights[2], day));
      ui.style.setProperty('--ui-ink-dim', day > 0.5 ? 'rgba(34,32,28,.18)' : 'rgba(240,196,211,.2)');
    }
  }

  function mixInk(darkAmount, dayAmount) {
    var d = Math.min(1, darkAmount);
    var r = Math.round(240 + (34 - 240) * dayAmount);
    var g = Math.round(196 + (32 - 196) * dayAmount);
    var b = Math.round(211 + (28 - 211) * dayAmount);
    var a = (0.5 + 0.08 * d).toFixed(2);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ── particles ───────────────────────────────────────────────────── */
  var systems = {
    dust:  { n: 90, alpha: 0.55, color: [255, 255, 255] },
    petal: { n: 34, alpha: 0.6,  color: [243, 198, 212] },
    steam: { n: 26, alpha: 0.16, color: [232, 230, 226] },
    mote:  { n: 46, alpha: 0.34, color: [255, 252, 240] }
  };
  var parts = { dust: [], petal: [], steam: [], mote: [] };
  var dpr = 1, W = 0, H = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function seed() {
    Object.keys(systems).forEach(function (key) {
      parts[key] = [];
      for (var i = 0; i < systems[key].n; i++) parts[key].push(makePart(key, true));
    });
  }

  function makePart(key, initial) {
    switch (key) {
      case 'dust':
        return { x: rand(0.18, 0.82), y: initial ? rand(0, 1) : rand(-0.05, 0), r: rand(0.4, 1.25), vy: rand(-0.012, -0.004), vx: rand(-0.002, 0.002), a: rand(0.25, 1), tw: rand(0, 6.28) };
      case 'petal':
        return { x: rand(0, 1), y: initial ? rand(0, 1) : rand(-0.08, 0), r: rand(2.2, 5.4), vy: rand(0.008, 0.022), vx: rand(-0.006, 0.006), sway: rand(0.4, 1.6), ph: rand(0, 6.28), a: rand(0.35, 0.9) };
      case 'steam':
        return { x: rand(-0.1, 1.1), y: initial ? rand(0, 1) : rand(1.02, 1.18), r: rand(0.18, 0.5), vy: rand(-0.006, -0.0015), vx: rand(-0.004, 0.004), a: rand(0.3, 1), ph: rand(0, 6.28) };
      default:
        return { x: rand(0, 1), y: rand(0, 1), r: rand(0.5, 1.6), vy: rand(-0.004, 0.004), vx: rand(-0.004, 0.004), a: rand(0.15, 0.8), tw: rand(0, 6.28) };
    }
  }

  function resize() {
    if (!ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    fx.width = Math.floor(W * dpr);
    fx.height = Math.floor(H * dpr);
    fx.style.width = W + 'px';
    fx.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(t) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    var w = weights;

    // stage 1 — dust in the beam
    if (w[0] > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      parts.dust.forEach(function (p) {
        p.y += p.vy; p.x += p.vx + Math.sin(t * 0.0004 + p.tw) * 0.00012;
        if (p.y < -0.02) { p.y = 1.02; p.x = rand(0.18, 0.82); }
        var twinkle = 0.6 + 0.4 * Math.sin(t * 0.0015 + p.tw);
        ctx.fillStyle = 'rgba(255,255,255,' + (p.a * twinkle * 0.55 * w[0]).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, p.r, 0, 6.2832);
        ctx.fill();
      });
    }

    // stage 2 — petals
    if (w[1] > 0.01) {
      ctx.globalCompositeOperation = 'source-over';
      parts.petal.forEach(function (p) {
        p.y += p.vy;
        p.x += p.vx + Math.sin(t * 0.0006 * p.sway + p.ph) * 0.0016;
        if (p.y > 1.04) { p.y = -0.05; p.x = rand(0, 1); }
        var sway = Math.cos(t * 0.0012 * p.sway + p.ph);
        ctx.save();
        ctx.translate(p.x * W, p.y * H);
        ctx.rotate(sway * 1.4);
        ctx.fillStyle = 'rgba(243,198,212,' + (p.a * 0.7 * w[1]).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.48, 0, 0, 6.2832);
        ctx.fill();
        ctx.restore();
      });
    }

    // stage 3 — steam
    if (w[2] > 0.01) {
      ctx.globalCompositeOperation = 'screen';
      parts.steam.forEach(function (p) {
        p.y += p.vy;
        p.x += p.vx + Math.sin(t * 0.00018 + p.ph) * 0.0022;
        if (p.y < -0.25) { p.y = 1.12; p.x = rand(-0.1, 1.1); }
        var rr = p.r * Math.min(W, H) * (1 + Math.sin(t * 0.0003 + p.ph) * 0.12);
        var g = ctx.createRadialGradient(p.x * W, p.y * H, 0, p.x * W, p.y * H, rr);
        g.addColorStop(0, 'rgba(236,234,229,' + (p.a * 0.16 * w[2]).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(236,234,229,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, rr, 0, 6.2832);
        ctx.fill();
      });
    }

    // stage 4 — air
    if (w[3] > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      parts.mote.forEach(function (p) {
        p.y += p.vy; p.x += p.vx;
        if (p.y > 1.02) p.y = -0.02;
        if (p.y < -0.02) p.y = 1.02;
        if (p.x > 1.02) p.x = -0.02;
        if (p.x < -0.02) p.x = 1.02;
        var twinkle = 0.55 + 0.45 * Math.sin(t * 0.001 + p.tw);
        ctx.fillStyle = 'rgba(255,252,240,' + (p.a * twinkle * 0.42 * w[3]).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, p.r, 0, 6.2832);
        ctx.fill();
      });
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  var rafId = null;
  function loop(t) {
    draw(t);
    rafId = requestAnimationFrame(loop);
  }

  /* ── ambience (optional, muted by default) ───────────────────────── */
  var Ambience = (function () {
    var ctxA = null, master = null, started = false, on = false;
    var gains = [], birdTimer = null;

    function noiseBuffer(ac, seconds, brown) {
      var len = Math.floor(ac.sampleRate * seconds);
      var buf = ac.createBuffer(1, len, ac.sampleRate);
      var d = buf.getChannelData(0);
      var last = 0;
      for (var i = 0; i < len; i++) {
        var white = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * white) / 1.02; d[i] = last * 3.2; }
        else d[i] = white;
      }
      return buf;
    }

    function loopSource(buffer, rate) {
      var s = ctxA.createBufferSource();
      s.buffer = buffer; s.loop = true; s.playbackRate.value = rate || 1;
      return s;
    }

    function build() {
      ctxA = new (window.AudioContext || window.webkitAudioContext)();
      master = ctxA.createGain();
      master.gain.value = 0;
      var comp = ctxA.createDynamicsCompressor();
      comp.threshold.value = -28; comp.knee.value = 18; comp.ratio.value = 6;
      master.connect(comp); comp.connect(ctxA.destination);

      var brown = noiseBuffer(ctxA, 6, true);
      var white = noiseBuffer(ctxA, 4, false);

      /* stage 1 — near silence, room tone, a breathing hum */
      var g1 = ctxA.createGain(); g1.gain.value = 0; gains[0] = g1;
      var lp = ctxA.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 210; lp.Q.value = 0.7;
      var s1 = loopSource(brown, 0.6); s1.connect(lp); lp.connect(g1);
      var drone = ctxA.createOscillator(); drone.type = 'sine'; drone.frequency.value = 48;
      var droneG = ctxA.createGain(); droneG.gain.value = 0.16;
      var lfo = ctxA.createOscillator(); lfo.frequency.value = 0.09;
      var lfoG = ctxA.createGain(); lfoG.gain.value = 0.1;
      lfo.connect(lfoG); lfoG.connect(droneG.gain);
      drone.connect(droneG); droneG.connect(g1);
      s1.start(); drone.start(); lfo.start();

      /* stage 2 — a single soft tone with a long tail */
      var g2 = ctxA.createGain(); g2.gain.value = 0; gains[1] = g2;
      var delay = ctxA.createDelay(4); delay.delayTime.value = 0.9;
      var fb = ctxA.createGain(); fb.gain.value = 0.34;
      var wet = ctxA.createGain(); wet.gain.value = 0.42;
      delay.connect(fb); fb.connect(delay);
      delay.connect(wet); wet.connect(g2);
      g2.connect(master);
      window.__bell = function () {
        if (!on) return;
        var now = ctxA.currentTime;
        [528, 792].forEach(function (f, i) {
          var o = ctxA.createOscillator(); o.type = 'sine'; o.frequency.value = f;
          var g = ctxA.createGain();
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(i ? 0.035 : 0.06, now + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);
          o.connect(g); g.connect(delay); g.connect(g2);
          o.start(now); o.stop(now + 4.4);
        });
      };

      /* stage 3 — steam, heat, a softened room */
      var g3 = ctxA.createGain(); g3.gain.value = 0; gains[2] = g3;
      var bp = ctxA.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.6;
      var s3 = loopSource(white, 0.85); s3.connect(bp); bp.connect(g3);
      var hum = ctxA.createOscillator(); hum.type = 'sine'; hum.frequency.value = 61;
      var humG = ctxA.createGain(); humG.gain.value = 0.1;
      hum.connect(humG); humG.connect(g3);
      var s3b = loopSource(brown, 0.35);
      var lp3 = ctxA.createBiquadFilter(); lp3.type = 'lowpass'; lp3.frequency.value = 420;
      s3b.connect(lp3); lp3.connect(g3);
      s3.start(); hum.start(); s3b.start();

      /* stage 4 — wind, water, birds */
      var g4 = ctxA.createGain(); g4.gain.value = 0; gains[3] = g4;
      var wind = loopSource(brown, 0.9);
      var wf = ctxA.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 700; wf.Q.value = 0.9;
      var wlfo = ctxA.createOscillator(); wlfo.frequency.value = 0.05;
      var wlfoG = ctxA.createGain(); wlfoG.gain.value = 320;
      wlfo.connect(wlfoG); wlfoG.connect(wf.frequency);
      var wg = ctxA.createGain(); wg.gain.value = 0.5;
      wind.connect(wf); wf.connect(wg); wg.connect(g4);
      wind.start(); wlfo.start();

      var water = loopSource(white, 1);
      var wbp = ctxA.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 2600; wbp.Q.value = 1.6;
      var wbg = ctxA.createGain(); wbg.gain.value = 0.05;
      var wlfo2 = ctxA.createOscillator(); wlfo2.frequency.value = 0.13;
      var wlfo2G = ctxA.createGain(); wlfo2G.gain.value = 0.035;
      wlfo2.connect(wlfo2G); wlfo2G.connect(wbg.gain);
      water.connect(wbp); wbp.connect(wbg); wbg.connect(g4);
      water.start(); wlfo2.start();

      g1.connect(master); g3.connect(master); g4.connect(master);
    }

    function chirp() {
      if (!on || !ctxA) return;
      var now = ctxA.currentTime;
      var base = 1900 + Math.random() * 1500;
      for (var i = 0; i < 2; i++) {
        var t = now + i * 0.14;
        var o = ctxA.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.06);
        o.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.11);
        var g = ctxA.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        o.connect(g); g.connect(gains[3]);
        o.start(t); o.stop(t + 0.2);
      }
      birdTimer = setTimeout(chirp, 4200 + Math.random() * 9000);
    }

    function apply(w) {
      if (!ctxA) return;
      var now = ctxA.currentTime;
      for (var i = 0; i < gains.length; i++) {
        var target = on ? (0.1 + w[i] * 0.5) : 0;
        try { gains[i].gain.setTargetAtTime(target, now, 0.6); } catch (e) {}
      }
      master.gain.setTargetAtTime(on ? 0.5 : 0, now, 0.4);
      if (on && w[3] > 0.25 && !birdTimer) birdTimer = setTimeout(chirp, 2000);
      if ((!on || w[3] <= 0.25) && birdTimer) { clearTimeout(birdTimer); birdTimer = null; }
    }

    return {
      toggle: function () {
        if (!started) { build(); started = true; }
        if (ctxA.state === 'suspended') ctxA.resume();
        on = !on;
        apply(weights);
        if (on && window.__bell) setTimeout(window.__bell, 1200);
        return on;
      },
      apply: apply
    };
  })();

  var soundBtn = document.getElementById('soundToggle');
  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      var on = Ambience.toggle();
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      soundBtn.setAttribute('aria-label', on ? 'Mute ambience' : 'Enable ambience');
    });
  }

  /* ── controls ────────────────────────────────────────────────────── */
  var motionBtn = document.getElementById('motionToggle');
  if (motionBtn) {
    motionBtn.addEventListener('click', function () {
      reduceMotion = !reduceMotion;
      applyMotion();
      if (hasGSAP) {
        killParallax();
        buildParallax();
        ScrollTrigger.refresh();
      }
      if (reduceMotion && rafId) { cancelAnimationFrame(rafId); rafId = null; draw(0); }
      else if (!reduceMotion && !rafId) rafId = requestAnimationFrame(loop);
    });
  }

  /* ── image reveal ────────────────────────────────────────────────── */
  document.querySelectorAll('.board img').forEach(function (img) {
    if (img.complete) { img.classList.add('is-loaded'); return; }
    img.addEventListener('load', function () { img.classList.add('is-loaded'); });
    img.addEventListener('error', function () { img.classList.add('is-loaded'); });
  });

  /* ── rail navigation ─────────────────────────────────────────────── */
  railItems.forEach(function (li) {
    var a = li.querySelector('a');
    if (!a) return;
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      var target = id ? document.querySelector(id) : null;
      if (!target) return;
      e.preventDefault();
      var reduce = reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ── boot ────────────────────────────────────────────────────────── */
  function tick() {
    computePresence();
    for (var i = 0; i < layers.length; i++) {
      layers[i].style.opacity = presence[i].toFixed(3);
    }
    updateRail();
    Ambience.apply(weights);
  }

  resize();
  seed();
  if (reduceMotion) { draw(0); } else { rafId = requestAnimationFrame(loop); }
  tick();

  window.addEventListener('resize', function () {
    resize(); seed();
    if (reduceMotion) draw(0);
    if (hasGSAP) { killParallax(); buildParallax(); }
  }, { passive: true });
  window.addEventListener('scroll', tick, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
    else if (!reduceMotion && !rafId) { rafId = requestAnimationFrame(loop); }
  });

  if (hasGSAP) {
    ScrollTrigger.addEventListener('refresh', function () { computePresence(); tick(); });
    window.addEventListener('load', function () { ScrollTrigger.refresh(); tick(); });
  }
  setTimeout(tick, 60);
  setInterval(tick, 220);
})();
