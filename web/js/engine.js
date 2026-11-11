/* ASCIIWall — engine.
 *
 *   ┌──────────┐   ┌──────────────┐   ┌───────────────────────────────┐
 *   │ ripple + │──▶│ scene shader │──▶│ ASCII composite (full res)    │
 *   │ trail sim│   │ 1 texel/cell │   │ glyph/tile/flow + bloom + fx  │
 *   └──────────┘   └──────────────┘   └───────────────────────────────┘
 *
 * Scenes register themselves with AsciiWall.registerScene({...}).
 */
(function () {
  const AW = (window.AsciiWall = window.AsciiWall || {});
  AW.scenes = AW.scenes || [];
  AW.registerScene = (def) => {
    const i = AW.scenes.findIndex((s) => s.id === def.id);
    if (i >= 0) AW.scenes[i] = def; else AW.scenes.push(def);
  };
  AW.getScene = (id) => AW.scenes.find((s) => s.id === id) || AW.scenes[0];

  AW.TINTS = {
    none: null,
    amber: [1.0, 0.62, 0.22],
    phosphor: [0.45, 1.0, 0.55],
    ice: [0.55, 0.8, 1.0],
    sepia: [1.0, 0.82, 0.6],
    rose: [1.0, 0.6, 0.72],
  };

  AW.DEFAULT_SETTINGS = {
    density: 1,        // >1 = smaller cells (more glyphs)
    glow: 1,
    grain: 1,
    speed: 1,
    fps: 60,
    interactive: true,
    ramp: "auto",
    tint: "none",
    edges: 1,          // directional edge glyphs
    fill: 1,           // soft colour underlay behind the glyphs
    maxDpr: 2,
  };

  // ───────────────────────────── shaders ─────────────────────────────
  const VERT = `#version 300 es
  out vec2 vUv;
  void main(){
    vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2));
    vUv = p;
    gl_Position = vec4(p*2.0-1.0, 0.0, 1.0);
  }`;

  const SIM = `#version 300 es
  precision highp float;
  uniform sampler2D uPrev;
  uniform vec2 uGrid;
  uniform float uAspect, uDamp, uTrailDecay;
  uniform vec4 uMouse;   // xy uv, z strength, w radius
  uniform vec4 uDrop;    // xy uv, z strength, w radius
  out vec4 o;
  void main(){
    ivec2 c = ivec2(gl_FragCoord.xy);
    ivec2 m = ivec2(uGrid) - 1;
    vec4 s = texelFetch(uPrev, c, 0);
    float l = texelFetch(uPrev, clamp(c+ivec2(-1,0), ivec2(0), m), 0).x;
    float r = texelFetch(uPrev, clamp(c+ivec2( 1,0), ivec2(0), m), 0).x;
    float u = texelFetch(uPrev, clamp(c+ivec2(0, 1), ivec2(0), m), 0).x;
    float d = texelFetch(uPrev, clamp(c+ivec2(0,-1), ivec2(0), m), 0).x;
    float h = ((l+r+u+d)*0.5 - s.y) * uDamp;
    vec2 uv = (vec2(c)+0.5)/uGrid;
    vec2 dm = (uv-uMouse.xy)*vec2(uAspect,1.0);
    float g = exp(-dot(dm,dm)/(uMouse.w*uMouse.w));
    h += g*uMouse.z*0.12;
    vec2 dd = (uv-uDrop.xy)*vec2(uAspect,1.0);
    h += exp(-dot(dd,dd)/(uDrop.w*uDrop.w))*uDrop.z;
    float trail = max(s.z*uTrailDecay, g*clamp(uMouse.z*1.2, 0.0, 1.0));
    o = vec4(clamp(h,-4.0,4.0), s.x, trail, 0.0);
  }`;

  const PRELUDE = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform float uTime;
  uniform vec2  uGrid;
  uniform float uAspect;
  uniform vec2  uMouse;      // uv space
  uniform vec2  uMouseP;     // centered p space
  uniform float uMouseOn;    // 0..1 presence (smoothed)
  uniform float uActivity;   // 0..1 cursor speed (smoothed)
  uniform sampler2D uSim;
  uniform sampler2D uTex;
  uniform vec2  uTexSize;
  uniform vec4  uData[64];
  uniform vec2  uOrbit;      // drag-to-rotate angles (yaw, pitch), with inertia
  uniform float uMouseDown;
  #define REF 64.0
  #define PI 3.14159265359
  #define TAU 6.28318530718
  float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
  float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
  vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash21(i), hash21(i+vec2(1,0)), u.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
  }
  float noise1(float x){ float i=floor(x), f=fract(x); return mix(hash11(i), hash11(i+1.0), f*f*(3.0-2.0*f)); }
  float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec2(17.1,9.2); a*=0.5; } return s; }
  float fbm3(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<3;i++){ s+=a*noise(p); p=p*2.03+vec2(17.1,9.2); a*=0.5; } return s; }
  mat2  rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
  float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
  float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h); }
  float sdBox(vec2 p, vec2 b){ vec2 d=abs(p)-b; return length(max(d,0.0))+min(max(d.x,d.y),0.0); }
  vec2  toUv(vec2 p){ return p/vec2(uAspect,1.0)+0.5; }
  // 3D helpers
  float hash31(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
  float noise3(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x), mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x), mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm3d(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise3(p); p=p*2.02+vec3(5.1,1.7,9.3); a*=0.5; } return s; }
  float smin(float a, float b, float k){ float h = clamp(0.5+0.5*(b-a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0-h); }
  mat3  rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0,-s, 0,1,0, s,0,c); }
  mat3  rotX(float a){ float c=cos(a), s=sin(a); return mat3(1,0,0, 0,c,s, 0,-s,c); }
  mat3  rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0, -s,c,0, 0,0,1); }
  float ripple(vec2 uv){ return texture(uSim, uv).x; }
  vec2  rippleGrad(vec2 uv){ vec2 e = 1.0/uGrid; return vec2(texture(uSim,uv+vec2(e.x,0)).x-texture(uSim,uv-vec2(e.x,0)).x, texture(uSim,uv+vec2(0,e.y)).x-texture(uSim,uv-vec2(0,e.y)).x); }
  float trail(vec2 uv){ return texture(uSim, uv).z; }
  // glyph density from colour (for glyph/tile styles)
  vec4  shade(vec3 c){ return vec4(c, clamp(pow(luma(c),0.8)*1.35, 0.0, 1.0)); }
  vec4  shade(vec3 c, float d){ return vec4(c, clamp(d,0.0,1.0)); }
  vec4 scene(vec2 uv, vec2 p);
  void main(){
    vec2 p = (vUv-0.5)*vec2(uAspect,1.0);
    fragColor = scene(vUv, p);
  }
  `;

  const COMPOSITE = `#version 300 es
  precision highp float;
  uniform sampler2D uScene, uAtlas;
  uniform vec2 uRes, uCell, uGrid, uAtlasCell;
  uniform float uRampLen, uAtlasCount, uTime, uGlow, uGrain, uVignette, uShimmer, uTileThr, uFade;
  uniform float uSceneLod, uEdges, uUnderlay, uRaw;
  uniform int uStyle, uTint;
  uniform vec3 uBg, uTintCol;
  out vec4 o;
  float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
  // atlas is rendered at exactly one texel per screen pixel of a cell -> crisp glyphs
  float glyph(float idx, vec2 l){
    vec2 px = clamp(floor(l*uCell) + 0.5, vec2(0.5), uAtlasCell - 0.5);
    return texelFetch(uAtlas, ivec2(int(idx*uAtlasCell.x + px.x), int(px.y)), 0).r;
  }
  float maxc(vec3 c){ return max(c.r, max(c.g, c.b)); }
  float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h); }
  vec4 cellAt(vec2 cell){ return textureLod(uScene, (cell + 0.5)/uGrid, uSceneLod); }
  float lumAt(vec2 cell){ return dot(cellAt(cell).rgb, vec3(0.299,0.587,0.114)); }
  void main(){
    vec2 fc = gl_FragCoord.xy;
    vec2 cf = fc/uCell;
    vec2 cell = floor(cf);
    vec2 l = fract(cf);
    vec4 s = cellAt(cell);
    vec3 c = max(s.rgb, 0.0);
    float m = maxc(c);
    vec3 hue = c/max(m, 1e-3);
    float h = hash(cell);
    float tick = floor(uTime*(0.35+h*0.9) + h*17.0);
    float jit = (hash(cell + tick*1.37) - 0.5)*uShimmer;
    vec3 col = uBg;

    // edge detection (Sobel on cell luminance) -> directional glyphs / | \ -
    float edgeK = 0.0; float edgeIdx = 0.0;
    if (uEdges > 0.0 && (uStyle == 0 || uStyle == 1)) {
      float tl = lumAt(cell+vec2(-1, 1)), t = lumAt(cell+vec2(0, 1)), tr = lumAt(cell+vec2(1, 1));
      float ml = lumAt(cell+vec2(-1, 0)),                          mr = lumAt(cell+vec2(1, 0));
      float bl = lumAt(cell+vec2(-1,-1)), b = lumAt(cell+vec2(0,-1)), br = lumAt(cell+vec2(1,-1));
      vec2 g = vec2((tr + 2.0*mr + br) - (tl + 2.0*ml + bl), (tl + 2.0*t + tr) - (bl + 2.0*b + br));
      g /= uCell;                          // to pixel space (cells are not square)
      g *= min(uCell.x, uCell.y);
      float mag = length(g);
      edgeK = smoothstep(0.32, 0.5, mag*uEdges) * step(0.06, m);
      float a = mod(atan(g.y, g.x) + 1.5707963, 3.14159265);      // line direction
      edgeIdx = uRampLen + mod(floor(a/0.785398 + 0.5), 4.0);
    }

    if (uStyle == 0) {                      // ── glyph
      float d = clamp(s.a + jit*smoothstep(0.02,0.15,s.a), 0.0, 0.999);
      float ink = glyph(edgeK > 0.5 ? edgeIdx : floor(d*uRampLen), l);
      vec3 gc = hue*(0.22 + 0.95*pow(m, 0.7))*smoothstep(0.0, 0.05, m);
      col += ink*gc*(1.0 + edgeK*0.25);
    } else if (uStyle == 1) {               // ── tile
      float d = clamp(s.a + jit*0.5, 0.0, 0.999);
      float ink = glyph(edgeK > 0.5 && s.a < uTileThr ? edgeIdx : floor(d*uRampLen), l);
      vec2 q = abs(l*uCell - uCell*0.5) - (uCell*0.5 - 1.0);
      float box = 1.0 - smoothstep(-0.5, 0.5, max(q.x, q.y));
      float tile = smoothstep(uTileThr-0.03, uTileThr+0.03, s.a);
      vec3 onTile = c*0.95*(1.0 - ink*0.45);
      vec3 offTile = uBg + ink*c*1.15;
      col = mix(offTile, mix(uBg*0.6 + c*0.22, onTile, box), tile);
    } else if (uStyle == 2) {               // ── flow
      float ang = s.a*3.14159265;
      float d = clamp(dot(c, vec3(0.3,0.5,0.2))*1.2 + jit*0.25, 0.0, 1.0);
      vec2 px = (l-0.5)*uCell;
      float dotT = smoothstep(0.5, 0.56, d + (h-0.5)*0.08);
      vec2 dir = vec2(cos(ang), sin(ang));
      float len = uCell.x*(0.2 + 0.28*d);
      float th = 0.4 + d*0.9;
      float dash = 1.0 - smoothstep(-0.6, 0.6, sdSeg(px, -dir*len, dir*len) - th);
      float r = mix(0.7, min(uCell.x,uCell.y)*0.38, smoothstep(0.5, 1.0, d));
      float dt = 1.0 - smoothstep(r-0.6, r+0.6, length(px));
      float ink = mix(dash*smoothstep(0.03, 0.12, d), dt, dotT);
      vec3 gc = mix(hue*(0.3 + 0.85*m), mix(hue, vec3(1.0), 0.78)*(0.65 + 0.45*m), dotT);
      col += ink*gc;
    } else {                                // ── halftone (square dots sized by brightness)
      float lu = clamp(s.a + jit*0.3, 0.0, 1.0);
      float side = sqrt(lu)*min(uCell.x, uCell.y)*0.98;
      vec2 q = abs((l - 0.5)*uCell) - side*0.5;
      float ink = 1.0 - smoothstep(-0.4, 0.4, max(q.x, q.y));
      col += ink*hue*(0.35 + 0.75*m);
    }

    vec2 guv = fc/(uGrid*uCell);
    // soft colour underlay: the hidden scene glowing faintly behind the glyphs
    col += textureLod(uScene, (cell + 0.5)/uGrid, uSceneLod).rgb*uUnderlay*0.35;
    // bloom from the scene's mip chain
    vec3 g1 = textureLod(uScene, guv, uSceneLod + 2.0).rgb;
    vec3 g2 = textureLod(uScene, guv, uSceneLod + 4.0).rgb;
    vec3 gg = g1*0.4 + g2*0.6;
    col += (gg*gg*1.1 + gg*0.06)*uGlow;

    if (uTint > 0) {
      float lu = dot(col, vec3(0.299,0.587,0.114));
      col = mix(col, uTintCol*lu*1.7, 0.92);
    }
    vec2 v = fc/uRes - 0.5;
    col *= 1.0 - uVignette*dot(v, v)*1.6;
    col += (hash(fc + fract(uTime*7.13)*97.0) - 0.5)*0.03*uGrain;
    if (uRaw > 0.5) col = textureLod(uScene, guv, 0.0).rgb;
    col *= uFade;
    o = vec4(max(col, 0.0), 1.0);
  }`;

  // ───────────────────────────── helpers ─────────────────────────────
  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const numbered = src.split("\n").map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join("\n");
      console.error(log + "\n" + numbered);
      gl.deleteShader(sh);
      throw new Error("Shader compile failed: " + log);
    }
    return sh;
  }
  function program(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, "");
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  function tex(gl, w, h, internal, format, type, filter, mips) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function fbo(gl, t) {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return f;
  }
  const hexToRgb = (h) => {
    if (Array.isArray(h)) return h;
    const n = parseInt(h.replace("#", ""), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  AW.hexToRgb = hexToRgb;

  // ───────────────────────────── engine ─────────────────────────────
  class Engine {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.opts = opts;
      const gl = canvas.getContext("webgl2", {
        antialias: false, alpha: false, depth: false, stencil: false,
        preserveDrawingBuffer: !!opts.preserve, powerPreference: "low-power",
      });
      if (!gl) throw new Error("WebGL2 is not available on this device.");
      this.gl = gl;
      this.simOK = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
      gl.getExtension("OES_texture_half_float_linear");
      this.vao = gl.createVertexArray();
      this.settings = Object.assign({}, AW.DEFAULT_SETTINGS, opts.settings || {});
      this.programs = new Map();
      this.simProg = program(gl, SIM);
      this.compProg = program(gl, COMPOSITE);
      this.data = new Float32Array(256);
      this.time = 0;
      this.fade = 1;
      this.fadeDir = 0;
      this.running = false;
      this.listeners = {};
      this.input = { x: 0.5, y: 0.5, vx: 0, vy: 0, speed: 0, on: 0, present: false, down: false, activity: 0, clicks: [], lastMove: 0 };
      this.userTex = tex(gl, 1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, false);
      this.userTexSize = [1, 1];
      this.dropQueue = [];
      this.orbit = { x: 0, y: 0, vx: 0, vy: 0 };
      this._simAcc = 0;
      this._frame = this._frame.bind(this);
      this.w = this.h = 0;
      if (opts.size) this.resize(opts.size[0], opts.size[1]);
      else {
        this._ro = new ResizeObserver(() => this.resize());
        this._ro.observe(canvas);
        this.resize();
      }
      if (opts.interactive !== false) this._bindInput(opts.inputTarget || canvas);
      this.setScene(opts.scene || (AW.scenes[0] && AW.scenes[0].id), { instant: true });
    }

    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, a) { (this.listeners[ev] || []).forEach((f) => f(a)); }

    get dpr() { return Math.min(window.devicePixelRatio || 1, this.settings.maxDpr || 2); }

    resize(w, h) {
      if (w == null) {
        const r = this.canvas.getBoundingClientRect();
        w = Math.max(1, Math.round(r.width * this.dpr));
        h = Math.max(1, Math.round(r.height * this.dpr));
      }
      if (w === this.w && h === this.h) return;
      this.w = this.canvas.width = w;
      this.h = this.canvas.height = h;
      this._layout();
    }

    _layout() {
      const sc = this.scene;
      if (!sc || !this.w) return;
      const gl = this.gl;
      const dpr = this.opts.size ? (this.opts.cellScale || 1) : this.dpr;
      const cw = Math.max(3, Math.round(((sc.cell || 10) * dpr) / (this.settings.density || 1)));
      const ch = Math.max(4, Math.round(cw * (sc.aspect || 1.6)));
      this.cell = [cw, ch];
      const cols = Math.ceil(this.w / cw), rows = Math.ceil(this.h / ch);
      if (cols === this.cols && rows === this.rows && this.sceneTex && (sc.ss || 1) === this.ss) return;
      this.cols = cols; this.rows = rows;
      this.aspect = (cols * cw) / (rows * ch);
      // free old
      [this.sceneTex, ...(this.simTex || [])].forEach((t) => t && gl.deleteTexture(t));
      [this.sceneFbo, ...(this.simFbo || [])].forEach((f) => f && gl.deleteFramebuffer(f));
      this.ss = Math.max(1, Math.min(4, sc.ss || 1));
      this.sceneTex = tex(gl, cols * this.ss, rows * this.ss, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, true);
      this.sceneFbo = fbo(gl, this.sceneTex);
      if (this.simOK) {
        this.simTex = [0, 1].map(() => tex(gl, cols, rows, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, false));
        this.simFbo = this.simTex.map((t) => fbo(gl, t));
        this.simTex.forEach((t, i) => {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.simFbo[i]);
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        });
      } else {
        this.simTex = [tex(gl, 1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, false)];
        this.simFbo = [];
      }
      this.simIdx = 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (this.atlas && (this.atlas.gw !== cw || this.atlas.gh !== ch)) this._buildAtlas();
      if (this.state && this.scene.resize) this.scene.resize(this.state, this.api());
    }

    _buildAtlas() {
      const gl = this.gl;
      const sc = this.scene;
      let ramp = this.settings.ramp && this.settings.ramp !== "auto" ? this.settings.ramp : sc.ramp || "soft";
      ramp = AW.RAMPS[ramp] || ramp;
      const rampLen = Array.from(ramp).length;
      const [cw, ch] = this.cell || [8, 13];
      // ramp + 4 directional edge glyphs, drawn at exactly the cell's pixel size
      const a = AW.buildAtlas(ramp + "-/|\\", { cellW: cw, cellH: ch, weight: sc.weight || (cw < 8 ? 700 : 600) });
      a.rampLen = rampLen;
      if (!this.atlasTex) this.atlasTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, a.canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.atlas = a;
    }

    _sceneProgram(sc) {
      if (!this.programs.has(sc.id)) {
        let p;
        try { p = program(this.gl, PRELUDE + sc.frag); }
        catch (e) {
          console.error(`[asciiwall] scene "${sc.id}" failed to compile`, e);
          p = program(this.gl, PRELUDE + `vec4 scene(vec2 uv, vec2 p){ return shade(vec3(0.6,0.1,0.3)*(0.5+0.5*sin(uTime+p.x*8.0))); }`);
          p.failed = String(e && e.message || e);
        }
        this.programs.set(sc.id, p);
      }
      return this.programs.get(sc.id);
    }

    setScene(id, { instant = false } = {}) {
      const sc = AW.getScene(id);
      if (!sc) return;
      if (!instant && this.scene) { this._pending = sc.id; this.fadeDir = -1; return; }
      this.scene = sc;
      this.data.fill(0);
      this._sceneProgram(sc);
      this.cols = 0; // force relayout (cell size may differ)
      this._layout();
      this._buildAtlas();
      this.orbit = { x: sc.orbit ? sc.orbit[0] : 0, y: sc.orbit ? sc.orbit[1] : 0, vx: 0, vy: 0 };
      this.state = sc.init ? sc.init(this.api()) : {};
      this.emit("scene", sc);
    }

    updateSettings(partial) {
      const prev = this.settings;
      this.settings = Object.assign({}, prev, partial);
      if (partial.maxDpr !== undefined && !this.opts.size) { this.w = 0; this.resize(); }
      if (partial.density !== undefined && partial.density !== prev.density) { this.cols = 0; this._layout(); }
      if (partial.ramp !== undefined && partial.ramp !== prev.ramp) this._buildAtlas();
    }

    setTexture(src) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.userTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !(src && src.data));
      if (src && src.data) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, src.width, src.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
        this.userTexSize = [src.width, src.height];
      } else if (src) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
        this.userTexSize = [src.naturalWidth || src.videoWidth || src.width, src.naturalHeight || src.videoHeight || src.height];
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      const filt = src && src.nearest ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    }

    /** Scene-facing API object. */
    api() {
      const inp = this.input;
      const A = this.aspect || 1.6;
      const on = this.settings.interactive ? inp.on : 0;
      return {
        time: this.time, aspect: A, cols: this.cols, rows: this.rows, data: this.data,
        engine: this, settings: this.settings,
        mouse: {
          x: inp.x, y: inp.y, px: (inp.x - 0.5) * A, py: inp.y - 0.5,
          vx: inp.vx * A, vy: inp.vy, speed: inp.speed, present: on > 0.01, on, down: inp.down,
        },
        clicks: this.settings.interactive ? inp.clicks.map((c) => ({ x: c.x, y: c.y, px: (c.x - 0.5) * A, py: c.y - 0.5 })) : [],
        setTexture: (s) => this.setTexture(s),
        orbit: this.orbit,
      };
    }

    // ───────── input ─────────
    _bindInput(target) {
      const rel = (e) => {
        const r = this.canvas.getBoundingClientRect();
        return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
      };
      this._onMove = (e) => { const [x, y] = rel(e); this.pointer(x, y, true); };
      this._onDown = (e) => {
        const [x, y] = rel(e);
        this.pointer(x, y, true);
        this.input.down = true;
        this._downAt = [x, y, performance.now()];
        if (!this.scene.dragToOrbit) this.click(x, y);
      };
      this._onUp = (e) => {
        const d = this._downAt;
        if (this.input.down && d && this.scene.dragToOrbit) {
          const [x, y] = rel(e);
          // a tap (not a drag) on an orbit scene still counts as a click
          if (Math.hypot(x - d[0], y - d[1]) < 0.012 && performance.now() - d[2] < 450) this.click(x, y);
        }
        this.input.down = false;
      };
      this._onLeave = () => { this.input.present = false; };
      target.addEventListener("pointermove", this._onMove, { passive: true });
      target.addEventListener("pointerdown", this._onDown, { passive: true });
      window.addEventListener("pointerup", this._onUp, { passive: true });
      target.addEventListener("pointerleave", this._onLeave, { passive: true });
      this._inputTarget = target;
    }
    /** Feed a pointer position in normalised canvas coords (0..1, y up). */
    pointer(x, y, present = true) {
      const inp = this.input;
      const now = performance.now();
      if (inp.down && inp.present && this.settings.interactive) {
        // drag rotates 3D scenes (velocity, so it keeps spinning a little after release)
        this.orbit.vx = this.orbit.vx * 0.5 + ((x - inp.x) * 7) / Math.max(0.008, (now - (inp.lastMove || now)) / 1000) * 0.5;
        this.orbit.vy = this.orbit.vy * 0.5 + ((y - inp.y) * 4) / Math.max(0.008, (now - (inp.lastMove || now)) / 1000) * 0.5;
        this.orbit.x += (x - inp.x) * 7;
        this.orbit.y = Math.max(-1.3, Math.min(1.3, this.orbit.y + (y - inp.y) * 4));
      }
      const dt = Math.max(1, now - (inp.lastMove || now - 16)) / 1000;
      if (inp.present) {
        const vx = (x - inp.x) / dt, vy = (y - inp.y) / dt;
        inp.vx = inp.vx * 0.6 + vx * 0.4;
        inp.vy = inp.vy * 0.6 + vy * 0.4;
      }
      inp.x = x; inp.y = y; inp.present = present; inp.lastMove = now;
    }
    click(x, y) {
      this.input.clicks.push({ x, y });
      this.dropQueue.push({ x, y });
    }

    // ───────── loop ─────────
    start() { if (!this.running) { this.running = true; this._last = performance.now(); requestAnimationFrame(this._frame); } }
    stop() { this.running = false; }
    _frame(now) {
      if (!this.running) return;
      requestAnimationFrame(this._frame);
      const minDt = 1000 / (this.settings.fps || 60) - 1.5;
      if (now - this._last < minDt) return;
      const dt = Math.min((now - this._last) / 1000, 0.1);
      this._last = now;
      this.step(dt);
      this.render();
    }

    step(dt) {
      const inp = this.input, s = this.settings;
      // decay velocity if the pointer hasn't moved recently
      if (performance.now() - inp.lastMove > 80) { inp.vx *= 0.8; inp.vy *= 0.8; }
      const sp = Math.hypot(inp.vx * (this.aspect || 1), inp.vy);
      inp.speed = sp;
      inp.activity += (Math.min(sp, 1) - inp.activity) * Math.min(1, dt * 4);
      inp.on += ((inp.present ? 1 : 0) - inp.on) * Math.min(1, dt * 3);
      this.time += dt * s.speed;
      // orbit inertia (+ optional slow auto-spin when idle)
      const ob = this.orbit;
      if (!inp.down) {
        ob.x += ob.vx * dt; ob.y = Math.max(-1.3, Math.min(1.3, ob.y + ob.vy * dt));
        ob.vx *= Math.exp(-dt * 2.5); ob.vy *= Math.exp(-dt * 2.5);
        if (this.scene.autoOrbit) ob.x += this.scene.autoOrbit * dt * s.speed;
      } else { ob.vx *= 0.9; ob.vy *= 0.9; }
      // fade transitions
      if (this.fadeDir) {
        this.fade += this.fadeDir * dt * 3.2;
        if (this.fade <= 0) { this.fade = 0; this.setScene(this._pending, { instant: true }); this.fadeDir = 1; }
        if (this.fade >= 1) { this.fade = 1; this.fadeDir = 0; }
      }
      const api = this.api();
      api.dt = dt * s.speed;
      if (this.scene.update) this.scene.update(this.state, api);
      inp.clicks.length = 0;
      // fixed-rate sim
      this._simAcc = Math.min(this._simAcc + dt, 4 / 60);
      while (this._simAcc >= 1 / 60) { this._simAcc -= 1 / 60; this._simStep(); }
    }

    _simStep() {
      if (!this.simOK) return;
      const gl = this.gl, P = this.simProg, sc = this.scene, inp = this.input;
      const rp = Object.assign({ damp: 0.985, strength: 1, radius: 0.025 }, sc.ripple || {});
      const src = this.simIdx, dst = 1 - src;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.simFbo[dst]);
      gl.viewport(0, 0, this.cols, this.rows);
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.simTex[src]);
      gl.uniform1i(P.u.uPrev, 0);
      gl.uniform2f(P.u.uGrid, this.cols, this.rows);
      gl.uniform1f(P.u.uAspect, this.aspect);
      gl.uniform1f(P.u.uDamp, rp.damp);
      gl.uniform1f(P.u.uTrailDecay, sc.trailDecay || 0.985);
      const on = this.settings.interactive && inp.present ? 1 : 0;
      gl.uniform4f(P.u.uMouse, inp.x, inp.y, on * Math.min(inp.speed * 1.5, 2) * rp.strength, rp.radius);
      const d = this.settings.interactive ? this.dropQueue.shift() : null;
      if (!this.settings.interactive) this.dropQueue.length = 0;
      gl.uniform4f(P.u.uDrop, d ? d.x : -9, d ? d.y : -9, d ? (rp.drop || 1.6) * rp.strength : 0, rp.radius * 1.3);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.simIdx = dst;
    }

    render(target = null) {
      const gl = this.gl, sc = this.scene, s = this.settings;
      gl.bindVertexArray(this.vao);
      // scene pass
      const P = this._sceneProgram(sc);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
      gl.viewport(0, 0, this.cols * this.ss, this.rows * this.ss);
      gl.useProgram(P.p);
      const u = P.u, inp = this.input;
      gl.uniform1f(u.uTime, this.time);
      gl.uniform2f(u.uGrid, this.cols * this.ss, this.rows * this.ss);
      gl.uniform2f(u.uOrbit, this.orbit.x, this.orbit.y);
      gl.uniform1f(u.uMouseDown, s.interactive && inp.down ? 1 : 0);
      gl.uniform1f(u.uAspect, this.aspect);
      gl.uniform2f(u.uMouse, inp.x, inp.y);
      gl.uniform2f(u.uMouseP, (inp.x - 0.5) * this.aspect, inp.y - 0.5);
      gl.uniform1f(u.uMouseOn, s.interactive ? inp.on : 0);
      gl.uniform1f(u.uActivity, s.interactive ? inp.activity : 0);
      if (u.uData) gl.uniform4fv(u.uData, this.data);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.simTex[this.simIdx] || this.simTex[0]);
      gl.uniform1i(u.uSim, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.userTex);
      gl.uniform1i(u.uTex, 1);
      gl.uniform2f(u.uTexSize, this.userTexSize[0], this.userTexSize[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.generateMipmap(gl.TEXTURE_2D);

      // composite pass
      const C = this.compProg;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, this.w, this.h);
      gl.useProgram(C.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(C.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.uniform1i(C.u.uAtlas, 1);
      gl.uniform2f(C.u.uRes, this.w, this.h);
      gl.uniform2f(C.u.uCell, this.cell[0], this.cell[1]);
      gl.uniform2f(C.u.uGrid, this.cols, this.rows);
      gl.uniform1f(C.u.uRampLen, this.atlas.rampLen);
      gl.uniform1f(C.u.uAtlasCount, this.atlas.count);
      gl.uniform2f(C.u.uAtlasCell, this.atlas.gw, this.atlas.gh);
      gl.uniform1f(C.u.uSceneLod, Math.log2(this.ss));
      const edgeDefault = sc.edges ?? (sc.style === "glyph" ? 0.8 : 0);
      gl.uniform1f(C.u.uEdges, edgeDefault * (s.edges ?? 1));
      gl.uniform1f(C.u.uUnderlay, (sc.underlay ?? 0.35) * (s.fill ?? 1));
      gl.uniform1f(C.u.uRaw, s.raw ? 1 : 0);
      gl.uniform1f(C.u.uTime, this.time);
      gl.uniform1f(C.u.uGlow, (sc.glow ?? 1) * s.glow);
      gl.uniform1f(C.u.uGrain, (sc.grain ?? 1) * s.grain);
      gl.uniform1f(C.u.uVignette, sc.vignette ?? 1);
      gl.uniform1f(C.u.uShimmer, sc.shimmer ?? 0.08);
      gl.uniform1f(C.u.uTileThr, sc.tileThr ?? 0.4);
      gl.uniform1f(C.u.uFade, this.fade);
      gl.uniform1i(C.u.uStyle, ({ glyph: 0, tile: 1, flow: 2, halftone: 3 })[sc.style] || 0);
      const tint = AW.TINTS[s.tint];
      gl.uniform1i(C.u.uTint, tint ? 1 : 0);
      gl.uniform3fv(C.u.uTintCol, tint || [1, 1, 1]);
      gl.uniform3fv(C.u.uBg, hexToRgb(sc.bg || "#07080c"));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /** Advance `seconds` of simulated time quickly (used for thumbnails). */
    warmup(seconds, fps = 30) {
      const n = Math.round(seconds * fps);
      for (let i = 0; i < n; i++) this.step(1 / fps);
    }

    destroy() {
      this.stop();
      if (this._ro) this._ro.disconnect();
      const t = this._inputTarget;
      if (t) {
        t.removeEventListener("pointermove", this._onMove);
        t.removeEventListener("pointerdown", this._onDown);
        t.removeEventListener("pointerleave", this._onLeave);
        window.removeEventListener("pointerup", this._onUp);
      }
      const ext = this.gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    }
  }

  AW.Engine = Engine;
})();
