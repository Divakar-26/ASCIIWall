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
