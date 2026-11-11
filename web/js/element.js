/* <ascii-wall> — drop a live ASCIIWall scene into any page.
 *
 *   <script src="asciiwall.js"></script>
 *   <ascii-wall scene="koi" style="height:360px"></ascii-wall>
 *
 * Attributes: scene, density, glow, grain, speed, fps, tint, ramp, interactive ("false" to disable),
 *             contributions (URL of a contributions.json for the "garden" scene).
 * Pauses itself while scrolled off-screen. */
(function () {
  const AW = window.AsciiWall;
  if (!AW || customElements.get("ascii-wall")) return;
  const NUM = ["density", "glow", "grain", "speed", "fps"];

  class AsciiWallElement extends HTMLElement {
    static get observedAttributes() { return ["scene", "density", "glow", "grain", "speed", "fps", "tint", "ramp", "interactive"]; }

    connectedCallback() {
      if (this.engine) return;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `<style>
        :host { display:block; position:relative; min-height:160px; background:#07080c; overflow:hidden; border-radius:inherit; contain:content; }
        canvas { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; }
      </style><canvas part="canvas"></canvas>`;
      const src = this.getAttribute("contributions");
      if (src) AW.gardenDataUrl = src;
      try {
        this.engine = new AW.Engine(root.querySelector("canvas"), { scene: this.getAttribute("scene") || "koi", settings: this._settings() });
      } catch (e) {
        root.innerHTML = `<pre style="color:#8c877c;font:12px monospace;padding:16px">ascii-wall: WebGL2 is not available</pre>`;
        return;
      }
      this._io = new IntersectionObserver(([e]) => (e.isIntersecting ? this.engine.start() : this.engine.stop()));
      this._io.observe(this);
    }

    disconnectedCallback() {
      if (this._io) this._io.disconnect();
      if (this.engine) this.engine.destroy();
      this.engine = null;
    }

    attributeChangedCallback(name, _old, val) {
      if (!this.engine) return;
      if (name === "scene") this.engine.setScene(val);
      else this.engine.updateSettings(this._settings());
    }

    _settings() {
      const s = {};
      for (const k of NUM) if (this.hasAttribute(k)) s[k] = parseFloat(this.getAttribute(k));
      if (this.hasAttribute("tint")) s.tint = this.getAttribute("tint");
      if (this.hasAttribute("ramp")) s.ramp = this.getAttribute("ramp");
      if (this.hasAttribute("interactive")) s.interactive = this.getAttribute("interactive") !== "false";
      return s;
    }

    /** Convenience for scripts: el.setImage(fileOrUrl) switches to the Living Image scene. */
    setImage(src) {
      return AW.setUserImage(src, this.engine).then(() => this.setAttribute("scene", "image"));
    }
  }

  customElements.define("ascii-wall", AsciiWallElement);
})();
