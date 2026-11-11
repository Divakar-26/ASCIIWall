/* Moonlit Tide — dashes follow the swell, foam crests bloom into dots, your cursor leaves a wake. */
(function () {
  window.AsciiWall.registerScene({
    id: "tide",
    name: "Moonlit Tide",
    blurb: "A night sea drawn as dashes that follow the swell, with foam crests as dots. Sweep across the water to leave a wake.",
    tags: ["water", "night", "interactive"],
    style: "flow",
    ramp: " .",
    bg: "#04070f",
    cell: 6.5,
    aspect: 1.45,
    glow: 0.7,
    shimmer: 0.05,
    trailDecay: 0.992,
    ripple: { damp: 0.988, strength: 1.4, radius: 0.03, drop: 2.5 },
    frag: /* glsl */ `
    float swell(vec2 q, float t){
      vec2 d1 = normalize(vec2(0.38, 1.0)), d2 = normalize(vec2(-0.5, 1.0)), d3 = normalize(vec2(1.0, 0.3));
      float w1 = dot(q,d1)*6.5 - t*0.9 + fbm3(q*1.6)*2.6;
      float w2 = dot(q,d2)*10.5 - t*1.25 + fbm3(q*2.7+5.0)*2.2;
      float w3 = dot(q,d3)*17.0 - t*1.8;
      float h = pow(1.0 - abs(sin(w1*0.5)), 3.0)*0.95;
      h += pow(1.0 - abs(sin(w2*0.5)), 2.2)*0.45;
      h += sin(w3)*0.1;
      h += (fbm3(q*4.5 + vec2(t*0.18, -t*0.12)) - 0.5)*0.7;
      return h;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      // a touch of perspective: the far (top) sea is compressed
      vec2 q = vec2(p.x*(1.0 + uv.y*0.6), p.y*(1.0 + uv.y*0.9));
      float e = 1.2/uGrid.y;
      float h  = swell(q, t);
      float hx = swell(q+vec2(e,0.0), t) - h;
      float hy = swell(q+vec2(0.0,e), t) - h;
      vec2 grad = vec2(hx, hy)/e;
      float rp = ripple(uv);
      grad += rippleGrad(uv)*6.0;
      h += rp*0.35;

      float ang = mod(atan(grad.x, -grad.y), PI)/PI;   // dash runs along the crest
      float tr = trail(uv);
      float foam = smoothstep(0.82, 1.15, h + (noise(q*22.0 + t*0.6)-0.5)*0.45);
      foam += tr*smoothstep(0.35, 0.75, noise(q*30.0 + vec2(t*0.4, 0.0)))*1.3;
      foam += smoothstep(0.35, 0.8, abs(rp))*0.7;

      vec3 water = mix(vec3(0.05,0.13,0.3), vec3(0.11,0.33,0.68), clamp(h*0.55 + 0.35, 0.0, 1.0));
      water *= (0.75 + 0.35*smoothstep(-0.5, 0.5, p.y)) * (0.7 + 0.6*fbm3(q*1.3 + vec2(t*0.05, 0.0)));       // brighter toward the horizon

      // moon glitter path
      float mx = 0.2*uAspect;
      float path = exp(-pow((p.x - mx)*(4.0 + (0.5-p.y)*3.0), 2.0)) * smoothstep(-0.7, 0.45, p.y);
      float glint = step(0.72, hash21(floor(uv*uGrid) + floor(t*2.5)*7.0)) * path * smoothstep(0.1, 0.7, h);
      water += vec3(0.25,0.3,0.4)*path*0.5;

      vec3 c = mix(water, vec3(0.86,0.92,1.0), clamp(foam + glint, 0.0, 1.0));
      return vec4(c, ang);
    }
    `,
  });
})();
