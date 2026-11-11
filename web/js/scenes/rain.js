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
