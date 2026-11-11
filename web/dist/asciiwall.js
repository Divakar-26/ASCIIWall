/*! ASCIIWall — live, interactive ASCII-art wallpapers. Single-file bundle (26 modules). */

/* ── glyphs.js ── */
/* ASCIIWall — glyph atlas builder.
 * Renders a ramp of characters (ordered sparse → dense) into a single-row
 * texture that the composite shader samples per cell. */
(function () {
  const AW = (window.AsciiWall = window.AsciiWall || {});

  // Ramps go from empty to full ink. The first char is always "nothing".
  AW.RAMPS = {
    soft:    " .·:-=+*%#@",
    classic: " .,:;-~=+*x%#&@",
    binary:  " .·:;10",
    tile:    " .-:;=+x()%&#@",
    dots:    " .·:•oO0@",
    blocks:  " ·░▒▓█",
    stars:   " .·+*✦",
    rain:    " .,'|:;!/\\",
    fire:    " .'`^:;+*%#@",
    dense:   " .'`^\",:;Il!i><~+_-?][}{1)(|tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    koi:     " .-:;=+koiKOI&#@",
    torii:   " .,:-=+*#%",
    sparkle: " .·:+*o•O@",
  };

  const FONT_STACK = '"JetBrains Mono","JetBrainsMono Nerd Font Mono","SF Mono",Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace';

  /** Build a canvas atlas: one row, `chars.length` cells of gw×gh px, white ink on black. */
  AW.buildAtlas = function (chars, opts = {}) {
    const list = Array.from(chars);
    const gw = opts.cellW || 48;
    const gh = opts.cellH || 64;
    const weight = opts.weight || 700;
    const c = document.createElement("canvas");
    c.width = gw * list.length;
    c.height = gh;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    // Size the font so the glyph fills the cell roughly like a terminal.
    const size = Math.max(5, Math.min(gh * 0.84, gw * 1.5));
    g.font = `${weight} ${size}px ${FONT_STACK}`;
    list.forEach((ch, i) => {
      if (ch === " ") return;
      if (ch === "█") { g.fillRect(i * gw, 0, gw, gh); return; }
      g.fillText(ch, i * gw + gw / 2, gh / 2 + size * 0.04);
    });
    return { canvas: c, count: list.length, gw, gh };
  };
})();


/* ── engine.js ── */
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


/* ── scenes/ring.js ── */
/* The Ring — a plain gold band turning slowly in darkness above embers. Bring your cursor close and it
 * warms: a line of flowing fiery script wakes on its surface. Drag to turn it; tap to stir the fire.
 * (The script is invented, not any real inscription.) */
(function () {
  window.AsciiWall.registerScene({
    id: "ring",
    name: "The Ring",
    blurb: "A plain gold ring turning in the dark above drifting embers. Bring your cursor near and it warms until a line of fiery script glows on its surface. Drag to turn it and tap to stir the fire.",
    tags: ["epic", "3d", "dark", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#050302",
    cell: 4.5,
    aspect: 1.8,
    glow: 1.2,
    underlay: 0.5,
    edges: 0.5,
    shimmer: 0.02,
    dragToOrbit: true,
    autoOrbit: 0.12,
    orbit: [0.0, 0.0],
    init() { return { heat: 0, stir: 99 }; },
    update(st, api) {
      const m = api.mouse, dt = api.dt;
      const d = Math.hypot(m.px, m.py);
      const target = m.present ? Math.max(0, 1 - d / 0.45) * m.on : 0;
      st.heat += (target - st.heat) * Math.min(1, dt * (target > st.heat ? 0.9 : 0.4));   // warms slowly, cools slower
      st.stir += dt;
      if (api.clicks.length) { st.stir = 0; st.heat = Math.min(1, st.heat + 0.35); }
      api.data[0] = st.heat; api.data[1] = st.stir;
    },
    frag: /* glsl */ `
    mat3 R;
    const float RR = 0.62, rr = 0.13;
    float ringSD(vec3 p){
      // a slightly flattened torus band: rounder outside, flatter inside, like a real ring
      vec2 q = vec2(length(p.xz) - RR, p.y);
      q.x = q.x < 0.0 ? q.x*1.5 : q.x;
      return (length(q*vec2(1.0, 0.82)) - rr)*0.8;
    }
    float map(vec3 p){ return ringSD(R*p); }
    vec3 nrm(vec3 p){
      const vec2 k = vec2(1.0, -1.0); const float e = 0.0012;
      return normalize(k.xyy*map(p + k.xyy*e) + k.yyx*map(p + k.yyx*e) + k.yxy*map(p + k.yxy*e) + k.xxx*map(p + k.xxx*e));
    }
    // invented flowing script: per-letter cells along the band, each a few curved strokes
    float script(float a, float v){
      float n = 40.0;
      float x = a/TAU*n;
      float ci = floor(x);
      vec2 q = vec2(fract(x) - 0.5, v);              // v in -1..1 across the band
      float h = hash11(ci);
      float ink = 0.0;
      for (int k=0; k<3; k++){
        float fk = float(k);
        float hk = hash11(ci*3.1 + fk*7.7);
        // a curved stroke: arc of a circle with random centre/radius, or a tall stem with a hook
        vec2 c = vec2((hk - 0.5)*0.5, (hash11(ci + fk*2.3) - 0.5)*0.9);
        float r = 0.18 + 0.25*hash11(ci*5.3 + fk);
        float ang = atan(q.y - c.y, q.x - c.x);
        float a0 = hash11(ci*1.9 + fk*4.4)*TAU, span = 1.5 + 2.5*hash11(ci*8.1 + fk);
        float inArc = step(0.0, fract((ang - a0)/TAU))*step(fract((ang - a0)/TAU)*TAU, span);
        float d = abs(length((q - c)*vec2(1.0, 0.75)) - r);
        ink = max(ink, smoothstep(0.07, 0.025, d)*inArc);
      }
      if (h > 0.5) ink = max(ink, smoothstep(0.06, 0.02, abs(q.x - (h - 0.75)*0.6))*step(abs(q.y), 0.75));   // stems
      if (h < 0.25) ink = max(ink, smoothstep(0.07, 0.02, length(q - vec2(0.0, 0.7))));                      // dots
      return ink*step(abs(v), 0.85);
    }
    vec3 env(vec3 d){
      // dark smoky room lit from below by the fire
      vec3 c = vec3(0.015,0.01,0.008);
      c += vec3(1.0,0.38,0.08)*pow(max(-d.y, 0.0), 2.0)*0.9;
      c += vec3(1.0,0.75,0.45)*pow(max(dot(d, normalize(vec3(-0.6, 0.6, -0.5))), 0.0), 24.0)*1.3;   // a warm key light
      c += vec3(0.25,0.3,0.4)*pow(max(dot(d, normalize(vec3(0.8, 0.3, 0.4))), 0.0), 8.0)*0.25;      // cold rim
      return c;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      float heat = uData[0].x, stir = uData[0].y;
      float st = stir < 3.0 ? exp(-stir*1.2) : 0.0;
      R = rotX(0.55 + uOrbit.y*0.7 + 0.08*sin(t*0.4))*rotZ(0.12*sin(t*0.3))*rotY(uOrbit.x);
      vec3 ro = vec3(0.0, 0.05, -2.6);
      vec3 rd = normalize(vec3(p, 1.7));

      // background: black with smoke, a glow of fire from below
      vec3 col = vec3(0.02,0.012,0.008);
      col += vec3(0.6,0.18,0.03)*smoothstep(0.1, -0.6, p.y)*(0.35 + 0.3*heat + 0.5*st);
      float smoke = fbm(vec2(p.x*2.5, p.y*2.0 - t*0.12) + fbm(p*3.0 + t*0.05));
      col += vec3(0.08,0.05,0.04)*smoothstep(0.45, 0.8, smoke);

      float tt = 1.5; bool hit = false;
      for (int i=0; i<90; i++){
        float d = map(ro + rd*tt);
        if (d < 0.0006) { hit = true; break; }
        tt += d;
        if (tt > 4.5) break;
      }
      if (hit) {
        vec3 pos = ro + rd*tt;
        vec3 n = nrm(pos);
        vec3 lp = R*pos;
        vec3 rf = reflect(rd, n);
        float fres = 0.6 + 0.4*pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
        vec3 gold = vec3(1.0,0.72,0.3);
        vec3 c = gold*env(rf)*2.6*fres;
        c += gold*0.06;
        // microscopic polish lines
        c *= 0.92 + 0.12*noise(vec2(atan(lp.z, lp.x)*300.0, lp.y*20.0));
        // the script lives on the outer face
        float a = atan(lp.z, lp.x);
        float outer = smoothstep(0.0, 0.02, length(lp.xz) - RR);
        float v = lp.y/(rr*0.8);
        float ink = script(a + t*0.0, v)*outer;
        float glow = smoothstep(0.15, 0.9, heat + st*0.5);
        float flick = 0.85 + 0.15*noise(vec2(a*6.0, t*4.0));
        vec3 fire = mix(vec3(1.0,0.25,0.02), vec3(1.0,0.85,0.4), ink*glow);
        c = mix(c, c*0.6 + fire*2.2*flick, ink*glow);
        c += vec3(1.0,0.35,0.05)*heat*0.15*outer;           // the whole band warms
        col = c;
      }
      // the warm halo of the script in the air around the ring
      float rad = length(p - vec2(0.0, 0.05));
      col += vec3(1.0,0.35,0.05)*heat*exp(-abs(rad - 0.36)*12.0)*0.12;

      // embers rising from below
      for (int i=0; i<40; i++){
        float fi = float(i);
        float sp = 0.08 + 0.12*hash11(fi*3.3);
        float ph = fract(t*sp + hash11(fi*7.1));
        vec2 ep = vec2((hash11(fi*1.7) - 0.5)*uAspect*0.9 + 0.05*sin(t*0.8 + fi), -0.55 + ph*1.15);
        ep.x += st*(hash11(fi*9.9) - 0.5)*0.4;
        float d = length((p - ep)*REF*1.4);
        float life = smoothstep(0.0, 0.1, ph)*(1.0 - ph);
        col += vec3(1.0,0.5,0.12)*exp(-d*d*1.4)*life*(0.8 + 0.8*st);
      }
      return shade(col, pow(clamp(luma(col)*1.4, 0.0, 1.0), 0.8)*(hit ? 1.0 : 0.45));
    }
    `,
  });
})();


/* ── scenes/beacons.js ── */
/* The Beacons — a chain of signal fires on a range of snowy peaks above a sea of cloud at dusk.
 * Tap to light the first beacon; the fire leaps from summit to summit into the distance.
 * The cursor pans the view a little. Lights again on its own every so often. */
(function () {
  const NB = 7;
  window.AsciiWall.registerScene({
    id: "beacons",
    name: "The Beacons",
    blurb: "Snowy peaks above a sea of moonlit cloud at dusk, with a pale citadel below. Tap and the beacons light one after another, peak to peak into the distance.",
    tags: ["epic", "3d", "mountains", "interactive"],
    style: "glyph",
    ramp: "soft",
    bg: "#04050a",
    cell: 5,
    aspect: 1.8,
    glow: 1.1,
    underlay: 0.8,
    edges: 0.2,
    shimmer: 0.02,
    init() { return { start: 2.0, t: 0, lx: 0, ly: 0 }; },
    update(st, api) {
      const dt = api.dt, m = api.mouse;
      st.t += dt;
      if (api.clicks.length) st.start = st.t + 0.4;               // relight the chain
      if (st.t - st.start > 55) st.start = st.t + 6;              // and again on its own
      const D = api.data;
      for (let i = 0; i < NB; i++) {
        const lit = st.t - (st.start + i * 2.4);                   // each beacon catches 2.4 s after the last
        D[i] = lit > 0 ? Math.min(1, lit / 1.2) : 0;               // 0 dark .. 1 roaring
      }
      st.lx += ((m.present ? m.px * 0.35 : 0) - st.lx) * Math.min(1, dt * 1.5);
      st.ly += ((m.present ? m.py * 0.2 : 0) - st.ly) * Math.min(1, dt * 1.5);
      D[8] = st.lx; D[9] = st.ly;
    },
    frag: /* glsl */ `
    // ── terrain ───────────────────────────────────────────────
    float ridgeX(float z){ return 1.4*sin(z*0.11) + 0.05*z; }
    vec2 beaconXZ(int i){ float z = 3.0 + float(i)*4.6; return vec2(ridgeX(z) + (i % 2 == 0 ? 0.35 : -0.35), z); }

    float ridged(vec2 p){
      float a = 0.5, s = 0.0, w = 1.0;
      mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i=0; i<6; i++){
        float n = 1.0 - abs(noise(p)*2.0 - 1.0);
        n *= n;
        s += a*n*w;
        w = clamp(n*1.6, 0.0, 1.0);
        p = m*p*2.05 + vec2(3.1, 1.7);
        a *= 0.5;
      }
      return s;
    }
    float terrain(vec2 p){
      float dr = p.x - ridgeX(p.y);
      float range = 3.5*exp(-dr*dr*0.075) + 0.6*exp(-dr*dr*0.015);
      float h = range*(0.38 + 1.0*ridged(p*0.32)) - 0.3;
      vec2 cs = p - vec2(-3.4, 4.2); h += 1.9*exp(-dot(cs, cs)*0.22);
      // summits for the beacons
      for (int i=0; i<7; i++){
        vec2 b = beaconXZ(i);
        vec2 d = p - b;
        h += 1.1*exp(-dot(d, d)*1.4);
      }
      return h;
    }
    float terrainLo(vec2 p){                                       // cheaper version for marching far away
      float dr = p.x - ridgeX(p.y);
      float range = 3.5*exp(-dr*dr*0.075) + 0.6*exp(-dr*dr*0.015);
      float a = 0.5, s = 0.0, w = 1.0; vec2 q = p*0.32;
      mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i=0; i<4; i++){ float n = 1.0 - abs(noise(q)*2.0 - 1.0); n *= n; s += a*n*w; w = clamp(n*1.6, 0.0, 1.0); q = m*q*2.05 + vec2(3.1, 1.7); a *= 0.5; }
      float h = range*(0.38 + 1.0*s) - 0.3;
      vec2 cs = p - vec2(-3.4, 4.2); h += 1.9*exp(-dot(cs, cs)*0.22);
      for (int i=0; i<7; i++){ vec2 d = p - beaconXZ(i); h += 1.1*exp(-dot(d, d)*1.4); }
      return h;
    }
    vec3 tNormal(vec2 p, float t){
      float e = 0.004 + 0.0015*t;
      return normalize(vec3(terrain(p - vec2(e, 0.0)) - terrain(p + vec2(e, 0.0)), 2.0*e, terrain(p - vec2(0.0, e)) - terrain(p + vec2(0.0, e))));
    }

    const float CLOUD = 0.55;           // top of the cloud sea
    vec3 MOON;

    vec3 sky(vec3 d){
      float h = d.y;
      vec3 c = mix(vec3(0.85,0.42,0.22), vec3(0.36,0.26,0.42), smoothstep(-0.01, 0.05, h));
      c = mix(c, vec3(0.1,0.13,0.28), smoothstep(0.04, 0.22, h));
      c = mix(c, vec3(0.02,0.03,0.08), smoothstep(0.25, 0.8, h));
      // the last light lingers low in the west (+x)
      c += vec3(0.9,0.4,0.2)*pow(max(0.0, d.x*0.7 + 0.3), 3.0)*smoothstep(0.12, 0.0, h)*0.5;
      // stars
      vec2 sg = vec2(atan(d.x, d.z), asin(clamp(h, -1.0, 1.0)))*vec2(160.0, 160.0);
      vec2 si = floor(sg);
      float st = step(0.991, hash21(si))*smoothstep(0.45, 0.0, length(fract(sg) - 0.5 - (hash22(si) - 0.5)*0.4));
      c += vec3(0.8,0.85,1.0)*st*smoothstep(0.08, 0.4, h)*(0.5 + 0.5*sin(uTime*2.0 + hash21(si)*40.0));
      // moon with a soft halo
      float md = dot(d, MOON);
      c += vec3(0.6,0.65,0.8)*pow(max(md, 0.0), 60.0)*0.5;
      if (md > 0.99935) c = vec3(0.95,0.94,0.88)*(0.85 + 0.15*noise(d.xy*900.0));
      // thin high cloud
      vec2 cp = d.xz/(h + 0.2)*1.4 + vec2(uTime*0.004, 0.0);
      float cl = smoothstep(0.55, 0.8, fbm3(cp))*smoothstep(0.03, 0.25, h);
      c = mix(c, vec3(0.32,0.28,0.4) + vec3(0.25,0.22,0.2)*pow(max(md, 0.0), 8.0), cl*0.45);
      return c;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      float lit[7];
      lit[0] = uData[0].x; lit[1] = uData[0].y; lit[2] = uData[0].z; lit[3] = uData[0].w;
      lit[4] = uData[1].x; lit[5] = uData[1].y; lit[6] = uData[1].z;
      vec2 look = uData[2].xy;
      MOON = normalize(vec3(-0.55, 0.32, 0.75));
      vec3 moonCol = vec3(0.42,0.5,0.75);

      vec3 ro = vec3(-7.5 + sin(t*0.02)*0.2, 3.6, -3.0);
      vec3 ta = vec3(0.5 + look.x*4.0, 1.2 + look.y*2.5, 13.0);
      vec3 fw = normalize(ta - ro), rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
      vec3 rd = normalize(fw*1.6 + rt*p.x + up*p.y);

      vec3 col = sky(rd);
      // ── march the terrain
      float tt = 0.05, hitT = -1.0;
      for (int i=0; i<240; i++){
        vec3 pos = ro + rd*tt;
        float h = (tt < 12.0) ? terrain(pos.xz) : terrainLo(pos.xz);
        float d = pos.y - h;
        if (d < 0.0015*tt) { hitT = tt; break; }
        if (pos.y > 4.5 && rd.y > 0.0) break;
        tt += max(d*0.3, 0.002*tt);
        if (tt > 60.0) break;
      }
      // where does the ray meet the top of the cloud sea?
      float tc = rd.y < 0.0 ? (CLOUD - ro.y)/rd.y : -1.0;

      // beacon world positions (for lighting and drawing)
      vec3 bp[7];
      for (int i=0; i<7; i++){ vec2 b = beaconXZ(i); bp[i] = vec3(b.x, terrain(b) + 0.06, b.y); }
      // light from the fires at a point
      #define FIRELIGHT(P, N) { for (int k=0; k<7; k++){ if (lit[k] <= 0.0) continue; vec3 lv = bp[k] - P; float dl = length(lv); float fl = lit[k]*(0.85 + 0.15*noise(vec2(t*8.0, float(k)*3.0))); fire += vec3(1.0,0.5,0.18)*fl*max(dot(N, lv/dl), 0.0)*1.6/(1.0 + dl*dl*3.5); } }

      if (hitT > 0.0 && (tc < 0.0 || hitT < tc)) {
        vec3 pos = ro + rd*hitT;
        vec3 n = tNormal(pos.xz, hitT);
        // snow on gentle slopes and high ground, dark rock on cliffs
        float slope = n.y;
        float snow = smoothstep(0.55, 0.75, slope + 0.15*noise(pos.xz*12.0) + (pos.y - 1.2)*0.12);
        vec3 rock = mix(vec3(0.09,0.09,0.11), vec3(0.18,0.17,0.19), noise(pos.xz*20.0 + pos.y*5.0));
        vec3 alb = mix(rock, vec3(0.86,0.9,0.98), snow);
        float dif = max(dot(n, MOON), 0.0);
        // cheap self-shadow toward the moon
        float sh = 1.0;
        for (int k=1; k<10; k++){ vec3 sp = pos + MOON*float(k)*0.18; if (sp.y < terrainLo(sp.xz)) { sh = 0.25; break; } }
        vec3 fire = vec3(0.0);
        FIRELIGHT(pos, n)
        vec3 c = alb*(moonCol*dif*sh*1.1 + vec3(0.06,0.06,0.1) + vec3(0.25,0.12,0.12)*max(n.x, 0.0)*0.4) + alb*fire;
        c += vec3(0.6,0.7,1.0)*pow(max(dot(reflect(rd, n), MOON), 0.0), 30.0)*snow*sh*0.4;   // glints on snow
        float fog = 1.0 - exp(-hitT*0.045);
        col = mix(c, mix(vec3(0.1,0.12,0.22), sky(vec3(rd.x, 0.02, rd.z)), 0.3), fog);
      } else if (tc > 0.0) {
        // the sea of cloud: lumpy tops lit by the moon and, near the peaks, by the fires
        vec3 cpz = ro + rd*tc;
        vec2 q = cpz.xz*0.45 + vec2(t*0.02, t*0.01);
        float dens = fbm(q) + 0.5*fbm(q*2.7 + 5.0);
        float nTop = fbm(q + vec2(0.06, 0.0)) - fbm(q - vec2(0.06, 0.0));
        float ml = clamp(0.55 + nTop*3.0*dot(normalize(vec2(MOON.x, MOON.z)), vec2(1.0, 0.0)) + dens*0.3, 0.15, 1.0);
        vec3 c = vec3(0.36,0.42,0.6)*ml + vec3(0.05,0.06,0.1);
        vec3 fire = vec3(0.0);
        FIRELIGHT(cpz, vec3(0.0, 1.0, 0.0))
        c += vec3(0.9,0.75,0.7)*fire*0.7;
        float gaps = smoothstep(0.55, 0.8, dens);
        float fog = 1.0 - exp(-tc*0.035);
        c = mix(c, mix(vec3(0.16,0.17,0.3), sky(vec3(rd.x, 0.01, rd.z)), 0.45), fog);
        col = mix(vec3(0.02,0.025,0.05), c, gaps*0.85 + 0.15);
      }

      // ── the citadel: a pale walled city on the nearest spur, windows glowing
      {
        vec3 cpos = vec3(-3.9, 0.0, 3.6); cpos.y = terrain(cpos.xz) - 0.25;
        vec3 v = cpos - ro; float vz = dot(v, fw);
        vec2 sp = vec2(dot(v, rt), dot(v, up))/vz*1.6;
        vec2 q = (p - sp)*vz/2.2;
        // tiers of walls stepping up to a tower
        float tier = 0.0;
        for (int i=0; i<4; i++){ float fi = float(i); float w = 0.32 - fi*0.07; float y0 = fi*0.06; if (abs(q.x) < w && q.y > y0 - 0.02 && q.y < y0 + 0.055) tier = 1.0 + fi; }
        bool tower = abs(q.x - 0.02) < 0.018 && q.y > 0.0 && q.y < 0.42;
        if ((tier > 0.0 || tower) && (hitT < 0.0 || vz < hitT + 0.6)) {
          float side = smoothstep(-0.3, 0.3, -q.x + 0.1);
          vec3 stone = vec3(0.86,0.85,0.82)*(0.3 + 0.7*side)*vec3(0.62,0.66,0.82);
          float ledge = smoothstep(0.006, 0.0, abs(fract((q.y + 0.02)/0.06) - 0.92)*0.06);           // tier ledges
          stone = mix(stone, vec3(0.22,0.24,0.32), ledge*0.7);
          float roofs = step(0.6, hash21(floor(q*vec2(60.0, 30.0))))*step(0.7, fract(q.y*30.0));
          stone = mix(stone, vec3(0.16,0.17,0.24), roofs*0.6);
          float win = step(0.72, hash21(floor(q*vec2(160.0, 90.0))))*step(0.3, fract(q.y*90.0))*step(fract(q.x*160.0), 0.6)*(tier > 0.0 ? 1.0 : 0.6);
          stone = mix(stone, vec3(1.0,0.75,0.4)*(0.8 + 0.2*sin(t*3.0 + q.x*100.0)), win);
          if (tower && q.y > 0.4) stone = vec3(0.95,0.95,1.0);
          col = stone;
        }
      }

      // ── the beacons: fire, glow, smoke, embers
      for (int i=0; i<7; i++){
        vec3 v = bp[i] - ro;
        float vz = dot(v, fw);
        if (vz < 0.2) continue;
        bool visible = hitT < 0.0 || hitT > length(v) - 0.25;
        vec2 sp = vec2(dot(v, rt), dot(v, up))/vz*1.6;
        float sc = 1.0/vz;                         // screen units per world unit (x1.6)
        vec2 q = (p - sp)/(sc*1.6);                // back to world-ish units around the beacon
        float L = lit[i];
        // the unlit pyre: a dark cone of timber
        if (visible && q.y > -0.01 && q.y < 0.07 && abs(q.x) < 0.045*(1.0 - q.y/0.075)) col = mix(col, vec3(0.08,0.05,0.03), 0.9);
        if (L <= 0.0) continue;
        float fl = 0.85 + 0.15*noise(vec2(t*9.0, float(i)*7.0));
        // flame: a flickering tongue shape built from noise
        vec2 fq = q - vec2(0.0, 0.05);
        float hgt = 0.55*L*fl;
        float yy = clamp(fq.y/hgt, 0.0, 1.0);
        float n = fbm3(vec2(fq.x*18.0, fq.y*9.0 - t*5.0 + float(i)*4.0));
        float w = 0.11*(1.0 - yy)*(0.6 + 0.6*n)*L;
        float flame = smoothstep(w, w*0.3, abs(fq.x + (n - 0.5)*0.05*yy))*step(0.0, fq.y)*step(fq.y, hgt);
        if (visible && flame > 0.0) {
          vec3 fc = mix(vec3(1.0,0.35,0.05), vec3(1.0,0.92,0.6), (1.0 - yy)*flame);
          col = mix(col, fc*1.4, flame);
        }
        // glow halo (visible even when the summit is just behind a ridge)
        float gd = length(q - vec2(0.0, 0.2));
        col += vec3(1.0,0.5,0.18)*L*(exp(-gd*gd*25.0)*1.1 + exp(-gd*2.2)*0.28)*(visible ? 1.0 : 0.45)*fl;
        // smoke column drifting east with the wind
        vec2 sq = q - vec2(0.0, 0.5);
        float rise = max(sq.y, 0.0);
        float sx = sq.x - rise*rise*0.6 - rise*0.35;
        float smoke = smoothstep(0.06 + rise*0.25, 0.0, abs(sx + (fbm3(vec2(rise*6.0 - t*0.8, float(i)))-0.5)*0.15))*smoothstep(1.6, 0.2, rise)*step(0.0, sq.y);
        smoke *= smoothstep(0.35, 0.65, fbm3(vec2(sx*10.0, rise*5.0 - t*1.2)))*L;
        col = mix(col, vec3(0.2,0.16,0.16) + vec3(0.5,0.25,0.1)*exp(-rise*2.0), smoke*0.55);
        // embers
        for (int k=0; k<8; k++){
          float fk = float(k);
          float ph = fract(t*0.35 + hash11(fk + float(i)*13.0));
          vec2 ep = vec2((hash11(fk*3.7 + float(i)) - 0.5)*0.15 + ph*ph*0.4, 0.1 + ph*0.9);
          float ed = length((q - ep)*sc*1.6*REF*1.5);
          col += vec3(1.0,0.55,0.2)*exp(-ed*ed*1.5)*(1.0 - ph)*L*(visible ? 1.0 : 0.0);
        }
      }

      // drifting snow in front of everything
      for (int L2=0; L2<2; L2++){
        float fl2 = float(L2);
        vec2 sq = p*(18.0 + fl2*14.0) + vec2(t*(0.6 + fl2*0.4), t*(1.3 + fl2*0.6));
        sq.x += sin(sq.y*0.4 + fl2)*0.8;
        vec2 si = floor(sq);
        float fl3 = step(0.96, hash21(si + fl2*17.0))*smoothstep(0.3, 0.0, length(fract(sq) - 0.5 - (hash22(si) - 0.5)*0.5));
        col += vec3(0.75,0.8,0.95)*fl3*(0.35 - fl2*0.12);
      }
      bool land = hitT > 0.0 && (tc < 0.0 || hitT < tc);
      col = pow(col, vec3(1.35))*1.6;                                   // more contrast: dark rock, bright snow
      float dd = pow(clamp(luma(col)*1.6, 0.0, 1.0), 1.1);
      dd *= land ? 1.0 : (tc > 0.0 ? 0.6 : 0.4);                        // sparse glyphs in sky and cloud
      return shade(col, dd);
    }
    `,
  });
})();


/* ── scenes/meadowwalk.js ── */
/* Meadow Walk — first person, strolling down a winding path through a wildflower meadow at sunset.
 * Flowers are drawn on ~48 depth layers that slide toward you as you walk (real parallax), with a
 * footstep head-bob. Fireflies and butterflies live in the world. Cursor looks around; hold to stop
 * and stand still; tap for a gust of petals. */
(function () {
  window.AsciiWall.registerScene({
    id: "meadowwalk",
    name: "Meadow Walk",
    blurb: "A first-person stroll down a winding path through wildflowers at sunset, with fireflies and butterflies around you. Look around with your cursor, hold to stop and stand still, and tap for a gust of petals.",
    tags: ["nature", "3d", "cozy", "interactive"],
    style: "glyph",
    ramp: "soft",
    bg: "#0b0806",
    cell: 4.5,
    aspect: 1.8,
    glow: 0.8,
    underlay: 0.7,
    edges: 0.25,
    shimmer: 0.02,
    init() { return { z: 0, yaw: 0, pitch: 0, phase: 0, speed: 0.32, gust: 99 }; },
    update(st, api) {
      const dt = Math.min(api.dt, 0.05), m = api.mouse;
      const target = m.down ? 0 : 0.32;
      st.speed += (target - st.speed) * Math.min(1, dt * 2.2);
      st.z += st.speed * dt;
      st.phase += st.speed * dt * 11.0;                       // ~1.8 steps per second at full pace
      const ty = m.present ? (m.px / api.aspect) * 0.9 : Math.sin(st.z * 0.13) * 0.12;
      const tp = m.present ? m.py * 0.45 : 0.0;
      st.yaw += (ty - st.yaw) * Math.min(1, dt * 2.5);
      st.pitch += (tp - st.pitch) * Math.min(1, dt * 2.5);
      st.gust += dt;
      if (api.clicks.length) st.gust = 0;
      const D = api.data;
      D[0] = st.z % 5000; D[1] = st.yaw; D[2] = st.pitch; D[3] = st.phase;
      D[4] = st.speed / 0.32; D[5] = st.gust;
    },
    frag: /* glsl */ `
    const float DZ = 0.11;      // spacing of the depth layers
    const int   NROWS = 52;
    const float CW = 0.085;     // flower column width
    vec3 SUN; vec3 SUNCOL;

    float pathX(float z){ return 0.35*sin(z*0.21) + 0.18*sin(z*0.53 + 1.3); }

    vec3 sky(vec3 d){
      float h = d.y;
      float sd = max(dot(d, SUN), 0.0);
      vec3 c = mix(vec3(1.0,0.62,0.36), vec3(0.98,0.42,0.38), smoothstep(0.0, 0.12, h));
      c = mix(c, vec3(0.52,0.36,0.58), smoothstep(0.08, 0.3, h));
      c = mix(c, vec3(0.16,0.18,0.36), smoothstep(0.25, 0.7, h));
      c += vec3(1.0,0.72,0.4)*pow(sd, 6.0)*0.7 + vec3(1.0,0.92,0.75)*pow(sd, 300.0)*1.6;
      // long streaky clouds lit from below
      vec2 cp = d.xz/(h + 0.12)*vec2(0.6, 1.6) + vec2(uTime*0.006, 0.0);
      float cl = smoothstep(0.48, 0.75, fbm(cp*vec2(1.0, 2.5)))*smoothstep(0.02, 0.12, h)*smoothstep(0.6, 0.2, h);
      vec3 cc = mix(vec3(0.62,0.32,0.42), vec3(1.0,0.72,0.5), pow(sd, 2.0) + 0.3*(1.0 - smoothstep(0.0, 0.2, h)));
      c = mix(c, cc, cl*0.85);
      // first stars high up
      vec2 sg = vec2(atan(d.x, d.z), h)*vec2(120.0, 120.0);
      c += vec3(0.9)*step(0.996, hash21(floor(sg)))*smoothstep(0.35, 0.7, h)*0.6;
      return c;
    }

    // one flower column on a depth layer; returns rgba (premultiplied-ish alpha)
    vec4 flower(vec2 q, float row, float col, float t, float gust){
      vec2 h = hash22(vec2(row, col));
      float kind = hash21(vec2(col*1.7, row*3.1));
      if (h.x < 0.25) return vec4(0.0);
      float cx = (col + 0.2 + h.y*0.6)*CW;
      float ht = 0.1 + 0.26*h.x*h.x;
      // wind: a slow travelling wave plus the tap gust
      float wind = sin(t*1.4 + row*0.7 + col*0.9)*0.012 + sin(t*0.6 + row*0.21)*0.01 + gust*0.05*sin(t*6.0 + col);
      float yy = clamp(q.y/ht, 0.0, 1.0);
      float sx = cx + wind*yy*yy;
      float stem = abs(q.x - sx);
      vec4 r = vec4(0.0);
      if (q.y > 0.0 && q.y < ht && stem < 0.0028) r = vec4(vec3(0.22,0.42,0.14), 1.0);
      // a leaf partway up
      vec2 lq = q - vec2(sx + 0.012*sign(h.y - 0.5), ht*0.35);
      if (length(lq*vec2(1.0, 2.6)) < 0.013) r = vec4(vec3(0.28,0.5,0.16), 1.0);
      vec2 hq = q - vec2(cx + wind, ht);
      if (kind < 0.18) {
        // lavender: a spike of little purple buds
        if (hq.y < 0.012 && hq.y > -0.075) {
          float k = (hq.y + 0.075)/0.087;                         // 0 bottom .. 1 tip
          float seg = fract(hq.y/0.0085);
          float side = mod(floor(hq.y/0.0085), 2.0)*2.0 - 1.0;
          float w = (0.0075 - 0.004*k)*(0.6 + 0.4*sin(seg*PI));
          float bx = hq.x - side*0.0018;
          if (abs(bx) < w) r = vec4(mix(vec3(0.42,0.28,0.7), vec3(0.7,0.55,0.95), seg*0.6 + k*0.3), 1.0);
        }
        return r;
      }
      float R = kind < 0.4 ? 0.024 : (kind < 0.6 ? 0.03 : (kind < 0.75 ? 0.022 : (kind < 0.88 ? 0.028 : 0.014)));
      vec2 pq = hq*vec2(1.0, 1.6);                         // heads seen a little from above
      float d = length(pq), a = atan(pq.y, pq.x);
      float N = kind < 0.4 ? 13.0 : (kind < 0.6 ? 5.0 : (kind < 0.75 ? 8.0 : (kind < 0.88 ? 8.0 : 5.0)));
      float pr = R*(0.55 + 0.45*pow(abs(cos(a*N*0.5)), kind < 0.4 ? 0.35 : 0.8));
      if (d < pr) {
        vec3 pc;
        if (kind < 0.4)      { pc = vec3(0.97,0.96,0.92); if (d < R*0.3) pc = vec3(1.0,0.78,0.15); }               // daisy
        else if (kind < 0.6) { pc = vec3(0.92,0.14,0.08); if (d < R*0.25) pc = vec3(0.06,0.04,0.05); }              // poppy
        else if (kind < 0.75){ pc = vec3(0.3,0.45,0.95);  if (d < R*0.25) pc = vec3(0.2,0.15,0.45); }               // cornflower
        else if (kind < 0.88){ pc = vec3(0.98,0.5,0.72);  if (d < R*0.25) pc = vec3(1.0,0.82,0.3); }                // cosmos
        else                 { pc = vec3(1.0,0.86,0.15); }                                                          // buttercup
        pc *= 0.75 + 0.35*smoothstep(pr, 0.0, d);
        r = vec4(pc, 1.0);
      }
      return r;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      float camZ = uData[0].x, yaw = uData[0].y, pitch = uData[0].z, ph = uData[0].w;
      float pace = uData[1].x, gust = uData[1].y;
      float g = gust < 3.0 ? exp(-gust*1.2) : 0.0;
      SUN = normalize(vec3(0.35, 0.06, 1.0));
      SUNCOL = vec3(1.0,0.7,0.45);

      // camera: walking along the path with a footstep bob
      float bob = abs(sin(ph))*0.012*pace;
      float sway = sin(ph*0.5)*0.006*pace;
      vec3 ro = vec3(pathX(camZ) + sway, 0.34 + bob, camZ);
      float pathYaw = atan(pathX(camZ + 0.6) - pathX(camZ), 0.6);
      float ya = yaw + pathYaw*0.6;
      vec3 fw = normalize(vec3(sin(ya), -0.12 + pitch*0.6 - bob*0.5, cos(ya)));
      vec3 rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
      vec3 rd = normalize(fw*1.35 + rt*p.x + up*p.y);

      vec3 col = sky(rd);
      // distant hills, three layers of haze
      if (rd.y < 0.12) {
        float az = atan(rd.x, rd.z);
        for (int i=2; i>=0; i--){
          float fi = float(i);
          float hh = 0.01 + 0.03*(1.0 + fi*0.6)*fbm3(vec2(az*(3.0 + fi*2.0) + fi*11.0 + camZ*0.004*(3.0 - fi), fi));
          if (rd.y < hh + (i == 0 ? 0.012 : 0.0)) {
            vec3 hc = i == 2 ? vec3(0.74,0.5,0.55) : (i == 1 ? vec3(0.46,0.34,0.46) : vec3(0.2,0.22,0.16));
            hc *= 0.9 + 0.15*noise(vec2(az*80.0, rd.y*200.0));
            // a line of round tree crowns along the nearest ridge
            if (i == 0) {
              float ti = floor(az*70.0);
              float tr2 = 0.006 + 0.006*hash11(ti);
              vec2 tq = vec2((fract(az*70.0) - 0.5)/70.0*3.0, rd.y - hh);
              bool tree = hash11(ti + 5.0) > 0.35 && length(tq) < tr2;
              if (tree) hc = vec3(0.13,0.15,0.1);
              else if (rd.y >= hh) continue;
            }
            float haze = i == 2 ? 0.45 : (i == 1 ? 0.25 : 0.08);
            col = mix(hc, sky(vec3(rd.x, 0.015, rd.z)), haze);
          }
        }
      }

      // meadow layers, front to back
      vec3 acc = vec3(0.0); float alpha = 0.0;
      float k0 = floor(camZ/DZ) + 1.0;
      float hitT = 1e9;
      for (int i=0; i<NROWS; i++){
        float row = k0 + float(i);
        float zr = row*DZ;
        float tr = (zr - ro.z)/rd.z;
        if (tr <= 0.0) continue;
        vec3 hp = ro + rd*tr;
        if (hp.y > 0.42) { if (rd.y >= 0.0) break; else continue; }
        float fog = 1.0 - exp(-tr*0.16);
        vec4 c = vec4(0.0);
        // off the path: grass blades and flowers
        float px = pathX(zr);
        float onPath = smoothstep(0.17, 0.12, abs(hp.x - px));
        if (hp.y < 0.0) { continue; } else {
          // grass: dense thin blades, shorter at the path edge
          float bw = 0.011;
          float bx = hp.x + sin(t*1.3 + zr*0.8)*0.004*hp.y*10.0;
          float bi = floor(bx/bw);
          float bh = (0.04 + 0.1*hash21(vec2(bi, row)))*(1.0 - onPath*0.85);
          float bf = abs(fract(bx/bw) - 0.5);
          if (hp.y < bh && bf < 0.32*(1.0 - hp.y/bh)) {
            vec3 gc = mix(vec3(0.16,0.3,0.08), vec3(0.45,0.55,0.18), hp.y/bh*hash21(vec2(bi + 3.0, row)));
            c = vec4(gc, 1.0);
          }
          if (onPath < 0.5) {
            float ci = floor(hp.x/CW);
            for (int j=-1; j<=1; j++){
              vec4 f = flower(vec2(hp.x, hp.y), row, ci + float(j), t, g);
              if (f.a > 0.0) c = f;
            }
          }
        }
        if (c.a > 0.0) {
          // backlit by the low sun: rim glow on the side facing the light, darker toward the viewer
          vec3 lit = c.rgb*(0.35 + 0.55*SUNCOL) + c.rgb*SUNCOL*0.35*pow(max(dot(rd, SUN), 0.0), 3.0);
          lit *= 0.7 + 0.5*clamp(hp.y*4.0, 0.0, 1.0);
          lit = mix(lit, sky(vec3(rd.x, 0.03, rd.z))*0.85, fog);
          acc += (1.0 - alpha)*lit*c.a;
          alpha += (1.0 - alpha)*c.a;
          hitT = min(hitT, tr);
          if (alpha > 0.98) break;
        }
      }
      // beyond the last layer: the meadow floor fades into colour-speckled distance
      if (alpha < 0.98 && rd.y < 0.0) {
        float tg = -ro.y/rd.y;
        vec3 gp = ro + rd*tg;
        float near = 1.0 - smoothstep(float(NROWS)*DZ*0.8, float(NROWS)*DZ, tg);
        {
          // the path: packed earth with ruts and pebbles; grass soil either side
          float pd = abs(gp.x - pathX(gp.z));
          float onP = smoothstep(0.17, 0.12, pd);
          vec3 dirt = mix(vec3(0.36,0.27,0.17), vec3(0.46,0.36,0.24), noise(gp.xz*vec2(30.0, 12.0)));
          dirt *= 1.0 - 0.25*smoothstep(0.03, 0.0, abs(pd - 0.07));                       // wheel ruts
          dirt = mix(dirt, vec3(0.55,0.5,0.42), step(0.93, hash21(floor(gp.xz*90.0)))*0.8); // pebbles
          vec3 soil = mix(vec3(0.12,0.17,0.06), vec3(0.22,0.28,0.1), noise(gp.xz*20.0));
          vec3 nearC = mix(soil, dirt, onP)*(0.45 + 0.55*SUNCOL);
          nearC = mix(nearC, sky(vec3(rd.x, 0.03, rd.z))*0.85, 1.0 - exp(-tg*0.16));
          if (near > 0.0) { acc += (1.0 - alpha)*nearC*near; alpha += (1.0 - alpha)*near; }
          hitT = min(hitT, tg);
        }
        if (alpha < 0.999) {
          float sp = hash21(floor(gp.xz*vec2(40.0, 8.0)));
          vec3 gc = mix(vec3(0.24,0.3,0.12), vec3(0.4,0.42,0.16), noise(gp.xz*3.0));
          gc = mix(gc, sp < 0.04 ? vec3(0.95,0.25,0.15) : (sp < 0.08 ? vec3(0.95,0.92,0.85) : (sp < 0.1 ? vec3(0.55,0.4,0.85) : gc)), 0.7);
          gc *= 0.45 + 0.55*SUNCOL;
          gc = mix(gc, sky(vec3(rd.x, 0.03, rd.z))*0.85, 1.0 - exp(-tg*0.16));
          acc += (1.0 - alpha)*gc; alpha = 1.0;
          hitT = min(hitT, tg);
        }
      }
      col = mix(col, acc/max(alpha, 1e-3), alpha);

      // fireflies living in world cells around the path
      for (int i=0; i<14; i++){
        float fi = float(i);
        float cz = floor(camZ/0.5) + floor(fi/2.0) + 1.0;
        vec2 hh = hash22(vec2(cz, fi));
        vec3 fp = vec3(pathX(cz*0.5) + (hh.x - 0.5)*1.4 + 0.08*sin(t*0.7 + fi), 0.12 + 0.25*hh.y + 0.04*sin(t*1.1 + fi*2.0), cz*0.5 + 0.2*sin(t*0.5 + fi));
        vec3 v = fp - ro;
        float vz = dot(v, fw);
        if (vz < 0.1 || vz > hitT + 0.1) continue;
        vec2 sp = vec2(dot(v, rt), dot(v, up))/vz*1.35;
        float blink = pow(0.5 + 0.5*sin(t*2.3 + fi*4.1), 4.0);
        float d = length(p - sp)*vz;
        col += vec3(1.0,0.9,0.45)*(exp(-d*d*9000.0)*1.4 + exp(-d*d*700.0)*0.25)*blink;
      }
      // butterflies fluttering ahead
      for (int i=0; i<5; i++){
        float fi = float(i);
        float cz = floor(camZ/1.5) + fi*0.6 + 1.0;
        vec3 bp = vec3(pathX(cz*1.5) + 0.4*sin(t*0.35 + fi*2.0) + 0.05*sin(t*2.1 + fi), 0.2 + 0.06*sin(t*0.9 + fi) + 0.02*sin(t*5.0 + fi), cz*1.5 + 0.3*sin(t*0.25 + fi));
        bp.xy += g*vec2(sin(fi*3.0), 0.3)*0.4;
        vec3 v = bp - ro;
        float vz = dot(v, fw);
        if (vz < 0.15 || vz > hitT + 0.05) continue;
        vec2 sp = vec2(dot(v, rt), dot(v, up))/vz*1.35;
        vec2 q = (p - sp)*vz/0.018;
        float flap = abs(sin(t*9.0 + fi*1.7));
        q.x /= 0.25 + 0.75*flap;
        float w = min(length((abs(q) - vec2(0.55, 0.32))*vec2(1.0, 1.3)), length((abs(q) - vec2(0.42, -0.35))*1.5));
        if (w < 0.42 && abs(q.x) > 0.05) {
          vec3 bc = i == 0 ? vec3(1.0,0.6,0.15) : (i == 1 ? vec3(0.5,0.7,1.0) : (i == 2 ? vec3(1.0,0.95,0.8) : (i == 3 ? vec3(1.0,0.5,0.7) : vec3(0.95,0.85,0.2))));
          bc = mix(bc*0.4, bc, smoothstep(0.42, 0.15, w))*(0.6 + 0.6*SUNCOL);
          col = bc;
        }
      }
      // a gust of petals on tap
      if (g > 0.01) {
        for (int i=0; i<40; i++){
          float fi = float(i);
          vec2 pp = vec2(hash11(fi*3.3) - 0.5, hash11(fi*7.9) - 0.6)*vec2(uAspect, 1.0);
          pp += vec2(1.0, 0.25)*(1.0 - g)*(0.6 + hash11(fi))*1.2 + vec2(0.0, 0.05*sin(t*3.0 + fi));
          vec2 q = rot(t*4.0 + fi)*(p - pp);
          if (length(q*vec2(1.0, 2.0)) < 0.007) col = mix(vec3(1.0,0.7,0.8), vec3(1.0,0.95,0.95), hash11(fi*2.2));
        }
      }
      float dsky = alpha > 0.5 ? 1.0 : 0.45;
      float dd = pow(clamp(luma(col)*1.5, 0.0, 1.0), 1.0);
      if (alpha > 0.5) dd = max(dd, 0.34 + 0.1*hash21(floor(uv*uGrid)));
      return shade(col*(alpha > 0.5 ? 1.25 : 1.0), dd*dsky);
    }
    `,
  });
})();


/* ── scenes/heart.js ── */
/* Beating Heart — anatomical heart, anterior view (after classic medical illustrations):
 * broad ventricles tapering to the apex, right atrium bulging on the viewer's left, left auricle on the right,
 * red aortic arch with three open-ended branches, pulmonary trunk, superior vena cava, and raised dark
 * coronary arteries branching over a glossy, lumpy surface. Lub-dub beat; blood drips from the apex.
 * Drag to turn it; hover quickens it; tap for a hard beat. */
(function () {
  window.AsciiWall.registerScene({
    id: "heart",
    name: "Beating Heart",
    blurb: "An anatomical heart beating lub-dub, with raised coronary arteries, the aortic arch and open vessels, slick and dripping. Drag to turn it, hover to quicken the pulse, tap for a hard beat.",
    tags: ["3d", "anatomy", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#060203",
    cell: 4.5,
    aspect: 1.8,
    glow: 0.5,
    underlay: 0.45,
    edges: 0.35,
    shimmer: 0.02,
    dragToOrbit: true,
    orbit: [0.0, 0.0],
    init() { return { ph: 0, burst: 99, bpm: 1.0 }; },
    update(st, api) {
      const dt = api.dt, m = api.mouse;
      st.burst += dt;
      if (api.clicks.length) { st.burst = 0; st.ph = Math.floor(st.ph) + 0.999; }
      const target = 1.0 + m.on * 0.3 + Math.min(1, m.speed) * 0.7 + (st.burst < 3 ? 1.0 * (1 - st.burst / 3) : 0);
      st.bpm += (target - st.bpm) * Math.min(1, dt * 1.5);
      st.ph += dt * st.bpm;
      const f = st.ph % 1;
      const ven = Math.exp(-Math.pow((f - 0.1) * 11, 2)) + 0.5 * Math.exp(-Math.pow((f - 0.3) * 12, 2));
      const atr = Math.exp(-Math.pow((f - 0.94) * 12, 2));
      const D = api.data;
      D[0] = ven * (st.burst < 0.4 ? 1.5 : 1); D[1] = st.burst; D[2] = atr;
      D[4] = m.px; D[5] = m.py; D[6] = m.on;
    },
    frag: /* glsl */ `
    float sdEll(vec3 p, vec3 r){ float k0 = length(p/r); float k1 = length(p/(r*r)); return k0*(k0-1.0)/max(k1, 1e-4); }
    float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h)-r; }
    float sdSeg2(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h); }
    vec2 su(vec2 a, vec2 b, float k){ float h = clamp(0.5+0.5*(b.x-a.x)/k, 0.0, 1.0); return vec2(mix(b.x,a.x,h) - k*h*(1.0-h), h > 0.5 ? a.y : b.y); }
    // open-ended tube: capsule with its lumen hollowed out past the end
    float tube(vec3 p, vec3 a, vec3 b, float r){
      float d = sdCap(p, a, b, r);
      vec3 dir = normalize(b - a);
      float inner = sdCap(p, b - dir*r*1.2, b + dir*r*2.0, r*0.62);
      return max(d, -inner);
    }

    mat3 HR; vec3 HC; float BEAT, ATR;
    const vec3 RO = vec3(0.0, 0.0, -3.85);
    const float F = 1.3;

    // ventricle mass: a rounded cone, broad at the base, apex down and slightly to the viewer's right
    float ventricles(vec3 p){
      vec3 q = p;
      float s = 1.0 + 0.045*BEAT;
      q.x -= 0.14*smoothstep(0.2, -0.85, q.y);                      // apex leans right
      float k = mix(1.0, 0.42, smoothstep(0.25, -0.85, q.y));       // taper toward the apex
      q.xz /= k*vec2(1.0, 1.0)/s;
      float d = sdEll(q - vec3(0.04, -0.12, 0.02), vec3(0.7, 0.74, 0.52))*k/s;
      return d;
    }

    // coronary tree drawn on the front (projected xy, local space). returns distance to nearest vessel
    float coronary(vec2 p, out float w){
      float d = 1e9; w = 0.0;
      #define SEG(ax,ay,bx,by,wd) { float s_ = sdSeg2(p, vec2(ax,ay), vec2(bx,by)) - wd; if (s_ < d) { d = s_; w = wd; } }
      vec2 o = 0.012*vec2(noise(p*14.0) - 0.5, noise(p*14.0 + 7.0) - 0.5);
      p += o;
      // LAD down the front groove
      SEG(0.02,0.30, 0.05,-0.05, 0.026) SEG(0.05,-0.05, 0.11,-0.42, 0.022) SEG(0.11,-0.42, 0.16,-0.78, 0.016)
      // diagonals
      SEG(0.04,0.14, 0.30,-0.08, 0.016) SEG(0.30,-0.08, 0.44,-0.32, 0.011)
      SEG(0.08,-0.18, 0.33,-0.42, 0.014) SEG(0.33,-0.42, 0.38,-0.62, 0.009)
      SEG(0.11,-0.48, 0.27,-0.66, 0.010)
      SEG(0.05,0.02, -0.18,-0.26, 0.013) SEG(-0.18,-0.26, -0.22,-0.5, 0.009)
      SEG(0.1,-0.34, -0.06,-0.6, 0.010)
      // right coronary down the left side
      SEG(-0.12,0.28, -0.42,0.12, 0.022) SEG(-0.42,0.12, -0.52,-0.18, 0.019) SEG(-0.52,-0.18, -0.38,-0.5, 0.014)
      SEG(-0.48,-0.04, -0.26,-0.36, 0.011) SEG(-0.4,-0.36, -0.2,-0.64, 0.009)
      // circumflex / marginals on the right
      SEG(0.16,0.3, 0.46,0.2, 0.018) SEG(0.46,0.2, 0.6,-0.08, 0.014) SEG(0.5,0.12, 0.47,-0.3, 0.011) SEG(0.6,-0.08, 0.52,-0.4, 0.009)
      return d;
    }

    vec2 heart(vec3 p){
      vec2 r = vec2(ventricles(p), 0.0);
      // lumpy fat / muscle relief
      r.x -= 0.012*noise3(p*9.0) + 0.006*noise3(p*23.0);
      // raised coronary arteries on the front
      float w;
      float cd = coronary(p.xy, w);
      r.x -= 0.022*smoothstep(0.012, -0.02, cd)*smoothstep(0.25, -0.2, p.z);
      // right atrium (viewer's left) + right auricle flap
      float ra = sdEll(p - vec3(-0.5, 0.26, 0.04), vec3(0.3, 0.33, 0.3)*(1.0 + 0.05*ATR));
      float rau = sdEll(p - vec3(-0.34, 0.42, -0.22), vec3(0.24, 0.13, 0.13));
      r = su(r, vec2(min(ra, rau) - 0.01*noise3(p*14.0), 3.0), 0.09);
      // left atrium behind, left auricle on the right shoulder
      float la = sdEll(p - vec3(0.25, 0.4, 0.3), vec3(0.38, 0.24, 0.28));
      float lau = sdEll(p - vec3(0.5, 0.36, -0.12), vec3(0.17, 0.13, 0.12));
      r = su(r, vec2(min(la, lau) - 0.012*noise3(p*16.0), 4.0), 0.07);
      // pulmonary trunk (front, rising right) and its branches
      float pt = sdCap(p, vec3(0.0, 0.1, -0.3), vec3(0.14, 0.55, -0.12), 0.17);
      pt = min(pt, tube(p, vec3(0.14, 0.55, -0.12), vec3(0.6, 0.6, 0.12), 0.1));
      pt = min(pt, tube(p, vec3(0.42, 0.48, 0.05), vec3(0.72, 0.5, 0.12), 0.06));     // pulmonary veins
      pt = min(pt, tube(p, vec3(0.42, 0.36, 0.08), vec3(0.72, 0.34, 0.14), 0.055));
      r = su(r, vec2(pt, 1.0), 0.16);
      // ascending aorta, arch, three branches, descending aorta
      float ao = sdCap(p, vec3(-0.08, 0.3, -0.04), vec3(-0.08, 0.82, 0.0), 0.17);
      vec3 ap = p - vec3(0.06, 0.82, 0.2);
      ap.xz = mat2(0.55, -0.83, 0.83, 0.55)*ap.xz;
      ao = min(ao, max(length(vec2(length(ap.xy) - 0.21, ap.z)) - 0.16, -ap.y));
      ao = min(ao, sdCap(p, vec3(0.18, 0.82, 0.38), vec3(0.22, 0.1, 0.5), 0.14));
      ao = min(ao, tube(p, vec3(-0.06, 0.95, 0.06), vec3(-0.12, 1.3, 0.04), 0.085));
      ao = min(ao, tube(p, vec3(0.06, 1.02, 0.2), vec3(0.08, 1.34, 0.2), 0.07));
      ao = min(ao, tube(p, vec3(0.16, 0.98, 0.32), vec3(0.24, 1.26, 0.34), 0.068));
      r = su(r, vec2(ao, 1.0), 0.07);
      // superior vena cava on the far left
      float vc = tube(p, vec3(-0.44, 0.45, 0.16), vec3(-0.42, 1.06, 0.16), 0.12);
      r = su(r, vec2(vc, 2.0), 0.05);
      return r;
    }
    vec2 map(vec3 pw){ return heart(HR*(pw - HC)); }
    vec3 normalAt(vec3 p){
      const vec2 k = vec2(1.0, -1.0); const float e = 0.0018;
      return normalize(k.xyy*map(p + k.xyy*e).x + k.yyx*map(p + k.yyx*e).x + k.yxy*map(p + k.yxy*e).x + k.xxx*map(p + k.xxx*e).x);
    }
    vec2 project(vec3 w){ return w.xy*F/(w.z - RO.z); }
    vec3 toWorld(vec3 local){ return transpose(HR)*local + HC; }

    vec3 material(vec3 lp, vec3 n, float id, out float gloss){
      gloss = 1.0;
      float n1 = noise3(lp*9.0), n2 = noise3(lp*24.0);
      if (id < 0.5 || id > 2.5) {
        // muscle: warm reddish-brown with darker blotches and yellow fat in the grooves
        vec3 c = mix(vec3(0.58, 0.2, 0.09), vec3(0.72, 0.36, 0.14), n1);
        c = mix(c, vec3(0.42, 0.08, 0.06), smoothstep(0.55, 0.8, noise3(lp*2.6 + 3.0))*0.75);
        float fat = smoothstep(0.6, 0.85, noise3(lp*5.0 + 9.0))*smoothstep(0.0, 0.3, lp.y);
        c = mix(c, vec3(0.86, 0.6, 0.26), fat*0.7);
        if (id > 2.5) c = mix(c, vec3(0.62, 0.16, 0.12), 0.45);     // atria a little redder
        // coronary vessels: dark maroon, glossy
        float w;
        float cd = coronary(lp.xy, w);
        float on = smoothstep(0.004, -0.004, cd)*smoothstep(0.25, -0.2, lp.z);
        vec3 vc = mix(vec3(0.2, 0.02, 0.03), vec3(0.42, 0.06, 0.06), smoothstep(-w, 0.0, cd));
        c = mix(c, vc, on);
        // fine capillaries
        float cap = smoothstep(0.018, 0.0, abs(noise3(lp*7.0 + 2.0) - 0.5))*(1.0 - on);
        c = mix(c, vec3(0.38, 0.08, 0.06), cap*0.5);
        c *= 0.88 + 0.24*n2;
        gloss = 0.9 + on*0.6;
        return c;
      }
      if (id < 1.5) return mix(vec3(0.62, 0.12, 0.07), vec3(0.78, 0.25, 0.12), n1)*(0.9 + 0.2*n2);   // arteries: red
      return mix(vec3(0.36, 0.1, 0.12), vec3(0.48, 0.16, 0.18), n1)*(0.9 + 0.2*n2);                                   // vena cava: purple-red
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      BEAT = uData[0].x; ATR = uData[0].z;
      float burst = uData[0].y;
      vec2 look = uData[1].xy*uData[1].z;
      HR = rotX(-uOrbit.y*0.7 - look.y*0.12 + 0.03*sin(t*0.4)) * rotY(uOrbit.x + look.x*0.22 + 0.05*sin(t*0.27));
      HC = vec3(0.0, -0.18, 0.0);

      vec3 col = vec3(0.07,0.012,0.012)*exp(-length(p - vec2(0.0, 0.02))*2.2)*(1.0 + BEAT*0.5);

      // pool of blood below
      vec2 pq = (p - vec2(0.06, -0.44))/vec2(0.34, 0.042);
      float pr = length(pq) + 0.08*sin(atan(pq.y, pq.x)*5.0 + 1.3);
      if (pr < 1.0) {
        col = vec3(0.2,0.0,0.012)*(0.6 + 0.4*smoothstep(1.0, 0.2, pr));
        col += vec3(0.6,0.2,0.18)*smoothstep(0.1, 0.0, abs(pq.y + 0.3 + 0.08*sin(pq.x*3.0)))*smoothstep(0.9, 0.2, abs(pq.x));
      }

      vec3 rd = normalize(vec3(p, F));
      float tt = 2.0; vec2 h = vec2(1.0, 0.0); bool hit = false;
      for (int i=0; i<120; i++){
        h = map(RO + rd*tt);
        if (h.x < 0.001) { hit = true; break; }
        tt += h.x*0.75;
        if (tt > 6.0) break;
      }
      float depth = 99.0;
      if (hit) {
        vec3 pos = RO + rd*tt;
        depth = pos.z;
        vec3 n = normalAt(pos);
        vec3 lp = HR*(pos - HC);
        float gloss;
        vec3 base = material(lp, n, h.y, gloss);
        vec3 L = normalize(vec3(-0.55, 0.65, -0.75));
        vec3 L2 = normalize(vec3(0.85, 0.25, -0.3));
        float diff = max(dot(n, L), 0.0);
        float wrap = clamp(dot(n, L)*0.5 + 0.5, 0.0, 1.0);
        float fill = max(dot(n, L2), 0.0);
        vec3 R = reflect(-L, n);
        float spec = pow(max(dot(R, -rd), 0.0), 60.0);
        float spec2 = pow(max(dot(reflect(-L2, n), -rd), 0.0), 40.0);
        float sheen = pow(max(dot(R, -rd), 0.0), 10.0);
        float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        float ao = clamp(map(pos + n*0.08).x/0.08, 0.0, 1.0);
        vec3 c = base*(0.06 + 0.3*wrap*wrap + 0.9*diff + 0.3*fill)*mix(0.35, 1.0, ao);
        c += vec3(1.0,0.93,0.86)*(spec*1.5 + spec2*0.5 + sheen*0.1)*gloss;
        c += vec3(0.45,0.1,0.08)*fres*0.45;
        c *= 1.0 + BEAT*0.1;
        col = c;
      }

      // drips from the apex
      for (int i=0; i<4; i++){
        float fi = float(i);
        vec3 o = vec3(0.1 + 0.08*fi, -0.88 + 0.06*hash11(fi*3.1), -0.12 + 0.07*fi);
        vec3 w = toWorld(o);
        if (hit && w.z > depth + 0.02) continue;
        vec2 sp = project(w);
        float ph = fract(t*(0.3 + 0.2*hash11(fi*7.7)) + hash11(fi*1.3));
        float hang = smoothstep(0.0, 0.45, ph);
        float fall = max(ph - 0.45, 0.0)/0.55;
        vec2 dp = sp - vec2(0.0, fall*fall*0.6 + hang*0.012);
        if (dp.y > -0.44) {
          vec2 dd = (p - dp)/vec2(0.0055, 0.0055 + 0.016*fall + 0.004*hang);
          if (length(dd) < 1.0) col = vec3(0.55,0.0,0.02) + vec3(0.9,0.5,0.5)*smoothstep(0.6, 0.0, length(dd - vec2(-0.3, 0.3)));
        }
      }
      // spurt from the middle aortic branch on tap
      if (burst < 2.0) {
        vec2 ao = project(toWorld(vec3(0.08, 1.34, 0.2)));
        for (int i=0; i<24; i++){
          float fi = float(i);
          float a = PI*0.5 + (hash11(fi*5.3) - 0.5)*1.1;
          float bt = burst - hash11(fi*2.2)*0.25;
          if (bt < 0.0) continue;
          vec2 pos = ao + vec2(cos(a), sin(a))*(0.4 + 0.45*hash11(fi*9.1))*bt + vec2(0.0, -1.1)*bt*bt;
          if (pos.y < -0.44) continue;
          float d = length((p - pos)*REF);
          col = mix(col, vec3(0.7,0.02,0.04) + vec3(0.6,0.3,0.3)*exp(-d*d*3.0), exp(-d*d*0.6)*clamp(1.6 - bt, 0.0, 1.0));
        }
      }
      return shade(col, pow(clamp(max(col.r, max(col.g, col.b))*1.05, 0.0, 1.0), 0.85));
    }
    `,
  });
})();


/* ── scenes/blackhole.js ── */
/* Black Hole — rays are bent around a Schwarzschild black hole; the accretion disk is lensed
 * over and under the shadow, Doppler-brightened on the approaching side. Drag to orbit; tap for a flare. */
(function () {
  window.AsciiWall.registerScene({
    id: "blackhole",
    name: "Black Hole",
    blurb: "A lensed accretion disk wraps over and under the event horizon, brighter on the side spinning toward you. Drag to orbit and tap for a flare.",
    tags: ["space", "3d", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#030304",
    cell: 5,
    aspect: 1.8,
    glow: 1.15,
    underlay: 0.3,
    edges: 0.35,
    shimmer: 0.04,
    dragToOrbit: true,
    autoOrbit: 0.03,
    orbit: [0.0, 0.0],
    init() { return { flare: 99 }; },
    update(st, api) {
      st.flare += api.dt;
      if (api.clicks.length) st.flare = 0;
      api.data[0] = st.flare < 3 ? Math.exp(-st.flare * 1.5) : 0;
    },
    frag: /* glsl */ `
    vec3 stars(vec3 d){
      vec2 sph = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
      vec2 g = sph*vec2(70.0, 70.0);
      vec2 i = floor(g), f = fract(g) - 0.5;
      float h = hash21(i);
      float s = step(0.965, h)*smoothstep(0.35, 0.0, length(f + (hash22(i) - 0.5)*0.5));
      float band = exp(-pow(d.y*3.0 + 0.4*sin(sph.x*2.0), 2.0))*fbm3(sph*4.0);
      return vec3(0.85,0.88,1.0)*s*(0.4 + 0.6*hash21(i + 3.0)) + vec3(0.12,0.1,0.14)*band*0.3;
    }

    vec4 disk(vec3 hp, vec3 dir, float t, float flare){
      float rr = length(hp.xz);
      float rin = 2.6, rout = 12.0;
      if (rr < rin || rr > rout) return vec4(0.0);
      float ang = atan(hp.z, hp.x) + t*1.6/pow(rr, 1.5);
      vec2 q = rr*vec2(cos(ang), sin(ang));
      float n = fbm(q*0.9 + 3.0);
      float rings = 0.55 + 0.45*sin(rr*7.0 + n*5.0);
      float I = pow(rin/rr, 1.9)*smoothstep(rin, rin + 0.6, rr)*smoothstep(rout, rout - 4.0, rr);
      vec3 v = normalize(vec3(-hp.z, 0.0, hp.x));
      float beam = clamp(1.0 + 0.55*dot(v, -dir), 0.3, 1.8);
      beam *= sqrt(beam);
      vec3 c = mix(vec3(1.0,0.38,0.1), vec3(1.0,0.86,0.66), smoothstep(0.08, 0.7, I*beam));
      float e = I*(0.55 + 1.0*n*rings)*beam*(1.0 + flare*2.5);
      return vec4(c*e*2.2, clamp(e*1.4, 0.0, 0.92));
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      float flare = uData[0].x;
      float yaw = uOrbit.x;
      float pitch = clamp(0.11 + uOrbit.y*0.6, -1.2, 1.2);
      float D = 19.0;
      vec3 ro = vec3(sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))*D;
      vec3 fw = normalize(-ro);
      vec3 rt = normalize(cross(vec3(0.0,1.0,0.0), fw));
      vec3 up = cross(fw, rt);
      vec3 vel = normalize(fw*1.45 + rt*p.x + up*p.y);
      vec3 pos = ro;
      float h2 = dot(cross(pos, vel), cross(pos, vel));
      vec3 col = vec3(0.0); float a = 0.0;
      bool absorbed = false;
      for (int i=0; i<220; i++){
        float r2 = dot(pos, pos);
        float r = sqrt(r2);
        if (r < 1.0) { absorbed = true; break; }
        float dt = clamp(0.09*r, 0.035, 1.6);
        vec3 prev = pos;
        vel += -1.5*h2*pos/(r2*r2*r)*dt;
        pos += vel*dt;
        if (prev.y*pos.y < 0.0) {
          vec3 hp = mix(prev, pos, prev.y/(prev.y - pos.y));
          vec4 d = disk(hp, normalize(vel), t, flare);
          col += (1.0 - a)*d.rgb*d.a; a += (1.0 - a)*d.a;
          if (a > 0.97) break;
        }
        if (r > D*1.6 && dot(pos, vel) > 0.0) break;
      }
      if (!absorbed) col += (1.0 - a)*stars(normalize(vel));
      return shade(col, pow(clamp(luma(col)*1.1, 0.0, 1.0), 0.65));
    }
    `,
  });
})();


/* ── scenes/galaxy.js ── */
/* Spiral Galaxy — a volumetric raymarch through a rotating disk: logarithmic arms, dust lanes,
 * pink star-forming knots, a warm bulge. Drag to orbit; tap to set off a supernova. */
(function () {
  window.AsciiWall.registerScene({
    id: "galaxy",
    name: "Spiral Galaxy",
    blurb: "A slowly turning spiral galaxy in 3D, with blue arms, dark dust lanes, pink nebulae and a golden core. Drag to orbit it, and tap to set off a supernova.",
    tags: ["space", "3d", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#020206",
    cell: 5,
    aspect: 1.8,
    glow: 1.2,
    underlay: 0.25,
    edges: 0.3,
    shimmer: 0.06,
    dragToOrbit: true,
    autoOrbit: 0.025,
    orbit: [0.6, 0.0],
    init() { return { sn: 99, x: 0, y: 0 }; },
    update(st, api) {
      st.sn += api.dt;
      if (api.clicks.length) { st.sn = 0; st.x = api.clicks[0].px; st.y = api.clicks[0].py; }
      api.data[0] = st.x; api.data[1] = st.y; api.data[2] = st.sn;
    },
    frag: /* glsl */ `
    vec3 sky(vec3 d){
      vec2 g = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)))*60.0;
      vec2 i = floor(g);
      float s = step(0.975, hash21(i))*smoothstep(0.45, 0.0, length(fract(g) - 0.5 - (hash22(i) - 0.5)*0.5));
      return vec3(0.8,0.85,1.0)*s*hash21(i + 7.0)*0.8;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      float yaw = uOrbit.x;
      float pitch = clamp(0.62 + uOrbit.y*0.7, -1.45, 1.45);
      float D = 2.75;
      vec3 ro = vec3(sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))*D;
      vec3 fw = normalize(-ro);
      vec3 rt = normalize(cross(vec3(0.0,1.0,0.0), fw));
      vec3 up = cross(fw, rt);
      vec3 rd = normalize(fw*1.25 + rt*p.x + up*p.y);

      vec3 col = sky(rd);
      float H = 0.07;
      // intersect the slab |y| < H, clipped to a sphere of radius 1.35
      float ta = (-H - ro.y)/rd.y, tb = (H - ro.y)/rd.y;
      float t0 = max(min(ta, tb), 0.0), t1 = max(ta, tb);
      float bproj = dot(ro, rd), cc = dot(ro, ro) - 1.35*1.35, disc = bproj*bproj - cc;
      if (disc > 0.0 && t1 > t0) {
        float sq = sqrt(disc);
        t0 = max(t0, -bproj - sq); t1 = min(t1, -bproj + sq);
        if (t1 > t0) {
          const int N = 56;
          float dt = (t1 - t0)/float(N);
          float T = 1.0;
          vec3 acc = vec3(0.0);
          float jitter = hash21(uv*713.0)*dt;
          for (int i=0; i<N; i++){
            vec3 q = ro + rd*(t0 + jitter + dt*float(i));
            float r = length(q.xz);
            float th = atan(q.z, q.x) + t*0.05 + 0.12*t/(r + 0.35);
            float warp = (fbm3(q.xz*4.0 + 2.0) - 0.5)*1.4;
            float phase = th*2.0 - log(r + 0.04)*4.2 + warp;
            float arm = pow(0.5 + 0.5*cos(phase), 6.0);
            float h = 0.011 + 0.016*(1.0 - smoothstep(0.0, 0.8, r));
            float vert = exp(-abs(q.y)/h);
            float disk = exp(-r*1.9)*vert*smoothstep(1.3, 0.85, r);
            vec3 armCol = mix(vec3(1.0,0.82,0.6), vec3(0.55,0.72,1.0), smoothstep(0.15, 0.6, r));
            vec3 e = armCol*disk*(0.06 + 2.6*arm);
            float knots = smoothstep(0.72, 0.86, noise3(q*38.0))*arm*disk;
            e += vec3(1.0,0.32,0.6)*knots*4.0;
            float sparkle = step(0.9985, hash31(floor(q*140.0)))*disk*4.0;
            e += vec3(0.9,0.95,1.0)*sparkle;
            float dust = pow(0.5 + 0.5*cos(phase + 1.1), 10.0)*exp(-r*2.2)*exp(-abs(q.y)/(h*0.45))*smoothstep(0.05, 0.25, r)*fbm3(q.xz*9.0);
            T *= exp(-dust*dt*22.0);
            acc += T*e*dt*7.0;
          }
          col = col*T + (1.0 - exp(-acc*1.3));
        }
      }
      // bulge: glow by the ray's closest approach to the core (+ a little in front of the disk)
      float ca = length(cross(ro, rd));
      col += vec3(1.0,0.78,0.5)*(exp(-ca*10.0)*0.55 + exp(-ca*34.0)*0.6);
      // supernova on tap
      vec3 sn = uData[0].xyz;
      if (sn.z < 4.0) {
        vec2 d = p - sn.xy;
        float a = atan(d.y, d.x);
        float rays = pow(0.5 + 0.5*cos(a*8.0), 12.0)*exp(-length(d)*14.0);
        float core = exp(-length(d)*REF*0.25);
        float life = exp(-sn.z*0.9)*smoothstep(0.0, 0.08, sn.z);
        col += vec3(0.85,0.9,1.0)*(core*2.0 + rays*1.5)*life;
        col += vec3(0.6,0.3,0.8)*exp(-abs(length(d) - sn.z*0.06)*120.0)*life*0.6;
      }
      return shade(col, pow(clamp(luma(col)*1.25, 0.0, 1.0), 0.85));
    }
    `,
  });
})();


/* ── scenes/earth.js ── */
/* Earthrise — a crescent Earth: oceans with sun glint, drifting clouds, city lights on the night side,
 * a thin blue atmosphere. Drag to spin the globe; your cursor moves the sun. */
(function () {
  window.AsciiWall.registerScene({
    id: "earth",
    name: "Earthrise",
    blurb: "A crescent Earth with glinting oceans, drifting clouds and city lights on the night side. Drag to spin it, and move your cursor to move the sun.",
    tags: ["space", "3d", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#020205",
    cell: 5,
    aspect: 1.8,
    glow: 1.0,
    underlay: 0.35,
    edges: 0.4,
    shimmer: 0.04,
    dragToOrbit: true,
    autoOrbit: 0.02,
    orbit: [0.0, 0.0],
    init() { return { sx: 0.95, sy: 0.25 }; },
    update(st, api) {
      const m = api.mouse;
      const tx = m.present ? Math.max(-1.2, Math.min(1.2, (m.px - 0.05) * 2.2)) : 0.95;
      const ty = m.present ? Math.max(-1, Math.min(1, m.py * 2.0)) : 0.25;
      st.sx += (tx - st.sx) * Math.min(1, api.dt * 1.5);
      st.sy += (ty - st.sy) * Math.min(1, api.dt * 1.5);
      api.data[0] = st.sx; api.data[1] = st.sy;
    },
    frag: /* glsl */ `
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      vec2 C = vec2(-0.12*uAspect, -0.02);
      float R = 0.4;
      vec3 L = normalize(vec3(uData[0].x, uData[0].y, -0.45));
      // stars
      vec2 si = floor(uv*uGrid*0.5);
      vec3 col = vec3(0.8,0.85,1.0)*step(0.992, hash21(si))*hash21(si + 4.0)*0.8;
      vec2 q = p - C;
      float d = length(q);
      // atmosphere halo outside the limb
      float limb = d - R;
      if (limb > 0.0) {
        vec3 n0 = normalize(vec3(q, 0.0));
        float sunSide = clamp(dot(n0, L)*0.8 + 0.35, 0.0, 1.0);
        col += vec3(0.25,0.55,1.0)*exp(-limb*55.0)*sunSide*0.9;
      } else {
        vec3 n = vec3(q, -sqrt(R*R - d*d))/R;               // facing the camera (-z)
        mat3 spin = rotX(0.35 + uOrbit.y*0.6)*rotY(uOrbit.x*1.3 + t*0.03);
        vec3 g = spin*n;                                        // globe coords
        float land = fbm3d(g*2.3 + 1.7) + 0.35*noise3(g*7.0);
        bool isLand = land > 0.62;
        float diff = dot(n, L);
        float day = smoothstep(-0.08, 0.2, diff);
        vec3 c;
        if (isLand) {
          float dry = smoothstep(0.55, 0.75, noise3(g*3.1 + 9.0));
          c = mix(vec3(0.16,0.32,0.12), vec3(0.62,0.48,0.3), dry);
          c *= 0.7 + 0.5*noise3(g*25.0);
        } else {
          c = mix(vec3(0.02,0.07,0.22), vec3(0.05,0.18,0.38), smoothstep(0.45, 0.62, land));
        }
        float ice = smoothstep(0.78, 0.86, abs(g.y) + 0.05*noise3(g*9.0));
        c = mix(c, vec3(0.9,0.93,0.97), ice);
        vec3 lit = c*(0.05 + 1.1*max(diff, 0.0));
        // ocean glint
        if (!isLand) {
          vec3 h = normalize(L + vec3(0.0, 0.0, -1.0));
          lit += vec3(1.0,0.92,0.8)*pow(max(dot(n, h), 0.0), 80.0)*1.4*day;
        }
        // clouds (+ their shadows)
        vec3 gc = rotY(t*0.012)*g;
        float cl = smoothstep(0.52, 0.72, fbm3d(gc*3.4 + vec3(0.0, t*0.004, 0.0)));
        lit = mix(lit, vec3(0.95)*(0.06 + 1.0*max(diff, 0.0)), cl*0.92);
        // city lights on the night side
        if (isLand && diff < 0.05) {
          float city = step(0.86, hash31(floor(g*140.0)))*smoothstep(0.45, 0.7, noise3(g*6.0 + 3.0));
          lit += vec3(1.0,0.68,0.32)*city*(1.0 - cl)*smoothstep(0.05, -0.15, diff)*1.3;
        }
        // atmosphere tint at the rim
        float fres = pow(1.0 - (-n.z), 3.0);
        lit += vec3(0.2,0.45,1.0)*fres*smoothstep(-0.3, 0.4, diff)*0.7;
        col = lit;
      }
      // distant moon
      vec2 mq = p - vec2(0.33*uAspect, 0.27);
      if (length(mq) < 0.035) {
        vec3 mn = vec3(mq, -sqrt(max(0.0, 0.035*0.035 - dot(mq, mq))))/0.035;
        col = vec3(0.75,0.74,0.72)*(0.6 + 0.4*noise(mq*300.0))*max(dot(mn, L), 0.02);
      }
      return shade(col, pow(clamp(luma(col)*1.2, 0.0, 1.0), 0.75));
    }
    `,
  });
})();


/* ── scenes/knot.js ── */
/* Torus Knot — an iridescent (2,3) torus knot, raymarched. Drag to turn it; tap to shift its colours. */
(function () {
  window.AsciiWall.registerScene({
    id: "knot",
    name: "Torus Knot",
    blurb: "A slowly turning iridescent trefoil knot with oil-slick colours. Drag to turn it and tap to shift the hue.",
    tags: ["3d", "abstract", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#040306",
    cell: 5,
    aspect: 1.8,
    glow: 1.1,
    underlay: 0.4,
    edges: 0.7,
    shimmer: 0.04,
    dragToOrbit: true,
    autoOrbit: 0.18,
    orbit: [0.4, 0.3],
    init() { return { hue: 0, target: 0 }; },
    update(st, api) {
      if (api.clicks.length) st.target += 0.27;
      st.hue += (st.target - st.hue) * Math.min(1, api.dt * 2);
      api.data[0] = st.hue;
    },
    frag: /* glsl */ `
    float knot(vec3 p){
      float a = atan(p.z, p.x);
      vec2 cs = vec2(length(p.xz) - 0.62, p.y);
      float d = 1e9;
      for (int k=0; k<2; k++){
        float ang = (a + TAU*float(k))*1.5;
        d = min(d, length(cs - 0.25*vec2(cos(ang), sin(ang))) - 0.12);
      }
      return d*0.62;
    }
    mat3 KR;
    float map(vec3 p){ return knot(KR*p); }
    vec3 nrm(vec3 p){
      const vec2 k = vec2(1.0, -1.0); const float e = 0.002;
      return normalize(k.xyy*map(p + k.xyy*e) + k.yyx*map(p + k.yyx*e) + k.yxy*map(p + k.yxy*e) + k.xxx*map(p + k.xxx*e));
    }
    vec3 irid(float x){ return 0.5 + 0.5*cos(TAU*(x + vec3(0.0, 0.33, 0.67))); }
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      KR = rotX(uOrbit.y + 0.2*sin(t*0.3))*rotY(uOrbit.x);
      vec3 ro = vec3(0.0, 0.0, -3.1);
      vec3 rd = normalize(vec3(p, 1.55));
      vec3 col = vec3(0.03,0.02,0.05)*(1.0 - length(p)*0.8);
      col += vec3(0.12,0.05,0.18)*exp(-length(p - vec2(0.0, -0.05))*3.0)*0.5;
      float tt = 0.0; bool hit = false;
      for (int i=0; i<110; i++){
        float d = map(ro + rd*tt);
        if (d < 0.001) { hit = true; break; }
        tt += d;
        if (tt > 6.0) break;
      }
      if (hit) {
        vec3 pos = ro + rd*tt;
        vec3 n = nrm(pos);
        vec3 L = normalize(vec3(-0.5, 0.7, -0.6));
        float fres = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
        float diff = max(dot(n, L), 0.0);
        float spec = pow(max(dot(reflect(-L, n), -rd), 0.0), 50.0);
        vec3 r = reflect(rd, n);
        float env = 0.5 + 0.5*r.y;
        vec3 film = irid(dot(n, -rd)*1.3 + fres*0.6 + uData[0].x + 0.62);
        vec3 c = film*(0.15 + 0.85*diff)*(0.6 + 0.6*env);
        c += vec3(1.0)*spec*1.2 + film*fres*0.5;
        float ao = clamp(map(pos + n*0.12)/0.12, 0.0, 1.0);
        col = c*mix(0.4, 1.0, ao);
      }
      return shade(col, pow(clamp(luma(col)*1.15, 0.0, 1.0), 0.8));
    }
    `,
  });
})();


/* ── scenes/stilllife.js ── */
/* Still Life (chiaroscuro) — fruit, grapes, a gold goblet and a pewter plate on draped linen,
 * in a dark room. Your cursor carries the candle: everything is lit and shadowed from it. */
(function () {
  window.AsciiWall.registerScene({
    id: "stilllife",
    name: "Still Life",
    blurb: "A Renaissance still life of pomegranate, pears, grapes, a gold goblet and a pewter plate on draped linen in a dark room. Your cursor carries the candle that lights it.",
    tags: ["renaissance", "3d", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#050302",
    cell: 4.5,
    aspect: 1.8,
    glow: 0.55,
    underlay: 0.45,
    edges: 0.4,
    shimmer: 0.02,
    init() { return { x: -0.45, y: 0.22, t: 0 }; },
    update(st, api) {
      const m = api.mouse, dt = api.dt;
      st.t += dt;
      const tx = m.present ? m.px : -0.45 + Math.sin(st.t * 0.2) * 0.05;
      const ty = m.present ? m.py : 0.22;
      st.x += (tx - st.x) * Math.min(1, dt * 5);
      st.y += (ty - st.y) * Math.min(1, dt * 5);
      api.data[0] = st.x; api.data[1] = st.y;
      api.data[3] = 0.9 + 0.1 * Math.sin(st.t * 13) * Math.sin(st.t * 7.1);
    },
    frag: /* glsl */ `
    float sdBox3(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
    float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h)-r; }
    float sdCyl(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
    vec2 U(vec2 a, vec2 b){ return a.x < b.x ? a : b; }

    // ids: 1 table, 2 cloth, 3 plate, 4 pomegranate, 5 pear, 6 grapes, 7 goblet, 8 wine, 9 stem/leaf
    vec2 map(vec3 p){
      // table (dark walnut) with the cloth draped over its left side and hanging over the front
      vec2 r = vec2(sdBox3(p - vec3(0.0, -0.5, 0.5), vec3(2.4, 0.5, 1.4)), 1.0);
      float folds = 0.018*sin(p.x*9.0 + sin(p.z*4.0)*2.0) + 0.012*sin(p.x*23.0 + p.z*5.0);
      float clothTop = sdBox3(p - vec3(-0.75, 0.012 + folds*0.5, 0.45), vec3(1.15, 0.012, 1.3)) - 0.006;
      float hang = sdBox3(p - vec3(-0.75 + 0.0, -0.32, -0.9 - 0.03*sin(p.x*10.0) - 0.02*sin(p.x*27.0 + 1.0)), vec3(1.15, 0.33, 0.012));
      r = U(r, vec2(min(clothTop, hang), 2.0));
      // pewter plate
      vec3 pp = p - vec3(0.3, 0.05, 0.15);
      float plate = sdCyl(pp, 0.36, 0.008) - 0.006;
      plate = max(plate, -(sdCyl(pp - vec3(0.0, 0.012, 0.0), 0.26, 0.008)));
      r = U(r, vec2(plate, 3.0));
      // pomegranate with its crown
      vec3 qp = p - vec3(0.36, 0.235, 0.2);
      float pom = length(qp*vec3(1.0, 1.08, 1.0)) - 0.17 + 0.008*sin(atan(qp.z, qp.x)*5.0);
      float crown = sdCap(qp, vec3(0.0, 0.14, 0.0), vec3(0.02, 0.21, 0.0), 0.035);
      crown = max(crown, -sdCap(qp, vec3(0.0, 0.17, 0.0), vec3(0.02, 0.24, 0.0), 0.022));
      r = U(r, vec2(smin(pom, crown, 0.03), 4.0));
      // pears
      for (int i=0; i<2; i++){
        vec3 c = i == 0 ? vec3(-0.28, 0.03, 0.08) : vec3(-0.02, 0.03, 0.38);
        vec3 q = p - c;
        q.xy = mat2(0.96, 0.27*float(1 - 2*i), -0.27*float(1 - 2*i), 0.96)*q.xy;
        float pear = smin(length(q - vec3(0.0, 0.12, 0.0)) - 0.12, length(q - vec3(0.0, 0.27, 0.0)) - 0.07, 0.1);
        r = U(r, vec2(pear, 5.0));
        r = U(r, vec2(sdCap(q, vec3(0.0, 0.33, 0.0), vec3(0.02, 0.4, 0.01), 0.008), 9.0));
      }
      // grapes spilling over the plate edge
      float gd = 1e9;
      for (int i=0; i<16; i++){
        float fi = float(i);
        float row = floor(sqrt(fi*2.0));
        vec3 c = vec3(0.6 + 0.07*sin(fi*2.4)*(1.0 + row*0.3), 0.25 - row*0.055, -0.06 + 0.07*cos(fi*2.4)*(1.0 + row*0.2) - row*0.04);
        gd = min(gd, length(p - c) - 0.045);
      }
      r = U(r, vec2(gd, 6.0));
      r = U(r, vec2(sdCap(p, vec3(0.58, 0.31, -0.02), vec3(0.52, 0.37, 0.05), 0.007), 9.0));
      // gold goblet (revolution): foot, knop, stem, cup
      vec3 gp = p - vec3(0.92, 0.0, 0.5);
      float rr = length(gp.xz);
      vec2 q2 = vec2(rr, gp.y);
      float foot = sdCyl(gp - vec3(0.0, 0.02, 0.0), 0.15 - gp.y*0.6, 0.02) - 0.006;
      float stem = sdCyl(gp - vec3(0.0, 0.18, 0.0), 0.028, 0.16);
      float knop = length(gp - vec3(0.0, 0.2, 0.0)) - 0.05;
      vec3 cp = gp - vec3(0.0, 0.5, 0.0);
      float cupOuter = length(cp*vec3(1.0, 0.85, 1.0)) - 0.17;
      float cup = max(max(cupOuter, -(length(cp*vec3(1.0, 0.85, 1.0)) - 0.158)), cp.y - 0.08);
      cup = max(cup, -(cp.y + 0.2));
      float gob = min(min(foot, stem), min(knop, cup));
      r = U(r, vec2(gob, 7.0));
      // wine surface
      float wine = max(length(cp*vec3(1.0, 0.85, 1.0)) - 0.155, cp.y + 0.01);
      r = U(r, vec2(wine, 8.0));
      // a fallen leaf
      vec3 lq = p - vec3(0.05, 0.04, -0.3);
      float leaf = max(length(lq.xz*vec2(1.0, 2.2)) - 0.09, abs(lq.y + 0.01*lq.x*lq.x*30.0) - 0.004);
      r = U(r, vec2(leaf, 9.0));
      return r;
    }
    vec3 nrm(vec3 p){
      const vec2 k = vec2(1.0, -1.0); const float e = 0.0015;
      return normalize(k.xyy*map(p + k.xyy*e).x + k.yyx*map(p + k.yyx*e).x + k.yxy*map(p + k.yxy*e).x + k.xxx*map(p + k.xxx*e).x);
    }
    float softShadow(vec3 ro, vec3 rd, float maxt){
      float res = 1.0, t = 0.02;
      for (int i=0; i<40; i++){
        float h = map(ro + rd*t).x;
        res = min(res, 10.0*h/t);
        t += clamp(h, 0.01, 0.12);
        if (res < 0.01 || t > maxt) break;
      }
      return clamp(res, 0.0, 1.0);
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
            vec3 ro = vec3(0.15, 0.62, -1.55);
      vec3 ta = vec3(0.28, 0.18, 0.25);
      vec3 fw = normalize(ta - ro), rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
      vec3 rd = normalize(fw*1.5 + rt*p.x + up*p.y);
      // the candle sits where the cursor ray meets a plane just in front of the arrangement
      float flick = uData[0].w;
      vec2 cp2 = uData[0].xy;
      vec3 rdm = normalize(fw*1.5 + rt*cp2.x + up*cp2.y);
      vec3 LP = ro + rdm*((-0.32 - ro.z)/rdm.z);
      LP.y = max(LP.y, 0.12);
      vec3 candle = vec3(1.0, 0.68, 0.36)*flick;

      // dark wall: warm falloff from the candle
      vec3 col = vec3(0.018, 0.012, 0.01) + candle*0.07/(1.0 + dot(p - cp2, p - cp2)*22.0);
      float tt = 0.0; vec2 h = vec2(1.0, 0.0); bool hit = false;
      for (int i=0; i<110; i++){
        h = map(ro + rd*tt);
        if (h.x < 0.0008) { hit = true; break; }
        tt += h.x*0.9;
        if (tt > 7.0) break;
      }
      if (hit) {
        vec3 pos = ro + rd*tt;
        vec3 n = nrm(pos);
        vec3 ld = LP - pos;
        float dist = length(ld); ld /= dist;
        float atten = 2.2/(1.0 + dist*dist*1.6);
        float sh = softShadow(pos + n*0.004, ld, dist);
        float dif = max(dot(n, ld), 0.0);
        vec3 hv = normalize(ld - rd);
        float id = h.y;
        vec3 base; float spec = 0.0, rough = 30.0, metal = 0.0;
        if (id < 1.5) {                                                        // walnut table
          float grain = noise(vec2(pos.x*3.0, pos.z*60.0 + noise(pos.xz*4.0)*6.0));
          base = mix(vec3(0.16,0.08,0.04), vec3(0.3,0.16,0.08), grain); spec = 0.3; rough = 40.0;
        } else if (id < 2.5) {                                                 // linen
          base = vec3(0.82,0.76,0.64)*(0.9 + 0.1*noise(pos.xz*180.0)); spec = 0.05; rough = 8.0;
        } else if (id < 3.5) {                                                 // pewter
          base = vec3(0.45,0.46,0.48)*(0.8 + 0.3*noise(pos.xz*30.0)); spec = 0.9; rough = 25.0; metal = 0.7;
        } else if (id < 4.5) {                                                 // pomegranate
          base = mix(vec3(0.45,0.04,0.04), vec3(0.75,0.18,0.08), noise(pos.xy*30.0 + pos.z*10.0));
          base = mix(base, vec3(0.85,0.55,0.3), smoothstep(0.7, 0.9, noise(pos.xz*60.0))*0.4);
          spec = 0.7; rough = 45.0;
        } else if (id < 5.5) {                                                 // pears
          base = mix(vec3(0.62,0.6,0.18), vec3(0.78,0.68,0.25), noise(pos.xy*12.0));
          base = mix(base, vec3(0.7,0.28,0.12), smoothstep(0.5, 0.9, noise(pos.xz*5.0 + 2.0))*0.6);   // blush
          base *= 1.0 - 0.35*step(0.86, noise(pos.xy*140.0 + pos.z*90.0));                            // freckles
          spec = 0.35; rough = 20.0;
        } else if (id < 6.5) {                                                 // grapes with bloom
          base = vec3(0.16,0.05,0.18); spec = 0.9; rough = 70.0;
          base += vec3(0.15,0.15,0.2)*pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
        } else if (id < 7.5) {                                                 // gold
          base = vec3(0.85,0.6,0.25)*(0.85 + 0.25*noise(pos.xy*40.0)); spec = 1.2; rough = 60.0; metal = 1.0;
        } else if (id < 8.5) {                                                 // wine
          base = vec3(0.25,0.0,0.03); spec = 1.0; rough = 120.0;
        } else {                                                               // stems & leaf
          base = vec3(0.3,0.22,0.08); spec = 0.2;
        }
        vec3 c = base*(metal > 0.5 ? 0.45 : 1.0)*dif*atten*sh*candle;
        c += candle*spec*pow(max(dot(n, hv), 0.0), rough)*atten*sh*(metal > 0.5 ? base*2.0 : vec3(1.0));
        // fake reflection of the candle-lit room on metals
        if (metal > 0.0) {
          vec3 rf = reflect(rd, n);
          c += base*metal*(0.04 + 0.25*pow(max(dot(rf, ld), 0.0), 6.0)*atten);
        }
        c += base*vec3(0.02,0.025,0.035);                                       // cold ambient
        col = c;
      }
      // the candle flame at the light
      vec3 lv = LP - ro;
      vec2 lp2 = vec2(dot(lv, rt), dot(lv, up))/dot(lv, fw)*1.5;
      vec2 fq = p - lp2 - vec2(0.004*sin(t*3.0), 0.02);
      float fl = length(fq*vec2(1.0, 0.4 + 0.06*flick));
      col = mix(col, mix(vec3(1.0,0.5,0.12), vec3(1.0,0.97,0.85), smoothstep(0.022, 0.0, fl)), smoothstep(0.03, 0.02, fl));
      // the candle stick below the flame
      vec2 cq = p - lp2 + vec2(0.0, 0.05);
      if (abs(cq.x) < 0.012 && cq.y < 0.045 && cq.y > -0.06) col = vec3(0.85,0.78,0.62)*(0.5 + 0.6*smoothstep(-0.06, 0.045, cq.y))*flick;
      col += candle*0.3*exp(-length(p - lp2)*16.0);
      // dust in the light
      vec2 dg = (p + vec2(t*0.004, t*0.007))*90.0;
      col += candle*step(0.993, hash21(floor(dg)))*0.4*exp(-length(p - lp2)*5.0);
      return shade(col, pow(clamp(luma(col)*2.3, 0.0, 1.0), 0.7));
    }
    `,
  });
})();


/* ── scenes/armillary.js ── */
/* Armillary Sphere — a Renaissance brass instrument: engraved meridian and horizon rings, a tilted
 * zodiac band, colures and tropics turning around a small globe on a carved stand, lit by a warm window.
 * Drag to orbit; tap to set the rings spinning. */
(function () {
  window.AsciiWall.registerScene({
    id: "armillary",
    name: "Armillary Sphere",
    blurb: "An engraved brass armillary sphere from a Renaissance study, its zodiac band and rings turning around a small globe. Drag to orbit it and tap to set the rings spinning.",
    tags: ["renaissance", "3d", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#060403",
    cell: 4.5,
    aspect: 1.8,
    glow: 0.7,
    underlay: 0.4,
    edges: 0.55,
    shimmer: 0.02,
    dragToOrbit: true,
    autoOrbit: 0.04,
    orbit: [0.5, 0.15],
    init() { return { spin: 0, vel: 0.12 }; },
    update(st, api) {
      if (api.clicks.length) st.vel += 2.4;
      st.vel += (0.12 - st.vel) * Math.min(1, api.dt * 0.6);
      st.spin += st.vel * api.dt;
      api.data[0] = st.spin;
    },
    frag: /* glsl */ `
    float sdCyl(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
    // flat band ring in its local xz plane: radius R, radial thickness th, width w
    float band(vec3 p, float R, float th, float w){ vec2 q = vec2(length(p.xz) - R, p.y); vec2 d = abs(q) - vec2(th, w); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - 0.004; }
    vec2 U(vec2 a, vec2 b){ return a.x < b.x ? a : b; }
    float SPIN;
    const float OBL = 0.4091;   // 23.44 degrees

    // returns (dist, id); id: 1 brass ring, 2 zodiac band, 3 globe, 4 stand (dark wood), 5 axis/pins
    vec2 map(vec3 p){
      vec3 c = p - vec3(0.0, 0.25, 0.0);
      // fixed horizon ring (wide, horizontal) and meridian ring (vertical)
      vec2 r = vec2(band(c, 1.12, 0.012, 0.07), 1.0);
      r = U(r, vec2(band(c.yxz, 1.02, 0.03, 0.022), 1.0));
      // rotating celestial cage, tilted around the polar axis (tipped 35 degrees toward the viewer's right)
      vec3 q = rotZ(-0.6)*c;                          // polar axis tilt
      q = rotY(SPIN)*q;
      r = U(r, vec2(band(q, 0.92, 0.02, 0.016), 1.0));                         // equator
      r = U(r, vec2(band(q.yxz, 0.92, 0.02, 0.014), 1.0));                     // equinoctial colure
      r = U(r, vec2(band(q.zyx.yxz, 0.92, 0.02, 0.014), 1.0));                 // solstitial colure
      r = U(r, vec2(band(q - vec3(0.0, 0.92*sin(OBL), 0.0), 0.92*cos(OBL), 0.012, 0.01), 1.0));   // tropics
      r = U(r, vec2(band(q + vec3(0.0, 0.92*sin(OBL), 0.0), 0.92*cos(OBL), 0.012, 0.01), 1.0));
      r = U(r, vec2(band(q - vec3(0.0, 0.92*cos(OBL), 0.0), 0.92*sin(OBL), 0.012, 0.01), 1.0));   // polar circles
      r = U(r, vec2(band(q + vec3(0.0, 0.92*cos(OBL), 0.0), 0.92*sin(OBL), 0.012, 0.01), 1.0));
      vec3 z = rotX(OBL)*q;
      z = rotY(SPIN*0.6)*z;
      r = U(r, vec2(band(z, 0.93, 0.014, 0.075), 2.0));                        // zodiac band
      // polar axis rod with finials, small globe at the centre
      r = U(r, vec2(sdCyl(q, 0.012, 1.22), 5.0));
      r = U(r, vec2(length(q - vec3(0.0, 1.24, 0.0)) - 0.035, 5.0));
      r = U(r, vec2(length(q + vec3(0.0, 1.24, 0.0)) - 0.035, 5.0));
      r = U(r, vec2(length(q) - 0.2, 3.0));
      // stand: arms holding the horizon ring, turned column, round foot
      vec3 s = p;
      float stand = sdCyl(s - vec3(0.0, -1.2, 0.0), 0.42 - 0.12*smoothstep(-1.25, -1.1, s.y), 0.06) - 0.01;
      float col = sdCyl(s - vec3(0.0, -0.95, 0.0), 0.06 + 0.03*sin(s.y*24.0) + 0.04*smoothstep(-0.75, -1.1, s.y), 0.25);
      stand = min(stand, col);
      for (int i=0; i<4; i++){
        float a = float(i)*1.5708 + 0.785;
        vec3 ap = s - vec3(cos(a)*0.55, -0.55, sin(a)*0.55);
        vec3 dir = normalize(vec3(cos(a)*0.55, 0.85, sin(a)*0.55));
        float h = clamp(dot(ap + vec3(cos(a)*0.55, 0.3, sin(a)*0.55)*0.0, dir), -0.62, 0.48);
        stand = min(stand, length(ap - dir*h) - 0.025);
      }
      r = U(r, vec2(stand, 4.0));
      return r;
    }
    vec3 nrm(vec3 p){
      const vec2 k = vec2(1.0, -1.0); const float e = 0.0012;
      return normalize(k.xyy*map(p + k.xyy*e).x + k.yyx*map(p + k.yyx*e).x + k.yxy*map(p + k.yxy*e).x + k.xxx*map(p + k.xxx*e).x);
    }
    float shadow(vec3 ro, vec3 rd){
      float res = 1.0, t = 0.02;
      for (int i=0; i<28; i++){
        float h = map(ro + rd*t).x;
        res = min(res, 12.0*h/t);
        t += clamp(h, 0.015, 0.2);
        if (res < 0.02 || t > 4.0) break;
      }
      return clamp(res, 0.0, 1.0);
    }
    // warm study as an environment for the reflections
    vec3 env(vec3 d){
      vec3 c = mix(vec3(0.03,0.02,0.015), vec3(0.12,0.07,0.04), smoothstep(-0.3, 0.6, d.y));
      c += vec3(1.0,0.78,0.5)*pow(max(dot(d, normalize(vec3(-0.6, 0.55, -0.4))), 0.0), 12.0)*1.6;  // window
      return c;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      SPIN = uData[0].x;
      float yaw = uOrbit.x, pitch = clamp(0.15 + uOrbit.y*0.6, -0.9, 1.1);
      vec3 ro = vec3(sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))*5.6 + vec3(0.0, 0.05, 0.0);
      vec3 ta = vec3(0.0, -0.1, 0.0);
      vec3 fw = normalize(ta - ro), rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
      vec3 rd = normalize(fw*1.55 + rt*p.x + up*p.y);
      vec3 L = normalize(vec3(-0.6, 0.55, -0.4));

      // background: dark panelled wall with a shaft of window light and dust
      vec3 col = mix(vec3(0.02,0.012,0.008), vec3(0.06,0.035,0.02), smoothstep(-0.5, 0.5, p.y + p.x*0.4));
      float shaft = smoothstep(0.18, 0.0, abs(p.x*0.8 + p.y*0.6 + 0.15))*0.12;
      col += vec3(1.0,0.75,0.45)*shaft;
      vec2 dg = (p + vec2(t*0.003, t*0.006))*80.0;
      col += vec3(1.0,0.8,0.5)*step(0.992, hash21(floor(dg)))*shaft*4.0;

      float tt = 0.0; vec2 h = vec2(1.0, 0.0); bool hit = false;
      for (int i=0; i<120; i++){
        h = map(ro + rd*tt);
        if (h.x < 0.0008) { hit = true; break; }
        tt += h.x*0.9;
        if (tt > 9.0) break;
      }
      if (hit) {
        vec3 pos = ro + rd*tt;
        vec3 n = nrm(pos);
        float dif = max(dot(n, L), 0.0);
        float sh = shadow(pos + n*0.004, L);
        vec3 rf = reflect(rd, n);
        float fres = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
        float id = h.y;
        vec3 c;
        if (id < 2.5) {
          // brass: engraved degree ticks around each ring, numerals as dashes, patina in the grooves
          vec3 q = rotY(SPIN)*(rotZ(-0.6)*(pos - vec3(0.0, 0.25, 0.0)));
          float ang = atan(pos.z, pos.x) + atan(q.y, q.x)*0.5;
          float ticks = smoothstep(0.85, 1.0, abs(sin(ang*90.0)))*0.5 + smoothstep(0.96, 1.0, abs(sin(ang*18.0)));
          vec3 brass = vec3(0.86, 0.62, 0.28);
          if (id > 1.5) {
            brass = vec3(0.92, 0.72, 0.34);
            // zodiac band: twelve panels with stylised sign marks
            vec3 z = rotY(SPIN*0.6)*(rotX(OBL)*q);
            float za = atan(z.z, z.x);
            float panel = fract(za/TAU*12.0);
            float div = smoothstep(0.03, 0.0, min(panel, 1.0 - panel));
            float sign_ = step(0.55, noise(vec2(floor(za/TAU*12.0)*7.0 + panel*6.0, z.y*40.0)))*step(abs(z.y), 0.045)*step(0.15, panel)*step(panel, 0.85);
            ticks = max(ticks*0.6, max(div, sign_*0.8));
          }
          brass *= 1.0 - ticks*0.55;
          brass = mix(brass, vec3(0.25,0.32,0.22), smoothstep(0.65, 0.85, noise(pos.xy*30.0 + pos.z*20.0))*0.35);  // verdigris
          c = brass*(0.15 + 0.85*dif*sh) + brass*env(rf)*0.9 + vec3(1.0,0.9,0.7)*pow(max(dot(rf, L), 0.0), 40.0)*sh*1.4;
        } else if (id < 3.5) {
          // small globe: parchment seas, inked continents
          vec3 g = rotY(SPIN)*(rotZ(-0.6)*(pos - vec3(0.0, 0.25, 0.0)));
          float land = smoothstep(0.55, 0.6, fbm3d(g*6.0 + 2.0));
          vec3 paper = mix(vec3(0.78,0.68,0.48), vec3(0.42,0.5,0.32), land);
          float grid = smoothstep(0.96, 1.0, abs(sin(atan(g.z, g.x)*6.0))) + smoothstep(0.96, 1.0, abs(sin(asin(clamp(g.y/0.2, -1.0, 1.0))*6.0)));
          paper *= 1.0 - grid*0.35;
          c = paper*(0.15 + 0.85*dif*sh) + vec3(1.0)*pow(max(dot(rf, L), 0.0), 20.0)*0.3*sh;
        } else if (id < 4.5) {
          float grain = noise(vec2(pos.y*80.0, atan(pos.z, pos.x)*6.0));
          vec3 wood = mix(vec3(0.12,0.05,0.025), vec3(0.24,0.11,0.05), grain);
          c = wood*(0.15 + 0.85*dif*sh) + env(rf)*0.25*fres + vec3(1.0,0.8,0.6)*pow(max(dot(rf, L), 0.0), 30.0)*0.4*sh;
        } else {
          c = vec3(0.7,0.55,0.3)*(0.2 + 0.8*dif*sh) + env(rf)*0.6;
        }
        col = c;
      }
      return shade(col*1.25, pow(clamp(luma(col)*2.4, 0.0, 1.0), 0.7));
    }
    `,
  });
})();


/* ── scenes/florence.js ── */
/* Florence — golden hour over the city: Brunelleschi's ribbed octagonal dome and lantern, the drum and
 * tribunes, Giotto's polychrome bell tower, the nave, terracotta rooftops, the Arno with its bridges,
 * hazy Tuscan hills with cypresses. Your cursor moves the sun; swallows follow you; tap to ring the bells. */
(function () {
  const NB = 18;
  window.AsciiWall.registerScene({
    id: "florence",
    name: "Florence",
    blurb: "Florence at golden hour: Brunelleschi's dome, Giotto's bell tower, terracotta rooftops and the Arno, with Tuscan hills behind. Move your cursor to move the sun. Swallows follow you, and a tap rings the bells.",
    tags: ["renaissance", "3d", "city", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#0a0604",
    cell: 4.5,
    aspect: 1.8,
    glow: 0.7,
    underlay: 0.5,
    edges: 0.55,
    shimmer: 0.02,
    init() {
      return {
        birds: Array.from({ length: NB }, () => ({ x: (Math.random() - 0.5) * 0.6, y: 0.2 + Math.random() * 0.2, vx: 0, vy: 0, ph: Math.random() * 6, seed: Math.random() * 10 })),
        az: 2.45, el: 0.14, t: 0, bell: 99,
      };
    },
    update(st, api) {
      const dt = Math.min(api.dt, 0.05), m = api.mouse, D = api.data;
      st.t += dt; st.bell += dt;
      if (api.clicks.length) st.bell = 0;
      const taz = m.present ? 2.1 + (m.px / api.aspect + 0.5) * 1.9 : 2.45;
      const tel = m.present ? 0.03 + (m.py + 0.5) * 0.4 : 0.14;
      st.az += (taz - st.az) * Math.min(1, dt * 1.2);
      st.el += (tel - st.el) * Math.min(1, dt * 1.2);
      st.birds.forEach((b, i) => {
        // circle the lantern, or loop around the cursor
        const cx = m.present ? m.px : 0.02, cy = m.present ? m.py : 0.27;
        const R = 0.08 + 0.1 * ((i * 0.37) % 1);
        const a = st.t * (0.6 + 0.25 * ((i * 0.61) % 1)) * (i % 2 ? 1 : -1) + b.seed;
        let ax = (cx + Math.cos(a) * R * 1.6 - b.x) * 2.2, ay = (cy + Math.sin(a) * R - b.y) * 2.2;
        if (st.bell < 0.1) { const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy) + 0.01; b.vx += dx / d * 0.8; b.vy += dy / d * 0.8; }
        b.vx = (b.vx + ax * dt) * Math.exp(-dt * 1.3); b.vy = (b.vy + ay * dt) * Math.exp(-dt * 1.3);
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.ph += dt * (9 + Math.hypot(b.vx, b.vy) * 20);
        D[i * 4] = b.x; D[i * 4 + 1] = b.y; D[i * 4 + 2] = Math.atan2(b.vy, b.vx); D[i * 4 + 3] = b.ph;
      });
      D[80] = st.az; D[81] = st.el; D[82] = st.bell; D[83] = m.px * m.on;
    },
    frag: /* glsl */ `
    float sdBox3(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
    float oct(vec2 q){ q = abs(q); return max(max(q.x, q.y), (q.x + q.y)*0.70710678); }
    vec2 U(vec2 a, vec2 b){ return a.x < b.x ? a : b; }
    vec3 SUN;

    // ids: 1 dome tiles, 2 white marble, 3 polychrome marble, 4 city walls, 5 roof tiles, 6 ground, 7 water, 8 bridge stone
    vec2 map(vec3 p){
      vec2 r = vec2(p.y, 6.0);
      // the Arno across the foreground
      if (abs(p.z + 1.75) < 0.28) r = vec2(p.y + 0.04, 7.0);
      // bridges (Ponte Vecchio-ish with shops on top)
      for (int i=0; i<2; i++){
        float bx = i == 0 ? -0.9 : 1.3;
        vec3 q = p - vec3(bx, 0.0, -1.75);
        float deck = sdBox3(q - vec3(0.0, 0.07, 0.0), vec3(0.11, 0.035, 0.32));
        float arches = length(vec2(q.z - (fract(q.z*3.0/1.0 + 0.5) - 0.5)/3.0*0.0, 0.0));
        float arch = length(vec2(fract(q.z*1.6 + 0.5) - 0.5, q.y*1.6)) - 0.22;
        deck = max(deck, -arch);
        if (i == 0) deck = min(deck, sdBox3(q - vec3(0.0, 0.14, 0.0), vec3(0.1, 0.05, 0.28)));
        r = U(r, vec2(deck, 8.0));
      }
      // cathedral complex
      vec3 c = p;
      float drum = max(oct(c.xz) - 0.45, abs(c.y - 0.5) - 0.12);
      float base = max(oct(c.xz) - 0.5, c.y - 0.38);
      // ribbed pointed dome
      float y0 = 0.62, H = 0.58;
      float u = clamp((c.y - y0)/H, 0.0, 1.0);
      float rr = 0.46*pow(1.0 - u, 0.55)*(1.0 - 0.18*u);
      float o = oct(c.xz);
      float dome = max((o - rr)*0.6, y0 - c.y);
      dome = max(dome, c.y - y0 - H);
      float lantern = max(oct(c.xz) - 0.065, abs(c.y - (y0 + H + 0.05)) - 0.07);
      lantern = min(lantern, max(length(c.xz) - 0.05*(1.0 - (c.y - y0 - H - 0.12)/0.14), abs(c.y - (y0 + H + 0.19)) - 0.07));
      lantern = min(lantern, length(c - vec3(0.0, y0 + H + 0.28, 0.0)) - 0.018);
      r = U(r, vec2(dome, 1.0));
      r = U(r, vec2(min(drum, lantern), 2.0));
      r = U(r, vec2(base, 3.0));
      // tribunes (apses) with small half domes
      for (int i=0; i<3; i++){
        vec2 ap = i == 0 ? vec2(0.62, 0.0) : (i == 1 ? vec2(0.0, 0.62) : vec2(0.0, -0.62));
        vec3 q = c - vec3(ap.x, 0.0, ap.y);
        float trib = max(oct(q.xz) - 0.22, c.y - 0.3);
        trib = min(trib, max(length(q - vec3(0.0, 0.3, 0.0)) - 0.2, 0.3 - c.y));
        r = U(r, vec2(trib, 3.0));
      }
      // nave toward the facade (west, -x) with a gabled roof
      vec3 nq = c - vec3(-1.15, 0.0, 0.0);
      float nave = sdBox3(nq - vec3(0.0, 0.25, 0.0), vec3(0.75, 0.25, 0.24));
      float roof = max(sdBox3(nq - vec3(0.0, 0.5, 0.0), vec3(0.75, 0.12, 0.25)), (nq.y - 0.5) + abs(nq.z)*0.55 - 0.1);
      r = U(r, vec2(nave, 3.0));
      r = U(r, vec2(roof, 5.0));
      // Giotto's campanile
      vec3 tq = c - vec3(-1.75, 0.0, -0.5);
      float tower = sdBox3(tq - vec3(0.0, 0.85, 0.0), vec3(0.09, 0.85, 0.09));
      tower = min(tower, sdBox3(tq - vec3(0.0, 1.72, 0.0), vec3(0.105, 0.025, 0.105)));
      r = U(r, vec2(tower, 3.0));
      // the city: a grid of houses with pitched roofs
      vec2 cs = vec2(0.24);
      vec2 id = floor(p.xz/cs);
      vec2 lc = p.xz - (id + 0.5)*cs;
      vec2 hh = hash22(id);
      vec2 wc = (id + 0.5)*cs;
      bool keep = !(abs(wc.x + 0.6) < 1.35 && abs(wc.y) < 0.82) && abs(wc.y + 1.75) > 0.38 && length(wc) < 4.2 + 2.0*hash11(floor(atan(wc.y, wc.x)*6.0)) && wc.y > -2.2;
      if (keep && hh.x > 0.08) {
        float hgt = 0.1 + 0.22*hh.y*hh.y;
        vec3 hp = vec3(lc.x, p.y, lc.y);
        vec2 half_ = vec2(0.1 - 0.02*hh.x, 0.1 - 0.015*fract(hh.y*7.0));
        float house = sdBox3(hp - vec3(0.0, hgt*0.5, 0.0), vec3(half_.x, hgt*0.5, half_.y));
        bool alongX = fract(hh.x*13.0) > 0.5;
        float slope = alongX ? abs(hp.z) : abs(hp.x);
        float rf = max(sdBox3(hp - vec3(0.0, hgt + 0.035, 0.0), vec3(half_.x + 0.01, 0.035, half_.y + 0.01)), (hp.y - hgt) + slope*0.5 - 0.05);
        r = U(r, vec2(house, 4.0));
        r = U(r, vec2(rf, 5.0));
      }
      // conservative step inside the repeated grid
      r.x = min(r.x, max(0.02, 0.5*cs.x - max(abs(lc.x), abs(lc.y)) + 0.01) + (keep ? 0.0 : 0.05));
      return r;
    }
    vec3 nrm(vec3 p){
      const vec2 k = vec2(1.0, -1.0); const float e = 0.0015;
      return normalize(k.xyy*map(p + k.xyy*e).x + k.yyx*map(p + k.yyx*e).x + k.yxy*map(p + k.yxy*e).x + k.xxx*map(p + k.xxx*e).x);
    }
    float shadow(vec3 ro, vec3 rd){
      float res = 1.0, t = 0.02;
      for (int i=0; i<32; i++){
        float h = map(ro + rd*t).x;
        res = min(res, 10.0*h/t);
        t += clamp(h, 0.02, 0.25);
        if (res < 0.02 || t > 5.0) break;
      }
      return clamp(res, 0.0, 1.0);
    }
    vec3 sky(vec3 d){
      float sd = max(dot(d, SUN), 0.0);
      float lowSun = smoothstep(0.4, 0.0, SUN.y);
      vec3 c = mix(vec3(0.95,0.62,0.35), vec3(0.32,0.42,0.62), smoothstep(-0.02, 0.45, d.y));
      c = mix(c, mix(c, vec3(0.9,0.42,0.25), 0.6), lowSun*smoothstep(0.3, 0.0, d.y));
      c += vec3(1.0,0.75,0.45)*pow(sd, 8.0)*0.6 + vec3(1.0,0.9,0.7)*pow(sd, 400.0)*2.0;
      // clouds lit from below by the low sun
      vec2 cp = d.xz/(d.y + 0.15)*1.2 + vec2(uTime*0.01, 0.0);
      float cl = smoothstep(0.5, 0.75, fbm(cp*1.5))*smoothstep(0.02, 0.2, d.y);
      c = mix(c, mix(vec3(0.95,0.55,0.4), vec3(1.0,0.85,0.7), pow(sd, 3.0)), cl*0.7);
      return c;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      float az = uData[20].x, el = uData[20].y, bell = uData[20].z, look = uData[20].w;
      SUN = normalize(vec3(sin(az), el, cos(az)));
      vec3 ro = vec3(0.9 + look*0.1, 1.45, -4.7);
      vec3 ta = vec3(-0.35, 0.72, 0.4);
      vec3 fw = normalize(ta - ro), rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
      vec3 rd = normalize(fw*1.55 + rt*p.x + up*p.y);
      vec3 sunCol = mix(vec3(1.0,0.55,0.3), vec3(1.0,0.86,0.66), smoothstep(0.0, 0.35, SUN.y))*2.0;

      vec3 col = sky(rd);
      // distant hills with cypresses just above the horizon
      float az2 = atan(rd.x, rd.z);
      float hz = 0.012 + 0.06*fbm3(vec2(az2*5.0, 3.0)) + 0.01*noise(vec2(az2*40.0, 0.0));
      if (rd.y < hz) {
        vec3 hill = mix(vec3(0.2,0.24,0.17), vec3(0.42,0.4,0.33), smoothstep(hz - 0.05, hz, rd.y));
        hill *= 0.85 + 0.25*noise(vec2(az2*200.0, rd.y*300.0));
        float ci = floor(az2*120.0);
        float cyp = step(0.72, hash11(ci))*step(rd.y, hz + 0.018*hash11(ci + 3.0))*step(abs(fract(az2*120.0) - 0.5), 0.2*(1.0 - (rd.y - hz + 0.02)/0.04));
        hill = mix(hill, vec3(0.1,0.13,0.08), cyp);
        col = mix(hill, sky(vec3(rd.x, 0.02, rd.z)), 0.35);
      }
      // far fields where the ray leaves the march range (analytic ground)
      if (rd.y < 0.0) {
        float gt = -ro.y/rd.y;
        vec2 gp = ro.xz + rd.xz*gt;
        float fld = noise(floor(gp*2.0)*1.7);
        vec3 fields = mix(vec3(0.3,0.34,0.16), vec3(0.5,0.44,0.22), fld)*(0.8 + 0.3*noise(gp*20.0));
        fields *= mix(vec3(0.5,0.55,0.65), vec3(1.0,0.9,0.75), clamp(SUN.y*3.0, 0.0, 1.0));
        col = mix(fields, sky(vec3(rd.x, 0.03, rd.z))*0.9, (1.0 - exp(-max(gt - 3.0, 0.0)*0.09))*0.8);
      }

      float tt = 0.0; vec2 h = vec2(1.0, 0.0); bool hit = false;
      for (int i=0; i<140; i++){
        h = map(ro + rd*tt);
        if (h.x < 0.0008*tt) { hit = true; break; }
        tt += h.x*0.85;
        if (tt > 12.0) break;
      }
      if (hit && rd.y < 0.3) {
        vec3 pos = ro + rd*tt;
        vec3 n = nrm(pos);
        float dif = max(dot(n, SUN), 0.0);
        float sh = dif > 0.0 ? shadow(pos + n*0.004, SUN) : 0.0;
        float id = h.y;
        vec3 base;
        float spec = 0.0;
        if (id < 1.5) {
          // dome: terracotta tiles with white marble ribs at the corners and a lantern ring
          float a = atan(pos.z, pos.x);
          float rib = smoothstep(0.035, 0.02, abs(fract((a - 0.3927)/0.7854 + 0.5) - 0.5));
          float rows = smoothstep(0.75, 1.0, abs(sin(pos.y*190.0)));
          base = mix(vec3(0.72,0.3,0.15), vec3(0.6,0.24,0.12), noise(pos.xz*60.0 + pos.y*20.0));
          base *= 1.0 - rows*0.25;
          base = mix(base, vec3(0.92,0.88,0.8), rib);
          base = mix(base, vec3(0.92,0.88,0.8), smoothstep(0.012, 0.0, abs(pos.y - 0.66)));
          spec = 0.2;
        } else if (id < 2.5) {
          // drum: white with green panels and round windows
          float a = atan(pos.z, pos.x);
          float face = fract(a/0.7854 + 0.5);
          base = vec3(0.9,0.86,0.78);
          base = mix(base, vec3(0.2,0.35,0.28), step(abs(face - 0.5), 0.4)*step(abs(pos.y - 0.5), 0.09)*0.6);
          base = mix(base, vec3(0.08,0.06,0.05), smoothstep(0.035, 0.03, length(vec2((face - 0.5)*0.35, pos.y - 0.5))));
        } else if (id < 3.5) {
          // polychrome marble: white with green and pink panel lines
          vec2 g = vec2(pos.x + pos.z, pos.y)*vec2(14.0, 20.0);
          float lines = smoothstep(0.9, 1.0, abs(sin(g.x)))*0.5 + smoothstep(0.92, 1.0, abs(sin(g.y)));
          base = mix(vec3(0.92,0.88,0.82), vec3(0.22,0.38,0.3), clamp(lines, 0.0, 1.0)*0.7);
          base = mix(base, vec3(0.85,0.55,0.5), step(0.6, noise(floor(g)*0.5))*0.35);
        } else if (id < 4.5) {
          // stucco walls (ochre / cream / rose), shuttered windows
          float hv = hash21(floor(pos.xz/0.24));
          base = hv < 0.3 ? vec3(0.9,0.76,0.5) : hv < 0.55 ? vec3(0.93,0.86,0.7) : hv < 0.8 ? vec3(0.86,0.6,0.45) : vec3(0.8,0.72,0.55);
          vec2 w = vec2((abs(n.x) > 0.5 ? pos.z : pos.x)*28.0, pos.y*30.0);
          float win = step(0.62, fract(w.x))*step(fract(w.x), 0.88)*step(0.35, fract(w.y))*step(fract(w.y), 0.8)*step(0.04, pos.y);
          base = mix(base, mix(vec3(0.12,0.2,0.14), vec3(0.06,0.05,0.04), step(0.5, hash21(floor(w)))), win);
          base *= 0.85 + 0.2*noise(pos.xy*50.0);
        } else if (id < 5.5) {
          // roof tiles
          float rows = smoothstep(0.6, 1.0, abs(sin((pos.x + pos.z)*180.0)));
          base = mix(vec3(0.66,0.3,0.16), vec3(0.5,0.22,0.12), noise(pos.xz*25.0))*(1.0 - rows*0.25);
        } else if (id < 6.5) {
          float fld = noise(floor(pos.xz*2.5)*1.7);
          base = mix(vec3(0.32,0.36,0.16), vec3(0.5,0.45,0.22), fld);
          float olive = step(0.55, noise(pos.xz*30.0))*step(0.4, fld);
          base = mix(base, vec3(0.16,0.22,0.12), olive*0.8);
          if (length(pos.xz) < 4.5) base = vec3(0.45,0.4,0.3)*(0.8 + 0.3*noise(pos.xz*8.0));
        } else if (id < 7.5) {
          // the river reflects the sky
          vec3 rf = reflect(rd, vec3(0.0, 1.0, 0.0) + vec3(0.03*sin(pos.x*40.0 + t), 0.0, 0.02*sin(pos.z*60.0 - t*1.3)));
          base = mix(vec3(0.12,0.16,0.12), sky(rf), 0.65);
          dif = 1.0; sh = 1.0;
        } else {
          base = vec3(0.7,0.6,0.45)*(0.8 + 0.3*noise(pos.xy*40.0));
        }
        vec3 amb = mix(vec3(0.18,0.2,0.28), vec3(0.3,0.24,0.2), n.y*0.5 + 0.5);
        vec3 c = id > 6.5 && id < 7.5 ? base : base*(amb*0.6 + sunCol*dif*sh);
        c += sunCol*spec*pow(max(dot(reflect(-SUN, n), -rd), 0.0), 20.0)*sh;
        // aerial perspective
        float fog = (1.0 - exp(-max(tt - 3.0, 0.0)*0.09))*0.8;
        col = mix(c, sky(vec3(rd.x, 0.03, rd.z))*0.9, fog);
      }

      // swallows
      for (int i=0; i<18; i++){
        vec4 b = uData[i];
        vec2 dir = vec2(cos(b.z), sin(b.z));
        vec2 per = vec2(-dir.y, dir.x);
        float flap = 0.5 + 0.5*sin(b.w);
        float s = 0.012;
        vec2 tipA = b.xy + per*s - dir*s*(0.3 + 0.5*flap) + vec2(0.0, s*0.4*flap);
        vec2 tipB = b.xy - per*s - dir*s*(0.3 + 0.5*flap) + vec2(0.0, s*0.4*flap);
        float d = min(sdSeg(p, b.xy, tipA), sdSeg(p, b.xy, tipB));
        d = min(d, sdSeg(p, b.xy, b.xy - dir*s*0.9));
        col = mix(col, vec3(0.06,0.05,0.06), smoothstep(0.0028, 0.0012, d));
      }
      // bells: a warm pulse of light from the tower
      if (bell < 3.0) col += vec3(1.0,0.8,0.5)*0.12*exp(-bell*1.2)*(0.5 + 0.5*sin(bell*18.0));
      col = pow(col, vec3(1.25))*1.15;
      float dsky = (hit && rd.y < 0.3) ? 1.0 : 0.5;
      return shade(col, pow(clamp(luma(col)*1.2, 0.0, 1.0), 0.9)*dsky);
    }
    `,
  });
})();


/* ── scenes/butterflies.js ── */
/* Butterflies — pink butterflies trailing glitter. They follow your cursor; touch one and it
 * shatters into sparkles, then gathers itself back together. */
(function () {
  const N = 5;
  window.AsciiWall.registerScene({
    id: "butterflies",
    name: "Butterflies",
    blurb: "Pink butterflies trailing glitter in the dark. They follow your cursor, and if you tap one it bursts into sparkles and then pieces itself back together.",
    tags: ["dreamy", "interactive"],
    style: "glyph",
    ramp: "sparkle",
    bg: "#050307",
    cell: 5,
    aspect: 1.7,
    glow: 0.9,
    underlay: 0.35,
    edges: 0.3,
    shimmer: 0.12,
    init(api) {
      const A = api.aspect;
      return {
        bs: Array.from({ length: N }, (_, i) => ({
          x: (Math.random() - 0.5) * A * 0.8, y: (Math.random() - 0.5) * 0.7, vx: 0, vy: 0, h: 0,
          ph: Math.random() * 6, size: 0.11 + Math.random() * 0.06, hue: i % 3, burst: 99, seed: Math.random() * 100,
        })),
        t: 0,
      };
    },
    update(st, api) {
      const dt = Math.min(api.dt, 0.05), A = api.aspect, m = api.mouse, D = api.data;
      st.t += dt;
      st.bs.forEach((b, i) => {
        for (const c of api.clicks) if (Math.hypot(c.px - b.x, c.py - b.y) < b.size * 1.6 && b.burst > 3) b.burst = 0;
        b.burst += dt;
        let ax = Math.sin(st.t * 0.5 + b.seed) * 0.15 + Math.sin(st.t * 1.3 + b.seed * 2) * 0.08;
        let ay = Math.cos(st.t * 0.45 + b.seed * 3) * 0.12;
        if (m.present) {
          const tx = m.px + Math.cos(st.t * 0.6 + i * 1.26) * 0.3, ty = m.py + Math.sin(st.t * 0.5 + i * 1.26) * 0.2;
          ax += (tx - b.x) * 0.9 * m.on; ay += (ty - b.y) * 0.9 * m.on;
        }
        for (const o of st.bs) {
          if (o === b) continue;
          const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) + 1e-4, r = (b.size + o.size) * 1.3;
          if (d < r) { ax += (dx / d) * (1 - d / r) * 2.5; ay += (dy / d) * (1 - d / r) * 2.5; }
        }
        const lim = A / 2 - 0.08;
        if (b.x > lim) ax -= 0.6; if (b.x < -lim) ax += 0.6; if (b.y > 0.4) ay -= 0.6; if (b.y < -0.4) ay += 0.6;
        b.vx = (b.vx + ax * dt) * Math.exp(-dt * 1.2); b.vy = (b.vy + ay * dt) * Math.exp(-dt * 1.2);
        b.x += b.vx * dt; b.y += b.vy * dt;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 0.005) {
          const target = Math.atan2(b.vy, b.vx) - Math.PI / 2;           // body points along the flight
          const diff = Math.atan2(Math.sin(target - b.h), Math.cos(target - b.h));
          b.h += diff * Math.min(1, dt * 3);
        }
        b.ph += dt * (7 + sp * 30);
        D[i * 4] = b.x; D[i * 4 + 1] = b.y; D[i * 4 + 2] = b.size; D[i * 4 + 3] = b.ph;
        D[32 + i * 4] = b.h; D[33 + i * 4] = b.hue; D[34 + i * 4] = b.burst; D[35 + i * 4] = b.seed;
        D[64 + i * 4] = b.vx; D[65 + i * 4] = b.vy;
      });
    },
    frag: /* glsl */ `
    // wing silhouette in polar form around the body root; returns radius ratio (<1 inside)
    float wing(vec2 q, out float ang){
      ang = atan(q.y, q.x);
      float rr;
      if (ang > 0.0) rr = 1.08*pow(sin(clamp(ang*1.9 + 0.12, 0.0, PI)), 0.55)*(1.0 + 0.12*sin(ang*9.0)*smoothstep(0.4, 1.2, ang));
      else           rr = 0.74*pow(sin(clamp(-ang*2.1 + 0.15, 0.0, PI)), 0.6)*(1.0 + 0.25*smoothstep(-0.9, -1.3, ang));
      return length(q)/max(rr, 1e-3);
    }
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      vec3 col = vec3(0.02,0.01,0.025);
      col += vec3(0.25,0.08,0.18)*smoothstep(0.62, 0.9, fbm3(p*2.5 + t*0.02))*0.25;     // pink haze
      for (int i=0; i<5; i++){
        vec4 B = uData[i]; vec4 K = uData[8+i]; vec2 V = uData[16+i].xy;
        float burst = K.z;
        float sz = B.z;
        // glitter trail
        for (int k=0; k<10; k++){
          float fk = float(k);
          vec2 tp = B.xy - V*fk*0.35 + 0.03*vec2(hash11(fk + K.w) - 0.5, hash11(fk*2.0 + K.w) - 0.5)*fk*0.3;
          tp.y -= fk*0.004;
          float tw = 0.5 + 0.5*sin(t*9.0 + fk*2.3 + K.w);
          float dd = length((p - tp)*REF);
          col += vec3(1.0,0.85,0.95)*exp(-dd*dd*2.5)*tw*(1.0 - fk/10.0)*0.9;
        }
        if (burst < 3.0) {
          // shattered: sparkles fly out then gather back
          float out_ = burst < 1.2 ? burst/1.2 : max(0.0, 1.0 - (burst - 1.2)/1.8);
          for (int k=0; k<26; k++){
            float fk = float(k);
            vec2 h = vec2(hash11(fk*3.1 + K.w), hash11(fk*7.7 + K.w)) - 0.5;
            vec2 sp = B.xy + h*sz*1.6 + normalize(h + 1e-3)*out_*0.22*(0.5 + hash11(fk));
            float dd = length((p - sp)*REF);
            col += mix(vec3(1.0,0.5,0.75), vec3(1.0), hash11(fk))*exp(-dd*dd*1.5)*(0.6 + 0.4*sin(t*12.0 + fk));
          }
          if (burst < 1.8) continue;
        }
        vec2 q = rot(-K.x)*(p - B.xy)/sz;
        float flap = abs(cos(B.w));
        float ws = 0.2 + 0.8*flap;
        float side = sign(q.x);
        vec2 wq = vec2(abs(q.x)/ws, q.y);
        float ang;
        float w = wing(wq, ang);
        float form = burst < 3.0 ? smoothstep(1.8, 3.0, burst) : 1.0;
        if (w < form) {
          vec3 pink = K.y < 0.5 ? vec3(1.0,0.42,0.7) : (K.y < 1.5 ? vec3(0.92,0.5,0.95) : vec3(1.0,0.55,0.5));
          vec3 c = mix(vec3(0.45,0.06,0.3), pink*1.15, smoothstep(0.05, 0.55, w));
          c = mix(c, vec3(1.0,0.9,0.96), smoothstep(0.62, 0.86, w));
          float vein = smoothstep(0.1, 0.0, abs(sin(ang*7.0 + w*0.8)))*smoothstep(0.12, 0.3, w)*step(w, 0.9);
          c = mix(c, vec3(0.15,0.02,0.1), vein*0.75);
          c = mix(c, vec3(0.12,0.02,0.08), smoothstep(0.9, 0.96, w));                         // black rim
          float spots = smoothstep(0.35, 0.0, abs(fract(ang*5.0) - 0.5))*smoothstep(0.92, 0.97, w);
          c = mix(c, vec3(1.0), spots);                                                         // white rim spots
          vec2 eye = wq - vec2(0.55, 0.42);
          float er = length(eye);
          if (er < 0.13) c = er < 0.06 ? vec3(0.1,0.02,0.08) : vec3(1.0,0.92,0.6);              // eyespot
          c *= 0.7 + 0.4*flap;
          col = c;
        }
        // body + antennae
        if (length(q/vec2(0.06, 0.32)) < 1.0) col = vec3(0.2,0.08,0.15);
        if (q.y > 0.25 && q.y < 0.6 && abs(abs(q.x) - (q.y - 0.25)*0.5) < 0.02) col = vec3(0.35,0.15,0.25);
      }
      return shade(col);
    }
    `,
  });
})();


/* ── scenes/clouds.js ── */
/* Cloudscape — towering moonlit cumulus drawn as halftone squares. Your cursor parts the clouds;
 * tap for lightning inside them. */
(function () {
  window.AsciiWall.registerScene({
    id: "clouds",
    name: "Cloudscape",
    blurb: "Towering moonlit clouds drift past, printed as halftone squares. Your cursor parts them, and a tap sets off lightning inside.",
    tags: ["sky", "calm", "interactive"],
    style: "halftone",
    ramp: " .",
    bg: "#050508",
    cell: 6,
    aspect: 1.0,
    glow: 0.25,
    underlay: 0.0,
    shimmer: 0.04,
    init() { return { bolt: 99, x: 0, y: 0 }; },
    update(st, api) {
      st.bolt += api.dt;
      if (api.clicks.length) { st.bolt = 0; st.x = api.clicks[0].px; st.y = api.clicks[0].py; }
      api.data[0] = st.x; api.data[1] = st.y; api.data[2] = st.bolt;
    },
    frag: /* glsl */ `
    float cloud(vec2 q, float y, float L){
      float b = fbm(q) + 0.55*fbm(q*2.3 + 7.0);
      float thr = 0.98 + y*0.95 - L*0.04;
      return b - thr;
    }
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      vec2 dm = p - uMouseP;
      float push = uMouseOn*exp(-dot(dm, dm)/0.03);
      vec2 pw = p + dm*push*0.9;
      vec3 bolt = uData[0].xyz;
      float flash = bolt.z < 1.2 ? exp(-bolt.z*4.0)*(0.6 + 0.4*sin(bolt.z*60.0)) : 0.0;

      vec3 col = mix(vec3(0.0), vec3(0.03,0.035,0.05), smoothstep(0.5, -0.5, p.y));
      // moon glow behind the clouds
      vec2 mp = p - vec2(0.32*uAspect, 0.3);
      col += vec3(0.5,0.52,0.55)*exp(-length(mp)*7.0)*0.6;
      if (length(mp) < 0.045) col = vec3(0.95);

      for (int i=0; i<3; i++){
        float L = float(i);
        float s = 1.25 + L*0.55;
        vec2 q = pw*vec2(s, s*1.35) + vec2(t*0.018*(1.0 + L*0.7) + L*13.0, L*4.0);
        float y = pw.y + 0.18 - L*0.16;
        float d = cloud(q, y, L);
        if (d > -0.05) {
          float a = smoothstep(-0.05, 0.12, d);
          // light from above-right: compare with the density a little toward the light
          float dl = cloud(q + vec2(0.05, 0.09), y + 0.06, L);
          float lit = clamp(0.62 + (d - dl)*2.6, 0.12, 1.0);
          lit *= 0.7 + 0.3*smoothstep(0.0, 0.5, d);
          vec3 c = vec3(lit)*(0.62 + 0.14*L);
          // lightning lights the clouds near the strike from inside
          c += vec3(0.75,0.8,1.0)*flash*exp(-length(p - bolt.xy)*4.0)*(0.6 + d);
          col = mix(col, c, a);
        }
      }
      // the bolt itself
      if (flash > 0.02) {
        float x = bolt.x + (noise(vec2(p.y*12.0, floor(bolt.z*20.0)))-0.5)*0.08 + (noise(vec2(p.y*40.0, 3.0))-0.5)*0.02;
        if (p.y < bolt.y && abs(p.x - x) < 0.004 + 0.004*flash) col = vec3(1.0)*flash*1.5;
      }
      return shade(col);
    }
    `,
  });
})();


/* ── scenes/torii.js ── */
/* Torii Path — seen from above: a path of vermilion gates climbing an autumn hill from the shore.
 * Maple leaves swirl around your cursor; tap the sea for ripples, tap the hill for a gust. */
(function () {
  window.AsciiWall.registerScene({
    id: "torii",
    name: "Torii Path",
    blurb: "From above, a path of red gates climbs an autumn hillside from the sea. Maple leaves swirl around your cursor, and tapping the water sends out ripples.",
    tags: ["japan", "nature", "interactive"],
    style: "glyph",
    ramp: "torii",
    bg: "#060805",
    cell: 6,
    aspect: 1.7,
    glow: 0.45,
    underlay: 0.45,
    edges: 1.1,
    shimmer: 0.05,
    ripple: { damp: 0.975, strength: 1.0, radius: 0.025, drop: 2.0 },
    init() { return { gust: 99 }; },
    update(st, api) {
      st.gust += api.dt;
      if (api.clicks.length) st.gust = 0;
      api.data[0] = st.gust;
    },
    frag: /* glsl */ `
    float shoreY(float x){ return -0.27 + 0.04*sin(x*5.0 + 1.0) + 0.03*fbm3(vec2(x*4.0, 2.0)); }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      vec2 PA = vec2(-0.12*A, -0.33), PB = vec2(0.16*A, 0.62);
      vec2 dir = normalize(PB - PA), perp = vec2(-dir.y, dir.x);
      float along = dot(p - PA, dir);
      float side = dot(p - PA, perp) - 0.025*sin(along*5.0);
      float sy = shoreY(p.x);
      float cloudShadow = smoothstep(0.35, 0.75, fbm3(p*2.2 + vec2(t*0.015, t*0.008)));
      vec3 col;

      if (p.y < sy) {
        // sea: teal with foam bands rolling in
        vec2 g = rippleGrad(uv);
        float depth = sy - p.y;
        vec3 sea = mix(vec3(0.15,0.55,0.6), vec3(0.04,0.22,0.3), smoothstep(0.0, 0.25, depth));
        float band = sin(depth*55.0 + t*1.4 + fbm3(p*6.0)*4.0);
        float foam = smoothstep(0.7, 0.95, band)*smoothstep(0.22, 0.0, depth) + smoothstep(0.02, 0.0, depth);
        foam *= 0.6 + 0.4*noise(p*vec2(30.0, 60.0) + t);
        sea += vec3(0.4,0.5,0.5)*clamp((g.x + g.y)*4.0, -0.1, 0.6);
        col = mix(sea, vec3(0.92,0.95,0.92), clamp(foam, 0.0, 1.0));
        // rocks
        for (int i=0; i<7; i++){
          float fi = float(i);
          vec2 rc = vec2((hash11(fi*3.7) - 0.5)*A*0.95, shoreY((hash11(fi*3.7) - 0.5)*A*0.95) - 0.03 - 0.1*hash11(fi*1.3));
          float rr = 0.012 + 0.015*hash11(fi*9.1);
          if (length((p - rc)*vec2(1.0, 1.4)) < rr) col = vec3(0.18,0.13,0.1)*(0.7 + 0.5*noise(p*200.0));
        }
      } else {
        // grass: vertical brush strokes, warm autumn patches
        float strokes = noise(vec2(p.x*260.0, p.y*24.0 + noise(p*8.0)*3.0));
        vec3 grass = mix(vec3(0.24,0.36,0.08), vec3(0.42,0.52,0.12), strokes);
        grass = mix(grass, vec3(0.55,0.45,0.1), smoothstep(0.55, 0.8, fbm3(p*3.0 + 5.0))*0.6);
        // dark soil lip along the shore
        float lip = smoothstep(0.03, 0.0, p.y - sy);
        grass = mix(grass, vec3(0.16,0.1,0.06)*(0.7 + 0.6*noise(p*120.0)), lip);
        col = grass;
        // stone path
        if (abs(side) < 0.05 && along > -0.05) {
          vec2 sq = vec2(along*70.0, side*90.0);
          float stone = smoothstep(0.08, 0.2, abs(fract(sq.x + 0.5*floor(sq.y)) - 0.5));
          col = mix(vec3(0.25,0.2,0.15), vec3(0.42,0.36,0.28), stone)*(0.75 + 0.4*noise(p*150.0));
        }
        // autumn trees (top-down blobs), kept off the path
        vec2 gc = p/0.075;
        vec2 gi = floor(gc);
        for (int j=-1; j<=1; j++) for (int k=-1; k<=1; k++){
          vec2 ci = gi + vec2(float(j), float(k));
          vec2 h = hash22(ci);
          if (h.x < 0.64) continue;
          vec2 c = (ci + 0.5 + (h - 0.5)*0.7)*0.075;
          if (c.y < shoreY(c.x) + 0.04) continue;
          float cside = dot(c - PA, perp) - 0.025*sin(dot(c - PA, dir)*5.0);
          if (abs(cside) < 0.15) continue;
          float r = 0.03 + 0.03*h.y;
          vec2 q = p - c;
          float ang = atan(q.y, q.x);
          float rr = r*(1.0 + 0.18*noise(vec2(ang*3.0, h.x*10.0)) + 0.08*sin(ang*7.0 + h.y*9.0));
          // shadow
          if (length(q - vec2(-0.012, -0.016)) < rr) col *= 0.55;
          if (length(q) < rr) {
            float kind = hash21(ci + 3.0);
            vec3 leaf = kind < 0.3 ? vec3(0.95,0.72,0.12) : kind < 0.55 ? vec3(0.88,0.32,0.08) : kind < 0.72 ? vec3(0.7,0.12,0.08) : vec3(0.1,0.28,0.12);
            float shade = 0.65 + 0.45*dot(normalize(q + 1e-4), vec2(-0.6, 0.7))*smoothstep(0.0, rr, length(q));
            float clump = 0.75 + 0.45*noise(q*170.0 + h*50.0);
            col = leaf*shade*clump;
          }
        }
        // gates
        for (int i=0; i<13; i++){
          float s = 0.02 + float(i)*0.078;
          vec2 c = PA + dir*s + perp*0.025*sin(s*5.0);
          float u = dot(p - c, dir)/1.45, v = dot(p - c, perp)/1.45;
          vec2 sh = vec2(u + 0.012, v + 0.014);
          if (abs(sh.x) < 0.011 && abs(sh.y) < 0.06) col *= 0.6;          // shadow
          vec3 red = vec3(0.92,0.15,0.06);
          if (abs(u + 0.009) < 0.0045 && abs(v) < 0.05) col = red*0.8;     // nuki (lower beam)
          if (length(vec2(u + 0.004, abs(v) - 0.041)) < 0.0075) col = vec3(0.1,0.03,0.02);  // posts
          if (abs(u - 0.004) < 0.0065 && abs(v) < 0.062 - 0.006*abs(u)) col = red;           // kasagi (top beam)
          if (abs(u - 0.0095) < 0.0022 && abs(v) < 0.064) col = vec3(0.08,0.06,0.06);        // black cap
        }
        // stone lanterns
        for (int i=0; i<8; i++){
          float s = 0.05 + float(i)*0.12;
          for (int k=-1; k<=1; k+=2){
            vec2 c = PA + dir*s + perp*(float(k)*0.11 + 0.025*sin(s*5.0));
            float d = length(p - c);
            if (d < 0.012) col = vec3(0.62,0.6,0.55)*(d < 0.005 ? 1.3 : 0.8);
          }
        }
        col *= 1.0 - cloudShadow*0.35;
      }
      // maple leaves swirling around the cursor
      float gust = uData[0].x;
      for (int i=0; i<34; i++){
        float fi = float(i);
        vec2 base = vec2(hash11(fi*1.7), hash11(fi*4.3));
        vec2 lp = (fract(base + vec2(t*0.012, -t*0.02)*(0.5 + hash11(fi))) - 0.5)*vec2(A, 1.0)*1.05;
        lp += 0.02*vec2(sin(t*0.9 + fi), cos(t*0.7 + fi*2.0));
        vec2 dm = lp - uMouseP;
        float sw = uMouseOn*exp(-dot(dm, dm)/0.03);
        lp = uMouseP + rot(sw*2.2 + sw*t*0.5)*dm*(1.0 - sw*0.35);
        if (gust < 2.0) lp += normalize(lp + 1e-3)*gust*0.25*exp(-gust);
        vec2 q = rot(t*1.3 + fi)*(p - lp);
        float leaf = length(q*vec2(1.0, 1.8));
        if (leaf < 0.0085 + 0.004*hash11(fi*2.0)) col = mix(vec3(0.95,0.25,0.06), vec3(1.0,0.75,0.15), hash11(fi*5.5));
      }
      return shade(col);
    }
    `,
  });
})();


/* ── scenes/koi.js ── */
/* Koi Pond — detailed koi (kohaku, sanke, showa, ogon, asagi, tancho, chagoi, kujaku) with scales,
 * translucent rayed fins, whiskers, caustic light and shadows, over a pebble floor with weeds;
 * lily pads, lotus and petals on the surface.
 * Hover: koi come to look. Tap: drop food, they race for it. Fast swipe: they bolt. */
(function () {
  const AW = window.AsciiWall;
  const N = 8, SEGS = 10, MAXFOOD = 8, MAXB = 0.2;

  AW.registerScene({
    id: "koi",
    name: "Koi Pond",
    blurb: "Eight kinds of koi glide over a pebble floor beneath lily pads and lotus. They come to look at your cursor. Tap to drop food and they'll race for it; swipe fast and they bolt.",
    tags: ["water", "calm", "interactive"],
    style: "glyph",
    ramp: "koi",
    bg: "#04110f",
    cell: 5,
    aspect: 1.6,
    ss: 2,
    glow: 0.4,
    underlay: 0.5,
    edges: 0.45,
    shimmer: 0.03,
    trailDecay: 0.97,
    ripple: { damp: 0.978, strength: 0.7, radius: 0.016, drop: 1.6 },

    init(api) {
      const A = api.aspect;
      const pals = [0, 1, 2, 3, 4, 5, 6, 7];
      const fish = pals.map((pal) => {
        const size = 0.25 + Math.random() * 0.15;
        const x = (Math.random() - 0.5) * A * 0.75, y = (Math.random() - 0.5) * 0.7;
        const ang = Math.random() * Math.PI * 2;
        const spine = Array.from({ length: SEGS }, (_, k) => ({ x: x - (Math.cos(ang) * size * k) / 9, y: y - (Math.sin(ang) * size * k) / 9 }));
        return { x, y, ang, spd: 0.05, size, pal, seed: Math.random(), depth: Math.random() * 0.6, spine, phase: Math.random() * 6, boost: 0, fx: 0, fy: 0 };
      });
      fish.sort((a, b) => b.depth - a.depth); // deepest drawn first
      return { fish, food: [], t: Math.random() * 100 };
    },

    update(st, api) {
      const dt = Math.min(api.dt, 0.05), A = api.aspect, m = api.mouse, D = api.data, eng = api.engine;
      st.t += dt;
      // tap: drop a few pellets
      for (const c of api.clicks) {
        for (let k = 0; k < 4 && st.food.length < MAXFOOD; k++) {
          st.food.push({ x: c.px + (Math.random() - 0.5) * 0.05, y: c.py + (Math.random() - 0.5) * 0.05, life: 1, vx: (Math.random() - 0.5) * 0.02, vy: (Math.random() - 0.5) * 0.02, bob: Math.random() * 6 });
        }
      }
      for (const p of st.food) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.99; p.vy *= 0.99; p.life -= dt / 40; p.bob += dt; }
      st.food = st.food.filter((p) => p.life > 0);

      // a fast swipe near the fish startles them
      const scare = m.present && m.speed > 1.6;

      st.fish.forEach((f) => {
        let sx = Math.cos(f.ang), sy = Math.sin(f.ang);
        const wa = f.ang + Math.sin(st.t * 0.37 + f.seed * 10) * 1.2 + Math.sin(st.t * 0.11 + f.seed * 31) * 0.8;
        sx += Math.cos(wa) * 0.7; sy += Math.sin(wa) * 0.7;
        const mx = A / 2 - 0.12, my = 0.5 - 0.12;
        if (f.x > mx) sx -= (f.x - mx) * 14; if (f.x < -mx) sx += (-mx - f.x) * 14;
        if (f.y > my) sy -= (f.y - my) * 14; if (f.y < -my) sy += (-my - f.y) * 14;
        for (const g of st.fish) {
          if (g === f) continue;
          const dx = f.x - g.x, dy = f.y - g.y, d = Math.hypot(dx, dy) + 1e-4;
          const r = (f.size + g.size) * 0.42;
          if (d < r) { sx += (dx / d) * (1 - d / r) * 2.0; sy += (dy / d) * (1 - d / r) * 2.0; }
        }
        let curious = 0, hungry = 0;
        // food: head for the nearest pellet, eat it on contact
        let best = null, bd = 0.8;
        for (const p of st.food) { const d = Math.hypot(p.x - f.x, p.y - f.y); if (d < bd) { bd = d; best = p; } }
        if (best) {
          const dx = best.x - f.x, dy = best.y - f.y, d = bd + 1e-4;
          sx += (dx / d) * 3.5; sy += (dy / d) * 3.5; hungry = 1;
          if (d < f.size * 0.09) {
            best.life = 0;
            if (eng && eng.dropQueue) eng.dropQueue.push({ x: best.x / A + 0.5, y: best.y + 0.5 });
          }
        } else if (m.present) {
          const dx = m.px - f.x, dy = m.py - f.y, d = Math.hypot(dx, dy) + 1e-4;
          if (d < 0.55 && d > 0.07) { const w = (1 - d / 0.55) * 2.0 * m.on; sx += (dx / d) * w; sy += (dy / d) * w; curious = 1 - d / 0.55; }
          else if (d <= 0.07) { sx -= (dx / d) * 1.2; sy -= (dy / d) * 1.2; curious = 1; }
        }
        if (scare) {
          const d = Math.hypot(f.x - m.px, f.y - m.py);
          if (d < 0.3) { f.boost = Math.max(f.boost, 1 - d / 0.4); f.fx = m.px; f.fy = m.py; }
        }
        if (f.boost > 0.01) {
          const dx = f.x - f.fx, dy = f.y - f.fy, d = Math.hypot(dx, dy) + 1e-4;
          sx += (dx / d) * 6 * f.boost; sy += (dy / d) * 6 * f.boost;
        }
        const desired = Math.atan2(sy, sx);
        let diff = desired - f.ang;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const maxTurn = (1.0 + f.boost * 2.2 + hungry * 0.8) * dt;
        f.ang += Math.max(-maxTurn, Math.min(maxTurn, diff));
        const target = 0.05 + 0.02 * Math.sin(st.t * 0.5 + f.seed * 7) + f.boost * 0.45 + hungry * 0.06 - curious * 0.025;
        f.spd += (target - f.spd) * Math.min(1, dt * 2.5);
        f.boost *= Math.exp(-dt * 1.6);
        f.x += Math.cos(f.ang) * f.spd * dt;
        f.y += Math.sin(f.ang) * f.spd * dt;
        f.phase += dt * (2.2 + f.spd * 45);
        const s = f.spine;
        s[0].x = f.x; s[0].y = f.y;
        const seg = f.size / 9;
        // follow-the-leader with a bend limit at every joint, so the body can curve but never fold
        // back through itself (9 joints x MAXB keeps the whole fish under ~a U-turn).
        let prevA = f.ang + Math.PI;                    // direction from the head back toward the tail
        for (let k = 1; k < SEGS; k++) {
          let a = Math.atan2(s[k].y - s[k - 1].y, s[k].x - s[k - 1].x);
          const d = Math.atan2(Math.sin(a - prevA), Math.cos(a - prevA));
          a = prevA + Math.max(-MAXB, Math.min(MAXB, d));
          s[k].x = s[k - 1].x + Math.cos(a) * seg;
          s[k].y = s[k - 1].y + Math.sin(a) * seg;
          prevA = a;
        }
      });
      // upload: shallowest drawn last; the displayed spine gets a travelling swim wave
      st.fish.forEach((f, i) => {
        const s = f.spine, base = i * 24;
        for (let k = 0; k < SEGS; k++) {
          const a = s[Math.max(0, k - 1)], b = s[Math.min(SEGS - 1, k + 1)];
          const tx = a.x - b.x, ty = a.y - b.y, tl = Math.hypot(tx, ty) + 1e-6;
          const amp = f.size * 0.026 * Math.pow(k / 9, 1.6) + f.size * 0.004;
          const w = Math.sin(f.phase - k * 0.55) * amp;
          D[base + k * 2] = s[k].x + (-ty / tl) * w;
          D[base + k * 2 + 1] = s[k].y + (tx / tl) * w;
        }
        D[base + 20] = f.size; D[base + 21] = f.pal; D[base + 22] = f.seed; D[base + 23] = f.depth;
      });
      for (let k = 0; k < MAXFOOD; k++) {
        const p = st.food[k], o = 192 + k * 4;
        D[o] = p ? p.x : 0; D[o + 1] = p ? p.y : 0; D[o + 2] = p ? Math.min(1, p.life * 4) : 0; D[o + 3] = p ? p.bob : 0;
      }
    },

    frag: /* glsl */ `
    vec2 sp(int f, int i){ vec4 v = uData[f*6 + i/2]; return (i%2==0) ? v.xy : v.zw; }

    float bodyW(float t){
      float head = sqrt(clamp(t/0.13, 0.0, 1.0));
      float tail = 1.0 - 0.74*smoothstep(0.34, 0.98, t);
      return head*tail*0.16;
    }

    float caustic(vec2 p, float t){
      vec2 i = p; float c = 1.0; float inten = 0.005;
      for (int n=0; n<4; n++){
        float tt = t*(1.0 - (3.5/float(n+1)));
        i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0/length(vec2(p.x/(sin(i.x + tt)/inten), p.y/(cos(i.y + tt)/inten)));
      }
      c /= 4.0;
      c = clamp(1.17 - pow(c, 1.4), 0.0, 1.0);
      return pow(c, 7.0);
    }

    vec3 WHITE = vec3(0.96,0.94,0.89), RED = vec3(0.9,0.2,0.07), ORANGE = vec3(1.0,0.52,0.12),
         BLACK = vec3(0.04,0.04,0.06), GOLD = vec3(1.0,0.76,0.28), BLUE = vec3(0.42,0.55,0.68), BRONZE = vec3(0.55,0.36,0.2);

    // pattern in body coords: t along (0 snout..1 tail), v across (-1..1), seed
    vec3 koiColor(int pal, float t, float v, float seed, out float metal, out float retic){
      metal = 0.0; retic = 0.0;
      float n  = noise(vec2(t*5.5 + seed*13.0, v*1.3 + seed*7.0));
      float n2 = noise(vec2(t*9.0 - seed*5.0, v*2.2 + 3.0));
      float n3 = noise(vec2(t*16.0 + seed*3.0, v*3.5 - seed));
      if (pal == 0) return mix(WHITE, RED, smoothstep(0.47, 0.53, n + 0.15*smoothstep(0.25, 0.0, t)));                      // kohaku
      if (pal == 1) { vec3 c = mix(WHITE, RED, smoothstep(0.48, 0.54, n)); return mix(c, BLACK, smoothstep(0.7, 0.74, n3)*step(0.18, t)); } // sanke
      if (pal == 2) { vec3 c = mix(BLACK, RED, smoothstep(0.5, 0.56, n)); return mix(c, WHITE, smoothstep(0.58, 0.64, n2)); }          // showa
      if (pal == 3) { metal = 1.0; return mix(GOLD, vec3(1.0,0.92,0.62), n*0.6); }                                          // ogon
      if (pal == 4) { retic = 1.0; vec3 c = mix(BLUE, BLUE*0.75, n2); return mix(c, ORANGE, smoothstep(0.62, 0.9, abs(v)) + smoothstep(0.1, 0.0, t)*0.0); } // asagi
      if (pal == 5) return mix(WHITE, RED, 1.0 - smoothstep(0.075, 0.095, length(vec2((t - 0.11)*1.2, v*0.13))));          // tancho
      if (pal == 6) { retic = 1.0; metal = 0.4; return mix(BRONZE, BRONZE*1.3, n); }                                       // chagoi
      metal = 0.8; retic = 0.6; return mix(vec3(0.9,0.9,0.92), ORANGE, smoothstep(0.5, 0.58, n));                           // kujaku
    }

    vec3 finTint(int pal){
      if (pal == 3) return vec3(1.0,0.85,0.5);
      if (pal == 4 || pal == 6) return vec3(1.0,0.6,0.3);
      if (pal == 2) return vec3(0.35,0.3,0.35);
      return vec3(0.95,0.92,0.9);
    }

    // composite one koi over 'col'. 'shadow' accumulates the floor shadow.
    void koi(int f, vec2 p, inout vec3 col, inout float dens, inout float shadow, float caus){
      vec4 info = uData[f*6+5];
      float size = info.x;
      if (size <= 0.0) return;
      vec2 head = sp(f, 0), mid = sp(f, 5);
      // shadow on the floor (offset down-right)
      vec2 ps = p - vec2(0.022, -0.03)*(1.0 + info.w);
      if (length(ps - mid) < size*0.9) {
        for (int i=0; i<10; i+=2){ float t = float(i)/9.0; shadow = max(shadow, 1.0 - smoothstep(0.0, bodyW(t)*size*1.7, length(ps - sp(f,i)))); }
      }
      if (length(p - mid) > size*0.95) return;
      int pal = int(info.y + 0.5);
      float seed = info.z;
      vec3 ftint = finTint(pal);
      float aa = 1.2/uGrid.y;

      // closest point on the spine
      float best = 1e9, bt = 0.0, bv = 0.0; vec2 bperp = vec2(0.0), bdir = vec2(1.0, 0.0);
      for (int i=0; i<9; i++){
        vec2 a = sp(f,i), b = sp(f,i+1);
        vec2 ba = b - a; float L = max(length(ba), 1e-5);
        float h = clamp(dot(p - a, ba)/(L*L), 0.0, 1.0);
        vec2 q = a + ba*h;
        float t = (float(i) + h)/9.0;
        float w = bodyW(t)*size;
        vec2 dir = ba/L;
        float dd = length(p - q) - w;
        if (dd < best) { best = dd; bt = t; bperp = vec2(-dir.y, dir.x); bdir = dir; bv = dot(p - q, bperp)/max(w, 1e-4); }
      }

      // ── tail fin (translucent, flowing, forked, rayed)
      vec2 e = sp(f,9), e0 = sp(f,7);
      vec2 d = normalize(e - e0);
      d = rot(sin(uTime*2.6 + seed*20.0)*0.22)*d;
      vec2 tv = p - e;
      float ta = dot(tv, d), tb = dot(tv, vec2(-d.y, d.x));
      float L = size*0.27;
      tb += sin(ta/size*16.0 - uTime*4.5 - seed*9.0)*ta*0.22;
      float hw = ta*0.95 + size*0.02;
      float edge = L*(0.66 + 0.4*smoothstep(0.0, 1.0, abs(tb)/(L*0.85)));
      float tail = step(-0.005*size, ta)*smoothstep(hw + aa, hw - aa, abs(tb))*smoothstep(edge + aa, edge - aa, ta);
      if (tail > 0.0) {
        float ang = atan(tb, ta + size*0.05);
        float rays = smoothstep(0.75, 1.0, abs(sin(ang*13.0)));
        float rim = smoothstep(edge*0.8, edge, ta);
        vec3 fc = mix(ftint, ftint*0.55, rays*0.5) + rim*0.15;
        float a = tail*(0.62 - 0.25*ta/L);
        col = mix(col, fc*(0.85 + caus*0.4), a);
        dens = mix(dens, 0.45, a);
      }

      // ── pectoral fins (fans that row slowly)
      vec2 h0 = sp(f,0), h1 = sp(f,1), h2 = sp(f,2);
      vec2 hd = normalize(h0 - h2);
      vec2 hp = vec2(-hd.y, hd.x);
      for (int s=-1; s<=1; s+=2){
        float fs = float(s);
        float flap = 0.95 + 0.35*sin(uTime*2.2 + seed*7.0 + fs*0.8);
        vec2 root = sp(f,2) + hp*fs*bodyW(0.22)*size*0.75;
        vec2 fd = normalize(hp*fs*cos(flap) - hd*sin(flap));
        vec2 lq = p - root;
        vec2 l2 = vec2(dot(lq, fd), dot(lq, vec2(-fd.y, fd.x)));
        float FL = size*0.17;
        float shape = length(vec2(l2.x, l2.y*1.5))/FL;
        float inside = step(0.0, l2.x)*smoothstep(1.0 + aa/FL, 1.0 - aa/FL, shape)*step(abs(l2.y), l2.x*0.75 + FL*0.12);
        if (inside > 0.0) {
          float ang = atan(l2.y, l2.x);
          float rays = smoothstep(0.7, 1.0, abs(sin(ang*16.0)));
          vec3 fc = mix(ftint, ftint*0.6, rays*0.5) + smoothstep(0.75, 1.0, shape)*0.12;
          float a = inside*0.6;
          col = mix(col, fc*(0.85 + caus*0.4), a);
          dens = mix(dens, 0.45, a);
        }
      }

      // ── body
      if (best < aa) {
        float cover = smoothstep(aa, -aa, best);
        float metal, retic;
        vec3 c = koiColor(pal, bt, bv, seed, metal, retic);
        // scales: staggered rows of crescents
        float sc = size*0.022;
        vec2 su = vec2(bt*size/sc, bv*bodyW(bt)*size/sc);
        su.x += 0.5*mod(floor(su.y), 2.0);
        vec2 sf = fract(su) - vec2(0.3, 0.5);
        float scale = smoothstep(0.42, 0.5, length(sf))*step(0.12, bt);
        c *= 1.0 - scale*(0.08 + retic*0.3);
        if (retic > 0.0) c = mix(c, c*1.25 + 0.05, (1.0 - scale)*retic*0.3*(1.0 - smoothstep(0.5, 0.9, abs(bv))));
        // dorsal fin along the back
        float dorsal = smoothstep(0.16, 0.05, abs(bv))*smoothstep(0.26, 0.32, bt)*smoothstep(0.66, 0.6, bt);
        c = mix(c, c*0.62 + ftint*0.08, dorsal*(0.6 + 0.4*smoothstep(0.7, 1.0, abs(sin(bt*120.0)))));
        // head: a little smoother and paler, gill line
        float gill = smoothstep(0.012, 0.0, abs(bt - 0.16 - 0.04*bv*bv))*smoothstep(1.0, 0.4, abs(bv));
        c *= 1.0 - gill*0.25;
        // 3D shading: rounded back, light from the upper left, specular ridge
        vec3 n = normalize(vec3(bperp*bv*0.95, sqrt(max(1.0 - bv*bv, 0.02))));
        vec3 Ld = normalize(vec3(-0.45, 0.55, 0.75));
        float diff = clamp(dot(n, Ld), 0.0, 1.0);
        float spec = pow(clamp(dot(reflect(-Ld, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 18.0 + metal*20.0);
        c *= 0.38 + 0.75*diff;
        c += vec3(1.0,0.97,0.9)*spec*(0.35 + metal*0.9);
        c += c*caus*0.55;                                                    // dappled light
        c *= 1.0 - 0.25*smoothstep(0.75, 1.0, abs(bv));                       // darker flanks
        // eyes
        float er = max(size*0.016, 0.7/uGrid.y);
        for (int s=-1; s<=1; s+=2){
          vec2 ep = h0 - hd*size*0.055 + hp*float(s)*bodyW(0.06)*size*0.72;
          float ed = length(p - ep);
          if (ed < er) c = mix(vec3(0.02), vec3(0.85), smoothstep(er*0.5, er*0.2, length(p - ep - vec2(-0.3, 0.3)*er)));
        }
        col = mix(col, c, cover);
        dens = mix(dens, clamp(0.5 + luma(c)*0.5, 0.45, 1.0), cover);
      }
      // ── whiskers (barbels)
      for (int s=-1; s<=1; s+=2){
        float fs = float(s);
        vec2 b0 = h0 - hd*size*0.01 + hp*fs*size*0.012;
        vec2 b1 = b0 + hd*size*0.025 + hp*fs*size*(0.03 + 0.008*sin(uTime*3.0 + fs + seed*5.0));
        float bd = sdSeg(p, b0, b1);
        if (bd < size*0.0045) { col = mix(col, ftint*0.8, 0.8); }
      }
      // depth: deeper fish sink into the green water
      // (applied by the caller via the 'depth' parameter in the alpha blend above would need layering; keep cheap)
    }

    vec4 lily(vec2 p, vec2 c, float r, float seed, bool flower, inout float shadowOut){
      vec2 q = rot(uTime*0.025*(seed - 0.5) + seed*6.0)*(p - c);
      float d = length(q);
      float a = atan(q.y, q.x);
      float rr = r*(1.0 + 0.012*sin(uTime*0.7 + seed*10.0) + 0.03*sin(a*5.0 + seed*20.0)*0.3);
      // shadow cast on the floor
      if (length(p - c - vec2(0.02, -0.028)) < rr) shadowOut = max(shadowOut, 0.6);
      if (d > rr) return vec4(0.0);
      if (abs(a) < 0.24 && d > rr*0.06) return vec4(0.0);   // notch
      vec3 g = mix(vec3(0.12,0.38,0.12), vec3(0.34,0.62,0.2), smoothstep(rr, 0.0, d)*0.7 + 0.3*noise(q*40.0));
      float vein = smoothstep(0.07, 0.0, abs(sin(a*9.0 + d/rr*0.6)))*step(rr*0.12, d);
      g = mix(g, vec3(0.55,0.75,0.35), vein*0.45);
      float rim = smoothstep(rr*0.86, rr, d);
      g = mix(g, vec3(0.5,0.22,0.15), rim*0.55);                       // reddish curled rim
      g += vec3(0.5,0.55,0.4)*pow(max(0.0, 1.0 - length(q/rr - vec2(-0.35, 0.35))*1.6), 3.0)*0.5; // sheen
      for (int i=0; i<3; i++){                                          // water droplets
        vec2 dp = vec2(hash11(seed*9.0 + float(i)) - 0.5, hash11(seed*5.0 + float(i)*3.0) - 0.5)*rr*1.1;
        float dd = length(q - dp);
        if (dd < rr*0.06) g = mix(g*0.7, vec3(0.95), smoothstep(rr*0.035, 0.0, length(q - dp - vec2(-0.3, 0.3)*rr*0.04)));
      }
      if (flower) {
        float pr = rr*0.5;
        vec2 fq = q*1.0;
        float fd = length(fq);
        float fa = atan(fq.y, fq.x);
        // two rings of petals, outer pink with darker tips, inner paler
        float outer = pr*(0.55 + 0.45*pow(abs(cos(fa*4.0)), 0.6));
        float inner = pr*0.68*(0.55 + 0.45*pow(abs(cos(fa*4.0 + 0.78)), 0.6));
        if (fd < outer) {
          vec3 pc = mix(vec3(1.0,0.86,0.9), vec3(0.92,0.36,0.58), smoothstep(outer*0.3, outer, fd));
          if (fd < inner) pc = mix(vec3(1.0,0.95,0.95), vec3(0.98,0.6,0.75), smoothstep(inner*0.2, inner, fd));
          float vein2 = smoothstep(0.1, 0.0, abs(sin(fa*16.0)))*0.15;
          pc *= 1.0 - vein2;
          if (fd < pr*0.17) pc = mix(vec3(1.0,0.82,0.25), vec3(0.85,0.6,0.1), step(0.5, hash21(floor(fq*400.0))));
          return vec4(pc, 0.95);
        }
      }
      return vec4(g, 0.7);
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      vec2 g = rippleGrad(uv);
      float h = ripple(uv);
      vec2 pr = p + g*0.012;                        // refraction of everything below the surface
      float caus = clamp(caustic(mod(pr*2.6*TAU, TAU) - 250.0, t*0.35 + 23.0), 0.0, 1.0);

      // ── pond floor: pebbles in sand, seen through green water
      vec2 fp = pr*16.0;
      vec2 fi = floor(fp);
      float md = 9.0, md2 = 9.0; vec2 mid = vec2(0.0);
      for (int j=-1; j<=1; j++) for (int k=-1; k<=1; k++){
        vec2 o = vec2(float(j), float(k));
        vec2 r = o + hash22(fi + o)*0.8 + 0.1 - fract(fp);
        float d = dot(r, r);
        if (d < md) { md2 = md; md = d; mid = fi + o; } else if (d < md2) md2 = d;
      }
      float gap = sqrt(md2) - sqrt(md);
      float hs = hash21(mid);
      vec3 stone = hs < 0.3 ? vec3(0.42,0.38,0.32) : hs < 0.55 ? vec3(0.32,0.3,0.28) : hs < 0.75 ? vec3(0.48,0.34,0.24) : vec3(0.25,0.27,0.24);
      stone *= 0.75 + 0.35*smoothstep(0.0, 0.6, gap) + 0.2*noise(fp*3.0);
      vec3 sand = vec3(0.32,0.29,0.2)*(0.8 + 0.3*noise(fp*5.0));
      vec3 floorC = mix(sand, stone, smoothstep(0.05, 0.16, gap)*step(0.25, hash21(mid + 3.0)));
      // swaying weeds
      float weed = 0.0;
      for (int i=0; i<5; i++){
        float fi2 = float(i);
        vec2 wc = vec2((hash11(fi2*3.3) - 0.5)*A*0.9, (hash11(fi2*7.1) - 0.5)*0.85);
        vec2 wq = pr - wc;
        float ang = atan(wq.y, wq.x);
        float blades = pow(abs(sin(ang*5.0 + sin(t*0.6 + fi2 + length(wq)*20.0)*0.6)), 6.0);
        weed = max(weed, blades*smoothstep(0.1, 0.0, length(wq)));
      }
      floorC = mix(floorC, vec3(0.16,0.4,0.12)*(0.8 + 0.4*caus), weed);
      vec3 water = vec3(0.03,0.2,0.2);
      vec3 col = mix(floorC*0.55, water, 0.45);
      col += vec3(0.9,0.95,0.7)*caus*0.35;
      float dens = 0.18 + 0.12*caus + 0.1*weed;

      // ── koi (back to front)
      float shadow = 0.0;
      vec3 under = col;
      for (int f=0; f<8; f++){
        vec3 before = col;
        float d0 = dens;
        koi(f, pr, col, dens, shadow, caus);
        // deeper fish are tinted toward the water
        float depth = uData[f*6+5].w;
        col = mix(col, mix(col, water*1.4 + col*0.35, depth*0.6), step(0.001, length(col - before)));
      }
      // floor shadows only darken where no fish is drawn on top
      if (dens < 0.36) col *= 1.0 - shadow*0.4;

      // ── surface: lily pads, lotus, petals, food, glints
      vec2 lp = p + g*0.004;
      float lshadow = 0.0;
      vec4 L;
      vec2 drift = vec2(sin(t*0.031), cos(t*0.023))*0.02;
      L = lily(lp, vec2(-0.2*A, 0.16) + drift*1.10, 0.085, 0.1, false, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(-0.27*A, 0.07) + drift*1.60, 0.05, 0.6, true, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(-0.12*A, 0.24) + drift*1.33, 0.045, 0.33, false, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(-0.31*A, 0.2) + drift*1.77, 0.035, 0.77, false, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(0.24*A, -0.14) + drift*1.90, 0.09, 0.9, true, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(0.33*A, -0.05) + drift*1.20, 0.05, 0.2, false, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(0.17*A, -0.25) + drift*1.40, 0.055, 0.4, false, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(0.3*A, -0.25) + drift*1.70, 0.04, 0.7, true, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      if (lshadow > 0.0 && dens < 0.6) col *= 1.0 - lshadow*0.45;

      // drifting cherry petals
      for (int i=0; i<12; i++){
        float fi3 = float(i);
        vec2 pp = vec2(hash11(fi3*3.1), hash11(fi3*7.7));
        pp += vec2(t*0.005*(0.5 + hash11(fi3)), t*0.003*(hash11(fi3 + 2.0) - 0.5));
        vec2 pc = (fract(pp) - 0.5)*vec2(A*1.05, 1.05) + 0.01*vec2(sin(t*0.5 + fi3), cos(t*0.4 + fi3*2.0));
        vec2 q = rot(t*0.2 + fi3)*(lp - pc);
        float pd = length(q*vec2(1.0, 1.7));
        if (pd < 0.009) { col = mix(vec3(1.0,0.78,0.85), vec3(0.95,0.5,0.66), smoothstep(0.0, 0.009, pd)); dens = 0.6; }
      }
      // food pellets
      for (int i=0; i<8; i++){
        vec4 fd = uData[48 + i];
        if (fd.z <= 0.0) continue;
        vec2 q = lp - fd.xy - vec2(0.0, 0.002*sin(fd.w*3.0));
        float d = length(q);
        float r = 0.0085;
        if (d < r) { col = mix(vec3(0.55,0.32,0.14), vec3(0.95,0.75,0.45), smoothstep(r, 0.0, length(q - vec2(-0.003, 0.003))))*fd.z + col*(1.0 - fd.z); dens = 0.75; }
        col += vec3(0.5,0.6,0.55)*smoothstep(0.0025, 0.0, abs(d - r*1.8 - 0.004*sin(fd.w*2.0)))*fd.z*0.4;
      }
      // sun glints on ripples + soft sky sheen
      float glint = pow(clamp(dot(normalize(vec3(-g*6.0, 1.0)), normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0), 60.0);
      col += vec3(1.0,0.95,0.8)*glint*0.9;
      col += vec3(0.3,0.45,0.4)*clamp(abs(h)*0.25, 0.0, 0.25);
      col += vec3(0.08,0.1,0.06)*smoothstep(0.3, -0.6, p.y + p.x*0.3);  // warm light falloff
      return shade(col, clamp(dens + glint*0.3, 0.0, 1.0));
    }
    `,
  });
})();


/* ── scenes/tide.js ── */
/* Moonlit Tide — dashes follow the swell, foam crests bloom into dots, your cursor leaves a wake. */
(function () {
  window.AsciiWall.registerScene({
    id: "tide",
    name: "Moonlit Tide",
    blurb: "A night sea drawn as dashes that follow the swell, with foam crests as dots. Sweep across the water to leave a wake.",
    tags: ["water", "night", "interactive"],
    style: "flow",
    ramp: " .",
    bg: "#04070f",
    cell: 6.5,
    aspect: 1.45,
    glow: 0.7,
    shimmer: 0.05,
    trailDecay: 0.992,
    ripple: { damp: 0.988, strength: 1.4, radius: 0.03, drop: 2.5 },
    frag: /* glsl */ `
    float swell(vec2 q, float t){
      vec2 d1 = normalize(vec2(0.38, 1.0)), d2 = normalize(vec2(-0.5, 1.0)), d3 = normalize(vec2(1.0, 0.3));
      float w1 = dot(q,d1)*6.5 - t*0.9 + fbm3(q*1.6)*2.6;
      float w2 = dot(q,d2)*10.5 - t*1.25 + fbm3(q*2.7+5.0)*2.2;
      float w3 = dot(q,d3)*17.0 - t*1.8;
      float h = pow(1.0 - abs(sin(w1*0.5)), 3.0)*0.95;
      h += pow(1.0 - abs(sin(w2*0.5)), 2.2)*0.45;
      h += sin(w3)*0.1;
      h += (fbm3(q*4.5 + vec2(t*0.18, -t*0.12)) - 0.5)*0.7;
      return h;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      // a touch of perspective: the far (top) sea is compressed
      vec2 q = vec2(p.x*(1.0 + uv.y*0.6), p.y*(1.0 + uv.y*0.9));
      float e = 1.2/uGrid.y;
      float h  = swell(q, t);
      float hx = swell(q+vec2(e,0.0), t) - h;
      float hy = swell(q+vec2(0.0,e), t) - h;
      vec2 grad = vec2(hx, hy)/e;
      float rp = ripple(uv);
      grad += rippleGrad(uv)*6.0;
      h += rp*0.35;

      float ang = mod(atan(grad.x, -grad.y), PI)/PI;   // dash runs along the crest
      float tr = trail(uv);
      float foam = smoothstep(0.82, 1.15, h + (noise(q*22.0 + t*0.6)-0.5)*0.45);
      foam += tr*smoothstep(0.35, 0.75, noise(q*30.0 + vec2(t*0.4, 0.0)))*1.3;
      foam += smoothstep(0.35, 0.8, abs(rp))*0.7;

      vec3 water = mix(vec3(0.05,0.13,0.3), vec3(0.11,0.33,0.68), clamp(h*0.55 + 0.35, 0.0, 1.0));
      water *= (0.75 + 0.35*smoothstep(-0.5, 0.5, p.y)) * (0.7 + 0.6*fbm3(q*1.3 + vec2(t*0.05, 0.0)));       // brighter toward the horizon

      // moon glitter path
      float mx = 0.2*uAspect;
      float path = exp(-pow((p.x - mx)*(4.0 + (0.5-p.y)*3.0), 2.0)) * smoothstep(-0.7, 0.45, p.y);
      float glint = step(0.72, hash21(floor(uv*uGrid) + floor(t*2.5)*7.0)) * path * smoothstep(0.1, 0.7, h);
      water += vec3(0.25,0.3,0.4)*path*0.5;

      vec3 c = mix(water, vec3(0.86,0.92,1.0), clamp(foam + glint, 0.0, 1.0));
      return vec4(c, ang);
    }
    `,
  });
})();


/* ── scenes/meadow.js ── */
/* Firefly Meadow — night flowers in binary glyphs; fireflies gather around your cursor. */
(function () {
  const AW = window.AsciiWall;
  const NF = 16;

  AW.fireflySwarm = function (n) {
    return Array.from({ length: n }, () => ({
      x: (Math.random() - 0.5) * 1.6, y: Math.random() * 0.7 - 0.35,
      vx: 0, vy: 0, ph: Math.random() * 10, orbit: 0.08 + Math.random() * 0.22, dir: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * 100,
    }));
  };
  AW.updateFireflies = function (flies, api, t, offset, yRange = [-0.4, 0.42]) {
    const dt = Math.min(api.dt, 0.05), A = api.aspect, m = api.mouse, D = api.data;
    flies.forEach((f, i) => {
      let ax = Math.sin(t * 0.7 + f.seed) * 0.08 + Math.sin(t * 0.23 + f.seed * 3) * 0.06;
      let ay = Math.cos(t * 0.6 + f.seed * 2) * 0.06;
      if (m.present) {
        const dx = m.px - f.x, dy = m.py - f.y, d = Math.hypot(dx, dy) + 1e-4;
        const tx = m.px + Math.cos(t * 0.8 * f.dir + f.seed) * f.orbit - f.x;
        const ty = m.py + Math.sin(t * 0.8 * f.dir + f.seed) * f.orbit * 0.8 - f.y;
        const w = m.on * Math.min(1, 0.25 / (d + 0.2));
        ax += tx * 1.2 * w; ay += ty * 1.2 * w;
      }
      const lim = A / 2 - 0.03;
      if (f.x > lim) ax -= 0.4; if (f.x < -lim) ax += 0.4;
      if (f.y > yRange[1]) ay -= 0.4; if (f.y < yRange[0]) ay += 0.4;
      f.vx = (f.vx + ax * dt) * Math.exp(-dt * 1.4);
      f.vy = (f.vy + ay * dt) * Math.exp(-dt * 1.4);
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.ph += dt;
      const b = Math.pow(0.5 + 0.5 * Math.sin(f.ph * 1.7 + f.seed), 3);
      const o = (offset + i) * 4;
      D[o] = f.x; D[o + 1] = f.y; D[o + 2] = 0.25 + b; D[o + 3] = 1;
    });
  };

  AW.registerScene({
    id: "meadow",
    name: "Firefly Meadow",
    blurb: "Wildflowers at night, drawn in zeros and ones. Fireflies gather around your cursor and the flowers lean away as it passes.",
    tags: ["night", "nature", "interactive"],
    style: "glyph",
    ramp: "binary",
    bg: "#0b0a09",
    cell: 6,
    aspect: 1.55,
    glow: 1.1,
    shimmer: 0.03,
    ss: 2,
    edges: 0.35,
    init() { return { flies: AW.fireflySwarm(NF), t: 0 }; },
    update(st, api) { st.t += api.dt; AW.updateFireflies(st.flies, api, st.t, 0); },
    frag: /* glsl */ `
    vec3 petalColor(float r){
      vec3 c[7] = vec3[7](vec3(0.62,0.42,0.95), vec3(0.98,0.48,0.55), vec3(1.0,0.8,0.3), vec3(0.45,0.62,1.0),
                          vec3(0.95,0.93,0.88), vec3(1.0,0.6,0.3), vec3(0.4,0.82,0.72));
      return c[int(r*6.999)];
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      vec3 c = mix(vec3(0.015,0.015,0.03), vec3(0.05,0.045,0.07), uv.y);
      vec2 sc = floor(uv*uGrid);
      float st = step(0.993, hash21(sc)) * (0.4 + 0.6*sin(t*1.5 + hash21(sc+3.0)*40.0)) * smoothstep(0.0, 0.35, p.y);
      c += max(st, 0.0)*vec3(0.55,0.55,0.7);
      float haze = exp(-length((p - vec2(0.05,-0.6))*vec2(0.8,1.5))*2.0);
      c += vec3(0.3,0.19,0.09)*haze*0.55;

      for (int L=0; L<4; L++){
        float fl = float(L), k = fl/3.0;
        float gy = 0.1 - 0.165*fl;
        float sx = 0.075 + 0.05*fl;
        float atten = mix(0.5, 1.0, k);
        // bushes
        float bush = gy + 0.05*(1.0+fl*0.4)*(fbm3(vec2(p.x*(4.0-fl*0.6) + fl*13.0, fl*3.1))*1.8 - 0.3);
        if (p.y < bush) {
          float leaf = noise(p*(70.0 - fl*10.0) + fl*7.0);
          vec3 g = mix(vec3(0.07,0.17,0.09), vec3(0.2,0.38,0.17), leaf*leaf*1.4);
          g *= smoothstep(-0.7, bush, p.y)*0.8 + 0.25;
          c = g*atten + vec3(0.2,0.12,0.05)*haze*0.35;
        }
        // flowers
        float id = floor(p.x/sx);
        for (int j=-1; j<=1; j++){
          float cid = id + float(j);
          vec2 r = hash22(vec2(cid, fl*17.0));
          if (r.x < 0.15) continue;
          float bx = (cid + 0.5 + (r.y-0.5)*0.6)*sx;
          float sh = (0.06 + 0.11*r.x)*(0.75 + fl*0.22);
          vec2 base = vec2(bx, gy - 0.03);
          vec2 head = vec2(bx, gy + sh);
          float sway = sin(t*(0.55 + r.y*0.4) + cid*1.3 + fl)*0.012*(1.0 + fl*0.3);
          vec2 dm = head - uMouseP;
          float push = uMouseOn*exp(-dot(dm,dm)/0.012)*sign(dm.x + 1e-4)*0.05;
          head.x += sway + push;
          float stem = sdSeg(p, base, head);
          float sw_ = 0.0016*(1.0+fl*0.6); float aa = 1.0/uGrid.y;
          if (p.y > bush - 0.03) c = mix(c, vec3(0.22,0.45,0.2)*atten, smoothstep(sw_ + aa, sw_ - aa*0.5, stem));
          float R = (0.026 + 0.016*r.y)*(0.8 + fl*0.4);
          vec2 q = p - head; q.y *= 1.7;
          q = rot(sway*3.0 + push*4.0)*q;
          float d = length(q), a = atan(q.y, q.x);
          float N = 7.0 + floor(r.x*6.0);
          float pr = R*(0.5 + 0.5*pow(abs(cos(a*N*0.5)), 0.6));
          float cov = smoothstep(pr + aa, pr - aa, d);
          if (cov > 0.0) {
            vec3 pc = petalColor(hash21(vec2(cid, fl+3.0)));
            pc *= 0.65 + 0.45*smoothstep(R, R*0.2, d);
            pc = mix(pc, vec3(1.0,0.78,0.28)*0.9, smoothstep(R*0.3 + aa, R*0.3 - aa, d));
            c = mix(c, pc*atten, cov);
          }
        }
      }
      // fireflies
      for (int i=0; i<16; i++){
        vec4 f = uData[i];
        if (f.w < 0.5) continue;
        vec2 d = (p - f.xy)*REF;
        float g = exp(-dot(d,d)*0.5)*f.z;
        float halo = exp(-dot(d,d)*0.08)*f.z;
        c += vec3(1.0,0.9,0.45)*g*1.2 + vec3(0.45,0.4,0.12)*halo*0.12;
      }
      return shade(c);
    }
    `,
  });
})();


/* ── scenes/rain.js ── */
/* Rainy Window — city lights through fogged glass. Wipe the fog with your cursor; it slowly returns. */
(function () {
  window.AsciiWall.registerScene({
    id: "rain",
    name: "Rainy Window",
    blurb: "A city in bokeh behind a fogged window, with a candle and a warm mug on the sill. Wipe the glass with your cursor and it slowly fogs over again.",
    tags: ["city", "rain", "cozy", "interactive"],
    style: "glyph",
    ramp: "classic",
    bg: "#06070b",
    cell: 6,
    aspect: 1.55,
    glow: 1.15,
    shimmer: 0.1,
    trailDecay: 0.9986,
    ripple: { damp: 0.9, strength: 1, radius: 0.05 },
    frag: /* glsl */ `
    vec3 city(vec2 p, float sharp, float t){
      vec3 c = mix(vec3(0.03,0.03,0.06), vec3(0.09,0.06,0.11), smoothstep(-0.2, 0.5, p.y));
      // far + near buildings
      for (int L=0; L<2; L++){
        float fl = float(L);
        float bw = 0.09 + fl*0.05;
        float bx = floor((p.x + fl*0.37)/bw);
        float bh = -0.12 + hash11(bx*1.7 + fl*9.0)*(0.38 - fl*0.08);
        if (p.y < bh) {
          c = mix(vec3(0.035,0.04,0.065), vec3(0.02,0.022,0.035), fl);
          vec2 wg = vec2((p.x + fl*0.37)/bw*5.0, p.y*42.0);
          vec2 wi = floor(wg), wf = fract(wg);
          float lit = step(0.62, hash21(wi + fl*31.0 + floor(t*0.02 + hash21(wi)*3.0)));
          float win = step(0.25, wf.x)*step(wf.x, 0.75)*step(0.3, wf.y)*step(wf.y, 0.8);
          win = mix(0.45, win, sharp);
          vec3 wc = mix(vec3(1.0,0.72,0.38), vec3(0.6,0.8,1.0), step(0.8, hash21(wi+7.0)));
          c += wc*lit*win*(0.5 + 0.3*fl);
        }
      }
      // bokeh street lights / traffic
      for (int i=0; i<16; i++){
        float fi = float(i);
        vec2 h = vec2(hash11(fi*3.3), hash11(fi*7.1+2.0));
        vec2 ctr = vec2((h.x-0.5)*1.9, -0.5 + h.y*0.42);
        float lane = step(0.55, h.y);
        ctr.x += lane*mod(t*0.03*(hash11(fi)-0.5)*2.0 + 1.0, 2.0) - lane;
        float r = mix(0.03, 0.075, hash11(fi*1.9)) * mix(1.0, 0.55, sharp);
        float d = length(p - ctr);
        vec3 bc = fi < 5.0 ? vec3(1.0,0.55,0.2) : (fi < 9.0 ? vec3(0.95,0.25,0.25) : (fi < 13.0 ? vec3(1.0,0.82,0.5) : vec3(0.3,0.75,0.8)));
        float disc = smoothstep(r, r*0.75, d);
        float rim = smoothstep(r*0.7, r, d)*disc;
        c += bc*(disc*0.55 + rim*0.35)*mix(1.0, 0.8, sharp);
        c += bc*exp(-d*d/(r*r*6.0))*0.2;
      }
      // rain outside
      vec2 rq = vec2(p.x*90.0 + p.y*12.0, p.y*3.0 + t*7.0);
      float rain = step(0.97, hash21(floor(rq))) * fract(rq.y);
      c += vec3(0.4,0.45,0.55)*rain*0.25;
      return c;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      float wipe = clamp(trail(uv)*1.6, 0.0, 1.0);
      float fog = (1.0 - wipe)*(0.82 + 0.1*fbm3(p*3.0 + t*0.02));
      vec3 c = city(p, wipe, t);
      vec3 fogged = vec3(0.08,0.085,0.11) + c*0.75 + vec3(0.05,0.035,0.03)*fbm3(p*6.0);
      c = mix(c, fogged, fog*0.7);

      // static droplets on the glass
      vec2 dg = p*vec2(38.0, 24.0);
      vec2 di = floor(dg), df = fract(dg) - 0.5;
      vec2 dh = hash22(di);
      if (dh.x > 0.7) {
        vec2 o = (dh - 0.5)*0.5;
        float dr = length((df - o)*vec2(1.0, 1.4));
        if (dr < 0.18 + dh.y*0.12) c = city(p + vec2(0.0, 0.05), 1.0, t)*1.5 + 0.05;
      }
      // sliding drops with clear trails
      float col = floor(p.x*28.0);
      float ch = hash11(col*1.31);
      if (ch > 0.55) {
        float sp = 0.05 + 0.1*hash11(col*2.7);
        float y = 0.6 - mod(t*sp + ch*7.0, 1.3);
        float x = (col + 0.5)/28.0 + sin(p.y*30.0 + col)*0.002;
        float dx = abs(p.x - x);
        if (p.y > y && p.y < y + 0.35 && dx < 0.004) c = mix(c, city(p, 1.0, t)*1.2, 0.8*(1.0 - (p.y - y)/0.35));
        if (length(vec2(dx*1.4, p.y - y)) < 0.009) c = city(p + vec2(0.0, 0.08), 1.0, t)*1.7 + 0.08;
      }

      // window frame
      float frame = min(abs(p.x - 0.08*A), abs(p.y - 0.18));
      vec3 wood = vec3(0.07,0.045,0.03);
      vec3 woodLit = wood*(1.0 + 0.5*noise(p*vec2(5.0,80.0))) + vec3(0.12,0.07,0.03)*exp(-length(p - vec2(0.3*A,-0.3))*2.5);
      if (frame < 0.014) c = woodLit*1.3;
      if (abs(p.x) > 0.47*A || p.y > 0.46) c = woodLit;

      // sill, candle, mug
      vec2 candle = vec2(0.3*A, -0.39);
      float flick = 0.85 + 0.15*noise1(t*7.0) + 0.05*sin(t*23.0);
      float lightD = length(p - candle - vec2(0.0, 0.07));
      vec3 warm = vec3(1.0,0.62,0.3)*flick;
      if (p.y < -0.42) {
        c = vec3(0.13,0.08,0.05)*(0.8 + 0.3*noise(p*vec2(4.0,60.0)));
        c += warm*0.5*exp(-lightD*4.0);
      }
      // candle
      if (abs(p.x - candle.x) < 0.024 && p.y > -0.43 && p.y < -0.33) c = vec3(0.85,0.8,0.7)*(0.45 + 0.6*exp(-lightD*7.0));
      vec2 fq = p - vec2(candle.x + sin(t*3.0)*0.003, -0.295);
      float flame = length(fq*vec2(1.0, 0.42 + 0.05*flick));
      if (flame < 0.017) c = mix(vec3(1.0,0.5,0.12), vec3(1.0,0.95,0.75), smoothstep(0.017, 0.0, flame));
      c += warm*0.22*exp(-lightD*5.0);
      // mug
      vec2 mug = vec2(-0.28*A, -0.38);
      vec2 mq = p - mug;
      float body = sdBox(mq, vec2(0.04, 0.045)) - 0.006;
      float handle = abs(length(mq - vec2(0.05, 0.005)) - 0.022) - 0.006;
      if (min(body, handle) < 0.0) {
        c = vec3(0.62,0.3,0.22)*(0.5 + 0.6*smoothstep(-0.04, 0.05, mq.x));
        c += warm*0.12;
      }
      // steam
      if (mq.y > 0.05 && mq.y < 0.3) {
        float sy = mq.y;
        float sx = mq.x - sin(sy*22.0 - t*1.6)*0.018*(sy*4.0) - sin(sy*9.0 + t*0.7)*0.01;
        float s = exp(-sx*sx/0.00015)*smoothstep(0.3, 0.06, sy)*smoothstep(0.4, 0.7, noise(vec2(sy*14.0 - t*1.2, 0.0)));
        c += vec3(0.5,0.45,0.42)*s*0.7;
      }
      return shade(c);
    }
    `,
  });
})();


/* ── scenes/hearth.js ── */
/* Hearth — a campfire under the pines. Your cursor is the wind; tap for a shower of sparks. */
(function () {
  window.AsciiWall.registerScene({
    id: "hearth",
    name: "Hearth",
    blurb: "A small campfire under the pines. Your cursor acts as the wind, and a click sends up a shower of sparks.",
    tags: ["fire", "night", "cozy", "interactive"],
    style: "glyph",
    ramp: "fire",
    bg: "#090605",
    cell: 6,
    aspect: 1.55,
    glow: 1.25,
    shimmer: 0.1,
    init() { return { wind: 0, burst: 99, bx: 0, t: 0 }; },
    update(st, api) {
      const dt = api.dt, m = api.mouse;
      st.t += dt;
      const breeze = Math.sin(st.t * 0.3) * 0.15 + Math.sin(st.t * 0.83) * 0.08;
      let target = breeze;
      if (m.present) target += Math.max(-1, Math.min(1, m.vx * 0.9)) * m.on + Math.max(-0.4, Math.min(0.4, -m.px * 0.25)) * m.on;
      st.wind += (target - st.wind) * Math.min(1, dt * 1.8);
      st.burst += dt;
      if (api.clicks.length) { st.burst = 0; st.bx = api.clicks[0].px; }
      api.data[0] = st.wind; api.data[1] = st.burst; api.data[2] = st.bx;
    },
    frag: /* glsl */ `
    vec3 fireRamp(float f){
      return vec3(1.0,0.32,0.06)*smoothstep(0.0,0.35,f) + vec3(0.0,0.42,0.12)*smoothstep(0.3,0.7,f) + vec3(0.0,0.2,0.38)*smoothstep(0.65,1.0,f);
    }
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      float wind = uData[0].x, burst = uData[0].y;
      vec2 F = vec2(0.0, -0.3);
      float lightD = length((p - F - vec2(0.0, 0.08))*vec2(0.8, 1.2));
      float flick = 0.85 + 0.15*noise1(t*6.0) + 0.06*sin(t*17.0);
      vec3 warm = vec3(1.0,0.5,0.18)*flick;

      vec3 c = mix(vec3(0.05,0.045,0.08), vec3(0.06,0.07,0.14), uv.y);
      vec2 sc = floor(uv*uGrid);
      c += step(0.994, hash21(sc))*(0.5+0.5*sin(t*1.3 + hash21(sc+1.0)*30.0))*vec3(0.5,0.5,0.65)*smoothstep(0.0, 0.3, p.y);
      // pines
      for (int L=0; L<2; L++){
        float fl = float(L);
        float w = 0.08 + fl*0.05;
        float id = floor((p.x + fl*0.21)/w);
        float lx = fract((p.x + fl*0.21)/w) - 0.5;
        float h = 0.18 + hash11(id*3.1 + fl)*0.22 + fl*0.06;
        float base = -0.1 - fl*0.04;
        float yy = (p.y - base)/h;
        float width = (1.0 - yy)*0.42*(0.75 + 0.25*abs(sin(yy*14.0)));
        if (yy > 0.0 && yy < 1.0 && abs(lx) < width && hash11(id + fl*7.0) > 0.15) c = mix(vec3(0.03,0.045,0.06), vec3(0.015,0.02,0.025), fl);
      }
      // ground
      if (p.y < -0.12 - 0.02*fbm3(vec2(p.x*3.0, 0.0))) {
        c = vec3(0.05,0.04,0.03)*(0.7 + 0.5*noise(p*vec2(40.0, 70.0)));
        c += warm*0.6*exp(-lightD*3.5);
      }
      c += warm*0.07*exp(-lightD*2.5);

      // stones
      for (int i=0;i<10;i++){
        float a = float(i)/10.0*TAU + 0.3;
        vec2 sp = F + vec2(cos(a)*0.2, sin(a)*0.05 - 0.07);
        float r = 0.026 + 0.008*hash11(float(i));
        float d = length((p - sp)*vec2(1.0, 1.3));
        if (d < r && (sin(a) < 0.2 || p.y < F.y - 0.05)) {
          float lit = clamp(dot(normalize(F - sp), normalize(p - sp + 1e-4)), 0.0, 1.0);
          c = vec3(0.28,0.26,0.25)*(0.45 + 0.4*noise(p*90.0)) + warm*lit*0.55;
        }
      }
      // logs
      float l1 = sdSeg(p, F + vec2(-0.15,-0.08), F + vec2(0.13,-0.02)) - 0.022;
      float l2 = sdSeg(p, F + vec2(-0.12,-0.02), F + vec2(0.15,-0.09)) - 0.022;
      if (min(l1, l2) < 0.0) {
        float crack = smoothstep(0.62, 0.75, noise(p*vec2(70.0, 40.0) + t*0.3));
        c = vec3(0.2,0.11,0.06)*(0.6 + 0.6*noise(p*vec2(120.0, 20.0)));
        c += vec3(1.0,0.35,0.08)*crack*(0.6 + 0.4*sin(t*2.0 + p.x*30.0));
      }
      // flame
      vec2 f = p - F;
      float hgt = clamp(f.y/0.42, 0.0, 1.0);
      f.x -= wind*hgt*hgt*0.18;
      float n = fbm(vec2(f.x*7.0, f.y*4.5 - t*2.4));
      float n2 = noise(vec2(f.x*14.0, f.y*9.0 - t*4.0));
      float width = 0.12*pow(1.0 - hgt, 0.85) + 0.004;
      float inside = width - abs(f.x + (n - 0.5)*0.07*(hgt + 0.25));
      float fire = clamp(inside*11.0 + (n - 0.45)*1.1 + (n2-0.5)*0.4 - hgt*0.75, 0.0, 1.0) * step(-0.03, f.y);
      fire *= flick;
      if (fire > 0.02) c = max(c, fireRamp(fire)*1.1);
      // embers
      for (int i=0; i<34; i++){
        float fi = float(i);
        float rate = 0.18 + 0.2*hash11(fi*1.7);
        float ph = fract(t*rate + hash11(fi*4.1));
        vec2 ep = F + vec2((hash11(fi*2.3)-0.5)*0.12, 0.02);
        ep += vec2(wind*ph*ph*0.5 + sin(ph*9.0 + fi)*0.025, ph*0.75);
        float d = length((p - ep)*REF);
        float b = (1.0 - ph)*(0.6 + 0.4*sin(t*9.0 + fi));
        c += vec3(1.0,0.55,0.15)*exp(-d*d*0.9)*b*1.2;
      }
      // click sparks
      if (burst < 2.5) {
        for (int i=0; i<26; i++){
          float fi = float(i);
          float a = PI*0.5 + (hash11(fi*5.3)-0.5)*2.2;
          float sp = 0.35 + 0.4*hash11(fi*9.1);
          vec2 sv = vec2(cos(a), sin(a))*sp;
          vec2 sp0 = F + vec2(0.0, 0.08);
          vec2 pos = sp0 + sv*burst + vec2(wind*0.2, -0.35)*burst*burst;
          float d = length((p - pos)*REF);
          c += vec3(1.0,0.75,0.35)*exp(-d*d*1.2)*max(0.0, 1.0 - burst/2.5)*1.5;
        }
      }
      return shade(c);
    }
    `,
  });
})();


/* ── scenes/jelly.js ── */
/* Jellyfish Drift — bioluminescent jellies pulse upward through light rays and marine snow. */
(function () {
  const N = 6;
  window.AsciiWall.registerScene({
    id: "jelly",
    name: "Jellyfish Drift",
    blurb: "Glowing jellyfish pulse up through shafts of light and drifting marine snow. They follow your cursor slowly and drift away from a tap.",
    tags: ["ocean", "calm", "interactive"],
    style: "glyph",
    ramp: "soft",
    bg: "#03070d",
    cell: 6,
    aspect: 1.55,
    glow: 1.3,
    shimmer: 0.08,
    ripple: { damp: 0.97, strength: 0.6, radius: 0.03 },
    init(api) {
      const A = api.aspect;
      const jellies = Array.from({ length: N }, (_, i) => ({
        x: ((i + 0.5) / N - 0.5) * A * 0.9 + (Math.random() - 0.5) * 0.1,
        y: Math.random() - 0.5, size: 0.06 + Math.random() * 0.06,
        hue: [0.92, 0.55, 0.78, 0.48, 0.0, 0.62][i], ph: Math.random(), vx: 0, vy: 0, tilt: 0,
      }));
      return { jellies };
    },
    update(st, api) {
      const dt = Math.min(api.dt, 0.05), A = api.aspect, m = api.mouse, D = api.data;
      st.jellies.forEach((j, i) => {
        j.ph += dt * (0.45 + j.size * 2);
        const pulse = Math.pow(Math.max(0, Math.sin(j.ph * Math.PI * 2)), 2);
        j.vy += (pulse * 0.12 - 0.012) * dt * (0.6 / (j.size * 10));
        let ax = Math.sin(j.ph * 0.37 + i) * 0.004;
        if (m.present) {
          const dx = m.px - j.x, dy = m.py - j.y, d = Math.hypot(dx, dy) + 1e-3;
          if (d < 0.5) { ax += (dx / d) * 0.02 * m.on * (1 - d / 0.5); j.vy += (dy / d) * 0.012 * m.on * (1 - d / 0.5) * dt; }
        }
        for (const c of api.clicks) {
          const dx = j.x - c.px, dy = j.y - c.py, d = Math.hypot(dx, dy) + 1e-3;
          if (d < 0.35) { j.vx += (dx / d) * 0.15 * (1 - d / 0.35); j.vy += (dy / d) * 0.15 * (1 - d / 0.35); }
        }
        j.vx = (j.vx + ax * dt) * Math.exp(-dt * 0.8);
        j.vy *= Math.exp(-dt * 1.2);
        j.x += j.vx * dt; j.y += j.vy * dt;
        j.tilt += (Math.max(-0.5, Math.min(0.5, -j.vx * 8)) - j.tilt) * dt * 2;
        if (j.y > 0.5 + j.size * 2) { j.y = -0.5 - j.size * 3; j.x = (Math.random() - 0.5) * A * 0.85; }
        if (j.y < -0.5 - j.size * 4) j.y = -0.5 - j.size * 3;
        const lim = A / 2;
        if (j.x > lim) j.x -= A; if (j.x < -lim) j.x += A;
        D[i * 4] = j.x; D[i * 4 + 1] = j.y; D[i * 4 + 2] = j.size; D[i * 4 + 3] = j.ph;
        D[32 + i * 4] = j.hue; D[33 + i * 4] = j.tilt;
      });
    },
    frag: /* glsl */ `
    vec3 hueCol(float h){ return 0.55 + 0.45*cos(TAU*(h + vec3(0.0, 0.33, 0.67))); }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      vec3 c = mix(vec3(0.01,0.025,0.05), vec3(0.03,0.09,0.15), smoothstep(-0.5, 0.6, p.y));
      // light shafts
      float ray = pow(noise(vec2(p.x*5.0 + p.y*1.6, t*0.08)), 3.0) + pow(noise(vec2(p.x*9.0 - p.y*2.0 + 4.0, t*0.11)), 4.0)*0.6;
      c += vec3(0.1,0.22,0.28)*ray*smoothstep(-0.4, 0.5, p.y)*0.8;
      // marine snow
      vec2 sg = (p + vec2(sin(t*0.1)*0.02, t*0.012))*vec2(REF*0.4);
      vec2 si = floor(sg);
      float sn = step(0.985, hash21(si))*smoothstep(0.5, 0.0, length(fract(sg)-0.5));
      c += vec3(0.4,0.5,0.55)*sn*0.5;

      for (int i=0; i<6; i++){
        vec4 J = uData[i];
        vec4 K = uData[8+i];
        float sz = J.z;
        vec2 q = rot(K.y)*(p - J.xy)/sz;
        if (q.y > 1.4 || q.y < -4.5 || abs(q.x) > 2.0) continue;
        float pulse = pow(max(0.0, sin(J.w*TAU)), 2.0);
        float bw = 1.0 - 0.18*pulse, bh = 0.75 + 0.12*pulse;
        vec3 hc = hueCol(K.x);
        // tentacles
        for (int k=0; k<6; k++){
          float fk = float(k);
          float x0 = (-0.75 + 0.3*fk)*bw;
          float yy = -q.y;
          float sway = sin(yy*2.4 - t*1.6 + fk*1.7 + J.w*3.0)*0.18*yy*0.4;
          float len = 2.8 + hash11(fk + float(i)*7.0)*1.4;
          if (yy > 0.0 && yy < len && abs(q.x - x0 - sway) < 0.045) c = max(c, hc*0.55*(1.0 - yy/len));
        }
        // oral arms
        for (int k=-1; k<=1; k+=2){
          float yy = -q.y;
          float ax = float(k)*0.12 + sin(yy*3.0 - t*1.2 + float(k))*0.12;
          float w = 0.11*(1.0 - yy/2.2) + 0.03*sin(yy*20.0);
          if (yy > 0.0 && yy < 2.2 && abs(q.x - ax) < w) c = max(c, mix(hc, vec3(1.0), 0.3)*0.75);
        }
        // bell
        vec2 b = vec2(q.x/bw, q.y/bh);
        float r = length(b);
        if (q.y > -0.08 && r < 1.0) {
          float rim = smoothstep(0.65, 1.0, r);
          float organ = smoothstep(0.12, 0.0, abs(length(b - vec2(0.0, 0.25)) - 0.28))*0.6;
          float stripes = 0.5 + 0.5*sin(atan(b.y, b.x)*14.0);
          vec3 bc = hc*(0.35 + 0.35*stripes*rim + rim*0.6) + vec3(1.0)*organ*0.35;
          c = mix(c, bc, 0.85);
        }
        // frill
        if (q.y < 0.0 && q.y > -0.18 && abs(q.x) < bw*(1.0 + 0.05*sin(q.x*30.0 + t*4.0))) c = max(c, hc*0.8);
        // glow halo
        c += hc*0.06*exp(-dot(q - vec2(0.0, 0.3), q - vec2(0.0, 0.3))*0.8);
      }
      return shade(c);
    }
    `,
  });
})();


/* ── scenes/aurora.js ── */
/* Aurora Cabin — northern lights over the peaks, a lit cabin on the shore, a lake you can touch. */
(function () {
  window.AsciiWall.registerScene({
    id: "aurora",
    name: "Aurora Cabin",
    blurb: "Northern lights over the mountains and a warm cabin on the shore. The aurora gathers under your cursor, and touching the lake sends out ripples.",
    tags: ["night", "mountains", "cozy", "interactive"],
    style: "glyph",
    ramp: "soft",
    bg: "#03050b",
    cell: 6,
    aspect: 1.55,
    glow: 1.15,
    shimmer: 0.09,
    ripple: { damp: 0.985, strength: 1.2, radius: 0.025, drop: 2.0 },
    frag: /* glsl */ `
    const float WATER = -0.22;

    float ridge(float x, float s, float o){
      return 0.55*(1.0 - abs(sin(x*s + o))) + 0.3*(1.0 - abs(sin(x*s*2.3 + o*1.7))) + 0.15*noise1(x*s*9.0 + o);
    }

    vec3 world(vec2 p, float t, bool reflected){
      float A = uAspect;
      vec3 c = mix(vec3(0.015,0.02,0.045), vec3(0.04,0.06,0.11), smoothstep(0.5, -0.15, p.y));
      vec3 auroraLight = vec3(0.0);
      vec2 sc = floor(toUv(p)*uGrid);
      if (!reflected) c += step(0.992, hash21(sc))*(0.45+0.55*sin(t*1.7 + hash21(sc+2.0)*50.0))*vec3(0.6,0.65,0.8)*smoothstep(-0.05, 0.3, p.y);
      // aurora curtains
      float boost = 1.0 + uMouseOn*0.7*exp(-pow((p.x - uMouseP.x)*3.0, 2.0));
      for (int i=0; i<3; i++){
        float fi = float(i);
        float yc = 0.13 + fi*0.08 + 0.08*sin(p.x*(1.6 + fi*0.4) + t*0.12 + fi*2.0) + 0.06*(fbm3(vec2(p.x*1.5 + t*0.05, fi)) - 0.5);
        yc -= uMouseOn*0.04*exp(-pow((p.x - uMouseP.x)*3.0, 2.0));
        float above = p.y - yc;
        float stri = 0.15 + 1.4*pow(noise(vec2(p.x*42.0 + t*0.5 + fi*10.0, fi + p.y*2.0)), 2.0);
        float curtain = smoothstep(-0.02, 0.0, above)*exp(-max(above, 0.0)*(3.8 - fi*0.9))*stri;
        float band = smoothstep(0.35, 0.65, fbm3(vec2(p.x*1.3 - t*0.05, fi*3.0)));
        curtain *= band;
        auroraLight += mix(vec3(0.15,0.95,0.55), vec3(0.4,0.3,0.9), fi*0.4)*band;
        vec3 ac = mix(vec3(0.15,0.95,0.55), vec3(0.55,0.3,0.95), smoothstep(0.0, 0.25, above));
        ac = mix(ac, vec3(0.2,0.8,0.9), fi*0.3);
        c += ac*curtain*0.6*boost;
      }
      // mountains
      float m1 = -0.08 + 0.32*ridge(p.x, 2.7, 0.9);
      float m2 = -0.17 + 0.17*ridge(p.x, 2.9, 2.2);
      if (p.y < m1) {
        float face = noise(vec2(p.x*9.0, p.y*14.0));
        c = vec3(0.13,0.17,0.28)*(0.5 + 0.8*face) + auroraLight*0.04;
        float snow = smoothstep(m1 - 0.09, m1 - 0.01, p.y)*smoothstep(0.02, 0.14, m1)*step(0.4, noise(p*vec2(30.0, 50.0)));
        c += (vec3(0.45,0.52,0.62) + auroraLight*0.2)*snow*0.9;
      }
      if (p.y < m2) c = vec3(0.05,0.07,0.1) + vec3(0.06,0.08,0.1)*noise(p*vec2(20.0, 40.0)) + auroraLight*0.03;
      // shore + pines
      float shore = WATER + 0.035 + 0.01*sin(p.x*7.0);
      if (p.y < shore) c = vec3(0.035,0.045,0.05)*(0.7 + 0.6*noise(p*vec2(60.0, 30.0)));
      float pw = 0.035;
      float pid = floor(p.x/pw);
      float lx = fract(p.x/pw) - 0.5;
      float ph = 0.05 + 0.07*hash11(pid*1.7);
      float yy = (p.y - shore + 0.005)/ph;
      if (hash11(pid*3.3) > 0.35 && abs(p.x + 0.25*A) > 0.14 && yy > 0.0 && yy < 1.0 && abs(lx) < (1.0-yy)*0.5*(0.7+0.3*abs(sin(yy*12.0)))) c = vec3(0.015,0.025,0.03);
      // cabin
      vec2 cq = (p - vec2(-0.25*A, shore + 0.05))/2.4;
      float house = sdBox(cq, vec2(0.045, 0.025));
      float roof = max(abs(cq.x)*0.75 + (cq.y - 0.065), -(cq.y - 0.022));
      if (house < 0.0) c = vec3(0.2,0.13,0.08)*(0.7 + 0.4*step(0.5, fract(cq.y*90.0)));
      if (roof < 0.0) c = vec3(0.12,0.08,0.07);
      float win = sdBox(cq - vec2(0.015, 0.0), vec2(0.011, 0.009));
      float flick = 0.9 + 0.1*noise1(t*3.0);
      if (win < 0.0) c = vec3(1.0,0.72,0.35)*flick;
      c += vec3(1.0,0.6,0.25)*0.2*exp(-length(cq)*10.0)*flick;
      // chimney smoke
      vec2 sq = cq - vec2(-0.025, 0.07);
      if (sq.y > 0.0 && sq.y < 0.25) {
        float sx = sq.x - sq.y*0.25 - sin(sq.y*18.0 - t*1.2)*0.012*(sq.y*5.0);
        c += vec3(0.25,0.27,0.33)*exp(-sx*sx/(0.0003 + sq.y*0.002))*smoothstep(0.25, 0.0, sq.y)*smoothstep(0.3, 0.6, noise(vec2(sq.y*10.0 - t*0.8, 1.0)))*0.8;
      }
      // shooting star
      float sst = mod(t, 13.0);
      if (!reflected && sst < 0.9) {
        vec2 s0 = vec2(0.35*A - sst*0.5, 0.42 - sst*0.18);
        float d = sdSeg(p, s0, s0 + vec2(0.12, 0.045));
        float along = clamp(dot(p - s0, normalize(vec2(0.12,0.045)))/0.128, 0.0, 1.0);
        c += vec3(0.9,0.95,1.0)*exp(-d*d*REF*REF*0.6)*(1.0 - along)*(1.0 - sst/0.9);
      }
      return c;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      if (p.y >= WATER) return shade(world(p, t, false));
      vec2 g = rippleGrad(uv);
      float h = ripple(uv);
      float wave = sin(p.x*60.0 + t*0.8 + sin(p.y*90.0)*1.5)*0.003*(1.0 + (WATER - p.y)*3.0);
      vec2 rp = vec2(p.x + wave + g.x*0.06, 2.0*WATER - p.y + g.y*0.06);
      vec3 c = world(rp, t, true)*0.8;
      c = mix(c, vec3(0.02,0.04,0.07), smoothstep(WATER, -0.5, p.y)*0.4);
      c += vec3(0.4,0.55,0.7)*clamp(abs(h)*0.4, 0.0, 0.3);
      return shade(c);
    }
    `,
  });
})();


/* ── scenes/garden.js ── */
/* Contribution Garden — a year of GitHub contributions grown as a night garden.
 * Data: data/contributions.json (written by github/garden.mjs), else a demo year. */
(function () {
  const AW = window.AsciiWall;
  AW.gardenDataUrl = AW.gardenDataUrl || "data/contributions.json";

  function demoYear() {
    const weeks = [];
    const start = new Date(); start.setDate(start.getDate() - 52 * 7 - start.getDay());
    let streak = 0;
    for (let w = 0; w < 53; w++) {
      const days = [];
      const busy = 0.5 + 0.5 * Math.sin(w / 6) + (Math.random() - 0.5) * 0.6;
      for (let d = 0; d < 7; d++) {
        const weekend = d === 0 || d === 6;
        streak = Math.random() < 0.15 ? 0 : streak + 1;
        const p = Math.max(0, busy) * (weekend ? 0.35 : 0.85);
        days.push(Math.random() < p ? Math.round(Math.random() * 9 * (0.5 + busy)) + 1 : 0);
      }
      weeks.push(days);
    }
    return { user: "you", demo: true, start: start.toISOString().slice(0, 10), weeks };
  }

  function toTexture(data) {
    const W = 53, H = 7;
    const buf = new Uint8Array(W * H * 4);
    const weeks = data.weeks.slice(-W);
    const flat = weeks.flat().filter((n) => n > 0).sort((a, b) => a - b);
    const q = (f) => flat.length ? flat[Math.min(flat.length - 1, Math.floor(f * flat.length))] : 1;
    const qs = [q(0.25), q(0.5), q(0.75)];
    const max = flat.length ? flat[flat.length - 1] : 1;
    weeks.forEach((days, w) => days.forEach((n, d) => {
      const lvl = n <= 0 ? 0 : n <= qs[0] ? 1 : n <= qs[1] ? 2 : n <= qs[2] ? 3 : 4;
      const i = (d * W + w) * 4;
      buf[i] = Math.round((lvl / 4) * 255);
      buf[i + 1] = Math.round(Math.min(1, n / max) * 255);
      buf[i + 3] = 255;
    }));
    return { width: W, height: H, data: buf, nearest: true };
  }

  AW.registerScene({
    id: "garden",
    name: "Contribution Garden",
    blurb: "A year of your GitHub contributions, grown as a night garden. Each week is a plant and each active day is a flower on it. Hover over a plant to see that week.",
    tags: ["github", "night", "interactive"],
    style: "glyph",
    ramp: "binary",
    bg: "#07080a",
    cell: 6,
    aspect: 1.6,
    glow: 1.1,
    shimmer: 0.03,
    ss: 2,
    edges: 0.35,
    init(api) {
      const st = { flies: AW.fireflySwarm(10), t: 0, data: AW.gardenData || null, tooltip: null };
      const apply = (d) => { st.data = d; api.setTexture(toTexture(d)); };
      if (st.data) apply(st.data);
      else {
        apply(demoYear());
        if (typeof fetch === "function") fetch(AW.gardenDataUrl).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.weeks) { AW.gardenData = d; apply(d); } }).catch(() => {});
      }
      return st;
    },
    update(st, api) {
      st.t += api.dt;
      AW.updateFireflies(st.flies, api, st.t, 16, [-0.1, 0.45]);
      const m = api.mouse, A = api.aspect;
      st.tooltip = null;
      if (m.present && st.data) {
        const margin = 0.06 * A, dx = (A - 2 * margin) / 53;
        const w = Math.floor((m.px + A / 2 - margin) / dx);
        const weeks = st.data.weeks.slice(-53);
        if (w >= 0 && w < weeks.length && m.py < 0.25 && m.py > -0.42) {
          const total = weeks[w].reduce((a, b) => a + b, 0);
          let label = `week ${w + 1}`;
          if (st.data.start) {
            const d = new Date(st.data.start); d.setDate(d.getDate() + w * 7);
            label = "week of " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          }
          st.tooltip = { x: m.x, y: m.y, text: `${total} contribution${total === 1 ? "" : "s"} · ${label}` };
          api.data[120] = w;
        } else api.data[120] = -10;
      } else api.data[120] = -10;
    },
    frag: /* glsl */ `
    vec3 bloomCol(float lvl, float seed){
      vec3 a[4] = vec3[4](vec3(0.55,0.8,0.5), vec3(0.98,0.55,0.7), vec3(1.0,0.62,0.32), vec3(1.0,0.9,0.55));
      vec3 c = a[int(clamp(lvl*4.0 - 0.5, 0.0, 3.0))];
      return mix(c, vec3(0.65,0.55,1.0), step(0.8, seed)*0.6);
    }
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      vec3 c = mix(vec3(0.02,0.02,0.035), vec3(0.04,0.045,0.08), uv.y);
      vec2 sc = floor(uv*uGrid);
      c += step(0.994, hash21(sc))*(0.5+0.5*sin(t*1.4 + hash21(sc+5.0)*40.0))*vec3(0.55,0.55,0.7)*smoothstep(0.0, 0.3, p.y);
      // moon
      vec2 mp = p - vec2(0.36*A, 0.33);
      if (length(mp) < 0.05) c = vec3(0.85,0.82,0.7)*(0.75 + 0.25*noise(mp*60.0));
      c += vec3(0.25,0.24,0.2)*exp(-length(mp)*9.0)*0.5;

      float ground = -0.3;
      float margin = 0.06*A, dx = (A - 2.0*margin)/53.0;
      float hover = uData[30].x;
      float wi = floor((p.x + A*0.5 - margin)/dx);
      for (int k=-1; k<=1; k++){
        float w = wi + float(k);
        if (w < 0.0 || w > 52.0) continue;
        float sum = 0.0;
        for (int d=0; d<7; d++) sum += texelFetch(uTex, ivec2(int(w), d), 0).r;
        float hgt = 0.03 + 0.42*sqrt(sum/7.0);
        float bx = -A*0.5 + margin + (w + 0.5)*dx;
        float hl = 1.0 - min(abs(w - hover), 1.0);
        float sway = sin(t*0.8 + w*0.22)*0.01*(hgt*4.0);
        vec2 dm = vec2(bx, ground + hgt*0.7) - uMouseP;
        sway += uMouseOn*exp(-dot(dm,dm)/0.006)*sign(dm.x + 1e-4)*0.025;
        float yy = clamp((p.y - ground)/hgt, 0.0, 1.0);
        float sx = bx + sway*yy*yy;
        float aa = 1.0/uGrid.y; float sw_ = max(0.0022, 0.55/uGrid.y);
        if (p.y > ground - 0.01 && p.y < ground + hgt) c = mix(c, mix(vec3(0.18,0.4,0.18), vec3(0.4,0.75,0.35), hl), smoothstep(sw_ + aa, sw_ - aa*0.5, abs(p.x - sx)));
        // leaves
        for (int l=0; l<2; l++){
          float fl = float(l);
          float ly = ground + hgt*(0.18 + fl*0.22);
          if (hgt < 0.08 && l == 1) break;
          float side = fl < 0.5 ? -1.0 : 1.0;
          vec2 lc = vec2(bx + sway*pow((ly-ground)/hgt, 2.0) + side*dx*0.28, ly + 0.006);
          vec2 lq = rot(side*0.6)*(p - lc);
          if (length(lq/vec2(dx*0.32, dx*0.12)) < 1.0) c = vec3(0.2,0.45,0.2)*(0.8 + 0.4*hl);
        }
        // blossoms: one per active day
        for (int d=0; d<7; d++){
          vec4 tx = texelFetch(uTex, ivec2(int(w), d), 0);
          if (tx.r < 0.01) continue;
          float fd = float(d);
          float by = ground + hgt*(0.35 + 0.65*(fd + 1.0)/7.0);
          float bxy = bx + sway*pow((by-ground)/hgt, 2.0) + (mod(fd, 2.0) - 0.5)*dx*0.5;
          float R = dx*(0.2 + tx.r*0.32);
          vec2 q = p - vec2(bxy, by); q.y *= 1.3;
          float a = atan(q.y, q.x);
          float pr = R*(0.6 + 0.4*abs(cos(a*2.5 + w)));
          float cov = smoothstep(pr + aa, pr - aa, length(q));
          if (cov > 0.0) {
            vec3 bc = bloomCol(tx.r, hash21(vec2(w, fd)));
            bc *= 0.7 + 0.4*smoothstep(pr, 0.0, length(q)) + hl*0.35;
            bc = mix(bc, vec3(1.0,0.85,0.4), smoothstep(R*0.3 + aa, R*0.3 - aa, length(q)));
            c = mix(c, bc, cov);
          }
        }
      }
      // ground
      if (p.y < ground) {
        c = vec3(0.05,0.07,0.04)*(0.6 + 0.6*noise(p*vec2(90.0, 40.0)));
        if (p.y > ground - 0.015) c += vec3(0.08,0.16,0.07)*step(0.45, noise(p*vec2(200.0, 20.0)));
      }
      // fireflies
      for (int i=16; i<26; i++){
        vec4 f = uData[i];
        if (f.w < 0.5) continue;
        vec2 d = (p - f.xy)*REF;
        c += vec3(1.0,0.9,0.45)*exp(-dot(d,d)*0.5)*f.z*1.2 + vec3(0.4,0.36,0.1)*exp(-dot(d,d)*0.08)*f.z*0.1;
      }
      return shade(c);
    }
    `,
  });
})();


/* ── scenes/image.js ── */
/* Living Image — drop in any picture and it becomes a breathing ASCII painting with a lantern cursor. */
(function () {
  const AW = window.AsciiWall;
  const KEY = "asciiwall:image";

  function paintDefault() {
    const c = document.createElement("canvas");
    c.width = 960; c.height = 600;
    const g = c.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, 380);
    sky.addColorStop(0, "#1b2347"); sky.addColorStop(0.55, "#7a4a6e"); sky.addColorStop(1, "#f2a46b");
    g.fillStyle = sky; g.fillRect(0, 0, 960, 600);
    g.filter = "blur(18px)";
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(${240 - i * 4},${170 + i * 3},${150 + i * 4},0.35)`;
      g.beginPath(); g.ellipse(80 + i * 70, 80 + (i % 4) * 40, 120, 26, 0, 0, Math.PI * 2); g.fill();
    }
    g.filter = "blur(6px)";
    g.fillStyle = "#ffe2a8"; g.beginPath(); g.arc(640, 330, 46, 0, Math.PI * 2); g.fill();
    g.filter = "none";
    const hill = (y, amp, col, seed) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 600);
      for (let x = 0; x <= 960; x += 8) g.lineTo(x, y + Math.sin(x / 120 + seed) * amp + Math.sin(x / 47 + seed * 3) * amp * 0.3);
      g.lineTo(960, 600); g.fill();
    };
    hill(350, 22, "#5a3b5c", 1); hill(380, 18, "#3b2c4a", 4);
    const lake = g.createLinearGradient(0, 400, 0, 600);
    lake.addColorStop(0, "#d48a6a"); lake.addColorStop(1, "#22233d");
    g.fillStyle = lake; g.fillRect(0, 410, 960, 190);
    g.fillStyle = "rgba(255,226,168,0.5)";
    for (let i = 0; i < 18; i++) g.fillRect(600 + Math.sin(i) * 30 - i * 2, 415 + i * 9, 80 - i * 3, 2);
    hill(470, 12, "#1d1a2c", 2);
    g.fillStyle = "#14121f";
    for (let i = 0; i < 9; i++) {
      const x = 40 + i * 38 + (i % 3) * 7, h = 90 + (i % 4) * 25;
      g.beginPath(); g.moveTo(x, 480 - h); g.lineTo(x - 22, 485); g.lineTo(x + 22, 485); g.fill();
    }
    return c;
  }

  function fitCanvas(img, max = 1280) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /** Load a File / URL / dataURL as the Living Image picture (persists across sessions). */
  AW.setUserImage = function (src, engine) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = fitCanvas(img);
        AW.userImage = c;
        try { localStorage.setItem(KEY, c.toDataURL("image/jpeg", 0.86)); } catch (e) { /* storage full or blocked */ }
        if (engine && engine.scene && engine.scene.id === "image") engine.setTexture(c);
        resolve(c);
      };
      img.onerror = reject;
      img.src = src instanceof Blob ? URL.createObjectURL(src) : src;
    });
  };
  AW.clearUserImage = function (engine) {
    AW.userImage = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (engine && engine.scene && engine.scene.id === "image") engine.setTexture(paintDefault());
  };

  AW.registerScene({
    id: "image",
    name: "Living Image",
    blurb: "Drop in any picture and it becomes a slowly breathing ASCII painting. Your cursor works like a lantern.",
    tags: ["yours", "interactive"],
    style: "glyph",
    ramp: "classic",
    bg: "#08080b",
    cell: 5,
    aspect: 1.5,
    glow: 0.8,
    shimmer: 0.06,
    acceptsImage: true,
    ripple: { damp: 0.975, strength: 0.7, radius: 0.025 },
    init(api) {
      let src = AW.userImage;
      if (!src) {
        let saved = null;
        try { saved = localStorage.getItem(KEY); } catch (e) {}
        if (saved) { AW.setUserImage(saved, api.engine).catch(() => {}); }
        src = paintDefault();
      }
      api.setTexture(src);
      return {};
    },
    frag: /* glsl */ `
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      float T = uTexSize.x/uTexSize.y;
      vec2 tuv = uv;
      if (A > T) tuv.y = 0.5 + (uv.y - 0.5)*(T/A); else tuv.x = 0.5 + (uv.x - 0.5)*(A/T);
      tuv = 0.5 + (tuv - 0.5)*0.97 + 0.012*vec2(sin(t*0.07), cos(t*0.05));   // slow drift
      tuv += rippleGrad(uv)*0.02;
      vec3 c = texture(uTex, tuv).rgb;
      // breathing light sweep
      float sweep = 0.5 + 0.5*sin(dot(p, vec2(0.7, 0.4))*2.2 - t*0.25);
      c *= 0.86 + 0.24*sweep;
      // lantern
      vec2 dm = p - uMouseP;
      float lan = exp(-dot(dm, dm)/0.03);
      c *= 1.0 + uMouseOn*0.7*lan;
      c += vec3(1.0,0.7,0.35)*uMouseOn*lan*0.06;
      c = floor(c*14.0 + hash21(floor(uv*uGrid))*0.6)/14.0;    // painterly posterize + dither
      return shade(c);
    }
    `,
  });
})();


/* ── element.js ── */
/* <ascii-wall> — drop a live ASCIIWall scene into any page.
 *
 *   <script src="asciiwall.js"></script>
 *   <ascii-wall scene="koi" style="height:360px"></ascii-wall>
 *
 * Attributes: scene, density, glow, grain, speed, fps, tint, ramp, interactive ("false" to disable),
 *             contributions (URL of a contributions.json for the "garden" scene).
 * Pauses itself while scrolled off-screen. */
(function () {
  const AW = window.AsciiWall;
  if (!AW || customElements.get("ascii-wall")) return;
  const NUM = ["density", "glow", "grain", "speed", "fps"];

  class AsciiWallElement extends HTMLElement {
    static get observedAttributes() { return ["scene", "density", "glow", "grain", "speed", "fps", "tint", "ramp", "interactive"]; }

    connectedCallback() {
      if (this.engine) return;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `<style>
        :host { display:block; position:relative; min-height:160px; background:#07080c; overflow:hidden; border-radius:inherit; contain:content; }
        canvas { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; }
      </style><canvas part="canvas"></canvas>`;
      const src = this.getAttribute("contributions");
      if (src) AW.gardenDataUrl = src;
      try {
        this.engine = new AW.Engine(root.querySelector("canvas"), { scene: this.getAttribute("scene") || "koi", settings: this._settings() });
      } catch (e) {
        root.innerHTML = `<pre style="color:#8c877c;font:12px monospace;padding:16px">ascii-wall: WebGL2 is not available</pre>`;
        return;
      }
      this._io = new IntersectionObserver(([e]) => (e.isIntersecting ? this.engine.start() : this.engine.stop()));
      this._io.observe(this);
    }

    disconnectedCallback() {
      if (this._io) this._io.disconnect();
      if (this.engine) this.engine.destroy();
      this.engine = null;
    }

    attributeChangedCallback(name, _old, val) {
      if (!this.engine) return;
      if (name === "scene") this.engine.setScene(val);
      else this.engine.updateSettings(this._settings());
    }

    _settings() {
      const s = {};
      for (const k of NUM) if (this.hasAttribute(k)) s[k] = parseFloat(this.getAttribute(k));
      if (this.hasAttribute("tint")) s.tint = this.getAttribute("tint");
      if (this.hasAttribute("ramp")) s.ramp = this.getAttribute("ramp");
      if (this.hasAttribute("interactive")) s.interactive = this.getAttribute("interactive") !== "false";
      return s;
    }

    /** Convenience for scripts: el.setImage(fileOrUrl) switches to the Living Image scene. */
    setImage(src) {
      return AW.setUserImage(src, this.engine).then(() => this.setAttribute("scene", "image"));
    }
  }

  customElements.define("ascii-wall", AsciiWallElement);
})();
