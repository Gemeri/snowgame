(() => {
  // Emscripten's frame blit reads these two states back from the driver every
  // frame. Observe their changes instead; normal WebGL queries stay untouched.
  if (globalThis.SNOWGAME_WEBGL_STATE) return;
  const Type = globalThis.WebGL2RenderingContext;
  if (!Type) return;
  const proto = Type.prototype;
  const nativeGet = proto.getParameter;
  if (new URLSearchParams(location.search).get('glstatecache') === '0') {
    globalThis.SNOWGAME_WEBGL_STATE = {enabled: false, read: (gl, key) => gl.getParameter(key)};
    return;
  }
  const states = new WeakMap();
  function state(gl) {
    let value = states.get(gl);
    if (!value) {
      value = {scissor: nativeGet.call(gl, 0x0c11), draw: nativeGet.call(gl, 0x8ca6), lost: false, framebuffers: new WeakSet()};
      if (value.draw) value.framebuffers.add(value.draw);
      states.set(gl, value);
      gl.canvas.addEventListener('webglcontextlost', () => { value.lost = true; });
      gl.canvas.addEventListener('webglcontextrestored', () => {
        value.scissor = false; value.draw = null; value.lost = false;
        value.framebuffers = new WeakSet();
      });
    }
    return value;
  }
  for (const name of ['enable', 'disable']) {
    const native = proto[name];
    proto[name] = function(cap) {
      const result = native.call(this, cap);
      if (Number(cap) === 0x0c11) state(this).scissor = name === 'enable';
      return result;
    };
  }
  const create = proto.createFramebuffer;
  proto.createFramebuffer = function() {
    const framebuffer = create.call(this);
    if (framebuffer) state(this).framebuffers.add(framebuffer);
    return framebuffer;
  };
  const bind = proto.bindFramebuffer;
  proto.bindFramebuffer = function(target, framebuffer) {
    const result = bind.call(this, target, framebuffer);
    const key = Number(target);
    if (key === 0x8d40 || key === 0x8ca9) {
      const current = state(this);
      // Invalid/deleted/foreign handles must not change the shadow state.
      if (framebuffer == null || current.framebuffers.has(framebuffer)) current.draw = framebuffer ?? null;
    }
    return result;
  };
  const remove = proto.deleteFramebuffer;
  proto.deleteFramebuffer = function(framebuffer) {
    const result = remove.call(this, framebuffer);
    const current = states.get(this);
    if (current && current.framebuffers.delete(framebuffer) && current.draw === framebuffer) current.draw = null;
    return result;
  };
  globalThis.SNOWGAME_WEBGL_STATE = {
    enabled: true,
    read(gl, key) {
      if (gl instanceof Type && (key === 0x0c11 || key === 0x8ca6)) {
        const current = state(gl);
        if (!current.lost) return key === 0x0c11 ? current.scissor : current.draw;
      }
      return gl.getParameter(key);
    }
  };
})();
