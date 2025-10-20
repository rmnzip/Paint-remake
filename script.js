/* =========================
   Mini Paint 98 — JS pur
   ========================= */
const canvas = document.getElementById('paint');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

/* UI elements */
const tools = document.querySelectorAll('.tool');
const palette = document.getElementById('palette');
const primaryBox = document.getElementById('primaryBox');
const secondaryBox = document.getElementById('secondaryBox');
const sizeRange = document.getElementById('sizeRange');
const statusInfo = document.getElementById('statusInfo');
const statusHelp = document.getElementById('statusHelp');
const scrollbox = document.querySelector('.scrollbox');
const textOverlay = document.getElementById('textOverlay');

/* State */
let tool = 'select';
let zoom = 1;           // 1, 2, 4 …
let stroke = 2;
let primary = '#000000';
let secondary = '#FFFFFF';

let isDown = false;
let start = { x: 0, y: 0, btn: 0 };
let last = { x: 0, y: 0 };
let selection = null;   // {x,y,w,h,imageData, dragging, offsetX, offsetY}
const undoStack = [];
const redoStack = [];

/* =========================
   Helpers
   ========================= */
function setStatus(x, y) {
  statusInfo.textContent = `x:${Math.round(x)} y:${Math.round(y)}  |  Zoom: ${Math.round(zoom*100)}%`;
}
function canvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (evt.clientX - rect.left) * scaleX;
  const y = (evt.clientY - rect.top) * scaleY;
  return { x, y };
}
function pushUndo() {
  try {
    undoStack.push(canvas.toDataURL());
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
  } catch {}
}
function restore(dataURL, cb) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0,0,canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    cb && cb();
  };
  img.src = dataURL;
}
function drawLine(x0,y0,x1,y1,color,width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x0,y0);
  ctx.lineTo(x1,y1);
  ctx.stroke();
}
function drawRect(x0,y0,x1,y1,color,width,fill=false,fillColor=null) {
  const left = Math.min(x0,x1), top = Math.min(y0,y1);
  const w = Math.abs(x1-x0), h = Math.abs(y1-y0);
  if (fill && fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fillRect(left, top, w, h);
  }
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.strokeRect(left, top, w, h);
}
function drawEllipse(x0,y0,x1,y1,color,width,fill=false,fillColor=null) {
  const left = Math.min(x0,x1), top = Math.min(y0,y1);
  const w = Math.abs(x1-x0), h = Math.abs(y1-y0);
  const cx = left + w/2, cy = top + h/2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(w/2,0.1), Math.max(h/2,0.1), 0, 0, Math.PI*2);
  if (fill && fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}
function sprayAt(x,y,color,size) {
  const density = 20 + size*2;
  ctx.fillStyle = color;
  for (let i=0;i<density;i++) {
    const r = Math.random() * size;
    const a = Math.random() * Math.PI*2;
    const dx = Math.cos(a)*r;
    const dy = Math.sin(a)*r;
    ctx.fillRect(Math.round(x+dx), Math.round(y+dy), 1, 1);
  }
}
function floodFill(x, y, fillColor) {
  const imgData = ctx.getImageData(0,0,canvas.width, canvas.height);
  const { data, width, height } = imgData;
  const idx = (x,y)=> (y*width + x)*4;
  const startIdx = idx(Math.floor(x), Math.floor(y));
  const target = data.slice(startIdx, startIdx+4);

  const fc = hexToRgba(fillColor);
  if (sameColor(target, fc)) return;

  const q = [];
  q.push([Math.floor(x), Math.floor(y)]);
  while(q.length) {
    const [cx,cy] = q.pop();
    if (cx<0||cy<0||cx>=width||cy>=height) continue;
    const i = idx(cx,cy);
    const cur = data.slice(i,i+4);
    if (!sameColor(cur, target)) continue;
    data[i]=fc[0]; data[i+1]=fc[1]; data[i+2]=fc[2]; data[i+3]=255;
    q.push([cx+1,cy]); q.push([cx-1,cy]); q.push([cx,cy+1]); q.push([cx,cy-1]);
  }
  ctx.putImageData(imgData,0,0);
}
function hexToRgba(hex){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return [r,g,b,255];
}
function sameColor(a,b){
  return a[0]===b[0] && a[1]===b[1] && a[2]===b[2] && (a[3]??255)===(b[3]??255);
}

/* Selection helpers */
function drawMarquee(sel) {
  if (!sel) return;
  ctx.save();
  ctx.setLineDash([6,4]);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
  ctx.restore();
}
function beginSelection(x,y) {
  selection = { x, y, w:0, h:0, imageData:null, dragging:false, offsetX:0, offsetY:0 };
}
function finalizeSelection() {
  if (!selection) return;
  selection.w = Math.max(1, selection.w);
  selection.h = Math.max(1, selection.h);
  selection.imageData = ctx.getImageData(selection.x, selection.y, selection.w, selection.h);
}
function clearSelectionArea() {
  if (!selection) return;
  ctx.clearRect(selection.x, selection.y, selection.w, selection.h);
}
function commitSelection() {
  if (!selection) return;
  ctx.putImageData(selection.imageData, selection.x, selection.y);
  selection = null;
}

/* =========================
   Init
   ========================= */
function init() {
  // fond blanc de base
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,canvas.width, canvas.height);
  pushUndo();
  primaryBox.style.background = primary;
  secondaryBox.style.background = secondary;
  updateStatus(0,0);
}
init();

/* =========================
   UI bindings
   ========================= */
tools.forEach(b=>{
  b.addEventListener('click', ()=>{
    tools.forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    tool = b.dataset.tool;
    statusHelp.textContent = getHelp(tool);
  });
});

palette.querySelectorAll('button').forEach(btn=>{
  btn.addEventListener('mousedown', (e)=>{
    const c = btn.getAttribute('data-color');
    if (e.button === 2) {
      secondary = c; secondaryBox.style.background = secondary;
    } else {
      primary = c; primaryBox.style.background = primary;
    }
  });
  btn.addEventListener('contextmenu', e=>e.preventDefault());
});

sizeRange.addEventListener('input', e=>{
  stroke = parseInt(e.target.value,10);
});

scrollbox.addEventListener('scroll', ()=>{}); // barres présentes (comportement natif)

/* Undo/Redo (clavier) */
window.addEventListener('keydown', (e)=>{
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase()==='z') { e.preventDefault(); undo(); }
  if (ctrl && e.key.toLowerCase()==='y') { e.preventDefault(); redo(); }
});

/* =========================
   Drawing interactions
   ========================= */
canvas.addEventListener('contextmenu', e=>e.preventDefault());

canvas.addEventListener('mousedown', (e)=>{
  const p = canvasPoint(e);
  isDown = true;
  start = { x:p.x, y:p.y, btn:e.button };
  last = { x:p.x, y:p.y };

  if (tool === 'text') {
    showTextOverlay(p.x, p.y);
    return;
  }
  if (tool === 'select') {
    pushUndo();
    beginSelection(p.x, p.y);
    return;
  }
  pushUndo();

  if (tool === 'eyedrop') {
    pickColor(p.x, p.y, e.button);
    isDown = false;
  } else if (tool === 'fill') {
    const col = (e.button===2)? secondary : primary;
    floodFill(Math.floor(p.x), Math.floor(p.y), col);
    isDown = false;
  } else if (tool === 'zoom') {
    if (e.button===2) zoomOut(); else zoomIn();
    isDown = false;
  } else if (tool === 'pencil' || tool === 'brush' || tool === 'eraser' || tool === 'spray') {
    // start path immediately
    if (tool === 'spray') {
      sprayAt(p.x, p.y, pickStrokeColor(e.button), Math.max(3, stroke));
    } else {
      drawLine(last.x, last.y, p.x, p.y, strokeColorFor(tool, e.button), widthFor(tool));
    }
  }
});

canvas.addEventListener('mousemove', (e)=>{
  const p = canvasPoint(e);
  setStatus(p.x, p.y);
  if (!isDown) {
    if (selection && selection.dragging) {
      // no-op (dragging only while mouse down)
    }
    return;
  }

  if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') {
    drawLine(last.x, last.y, p.x, p.y, strokeColorFor(tool, start.btn), widthFor(tool));
    last = p;
  } else if (tool === 'spray') {
    sprayAt(p.x, p.y, pickStrokeColor(start.btn), Math.max(3, stroke));
  } else if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
    // preview from latest undo snapshot
    const base = undoStack[undoStack.length-1];
    if (base) {
      restore(base, ()=>{
        previewShape(tool, start, p, start.btn);
        if (selection) drawMarquee(selection);
      });
    }
  } else if (tool === 'select') {
    selection.w = p.x - selection.x;
    selection.h = p.y - selection.y;
    const base = undoStack[undoStack.length-1];
    if (base) {
      restore(base, ()=> drawMarquee(selection));
    }
  }
});

canvas.addEventListener('mouseup', (e)=>{
  const p = canvasPoint(e);
  if (!isDown) return;
  isDown = false;

  if (tool === 'line') {
    drawLine(start.x, start.y, p.x, p.y, pickStrokeColor(start.btn), stroke);
  } else if (tool === 'rect') {
    drawRect(start.x, start.y, p.x, p.y, pickStrokeColor(start.btn), stroke, false, null);
  } else if (tool === 'ellipse') {
    drawEllipse(start.x, start.y, p.x, p.y, pickStrokeColor(start.btn), stroke, false, null);
  } else if (tool === 'select') {
    finalizeSelection();
    if (selection && (selection.w !== 0 && selection.h !== 0)) {
      // After selection, enable drag move
      enableSelectionDrag();
    }
  }
});

/* =========================
   Tools specifics
   ========================= */
function strokeColorFor(t, btn) {
  if (t==='eraser') return '#FFFFFF';
  return btn===2 ? secondary : primary;
}
function pickStrokeColor(btn) { return btn===2 ? secondary : primary; }
function widthFor(t) {
  if (t==='pencil') return Math.max(1, Math.min(2, stroke));
  if (t==='brush') return Math.max(2, stroke);
  if (t==='eraser') return Math.max(4, stroke*1.5|0);
  return stroke;
}
function previewShape(t, a, b, btn){
  const col = pickStrokeColor(btn);
  if (t==='line') drawLine(a.x, a.y, b.x, b.y, col, stroke);
  if (t==='rect') drawRect(a.x, a.y, b.x, b.y, col, stroke, false, null);
  if (t==='ellipse') drawEllipse(a.x, a.y, b.x, b.y, col, stroke, false, null);
}

function pickColor(x,y,btn){
  const img = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  const hex = `#${toHex(img[0])}${toHex(img[1])}${toHex(img[2])}`;
  if (btn===2) { secondary = hex; secondaryBox.style.background = secondary; }
  else { primary = hex; primaryBox.style.background = primary; }
}
function toHex(n){ return ('0'+n.toString(16)).slice(-2).toUpperCase(); }

/* Zoom (pixel perfect via CSS scale would blur getImageData, so keep canvas size;
   we instead scale the scrollbox content using CSS transform on .paper) */
function zoomIn(){ setZoom(zoom*2); }
function zoomOut(){ setZoom(Math.max(1, zoom/2)); }
function setZoom(z){
  zoom = Math.min(8, Math.max(1, z));
  const paper = document.querySelector('.paper');
  paper.style.transformOrigin = '0 0';
  paper.style.transform = `scale(${zoom})`;
  updateStatus(last.x, last.y);
}
function updateStatus(x,y){ setStatus(x,y); }

/* Selection drag */
function enableSelectionDrag(){
  const onMove = (e)=>{
    if (!selection) return;
    const p = canvasPoint(e);
    const dx = p.x - start.x;
    const dy = p.y - start.y;

    const base = undoStack[undoStack.length-1];
    if (base) {
      restore(base, ()=>{
        ctx.putImageData(selection.imageData, selection.x + dx, selection.y + dy);
        drawMarquee({ x: selection.x + dx, y: selection.y + dy, w: selection.w, h: selection.h });
      });
    }
  };
  const onUp = (e)=>{
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    const p = canvasPoint(e);
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    clearSelectionArea();
    selection.x += dx; selection.y += dy;
    commitSelection();
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* Texte */
function showTextOverlay(x,y){
  positionTextOverlay(x,y);
  textOverlay.value = '';
  textOverlay.style.top = (window.scrollY + y/zoom + 40) + 'px';
  textOverlay.style.left = (window.scrollX + x/zoom + 60) + 'px';
  textOverlay.style.display = 'block';
  textOverlay.focus();

  const commit = ()=>{
    const txt = textOverlay.value;
    if (txt.trim().length){
      pushUndo();
      ctx.fillStyle = primary;
      ctx.font = `${Math.max(10, stroke*6)}px "MS Sans Serif", Arial, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(txt, x, y);
    }
    hideTextOverlay();
  };
  const cancel = ()=> hideTextOverlay();

  textOverlay.onkeydown = (e)=>{
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };
  textOverlay.onblur = ()=> cancel();
}
function hideTextOverlay(){
  textOverlay.style.top = '-1000px';
  textOverlay.style.left = '-1000px';
  textOverlay.style.display = 'none';
}
function positionTextOverlay(){ /* handled above; kept simple per brief */ }

/* Undo / Redo */
function undo(){
  if (!undoStack.length) return;
  const last = undoStack.pop();
  redoStack.push(last);
  const base = undoStack[undoStack.length-1];
  if (base) restore(base);
}
function redo(){
  if (!redoStack.length) return;
  const next = redoStack.pop();
  undoStack.push(next);
  restore(next);
}

/* Aides */
function getHelp(t){
  const map = {
    select:'Select a rectangular region. Drag to move after selecting.',
    eraser:'Erase with the secondary color (white by default).',
    fill:'Fill a region with the selected color. Left=Primary, Right=Secondary.',
    eyedrop:'Pick color from the canvas. Left→Primary, Right→Secondary.',
    zoom:'Left=Zoom In, Right=Zoom Out.',
    pencil:'Draw 1–2px hard lines.',
    brush:'Draw thicker soft lines.',
    spray:'Airbrush style spray.',
    text:'Click to type. Enter to commit, Esc to cancel.',
    line:'Draw straight lines.',
    rect:'Draw rectangles.',
    ellipse:'Draw ellipses.'
  };
  return map[t] || '';
}

/* Cursor position in status bar */
canvas.addEventListener('mousemove', (e)=>{
  const p = canvasPoint(e);
  setStatus(p.x, p.y);
});

/* Ready */
statusHelp.textContent = getHelp(tool);
