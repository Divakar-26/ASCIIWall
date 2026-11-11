/* Black Hole — rays are bent around a Schwarzschild black hole; the accretion disk is lensed
 * over and under the shadow, Doppler-brightened on the approaching side. Drag to orbit; tap for a flare. */
(function () {
  window.AsciiWall.registerScene({
    id: "blackhole",
    name: "Black Hole",
    blurb: "A lensed accretion disk wraps over and under the event horizon, brighter on the side spinning toward you. Drag to orbit and tap for a flare.",
    tags: ["space", "3d", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#030304",
    cell: 5,
    aspect: 1.8,
    glow: 1.15,
    underlay: 0.3,
    edges: 0.35,
    shimmer: 0.04,
    dragToOrbit: true,
    autoOrbit: 0.03,
    orbit: [0.0, 0.0],
    init() { return { flare: 99 }; },
    update(st, api) {
      st.flare += api.dt;
      if (api.clicks.length) st.flare = 0;
      api.data[0] = st.flare < 3 ? Math.exp(-st.flare * 1.5) : 0;
    },
    frag: /* glsl */ `
    vec3 stars(vec3 d){
      vec2 sph = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
      vec2 g = sph*vec2(70.0, 70.0);
      vec2 i = floor(g), f = fract(g) - 0.5;
      float h = hash21(i);
      float s = step(0.965, h)*smoothstep(0.35, 0.0, length(f + (hash22(i) - 0.5)*0.5));
      float band = exp(-pow(d.y*3.0 + 0.4*sin(sph.x*2.0), 2.0))*fbm3(sph*4.0);
      return vec3(0.85,0.88,1.0)*s*(0.4 + 0.6*hash21(i + 3.0)) + vec3(0.12,0.1,0.14)*band*0.3;
    }

    vec4 disk(vec3 hp, vec3 dir, float t, float flare){
      float rr = length(hp.xz);
      float rin = 2.6, rout = 12.0;
      if (rr < rin || rr > rout) return vec4(0.0);
      float ang = atan(hp.z, hp.x) + t*1.6/pow(rr, 1.5);
      vec2 q = rr*vec2(cos(ang), sin(ang));
      float n = fbm(q*0.9 + 3.0);
      float rings = 0.55 + 0.45*sin(rr*7.0 + n*5.0);
      float I = pow(rin/rr, 1.9)*smoothstep(rin, rin + 0.6, rr)*smoothstep(rout, rout - 4.0, rr);
      vec3 v = normalize(vec3(-hp.z, 0.0, hp.x));
      float beam = clamp(1.0 + 0.55*dot(v, -dir), 0.3, 1.8);
      beam *= sqrt(beam);
      vec3 c = mix(vec3(1.0,0.38,0.1), vec3(1.0,0.86,0.66), smoothstep(0.08, 0.7, I*beam));
      float e = I*(0.55 + 1.0*n*rings)*beam*(1.0 + flare*2.5);
      return vec4(c*e*2.2, clamp(e*1.4, 0.0, 0.92));
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      float flare = uData[0].x;
      float yaw = uOrbit.x;
      float pitch = clamp(0.11 + uOrbit.y*0.6, -1.2, 1.2);
      float D = 19.0;
      vec3 ro = vec3(sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))*D;
      vec3 fw = normalize(-ro);
      vec3 rt = normalize(cross(vec3(0.0,1.0,0.0), fw));
      vec3 up = cross(fw, rt);
      vec3 vel = normalize(fw*1.45 + rt*p.x + up*p.y);
      vec3 pos = ro;
      float h2 = dot(cross(pos, vel), cross(pos, vel));
      vec3 col = vec3(0.0); float a = 0.0;
      bool absorbed = false;
      for (int i=0; i<220; i++){
        float r2 = dot(pos, pos);
        float r = sqrt(r2);
        if (r < 1.0) { absorbed = true; break; }
        float dt = clamp(0.09*r, 0.035, 1.6);
        vec3 prev = pos;
        vel += -1.5*h2*pos/(r2*r2*r)*dt;
        pos += vel*dt;
        if (prev.y*pos.y < 0.0) {
          vec3 hp = mix(prev, pos, prev.y/(prev.y - pos.y));
          vec4 d = disk(hp, normalize(vel), t, flare);
          col += (1.0 - a)*d.rgb*d.a; a += (1.0 - a)*d.a;
          if (a > 0.97) break;
        }
        if (r > D*1.6 && dot(pos, vel) > 0.0) break;
      }
      if (!absorbed) col += (1.0 - a)*stars(normalize(vel));
      return shade(col, pow(clamp(luma(col)*1.1, 0.0, 1.0), 0.65));
    }
    `,
  });
})();
