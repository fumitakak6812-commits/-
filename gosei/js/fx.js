/* 演出まわり — キャンバスのパーティクル、カットイン、画面効果、合成音 */
(function (global) {
  'use strict';

  /* ============ 音 ============ */
  var ctx = null, master = null, muted = false;
  function ac() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function noiseBuf(sec) {
    var c = ac(), n = Math.floor(c.sampleRate * sec);
    var b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function env(node, t0, a, d, peak) {
    var g = ac().createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g);
    return g;
  }
  function tone(freq, t0, dur, type, peak, slideTo) {
    var c = ac(); if (!c || muted) return;
    var o = c.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    var g = env(o, t0, 0.008, dur, peak || 0.2);
    g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(t0, dur, freq, q, peak) {
    var c = ac(); if (!c || muted) return;
    var s = c.createBufferSource();
    s.buffer = noiseBuf(Math.max(dur, 0.05));
    var f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    s.connect(f);
    var g = env(f, t0, 0.004, dur, peak || 0.3);
    g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  var Sfx = {
    setMuted: function (m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted: function () { return muted; },
    unlock: function () { ac(); },
    clack: function () { var c = ac(); if (!c) return; var t = c.currentTime; noise(t, 0.055, 2400, 1.2, 0.22); tone(180, t, 0.05, 'square', 0.05); },
    draw: function () { var c = ac(); if (!c) return; noise(c.currentTime, 0.04, 5200, 0.8, 0.1); },
    call: function () { var c = ac(); if (!c) return; var t = c.currentTime; tone(520, t, 0.14, 'triangle', 0.25, 780); noise(t, 0.09, 1800, 1, 0.18); },
    riichi: function () {
      var c = ac(); if (!c) return; var t = c.currentTime;
      tone(1320, t, 0.5, 'triangle', 0.28, 660);
      tone(880, t + 0.03, 0.6, 'sine', 0.18);
      noise(t, 0.35, 6000, 0.6, 0.12);
    },
    ron: function () {
      var c = ac(); if (!c) return; var t = c.currentTime;
      noise(t, 0.5, 900, 0.4, 0.5);
      tone(110, t, 0.7, 'sawtooth', 0.3, 55);
      tone(330, t + 0.02, 0.5, 'square', 0.15, 220);
    },
    tsumo: function () {
      var c = ac(); if (!c) return; var t = c.currentTime;
      [523, 659, 784, 1047].forEach(function (f, i) { tone(f, t + i * 0.055, 0.3, 'triangle', 0.22); });
      noise(t, 0.3, 3000, 0.7, 0.2);
    },
    gong: function () {
      var c = ac(); if (!c) return; var t = c.currentTime;
      [55, 82, 110, 165, 220, 330].forEach(function (f, i) { tone(f, t + i * 0.004, 2.4, 'sine', 0.22); });
      noise(t, 1.6, 400, 0.4, 0.35);
      noise(t, 2.2, 2600, 0.3, 0.12);
    },
    whoosh: function () { var c = ac(); if (!c) return; noise(c.currentTime, 0.32, 700, 0.5, 0.28); },
    coin: function (i) { var c = ac(); if (!c) return; tone(1200 + (i % 5) * 90, c.currentTime, 0.06, 'square', 0.09); },
    lose: function () { var c = ac(); if (!c) return; var t = c.currentTime; tone(220, t, 0.5, 'sawtooth', 0.18, 90); }
  };

  /* ============ キャンバス演出 ============ */
  var cv = null, cx = null, parts = [], lines = null, running = false, dpr = 1;

  function init(canvas) {
    cv = canvas; cx = cv.getContext('2d');
    resize();
    global.addEventListener('resize', resize);
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    cv.width = global.innerWidth * dpr;
    cv.height = global.innerHeight * dpr;
    cv.style.width = global.innerWidth + 'px';
    cv.style.height = global.innerHeight + 'px';
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function ensureLoop() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }
  function frame() {
    var w = global.innerWidth, h = global.innerHeight;
    cx.clearRect(0, 0, w, h);

    if (lines) {
      lines.t += 1 / 60;
      var a = Math.max(0, 1 - lines.t / lines.dur);
      cx.save();
      cx.globalAlpha = a * 0.9;
      cx.translate(w / 2, h / 2);
      var R0 = Math.max(w, h) * 0.24, R1 = Math.max(w, h) * 0.85;
      for (var i = 0; i < lines.n; i++) {
        var ang = (i / lines.n) * Math.PI * 2 + lines.t * lines.spin;
        var wdt = lines.seed[i] * 0.05 + 0.006;
        cx.beginPath();
        cx.moveTo(Math.cos(ang) * R0, Math.sin(ang) * R0);
        cx.lineTo(Math.cos(ang + wdt) * R1, Math.sin(ang + wdt) * R1);
        cx.lineTo(Math.cos(ang - wdt) * R1, Math.sin(ang - wdt) * R1);
        cx.closePath();
        cx.fillStyle = lines.color;
        cx.fill();
      }
      cx.restore();
      if (lines.t >= lines.dur) lines = null;
    }

    for (var p = parts.length - 1; p >= 0; p--) {
      var o = parts[p];
      o.vy += o.g;
      o.x += o.vx; o.y += o.vy;
      o.vx *= o.drag; o.vy *= o.drag;
      o.life--;
      var al = Math.max(0, o.life / o.max);
      cx.save();
      cx.globalAlpha = al;
      cx.fillStyle = o.color;
      if (o.shape === 'star') {
        cx.translate(o.x, o.y); cx.rotate(o.rot += o.spin);
        star(cx, 0, 0, o.r, o.r * 0.45, 5);
      } else if (o.shape === 'bar') {
        cx.translate(o.x, o.y); cx.rotate(o.rot += o.spin);
        cx.fillRect(-o.r * 2, -o.r * 0.35, o.r * 4, o.r * 0.7);
      } else {
        cx.beginPath(); cx.arc(o.x, o.y, o.r, 0, 6.284); cx.fill();
      }
      cx.restore();
      if (o.life <= 0) parts.splice(p, 1);
    }

    if (!parts.length && !lines) { running = false; cx.clearRect(0, 0, w, h); return; }
    requestAnimationFrame(frame);
  }
  function star(c, x, y, R1, R2, n) {
    c.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? R2 : R1, a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath(); c.fill();
  }

  function burst(x, y, n, colors, opt) {
    opt = opt || {};
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (opt.speed || 7) * (0.35 + Math.random());
      parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 0),
        g: opt.g == null ? 0.18 : opt.g, drag: 0.97,
        r: (opt.r || 4) * (0.5 + Math.random()), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.4,
        life: (opt.life || 60) * (0.6 + Math.random() * 0.7), max: (opt.life || 60),
        color: colors[(Math.random() * colors.length) | 0], shape: opt.shape || 'dot'
      });
    }
    ensureLoop();
  }
  function rain(n, colors, opt) {
    opt = opt || {};
    var w = global.innerWidth, h = global.innerHeight;
    for (var i = 0; i < n; i++) {
      parts.push({
        x: Math.random() * w, y: -Math.random() * h * 0.6,
        vx: (Math.random() - 0.5) * 1.2, vy: 1 + Math.random() * 3,
        g: 0.06, drag: 1,
        r: (opt.r || 7) * (0.4 + Math.random()), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.2,
        life: 140 + Math.random() * 120, max: 200,
        color: colors[(Math.random() * colors.length) | 0], shape: opt.shape || 'star'
      });
    }
    ensureLoop();
  }
  function speedlines(dur, color, n) {
    lines = { t: 0, dur: dur || 0.9, color: color || 'rgba(255,255,255,0.85)', n: n || 46, spin: 0.35, seed: [] };
    for (var i = 0; i < lines.n; i++) lines.seed.push(Math.random());
    ensureLoop();
  }

  /* ============ DOM 演出 ============ */
  function shake(strength, ms) {
    var el = document.getElementById('root');
    if (!el) return;
    el.style.setProperty('--shake', (strength || 8) + 'px');
    el.classList.remove('shaking');
    void el.offsetWidth;
    el.classList.add('shaking');
    setTimeout(function () { el.classList.remove('shaking'); }, ms || 500);
  }
  function flash(color, ms) {
    var f = document.getElementById('flash');
    f.style.background = color || '#fff';
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    setTimeout(function () { f.classList.remove('on'); }, ms || 320);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* カットイン: {main, sub, kind:'riichi'|'ron'|'tsumo'|'call'|'yakuman'|'plain'} */
  function cutin(o) {
    var layer = document.getElementById('overlay');
    var wrap = document.createElement('div');
    wrap.className = 'cutin ci-' + (o.kind || 'plain');
    var band = document.createElement('div'); band.className = 'ci-band';
    var main = document.createElement('div'); main.className = 'ci-main'; main.textContent = o.main;
    main.dataset.text = o.main;
    band.appendChild(main);
    if (o.sub) { var s = document.createElement('div'); s.className = 'ci-sub'; s.textContent = o.sub; band.appendChild(s); }
    wrap.appendChild(band);
    layer.appendChild(wrap);
    var life = o.ms || 1100;
    setTimeout(function () { wrap.classList.add('out'); }, life - 260);
    setTimeout(function () { wrap.remove(); }, life);
    return sleep(life);
  }

  global.Fx = {
    init: init, burst: burst, rain: rain, speedlines: speedlines,
    shake: shake, flash: flash, cutin: cutin, sleep: sleep, clear: function () { parts.length = 0; lines = null; }
  };
  global.Sfx = Sfx;
})(window);
