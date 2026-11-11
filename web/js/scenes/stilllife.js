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
