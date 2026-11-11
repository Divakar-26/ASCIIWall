/* ASCIIWall — glyph atlas builder.
 * Renders a ramp of characters (ordered sparse → dense) into a single-row
 * texture that the composite shader samples per cell. */
(function () {
  const AW = (window.AsciiWall = window.AsciiWall || {});

  // Ramps go from empty to full ink. The first char is always "nothing".
  AW.RAMPS = {
    soft:    " .·:-=+*%#@",
    classic: " .,:;-~=+*x%#&@",
    binary:  " .·:;10",
    tile:    " .-:;=+x()%&#@",
    dots:    " .·:•oO0@",
    blocks:  " ·░▒▓█",
    stars:   " .·+*✦",
    rain:    " .,'|:;!/\\",
    fire:    " .'`^:;+*%#@",
    dense:   " .'`^\",:;Il!i><~+_-?][}{1)(|tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    koi:     " .-:;=+koiKOI&#@",
    torii:   " .,:-=+*#%",
    sparkle: " .·:+*o•O@",
  };

  const FONT_STACK = '"JetBrains Mono","JetBrainsMono Nerd Font Mono","SF Mono",Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace';

  /** Build a canvas atlas: one row, `chars.length` cells of gw×gh px, white ink on black. */
  AW.buildAtlas = function (chars, opts = {}) {
    const list = Array.from(chars);
    const gw = opts.cellW || 48;
    const gh = opts.cellH || 64;
    const weight = opts.weight || 700;
    const c = document.createElement("canvas");
    c.width = gw * list.length;
    c.height = gh;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    // Size the font so the glyph fills the cell roughly like a terminal.
    const size = Math.max(5, Math.min(gh * 0.84, gw * 1.5));
    g.font = `${weight} ${size}px ${FONT_STACK}`;
    list.forEach((ch, i) => {
      if (ch === " ") return;
      if (ch === "█") { g.fillRect(i * gw, 0, gw, gh); return; }
      g.fillText(ch, i * gw + gw / 2, gh / 2 + size * 0.04);
    });
    return { canvas: c, count: list.length, gw, gh };
  };
})();
