/* Earthrise — a crescent Earth: oceans with sun glint, drifting clouds, city lights on the night side,
 * a thin blue atmosphere. Drag to spin the globe; your cursor moves the sun. */
(function () {
  window.AsciiWall.registerScene({
    id: "earth",
    name: "Earthrise",
    blurb: "A crescent Earth with glinting oceans, drifting clouds and city lights on the night side. Drag to spin it, and move your cursor to move the sun.",
    tags: ["space", "3d", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#020205",
    cell: 5,
    aspect: 1.8,
    glow: 1.0,
    underlay: 0.35,
    edges: 0.4,
    shimmer: 0.04,
    dragToOrbit: true,
    autoOrbit: 0.02,
    orbit: [0.0, 0.0],
    init() { return { sx: 0.95, sy: 0.25 }; },
    update(st, api) {
      const m = api.mouse;
      const tx = m.present ? Math.max(-1.2, Math.min(1.2, (m.px - 0.05) * 2.2)) : 0.95;
      const ty = m.present ? Math.max(-1, Math.min(1, m.py * 2.0)) : 0.25;
      st.sx += (tx - st.sx) * Math.min(1, api.dt * 1.5);
      st.sy += (ty - st.sy) * Math.min(1, api.dt * 1.5);
      api.data[0] = st.sx; api.data[1] = st.sy;
    },
    frag: /* glsl */ `
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      vec2 C = vec2(-0.12*uAspect, -0.02);
      float R = 0.4;
      vec3 L = normalize(vec3(uData[0].x, uData[0].y, -0.45));
      // stars
      vec2 si = floor(uv*uGrid*0.5);
      vec3 col = vec3(0.8,0.85,1.0)*step(0.992, hash21(si))*hash21(si + 4.0)*0.8;
      vec2 q = p - C;
      float d = length(q);
      // atmosphere halo outside the limb
      float limb = d - R;
      if (limb > 0.0) {
        vec3 n0 = normalize(vec3(q, 0.0));
        float sunSide = clamp(dot(n0, L)*0.8 + 0.35, 0.0, 1.0);
        col += vec3(0.25,0.55,1.0)*exp(-limb*55.0)*sunSide*0.9;
      } else {
        vec3 n = vec3(q, -sqrt(R*R - d*d))/R;               // facing the camera (-z)
        mat3 spin = rotX(0.35 + uOrbit.y*0.6)*rotY(uOrbit.x*1.3 + t*0.03);
        vec3 g = spin*n;                                        // globe coords
        float land = fbm3d(g*2.3 + 1.7) + 0.35*noise3(g*7.0);
        bool isLand = land > 0.62;
        float diff = dot(n, L);
        float day = smoothstep(-0.08, 0.2, diff);
        vec3 c;
        if (isLand) {
          float dry = smoothstep(0.55, 0.75, noise3(g*3.1 + 9.0));
          c = mix(vec3(0.16,0.32,0.12), vec3(0.62,0.48,0.3), dry);
          c *= 0.7 + 0.5*noise3(g*25.0);
        } else {
          c = mix(vec3(0.02,0.07,0.22), vec3(0.05,0.18,0.38), smoothstep(0.45, 0.62, land));
        }
        float ice = smoothstep(0.78, 0.86, abs(g.y) + 0.05*noise3(g*9.0));
        c = mix(c, vec3(0.9,0.93,0.97), ice);
        vec3 lit = c*(0.05 + 1.1*max(diff, 0.0));
        // ocean glint
        if (!isLand) {
          vec3 h = normalize(L + vec3(0.0, 0.0, -1.0));
          lit += vec3(1.0,0.92,0.8)*pow(max(dot(n, h), 0.0), 80.0)*1.4*day;
        }
        // clouds (+ their shadows)
        vec3 gc = rotY(t*0.012)*g;
        float cl = smoothstep(0.52, 0.72, fbm3d(gc*3.4 + vec3(0.0, t*0.004, 0.0)));
        lit = mix(lit, vec3(0.95)*(0.06 + 1.0*max(diff, 0.0)), cl*0.92);
        // city lights on the night side
        if (isLand && diff < 0.05) {
          float city = step(0.86, hash31(floor(g*140.0)))*smoothstep(0.45, 0.7, noise3(g*6.0 + 3.0));
          lit += vec3(1.0,0.68,0.32)*city*(1.0 - cl)*smoothstep(0.05, -0.15, diff)*1.3;
        }
        // atmosphere tint at the rim
        float fres = pow(1.0 - (-n.z), 3.0);
        lit += vec3(0.2,0.45,1.0)*fres*smoothstep(-0.3, 0.4, diff)*0.7;
        col = lit;
      }
      // distant moon
      vec2 mq = p - vec2(0.33*uAspect, 0.27);
      if (length(mq) < 0.035) {
        vec3 mn = vec3(mq, -sqrt(max(0.0, 0.035*0.035 - dot(mq, mq))))/0.035;
        col = vec3(0.75,0.74,0.72)*(0.6 + 0.4*noise(mq*300.0))*max(dot(mn, L), 0.02);
      }
      return shade(col, pow(clamp(luma(col)*1.2, 0.0, 1.0), 0.75));
    }
    `,
  });
})();
