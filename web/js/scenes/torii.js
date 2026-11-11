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
