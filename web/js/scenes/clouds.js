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
