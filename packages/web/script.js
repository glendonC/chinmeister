import createGlobe from 'https://esm.sh/cobe?bundle';

(() => {
  const palette = [
    { c1: '#d8ece6', c2: '#eef4fb' },
    { c1: '#e6e2f7', c2: '#f5f1fb' },
    { c1: '#f1dde4', c2: '#faf2f0' },
    { c1: '#dcebdd', c2: '#f0f5ea' },
    { c1: '#dbe6f3', c2: '#eff3fa' },
    { c1: '#efe4d7', c2: '#f7f0e6' },
  ];

  const markers = [];

  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hexToRgb(hex) {
    const value = hex.replace('#', '');
    return [
      Number.parseInt(value.slice(0, 2), 16) / 255,
      Number.parseInt(value.slice(2, 4), 16) / 255,
      Number.parseInt(value.slice(4, 6), 16) / 255,
    ];
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function mix(a, b, amount) {
    return a.map((value, index) => value + ((b[index] - value) * amount));
  }

  function tint(color, multiplier, lift = 0) {
    return color.map((channel) => clamp((channel * multiplier) + lift, 0, 1));
  }

  function deriveTheme(entry) {
    const top = hexToRgb(entry.c1);
    const bottom = hexToRgb(entry.c2);
    const midpoint = mix(top, bottom, 0.52);

    return {
      base: mix([0.93, 0.95, 0.97], midpoint, 0.16),
      marker: mix([0.16, 0.22, 0.34], midpoint, 0.08),
      glow: mix([0.97, 0.98, 1], midpoint, 0.18),
    };
  }

  function themeForSection(entry, sectionId) {
    const theme = deriveTheme(entry);

    if (sectionId === 'global-chat') {
      return {
        base: tint(theme.base, 1.01, 0.004),
        marker: tint(theme.marker, 1.04, 0.008),
        glow: tint(theme.glow, 1.02, 0.006),
      };
    }

    if (sectionId === 'agent-network') {
      return {
        base: tint(theme.base, 0.98, 0.006),
        marker: tint(theme.marker, 1.08, 0.016),
        glow: tint(theme.glow, 1.03, 0.01),
      };
    }

    if (sectionId === 'privacy') {
      return {
        base: tint(theme.base, 0.96, 0.008),
        marker: tint(theme.marker, 0.94, 0.008),
        glow: tint(theme.glow, 0.98, 0.006),
      };
    }

    return theme;
  }

  function animateArray(current, target, easing = 0.05) {
    return current.map((value, index) => value + ((target[index] - value) * easing));
  }

  const sectionMotion = {
    hero: { theta: -0.14, spin: reduceMotion ? 0 : 0.00048, scale: 1.08, offsetY: 4 },
    'global-chat': { theta: -0.1, spin: reduceMotion ? 0 : 0.00054, scale: 1.1, offsetY: -2 },
    'agent-network': { theta: -0.18, spin: reduceMotion ? 0 : 0.00046, scale: 1.06, offsetY: 8 },
    privacy: { theta: -0.08, spin: reduceMotion ? 0 : 0.00038, scale: 1.01, offsetY: 14 },
  };

  let activeSection = 'hero';
  let paletteIndex = 0;
  let currentTheme = themeForSection(palette[paletteIndex], activeSection);
  let targetTheme = themeForSection(palette[paletteIndex], activeSection);

  function applyPalette(index) {
    const entry = palette[index];
    body.style.setProperty('--c1', entry.c1);
    body.style.setProperty('--c2', entry.c2);
    targetTheme = themeForSection(entry, activeSection);
  }

  setInterval(() => {
    paletteIndex = (paletteIndex + 1) % palette.length;
    applyPalette(paletteIndex);
  }, 8000);

  const btn = document.getElementById('copy');
  const commandEl = document.getElementById('command');
  const commandBody = document.querySelector('.command-body');
  const switcher = document.querySelector('.install-switcher');
  const indicator = document.querySelector('.tab-indicator');
  const installTabs = Array.from(document.querySelectorAll('.install-tab'));
  const brandMark = document.querySelector('.brand-mark');
  const floatingUi = document.querySelector('.floating-ui');
  const mobileUtilityToggle = document.getElementById('mobile-utility-toggle');
  const mobileUtilityBackdrop = document.getElementById('mobile-utility-backdrop');
  const heroSection = document.querySelector('.hero');
  const heroPillRow = document.querySelector('.hero-pill-row');
  const sectionLinks = Array.from(document.querySelectorAll('[data-section-link]'));
  const storySections = Array.from(document.querySelectorAll('.story-section'));
  let selectedCommand = commandEl?.textContent?.trim() || 'npx chinwag';
  const mobileMenuQuery = window.matchMedia('(max-width: 840px)');

  function setMobileUtilityOpen(isOpen) {
    if (!floatingUi) {
      return;
    }

    const shouldOpen = isOpen && mobileMenuQuery.matches;
    floatingUi.classList.toggle('is-mobile-open', shouldOpen);
    mobileUtilityToggle?.setAttribute('aria-expanded', String(shouldOpen));
    body.classList.toggle('is-mobile-utility-open', shouldOpen);
  }

  function syncActiveIndicator() {
    if (!switcher || !indicator) {
      return;
    }

    const activeTab = switcher.querySelector('.install-tab.is-active');
    if (!activeTab) {
      return;
    }

    indicator.style.width = `${activeTab.offsetWidth}px`;
    indicator.style.setProperty('--indicator-x', `${activeTab.offsetLeft}px`);
  }

  function setSelectedCommand(command) {
    const isChanged = selectedCommand !== command;
    selectedCommand = command;

    if (commandEl) {
      commandEl.textContent = command;
    }

    if (isChanged && commandBody) {
      commandBody.classList.remove('is-switching');
      window.requestAnimationFrame(() => {
        commandBody.classList.add('is-switching');
      });
    }

    installTabs.forEach((tab) => {
      const isActive = tab.dataset.command === command;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-pressed', String(isActive));
    });

    syncActiveIndicator();
  }

  installTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const { command } = tab.dataset;
      if (command) {
        setSelectedCommand(command);
        setMobileUtilityOpen(false);
      }
    });
  });

  if (btn) {
    btn.addEventListener('click', async (event) => {
      event.stopPropagation();
      try {
        await navigator.clipboard.writeText(selectedCommand);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = selectedCommand;
        textarea.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      btn.classList.add('ok');
      setTimeout(() => btn.classList.remove('ok'), 1500);
    });
  }

  if (commandBody) {
    commandBody.addEventListener('animationend', () => {
      commandBody.classList.remove('is-switching');
    });
  }

  function setActiveSection(sectionId) {
    activeSection = sectionId;
    body.dataset.activeSection = sectionId;
    targetTheme = themeForSection(palette[paletteIndex], activeSection);

    sectionLinks.forEach((link) => {
      const isActive = link.dataset.sectionLink === sectionId;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    if (heroPillRow) {
      heroPillRow.classList.toggle('has-active', sectionId !== 'hero');
    }
  }

  function scrollToSection(sectionId, updateHistory = true) {
    const isHero = sectionId === 'hero';
    const section = isHero ? heroSection : document.getElementById(sectionId);
    if (!section) {
      return;
    }

    setActiveSection(sectionId);

    if (updateHistory) {
      if (isHero) {
        window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
      } else {
        window.history.pushState(null, '', `#${sectionId}`);
      }
    }

    if (isHero) {
      window.scrollTo({
        top: 0,
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
      return;
    }

    section.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  sectionLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const sectionId = link.dataset.sectionLink;
      if (!sectionId) {
        return;
      }

      event.preventDefault();
      setMobileUtilityOpen(false);
      scrollToSection(sectionId);
    });
  });

  if (brandMark) {
    brandMark.addEventListener('click', (event) => {
      event.preventDefault();
      setMobileUtilityOpen(false);
      scrollToSection('hero');
    });
  }

  if (mobileUtilityToggle) {
    mobileUtilityToggle.addEventListener('click', () => {
      const isOpen = floatingUi?.classList.contains('is-mobile-open');
      setMobileUtilityOpen(!isOpen);
    });
  }

  if (mobileUtilityBackdrop) {
    mobileUtilityBackdrop.addEventListener('click', () => {
      setMobileUtilityOpen(false);
    });
  }

  window.addEventListener('resize', syncActiveIndicator);
  window.addEventListener('resize', () => {
    if (!mobileMenuQuery.matches) {
      setMobileUtilityOpen(false);
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setMobileUtilityOpen(false);
    }
  });
  syncActiveIndicator();
  setMobileUtilityOpen(false);
  setActiveSection('hero');

  if (storySections.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (visibleEntry) {
        visibleEntry.target.classList.add('is-visible');
        setActiveSection(visibleEntry.target.id);
        return;
      }

      if (heroSection && window.scrollY < heroSection.offsetHeight * 0.45) {
        setActiveSection('hero');
      }
    }, {
      rootMargin: '-30% 0px -42% 0px',
      threshold: [0.18, 0.45, 0.72],
    });

    storySections.forEach((section) => sectionObserver.observe(section));
  }

  window.addEventListener('load', () => {
    const sectionId = window.location.hash.replace('#', '');
    if (sectionId === 'overview') {
      window.requestAnimationFrame(() => {
        scrollToSection('hero', false);
      });
      return;
    }

    if (sectionId && document.getElementById(sectionId)) {
      window.requestAnimationFrame(() => {
        scrollToSection(sectionId, false);
      });
    }
  });

  const canvas = document.getElementById('globe');
  if (!canvas) {
    return;
  }

  const state = {
    phi: 5.08,
    theta: -0.14,
    targetTheta: -0.14,
    autoSpin: reduceMotion ? 0 : 0.00048,
    currentScale: 1.08,
    targetScale: 1.08,
    currentOffsetY: 4,
    targetOffsetY: 4,
    dragSpin: 0,
    pointerX: 0,
    pointerY: 0,
    dragging: false,
    lastX: 0,
    width: 0,
    height: 0,
  };

  let globe;
  let frameId = 0;
  let resizeObserver;

  function syncCanvasSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(canvas.offsetWidth * dpr);
    if (!size || (size === state.width && size === state.height)) {
      return;
    }

    state.width = size;
    state.height = size;
    if (globe) {
      globe.update({ width: size, height: size });
    }
  }

  function render() {
    const motion = sectionMotion[activeSection] || sectionMotion.hero;

    currentTheme = {
      base: animateArray(currentTheme.base, targetTheme.base, 0.04),
      marker: animateArray(currentTheme.marker, targetTheme.marker, 0.045),
      glow: animateArray(currentTheme.glow, targetTheme.glow, 0.04),
    };

    state.autoSpin += (motion.spin - state.autoSpin) * 0.08;
    state.targetScale += (motion.scale - state.targetScale) * 0.08;
    state.currentScale += (state.targetScale - state.currentScale) * 0.08;
    state.targetOffsetY += (motion.offsetY - state.targetOffsetY) * 0.08;
    state.currentOffsetY += (state.targetOffsetY - state.currentOffsetY) * 0.08;
    state.pointerX *= 0.96;
    state.pointerY *= 0.94;
    state.dragSpin *= 0.9;
    state.targetTheta = motion.theta + (state.pointerY * 0.05);
    state.theta += (state.targetTheta - state.theta) * 0.08;
    state.phi += state.autoSpin + state.dragSpin + (state.pointerX * 0.00014);

    globe.update({
      phi: state.phi,
      theta: state.theta,
      width: state.width,
      height: state.height,
      baseColor: currentTheme.base,
      markerColor: currentTheme.marker,
      glowColor: currentTheme.glow,
      opacity: window.innerWidth < 720 ? 0.68 : 0.82,
      scale: state.currentScale,
      offset: [0, state.currentOffsetY],
    });

    frameId = window.requestAnimationFrame(render);
  }

  function destroyGlobe() {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    if (globe) {
      globe.destroy();
      globe = null;
    }
  }

  function createAmbientGlobe() {
    if (globe) {
      return;
    }

    syncCanvasSize();
    if (!state.width || !state.height) {
      return;
    }

    globe = createGlobe(canvas, {
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      width: state.width,
      height: state.height,
      phi: state.phi,
      theta: state.theta,
      dark: 0,
      diffuse: 0.82,
      mapSamples: 14000,
      mapBrightness: 1.16,
      mapBaseBrightness: 0.34,
      baseColor: currentTheme.base,
      markerColor: currentTheme.marker,
      glowColor: currentTheme.glow,
      markers,
      markerElevation: 0.01,
      opacity: window.innerWidth < 720 ? 0.68 : 0.82,
      scale: state.currentScale,
      offset: [0, state.currentOffsetY],
      context: { alpha: true, antialias: true },
    });

    resizeObserver = new ResizeObserver(syncCanvasSize);
    resizeObserver.observe(canvas);
    frameId = window.requestAnimationFrame(render);
  }

  function handlePointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) - 0.5;
    const relativeY = ((event.clientY - rect.top) / rect.height) - 0.5;

    state.pointerX = clamp(relativeX, -0.5, 0.5);
    state.pointerY = clamp(relativeY, -0.5, 0.5);

    if (state.dragging) {
      const deltaX = event.clientX - state.lastX;
      state.lastX = event.clientX;
      state.phi -= deltaX * 0.0031;
      state.dragSpin = -deltaX * 0.00004;
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    state.dragging = true;
    state.lastX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', (event) => {
    state.dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointercancel', () => {
    state.dragging = false;
  });
  canvas.addEventListener('pointerleave', () => {
    state.dragging = false;
    state.pointerX = 0;
    state.pointerY = 0;
  });

  window.addEventListener('resize', syncCanvasSize);
  window.addEventListener('pagehide', destroyGlobe);

  createAmbientGlobe();
})();
