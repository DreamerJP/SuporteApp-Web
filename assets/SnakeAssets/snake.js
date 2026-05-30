/* ════════════════════════════════════════════════════════════════════
   COSMIC SNAKE · Game engine + UI controller
══════════════════════════════════════════════════════════════════════ */

"use strict";

/* ═══════════════════════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════════════════════ */
const CFG = {
  cols: 20,
  rows: 20,
  gridSize: 30,          // reajustado em resize()
  starCount: 220,
  nebulaeCount: 5,
  baseSpeed: 105,        // ms por move
  colors: { accent: "#00ffcc", gold: "#ffd700", danger: "#e94560" },
};

/* ═══════════════════════════════════════════════════════════════
   CANVAS SETUP
═══════════════════════════════════════════════════════════════ */
const bgCanvas  = document.getElementById("bg-canvas");
const bgCtx     = bgCanvas.getContext("2d");
const canvas    = document.getElementById("game-canvas");
const ctx       = canvas.getContext("2d");
let W, H, boardX, boardY, boardW, boardH;
let isMobile = false;
let starsReady = false;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = document.documentElement.clientWidth  || window.innerWidth;
  H = document.documentElement.clientHeight || window.innerHeight;
  isMobile = W < 960;
  [bgCanvas, canvas].forEach(c => {
    c.width = W * dpr; c.height = H * dpr;
    c.style.width = W + "px"; c.style.height = H + "px";
    c.getContext("2d").setTransform(dpr,0,0,dpr,0,0);
  });

  const reservedH = isMobile ? 180 : 140;
  const byW = Math.floor((W - 48) / CFG.cols);
  const byH = Math.floor((H - reservedH) / CFG.rows);
  
  CFG.gridSize = Math.max(14, Math.min(byW, byH, isMobile ? 28 : 30));

  boardW = CFG.cols * CFG.gridSize;
  boardH = CFG.rows * CFG.gridSize;
  boardX = (W - boardW) / 2;
  
  const minY = 90;
  boardY = Math.max(minY, (H - boardH) / 2);

  // Redistribute stars & nebulae when the board area changes
  if (starsReady) {
    stars.forEach(s => s.reset());
    buildNebulae();
  }

  positionHud();
  try { if (Game.playing) UI.repositionHelper(); } catch(e) {}
}

function positionHud() {
  const sp = document.getElementById("score-panel");
  const bb = document.getElementById("boost-bar");
  // Score panel top-center (fixed CSS handles this)
  // Boost bar bottom-center
  bb.style.bottom = isMobile ? "80px" : "28px";
}

window.addEventListener("resize", resize);
resize();

/* ═══════════════════════════════════════════════════════════════
   ASSETS
═══════════════════════════════════════════════════════════════ */
const Assets = {
  skins: Array.from({length:6}, () => new Image()),
  planets: Array.from({length:7}, () => new Image()),
  loaded: false,
  skinsLoaded: 0,
  // Audio is lazily wired in load() — see below
  audio: {
    eat: null, boost: null, gameover: null, victory: null,
    start: null, select: null, immortal: null, bonus: null,
  },
  async load() {
    // Probe assets dir once. In the user's deployment with assets present, this succeeds
    // and we preload all sprites. In a preview without the assets folder, we skip silently
    // and the game falls back to procedural rendering for everything.
    let ok = false;
    try {
      const r = await fetch('assets/SnakeAssets/Imagens/Snake.PNG', { method: 'HEAD' });
      ok = r.ok;
    } catch {}
    if (!ok) {
      this.loaded = true;
      this.skinsLoaded = this.skins.length;
      // Stub out audio so .play() never 404s
      for (const k in this.audio) this.audio[k] = { play: () => Promise.resolve(), currentTime: 0 };
      UI.buildSkinGrids();
      return;
    }
    // Wire audio now that we know the folder exists
    const audioMap = {
      eat:      "eat.mp3",
      boost:    "boost.mp3",
      gameover: "gameover.mp3",
      victory:  "victory.mp3",
      start:    "start.mp3",
      select:   "select.mp3",
      immortal: "shield.mp3",
      bonus:    "coin.mp3",
    };
    for (const k in audioMap) {
      const a = new Audio(`assets/SnakeAssets/Audio/${audioMap[k]}`);
      a.addEventListener('error', () => { this.audio[k] = { play: () => Promise.resolve(), currentTime: 0 }; });
      this.audio[k] = a;
    }
    this.skins.forEach((img, i) => {
      const n = i === 4 ? "SnakeBonus.PNG" : i === 5 ? "SnakeGift.png" : (i===0?"Snake":`Snake${i}`) + ".PNG";
      img.src = `assets/SnakeAssets/Imagens/${n}`;
      img.onload = img.onerror = () => {
        if (++this.skinsLoaded === this.skins.length) { this.loaded = true; UI.buildSkinGrids(); }
        else if (i === 0) this.loaded = true;
      };
    });
    this.planets.forEach((img, i) => { img.src = `assets/SnakeAssets/Imagens/planet_${i}.png`; });
  },
};

/* ═══════════════════════════════════════════════════════════════
   PARTICLES
═══════════════════════════════════════════════════════════════ */
class Particle {
  constructor(x, y, color, opts={}) {
    this.x = x; this.y = y;
    const speed = opts.speed || 5;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed * (0.5 + Math.random());
    this.vy = Math.sin(angle) * speed * (0.5 + Math.random());
    this.alpha = 1;
    this.color = color;
    this.size = opts.size || (Math.random() * 2.5 + 1);
    this.decay = opts.decay || 0.018;
    this.gravity = opts.gravity || 0.05;
  }
  update(dt) {
    const s = dt / 16.67;
    this.x += this.vx * s; this.y += this.vy * s;
    this.vy += this.gravity * s;
    this.vx *= 0.985; this.vy *= 0.985;
    this.alpha -= this.decay * s;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.fillStyle = this.color;
    if (this.alpha > 0.4) { ctx.shadowBlur = 5; ctx.shadowColor = this.color; }
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

/* ═══════════════════════════════════════════════════════════════
   STARS & NEBULAE (background scene)
═══════════════════════════════════════════════════════════════ */
class Star {
  constructor() { this.reset(); }
  reset() {
    this.x = Math.random() * (CFG.cols * CFG.gridSize);
    this.y = Math.random() * (CFG.rows * CFG.gridSize);
    this.size = Math.random() * 1.5;
    this.baseOpacity = 0.2 + Math.random() * 0.6;
    this.opacity = this.baseOpacity;
    this.twinkling = false;
    this.twinkleFactor = 0;
    this.twinkleSpeed = 0;
    this.nextTwinkleMs = (Math.random() * 200) * 16.67;
  }
  update(dt) {
    if (this.twinkling) {
      this.twinkleFactor += this.twinkleSpeed * (dt / 16.67);
      this.opacity = this.baseOpacity + Math.sin(this.twinkleFactor) * 1.0;
      if (this.twinkleFactor > Math.PI) {
        this.twinkling = false;
        this.opacity = this.baseOpacity;
        this.nextTwinkleMs = (Math.random() * 300 + 200) * 16.67;
      }
    } else {
      this.nextTwinkleMs -= dt;
      if (this.nextTwinkleMs <= 0) {
        if (Math.random() > 0.95) {
          this.twinkling = true;
          this.twinkleFactor = 0;
          this.twinkleSpeed = 0.02 + Math.random() * 0.05;
        } else {
          this.nextTwinkleMs = (Math.random() * 50 + 30) * 16.67;
        }
      }
    }
  }
  draw(ctx) {
    ctx.fillStyle = `rgba(255,255,255,${Math.abs(this.opacity)})`;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI*2); ctx.fill();
  }
}

const stars = Array.from({length: CFG.starCount}, () => new Star());

// Nebulae blobs pre-rendered into offscreen canvas
const nebulaCanvas = document.createElement("canvas");
const nebulaCtx    = nebulaCanvas.getContext("2d");
function buildNebulae() {
  nebulaCanvas.width  = CFG.cols * CFG.gridSize;
  nebulaCanvas.height = CFG.rows * CFG.gridSize;
  nebulaCtx.clearRect(0, 0, nebulaCanvas.width, nebulaCanvas.height);
  const palettes = [
    ["rgba(0,80,160,0.06)","rgba(0,40,100,0.04)"],
    ["rgba(80,0,120,0.05)","rgba(40,0,80,0.03)"],
    ["rgba(0,100,80,0.05)","rgba(0,60,50,0.03)"],
  ];
  for (let i = 0; i < CFG.nebulaeCount; i++) {
    const cx = Math.random() * nebulaCanvas.width;
    const cy = Math.random() * nebulaCanvas.height;
    const r  = 60 + Math.random() * 140;
    const pal = palettes[i % palettes.length];
    const grd = nebulaCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, pal[0]);
    grd.addColorStop(1, "transparent");
    nebulaCtx.fillStyle = grd;
    nebulaCtx.beginPath(); nebulaCtx.ellipse(cx, cy, r, r*0.65, Math.random()*Math.PI, 0, Math.PI*2); nebulaCtx.fill();
  }
}
buildNebulae();
starsReady = true;

function drawBackground(dt) {
  bgCtx.clearRect(0, 0, W, H);
  bgCtx.save();
  bgCtx.translate(boardX, boardY);
  // nebulae
  bgCtx.drawImage(nebulaCanvas, 0, 0);
  // stars (original twinkle system)
  stars.forEach(s => { s.update(dt); s.draw(bgCtx); });
  bgCtx.shadowBlur = 4;
  bgCtx.shadowColor = 'rgba(0,255,204,0.35)';
  bgCtx.strokeStyle = 'rgba(0,255,204,0.55)';
  bgCtx.lineWidth = 1;
  bgCtx.strokeRect(0.5, 0.5, boardW - 1, boardH - 1);
  bgCtx.shadowBlur = 0;
  // corner brackets
  bgCtx.strokeStyle = 'rgba(0,255,204,0.9)';
  bgCtx.lineWidth = 2;
  const c = 14;
  [[0,0,1,1],[boardW,0,-1,1],[0,boardH,1,-1],[boardW,boardH,-1,-1]].forEach(([x,y,sx,sy])=>{
    bgCtx.beginPath();
    bgCtx.moveTo(x, y + c*sy);
    bgCtx.lineTo(x, y);
    bgCtx.lineTo(x + c*sx, y);
    bgCtx.stroke();
  });
  bgCtx.restore();
}

/* ═══════════════════════════════════════════════════════════════
   PLANET & BOOST objects
═══════════════════════════════════════════════════════════════ */
const PLANET_COLS = [
  "rgba(0,150,255,0.35)", "rgba(255,100,0,0.35)", "rgba(100,255,150,0.35)",
  "rgba(200,150,255,0.35)", "rgba(255,200,0,0.35)", "rgba(0,255,255,0.35)", "rgba(255,80,200,0.35)"
];
const BOOST_COLORS = { speed:"#00dcff", immortal:"#ffd700", score:"#ff66cc" };

class Planet {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.rot = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.003;
    this.pulsePhase = Math.random() * Math.PI * 2;
    /* no rings */
  }
  update() {
    this.rot += this.rotSpeed;
    this.pulsePhase += 0.025;
  }
  draw(ctx) {
    const cx = boardX + this.x * CFG.gridSize + CFG.gridSize/2;
    const cy = boardY + this.y * CFG.gridSize + CFG.gridSize/2;
    const baseR = CFG.gridSize / 2 - 2;
    const r  = baseR + Math.sin(this.pulsePhase) * 1.5;
    const img = Assets.planets[this.type % Assets.planets.length];
    const baseCol = PLANET_COLS[this.type % PLANET_COLS.length];
    const solidCol = baseCol.replace(/[\d.]+\)$/, '0.95)');
    const midCol   = baseCol.replace(/[\d.]+\)$/, '0.55)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.rot);
    ctx.shadowColor = baseCol;
    ctx.shadowBlur = 16;
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, -r, -r, r*2, r*2);
    } else {
      // procedural orb: rim light + atmosphere
      const g = ctx.createRadialGradient(-r*0.35, -r*0.35, 0, 0, 0, r*1.1);
      g.addColorStop(0,   '#ffffff');
      g.addColorStop(0.15, solidCol);
      g.addColorStop(0.7,  midCol);
      g.addColorStop(1,    baseCol);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
      // atmosphere rim
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = baseCol.replace(/[\d.]+\)$/, '0.4)');
      ctx.beginPath(); ctx.arc(0,0,r*1.05,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }
}

class Boost {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.lifetime = 8000;
    this.maxLife  = 8000;
    this.phase    = 0;
    this.rotation = 0;
  }
  update(dt) {
    this.lifetime -= dt;
    this.phase += 0.06 * (dt/16.67);
    this.rotation += 0.03 * (dt/16.67);
  }
  draw(ctx) {
    if (this.lifetime <= 0) return;
    const cx = boardX + this.x * CFG.gridSize + CFG.gridSize/2;
    const cy = boardY + this.y * CFG.gridSize + CFG.gridSize/2;
    const fade = Math.min(1, this.lifetime / 1500);
    const scale = 1 + Math.sin(this.phase) * 0.12;
    const r = CFG.gridSize * 0.38 * scale;
    const icons = { speed:"↯", immortal:"◈", score:"◆" };
    const color = BOOST_COLORS[this.type];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = fade;
    ctx.shadowColor = color; ctx.shadowBlur = 16;
    // hexagonal bg
    ctx.fillStyle = color + "22";
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI/3 - Math.PI/6;
      i===0 ? ctx.moveTo(Math.cos(a)*r*1.3, Math.sin(a)*r*1.3) : ctx.lineTo(Math.cos(a)*r*1.3, Math.sin(a)*r*1.3);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // icon
    ctx.font = `${r * 1.1}px serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowBlur = 0;
    ctx.rotate(-this.rotation); // keep icon upright
    ctx.fillText(icons[this.type], 0, 0);
    ctx.restore();
  }
}

/* ═══════════════════════════════════════════════════════════════
   GAME STATE
═══════════════════════════════════════════════════════════════ */
const Game = {
  snake: [],
  prevSnake: [],
  direction: {x:1,y:0},
  inputQueue: [],
  planets: [],
  boosts: [],
  particles: [],
  score: 0,
  planetsEaten: 0,
  maxLen: 3,
  startTime: 0,

  over: false, playing: false, paused: false,
  isChampion: false,
  highScores: [],

  timeSinceMove: 0,
  moveInterval: CFG.baseSpeed,
  activeBoosts: { speed:0, immortal:0, speedMax:5000, immortalMax:10000 },

  controlMode: localStorage.getItem("snake_control_mode") || "joystick",
  skinIndex: parseInt(localStorage.getItem("snake_selected_skin")) || 0,

  addInput(d) {
    const last = this.inputQueue.length ? this.inputQueue.at(-1) : this.direction;
    if (d.x === last.x && d.y === last.y) return;
    if (d.x && last.x) return;
    if (d.y && last.y) return;
    if (this.inputQueue.length < 2) this.inputQueue.push(d);
  },

  freePositions() {
    const occ = new Set([
      ...this.snake.map(s=>`${s.x},${s.y}`),
      ...this.planets.map(p=>`${p.x},${p.y}`),
      ...this.boosts.map(b=>`${b.x},${b.y}`),
    ]);
    const free = [];
    for (let x=0;x<CFG.cols;x++) for(let y=0;y<CFG.rows;y++) if(!occ.has(`${x},${y}`)) free.push({x,y});
    return free;
  },
  rndPos() {
    const f = this.freePositions();
    return f.length ? f[Math.floor(Math.random()*f.length)] : null;
  },

  init() {
    this.snake   = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
    this.prevSnake = this.snake.map(s=>({...s}));
    this.direction = {x:1,y:0};
    this.inputQueue = [];
    this.planets = []; this.boosts = []; this.particles = [];
    this.score = 0; this.planetsEaten = 0; this.maxLen = 3;
    this.over = false; this.paused = false;
    this.timeSinceMove = 0; this.moveInterval = CFG.baseSpeed;
    this.activeBoosts = { speed:0, immortal:0, speedMax:5000, immortalMax:10000 };
    this.startTime = Date.now();
    for (let i=0;i<3;i++) this.spawnPlanet();
    UI.updateHUD();
    UI.hideBoosts();
    this.showMobileControls();
  },

  showMobileControls() {
    document.getElementById("dpad").style.display             = (isMobile && this.controlMode==="dpad") ? "block" : "none";
    document.getElementById("split-controls").style.display   = (isMobile && this.controlMode==="split") ? "flex" : "none";
  },

  spawnPlanet() {
    const p = this.rndPos(); if (!p) return;
    this.planets.push(new Planet(p.x, p.y, Math.floor(Math.random()*Assets.planets.length)));
  },
  spawnBoost() {
    if (Math.random() > 0.10) return;
    const p = this.rndPos(); if (!p) return;
    const types = ["speed","immortal","score"];
    this.boosts.push(new Boost(p.x, p.y, types[Math.floor(Math.random()*3)]));
  },

  explosion(x, y, color, n=18) {
    const sx = boardX + x*CFG.gridSize + CFG.gridSize/2;
    const sy = boardY + y*CFG.gridSize + CFG.gridSize/2;
    for (let i=0;i<n;i++) this.particles.push(new Particle(sx,sy,color,{speed:6+Math.random()*4}));
  },

  update(dt) {
    if (this.over) return;
    this.planets.forEach(p=>p.update());
    this.boosts.forEach(b=>b.update(dt));
    this.particles.forEach(p=>p.update(dt));
    this.boosts = this.boosts.filter(b=>b.lifetime>0);
    this.particles = this.particles.filter(p=>p.alpha>0);

    if (!this.playing || this.paused) return;

    const hasSpeed = this.activeBoosts.speed > 0;
    const hasImmune = this.activeBoosts.immortal > 0;
    this.moveInterval = hasSpeed ? CFG.baseSpeed/2 : CFG.baseSpeed;
    if (hasSpeed)  this.activeBoosts.speed    -= dt;
    if (hasImmune) this.activeBoosts.immortal -= dt;

    UI.updateBoostUI();

    this.timeSinceMove += dt;
    if (this.timeSinceMove >= this.moveInterval) {
      this.timeSinceMove = 0;
      this.move();
    }
  },

  move() {
    this.prevSnake = this.snake.map(s=>({...s}));
    if (this.inputQueue.length) this.direction = this.inputQueue.shift();

    const head = {
      x: (this.snake[0].x + this.direction.x + CFG.cols) % CFG.cols,
      y: (this.snake[0].y + this.direction.y + CFG.rows) % CFG.rows,
    };

    if (this.activeBoosts.immortal <= 0 && this.snake.some(s=>s.x===head.x && s.y===head.y)) {
      this.endGame(); return;
    }

    let ate = false;

    const pi = this.planets.findIndex(p=>p.x===head.x && p.y===head.y);
    if (pi !== -1) {
      // score scales with snake length
      const base = 100 + Math.floor(this.snake.length * 2);
      this.score += base;
      this.planetsEaten++;
      this.explosion(head.x, head.y, CFG.colors.accent);
      Sfx.play("eat");
      this.planets.splice(pi,1);
      this.spawnPlanet(); this.spawnBoost();
      ate = true;
      UI.popScore();
    }

    const bi = this.boosts.findIndex(b=>b.x===head.x && b.y===head.y);
    if (bi !== -1) {
      const b = this.boosts[bi];
      this.explosion(head.x, head.y, BOOST_COLORS[b.type], 28);
      if      (b.type==="speed")    { Sfx.play("boost");   this.activeBoosts.speed    = this.activeBoosts.speedMax; }
      else if (b.type==="immortal") { Sfx.play("immortal"); this.activeBoosts.immortal = this.activeBoosts.immortalMax; }
      else                          { Sfx.play("bonus");   this.score += 500; UI.popScore(); }
      this.boosts.splice(bi,1);
    }

    this.snake.unshift(head);
    if (!ate) this.snake.pop();
    if (this.snake.length > this.maxLen) this.maxLen = this.snake.length;

    if (this.snake.length >= CFG.cols * CFG.rows) { this.victory(); return; }
    UI.updateHUD();
  },

  togglePause() {
    if (!this.playing || this.over) return;
    this.paused = !this.paused;
    document.getElementById("pause-overlay").classList.toggle("show", this.paused);
  },

  async endGame() {
    this.over = true; this.playing = false;
    Sfx.play("gameover");
    this.explosion(this.snake[0].x, this.snake[0].y, CFG.colors.danger, 35);
    setTimeout(() => UI.showEndScreen("GAME OVER","Missão Fracassada"), 400);
  },
  async victory() {
    this.over = true; this.playing = false;
    Sfx.play("victory");
    for (let i=0;i<20;i++) setTimeout(()=>{
      const rx=Math.floor(Math.random()*CFG.cols), ry=Math.floor(Math.random()*CFG.rows);
      this.explosion(rx,ry,CFG.colors.gold,20);
    }, i*80);
    setTimeout(()=>UI.showEndScreen("VITÓRIA!","Universo Conquistado"),600);
  },

  draw() {
    ctx.clearRect(0, 0, W, H);
    this.planets.forEach(p=>p.draw(ctx));
    this.boosts.forEach(b=>b.draw(ctx));
    this.particles.forEach(p=>p.draw(ctx));
    if (!this.snake.length) return;

    const immune   = this.activeBoosts.immortal > 0;
    const speed    = this.activeBoosts.speed > 0;
    const isGold   = this.skinIndex === 4;
    const progress = this.playing ? Math.min(this.timeSinceMove / this.moveInterval, 1) : 0;

    // Procedural color palette per state (used when sprite missing)
    let bodyCore, bodyEdge, headCore;
    if (immune)        { bodyCore = '#ffe082'; bodyEdge = '#8a5e00'; headCore = '#fff5cc'; }
    else if (speed)    { bodyCore = '#9af2ff'; bodyEdge = '#00485c'; headCore = '#ddfaff'; }
    else if (isGold)   { bodyCore = '#ffd166'; bodyEdge = '#664400'; headCore = '#fff0c0'; }
    else               { bodyCore = '#7df9d8'; bodyEdge = '#005a48'; headCore = '#d0fff0'; }

    let glowColor = "rgba(0,255,204,0.55)";
    let glowBlur  = 14;
    if (immune)  { glowColor = `rgba(255,215,0,${0.7+Math.sin(Date.now()/100)*0.3})`; glowBlur = 28; }
    else if (speed) { glowColor = "rgba(0,220,255,0.8)"; glowBlur = 22; }
    else if (isGold) { glowColor = "rgba(255,215,0,0.4)"; glowBlur = 18; }

    const getPos = (i) => {
      const c = this.snake[i], p = this.prevSnake[i] || c;
      let px=p.x, py=p.y, cx=c.x, cy=c.y;
      if (Math.abs(cx-px) > 1) { cx<px ? cx+=CFG.cols : px+=CFG.cols; }
      if (Math.abs(cy-py) > 1) { cy<py ? cy+=CFG.rows : py+=CFG.rows; }
      return {
        x: boardX + (px + (cx-px)*progress)*CFG.gridSize + CFG.gridSize/2,
        y: boardY + (py + (cy-py)*progress)*CFG.gridSize + CFG.gridSize/2,
      };
    };

    const pts    = this.snake.map((_,i) => getPos(i));
    const skin   = Assets.skins[this.skinIndex];
    const skinOk = skin && skin.complete && skin.naturalWidth;

    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur  = glowBlur;

    // Body segments
    for (let i=1; i<pts.length-1; i++) {
      const p = pts[i], prev = pts[i-1], next = pts[i+1];
      const dPrev = Math.hypot(p.x-prev.x, p.y-prev.y);
      const dNext = Math.hypot(next.x-p.x, next.y-p.y);
      let rot;
      if (dPrev < CFG.gridSize*2 && dNext < CFG.gridSize*2) {
        const aPrev = Math.atan2(p.y-prev.y, p.x-prev.x);
        const aNext = Math.atan2(next.y-p.y, next.x-p.x);
        let d = aNext - aPrev;
        while (d < -Math.PI) d += Math.PI*2;
        while (d >  Math.PI) d -= Math.PI*2;
        rot = aPrev + d*0.5 + Math.PI/2;
      } else { rot = Math.atan2(next.y-p.y, next.x-p.x) + Math.PI/2; }

      const taper = 1 - (i/pts.length)*0.38;
      const pulse = 1 + Math.sin(Date.now()/190 + i*0.32) * 0.05;
      const sz = CFG.gridSize * 1.48 * taper * pulse;

      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(rot);
      if (skinOk) {
        ctx.drawImage(skin, 0, skin.naturalHeight*0.44, skin.naturalWidth, skin.naturalHeight*0.12, -sz/2,-sz/2,sz,sz);
      } else {
        // procedural orb body with rim shading
        const r = sz/2;
        const g = ctx.createRadialGradient(-r*0.3, -r*0.3, 0, 0, 0, r);
        g.addColorStop(0,    '#ffffff');
        g.addColorStop(0.18, bodyCore);
        g.addColorStop(1,    bodyEdge);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    // Head & tail
    pts.forEach((p, idx) => {
      if (idx !== 0 && idx !== pts.length-1) return;
      let rot = 0;
      if (idx === 0) {
        if (pts.length > 1) {
          const np = pts[1];
          let dx=p.x-np.x, dy=p.y-np.y;
          if (Math.abs(dx)>CFG.gridSize*2) dx=0;
          if (Math.abs(dy)>CFG.gridSize*2) dy=0;
          rot = Math.atan2(dy,dx) + Math.PI/2;
        }
      } else {
        const pp = pts[idx-1];
        let dx=pp.x-p.x, dy=pp.y-p.y;
        if (Math.abs(dx)>CFG.gridSize*2) dx=0;
        if (Math.abs(dy)>CFG.gridSize*2) dy=0;
        rot = Math.atan2(dy,dx) + Math.PI/2;
      }
      const taper = idx===0 ? 1 : 0.58;
      const sz = CFG.gridSize * 1.58 * taper;
      ctx.save();
      ctx.translate(p.x,p.y); ctx.rotate(rot);
      if (skinOk) {
        const sy2 = idx===0 ? 0 : skin.naturalHeight*0.85;
        const sh  = skin.naturalHeight*0.15;
        ctx.drawImage(skin, 0,sy2, skin.naturalWidth,sh, -sz/2,-sz/2,sz,sz);
      } else {
        const r = sz/2;
        if (idx === 0) {
          // Head: brighter orb + eyes pointing forward
          const g = ctx.createRadialGradient(-r*0.3, -r*0.3, 0, 0, 0, r);
          g.addColorStop(0,    '#ffffff');
          g.addColorStop(0.15, headCore);
          g.addColorStop(0.75, bodyCore);
          g.addColorStop(1,    bodyEdge);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
          // Eyes: two small black dots ahead
          const ex = r*0.32, ey = -r*0.28;
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#0a0a14';
          ctx.beginPath(); ctx.arc(-ex, ey, r*0.13, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc( ex, ey, r*0.13, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(-ex+r*0.04, ey-r*0.04, r*0.045, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc( ex+r*0.04, ey-r*0.04, r*0.045, 0, Math.PI*2); ctx.fill();
        } else {
          // Tail: smaller orb
          const g = ctx.createRadialGradient(-r*0.25, -r*0.25, 0, 0, 0, r);
          g.addColorStop(0,    bodyCore);
          g.addColorStop(1,    bodyEdge);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
        }
      }
      ctx.restore();
    });

    ctx.restore();
  },
};

/* ═══════════════════════════════════════════════════════════════
   AUDIO
═══════════════════════════════════════════════════════════════ */
const Sfx = {
  muted: false,
  play(key) {
    if (this.muted) return;
    const s = Assets.audio[key];
    if (s) { s.currentTime = 0; s.play().catch(()=>{}); }
  },
};

/* ═══════════════════════════════════════════════════════════════
   UI CONTROLLER
═══════════════════════════════════════════════════════════════ */
const UI = {
  currentGift: null,
  toastTimer: null,

  /* ── Screens ── */
  showScreen(id) {
    document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
    const s = document.getElementById(id);
    if (s) s.classList.add("active");
  },
  showView(id) {
    document.querySelectorAll(".panel-view").forEach(v=>v.classList.remove("active"));
    const v = document.getElementById(id);
    if (v) v.classList.add("active");
  },

  /* ── Toast ── */
  toast(msg, isError=false) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.remove("show","error");
    if (isError) el.classList.add("error");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(()=>el.classList.remove("show"), 4500);
  },

  /* ── Skins ── */
  buildSkinGrids() {
    const grids = ["skin-grid-main"];
    grids.forEach(gid => {
      const g = document.getElementById(gid);
      if (!g) return;
      g.innerHTML = "";
      
      g.onwheel = (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          g.scrollLeft += e.deltaY;
        }
      };
      const countEl = document.getElementById("skin-count");
      if (countEl) countEl.textContent = `${Game.skinIndex + 1} / 6`;
      for (let i=0;i<6;i++) {
        const isChamp = i===4;
        const isGift  = i===5;
        const hasGift = localStorage.getItem("snake_has_gift_skin")==="true";
        const locked  = (isChamp && !Game.isChampion) || (isGift && !hasGift);

        let cls = "skin-card";
        if (Game.skinIndex===i) cls += " active";
        if (locked) cls += " locked";
        if (isChamp) cls += " champion-skin";

        const card = document.createElement("div");
        card.className = cls;
        card.innerHTML = `
          ${isChamp ? '<div class="skin-badge"><svg width="10" height="10" aria-hidden="true" style="vertical-align:middle" ><use href="#ico-crown"/></svg></div>' : ''}
          ${locked ? '<div class="lock-icon"><svg width="10" height="10" aria-hidden="true" style="vertical-align:middle" ><use href="#ico-lock"/></svg></div>' : ''}
        `;
        const src = Assets.skins[i].src;
        if (src && Assets.skins[i].complete && Assets.skins[i].naturalWidth) {
          const img = document.createElement("img");
          img.src = src;
          card.insertBefore(img, card.firstChild);
        }
        // else: the .skin-card::before procedural orb is shown automatically
        card.onclick = () => {
          if (locked) {
            if (isChamp) this.toast("Apenas o Líder Mundial pode usar esta Skin!", true);
            else this.toast("Esta skin rara é recebida via Presente Especial!", true);
            return;
          }
          Game.skinIndex = i;
          localStorage.setItem("snake_selected_skin", i);
          Sfx.play("select");
          this.buildSkinGrids();
        };
        g.appendChild(card);
      }
    });
  },

  /* ── HUD ── */
  updateHUD() {
    document.getElementById("hud-score").textContent = Game.score;
    document.getElementById("hud-len").textContent   = Game.snake.length;
    const best = Game.highScores[0]?.score || 0;
    document.getElementById("hud-best").textContent  = best;
  },
  popScore() {
    const el = document.getElementById("hud-score");
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
    setTimeout(()=>el.classList.remove("pop"),200);
  },
  updateBoostUI() {
    const bb = document.getElementById("boost-bar");
    const sp = document.getElementById("boost-speed");
    const im = document.getElementById("boost-immortal");
    const spf = document.getElementById("boost-speed-fill");
    const imf = document.getElementById("boost-immortal-fill");
    const hasAny = Game.activeBoosts.speed>0 || Game.activeBoosts.immortal>0;
    bb.classList.toggle("visible", hasAny);
    sp.classList.toggle("active", Game.activeBoosts.speed>0);
    im.classList.toggle("active", Game.activeBoosts.immortal>0);
    spf.style.width = `${Math.max(0,Game.activeBoosts.speed/Game.activeBoosts.speedMax*100)}%`;
    imf.style.width = `${Math.max(0,Game.activeBoosts.immortal/Game.activeBoosts.immortalMax*100)}%`;
  },
  hideBoosts() {
    document.getElementById("boost-bar").classList.remove("visible");
    document.getElementById("boost-speed").classList.remove("active");
    document.getElementById("boost-immortal").classList.remove("active");
  },
  toggleMute() {
    Sfx.muted = !Sfx.muted;
    document.getElementById("mute-btn").innerHTML = Sfx.muted
      ? '<svg aria-hidden="true"><use href="#ico-sound-off"/></svg>'
      : '<svg aria-hidden="true"><use href="#ico-sound-on"/></svg>';
  },

  /* ── Controls menu ── */
  buildControlsList() {
    const modes = [
      {id:"joystick", icon:'<svg width="26" height="26" aria-hidden="true"><use href="#ico-joystick"/></svg>', title:"JOYSTICK DINÂMICO", desc:"Controle virtual aparece onde você tocar."},
      {id:"swipe",    icon:'<svg width="26" height="26" aria-hidden="true"><use href="#ico-swipe"/></svg>', title:"SWIPE GESTURES",    desc:"Deslize o dedo para mudar direção. Tela limpa."},
      {id:"dpad",     icon:'<svg width="26" height="26" aria-hidden="true"><use href="#ico-dpad"/></svg>', title:"BOTÕES (D-PAD)",    desc:"Botões fixos de direção no canto."},
      {id:"split",    icon:'<svg width="26" height="26" aria-hidden="true"><use href="#ico-split"/></svg>', title:"BOTÕES LATERAIS",   desc:"Controles para duas mãos. Estilo gamepad."},
    ];
    const list = document.getElementById("control-list");
    list.innerHTML = "";
    modes.forEach(m => {
      const el = document.createElement("div");
      el.className = `control-item${Game.controlMode===m.id?" active":""}`;
      el.innerHTML = `
        <div class="ctrl-icon">${m.icon}</div>
        <div class="ctrl-body">
          <div class="ctrl-title">${m.title}</div>
          <div class="ctrl-desc">${m.desc}</div>
        </div>
        <div class="ctrl-check"><div class="ctrl-check-dot"></div></div>
      `;
      el.onclick = () => {
        Game.controlMode = m.id;
        localStorage.setItem("snake_control_mode", m.id);
        Sfx.play("select");
        this.buildControlsList();
      };
      list.appendChild(el);
    });
  },

  /* ── Ranking ── */
  renderRankingList(listId, scores) {
    const ul = document.getElementById(listId);
    if (!ul) return;
    const medals = ['<svg width="16" height="16" aria-hidden="true" style="vertical-align:middle"><use href="#ico-medal-1"/></svg>','<svg width="16" height="16" aria-hidden="true" style="vertical-align:middle"><use href="#ico-medal-2"/></svg>','<svg width="16" height="16" aria-hidden="true" style="vertical-align:middle"><use href="#ico-medal-3"/></svg>'];
    ul.innerHTML = scores.length === 0
      ? `<li class="score-row" style="color:var(--c-muted);justify-content:center;">Sem recordes ainda</li>`
      : scores.map((s,i) => {
          const rankCls = i<3 ? ` rank-${i+1}` : "";
          const medal   = medals[i] || "";
          const date    = s.timestamp ? this.fmtDate(s.timestamp) : "";
          return `<li class="score-row${rankCls}">
            <span class="rank-num">${i+1}</span>
            ${medal ? `<span class="rank-medal">${medal}</span>` : ""}
            <span class="score-name">${s.name}${i===0?' <svg width="13" height="13" style="vertical-align:middle;color:#ffd700" aria-hidden="true"><use href="#ico-crown"/></svg>':''}</span>
            <span class="score-pts">${s.score.toLocaleString()}</span>
            ${date ? `<span class="score-date">${date}</span>` : ""}
          </li>`;
        }).join("");
  },
  fmtDate(ts) {
    try {
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
    } catch { return ""; }
  },
  async loadMenuRanking() {
    const ul = document.getElementById("menu-ranking-list");
    ul.innerHTML = `<li class="score-row" style="color:var(--c-muted);justify-content:center;">Carregando...</li>`;
    try {
      const scores = window.FB ? await window.FB.fetch() : Game.highScores;
      this.checkChampion(scores);
      this.renderRankingList("menu-ranking-list", scores);
    } catch { this.renderRankingList("menu-ranking-list", Game.highScores); }
  },
  checkChampion(scores) {
    const myId = String(localStorage.getItem("snake_player_id"));
    const was  = Game.isChampion;
    Game.isChampion = scores.length > 0 && String(scores[0].playerId) === myId;
    if (Game.isChampion && !was) {
      this.toast("VOCÊ É O NOVO LÍDER MUNDIAL! SKIN DOURADA LIBERADA!");
      Sfx.play("victory");
    }
    this.buildSkinGrids();
  },

  /* ── Game flow ── */
  showHelper(visible) {
    const h = document.getElementById("controls-helper");
    if (!h) return;
    h.classList.toggle("visible", !!visible);
    if (visible) UI.repositionHelper();
  },
  repositionHelper() {
    const h = document.getElementById("controls-helper");
    if (!h) return;
    const gap = 20;
    const idealLeft = boardX - h.offsetWidth - gap;
    h.style.left = Math.max(8, idealLeft) + "px";
  },
  startGame() {
    this.showScreen(null); // hide all
    document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
    document.getElementById("pause-overlay").classList.remove("show");
    Sfx.play("start");
    Game.playing = true;
    Game.init();
    this.showHelper(true);
  },
  restartGame() {
    document.getElementById("screen-gameover").classList.remove("active");
    document.getElementById("pause-overlay").classList.remove("show");
    Game.playing = true;
    Game.init();
    this.showHelper(true);
  },
  goToMenu() {
    document.getElementById("screen-gameover").classList.remove("active");
    document.getElementById("pause-overlay").classList.remove("show");
    document.getElementById("dpad").style.display = "none";
    document.getElementById("split-controls").style.display = "none";
    Game.playing = false; Game.over = false;
    this.showView("view-main");
    this.showScreen("screen-start");
    this.loadMenuRanking();
    this.showHelper(false);
  },
  async showEndScreen(title, eyebrow) {
    const elapsed = Math.floor((Date.now() - Game.startTime) / 1000);
    const mins = Math.floor(elapsed/60), secs = elapsed%60;

    document.getElementById("end-title").textContent   = title;
    document.getElementById("end-eyebrow").textContent = eyebrow;
    document.getElementById("end-score").textContent   = Game.score.toLocaleString();
    document.getElementById("end-planets").textContent = Game.planetsEaten;
    document.getElementById("end-maxlen").textContent  = Game.maxLen;
    document.getElementById("end-time").textContent    = `${mins}:${String(secs).padStart(2,"0")}`;

    // local highscores
    const saved = localStorage.getItem("snake_highscores");
    Game.highScores = saved ? JSON.parse(saved) : [];

    // check if global record
    let scores = Game.highScores;
    try { if (window.FB) scores = await window.FB.fetch(); } catch {}
    this.checkChampion(scores);
    const isRecord = Game.score > 0 && (scores.length < 8 || Game.score > scores.at(-1)?.score);
    const banner = document.getElementById("record-banner");
    banner.classList.toggle("show", isRecord);

    this.renderRankingList("gameover-ranking-list", scores);
    this.showScreen("screen-gameover");
    document.getElementById("dpad").style.display = "none";
    document.getElementById("split-controls").style.display = "none";
    this.showHelper(false);
  },
  async saveScore() {
    const input = document.getElementById("player-name-input");
    const btn   = document.getElementById("save-btn");
    const name  = (input.value.trim().toUpperCase() || "ANON").slice(0,10);
    btn.disabled = true; btn.textContent = "ENVIANDO...";
    this.toast("Enviando para o universo...");

    // save local
    const pid = localStorage.getItem("snake_player_id") || "00000";
    Game.highScores.push({ name, score: Game.score, playerId: pid });
    Game.highScores.sort((a,b)=>b.score-a.score);
    Game.highScores = Game.highScores.slice(0,8);
    localStorage.setItem("snake_highscores", JSON.stringify(Game.highScores));

    // save global
    try {
      if (window.FB) await window.FB.upload(name, Game.score);
      this.toast("Score enviado para a central mundial!");
    } catch { this.toast("Erro ao enviar ranking.", true); }

    document.getElementById("record-banner").classList.remove("show");
    const scores = window.FB ? await window.FB.fetch() : Game.highScores;
    this.renderRankingList("gameover-ranking-list", scores);
    btn.disabled = false; btn.textContent = "SALVAR RECORDE";
    input.value = "";
  },

  /* ── Gift ── */
  async claimGift() {
    if (!this.currentGift) return;
    this.toast("Resgatando seu presente...");
    try {
      await window.FB.claimGift(this.currentGift.id);
      if (this.currentGift.type==="skin") {
        localStorage.setItem("snake_has_gift_skin","true");
        this.toast("INCRÍVEL! Skin COSMIC GIFT desbloqueada!");
        this.buildSkinGrids();
      } else { this.toast("Presente resgatado!"); }
      document.getElementById("present-overlay").classList.remove("show");
      Sfx.play("victory");
      for (let i=0;i<15;i++) setTimeout(()=>{
        Game.particles.push(new Particle(W/2+((Math.random()-0.5)*200), H/2+((Math.random()-0.5)*150), CFG.colors.gold, {speed:7+Math.random()*4,decay:0.014}));
      }, i*40);
    } catch { this.toast("Erro ao resgatar presente. Tente novamente.", true); }
  },
};

/* ═══════════════════════════════════════════════════════════════
   INPUT — KEYBOARD
═══════════════════════════════════════════════════════════════ */
window.addEventListener("keydown", e => {
  if (e.target.tagName==="INPUT" || e.target.tagName==="TEXTAREA") return;
  if (e.key===" " && e.target.tagName==="BUTTON") { e.preventDefault(); return; }
  if ([" ","p","P","Escape"].includes(e.key)) {
    if (Game.playing && !Game.over) { Game.togglePause(); return; }
  }
  if (!Game.playing || Game.paused) return;
  const MAP = {
    ArrowUp:{x:0,y:-1}, w:{x:0,y:-1}, W:{x:0,y:-1},
    ArrowDown:{x:0,y:1}, s:{x:0,y:1}, S:{x:0,y:1},
    ArrowLeft:{x:-1,y:0}, a:{x:-1,y:0}, A:{x:-1,y:0},
    ArrowRight:{x:1,y:0}, d:{x:1,y:0}, D:{x:1,y:0},
  };
  const dir = MAP[e.key];
  if (dir) { e.preventDefault(); Game.addInput(dir); }
});

/* ═══════════════════════════════════════════════════════════════
   INPUT — JOYSTICK (Mobile Dynamic)
═══════════════════════════════════════════════════════════════ */
const Joystick = {
  layer: document.getElementById("joystick-layer"),
  base:  document.getElementById("joybase"),
  stick: document.getElementById("joystick"),
  active: false, sx:0, sy:0, maxDist:60,

  start(e) {
    if (Game.controlMode!=="joystick" || !Game.playing || Game.paused || Game.over) return;
    this.active = true;
    const t = e.touches[0];
    this.sx = t.clientX; this.sy = t.clientY;
    this.layer.style.display = "block";
    this.base.style.left = this.sx + "px";
    this.base.style.top  = this.sy + "px";
    this.stick.style.transform = "translate(-50%,-50%)";
  },
  move(e) {
    if (!this.active) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - this.sx, dy = t.clientY - this.sy;
    const dist = Math.hypot(dx,dy);
    const ang  = Math.atan2(dy,dx);
    const md   = Math.min(dist,this.maxDist);
    this.stick.style.transform = `translate(calc(-50% + ${Math.cos(ang)*md}px), calc(-50% + ${Math.sin(ang)*md}px))`;
    if (dist > 20) {
      if (Math.abs(dx)>Math.abs(dy)) Game.addInput({x:dx>0?1:-1,y:0});
      else                           Game.addInput({x:0,y:dy>0?1:-1});
    }
  },
  end() {
    this.active = false;
    this.layer.style.display = "none";
    this.stick.style.transform = "translate(-50%,-50%)";
  },
};

/* ═══════════════════════════════════════════════════════════════
   INPUT — SWIPE
═══════════════════════════════════════════════════════════════ */
const Swipe = {
  sx:0, sy:0,
  start(e) {
    if (Game.controlMode!=="swipe"||!Game.playing||Game.paused||Game.over) return;
    this.sx=e.touches[0].clientX; this.sy=e.touches[0].clientY;
  },
  end(e) {
    if (Game.controlMode!=="swipe"||!Game.playing||Game.paused||Game.over) return;
    const dx=e.changedTouches[0].clientX-this.sx, dy=e.changedTouches[0].clientY-this.sy;
    if (Math.hypot(dx,dy)<28) return;
    if (Math.abs(dx)>Math.abs(dy)) Game.addInput({x:dx>0?1:-1,y:0});
    else                           Game.addInput({x:0,y:dy>0?1:-1});
  },
};

/* ═══════════════════════════════════════════════════════════════
   INPUT — DPAD / SPLIT BUTTONS
═══════════════════════════════════════════════════════════════ */
const DIR_BTN = {up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
document.querySelectorAll(".dpad-btn, .split-btn").forEach(btn => {
  ["touchstart","mousedown"].forEach(ev => {
    btn.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation();
      const d = DIR_BTN[btn.dataset.dir];
      if (d && Game.playing) Game.addInput(d);
    }, {passive:false});
  });
  btn.addEventListener("touchend", e => { e.preventDefault(); e.stopPropagation(); }, {passive:false});
});

/* ── Global touch events ── */
window.addEventListener("touchstart", e => {
  if (Game.controlMode==="joystick") Joystick.start(e);
  if (Game.controlMode==="swipe")    Swipe.start(e);
}, {passive:false});
window.addEventListener("touchmove", e => {
  if (Game.controlMode==="joystick") Joystick.move(e);
}, {passive:false});
window.addEventListener("touchend", e => {
  if (Game.controlMode==="joystick") Joystick.end();
  if (Game.controlMode==="swipe")    Swipe.end(e);
});
window.addEventListener("touchcancel", () => Joystick.end());

// Tap to pause on mobile
window.addEventListener("click", e => {
  const safe = ["button",".skin-card",".control-item",".dpad-btn",".split-btn","#mute-btn"];
  if (safe.some(s=>e.target.closest(s))) return;
  if (Game.playing && !Game.over && isMobile) Game.togglePause();
});

/* ═══════════════════════════════════════════════════════════════
   GAME LOOP
═══════════════════════════════════════════════════════════════ */
let lastTime=0, frameCount=0, fpsLast=0, fps=0, rafId=null;

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  } else {
    if (!rafId) { lastTime = performance.now(); rafId = requestAnimationFrame(loop); }
  }
});

function loop(ts) {
  const dt = Math.min(ts-(lastTime||ts), 200);
  lastTime = ts;
  frameCount++;
  if (ts-fpsLast >= 500) {
    fps = Math.round(frameCount * 1000 / (ts - fpsLast));
    frameCount = 0; fpsLast = ts;
    const meter = document.getElementById("fps-meter");
    if (meter) {
      const numEl = meter.querySelector(".fps-num");
      if (numEl) numEl.textContent = fps;
      meter.classList.toggle("warn", fps < 50 && fps >= 30);
      meter.classList.toggle("bad",  fps < 30);
    }
  }

  drawBackground(dt);
  Game.update(dt);
  Game.draw();
  rafId = requestAnimationFrame(loop);
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
async function init() {
  // Try the deep-space backdrop only if it exists; always layer the gradient overlays.
  const fallback =
    "radial-gradient(ellipse at 20% 0%, rgba(0,80,120,0.18), transparent 55%)," +
    "radial-gradient(ellipse at 85% 100%, rgba(60,0,110,0.14), transparent 55%)";
  fetch('assets/SnakeAssets/Imagens/background.jpg', { method: 'HEAD' })
    .then(r => {
      if (r.ok) {
        document.body.style.backgroundImage = fallback + ",url('assets/SnakeAssets/Imagens/background.jpg')";
        document.body.style.backgroundSize = "cover, cover, cover";
      } else {
        document.body.style.backgroundImage = fallback;
      }
    })
    .catch(() => { document.body.style.backgroundImage = fallback; });
  // Favicon: probe before assigning to avoid 404
  fetch('assets/SuporteApp-Assets/favicon.ico', { method: 'HEAD' })
    .then(r => { if (r.ok) { const l = document.querySelector("link[rel='icon']"); if (l) l.href = 'assets/SuporteApp-Assets/favicon.ico'; } })
    .catch(() => {});

  // Player ID
  let pid = localStorage.getItem("snake_player_id");
  if (!pid || pid.length!==5) { pid=String(Math.floor(10000+Math.random()*90000)); localStorage.setItem("snake_player_id",pid); }
  document.getElementById("player-id-display").textContent = "ID " + pid;

  // Local highscores
  const saved = localStorage.getItem("snake_highscores");
  if (saved) try { Game.highScores = JSON.parse(saved); } catch {}

  // Skin index persist
  Game.skinIndex = parseInt(localStorage.getItem("snake_selected_skin")) || 0;

  // Build static UI
  UI.buildControlsList();

  // Load assets
  Assets.load();
  // Ensure skin grids built after a tick even if images fail
  setTimeout(() => UI.buildSkinGrids(), 500);

  // Start loop
  lastTime = performance.now();
  requestAnimationFrame(loop);

  // Fetch global data async
  const tryGlobal = async (retries=0) => {
    if (!window.FB) {
      if (retries > 25) return;
      return setTimeout(()=>tryGlobal(retries+1), 400);
    }
    try {
      const [scores, gift] = await Promise.all([
        window.FB.fetch(),
        window.FB.checkGift(pid),
      ]);
      if (scores.length) {
        UI.checkChampion(scores);
        Game.highScores = scores;
      }
      if (gift) {
        UI.currentGift = gift;
        document.getElementById("present-msg").textContent = `"${gift.message || 'Você recebeu um presente especial!'}"`;
        document.getElementById("present-overlay").classList.add("show");
        Sfx.play("bonus");
      }
    } catch(e) { console.error("Firebase init error:", e); }
  };
  tryGlobal();

  // Remove loading screen — always fires, independent of Firebase
  const removeLoading = () => {
    const ls = document.getElementById("loading-screen");
    if (!ls) return;
    ls.classList.add("fade-out");
    setTimeout(() => { if (ls.parentNode) ls.remove(); }, 800);
  };
  setTimeout(removeLoading, 1400);
}

init();
