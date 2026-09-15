/* Room viewer: 4 walls + 1 ceiling, navigated with on-screen or keyboard
 * arrows. Started on `intro:complete` (see index.html wiring).
 *
 * Views: wall 0..3 (all `images/wall.jpg`; odd walls are mirrored for a
 * touch of variety) and ceiling (`images/ceiling.jpg`).
 *
 * Wall:    left / right turn to the adjacent wall, up tilts to the ceiling.
 *          F toggles fullscreen.
 *          (No floor exists, so the down arrow stays hidden.)
 * Ceiling: all four arrows work. Down returns to the wall you looked up
 *          from (it sits at the bottom edge when tilted back), up faces the
 *          opposite wall behind you, and left / right turn to the adjacent
 *          walls.
 * Doors:   wall 1 carries three doors (YouTube / LinkedIn / GitHub). The
 *          first click zooms in and toasts "click the door to open";
 *          clicking the zoomed door again follows its link. Esc, down, or
 *          any other arrow resets the zoom.
 * Gallery: wall 3 hangs three copies of `images/drawing.png` at different
 *          sizes. Click zooms in (click again, Esc, or down steps back).
 */
(() => {
  "use strict";

  const view = document.getElementById("room-view");
  const img = document.getElementById("room-img");
  const toast = document.getElementById("room-toast");
  const scene = document.getElementById("room-scene");
  const doors = document.getElementById("doors");
  const art = document.getElementById("art");
  const doorToastEl = document.getElementById("door-toast");
  const doorTag = document.getElementById("door-tag");
  const doorBtns = [...document.querySelectorAll("#doors .door")];
  const artBtns = [...document.querySelectorAll("#art .frame")];
  const btns = {
    up: document.getElementById("arrow-up"),
    down: document.getElementById("arrow-down"),
    left: document.getElementById("arrow-left"),
    right: document.getElementById("arrow-right"),
  };

  const WALL_SRC = "images/wall.jpg";
  const CEIL_SRC = "images/ceiling.jpg";
  const DOOR_WALL = 0;
  const ART_WALL = 2;
  const ART_LABEL = "digital art";
  const DOORS = [
    { name: "YouTube", url: "https://www.youtube.com/@ashinycube" },
    { name: "LinkedIn", url: "https://www.linkedin.com/in/prakyath-p-nayak/" },
    { name: "GitHub", url: "https://github.com/PrakyathPNayak" },
  ];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Preload so view swaps never flash.
  for (const src of [WALL_SRC, CEIL_SRC]) {
    const pre = new Image();
    pre.src = src;
  }
  for (const btn of doorBtns) {
    const pre = new Image();
    pre.src = btn.querySelector("img").getAttribute("src");
  }
  for (const btn of artBtns) {
    const pre = new Image();
    pre.src = btn.querySelector("img").getAttribute("src");
  }

  let started = false;
  let state = { type: "wall", i: 0 };
  let lastWall = 0;
  let focused = null; // { kind: "door" | "art", i } while zoomed, else null

  const describe = () => {
    if (state.type === "ceiling") return "ceiling";
    const wall = `wall ${state.i + 1}`;
    if (focused && focused.kind === "door" && state.i === DOOR_WALL)
      return `${wall}, ${DOORS[focused.i].name} door`;
    if (focused && focused.kind === "art" && state.i === ART_WALL) return `${wall}, artwork`;
    return wall;
  };

  // Arrow visibility: on the ceiling all four show; on a wall up/left/right
  // show; while zoomed into a door only down shows (it backs out).
  function render() {
    const zoomed = focused !== null;
    btns.down.hidden = state.type !== "ceiling" && !zoomed;
    btns.up.hidden = zoomed;
    btns.left.hidden = zoomed;
    btns.right.hidden = zoomed;
    btns.down.setAttribute("aria-label", zoomed ? "Back out" : "Look down");
    view.setAttribute("aria-label", `Room view: ${describe()}`);
  }

  // Serial for in-flight swaps: holding an arrow fires key repeats, and a
  // stale timeout must never resurrect an old picture mid-flight.
  let swapToken = 0;

  function show(src, flip) {
    img.style.transform = flip ? "scaleX(-1)" : "";
    // Same picture (e.g. wall to wall): no fade, no reload flash.
    if (img.getAttribute("src") === src) {
      swapToken++;
      view.classList.remove("swap");
      return;
    }
    if (reduced) {
      swapToken++;
      img.setAttribute("src", src);
      return;
    }
    const t = ++swapToken;
    view.classList.add("swap");
    window.setTimeout(() => {
      if (t !== swapToken) return;
      img.setAttribute("src", src);
      requestAnimationFrame(() => {
        if (t === swapToken) view.classList.remove("swap");
      });
    }, 200);
  }

  function paint() {
    if (state.type === "ceiling") {
      show(CEIL_SRC, false);
    } else {
      show(WALL_SRC, state.i % 2 === 1);
    }
    doors.classList.toggle("open", state.type === "wall" && state.i === DOOR_WALL);
    art.classList.toggle("open", state.type === "wall" && state.i === ART_WALL);
    render();
  }

  function clearZoom() {
    focused = null;
    scene.classList.remove("zoom");
    hideTag();
  }

  // Side tag: shows, then fades away on its own like a toast.
  let tagTimer = 0;

  function showTag(name) {
    doorTag.textContent = name;
    doorTag.classList.add("show");
    window.clearTimeout(tagTimer);
    tagTimer = window.setTimeout(() => doorTag.classList.remove("show"), 2500);
  }

  function hideTag() {
    window.clearTimeout(tagTimer);
    doorTag.classList.remove("show");
  }

  function doorToast(name) {
    toast.classList.remove("play"); // never stack pills
    doorToastEl.textContent = name;
    doorToastEl.classList.remove("play");
    void doorToastEl.offsetWidth;
    doorToastEl.classList.add("play");
  }

  // Door art metrics: 2048x1900 frames; the solid slab spans x 28.1-70.9%
  // (measured from PNG alpha), full height. Centroid of the slab:
  const DOOR_IMG_W = 2048;
  const DOOR_IMG_H = 1900;
  const SLAB_CX = 0.495;
  const SLAB_CY = 0.5;

  // Zoom centroid derived from the SAME variables as css/room.css
  // (.room-view custom properties), so layout and zoom can never drift.
  function doorCentroid(i) {
    const cs = getComputedStyle(view);
    const num = (name) => parseFloat(cs.getPropertyValue(name));
    const W = scene.clientWidth;
    const H = scene.clientHeight;
    const boxH = (num("--door-h") / 100) * H;
    const boxW = (boxH * DOOR_IMG_W) / DOOR_IMG_H;
    const lefts = [
      (num("--door-yt") / 100) * W + num("--door-gap"),
      (num("--door-in") / 100) * W,
      (num("--door-gh") / 100) * W - num("--door-gap"),
    ];
    const top = H - ((num("--door-base") / 100) * H + num("--door-lift")) - boxH;
    return [lefts[i] + boxW * SLAB_CX, top + boxH * SLAB_CY];
  }

  // Gallery art metrics: 1200x1694 frames, symmetric moulding, so the
  // centroid is the box centre. Geometry comes from the SAME variables as
  // css/room.css (.room-view custom properties), like the doors.
  const ART_IMG_W = 1200;
  const ART_IMG_H = 1694;
  const ART_FRAMES = ["f0", "f1", "f2"];

  function artCentroid(i) {
    const cs = getComputedStyle(view);
    const num = (name) => parseFloat(cs.getPropertyValue(name));
    const W = scene.clientWidth;
    const H = scene.clientHeight;
    const p = ART_FRAMES[i];
    const boxH = (num(`--${p}-h`) / 100) * H;
    const boxW = (boxH * ART_IMG_W) / ART_IMG_H;
    const left = (num(`--${p}-l`) / 100) * W;
    const top = H - ((num(`--${p}-b`) / 100) * H + num("--art-lift")) - boxH;
    return [left + boxW / 2, top + boxH / 2];
  }

  function focusItem(kind, i) {
    focused = { kind, i };
    // Doors and art both use analytic centroids from shared CSS variables,
    // so layout and zoom can never drift.
    const [cx, cy] = kind === "door" ? doorCentroid(i) : artCentroid(i);
    // Scale alone pins the origin in place; the translate carries the
    // centroid to the middle of the frame (matters for side pieces).
    scene.style.transformOrigin = `${cx}px ${cy}px`;
    scene.style.setProperty("--zx", `${scene.clientWidth / 2 - cx}px`);
    scene.style.setProperty("--zy", `${scene.clientHeight / 2 - cy}px`);
    scene.classList.add("zoom");
    if (kind === "door") {
      doorToast("click the door to open");
      showTag(DOORS[i].name);
    } else {
      doorToast("click again to step back");
      showTag(ART_LABEL);
    }
    render();
  }

  function onDoor(i) {
    if (!started) return;
    if (focused && focused.kind === "door" && focused.i === i) {
      window.open(DOORS[i].url, "_blank", "noopener,noreferrer");
      return;
    }
    focusItem("door", i);
  }

  function onArt(i) {
    if (!started || !scene.clientWidth) return;
    if (focused && focused.kind === "art" && focused.i === i) {
      clearZoom();
      render();
      return;
    }
    focusItem("art", i);
  }

  function previewTag(label) {
    if (focused !== null) return;
    doorTag.textContent = label;
    doorTag.classList.add("show");
  }

  function unpreviewTag() {
    if (focused !== null) return;
    doorTag.classList.remove("show");
  }

  doorBtns.forEach((btn, i) => {
    btn.addEventListener("click", () => onDoor(i));
    // Hovering (or keyboard-focusing) previews the tag — never while zoomed.
    btn.addEventListener("mouseenter", () => previewTag(DOORS[i].name));
    btn.addEventListener("mouseleave", unpreviewTag);
    btn.addEventListener("focus", () => previewTag(DOORS[i].name));
    btn.addEventListener("blur", unpreviewTag);
  });

  artBtns.forEach((btn, i) => {
    btn.addEventListener("click", () => onArt(i));
    btn.addEventListener("mouseenter", () => previewTag(ART_LABEL));
    btn.addEventListener("mouseleave", unpreviewTag);
    btn.addEventListener("focus", () => previewTag(ART_LABEL));
    btn.addEventListener("blur", unpreviewTag);
  });

  function go(dir) {
    if (!started) return;
    if (focused !== null) {
      // Zoomed in: down backs out, everything else is locked.
      if (dir === "down") {
        clearZoom();
        render();
      }
      return;
    }
    if (state.type === "wall") {
      if (dir === "left") state.i = (state.i + 3) % 4;
      else if (dir === "right") state.i = (state.i + 1) % 4;
      else if (dir === "up") {
        lastWall = state.i;
        state = { type: "ceiling" };
      } else return; // no floor: down does nothing on a wall
    } else {
      if (dir === "up") state = { type: "wall", i: (lastWall + 2) % 4 };
      else if (dir === "down") state = { type: "wall", i: lastWall };
      else if (dir === "left") state = { type: "wall", i: (lastWall + 3) % 4 };
      else if (dir === "right") state = { type: "wall", i: (lastWall + 1) % 4 };
      else return;
    }
    if (state.type === "wall") lastWall = state.i;
    paint();
  }

  for (const [dir, el] of Object.entries(btns)) {
    el.addEventListener("click", () => go(dir));
  }

  const KEYS = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
    W: "up",
    S: "down",
    A: "left",
    D: "right",
  };
  // Fullscreen with vendor fallbacks (Safari / old Firefox / old Chromium).
  // Everything is promise-normalised and rejection-safe: unsupported
  // environments (e.g. iPhone Safari on non-video elements) just no-op.
  function isFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  function requestFullscreen(el) {
    const req =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen;
    if (!req) return Promise.reject(new Error("fullscreen unsupported"));
    try {
      return Promise.resolve(req.call(el));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function exitFullscreen() {
    const exit =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.mozCancelFullScreen ||
      document.msExitFullscreen;
    if (!exit) return Promise.reject(new Error("fullscreen unsupported"));
    try {
      return Promise.resolve(exit.call(document));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  window.addEventListener("keydown", (ev) => {
    if (!started) return;
    if (ev.key === "Escape" && focused !== null) {
      clearZoom();
      render();
      return;
    }
    if (
      typeof ev.key === "string" &&
      ev.key.toLowerCase() === "f" &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey
    ) {
      // Own the key: block any browser default (find bars, quick-find)
      // and leave modified combos like Ctrl+F to the browser.
      ev.preventDefault();
      if (isFullscreen()) {
        exitFullscreen().catch(() => {});
      } else {
        requestFullscreen(document.documentElement).catch(() => {});
      }
      return;
    }
    const dir = KEYS[ev.key];
    if (!dir) return;
    ev.preventDefault();
    go(dir);
  });

  function start() {
    if (started) return;
    paint(); // render + doors; show() no-ops the fade when src is unchanged
    // Opening hint: fades in, holds, fades away (see room.css).
    requestAnimationFrame(() => toast.classList.add("play"));
    // Arm input on the next tick: intro.js dispatches `intro:complete`
    // synchronously, so without this the keypress/click that dismissed
    // the intro would also trigger a move here.
    window.setTimeout(() => {
      started = true;
    }, 0);
  }

  window.addEventListener("intro:complete", start, { once: true });
})();
