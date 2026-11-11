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
