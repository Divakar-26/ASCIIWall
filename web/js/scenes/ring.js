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
