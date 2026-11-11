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
