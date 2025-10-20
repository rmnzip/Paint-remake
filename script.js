/* ==========================================================
   Paint 98 — V2
   - Surface virtuelle (grande) pour dessiner
   - Canvas visible = fenêtre (scroll + zoom)
   - Outils : crayon, gomme, ligne, rectangle (plein/contour),
              ellipse (plein/contour), pot de peinture, pipette, zoom
   - Palette carrée, couleurs primaire/secondaire (clic gauche/droit)
   - Barres de défilement FONCTIONNELLES (flèches, rail, drag)
   ========================================================== */

(function () {
  // --- DOM
  const viewCanvas = document.getElementById('viewCanvas');
  const vctx = viewCanvas.getContext('2d');
  const toolButtons = document.querySelectorAll('.tool[data-tool]');
  const sizeButtons = document.querySelectorAll('.size-dot');
  const paletteButtons = document.querySelectorAll('.palette .color');
  const primarySwatch = document.getElementById('primarySwatch');
  const secondarySwatch = document.getElementById('secondarySwatch');
  const newBtn = document.getElementById('newBtn');
  const coordsEl = document.getElementById('coords');

  const vScroll = document.getElementById('vScroll');
  const hScroll = document.getElementById('hScroll');
  const vThumb = vScroll.querySelector('.thumb');
  const hThumb = hScroll.querySelector('.thumb');
  const vTrack = vScroll.querySelector('.track');
  const hTrack = hScroll.querySelector('.track');

  // --- Surface virtuelle (hors-écran) : la "vraie" feuille
  const SURFACE_WIDTH = 1600;
  const SURFACE_HEIGHT = 1200;
  const surface = document.createElement('canvas');
  surface.width = SURFACE_WIDTH;
  surface.height = SURFACE_HEIGHT;
  const sctx = surface.getContext('2d');

  // Remplir blanc par défaut (fond Paint blanc)
  sctx.fillStyle = '#FFFFFF';
  sctx.fillRect(0, 0, SURFACE_WIDTH, SURFACE_HEIGHT);

  // --- État
  const state = {
    tool: 'pencil',
    drawing: false,
    lineWidth: 1,
    colorPrimary: '#000000',
    colorSecondary: '#FFFFFF',
    startSX: 0, startSY: 0, // coords sur surface virtuelle
    lastSX: 0, lastSY: 0,
    viewX: 0,   // coin haut-gauche de la fenêtre sur la surface
    viewY: 0,
    zoom: 1.0,  // facteur de zoom (1 = 100%)
    snapshot: null
  };

  // --- Palette visuelle
  paletteButtons.forEach(btn => {
    const c = btn.getAttribute('data-color');
    btn.style.backgroundColor = c;
  });
  updateSwatches();

  // --- Sélection d'outil
  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => selectTool(btn.getAttribute('data-tool')));
  });

  function selectTool(name) {
    state.tool = name;
    toolButtons.forEach(b => b.classList.toggle('selected', b.getAttribute('data-tool') === name));
    viewCanvas.style.cursor = (name === 'zoom') ? 'zoom-in' : 'crosshair';
  }

  // --- Tailles
  sizeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.lineWidth = parseInt(btn.getAttribute('data-size'), 10);
    });
  });

  // --- Couleurs : gauche = primaire, droit = secondaire
  paletteButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.colorPrimary = btn.getAttribute('data-color');
      updateSwatches();
    });
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      state.colorSecondary = btn.getAttribute('data-color');
      updateSwatches();
    });
  });

  function updateSwatches() {
    primarySwatch.style.backgroundColor = state.colorPrimary;
    secondarySwatch.style.backgroundColor = state.colorSecondary;
  }

  // --- Nouveau : nettoie la surface (blanc)
  newBtn.addEventListener('click', () => {
    sctx.fillStyle = '#FFFFFF';
    sctx.fillRect(0, 0, SURFACE_WIDTH, SURFACE_HEIGHT);
    render();
  });

  // --- Coordonnées utilitaires
  // Convertit une position souris (dans le canvas visible) vers la surface (en tenant compte du zoom et du scroll).
  function toSurfaceCoords(evt) {
    const rect = viewCanvas.getBoundingClientRect();
    const vx = evt.clientX - rect.left;
    const vy = evt.clientY - rect.top;
    const sx = Math.floor(state.viewX + vx / state.zoom);
    const sy = Math.floor(state.viewY + vy / state.zoom);
    return { sx, sy, vx, vy };
  }

  // Applique style de trait selon bouton souris
  function setStrokeAndFill(evt) {
    const isRight = evt.button === 2 || evt.buttons === 2;
    const color = isRight ? state.colorSecondary : state.colorPrimary;
    sctx.lineWidth = state.lineWidth;
    sctx.strokeStyle = color;
    sctx.fillStyle = color;
    sctx.lineCap = 'square';
    sctx.lineJoin = 'miter';
  }

  // --- Rendu : dessine depuis la surface vers la fenêtre (zoom + viewport)
  function render() {
    // Bornes de la vue
    const sw = Math.min(viewCanvas.width / state.zoom, SURFACE_WIDTH);
    const sh = Math.min(viewCanvas.height / state.zoom, SURFACE_HEIGHT);
    state.viewX = Math.max(0, Math.min(state.viewX, SURFACE_WIDTH - sw));
    state.viewY = Math.max(0, Math.min(state.viewY, SURFACE_HEIGHT - sh));

    vctx.imageSmoothingEnabled = false;
    vctx.clearRect(0, 0, viewCanvas.width, viewCanvas.height);
    vctx.drawImage(
      surface,
      state.viewX, state.viewY, sw, sh,     // source rect
      0, 0, viewCanvas.width, viewCanvas.height // destination (échelle)
    );
    updateScrollbars();
  }

  // --- Scrollbars fonctionnelles
  const SCROLL_STEP = 40;        // pas par clic flèche
  function updateScrollbars() {
    // Taille du contenu visible vs total
    const sw = Math.min(viewCanvas.width / state.zoom, SURFACE_WIDTH);
    const sh = Math.min(viewCanvas.height / state.zoom, SURFACE_HEIGHT);

    // Tailles des thumbs proportionnelles
    const vTrackLen = vTrack.getBoundingClientRect().height;
    const hTrackLen = hTrack.getBoundingClientRect().width;

    const vRatio = sh / SURFACE_HEIGHT;
    const hRatio = sw / SURFACE_WIDTH;

    const minThumb = 20; // taille minimale visuelle
    const vThumbLen = Math.max(minThumb, Math.floor(vTrackLen * vRatio));
    const hThumbLen = Math.max(minThumb, Math.floor(hTrackLen * hRatio));

    vThumb.style.height = vThumbLen + 'px';
    hThumb.style.width = hThumbLen + 'px';

    // Position des thumbs
    const vMax = vTrackLen - vThumbLen;
    const hMax = hTrackLen - hThumbLen;

    const vPos = Math.floor((state.viewY / (SURFACE_HEIGHT - sh)) * vMax) || 0;
    const hPos = Math.floor((state.viewX / (SURFACE_WIDTH - sw)) * hMax) || 0;

    vThumb.style.top = vPos + 'px';
    hThumb.style.left = hPos + 'px';
  }

  // Clic flèches
  vScroll.querySelector('.arrow.up').addEventListener('click', () => { state.viewY -= SCROLL_STEP; render(); });
  vScroll.querySelector('.arrow.down').addEventListener('click', () => { state.viewY += SCROLL_STEP; render(); });
  hScroll.querySelector('.arrow.left').addEventListener('click', () => { state.viewX -= SCROLL_STEP; render(); });
  hScroll.querySelector('.arrow.right').addEventListener('click', () => { state.viewX += SCROLL_STEP; render(); });

  // Clic sur rails
  vTrack.addEventListener('click', (e) => {
    if (e.target === vThumb) return;
    const rect = vTrack.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const thumbHalf = vThumb.getBoundingClientRect().height / 2;
    const sw = Math.min(viewCanvas.width / state.zoom, SURFACE_WIDTH);
    const sh = Math.min(viewCanvas.height / state.zoom, SURFACE_HEIGHT);
    const vMax = rect.height - vThumb.getBoundingClientRect().height;
    const pos = Math.max(0, Math.min(clickY - thumbHalf, vMax));
    const ratio = pos / vMax;
    state.viewY = Math.round((SURFACE_HEIGHT - sh) * ratio);
    render();
  });

  hTrack.addEventListener('click', (e) => {
    if (e.target === hThumb) return;
    const rect = hTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const thumbHalf = hThumb.getBoundingClientRect().width / 2;
    const sw = Math.min(viewCanvas.width / state.zoom, SURFACE_WIDTH);
    const sh = Math.min(viewCanvas.height / state.zoom, SURFACE_HEIGHT);
    const hMax = rect.width - hThumb.getBoundingClientRect().width;
    const pos = Math.max(0, Math.min(clickX - thumbHalf, hMax));
    const ratio = pos / hMax;
    state.viewX = Math.round((SURFACE_WIDTH - sw) * ratio);
    render();
  });

  // Drag des thumbs
  function makeThumbDraggable(thumb, axis) {
    let dragging = false;
    let startPos = 0;
    let startView = 0;

    thumb.addEventListener('mousedown', (e) => {
      dragging = true;
      e.preventDefault();
      if (axis === 'y') { startPos = e.clientY; startView = state.viewY; }
      else { startPos = e.clientX; startView = state.viewX; }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    function onMove(e) {
      if (!dragging) return;
      const delta = (axis === 'y') ? (e.clientY - startPos) : (e.clientX - startPos);
      const trackRect = (axis === 'y') ? vTrack.getBoundingClientRect() : hTrack.getBoundingClientRect();
      const thumbRect = thumb.getBoundingClientRect();
      const max = (axis === 'y') ? (trackRect.height - thumbRect.height) : (trackRect.width - thumbRect.width);

      // visible portion / total dimension
      const sw = Math.min(viewCanvas.width / state.zoom, SURFACE_WIDTH);
      const sh = Math.min(viewCanvas.height / state.zoom, SURFACE_HEIGHT);

      if (axis === 'y') {
        const pixelsPerUnit = max / (SURFACE_HEIGHT - sh || 1);
        state.viewY = Math.round(startView + delta / (pixelsPerUnit || 1));
      } else {
        const pixelsPerUnit = max / (SURFACE_WIDTH - sw || 1);
        state.viewX = Math.round(startView + delta / (pixelsPerUnit || 1));
      }
      render();
    }

    function onUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  }
  makeThumbDraggable(vThumb, 'y');
  makeThumbDraggable(hThumb, 'x');

  // --- Souris sur la zone de dessin
  viewCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

  viewCanvas.addEventListener('mousedown', (e) => {
    const p = toSurfaceCoords(e);
    setStrokeAndFill(e);
    state.drawing = true;
    state.startSX = p.sx; state.startSY = p.sy;
    state.lastSX = p.sx; state.lastSY = p.sy;

    if (state.tool === 'pencil' || state.tool === 'eraser') {
      sctx.beginPath();
      sctx.moveTo(p.sx, p.sy);
      if (state.tool === 'eraser') { // gomme = dessiner en blanc
        sctx.strokeStyle = '#FFFFFF';
      }
    } else if (state.tool === 'bucket') {
      floodFill(p.sx, p.sy, (e.button === 2) ? state.colorSecondary : state.colorPrimary);
    } else if (state.tool === 'eyedropper') {
      const c = pickColor(p.sx, p.sy);
      if (c) {
        if (e.button === 2) state.colorSecondary = c; else state.colorPrimary = c;
        updateSwatches();
      }
    } else if (state.tool === 'zoom') {
      if (e.button === 2) zoomAt(p.sx, p.sy, 1/1.25); else zoomAt(p.sx, p.sy, 1.25);
    } else {
      takeSnapshot();
    }
    render();
  });

  viewCanvas.addEventListener('mousemove', (e) => {
    const { sx, sy } = toSurfaceCoords(e);
    coordsEl.textContent = `x: ${sx}, y: ${sy}`;
    if (!state.drawing) return;

    if (state.tool === 'pencil' || state.tool === 'eraser') {
      sctx.lineTo(sx, sy);
      sctx.stroke();
      state.lastSX = sx; state.lastSY = sy;
      render();
    } else if (state.tool === 'line') {
      restoreSnapshot();
      sctx.beginPath();
      sctx.moveTo(state.startSX, state.startSY);
      sctx.lineTo(sx, sy);
      sctx.stroke();
      render();
    } else if (state.tool === 'rect-stroke' || state.tool === 'rect-fill') {
      restoreSnapshot();
      const w = sx - state.startSX;
      const h = sy - state.startSY;
      if (state.tool === 'rect-stroke') sctx.strokeRect(state.startSX, state.startSY, w, h);
      else sctx.fillRect(state.startSX, state.startSY, w, h);
      render();
    } else if (state.tool === 'ellipse-stroke' || state.tool === 'ellipse-fill') {
      restoreSnapshot();
      drawEllipse(state.startSX, state.startSY, sx, sy, state.tool.endsWith('fill'));
      render();
    }
  });

  document.addEventListener('mouseup', () => { state.drawing = false; });

  // --- Zoom utilitaires
  function zoomAt(sx, sy, factor) {
    // centre le zoom sur le point (sx, sy)
    const oldZoom = state.zoom;
    let newZoom = oldZoom * factor;
    newZoom = Math.max(0.25, Math.min(8, newZoom)); // bornes raisonnables
    if (newZoom === oldZoom) return;

    // Taille visibles avant/après
    const prevW = viewCanvas.width / oldZoom;
    const prevH = viewCanvas.height / oldZoom;
    const nextW = viewCanvas.width / newZoom;
    const nextH = viewCanvas.height / newZoom;

    // Recalculer viewX/viewY pour garder (sx,sy) au même endroit visuel
    const relX = (sx - state.viewX) / prevW;
    const relY = (sy - state.viewY) / prevH;

    state.viewX = Math.round(sx - relX * nextW);
    state.viewY = Math.round(sy - relY * nextH);
    state.zoom = newZoom;

    render();
  }

  // --- Snapshot pour prévisualiser formes
  function takeSnapshot() {
    state.snapshot = sctx.getImageData(0, 0, SURFACE_WIDTH, SURFACE_HEIGHT);
  }
  function restoreSnapshot() {
    if (state.snapshot) sctx.putImageData(state.snapshot, 0, 0);
  }

  // --- Ellipse (natif)
  function drawEllipse(x0, y0, x1, y1, filled) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.abs(x1 - x0) / 2;
    const ry = Math.abs(y1 - y0) / 2;
    sctx.beginPath();
    sctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (filled) sctx.fill(); else sctx.stroke();
  }

  // --- Pipette
  function pickColor(sx, sy) {
    const data = sctx.getImageData(sx, sy, 1, 1).data;
    const c = rgbToHex(data[0], data[1], data[2]);
    return c;
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  // --- Pot de peinture (flood fill) : itératif simple, tolérance 0
  function floodFill(sx, sy, fillHex) {
    const target = sctx.getImageData(sx, sy, 1, 1).data;
    const targetKey = target.slice(0, 3).join(',');
    const fill = hexToRgb(fillHex);
    const fillKey = `${fill.r},${fill.g},${fill.b}`;

    if (targetKey === fillKey) return;

    const img = sctx.getImageData(0, 0, SURFACE_WIDTH, SURFACE_HEIGHT);
    const data = img.data;

    function idx(x, y) { return (y * SURFACE_WIDTH + x) * 4; }

    const stack = [{ x: sx, y: sy }];
    while (stack.length) {
      const { x, y } = stack.pop();
      if (x < 0 || y < 0 || x >= SURFACE_WIDTH || y >= SURFACE_HEIGHT) continue;
      const i = idx(x, y);
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      if (key !== targetKey) continue;

      // Étendre horizontalement
      let xL = x, xR = x;
      // gauche
      while (xL - 1 >= 0) {
        const ii = idx(xL - 1, y);
        const k = `${data[ii]},${data[ii + 1]},${data[ii + 2]}`;
        if (k !== targetKey) break;
        xL--;
      }
      // droite
      while (xR + 1 < SURFACE_WIDTH) {
        const ii = idx(xR + 1, y);
        const k = `${data[ii]},${data[ii + 1]},${data[ii + 2]}`;
        if (k !== targetKey) break;
        xR++;
      }
      // remplir la ligne
      for (let xx = xL; xx <= xR; xx++) {
        const iii = idx(xx, y);
        data[iii] = fill.r; data[iii + 1] = fill.g; data[iii + 2] = fill.b; data[iii + 3] = 255;
        // empiler les pixels du dessus/dessous si correspondants
        if (y - 1 >= 0) {
          const up = idx(xx, y - 1);
          const ku = `${data[up]},${data[up + 1]},${data[up + 2]}`;
          if (ku === targetKey) stack.push({ x: xx, y: y - 1 });
        }
        if (y + 1 < SURFACE_HEIGHT) {
          const dn = idx(xx, y + 1);
          const kd = `${data[dn]},${data[dn + 1]},${data[dn + 2]}`;
          if (kd === targetKey) stack.push({ x: xx, y: y + 1 });
        }
      }
    }

    sctx.putImageData(img, 0, 0);
    render();
  }
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  // --- Raccourcis clavier
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'b') selectTool('pencil');
    if (k === 'e') selectTool('eraser');
    if (k === 'l') selectTool('line');
    if (k === 'r' && !e.shiftKey) selectTool('rect-stroke');
    if (k === 'r' && e.shiftKey) selectTool('rect-fill');
    if (k === 'o' && !e.shiftKey) selectTool('ellipse-stroke');
    if (k === 'o' && e.shiftKey) selectTool('ellipse-fill');
    if (k === 'g') selectTool('bucket');
    if (k === 'i') selectTool('eyedropper');
    if (k === 'z') selectTool('zoom');

    // Zoom via Ctrl + / Ctrl -
    if (e.key === '+' || (e.key === '=' && e.ctrlKey)) zoomAt(state.viewX + (viewCanvas.width / state.zoom) / 2, state.viewY + (viewCanvas.height / state.zoom) / 2, 1.25);
    if (e.key === '-' || (e.key === '_' && e.ctrlKey)) zoomAt(state.viewX + (viewCanvas.width / state.zoom) / 2, state.viewY + (viewCanvas.height / state.zoom) / 2, 1/1.25);
  });

  // Premier rendu
  render();
})();
