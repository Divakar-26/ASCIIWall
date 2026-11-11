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
