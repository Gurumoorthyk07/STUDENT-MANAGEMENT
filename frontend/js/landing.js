(function () {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  const canvas = document.getElementById('techCanvas');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem('sms-theme', theme);
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  }

  if (!canvas || reduceMotion) return;

  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let nodes = [];
  let rafId = 0;
  let dpr = 1;

  function themeColors() {
    const dark = root.getAttribute('data-theme') === 'dark';
    return {
      node: dark ? 'rgba(45, 212, 191, 0.85)' : 'rgba(13, 148, 136, 0.75)',
      line: dark ? 'rgba(45, 212, 191, 0.18)' : 'rgba(13, 148, 136, 0.16)',
      pulse: dark ? 'rgba(56, 189, 248, 0.55)' : 'rgba(2, 132, 199, 0.45)'
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.max(28, Math.floor((width * height) / 38000));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: 1.2 + Math.random() * 1.8
    }));
  }

  function draw() {
    const colors = themeColors();
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      a.x += a.vx;
      a.y += a.vy;

      if (a.x < 0 || a.x > width) a.vx *= -1;
      if (a.y < 0 || a.y > height) a.vy *= -1;

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 140) {
          ctx.beginPath();
          ctx.strokeStyle = colors.line;
          ctx.globalAlpha = 1 - dist / 140;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      ctx.beginPath();
      ctx.fillStyle = i % 7 === 0 ? colors.pulse : colors.node;
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
    }

    rafId = requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener('resize', resize);

  const observer = new MutationObserver(() => {
    // redraw uses live theme colors each frame
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(rafId);
    observer.disconnect();
  });
})();
