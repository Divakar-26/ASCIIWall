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
