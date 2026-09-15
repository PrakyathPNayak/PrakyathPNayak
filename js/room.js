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
 * Gallery: wall 3 hangs framed artworks and playable YouTube videos.
 *          Click zooms into the piece, displaying its title and description
 *          in a toast below. Videos are playable directly inside their frames.
 */
(() => {
  "use strict";

  /* =========================================================================
   * GALLERY DICTIONARY: Easy-to-edit configuration for all artworks & videos.
   * Add, remove, or modify items here. Layouts, physical frames, preloading,
   * centroids, zoom scales, and custom toast descriptions are generated automatically.
   * ========================================================================= */
  const GALLERY_ITEMS = [
    // === LEFT WING (Anchored between x: 9.5% and 32.5%, y: 23.0% and 85.5%) ===
    {
      id: "drawing-3",
      type: "image",
      name: "The girl in black",
      description:
        "I saw this in a reel once and decided to draw it. I no longer can find the source of it 🥀",
      src: "images/drawing_3.webp",
      fallback: "images/drawing_3.png",
      aspect: 0.707,
      left: 9.5,
      bottom: 52.0,
      height: 33.5,
      zoomScale: 2.3,
    },
    {
      id: "drawing-6",
      type: "image",
      name: "Sketchbook Studies",
      description:
        "I have this small book where I do quick skectes when I'm bored. These are the first four drawings from it!",
      src: "images/drawing_6.webp",
      fallback: "images/drawing_6.jpeg",
      aspect: 0.562,
      left: 23.8,
      bottom: 52.0,
      height: 28.0,
      zoomScale: 2.7,
    },
    {
      id: "video-1",
      type: "video",
      name: "Ayasa - The Reason Why (Piano Cover)",
      description: "The only cover I've managed to produce with a proper synthasia scroll alignment to the piano",
      src: "images/thumb_video_1.jpg",
      videoId: "hqhT2fbeE6w",
      aspect: 16 / 9,
      left: 9.5,
      bottom: 23.0,
      height: 22.5,
      zoomScale: 3.1,
    },

    // === CENTER HUB (Anchored between x: 34.5% and 66.0%, y: 22.0% and 88.5%) ===
    {
      id: "drawing-1",
      type: "image",
      name: "Freefall",
      description:
        "One day, I had this dream where I kept falling endlessly. There was no ground in sight to be scared of and it was all just sky. That, inspired this.",
      src: "images/drawing_1.png", // Original uncompressed PNG preserving native linear-sRGB color space
      fallback: "images/drawing_1.png",
      aspect: 0.707,
      left: 34.5,
      bottom: 50.5,
      height: 38.0,
      zoomScale: 2.0,
    },
    {
      id: "drawing-2",
      type: "image",
      name: "The game",
      description:
        "Art for a horror game we made. Good times!",
      src: "images/drawing_2.webp",
      fallback: "images/drawing_2.png",
      aspect: 0.707,
      left: 51.0,
      bottom: 50.5,
      height: 38.0,
      zoomScale: 2.0,
    },
    {
      id: "drawing-4",
      type: "image",
      name: "Anya the clueless",
      description:
        "A work from memory of a scene from Spy x Family",
      src: "images/drawing_4.webp",
      fallback: "images/drawing_4.png",
      aspect: 16 / 9,
      left: 37.8,
      bottom: 22.0,
      height: 24.5,
      zoomScale: 2.9,
    },

    // === RIGHT WING (Anchored between x: 67.5% and 91.0%, y: 23.0% and 75.5%) ===
    {
      id: "drawing-7",
      type: "image",
      name: "Boy",
      description:
        "Redraw of a random sketch I found on Google while browsing something to draw",
      src: "images/drawing_7.webp",
      fallback: "images/drawing_7.jpeg",
      aspect: 0.702,
      left: 67.5,
      bottom: 52.0,
      height: 28.0,
      zoomScale: 2.7,
    },
    {
      id: "drawing-5",
      type: "image",
      name: "The Golden Iris",
      description:
        "I wanted to create an OC at that time. But sadly, this is all the progess I could put towards it.",
      src: "images/drawing_5.webp",
      fallback: "images/drawing_5.png",
      aspect: 1.081,
      left: 79.5,
      bottom: 56.5,
      height: 19.0,
      zoomScale: 3.6,
    },
    {
      id: "video-2",
      type: "video",
      name: "Who's that P0k3mon?",
      description: "My attempt at animating a popular character from a popular series (please don't sue me Nintendo🥀)",
      src: "images/thumb_video_2.jpg",
      videoId: "VqTtbqpxFxc",
      aspect: 16 / 9,
      left: 67.5,
      bottom: 23.0,
      height: 22.5,
      zoomScale: 3.1,
    },
  ];

  const view = document.getElementById("room-view");
  const img = document.getElementById("room-img");
  const toast = document.getElementById("room-toast");
  const scene = document.getElementById("room-scene");
  const doors = document.getElementById("doors");
  const art = document.getElementById("art");
  const doorToastEl = document.getElementById("door-toast");
  const doorTag = document.getElementById("door-tag");
  const artToast = document.getElementById("art-toast");
  const artToastTitle = artToast ? artToast.querySelector(".art-toast-title") : null;
  const artToastDesc = artToast ? artToast.querySelector(".art-toast-desc") : null;
  const artToastHint = artToast ? artToast.querySelector(".art-toast-hint") : null;

  const doorBtns = [...document.querySelectorAll("#doors .door")];
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
  const DOORS = [
    { name: "YouTube", url: "https://www.youtube.com/@ashinycube" },
    { name: "LinkedIn", url: "https://www.linkedin.com/in/prakyath-p-nayak/" },
    { name: "GitHub", url: "https://github.com/PrakyathPNayak" },
  ];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Build framed artwork & video elements dynamically from GALLERY_ITEMS
  const artBtns = GALLERY_ITEMS.map((item, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `frame frame-${item.id} ${item.type === "video" ? "frame-video" : "frame-image"}`;
    btn.dataset.art = String(i);
    btn.setAttribute("aria-label", `${item.type === "video" ? "Video" : "Artwork"}: ${item.name}`);
    btn.style.left = `${item.left}%`;
    btn.style.bottom = `${item.bottom}%`;
    btn.style.height = `${item.height}%`;
    btn.style.aspectRatio = `${item.aspect}`;

    const housing = document.createElement("div");
    housing.className = "frame-housing";

    const mat = document.createElement("div");
    mat.className = "frame-mat";

    const picture = document.createElement("img");
    picture.src = item.src;
    picture.alt = "";
    picture.draggable = false;
    picture.onerror = () => {
      if (item.fallback && picture.src !== item.fallback) {
        picture.src = item.fallback;
      }
    };
    mat.appendChild(picture);

    if (item.type === "video") {
      const badge = document.createElement("div");
      badge.className = "play-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="7,4 19,12 7,20"></polygon></svg>`;
      mat.appendChild(badge);
    }

    housing.appendChild(mat);
    btn.appendChild(housing);
    art.appendChild(btn);
    return btn;
  });

  // Preload textures and gallery thumbnails so swaps never flash
  for (const src of [WALL_SRC, CEIL_SRC]) {
    const pre = new Image();
    pre.src = src;
  }
  for (const btn of doorBtns) {
    const pre = new Image();
    pre.src = btn.querySelector("img").getAttribute("src");
  }
  for (const item of GALLERY_ITEMS) {
    const pre = new Image();
    pre.src = item.src;
  }

  let started = false;
  let state = { type: "wall", i: 0 };
  let lastWall = 0;
  let focused = null; // { kind: "door" | "art", i } while zoomed, else null
  let activeVideoIframe = null;

  const describe = () => {
    if (state.type === "ceiling") return "ceiling";
    const wall = `wall ${state.i + 1}`;
    if (focused && focused.kind === "door" && state.i === DOOR_WALL)
      return `${wall}, ${DOORS[focused.i].name} door`;
    if (focused && focused.kind === "art" && state.i === ART_WALL)
      return `${wall}, ${GALLERY_ITEMS[focused.i].name}`;
    return wall;
  };

  // Arrow visibility: on the ceiling all four show; on a wall up/left/right
  // show; while zoomed into a door only down shows; while zoomed into art,
  // left/right step through pieces and down steps back.
  function render() {
    const zoomed = focused !== null;
    const isArtZoom = zoomed && focused.kind === "art";
    btns.down.hidden = state.type !== "ceiling" && !zoomed;
    btns.up.hidden = zoomed;
    btns.left.hidden = zoomed && !isArtZoom;
    btns.right.hidden = zoomed && !isArtZoom;
    btns.down.setAttribute("aria-label", zoomed ? "Back out" : "Look down");
    if (isArtZoom) {
      btns.left.setAttribute("aria-label", "Previous piece");
      btns.right.setAttribute("aria-label", "Next piece");
    } else {
      btns.left.setAttribute("aria-label", "Turn left");
      btns.right.setAttribute("aria-label", "Turn right");
    }
    view.setAttribute("aria-label", `Room view: ${describe()}`);
  }

  // Room switching transitions: smooth cinematic fade-out to dark, content swap at midpoint, and fade-in
  const FADE_MS = 220;
  let transitionToken = 0;
  let isFadingOut = false;
  let fadeTimeout = null;

  function applyRoomState() {
    const isCeil = state.type === "ceiling";
    const src = isCeil ? CEIL_SRC : WALL_SRC;
    const flip = !isCeil && state.i % 2 === 1;

    img.setAttribute("src", src);
    img.style.transform = flip ? "scaleX(-1)" : "";
    doors.classList.toggle("open", state.type === "wall" && state.i === DOOR_WALL);
    art.classList.toggle("open", state.type === "wall" && state.i === ART_WALL);
    render();
  }

  function switchRoom(nextState) {
    state = nextState;
    if (state.type === "wall") lastWall = state.i;

    unpreviewTag();
    clearActiveVideo();
    hideArtToast();

    if (reduced) {
      applyRoomState();
      return;
    }

    if (isFadingOut) {
      // Already fading out: state has been updated to the new target.
      // The pending timeout will apply the latest state at peak darkness.
      return;
    }

    isFadingOut = true;
    const token = ++transitionToken;
    view.classList.add("switching");

    if (fadeTimeout) clearTimeout(fadeTimeout);
    fadeTimeout = window.setTimeout(() => {
      if (token !== transitionToken) return;

      // Midpoint: scene is dark, apply new room contents
      applyRoomState();
      isFadingOut = false;

      // Fade back in
      requestAnimationFrame(() => {
        if (token === transitionToken) {
          view.classList.remove("switching");
        }
      });
    }, FADE_MS);
  }

  function clearActiveVideo() {
    if (activeVideoIframe) {
      activeVideoIframe.remove();
      activeVideoIframe = null;
    }
  }

  function showArtToast(item) {
    if (!artToast) return;
    toast.classList.remove("play"); // never stack pills
    doorToastEl.classList.remove("play");
    if (artToastTitle) artToastTitle.textContent = item.name;
    if (artToastDesc) artToastDesc.textContent = item.description;
    if (artToastHint) {
      artToastHint.textContent =
        item.type === "video"
          ? "playable video • click outside, press Esc or ↓ to return"
          : "click again, press Esc or ↓ to return";
    }
    artToast.classList.add("show");
  }

  function hideArtToast() {
    if (!artToast) return;
    artToast.classList.remove("show");
  }

  function clearZoom() {
    focused = null;
    clearActiveVideo();
    hideArtToast();
    scene.classList.remove("zoom");
    scene.style.removeProperty("--zoom-scale");
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

  // Door art metrics: 2048x1900 frames; solid slab spans x 28.1-70.9%
  const DOOR_IMG_W = 2048;
  const DOOR_IMG_H = 1900;
  const SLAB_CX = 0.495;
  const SLAB_CY = 0.5;

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

  // Gallery art centroids: derived directly from item coordinates in GALLERY_ITEMS
  function artCentroid(i) {
    const item = GALLERY_ITEMS[i];
    const W = scene.clientWidth;
    const H = scene.clientHeight;
    const boxH = (item.height / 100) * H;
    const boxW = boxH * item.aspect;
    const left = (item.left / 100) * W;
    const top = H - (item.bottom / 100) * H - boxH;
    return [left + boxW / 2, top + boxH / 2];
  }

  function focusItem(kind, i) {
    focused = { kind, i };
    clearActiveVideo();

    if (kind === "door") {
      hideArtToast();
      const [cx, cy] = doorCentroid(i);
      scene.style.transformOrigin = `${cx}px ${cy}px`;
      scene.style.setProperty("--zx", `${scene.clientWidth / 2 - cx}px`);
      scene.style.setProperty("--zy", `${scene.clientHeight / 2 - cy}px`);
      scene.style.setProperty("--zoom-scale", "3");
      scene.classList.add("zoom");
      doorToast("click the door to open");
      showTag(DOORS[i].name);
    } else {
      const item = GALLERY_ITEMS[i];
      const zoomScale = item.zoomScale || 2.4;
      const [cx, cy] = artCentroid(i);
      scene.style.transformOrigin = `${cx}px ${cy}px`;
      scene.style.setProperty("--zx", `${scene.clientWidth / 2 - cx}px`);
      scene.style.setProperty("--zy", `${scene.clientHeight / 2 - cy}px`);
      scene.style.setProperty("--zoom-scale", String(zoomScale));
      scene.classList.add("zoom");
      showTag(item.name);
      showArtToast(item);

      // Mount interactive playable YouTube video player
      if (item.type === "video") {
        const mat = artBtns[i].querySelector(".frame-mat");
        if (mat) {
          const iframe = document.createElement("iframe");
          iframe.src = `https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1&rel=0`;
          iframe.title = item.name;
          iframe.allow =
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
          iframe.allowFullscreen = true;
          mat.appendChild(iframe);
          activeVideoIframe = iframe;
        }
      }
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
      const item = GALLERY_ITEMS[i];
      // For images, clicking the frame again steps back.
      // For videos, do not immediately exit on frame click so video can be interacted with.
      if (item.type !== "video") {
        clearZoom();
        render();
        return;
      }
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
    btn.addEventListener("mouseenter", () => previewTag(DOORS[i].name));
    btn.addEventListener("mouseleave", unpreviewTag);
    btn.addEventListener("focus", () => previewTag(DOORS[i].name));
    btn.addEventListener("blur", unpreviewTag);
  });

  artBtns.forEach((btn, i) => {
    btn.addEventListener("click", () => onArt(i));
    btn.addEventListener("mouseenter", () => previewTag(GALLERY_ITEMS[i].name));
    btn.addEventListener("mouseleave", unpreviewTag);
    btn.addEventListener("focus", () => previewTag(GALLERY_ITEMS[i].name));
    btn.addEventListener("blur", unpreviewTag);
  });

  function go(dir) {
    if (!started) return;
    if (focused !== null) {
      // Zoomed in: down backs out
      if (dir === "down") {
        clearZoom();
        render();
        return;
      }
      // When zoomed into art, left / right step to the adjacent artwork or video
      if (focused.kind === "art") {
        if (dir === "left") {
          const prev = (focused.i + GALLERY_ITEMS.length - 1) % GALLERY_ITEMS.length;
          focusItem("art", prev);
          return;
        }
        if (dir === "right") {
          const next = (focused.i + 1) % GALLERY_ITEMS.length;
          focusItem("art", next);
          return;
        }
      }
      return;
    }
    let nextState;
    if (state.type === "wall") {
      if (dir === "left") nextState = { type: "wall", i: (state.i + 3) % 4 };
      else if (dir === "right") nextState = { type: "wall", i: (state.i + 1) % 4 };
      else if (dir === "up") {
        nextState = { type: "ceiling" };
      } else return; // no floor: down does nothing on a wall
    } else {
      if (dir === "up") nextState = { type: "wall", i: (lastWall + 2) % 4 };
      else if (dir === "down") nextState = { type: "wall", i: lastWall };
      else if (dir === "left") nextState = { type: "wall", i: (lastWall + 3) % 4 };
      else if (dir === "right") nextState = { type: "wall", i: (lastWall + 1) % 4 };
      else return;
    }
    switchRoom(nextState);
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
    if (ev.repeat) return;
    ev.preventDefault();
    go(dir);
  });

  function start() {
    if (started) return;
    applyRoomState();
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
