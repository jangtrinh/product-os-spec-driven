/* Standard skin: the brand cube. Baked frames drawn as SVG paths by one requestAnimationFrame loop that exists only while it plays.
   Reduced motion keeps frame 0 static. Fill and stroke come from CSS (.brand-mark). */
const SVG_NS = 'http://www.w3.org/2000/svg';
const CUBE_LAST = CUBE_FRAMES.length - 1;
const cubeOutline = (f) => `M${f[0]},${f[1]}L${f[2]},${f[3]}L${f[4]},${f[5]}L${f[6]},${f[7]}Z`;

function mountCubePlayer(host) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', CUBE_VIEW_BOX);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const paths = CUBE_FRAMES[0].flatMap(() => {
    const fill = svg.appendChild(document.createElementNS(SVG_NS, 'path'));
    const edge = svg.appendChild(document.createElementNS(SVG_NS, 'path'));
    edge.setAttribute('fill-opacity', '0');
    return [fill, edge];
  });
  const draw = (n) => CUBE_FRAMES[n].forEach((face, i) => { const d = cubeOutline(face); paths[2 * i].setAttribute('d', d); paths[2 * i + 1].setAttribute('d', d); });
  draw(0);
  host.appendChild(svg);
  let raf = 0, startedAt = 0, elapsed = 0, playing = false;
  const tick = (now) => {
    elapsed = Math.max(0, now - startedAt);
    const n = Math.min(CUBE_LAST, Math.floor((elapsed * CUBE_FRAME_RATE) / 1000));
    draw(n);
    if (n === CUBE_LAST) { playing = false; return; }
    raf = requestAnimationFrame(tick);
  };
  const run = (from) => { playing = true; startedAt = performance.now() - from; raf = requestAnimationFrame(tick); };
  return {
    play: () => { cancelAnimationFrame(raf); run(0); },
    pause: () => { if (playing) { cancelAnimationFrame(raf); playing = false; } },
    resume: () => { if (!playing && elapsed > 0 && elapsed < (CUBE_LAST * 1000) / CUBE_FRAME_RATE) run(elapsed); },
    isPlaying: () => playing,
    destroy: () => { cancelAnimationFrame(raf); playing = false; svg.remove(); },
  };
}

function mountBrand() {
  const host = $('.brand-mark');
  if (!host) return;
  host.replaceChildren();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let player = mountCubePlayer(host);
  const sync = () => { host.dataset.brandCube = motion.matches ? 'static' : 'animated'; };
  sync();
  if (!motion.matches) player.play();
  $('#brand').addEventListener('mouseenter', () => { if (!motion.matches && !player.isPlaying()) player.play(); });
  let wasPlaying = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { wasPlaying = player.isPlaying(); player.pause(); } else if (wasPlaying) { wasPlaying = false; player.resume(); }
  });
  motion.addEventListener('change', () => { player.destroy(); player = mountCubePlayer(host); sync(); if (!motion.matches) player.play(); });
}
