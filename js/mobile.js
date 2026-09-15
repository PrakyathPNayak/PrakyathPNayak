/* Mobile compatibility: landscape-only gate + immersive fullscreen.
 *
 * - Shows #rotate-overlay while a mobile-sized viewport is in portrait, so
 *   the viewer only ever sees the site in landscape.
 * - `Mobile.enterImmersive()` requests fullscreen then locks to landscape
 *   (Screen Orientation API). Called synchronously from the intro-dismiss
 *   gesture in intro.js; also wired to the overlay button and an on-screen
 *   fullscreen toggle for touch devices.
 * - Fullscreen / orientation lock are best-effort: iPhone Safari has no
 *   generic fullscreen or orientation lock, so there the rotate prompt is
 *   the fallback and rejections are swallowed silently.
 */
(() => {
  "use strict";

  const overlay = document.getElementById("rotate-overlay");
  const overlayBtn = document.getElementById("rotate-fullscreen");
  const fsToggle = document.getElementById("fs-toggle");

  const coarse = window.matchMedia("(pointer: coarse)");
  const portraitMql = window.matchMedia("(orientation: portrait)");
  const MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod|Mobile/i;

  function isTouchDevice() {
    return (
      (coarse && coarse.matches) ||
      MOBILE_UA.test(navigator.userAgent || "") ||
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0
    );
  }

  function isPortrait() {
    if (portraitMql && typeof portraitMql.matches === "boolean") {
      // matchMedia can lag behind innerWidth/Height during rotation; treat
      // either signal as portrait so the gate never flickers open mid-turn.
      if (portraitMql.matches) return true;
    }
    return window.innerHeight > window.innerWidth;
  }

  // Gate only mobile-sized viewports: phones/tablets in portrait get the
  // rotate screen, desktop portrait keeps working (monitors can't rotate).
  function needsRotate() {
    if (!isPortrait()) return false;
    if (isTouchDevice()) return true;
    return window.innerWidth < 820;
  }

  function updateRotateGate() {
    const blocked = needsRotate();
    document.body.classList.toggle("needs-rotate", blocked);
    if (overlay) {
      if (blocked) overlay.removeAttribute("hidden");
      else overlay.setAttribute("hidden", "");
    }
    return blocked;
  }

  // ---- fullscreen with vendor fallbacks (mirrors room.js) ----
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
      const out = req.call(el);
      // iOS Safari's webkitRequestFullscreen on non-video elements throws
      // synchronously or returns undefined — normalise both.
      return out && typeof out.catch === "function" ? out : Promise.resolve(out);
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
      const out = exit.call(document);
      return out && typeof out.catch === "function" ? out : Promise.resolve(out);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function lockLandscape() {
    try {
      const orient = screen.orientation;
      if (orient && typeof orient.lock === "function") {
        return orient.lock("landscape").catch(() => {});
      }
      const legacy =
        screen.lockOrientation || screen.mozLockOrientation || screen.msLockOrientation;
      if (typeof legacy === "function") {
        try {
          return Promise.resolve(legacy.call(screen, "landscape")).catch(() => {});
        } catch {
          return Promise.resolve();
        }
      }
    } catch {
      /* orientation lock unsupported (e.g. iOS Safari) — rotate prompt covers it */
    }
    return Promise.resolve();
  }

  function unlockOrientation() {
    try {
      if (screen.orientation && typeof screen.orientation.unlock === "function") {
        screen.orientation.unlock();
      } else if (screen.unlockOrientation) {
        screen.unlockOrientation();
      }
    } catch {
      /* no-op */
    }
  }

  // Must run inside a user gesture (intro tap / overlay button) or the
  // browser rejects with NotAllowedError. Fire-and-forget: callers must NOT
  // await before dismissing the intro, or the gesture scope is lost.
  // Deduped: intro.js calls this synchronously AND `intro:complete` fires in
  // the same gesture, so a repeat within the window is a no-op.
  let lastEnterAt = 0;
  function enterImmersive() {
    const now = Date.now();
    if (now - lastEnterAt < 1000) return;
    lastEnterAt = now;
    if (!isFullscreen()) {
      requestFullscreen(document.documentElement)
        .then(() => lockLandscape())
        .catch(() => lockLandscape());
    } else {
      lockLandscape();
    }
  }

  function toggleFullscreen() {
    if (isFullscreen()) {
      lastEnterAt = 0;
      unlockOrientation();
      exitFullscreen().catch(() => {});
    } else {
      enterImmersive();
    }
  }

  function updateFsToggle() {
    if (!fsToggle) return;
    // Touch devices have no F key (room.js fullscreen shortcut), so offer
    // an on-screen button once the rotate gate is cleared.
    fsToggle.hidden = !isTouchDevice();
    fsToggle.setAttribute("aria-label", isFullscreen() ? "Exit fullscreen" : "Enter fullscreen");
  }

  // Overlay button: go immersive without dismissing the intro behind it.
  // stopPropagation keeps the window-level intro-dismiss listeners from
  // firing while portrait-blocked (intro.js also guards on needs-rotate).
  if (overlayBtn) {
    overlayBtn.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    overlayBtn.addEventListener("touchstart", (ev) => ev.stopPropagation(), {
      passive: true,
    });
    overlayBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      enterImmersive();
      updateRotateGate();
    });
  }

  if (overlay) {
    // Taps elsewhere on the overlay must not leak through to the intro.
    overlay.addEventListener("pointerdown", (ev) => {
      if (ev.target !== overlayBtn) ev.stopPropagation();
    });
    overlay.addEventListener(
      "touchstart",
      (ev) => {
        if (ev.target !== overlayBtn) ev.stopPropagation();
      },
      { passive: true },
    );
    overlay.addEventListener("click", (ev) => {
      if (ev.target !== overlayBtn) ev.stopPropagation();
    });
  }

  if (fsToggle) {
    fsToggle.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggleFullscreen();
    });
  }

  // Swipe navigation for touch devices: swiping the room view clicks the
  // matching arrow button, reusing room.js navigation (incl. zoom stepping).
  // Ignores swipes starting on controls, toasts, or the video player so
  // taps/scrolls there keep working. Threshold separates taps from swipes.
  (function enableSwipe() {
    const roomView = document.getElementById("room-view");
    if (!roomView) return;
    const SWIPE_PX = 48;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    roomView.addEventListener(
      "touchstart",
      (ev) => {
        if (ev.touches.length !== 1) {
          tracking = false;
          return;
        }
        const t = ev.target;
        if (t && t.closest && t.closest("button, a, iframe, .art-toast, .fs-toggle")) {
          tracking = false;
          return;
        }
        startX = ev.touches[0].clientX;
        startY = ev.touches[0].clientY;
        tracking = true;
      },
      { passive: true },
    );
    roomView.addEventListener(
      "touchend",
      (ev) => {
        if (!tracking) return;
        tracking = false;
        const touch = ev.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (Math.max(ax, ay) < SWIPE_PX) return;
        // Swipe direction follows the content: swipe left to look right.
        const dir = ax > ay ? (dx < 0 ? "right" : "left") : dy < 0 ? "up" : "down";
        const btn = document.getElementById(`arrow-${dir}`);
        // Hidden arrows are no-ops in room.js state (e.g. down on a wall).
        if (btn && !btn.hidden) btn.click();
      },
      { passive: true },
    );
  })();

  // Belt-and-suspenders: if intro completes without the synchronous hook
  // (e.g. keyboard dismissal racing), transient activation usually still
  // covers fullscreen within a few seconds of the gesture.
  window.addEventListener("intro:complete", () => {
    enterImmersive();
  });

  window.addEventListener("resize", () => {
    updateRotateGate();
    updateFsToggle();
  });
  window.addEventListener("orientationchange", () => {
    // innerWidth/Height settle a frame after the event on some browsers.
    requestAnimationFrame(updateRotateGate);
    window.setTimeout(updateRotateGate, 120);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateRotateGate);
  }
  if (coarse && typeof coarse.addEventListener === "function") {
    coarse.addEventListener("change", () => {
      updateRotateGate();
      updateFsToggle();
    });
  }
  document.addEventListener("fullscreenchange", updateFsToggle);
  document.addEventListener("webkitfullscreenchange", updateFsToggle);

  updateRotateGate();
  updateFsToggle();

  window.Mobile = {
    enterImmersive,
    toggleFullscreen,
    isFullscreen,
    isPortrait,
    isTouchDevice,
    needsRotate,
    updateRotateGate,
  };
})();
