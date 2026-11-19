// Confetti over the page for a win: more of it for more stars. Drawn on a canvas that covers
// the window and goes away by itself; nothing at all when the system asks for reduced motion.

const COLOURS = ["#f2b233", "#4fc3f7", "#ef5350", "#66bb6a", "#ab47bc", "#ffffff"];

/**
 * @param {Window} win
 * @param {number} amount how much: 1 for one star, up to about 4
 */
export function confetti(win, amount) {
  if (win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const doc = win.document;
  const canvas = doc.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  const ratio = win.devicePixelRatio || 1;
  const w = win.innerWidth;
  const h = win.innerHeight;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  doc.body.append(canvas);
  const g = canvas.getContext("2d");
  if (!g) {
    canvas.remove();
    return;
  }
  g.scale(ratio, ratio);

  const count = Math.round(50 * amount);
  const bits = Array.from({ length: count }, (_, i) => {
    // two bursts, from the lower corners, up and towards the middle
    const left = i % 2 === 0;
    const angle = (left ? -60 : -120) * Math.PI / 180 + (Math.random() - 0.5) * 0.9;
    const speed = (0.55 + Math.random() * 0.6) * h * 1.6;
    return {
      x: left ? w * 0.08 : w * 0.92,
      y: h * 0.95,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      spin: (Math.random() - 0.5) * 14,
      turn: Math.random() * Math.PI,
      size: 6 + Math.random() * 6,
      colour: COLOURS[i % COLOURS.length],
    };
  });

  const LIFE = 2.8;
  let last = performance.now();
  let age = 0;
  /** @param {number} now */
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    age += dt;
    g.clearRect(0, 0, w, h);
    g.globalAlpha = Math.max(0, Math.min(1, (LIFE - age) / 0.6));
    for (const b of bits) {
      b.vy += h * 1.4 * dt; // gravity
      b.vx *= 1 - 1.6 * dt; // air
      b.vy *= 1 - 1.6 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.turn += b.spin * dt;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.turn);
      g.scale(1, Math.cos(b.turn * 1.7)); // a flat piece of paper, flipping over
      g.fillStyle = b.colour;
      g.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
      g.restore();
    }
    if (age < LIFE) win.requestAnimationFrame(frame);
    else canvas.remove();
  };
  win.requestAnimationFrame(frame);
}
