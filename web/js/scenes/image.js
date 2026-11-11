/* Living Image — drop in any picture and it becomes a breathing ASCII painting with a lantern cursor. */
(function () {
  const AW = window.AsciiWall;
  const KEY = "asciiwall:image";

  function paintDefault() {
    const c = document.createElement("canvas");
    c.width = 960; c.height = 600;
    const g = c.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, 380);
    sky.addColorStop(0, "#1b2347"); sky.addColorStop(0.55, "#7a4a6e"); sky.addColorStop(1, "#f2a46b");
    g.fillStyle = sky; g.fillRect(0, 0, 960, 600);
    g.filter = "blur(18px)";
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(${240 - i * 4},${170 + i * 3},${150 + i * 4},0.35)`;
      g.beginPath(); g.ellipse(80 + i * 70, 80 + (i % 4) * 40, 120, 26, 0, 0, Math.PI * 2); g.fill();
    }
    g.filter = "blur(6px)";
    g.fillStyle = "#ffe2a8"; g.beginPath(); g.arc(640, 330, 46, 0, Math.PI * 2); g.fill();
    g.filter = "none";
    const hill = (y, amp, col, seed) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 600);
      for (let x = 0; x <= 960; x += 8) g.lineTo(x, y + Math.sin(x / 120 + seed) * amp + Math.sin(x / 47 + seed * 3) * amp * 0.3);
      g.lineTo(960, 600); g.fill();
    };
    hill(350, 22, "#5a3b5c", 1); hill(380, 18, "#3b2c4a", 4);
    const lake = g.createLinearGradient(0, 400, 0, 600);
    lake.addColorStop(0, "#d48a6a"); lake.addColorStop(1, "#22233d");
    g.fillStyle = lake; g.fillRect(0, 410, 960, 190);
    g.fillStyle = "rgba(255,226,168,0.5)";
    for (let i = 0; i < 18; i++) g.fillRect(600 + Math.sin(i) * 30 - i * 2, 415 + i * 9, 80 - i * 3, 2);
    hill(470, 12, "#1d1a2c", 2);
    g.fillStyle = "#14121f";
    for (let i = 0; i < 9; i++) {
      const x = 40 + i * 38 + (i % 3) * 7, h = 90 + (i % 4) * 25;
      g.beginPath(); g.moveTo(x, 480 - h); g.lineTo(x - 22, 485); g.lineTo(x + 22, 485); g.fill();
    }
    return c;
  }

  function fitCanvas(img, max = 1280) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /** Load a File / URL / dataURL as the Living Image picture (persists across sessions). */
  AW.setUserImage = function (src, engine) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = fitCanvas(img);
        AW.userImage = c;
        try { localStorage.setItem(KEY, c.toDataURL("image/jpeg", 0.86)); } catch (e) { /* storage full or blocked */ }
        if (engine && engine.scene && engine.scene.id === "image") engine.setTexture(c);
        resolve(c);
      };
      img.onerror = reject;
      img.src = src instanceof Blob ? URL.createObjectURL(src) : src;
    });
  };
  AW.clearUserImage = function (engine) {
    AW.userImage = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (engine && engine.scene && engine.scene.id === "image") engine.setTexture(paintDefault());
  };

  AW.registerScene({
    id: "image",
    name: "Living Image",
    blurb: "Drop in any picture and it becomes a slowly breathing ASCII painting. Your cursor works like a lantern.",
    tags: ["yours", "interactive"],
    style: "glyph",
    ramp: "classic",
    bg: "#08080b",
    cell: 5,
    aspect: 1.5,
    glow: 0.8,
    shimmer: 0.06,
    acceptsImage: true,
    ripple: { damp: 0.975, strength: 0.7, radius: 0.025 },
    init(api) {
      let src = AW.userImage;
      if (!src) {
        let saved = null;
        try { saved = localStorage.getItem(KEY); } catch (e) {}
        if (saved) { AW.setUserImage(saved, api.engine).catch(() => {}); }
        src = paintDefault();
      }
      api.setTexture(src);
      return {};
    },
    frag: /* glsl */ `
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      float T = uTexSize.x/uTexSize.y;
      vec2 tuv = uv;
      if (A > T) tuv.y = 0.5 + (uv.y - 0.5)*(T/A); else tuv.x = 0.5 + (uv.x - 0.5)*(A/T);
      tuv = 0.5 + (tuv - 0.5)*0.97 + 0.012*vec2(sin(t*0.07), cos(t*0.05));   // slow drift
      tuv += rippleGrad(uv)*0.02;
      vec3 c = texture(uTex, tuv).rgb;
      // breathing light sweep
      float sweep = 0.5 + 0.5*sin(dot(p, vec2(0.7, 0.4))*2.2 - t*0.25);
      c *= 0.86 + 0.24*sweep;
      // lantern
      vec2 dm = p - uMouseP;
      float lan = exp(-dot(dm, dm)/0.03);
      c *= 1.0 + uMouseOn*0.7*lan;
      c += vec3(1.0,0.7,0.35)*uMouseOn*lan*0.06;
      c = floor(c*14.0 + hash21(floor(uv*uGrid))*0.6)/14.0;    // painterly posterize + dither
      return shade(c);
    }
    `,
  });
})();
