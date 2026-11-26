(() => {
  // Under sustained keyboard input Chromium can keep rendering while delaying
  // WebSocket callbacks for seconds. Queue the multiplayer frame as ordinary
  // visible work so incoming state can run between frames.
  if (!globalThis.scheduler || typeof globalThis.scheduler.postTask !== 'function') return;

  const nativeRequest = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const pending = new Map();
  let nextId = 0;

  window.requestAnimationFrame = callback => {
    const id = ++nextId;
    const entry = { handle: 0, cancelled: false };
    pending.set(id, entry);
    entry.handle = nativeRequest(timestamp => {
      const run = () => {
        pending.delete(id);
        if (!entry.cancelled) callback(timestamp);
      };
      if (window.SNOWGAME_NETWORK_FRAME_SCHEDULING) {
        globalThis.scheduler.postTask(run, { priority: 'user-visible' }).catch(error => {
          // Preserve error reporting rather than silently swallowing a frame error.
          setTimeout(() => { throw error; }, 0);
        });
      } else {
        run();
      }
    });
    return id;
  };

  window.cancelAnimationFrame = id => {
    const entry = pending.get(id);
    if (!entry) return;
    entry.cancelled = true;
    nativeCancel(entry.handle);
    pending.delete(id);
  };
})();
