/* Intro scene: a small cube darts up from near the bottom while spinning,
 * decelerates into a slow hover at the centre, then title cards appear:
 *   1. "A Shiny Cube presents:"
 *   2. "Portfolio: Prakyath P Nayak"
 *   3. "click anywhere to begin" (bottom)
 * The resting cube idles with a gentle bob + slight RGB/slice glitch that
 * loops until ANY key / click / tap dismisses the overlay.
 *
 * Perspective: true 2-point. Vertical edges stay vertical (object only yaws;
 * the tiny rest tilt is ~6 degrees so the top face reads). The horizon line
 * — and therefore both vanishing points — sits just below the bottom edge,
 * so receding left/right edges converge toward VP markers at the bottom.
 *
 * Next step hook: listen for `intro:complete`, or use
 *   Intro.onComplete(() => { /* start your scene *\/ });
 *   Intro.skip(); // dismiss programmatically
 */
(() => {
  "use strict";

  const overlay = document.getElementById("intro");
  const canvas = document.getElementById("film");
  const ctx = canvas.getContext("2d");
  const line1 = document.getElementById("line1");
  const line2 = document.getElementById("line2");
  const hint = document.getElementById("hint");
  const app = document.getElementById("app");

  document.body.classList.add("locked");

  // ---- timeline (ms) ----
  const RISE_MS = 6000; // rise duration; eases into the slow hover
  const T1_MS = RISE_MS + 150; // "A Shiny Cube presents:"
  const T2_MS = RISE_MS + 1000; // "Portfolio: Prakyath P Nayak"
  const HINT_MS = RISE_MS + 1800; // "click anywhere to begin"
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- camera / projection state (recomputed on resize) ----
  let W = 0;
  let H = 0;
  let DPR = 1;
  let focal = 800; // focal length in px
  let camD = 700; // camera distance in world units
  let horizonY = 0; // horizon line: just below the screen => VPs at bottom
  let eyeY = -110; // camera height (low angle => horizon drops)
  let cx = 0;
  let yStart = 0; // world y that projects near the bottom
  let yEnd = 0; // world y that projects to the centre
  let sizeStart = 30;
  let sizeEnd = 130;

  const worldYForScreenY = (sy) => eyeY + ((horizonY - sy) * camD) / focal;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    DPR = dpr;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    focal = H * 1.1;
    camD = 700;
    horizonY = H * 1.03; // VPs live on this line, below the frame
    eyeY = -110;
    cx = W / 2;

    yStart = worldYForScreenY(H * 0.84); // small cube near the bottom
    yEnd = worldYForScreenY(H * 0.55); // resting spot, ~centre
    sizeEnd = Math.max(85, Math.min(130, W * 0.14));
    sizeStart = sizeEnd * 0.3;
  }
  window.addEventListener("resize", resize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resize);
  }
  resize();

  // ---- performance: pre-baked film grain + adaptive quality ----
  // Grain tiles are rendered once at load; per frame the grain is a single
  // patterned fill instead of ~90 individual rects. A frame-time EMA watches
  // for weak hardware: if frames stay slow, grain thins out, dust halves,
  // and the slice-tear (the only mid-frame copy) is skipped entirely.
  const grainTiles = [];
  for (let k = 0; k < 4; k++) {
    const tile = document.createElement("canvas");
    tile.width = 128;
    tile.height = 128;
    const g = tile.getContext("2d");
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = Math.random() < 0.45 ? 0 : 20;
    }
    g.putImageData(img, 0, 0);
    grainTiles.push(tile);
  }
  let grainPatterns = [];
  function ensureGrainPatterns() {
    if (grainPatterns.length) return;
    grainPatterns = grainTiles.map((t) => ctx.createPattern(t, "repeat"));
  }

  // ---- helpers ----
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // ---- cube geometry: unit cube centred on origin ----
  const V = [
    [-0.5, -0.5, -0.5], // 0
    [0.5, -0.5, -0.5], // 1
    [-0.5, 0.5, -0.5], // 2
    [0.5, 0.5, -0.5], // 3
    [-0.5, -0.5, 0.5], // 4
    [0.5, -0.5, 0.5], // 5
    [-0.5, 0.5, 0.5], // 6
    [0.5, 0.5, 0.5], // 7
  ];
  // 12 edges as vertex pairs; every edge draws at full strength so the
  // wireframe stays uniformly saturated from all angles.
  const EDGES = [
    [0, 1],
    [1, 3],
    [3, 2],
    [2, 0], // back square
    [4, 5],
    [5, 7],
    [7, 6],
    [6, 4], // front square
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7], // struts
  ];

  // rotate object point by yaw then pitch
  function rotPt(x, y, z, cosY, sinY, cosX, sinX) {
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    return [x1, y2, z2];
  }

  function project(x, y, z) {
    const depth = -(z - camD); // camera looks down -Z from z = camD
    return [cx + (focal * x) / depth, horizonY - (focal * (y - eyeY)) / depth, depth];
  }

  function strokeEdge(a, b) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  // glitch: 0 = clean, 1 = full tear (envelope 1 -> 0 over the burst)
  function drawCube(yWorld, rotY, rotX, size, glitch) {
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const jx = glitch > 0 ? (Math.random() - 0.5) * glitch * 9 : 0;
    const jy = glitch > 0 ? (Math.random() - 0.5) * glitch * 5 : 0;

    const sp = V.map(([x, y, z]) => {
      const [rx, ry, rz] = rotPt(x * size, y * size, z * size, cosY, sinY, cosX, sinX);
      const [sx, sy, depth] = project(rx, ry + yWorld, rz);
      return [sx + jx, sy + jy, depth];
    });

    // soft depth cue: only the 3 edges meeting at the single farthest
    // vertex draw dimmer — the exact hidden set for a convex cube.
    const lw = Math.max(1, size * 0.012);
    const deepest = sp.reduce((bi, p, i) => (p[2] > sp[bi][2] ? i : bi), 0);
    const isBack = (e) => e[0] === deepest || e[1] === deepest;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    for (const back of [true, false]) {
      // behind first, so front edges overlap cleanly
      ctx.strokeStyle = back ? "rgba(242,232,201,0.3)" : "rgba(242,232,201,0.9)";
      for (const e of EDGES) {
        if (isBack(e) !== back) continue;
        strokeEdge(sp[e[0]], sp[e[1]]);
      }
    }

    // glowing nodes on the corners keep the small cube readable
    for (let i = 0; i < sp.length; i++) {
      const p = sp[i];
      ctx.fillStyle = i === deepest ? "rgba(242,232,201,0.7)" : "rgba(242,232,201,0.9)";
      ctx.beginPath();
      ctx.arc(p[0], p[1], lw * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // chromatic ghost pass: the "slight glitch"
    if (glitch > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = lw;
      for (const [off, col] of [
        [glitch * 7, "rgba(255,0,76,0.5)"],
        [-glitch * 7, "rgba(0,229,255,0.5)"],
      ]) {
        ctx.strokeStyle = col;
        for (const e of EDGES) {
          const a = sp[e[0]];
          const b = sp[e[1]];
          ctx.beginPath();
          ctx.moveTo(a[0] + off, a[1]);
          ctx.lineTo(b[0] + off, b[1]);
          ctx.stroke();
        }
      }
      // torn horizontal slices via a GPU self-blit (no readback stall).
      // Skipped entirely in low-quality mode.
      if (!lowQ) {
        ctx.globalCompositeOperation = "source-over";
        for (let i = 0; i < 2; i++) {
          const sy = H * 0.35 + Math.random() * H * 0.4;
          const sh = 4 + Math.random() * 10;
          const dx = (Math.random() - 0.5) * glitch * 26;
          ctx.drawImage(canvas, 0, sy * DPR, canvas.width, sh * DPR, dx, sy, W, sh);
        }
      }
      ctx.restore();
    }
  }

  // ---- faint drafting guides: horizon + VP markers at the bottom ----
  function drawGuides() {
    ctx.save();
    // horizon (VPs live on this line, just off-frame at the bottom)
    ctx.strokeStyle = "rgba(242,232,201,0.12)";
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizonY - 2);
    ctx.lineTo(W, horizonY - 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const vps = [
      [W * 0.06, "VP·L"],
      [W * 0.94, "VP·R"],
    ];
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    for (const [vx, label] of vps) {
      ctx.fillStyle = "rgba(242,232,201,0.35)";
      ctx.beginPath();
      ctx.moveTo(vx, H - 18);
      ctx.lineTo(vx + 5, H - 11);
      ctx.lineTo(vx, H - 4);
      ctx.lineTo(vx - 5, H - 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillText(label, vx, H - 24);
    }
    ctx.restore();
  }

  // ---- old-film dust ----
  const dust = Array.from({ length: 45 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.6 + Math.random() * 1.4,
    s: 0.008 + Math.random() * 0.03,
    ph: Math.random() * Math.PI * 2,
  }));

  function drawDust(t) {
    ctx.save();
    ctx.fillStyle = "rgba(242,232,201,0.13)";
    for (let i = 0; i < dust.length; i++) {
      if (lowQ && i & 1) continue; // halve the dust on weak hardware
      const d = dust[i];
      d.y -= d.s / 60;
      if (d.y < -0.02) {
        d.y = 1.02;
        d.x = Math.random();
      }
      const x = (d.x + Math.sin(t / 1900 + d.ph) * 0.004) * W;
      const s = d.r * 1.6; // squares, not arcs: identical at 1-2px, cheaper
      ctx.fillRect(x, d.y * H, s, s);
    }
    ctx.restore();
  }

  function drawGrainAndScratch(frameNo) {
    ensureGrainPatterns();
    // animated grain: cycle the 4 pre-baked tiles with a random offset
    if (!lowQ || frameNo % 3 === 0) {
      ctx.save();
      ctx.globalAlpha = lowQ ? 0.5 : 0.8;
      ctx.translate(-Math.random() * 128, -Math.random() * 128);
      ctx.fillStyle = grainPatterns[frameNo % grainPatterns.length];
      ctx.fillRect(0, 0, W + 128, H + 128);
      ctx.restore();
    }
    // projector flicker wash
    ctx.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.03})`;
    ctx.fillRect(0, 0, W, H);
    // occasional vertical scratch (skipped in low-quality mode)
    if (!reduced && !lowQ && Math.random() < 0.012) {
      ctx.fillStyle = "rgba(242,232,201,0.06)";
      ctx.fillRect(Math.random() * W, 0, 1, H);
    }
  }

  // ---- animation state ----
  const REST_YAW = Math.PI * 2 - Math.PI / 4; // a gentle 45° turn into the symmetric 2-face view (no full spin)
  const REST_TILT = -0.1;
  const t0 = performance.now();
  let lastNow = t0;
  let frameNo = 0;
  let emaDt = 16;
  let lowQ = false;
  let lowTimer = 0;
  let nextGlitch = t0 + RISE_MS + 1600;
  let glitchUntil = 0;

  // staggered title cards (DOM, so fonts stay crisp)
  const showAfter = (el, ms) =>
    window.setTimeout(() => el.classList.add("show"), reduced ? ms / 4 : ms);
  showAfter(line1, T1_MS);
  showAfter(line2, T2_MS);
  showAfter(hint, HINT_MS);

  let raf = 0;
  function frame(now) {
    // adaptive quality: sustained slow frames degrade effects gracefully
    const dt = Math.min(now - lastNow, 100);
    lastNow = now;
    frameNo++;
    emaDt = emaDt * 0.95 + dt * 0.05;
    if (!lowQ && emaDt > 27) {
      if (++lowTimer > 45) lowQ = true;
    } else if (emaDt < 18) {
      lowQ = false;
      lowTimer = 0;
    }

    const el = now - t0;
    const p = clamp01(el / (reduced ? 400 : RISE_MS));
    const e = easeOutCubic(p); // brisk but softened launch, long settle into idle

    let yWorld;
    let rotY;
    let rotX;
    let size;
    if (p < 1) {
      // Act 1: rise + spin, growing as it approaches
      yWorld = lerp(yStart, yEnd, e);
      // turn runs on its own softer curve so it stays lazy while the rise zips
      rotY = lerp(0, REST_YAW, easeOutCubic(p));
      rotX = lerp(0.35, REST_TILT, e);
      size = lerp(sizeStart, sizeEnd, e);
    } else {
      // Act 2 (loops): gentle hover + slow sway; glitch bursts
      const idle = (now - (t0 + (reduced ? 400 : RISE_MS))) / 1000;
      const blend = Math.min(1, idle / 1.2); // fade the drift in: no pop
      yWorld = yEnd + (reduced ? 0 : Math.sin(idle * 0.95) * 6 * blend);
      rotY = REST_YAW + (reduced ? 0 : Math.sin(idle * 0.55) * 0.07 * blend);
      rotX = REST_TILT + (reduced ? 0 : Math.sin(idle * 0.75) * 0.02 * blend);
      size = sizeEnd;
    }

    let glitch = 0;
    if (!reduced && p >= 1) {
      if (now > nextGlitch) {
        glitchUntil = now + 130 + Math.random() * 140;
        nextGlitch = now + 1600 + Math.random() * 2400;
      }
      if (now < glitchUntil) glitch = (glitchUntil - now) / 270; // 1 -> 0
    }

    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, W, H);

    // top outer corners for the construction lines (approx: extremes of top face)
    drawCube(yWorld, rotY, rotX, size, glitch);
    drawGuides();
    drawDust(now);
    drawGrainAndScratch(frameNo);

    if (!done) raf = requestAnimationFrame(frame);
  }

  // ---- dismissal: any key / click / tap ----
  let done = false;
  let armed = false;
  const waiters = [];
  window.setTimeout(() => {
    armed = true;
  }, 400);

  function complete() {
    if (done || !armed) return;
    // Landscape gate (see js/mobile.js): portrait-mobile taps must only see
    // the rotate overlay, never dismiss the intro behind it.
    if (document.body.classList.contains("needs-rotate")) return;
    done = true;
    // Go immersive synchronously inside the dismiss gesture — awaiting here
    // would lose transient activation and the browser would reject.
    if (window.Mobile && typeof window.Mobile.enterImmersive === "function") {
      window.Mobile.enterImmersive();
    }
    overlay.classList.add("leaving");
    window.dispatchEvent(new CustomEvent("intro:complete"));
    for (const fn of waiters.splice(0)) {
      try {
        fn();
      } catch {
        /* waiter errors must not break dismissal */
      }
    }
    window.setTimeout(() => {
      cancelAnimationFrame(raf);
      overlay.hidden = true;
      app.hidden = false;
      document.body.classList.remove("locked");
    }, 650);
  }

  window.addEventListener("pointerdown", complete);
  window.addEventListener("touchstart", complete, { passive: true });
  window.addEventListener("keydown", complete);
  overlay.focus({ preventScroll: true });

  window.Intro = {
    onComplete(fn) {
      if (done) fn();
      else waiters.push(fn);
    },
    skip: complete,
  };

  raf = requestAnimationFrame(frame);
})();
