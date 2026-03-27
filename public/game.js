// ============================================================
// BlockDoku - Browser Edition (Complete Overhaul)
// ============================================================

(() => {
  "use strict";

  // --- Constants ---
  const GRID = 9;
  const BOX = 3;

  // --- Game Mode ---
  let gameMode = "classic"; // "classic" or "daily"

  // ============================================================
  // SEEDED RNG (for Daily Challenge)
  // ============================================================
  function mulberry32(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getDailySeed() {
    const d = new Date();
    const dateStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
      const ch = dateStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return { seed: hash, dateStr };
  }

  let dailyRng = null; // seeded RNG instance for daily mode
  const CELL_COLORS = [
    "#ff3b7a", "#a855f7", "#6366f1", "#3b82f6",
    "#22d3ee", "#10b981", "#f59e0b", "#ef4444",
  ];
  // Lighter variants for shine effects
  const CELL_COLORS_LIGHT = [
    "#ff6b9d", "#c084fc", "#818cf8", "#60a5fa",
    "#67e8f9", "#34d399", "#fbbf24", "#f87171",
  ];

  // --- Piece Definitions (relative cells [row, col]) ---
  const PIECE_DEFS = [
    // Single
    [[0,0]],
    // Dominos
    [[0,0],[1,0]],
    [[0,0],[0,1]],
    // Triominos
    [[0,0],[1,0],[2,0]],
    [[0,0],[0,1],[0,2]],
    [[0,0],[1,0],[0,1]],
    [[0,0],[1,0],[1,1]],
    [[0,0],[0,1],[1,1]],
    [[1,0],[0,1],[1,1]],
    // Tetrominoes
    [[0,0],[1,0],[2,0],[3,0]],
    [[0,0],[0,1],[0,2],[0,3]],
    [[0,0],[1,0],[2,0],[2,1]],
    [[0,0],[0,1],[0,2],[1,2]],
    [[0,0],[1,0],[0,1],[1,1]],
    [[0,0],[1,0],[2,0],[1,1]],
    [[0,0],[1,0],[1,1],[2,1]],
    [[0,0],[0,1],[1,1],[1,2]],
    // Pentominoes (select)
    [[0,0],[1,0],[2,0],[3,0],[4,0]],
    [[0,0],[0,1],[0,2],[0,3],[0,4]],
    [[0,0],[1,0],[2,0],[0,1],[0,2]],
    [[0,0],[0,1],[0,2],[1,2],[2,2]],
    [[0,0],[1,0],[1,1],[1,2],[2,2]],
    [[0,0],[1,0],[1,1],[2,1],[2,2]],
    // L shapes
    [[0,0],[1,0],[2,0],[0,1]],
    [[0,0],[1,0],[2,0],[2,1]],
    [[0,0],[0,1],[0,2],[1,0]],
    [[0,0],[0,1],[0,2],[1,2]],
    // 3x3 block
    [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],
    // Cross / plus
    [[1,0],[0,1],[1,1],[2,1],[1,2]],
    // T shapes
    [[0,0],[1,0],[2,0],[1,1]],
    [[0,0],[1,0],[2,0],[1,-1]],
    [[0,0],[0,1],[0,2],[1,1]],
    [[-1,1],[0,0],[0,1],[0,2]],
  ];

  // --- Game State ---
  let board = [];
  let score = 0;
  let bestScore = 0;
  let pieces = [null, null, null];
  let soundOn = true;
  let darkMode = true;
  let comboCount = 0;
  let gameActive = true;
  let initialized = false;
  let bestScoreAtGameStart = 0; // track pre-game best for "New Best!" check
  let dailyBestScore = 0;
  let dailyDateStr = "";

  // --- Animated Score Counter ---
  let displayScore = 0;
  let scoreAnimId = null;

  // Per-game stats
  let gameStats = { linesCleared: 0, combos: 0, piecesPlaced: 0 };

  // Score milestone tracking
  let lastMilestone = 0;
  let hasPassedBestThisGame = false;
  let gameOverFireworksId = null;

  // --- Undo State ---
  let undoSnapshot = null; // { board, score, pieces, comboCount, gameStats }
  let pendingGameOverId = null;
  let gameOverRowTimeouts = [];
  let gameOverShakeTimeoutId = null;
  let gameOverAdPollId = null;
  let gameOverAdSafetyId = null;
  let gameOverVignetteTimeoutId = null;
  let gameOverVignetteEl = null;
  let countUpAnimIds = new Set();
  let transientTimeoutIds = new Set();

  // --- Level System ---
  // Exponential curve: level N requires N^2 * 50 cumulative XP
  function xpForLevel(lvl) {
    return Math.floor(lvl * lvl * 50);
  }
  let playerXP = 0;
  let playerLevel = 1;

  // --- DOM Elements ---
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const fxCanvas = document.getElementById("fx-layer");
  const fxCtx = fxCanvas.getContext("2d");
  const tray = document.getElementById("pieces-tray");
  const scoreEl = document.getElementById("score");
  const scoreBoxEl = scoreEl.closest(".score-box");
  const bestEl = document.getElementById("best-score");
  const comboBadge = document.getElementById("combo-badge");
  const comboText = document.getElementById("combo-text");

  // Game Over
  const goOverlay = document.getElementById("game-over-overlay");
  const finalScoreEl = document.getElementById("final-score");
  const finalBestEl = document.getElementById("final-best");
  const goLines = document.getElementById("go-lines");
  const goCombos = document.getElementById("go-combos");
  const goPieces = document.getElementById("go-pieces");
  const newBestBanner = document.getElementById("new-best-banner");
  const playAgainBtn = document.getElementById("play-again-btn");

  // Modals
  const statsOverlay = document.getElementById("stats-overlay");
  const helpOverlay = document.getElementById("help-overlay");
  const newgameOverlay = document.getElementById("newgame-overlay");

  // Toolbar
  const btnStats = document.getElementById("btn-stats");
  const btnHelp = document.getElementById("btn-help");
  const btnTheme = document.getElementById("btn-theme");
  const btnSound = document.getElementById("btn-sound");
  const btnNewgame = document.getElementById("btn-newgame");
  const btnUndo = document.getElementById("btn-undo");

  // Level
  const levelBadge = document.getElementById("level-badge");
  const xpBarFill = document.getElementById("xp-bar-fill");
  const levelUpOverlay = document.getElementById("level-up-overlay");
  const levelUpNum = document.getElementById("level-up-num");
  const goLevelVal = document.getElementById("go-level-val");

  // Share
  const shareBtn = document.getElementById("share-score-btn");
  const shareToast = document.getElementById("share-toast");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ============================================================
  // AUDIO SYSTEM
  // ============================================================
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playTone(freq, duration, type = "sine", vol = 0.06) {
    if (!soundOn) return;
    try {
      const ac = getAudioCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.connect(gain).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + duration);
    } catch {}
  }

  function sfxPlace() {
    playTone(600, 0.08, "sine", 0.05);
    playTone(900, 0.06, "sine", 0.03);
    playTone(1200, 0.04, "sine", 0.02);
    // Satisfying bass thump for tactile feedback
    playTone(120, 0.08, "sine", 0.04);
    playTone(80, 0.06, "triangle", 0.025);
  }

  // Musical clear: major chord with harmonic richness
  function sfxClear(count) {
    // C major chord rooted higher for each additional clear
    const roots = [523, 587, 659, 784, 880]; // C5, D5, E5, G5, A5
    const root = roots[Math.min(count - 1, roots.length - 1)];
    // Root
    playTone(root, 0.18, "sine", 0.06);
    // Major third
    setTimeout(() => playTone(root * 1.26, 0.16, "sine", 0.05), 40);
    // Fifth
    setTimeout(() => playTone(root * 1.5, 0.14, "sine", 0.04), 80);
    // Octave shimmer for big clears
    if (count > 1) {
      setTimeout(() => playTone(root * 2, 0.2, "triangle", 0.03), 120);
    }
    if (count > 2) {
      setTimeout(() => playTone(root * 2.52, 0.25, "triangle", 0.025), 160);
    }
  }

  // Rising arpeggio that escalates with combo count
  function sfxCombo(count) {
    const scale = [523, 587, 659, 784, 880, 988, 1047, 1175]; // C major scale
    const notes = Math.min(count + 1, scale.length);
    for (let i = 0; i < notes; i++) {
      setTimeout(() => {
        playTone(scale[i], 0.12, "sine", 0.045);
        // Add harmony on higher combos
        if (count >= 3 && i > 0) {
          playTone(scale[i] * 1.5, 0.08, "triangle", 0.02);
        }
      }, i * 50);
    }
    // Triumphant final chord at combo 5+
    if (count >= 5) {
      setTimeout(() => {
        playTone(1047, 0.3, "sine", 0.05);
        playTone(1319, 0.3, "sine", 0.04);
        playTone(1568, 0.35, "triangle", 0.03);
      }, notes * 50 + 30);
    }
  }

  function sfxGameOver() {
    // Dramatic descending minor chord
    playTone(392, 0.4, "sawtooth", 0.035);
    playTone(466, 0.35, "sine", 0.03);
    setTimeout(() => {
      playTone(330, 0.45, "sawtooth", 0.035);
      playTone(392, 0.4, "sine", 0.03);
    }, 200);
    setTimeout(() => {
      playTone(262, 0.6, "sawtooth", 0.03);
      playTone(311, 0.55, "sine", 0.025);
    }, 400);
    // Low rumble
    setTimeout(() => playTone(110, 0.8, "sawtooth", 0.02), 550);
  }

  // Satisfying snap sound on valid placement
  function sfxSnap() {
    playTone(1400, 0.03, "square", 0.04);
    playTone(2000, 0.02, "sine", 0.025);
  }

  function sfxUndo() {
    playTone(400, 0.08, "sine", 0.04);
    setTimeout(() => playTone(300, 0.1, "sine", 0.03), 50);
  }

  function sfxLevelUp() {
    playTone(523, 0.12, "sine", 0.06);
    setTimeout(() => playTone(659, 0.12, "sine", 0.06), 100);
    setTimeout(() => playTone(784, 0.15, "sine", 0.06), 200);
    setTimeout(() => playTone(1047, 0.2, "sine", 0.05), 300);
  }

  // Triumphant fanfare for passing your best score mid-game
  function sfxNewBest() {
    // Ascending major arpeggio with shimmer
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        playTone(freq, 0.18, "sine", 0.055);
        playTone(freq * 1.5, 0.12, "triangle", 0.025);
      }, i * 70);
    });
    // Final triumphant chord
    setTimeout(() => {
      playTone(1047, 0.4, "sine", 0.05);
      playTone(1319, 0.35, "sine", 0.04);
      playTone(1568, 0.35, "sine", 0.035);
      playTone(2093, 0.3, "triangle", 0.02);
    }, notes.length * 70 + 30);
  }

  // Milestone celebration sound — quick ascending sparkle
  function sfxMilestone(tier) {
    const base = 800 + tier * 200;
    playTone(base, 0.1, "sine", 0.05);
    setTimeout(() => playTone(base * 1.25, 0.08, "sine", 0.04), 60);
    setTimeout(() => playTone(base * 1.5, 0.12, "triangle", 0.035), 120);
  }

  function queueTransientTimeout(fn, delay) {
    const timeoutId = setTimeout(() => {
      transientTimeoutIds.delete(timeoutId);
      fn();
    }, delay);
    transientTimeoutIds.add(timeoutId);
    return timeoutId;
  }

  // Quick tick sound for game-over score count-up
  function sfxTick(pitch) {
    playTone(pitch || 1200, 0.02, "sine", 0.02);
  }

  // ============================================================
  // PARTICLE SYSTEM
  // ============================================================
  let particles = [];

  function spawnParticles(x, y, color, count = 8, opts = {}) {
    const { speedMult = 1, sizeMult = 1, gravity = true, sparkle = false } = opts;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = (1.5 + Math.random() * 3) * speedMult;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.015 + Math.random() * 0.02,
        size: (2 + Math.random() * 3) * sizeMult,
        color,
        noGravity: !gravity,
        sparkle,
      });
    }
    ensureAnimRunning();
  }

  // Drag trail particles
  function spawnDragTrail(x, y, color) {
    for (let i = 0; i < 2; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        life: 0.8,
        decay: 0.03 + Math.random() * 0.02,
        size: 2 + Math.random() * 2.5,
        color,
        noGravity: true,
        sparkle: true,
      });
    }
    ensureAnimRunning();
  }

  function spawnClearParticles(cellIndices) {
    const intensity = cellIndices.length > 18 ? 2 : cellIndices.length > 9 ? 1.5 : 1;
    for (const idx of cellIndices) {
      const r = Math.floor(idx / GRID);
      const c = idx % GRID;
      const x = c * cellSize + cellSize / 2;
      const y = r * cellSize + cellSize / 2;
      const colorIdx = board[r][c];
      const ci = colorIdx > 0 ? (colorIdx - 1) % CELL_COLORS.length : 0;
      const color = CELL_COLORS[ci];
      const lightColor = CELL_COLORS_LIGHT[ci];
      spawnParticles(x, y, color, Math.round(5 * intensity), { speedMult: intensity, sizeMult: intensity * 0.8 });
      // Add sparkle particles for extra juice
      spawnParticles(x, y, lightColor, 2, { speedMult: 0.5, sizeMult: 0.6, sparkle: true, gravity: false });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (!p.noGravity) p.vy += 0.05; // gravity
      p.vx *= 0.99; // air resistance
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      fxCtx.globalAlpha = p.life;
      fxCtx.fillStyle = p.color;

      if (p.sparkle) {
        // Diamond sparkle shape
        const s = p.size * p.life;
        fxCtx.save();
        fxCtx.translate(p.x, p.y);
        fxCtx.rotate(Math.PI / 4);
        fxCtx.fillRect(-s / 2, -s / 2, s, s);
        // Glow
        fxCtx.shadowColor = p.color;
        fxCtx.shadowBlur = s * 2;
        fxCtx.fillRect(-s / 2, -s / 2, s, s);
        fxCtx.restore();
      } else {
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        fxCtx.fill();
      }
    }
    fxCtx.globalAlpha = 1;
    fxCtx.shadowBlur = 0;
  }

  // ============================================================
  // RADIAL PULSE SYSTEM (placement ripple)
  // ============================================================
  let pulses = [];

  function spawnRadialPulse(cx, cy, color, maxRadius) {
    if (prefersReducedMotion.matches) return;
    pulses.push({
      x: cx, y: cy,
      radius: 0,
      maxRadius: maxRadius || cellSize * 2.5,
      life: 1,
      color,
    });
    ensureAnimRunning();
  }

  function updatePulses() {
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.life -= 0.025;
      p.radius += (p.maxRadius - p.radius) * 0.12;
      if (p.life <= 0) pulses.splice(i, 1);
    }
  }

  function drawPulses() {
    for (const p of pulses) {
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      fxCtx.strokeStyle = p.color;
      fxCtx.lineWidth = 2 * p.life;
      fxCtx.globalAlpha = p.life * 0.5;
      fxCtx.stroke();
    }
    fxCtx.globalAlpha = 1;
  }

  // ============================================================
  // CLEAR SWEEP SYSTEM (white wipe across cleared lines)
  // ============================================================
  let sweeps = [];

  function spawnClearSweep(cells) {
    if (prefersReducedMotion.matches) return;
    // Group cells by row and column to create directional sweeps
    const rows = new Map();
    const cols = new Map();
    for (const idx of cells) {
      const r = Math.floor(idx / GRID);
      const c = idx % GRID;
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r).push(c);
      if (!cols.has(c)) cols.set(c, []);
      cols.get(c).push(r);
    }
    // Horizontal sweeps for full rows
    for (const [r, colList] of rows) {
      if (colList.length >= GRID) {
        sweeps.push({
          type: "h", row: r,
          progress: 0, speed: 0.04,
        });
      }
    }
    // Vertical sweeps for full columns
    for (const [c, rowList] of cols) {
      if (rowList.length >= GRID) {
        sweeps.push({
          type: "v", col: c,
          progress: 0, speed: 0.04,
        });
      }
    }
    ensureAnimRunning();
  }

  function updateSweeps() {
    for (let i = sweeps.length - 1; i >= 0; i--) {
      sweeps[i].progress += sweeps[i].speed;
      if (sweeps[i].progress > 1.3) sweeps.splice(i, 1);
    }
  }

  function drawSweeps() {
    for (const s of sweeps) {
      const alpha = Math.max(0, 1 - s.progress);
      fxCtx.globalAlpha = alpha * 0.7;
      if (s.type === "h") {
        const y = s.row * cellSize;
        const sweepX = s.progress * boardPx;
        const grad = fxCtx.createLinearGradient(sweepX - cellSize, y, sweepX, y);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.9)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        fxCtx.fillStyle = grad;
        fxCtx.fillRect(sweepX - cellSize, y, cellSize, cellSize);
      } else {
        const x = s.col * cellSize;
        const sweepY = s.progress * boardPx;
        const grad = fxCtx.createLinearGradient(x, sweepY - cellSize, x, sweepY);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.9)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        fxCtx.fillStyle = grad;
        fxCtx.fillRect(x, sweepY - cellSize, cellSize, cellSize);
      }
    }
    fxCtx.globalAlpha = 1;
  }

  // Animation loop for particles/pulses/sweeps
  let animFrameId = null;
  let animRunning = false;

  function animLoop() {
    const hasWork = particles.length > 0 || pulses.length > 0 || sweeps.length > 0;
    if (hasWork) {
      updateParticles();
      updatePulses();
      updateSweeps();
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
      drawSweeps();
      drawPulses();
      drawParticles();
      animFrameId = requestAnimationFrame(animLoop);
    } else {
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
      animRunning = false;
      animFrameId = null;
    }
  }

  function ensureAnimRunning() {
    if (!animRunning) {
      animRunning = true;
      animFrameId = requestAnimationFrame(animLoop);
    }
  }

  // ============================================================
  // CONFETTI SYSTEM (big celebrations)
  // ============================================================
  let confettiPieces = [];
  let confettiCanvas = null;
  let confettiCtx = null;
  let confettiAnimId = null;

  function resizeConfettiCanvas() {
    if (!confettiCanvas) return;
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }

  function clearConfetti() {
    confettiPieces = [];
    if (confettiAnimId) {
      cancelAnimationFrame(confettiAnimId);
      confettiAnimId = null;
    }
    if (confettiCanvas && confettiCtx) {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }

  function getConfettiCanvas() {
    if (!confettiCanvas) {
      confettiCanvas = document.createElement("canvas");
      confettiCanvas.id = "confetti-layer";
      document.body.appendChild(confettiCanvas);
      confettiCtx = confettiCanvas.getContext("2d");
    }
    resizeConfettiCanvas();
    return confettiCtx;
  }

  function spawnConfetti(count) {
    getConfettiCanvas();
    const w = confettiCanvas.width;
    const colors = ["#ff3b7a", "#a855f7", "#3b82f6", "#22d3ee", "#10b981", "#f59e0b", "#ef4444", "#ffb547"];
    for (let i = 0; i < count; i++) {
      confettiPieces.push({
        x: w * 0.1 + Math.random() * w * 0.8,
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.3,
        w: 4 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 0.003 + Math.random() * 0.004,
      });
    }
    if (!confettiAnimId) confettiLoop();
  }

  function confettiLoop() {
    if (!confettiPieces.length) {
      if (confettiCanvas) {
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      }
      confettiAnimId = null;
      return;
    }
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    for (let i = confettiPieces.length - 1; i >= 0; i--) {
      const c = confettiPieces[i];
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.08;
      c.vx *= 0.99;
      c.rot += c.rotV;
      c.life -= c.decay;
      if (c.life <= 0 || c.y > confettiCanvas.height + 20) {
        confettiPieces.splice(i, 1);
        continue;
      }
      confettiCtx.save();
      confettiCtx.translate(c.x, c.y);
      confettiCtx.rotate(c.rot);
      confettiCtx.globalAlpha = c.life;
      confettiCtx.fillStyle = c.color;
      confettiCtx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      confettiCtx.restore();
    }
    confettiAnimId = requestAnimationFrame(confettiLoop);
  }

  // Screen flash effect
  function screenFlash(type) {
    if (prefersReducedMotion.matches) return;
    const el = document.createElement("div");
    el.className = "screen-flash " + type;
    document.body.appendChild(el);
    queueTransientTimeout(() => el.remove(), 450);
  }

  function clearTransientFx() {
    for (const timeoutId of transientTimeoutIds) clearTimeout(timeoutId);
    transientTimeoutIds.clear();
    particles = [];
    pulses = [];
    sweeps = [];
    placedCells = [];
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = null;
    animRunning = false;
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    document.querySelectorAll(
      ".screen-flash, .streak-banner, .new-best-live, .milestone-banner, .perfect-clear-banner, .float-score"
    ).forEach((el) => el.remove());
    if (shareToast) shareToast.classList.add("hidden");
    if (levelUpOverlay) levelUpOverlay.classList.add("hidden");
  }

  function clearGameOverState() {
    if (pendingGameOverId) {
      clearTimeout(pendingGameOverId);
      pendingGameOverId = null;
    }
    for (const timeoutId of gameOverRowTimeouts) clearTimeout(timeoutId);
    gameOverRowTimeouts = [];
    if (gameOverShakeTimeoutId) {
      clearTimeout(gameOverShakeTimeoutId);
      gameOverShakeTimeoutId = null;
    }
    if (gameOverAdPollId) {
      clearInterval(gameOverAdPollId);
      gameOverAdPollId = null;
    }
    if (gameOverAdSafetyId) {
      clearTimeout(gameOverAdSafetyId);
      gameOverAdSafetyId = null;
    }
    if (gameOverVignetteTimeoutId) {
      clearTimeout(gameOverVignetteTimeoutId);
      gameOverVignetteTimeoutId = null;
    }
    if (gameOverVignetteEl) {
      gameOverVignetteEl.remove();
      gameOverVignetteEl = null;
    }
    if (gameOverFireworksId) {
      clearInterval(gameOverFireworksId);
      gameOverFireworksId = null;
    }
    if (countUpAnimIds.size) {
      for (const animId of countUpAnimIds) cancelAnimationFrame(animId);
      countUpAnimIds.clear();
    }
  }

  function clearIdleNudgeState() {
    if (idleNudgeTimeoutId) {
      clearTimeout(idleNudgeTimeoutId);
      idleNudgeTimeoutId = null;
    }
    idleNudgeActive = false;
    for (const slot of tray.querySelectorAll(".piece-slot.idle-nudge")) {
      slot.classList.remove("idle-nudge");
    }
  }

  function registerInteraction(now = performance.now()) {
    lastInteractionTime = now;
    clearIdleNudgeState();
  }

  function startGameOverFireworks() {
    if (gameOverFireworksId) return;
    gameOverFireworksId = setInterval(() => {
      if (!goOverlay.classList.contains("hidden")) {
        spawnConfetti(30);
      }
    }, 1500);
  }

  function showGameOverOverlay(isNewBest) {
    goOverlay.classList.remove("hidden");
    if (isNewBest) startGameOverFireworks();
  }

  function scheduleGameOver(delay = 500) {
    if (pendingGameOverId || !gameActive) return;
    gameActive = false;
    pendingGameOverId = setTimeout(() => {
      pendingGameOverId = null;
      gameOver();
    }, delay);
  }

  // ============================================================
  // ANIMATED SCORE COUNTER
  // ============================================================
  function animateScoreTo(target) {
    if (scoreAnimId) cancelAnimationFrame(scoreAnimId);
    const start = displayScore;
    const diff = target - start;
    if (diff <= 0) { displayScore = target; scoreEl.textContent = target; return; }
    const duration = Math.min(400, Math.max(150, diff * 3));
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      displayScore = Math.round(start + diff * eased);
      scoreEl.textContent = displayScore;
      if (progress < 1) {
        scoreAnimId = requestAnimationFrame(tick);
      } else {
        displayScore = target;
        scoreEl.textContent = target;
        scoreAnimId = null;
      }
    }
    scoreAnimId = requestAnimationFrame(tick);
  }

  function animateCountUp(el, from, to, duration, withSound = false) {
    if (to === from) { el.textContent = to; return; }
    const startTime = performance.now();
    let lastTickVal = from;
    let frameId = null;
    function tick(now) {
      if (frameId !== null) {
        countUpAnimIds.delete(frameId);
        frameId = null;
      }
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const val = Math.round(from + (to - from) * eased);
      el.textContent = val;
      // Tick sound every ~10% of value or at least every 50ms-worth of change
      if (withSound && val !== lastTickVal) {
        const step = Math.max(1, Math.round((to - from) / 12));
        if (val - lastTickVal >= step || progress >= 1) {
          sfxTick(900 + (val / Math.max(to, 1)) * 600);
          lastTickVal = val;
        }
      }
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
        countUpAnimIds.add(frameId);
      }
    }
    frameId = requestAnimationFrame(tick);
    countUpAnimIds.add(frameId);
  }

  function triggerPlacementPulse() {
    if (prefersReducedMotion.matches) return;
    const bw = document.getElementById("board-wrapper");
    if (!bw) return;
    bw.classList.remove("placement-pulse");
    void bw.offsetWidth;
    bw.classList.add("placement-pulse");
  }

  // ============================================================
  // SIZING
  // ============================================================
  let cellSize = 36; // safe default until resize() runs
  let boardPx = 324; // 36 * 9

  function resize() {
    const headerH = document.getElementById("header").offsetHeight || 50;
    const toolbarH = document.getElementById("toolbar").offsetHeight || 52;
    const storeBanner = document.getElementById("store-banner");
    const storeBannerH = (storeBanner && storeBanner.offsetHeight) || 0;
    const adBanner = document.getElementById("ad-banner-container");
    const adBannerH = (adBanner && !adBanner.classList.contains("hidden")) ? (adBanner.offsetHeight || 0) : 0;
    const modeSelector = document.getElementById("mode-selector");
    const modeSelectorH = (modeSelector && modeSelector.offsetHeight) || 0;
    const dailyInfo = document.getElementById("daily-info");
    const dailyInfoH = (dailyInfo && !dailyInfo.classList.contains("hidden")) ? (dailyInfo.offsetHeight || 0) : 0;
    const appPad = 16 + 8; // padding + gaps
    const trayMinH = 80;
    const vh = window.innerHeight || document.documentElement.clientHeight || 700;
    const vw = window.innerWidth || document.documentElement.clientWidth || 375;

    const availH = vh - headerH - toolbarH - storeBannerH - adBannerH - modeSelectorH - dailyInfoH - appPad - trayMinH - 20;
    const availW = Math.min(vw - 44, 480 - 32); // account for wrapper padding

    boardPx = Math.min(availW, availH);
    boardPx = Math.max(boardPx, 180); // minimum
    boardPx = Math.floor(boardPx / GRID) * GRID;
    cellSize = boardPx / GRID;

    canvas.width = boardPx;
    canvas.height = boardPx;
    canvas.style.width = boardPx + "px";
    canvas.style.height = boardPx + "px";

    fxCanvas.width = boardPx;
    fxCanvas.height = boardPx;
    fxCanvas.style.width = boardPx + "px";
    fxCanvas.style.height = boardPx + "px";

    refreshCachedStyles();
    drawBoard();
    renderPieces();
  }

  // ============================================================
  // BOARD LOGIC
  // ============================================================
  function initBoard() {
    board = [];
    for (let r = 0; r < GRID; r++) {
      board[r] = new Array(GRID).fill(0);
    }
  }

  function canPlace(piece, row, col) {
    for (const [dr, dc] of piece.cells) {
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) return false;
      if (board[r][c] !== 0) return false;
    }
    return true;
  }

  function placePiece(piece, row, col) {
    for (const [dr, dc] of piece.cells) {
      board[row + dr][col + dc] = piece.colorIdx;
    }
  }

  function checkClears() {
    const rowsToClear = [];
    const colsToClear = [];
    const boxesToClear = [];

    for (let r = 0; r < GRID; r++) {
      if (board[r].every(c => c !== 0)) rowsToClear.push(r);
    }
    for (let c = 0; c < GRID; c++) {
      let full = true;
      for (let r = 0; r < GRID; r++) { if (board[r][c] === 0) { full = false; break; } }
      if (full) colsToClear.push(c);
    }
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        let full = true;
        for (let r = br * 3; r < br * 3 + 3; r++) {
          for (let c = bc * 3; c < bc * 3 + 3; c++) {
            if (board[r][c] === 0) { full = false; break; }
          }
          if (!full) break;
        }
        if (full) boxesToClear.push([br, bc]);
      }
    }

    const totalClears = rowsToClear.length + colsToClear.length + boxesToClear.length;
    if (totalClears === 0) {
      comboCount = 0;
      hideComboBadge();
      return 0;
    }

    // Collect cells to clear
    const clearSet = new Set();
    for (const r of rowsToClear) {
      for (let c = 0; c < GRID; c++) clearSet.add(r * GRID + c);
    }
    for (const c of colsToClear) {
      for (let r = 0; r < GRID; r++) clearSet.add(r * GRID + c);
    }
    for (const [br, bc] of boxesToClear) {
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) clearSet.add(r * GRID + c);
      }
    }

    // Spawn particles BEFORE clearing
    spawnClearParticles([...clearSet]);

    // Sweep effect across cleared lines
    spawnClearSweep([...clearSet]);

    // Clear cells with staggered animation
    animateClearStaggered([...clearSet]);

    // Actually clear cells
    for (const idx of clearSet) {
      const r = Math.floor(idx / GRID);
      const c = idx % GRID;
      board[r][c] = 0;
    }

    // Update combo
    comboCount++;
    gameStats.linesCleared += totalClears;
    if (comboCount > 1) {
      gameStats.combos++;
    }

    // Scoring: base + combo multiplier
    let pts = clearSet.size;
    if (totalClears > 1) {
      pts += totalClears * 10;
    }
    if (comboCount > 1) {
      pts = Math.floor(pts * (1 + comboCount * 0.5));
      showComboBadge(comboCount);
      sfxCombo(comboCount);
      showStreakBanner(comboCount);
    }

    // Perfect clear bonus: board is completely empty
    const isPerfectClear = board.every(row => row.every(cell => cell === 0));
    if (isPerfectClear) {
      pts += 50;
      spawnConfetti(100);
      screenFlash("gold");
      if (navigator.vibrate) navigator.vibrate([60, 40, 60, 40, 60, 40, 80]);
      showPerfectClearBanner();
    }

    // Enhanced celebrations based on clear size
    if (totalClears >= 3) {
      // Triple+ clear: confetti + gold flash
      spawnConfetti(60);
      screenFlash("gold");
      if (navigator.vibrate) navigator.vibrate([40, 30, 40, 30, 60]);
    } else if (totalClears >= 2) {
      // Double clear: accent flash
      screenFlash("accent");
      if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
    } else {
      // Single clear: gentle haptic
      if (navigator.vibrate) navigator.vibrate([20]);
    }

    // Combo chain celebrations
    if (comboCount >= 4) {
      spawnConfetti(40);
      screenFlash("gold");
    } else if (comboCount >= 3) {
      screenFlash("accent");
    }

    return pts;
  }

  function animateClearStaggered(cells) {
    const wrapper = document.getElementById("board-wrapper");
    const app = document.getElementById("app");

    // Escalating glow based on clear size
    const glowClasses = ["board-glow", "board-glow-intense", "board-glow-epic"];
    for (const cls of glowClasses) wrapper.classList.remove(cls);
    void wrapper.offsetWidth;

    if (cells.length >= 27) {
      wrapper.classList.add("board-glow-epic");
    } else if (cells.length >= 18) {
      wrapper.classList.add("board-glow-intense");
    } else {
      wrapper.classList.add("board-glow");
    }

    // Escalating shake
    const shakeClasses = ["shake", "shake-big", "shake-epic"];
    for (const cls of shakeClasses) app.classList.remove(cls);
    void app.offsetWidth;

    if (cells.length >= 27) {
      app.classList.add("shake-epic");
    } else if (cells.length >= 18) {
      app.classList.add("shake-big");
    } else if (cells.length > 12) {
      app.classList.add("shake");
    }
  }

  // Streak banner system
  function showStreakBanner(combo) {
    if (combo < 2) return;
    const level = Math.min(combo, 5);

    const existing = document.querySelector(".streak-banner");
    if (existing) existing.remove();

    const labels = {
      2: "DOUBLE!",
      3: "TRIPLE!",
      4: "UNSTOPPABLE!",
      5: "GODLIKE!",
    };

    const multiplier = (1 + combo * 0.5).toFixed(1);
    const el = document.createElement("div");
    el.className = `streak-banner streak-${level}`;
    el.innerHTML = `<span class="streak-text">${labels[level] || "x" + combo + " COMBO!"}<span class="streak-mult">${multiplier}x</span></span>`;
    document.body.appendChild(el);
    queueTransientTimeout(() => el.remove(), 1600);
  }

  function anyMovePossible() {
    for (const piece of pieces) {
      if (!piece) continue;
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (canPlace(piece, r, c)) return true;
        }
      }
    }
    return false;
  }

  // ============================================================
  // HINT SYSTEM — show valid placements for a piece (tap-to-hint + tap-to-place)
  // ============================================================
  let hintTimeout = null;
  let hintedPiece = null;
  let hintedPieceIdx = -1;
  let hintPlacements = [];

  function clearHints() {
    if (hintTimeout) {
      clearTimeout(hintTimeout);
      hintTimeout = null;
    }
    hintedPiece = null;
    hintedPieceIdx = -1;
    hintPlacements = [];
    const fxCanvas = document.getElementById("fx-layer");
    if (fxCanvas) {
      const fxCtx = fxCanvas.getContext("2d");
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    }
  }

  function showHints(piece, pieceIdx) {
    if (!piece || !gameActive) return;

    clearHints();
    hintedPiece = piece;
    hintedPieceIdx = pieceIdx;

    const fxCanvas = document.getElementById("fx-layer");
    const fxCtx = fxCanvas.getContext("2d");
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    fxCtx.fillStyle = "rgba(108, 200, 255, 0.2)";

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!canPlace(piece, r, c)) continue;
        hintPlacements.push({ row: r, col: c });
        for (const [dr, dc] of piece.cells) {
          fxCtx.fillRect((c + dc) * cellSize + 2, (r + dr) * cellSize + 2, cellSize - 4, cellSize - 4);
        }
      }
    }

    if (!hintPlacements.length) {
      clearHints();
      return;
    }

    hintTimeout = setTimeout(clearHints, 1500);
  }

  // Tap-to-place: click a highlighted hint cell to place the piece there
  canvas.addEventListener("click", (e) => {
    if (!hintedPiece || hintedPieceIdx < 0 || !gameActive) return;
    registerInteraction();

    const rect = canvas.getBoundingClientRect();
    const tapCol = Math.floor((e.clientX - rect.left) / cellSize);
    const tapRow = Math.floor((e.clientY - rect.top) / cellSize);
    const placement = hintPlacements.find(({ row, col }) =>
      hintedPiece.cells.some(([dr, dc]) => row + dr === tapRow && col + dc === tapCol)
    );

    if (!placement) return;

    const piece = hintedPiece;
    const idx = hintedPieceIdx;
    clearHints();

    // Save undo snapshot
    undoSnapshot = {
      board: board.map(r => [...r]),
      score: score,
      pieces: pieces.map(p => p ? { cells: p.cells, colorIdx: p.colorIdx } : null),
      comboCount: comboCount,
      gameStats: { ...gameStats },
    };
    btnUndo.disabled = false;

    triggerPlacementPop(piece, placement.row, placement.col);
    placePiece(piece, placement.row, placement.col);
    sfxPlace();
    sfxSnap();
    gameStats.piecesPlaced++;

    triggerPlacementPulse();

    // Radial pulse from placement center
    const tapCells = piece.cells;
    let tapCX = 0, tapCY = 0;
    for (const [dr, dc] of tapCells) {
      tapCX += (placement.col + dc) * cellSize + cellSize / 2;
      tapCY += (placement.row + dr) * cellSize + cellSize / 2;
    }
    tapCX /= tapCells.length;
    tapCY /= tapCells.length;
    const tapCI = (piece.colorIdx - 1) % CELL_COLORS.length;
    spawnRadialPulse(tapCX, tapCY, CELL_COLORS_LIGHT[tapCI]);

    // Spawn placement sparkles
    for (const [dr, dc] of tapCells) {
      const px = (placement.col + dc) * cellSize + cellSize / 2;
      const py = (placement.row + dr) * cellSize + cellSize / 2;
      spawnParticles(px, py, CELL_COLORS_LIGHT[tapCI], 3, { speedMult: 0.6, sizeMult: 0.7, sparkle: true });
    }

    // Score for placing (mirrors drag path)
    const placePts = piece.cells.length;
    addScore(placePts);

    // Check clears
    const clearPts = checkClears();
    if (clearPts > 0) {
      sfxClear(Math.ceil(clearPts / 9));
      addScore(clearPts);
      // Float score near the placement
      const boardRect = canvas.getBoundingClientRect();
      const cx = boardRect.left + (placement.col + 0.5) * cellSize;
      const cy = boardRect.top + (placement.row + 0.5) * cellSize;
      showFloatScore(clearPts, cx, cy - 40, clearPts > 20);
    }

    pieces[idx] = null;

    const dealtFreshRack = pieces.every(p => p === null);
    if (dealtFreshRack) {
      undoSnapshot = null; // Can't undo across a new deal
      btnUndo.disabled = true;
      dealPieces();
    }

    renderPieces(dealtFreshRack);

    // Check game over
    if (!anyMovePossible()) scheduleGameOver(500);

    saveState();
    drawBoard();
  });

  // ============================================================
  // DRAWING
  // ============================================================
  // Cache CSS custom property values (refreshed on theme change / resize)
  let cachedStyles = { gridBg: "", gridLine: "", cellEmpty: "", hoverInvalid: "" };

  function refreshCachedStyles() {
    const style = getComputedStyle(document.documentElement);
    cachedStyles.gridBg = style.getPropertyValue("--grid-bg").trim();
    cachedStyles.gridLine = style.getPropertyValue("--grid-line").trim();
    cachedStyles.cellEmpty = style.getPropertyValue("--cell-empty").trim();
    cachedStyles.hoverInvalid = style.getPropertyValue("--cell-hover-invalid").trim();
  }

  // Ambient shimmer state
  let shimmerPhase = 0;
  let shimmerAnimId = null;
  let lastShimmerTime = 0;

  // Cell twinkle state — random filled cells briefly sparkle
  let twinkleCells = []; // [{r, c, startTime}]
  let lastTwinkleSpawn = 0;

  // Idle nudge state — bounce first available piece after inactivity
  let lastInteractionTime = 0;
  let idleNudgeActive = false;
  let idleNudgeTimeoutId = null;

  // Placement pop state
  let placedCells = []; // [{r, c, time, color}]

  function startAmbientShimmer() {
    if (shimmerAnimId || prefersReducedMotion.matches || document.hidden) return;
    lastShimmerTime = performance.now();
    function shimmerLoop(now) {
      if (prefersReducedMotion.matches || document.hidden) {
        shimmerAnimId = null;
        return;
      }
      const dt = (now - lastShimmerTime) / 1000;
      lastShimmerTime = now;
      shimmerPhase += dt * 0.8; // slow wave
      if (shimmerPhase > Math.PI * 200) shimmerPhase -= Math.PI * 200;

      // Cell twinkle: spawn a new sparkle every ~800ms on a random filled cell
      if (now - lastTwinkleSpawn > 800 && gameActive) {
        const filledCells = [];
        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            if (board[r][c] !== 0) filledCells.push({ r, c });
          }
        }
        if (filledCells.length > 0) {
          const pick = filledCells[Math.floor(Math.random() * filledCells.length)];
          twinkleCells.push({ r: pick.r, c: pick.c, startTime: now });
          lastTwinkleSpawn = now;
        }
      }
      // Clean expired twinkles (500ms lifetime)
      twinkleCells = twinkleCells.filter(t => now - t.startTime < 500);

      // Idle nudge: if no interaction for 5s and game is active
      if (gameActive && now - lastInteractionTime > 5000 && !idleNudgeActive && !dragPiece) {
        idleNudgeActive = true;
        const slots = tray.querySelectorAll(".piece-slot");
        for (let i = 0; i < pieces.length; i++) {
          if (pieces[i]) {
            const slot = slots[i];
            if (slot && !slot.classList.contains("used")) {
              slot.classList.add("idle-nudge");
              lastInteractionTime = now;
              idleNudgeTimeoutId = setTimeout(() => {
                slot.classList.remove("idle-nudge");
                idleNudgeTimeoutId = null;
                idleNudgeActive = false;
              }, 600);
            }
            break; // only nudge the first available
          }
        }
      }

      if (!isGhostPreviewActive()) renderBoardFrame();
      shimmerAnimId = requestAnimationFrame(shimmerLoop);
    }
    shimmerAnimId = requestAnimationFrame(shimmerLoop);
  }

  function stopAmbientShimmer() {
    if (shimmerAnimId) {
      cancelAnimationFrame(shimmerAnimId);
      shimmerAnimId = null;
    }
  }

  function isGhostPreviewActive() {
    return !!dragPiece &&
      lastGhostRow >= -2 && lastGhostRow < GRID + 2 &&
      lastGhostCol >= -2 && lastGhostCol < GRID + 2;
  }

  function triggerPlacementPop(piece, row, col) {
    const now = performance.now();
    const ci = (piece.colorIdx - 1) % CELL_COLORS.length;
    const color = CELL_COLORS[ci];
    for (let i = 0; i < piece.cells.length; i++) {
      const [dr, dc] = piece.cells[i];
      placedCells.push({ r: row + dr, c: col + dc, time: now + i * 30, color });
    }
    // Keep placement-pop cleanup owned so restarts cannot mutate a fresh run.
    queueTransientTimeout(() => {
      placedCells = placedCells.filter(p => performance.now() - p.time < 350);
    }, 500);
  }

  function drawBoard() {
    const { gridBg, gridLine, cellEmpty } = cachedStyles;
    const now = performance.now();

    // IMPORTANT: fully clear the canvas first to remove any ghost artifacts
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;

    // Background
    ctx.fillStyle = gridBg;
    ctx.beginPath();
    roundRect(ctx, 0, 0, boardPx, boardPx, 8);
    ctx.fill();

    const pad = 1.5;
    const radius = 4;

    // Draw cells
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const x = c * cellSize;
        const y = r * cellSize;

        if (board[r][c] !== 0) {
          const ci = (board[r][c] - 1) % CELL_COLORS.length;
          const color = CELL_COLORS[ci];
          const lightColor = CELL_COLORS_LIGHT[ci];

          // Check if this cell just got placed (pop animation)
          const popEntry = placedCells.find(p => p.r === r && p.c === c);
          let scale = 1;
          if (popEntry) {
            const elapsed = now - popEntry.time;
            if (elapsed >= 0 && elapsed < 300) {
              const t = elapsed / 300;
              // Elastic pop: 0 -> 1.2 -> 0.9 -> 1
              if (t < 0.4) scale = t / 0.4 * 1.2;
              else if (t < 0.7) scale = 1.2 - (t - 0.4) / 0.3 * 0.3;
              else scale = 0.9 + (t - 0.7) / 0.3 * 0.1;
            }
          }

          ctx.save();
          if (scale !== 1) {
            const cx = x + cellSize / 2;
            const cy = y + cellSize / 2;
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.translate(-cx, -cy);
          }

          // Subtle glow behind filled cells
          ctx.shadowColor = color;
          ctx.shadowBlur = 6;

          // Main fill
          ctx.fillStyle = color;
          ctx.beginPath();
          roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
          ctx.fill();
          ctx.shadowBlur = 0;

          // Top shine (gradient)
          const shineGrad = ctx.createLinearGradient(x, y + pad, x, y + cellSize * 0.5);
          shineGrad.addColorStop(0, "rgba(255,255,255,0.25)");
          shineGrad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = shineGrad;
          ctx.beginPath();
          roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize * 0.5 - pad, radius);
          ctx.fill();

          // Bottom shadow
          ctx.fillStyle = "rgba(0,0,0,0.12)";
          ctx.beginPath();
          roundRect(ctx, x + pad, y + cellSize * 0.7, cellSize - pad * 2, cellSize * 0.3 - pad, radius);
          ctx.fill();

          ctx.restore();
        } else {
          // Ambient shimmer on empty cells
          const shimmer = Math.sin(shimmerPhase + r * 0.7 + c * 0.5) * 0.03 + 0.03;
          ctx.fillStyle = cellEmpty;
          ctx.globalAlpha = 1 + shimmer;
          ctx.beginPath();
          roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    // Cell twinkle overlay — brief sparkle on random filled cells
    for (const tw of twinkleCells) {
      const elapsed = now - tw.startTime;
      const progress = elapsed / 500;
      if (progress >= 1) continue;
      // Ease: bright peak at 30%, then fade
      const alpha = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
      const x = tw.c * cellSize;
      const y = tw.r * cellSize;
      ctx.save();
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = cellSize * 0.4;
      ctx.beginPath();
      roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
      ctx.fill();
      ctx.restore();
    }

    // 3x3 box outlines with traveling light
    ctx.lineWidth = 2;
    const boxW = cellSize * 3;
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const bx = bc * boxW + 0.5;
        const by = br * boxW + 0.5;

        // Base grid line
        ctx.strokeStyle = gridLine;
        ctx.beginPath();
        roundRect(ctx, bx, by, boxW, boxW, 6);
        ctx.stroke();

        // Traveling light pulse along edges
        if (!prefersReducedMotion.matches && shimmerPhase > 0) {
          const perimeter = boxW * 4;
          const lightPos = ((shimmerPhase * 40 + br * 120 + bc * 80) % perimeter);
          let lx, ly;
          if (lightPos < boxW) {
            lx = bx + lightPos; ly = by;
          } else if (lightPos < boxW * 2) {
            lx = bx + boxW; ly = by + (lightPos - boxW);
          } else if (lightPos < boxW * 3) {
            lx = bx + boxW - (lightPos - boxW * 2); ly = by + boxW;
          } else {
            lx = bx; ly = by + boxW - (lightPos - boxW * 3);
          }
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = "rgba(108, 140, 255, 0.95)";
          ctx.shadowColor = "rgba(108, 140, 255, 0.7)";
          ctx.shadowBlur = cellSize * 0.55;
          ctx.beginPath();
          ctx.arc(lx, ly, Math.max(2.5, cellSize * 0.12), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  function drawGhostOverlay(piece, row, col, valid) {

    const now = performance.now();
    const pulse = Math.sin(now * 0.006) * 0.12 + 0.72; // 0.60 - 0.84 — much more visible
    const dashOffset = (now * 0.04) % 20; // animated marching ants

    ctx.save();
    try {
      if (valid) {
        const ci = (piece.colorIdx - 1) % CELL_COLORS.length;
        const color = CELL_COLORS[ci];
        const lightColor = CELL_COLORS_LIGHT[ci];

        // --- Pass 1: outer glow halo behind all ghost cells ---
        ctx.shadowColor = lightColor;
        ctx.shadowBlur = cellSize * 0.5;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = color;
        for (const [dr, dc] of piece.cells) {
          const r = row + dr, c = col + dc;
          if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
          const x = c * cellSize, y = r * cellSize;
          ctx.beginPath();
          roundRect(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, 4);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // --- Pass 2: solid filled cells ---
        ctx.globalAlpha = pulse;
        for (const [dr, dc] of piece.cells) {
          const r = row + dr, c = col + dc;
          if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
          const x = c * cellSize + 2, y = r * cellSize + 2;
          const w = cellSize - 4, h = cellSize - 4;

          // Fill
          ctx.fillStyle = color;
          ctx.beginPath();
          roundRect(ctx, x, y, w, h, 4);
          ctx.fill();

          // Inner highlight (top-left light reflection)
          ctx.fillStyle = lightColor;
          ctx.globalAlpha = pulse * 0.45;
          ctx.beginPath();
          roundRect(ctx, x + 2, y + 2, w * 0.45, h * 0.3, 3);
          ctx.fill();
          ctx.globalAlpha = pulse;
        }

        // --- Pass 3: marching-ants dashed border ---
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -dashOffset;
        ctx.strokeStyle = lightColor;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.9;
        for (const [dr, dc] of piece.cells) {
          const r = row + dr, c = col + dc;
          if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
          const x = c * cellSize + 2, y = r * cellSize + 2;
          ctx.beginPath();
          roundRect(ctx, x, y, cellSize - 4, cellSize - 4, 4);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // --- Pass 4: outer contour around the whole piece shape ---
        // Build a set of occupied cells for outline detection
        const occupied = new Set();
        for (const [dr, dc] of piece.cells) {
          occupied.add((row + dr) + "," + (col + dc));
        }
        ctx.strokeStyle = lightColor;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([]);
        for (const [dr, dc] of piece.cells) {
          const r = row + dr, c = col + dc;
          if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
          const x = c * cellSize, y = r * cellSize;
          // Draw edges only where there is no adjacent ghost cell
          if (!occupied.has((r - 1) + "," + c)) { ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + cellSize - 1, y + 1); ctx.stroke(); }
          if (!occupied.has((r + 1) + "," + c)) { ctx.beginPath(); ctx.moveTo(x + 1, y + cellSize - 1); ctx.lineTo(x + cellSize - 1, y + cellSize - 1); ctx.stroke(); }
          if (!occupied.has(r + "," + (c - 1))) { ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + 1, y + cellSize - 1); ctx.stroke(); }
          if (!occupied.has(r + "," + (c + 1))) { ctx.beginPath(); ctx.moveTo(x + cellSize - 1, y + 1); ctx.lineTo(x + cellSize - 1, y + cellSize - 1); ctx.stroke(); }
        }

      } else {
        // Invalid placement — red tinted X-pattern overlay
        for (const [dr, dc] of piece.cells) {
          const r = row + dr, c = col + dc;
          if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
          const x = c * cellSize + 2, y = r * cellSize + 2;
          const w = cellSize - 4, h = cellSize - 4;

          // Red fill
          ctx.fillStyle = "rgba(239, 68, 68, 0.35)";
          ctx.globalAlpha = 1;
          ctx.beginPath();
          roundRect(ctx, x, y, w, h, 4);
          ctx.fill();

          // Red dashed border
          ctx.setLineDash([4, 3]);
          ctx.lineDashOffset = -dashOffset;
          ctx.strokeStyle = "rgba(239, 68, 68, 0.7)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          roundRect(ctx, x, y, w, h, 4);
          ctx.stroke();
          ctx.setLineDash([]);

          // Small X mark in center of each cell
          const cx = x + w / 2, cy = y + h / 2;
          const sz = Math.min(w, h) * 0.2;
          ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx - sz, cy - sz); ctx.lineTo(cx + sz, cy + sz);
          ctx.moveTo(cx + sz, cy - sz); ctx.lineTo(cx - sz, cy + sz);
          ctx.stroke();
        }
      }
    } finally {
      ctx.restore();
    }
  }

  function drawGhost(piece, row, col, valid) {
    drawBoard();
    drawGhostOverlay(piece, row, col, valid);
  }

  function renderBoardFrame() {
    if (isGhostPreviewActive()) {
      drawGhost(dragPiece, lastGhostRow, lastGhostCol, canPlace(dragPiece, lastGhostRow, lastGhostCol));
      return;
    }
    drawBoard();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ============================================================
  // PIECE GENERATION & RENDERING
  // ============================================================
  function randomPiece() {
    const rng = (gameMode === "daily" && dailyRng) ? dailyRng : Math.random;
    const def = PIECE_DEFS[Math.floor(rng() * PIECE_DEFS.length)];
    const colorIdx = Math.floor(rng() * CELL_COLORS.length) + 1;
    return { cells: def, colorIdx };
  }

  function dealPieces() {
    pieces = [randomPiece(), randomPiece(), randomPiece()];
    renderPieces(true);
  }

  // ============================================================
  // MODE SWITCHING
  // ============================================================
  function switchMode(mode) {
    if (mode === gameMode && initialized) return;
    gameMode = mode;

    // Update UI
    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    const dailyInfo = document.getElementById("daily-info");
    const atfTagline = document.getElementById("atf-tagline");

    if (mode === "daily") {
      const { seed, dateStr } = getDailySeed();
      dailyRng = mulberry32(seed);
      dailyDateStr = dateStr;

      // Load daily best
      dailyBestScore = parseInt(localStorage.getItem("blockdoku_daily_best_" + dateStr) || "0");
      const dailyBestEl = document.getElementById("daily-best-val");
      if (dailyBestEl) dailyBestEl.textContent = dailyBestScore;

      // Format date nicely
      const dateObj = new Date(dateStr + "T12:00:00");
      const formatted = dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const dailyDateEl = document.getElementById("daily-date");
      if (dailyDateEl) dailyDateEl.textContent = formatted;

      dailyInfo.classList.remove("hidden");
      if (atfTagline) atfTagline.style.display = "none";
    } else {
      dailyRng = null;
      dailyInfo.classList.add("hidden");
      if (atfTagline) atfTagline.style.display = "";
    }

    // Start fresh game in new mode
    newGame();
    localStorage.setItem("blockdoku_mode", mode);
  }

  const pieceEntranceTimeouts = new Set();

  function clearPieceEntranceAnimations() {
    for (const timeoutId of pieceEntranceTimeouts) clearTimeout(timeoutId);
    pieceEntranceTimeouts.clear();
    tray.querySelectorAll(".piece-slot").forEach((slot) => {
      slot.style.opacity = "";
      slot.style.transform = "";
      slot.style.transition = "";
    });
  }

  function queueEntranceAnimation(slot, idx) {
    slot.style.opacity = "0";
    slot.style.transform = "scale(0.5) translateY(10px)";
    const startId = setTimeout(() => {
      pieceEntranceTimeouts.delete(startId);
      slot.style.transition = "opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
      slot.style.opacity = "1";
      slot.style.transform = "scale(1) translateY(0)";
      const cleanupId = setTimeout(() => {
        pieceEntranceTimeouts.delete(cleanupId);
        slot.style.opacity = "";
        slot.style.transform = "";
        slot.style.transition = "";
      }, 350);
      pieceEntranceTimeouts.add(cleanupId);
    }, idx * 100);
    pieceEntranceTimeouts.add(startId);
  }

  function renderPieces(animate = false) {
    clearPieceEntranceAnimations();
    const slots = tray.querySelectorAll(".piece-slot");
    slots.forEach((slot, idx) => {
      slot.innerHTML = "";
      const piece = pieces[idx];

      if (piece) {
        slot.classList.remove("used");
        if (animate) {
          queueEntranceAnimation(slot, idx);
        }
        const pCanvas = document.createElement("canvas");
        const pCtx = pCanvas.getContext("2d");

        let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
        for (const [dr, dc] of piece.cells) {
          minR = Math.min(minR, dr); maxR = Math.max(maxR, dr);
          minC = Math.min(minC, dc); maxC = Math.max(maxC, dc);
        }
        const rows = maxR - minR + 1;
        const cols = maxC - minC + 1;

        // Dynamic cell size based on available space
        const slotW = Math.max(slot.clientWidth - 16, 60);
        const slotH = Math.max(slot.clientHeight - 16, 50);
        const cs = cellSize || 36;
        const pCellSize = Math.min(
          Math.floor(slotW / cols),
          Math.floor(slotH / rows),
          Math.floor(cs * 0.65)
        );
        const finalCellSize = Math.max(pCellSize || 14, 14);

        pCanvas.width = cols * finalCellSize;
        pCanvas.height = rows * finalCellSize;

        const ci = (piece.colorIdx - 1) % CELL_COLORS.length;
        const color = CELL_COLORS[ci];

        for (const [dr, dc] of piece.cells) {
          const x = (dc - minC) * finalCellSize;
          const y = (dr - minR) * finalCellSize;
          const p = 1;

          // Main fill
          pCtx.fillStyle = color;
          pCtx.beginPath();
          roundRect(pCtx, x + p, y + p, finalCellSize - p * 2, finalCellSize - p * 2, 3);
          pCtx.fill();

          // Shine
          const shineGrad = pCtx.createLinearGradient(x, y + p, x, y + finalCellSize * 0.5);
          shineGrad.addColorStop(0, "rgba(255,255,255,0.25)");
          shineGrad.addColorStop(1, "rgba(255,255,255,0)");
          pCtx.fillStyle = shineGrad;
          pCtx.beginPath();
          roundRect(pCtx, x + p, y + p, finalCellSize - p * 2, finalCellSize * 0.45, 3);
          pCtx.fill();
        }

        slot.appendChild(pCanvas);
      } else {
        slot.classList.add("used");
      }
    });
  }

  // ============================================================
  // DRAG & DROP
  // ============================================================
  let dragPiece = null;
  let dragIdx = -1;
  let dragOffsetR = 0;
  let dragOffsetC = 0;
  let ghostEl = null;
  let lastGhostRow = -999;
  let lastGhostCol = -999;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragMoved = false;
  let ghostAnimId = null;

  // Continuously animate the ghost preview (marching ants, pulse) while dragging
  function startGhostAnim() {
    if (ghostAnimId) return;
    function tick() {
      if (!dragPiece || lastGhostRow === -999) { ghostAnimId = null; return; }
      renderBoardFrame();
      ghostAnimId = requestAnimationFrame(tick);
    }
    ghostAnimId = requestAnimationFrame(tick);
  }
  function stopGhostAnim() {
    if (ghostAnimId) { cancelAnimationFrame(ghostAnimId); ghostAnimId = null; }
  }

  function getTapSlopPx() {
    return Math.max(18, Math.round(cellSize * 0.35));
  }

  function startDrag(idx, clientX, clientY) {
    if (!pieces[idx] || !gameActive) return;
    registerInteraction();
    clearHints();
    dragPiece = pieces[idx];
    dragIdx = idx;
    dragStartX = clientX;
    dragStartY = clientY;
    dragMoved = false;

    let sumR = 0, sumC = 0;
    for (const [dr, dc] of dragPiece.cells) { sumR += dr; sumC += dc; }
    dragOffsetR = sumR / dragPiece.cells.length;
    dragOffsetC = sumC / dragPiece.cells.length;

    const slot = tray.querySelectorAll(".piece-slot")[idx];
    slot.classList.add("dragging");

    // Create floating ghost from the piece canvas
    ghostEl = document.createElement("div");
    ghostEl.className = "drag-ghost";

    const pc = slot.querySelector("canvas");
    if (pc) {
      const clone = document.createElement("canvas");
      clone.width = pc.width;
      clone.height = pc.height;
      clone.getContext("2d").drawImage(pc, 0, 0);
      ghostEl.appendChild(clone);
      ghostEl.style.width = pc.width + "px";
      ghostEl.style.height = pc.height + "px";
    }
    document.body.appendChild(ghostEl);
    moveGhost(clientX, clientY);
  }

  function moveGhost(clientX, clientY) {
    if (!ghostEl) return;
    // Track if the user actually dragged vs just tapped (adaptive slop for mobile)
    const dx = clientX - dragStartX;
    const dy = clientY - dragStartY;
    const tapSlop = getTapSlopPx();
    if (dx * dx + dy * dy > tapSlop * tapSlop) dragMoved = true;
    // Offset ghost above finger by 2 cells so piece is visible while dragging
    const dragLift = cellSize * 2;
    ghostEl.style.left = (clientX - ghostEl.offsetWidth / 2) + "px";
    ghostEl.style.top = (clientY - ghostEl.offsetHeight - dragLift) + "px";

    // Spawn drag trail particles on the board
    if (dragMoved && dragPiece) {
      const rect = canvas.getBoundingClientRect();
      const bx = clientX - rect.left;
      const by = clientY - rect.top - dragLift;
      if (bx > 0 && bx < boardPx && by > 0 && by < boardPx) {
        const ci = (dragPiece.colorIdx - 1) % CELL_COLORS.length;
        spawnDragTrail(bx, by, CELL_COLORS_LIGHT[ci]);
      }
    }

    const rect = canvas.getBoundingClientRect();
    const bx = clientX - rect.left;
    const by = clientY - rect.top - dragLift;

    const col = Math.round(bx / cellSize - dragOffsetC);
    const row = Math.round(by / cellSize - dragOffsetR);

    // Update ghost position — continuous animation handles redraw
    if (row !== lastGhostRow || col !== lastGhostCol) {
      lastGhostRow = row;
      lastGhostCol = col;
      if (row >= -2 && row < GRID + 2 && col >= -2 && col < GRID + 2) {
        startGhostAnim();
        renderBoardFrame();
      } else {
        stopGhostAnim();
        renderBoardFrame();
      }
    }
  }

  function endDrag(clientX, clientY) {
    if (!dragPiece) return;

    // Tap without dragging: show placement hints
    if (!dragMoved) {
      const hintPiece = dragPiece;
      const hintIdx = dragIdx;
      // Cleanup drag state
      stopGhostAnim();
      if (ghostEl) { ghostEl.remove(); ghostEl = null; }
      const slot = tray.querySelectorAll(".piece-slot")[dragIdx];
      if (slot) slot.classList.remove("dragging");
      dragPiece = null;
      dragIdx = -1;
      lastGhostRow = -999;
      lastGhostCol = -999;
      drawBoard();
      showHints(hintPiece, hintIdx);
      return;
    }

    const dragLift = cellSize * 2;
    const rect = canvas.getBoundingClientRect();
    const bx = clientX - rect.left;
    const by = clientY - rect.top - dragLift;

    const col = Math.round(bx / cellSize - dragOffsetC);
    const row = Math.round(by / cellSize - dragOffsetR);

    if (canPlace(dragPiece, row, col)) {
      // Save undo snapshot BEFORE placing
      undoSnapshot = {
        board: board.map(r => [...r]),
        score: score,
        pieces: pieces.map(p => p ? { cells: p.cells, colorIdx: p.colorIdx } : null),
        comboCount: comboCount,
        gameStats: { ...gameStats },
      };
      btnUndo.disabled = false;

      triggerPlacementPop(dragPiece, row, col);
      placePiece(dragPiece, row, col);
      sfxPlace();
      sfxSnap();
      gameStats.piecesPlaced++;

      triggerPlacementPulse();

      // Radial pulse from placement center
      const pieceCells = dragPiece.cells;
      let centerX = 0, centerY = 0;
      for (const [dr, dc] of pieceCells) {
        centerX += (col + dc) * cellSize + cellSize / 2;
        centerY += (row + dr) * cellSize + cellSize / 2;
      }
      centerX /= pieceCells.length;
      centerY /= pieceCells.length;
      const ci2 = (dragPiece.colorIdx - 1) % CELL_COLORS.length;
      spawnRadialPulse(centerX, centerY, CELL_COLORS_LIGHT[ci2]);

      // Spawn placement sparkles
      for (const [dr, dc] of pieceCells) {
        const px = (col + dc) * cellSize + cellSize / 2;
        const py = (row + dr) * cellSize + cellSize / 2;
        spawnParticles(px, py, CELL_COLORS_LIGHT[ci2], 3, { speedMult: 0.6, sizeMult: 0.7, sparkle: true });
      }

      // Score for placing
      const placePts = dragPiece.cells.length;
      addScore(placePts);

      // Check clears
      const clearPts = checkClears();
      if (clearPts > 0) {
        sfxClear(Math.ceil(clearPts / 9));
        addScore(clearPts);
        showFloatScore(clearPts, clientX, clientY - 80, clearPts > 20);
      }

      pieces[dragIdx] = null;
      renderPieces();

      // Deal new pieces if all used
      if (pieces.every(p => p === null)) {
        undoSnapshot = null; // Can't undo across a new deal
        btnUndo.disabled = true;
        dealPieces();
      }

      // Check game over
      if (!anyMovePossible()) scheduleGameOver(500);

      saveState();
    }

    // Cleanup
    stopGhostAnim();
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
    const slot = tray.querySelectorAll(".piece-slot")[dragIdx];
    if (slot) slot.classList.remove("dragging");
    dragPiece = null;
    dragIdx = -1;
    lastGhostRow = -999;
    lastGhostCol = -999;
    drawBoard();
  }

  // Mouse events
  tray.addEventListener("mousedown", (e) => {
    const slot = e.target.closest(".piece-slot");
    if (!slot || slot.classList.contains("used")) return;
    startDrag(parseInt(slot.dataset.idx), e.clientX, e.clientY);
  });
  window.addEventListener("mousemove", (e) => {
    if (dragPiece) moveGhost(e.clientX, e.clientY);
  });
  window.addEventListener("mouseup", (e) => {
    if (dragPiece) endDrag(e.clientX, e.clientY);
  });

  // Touch events
  tray.addEventListener("touchstart", (e) => {
    const slot = e.target.closest(".piece-slot");
    if (!slot || slot.classList.contains("used")) return;
    e.preventDefault();
    const t = e.touches[0];
    startDrag(parseInt(slot.dataset.idx), t.clientX, t.clientY);
  }, { passive: false });

  window.addEventListener("touchmove", (e) => {
    if (dragPiece) {
      e.preventDefault();
      const t = e.touches[0];
      moveGhost(t.clientX, t.clientY);
    }
  }, { passive: false });

  window.addEventListener("touchend", (e) => {
    if (dragPiece) {
      const t = e.changedTouches && e.changedTouches[0];
      if (t) {
        endDrag(t.clientX, t.clientY);
      } else {
        // Some Android WebViews fire touchend with empty changedTouches
        cancelDrag();
      }
    }
  });

  // touchcancel fires when the browser hijacks the touch (scroll, gesture, etc.)
  window.addEventListener("touchcancel", () => {
    cancelDrag();
  });

  // Safety: if drag state gets stuck, clean it up
  function cancelDrag() {
    stopGhostAnim();
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
    if (dragIdx >= 0) {
      const slot = tray.querySelectorAll(".piece-slot")[dragIdx];
      if (slot) slot.classList.remove("dragging");
    }
    dragPiece = null;
    dragIdx = -1;
    lastGhostRow = -999;
    lastGhostCol = -999;
    drawBoard();
  }

  // If window loses focus mid-drag, cancel it
  window.addEventListener("blur", () => {
    if (dragPiece) cancelDrag();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && dragPiece) cancelDrag();
    if (document.hidden) {
      stopAmbientShimmer();
    } else if (gameActive) {
      startAmbientShimmer();
    }
  });

  // ============================================================
  // UNDO
  // ============================================================
  function performUndo() {
    if (!undoSnapshot || !gameActive) return;
    board = undoSnapshot.board;
    score = undoSnapshot.score;
    pieces = undoSnapshot.pieces;
    comboCount = undoSnapshot.comboCount;
    gameStats = undoSnapshot.gameStats;

    displayScore = score;
    scoreEl.textContent = score;
    undoSnapshot = null;
    btnUndo.disabled = true;

    sfxUndo();
    drawBoard();
    renderPieces();
    hideComboBadge();
    saveState();
  }

  // ============================================================
  // LEVEL SYSTEM
  // ============================================================
  function loadLevel() {
    try {
      const saved = JSON.parse(localStorage.getItem("blockdoku_level") || "null");
      if (saved) {
        playerXP = saved.xp || 0;
        playerLevel = saved.level || 1;
      }
    } catch {}
    updateLevelUI();
  }

  function saveLevel() {
    localStorage.setItem("blockdoku_level", JSON.stringify({ xp: playerXP, level: playerLevel }));
  }

  function addXP(pts) {
    playerXP += pts;
    const prevLevel = playerLevel;

    // Recalculate level from XP
    while (playerLevel < 99 && playerXP >= xpForLevel(playerLevel + 1)) {
      playerLevel++;
    }

    if (playerLevel > prevLevel) {
      showLevelUp(playerLevel);
      sfxLevelUp();
    }

    updateLevelUI();
    saveLevel();
  }

  function updateLevelUI() {
    levelBadge.textContent = playerLevel;
    const currentThreshold = xpForLevel(playerLevel);
    const nextThreshold = xpForLevel(Math.min(playerLevel + 1, 99));
    const range = nextThreshold - currentThreshold;
    const progress = range > 0 ? ((playerXP - currentThreshold) / range) * 100 : 100;
    xpBarFill.style.width = Math.min(Math.max(progress, 0), 100) + "%";
  }

  function showLevelUp(level) {
    levelUpNum.textContent = level;
    levelUpOverlay.classList.remove("hidden");

    // Spawn celebratory particles at center of board
    const cx = boardPx / 2;
    const cy = boardPx / 2;
    for (let i = 0; i < 30; i++) {
      const angle = (Math.PI * 2 * i) / 30;
      const speed = 2 + Math.random() * 4;
      const color = CELL_COLORS[i % CELL_COLORS.length];
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.01 + Math.random() * 0.015,
        size: 3 + Math.random() * 4,
        color,
      });
    }
    ensureAnimRunning();

    queueTransientTimeout(() => {
      levelUpOverlay.classList.add("hidden");
    }, 1500);
  }

  // ============================================================
  // SHARE SCORE
  // ============================================================
  function shareScore() {
    const levelText = playerLevel > 1 ? ` (Level ${playerLevel})` : "";
    const modeText = gameMode === "daily" ? ` on today's Daily Challenge` : "";
    const text = `I scored ${score} in BlockDoku${modeText}${levelText}! Can you beat me? Play free: https://blockdoku-web.vercel.app`;

    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        showShareToast();
      }).catch(() => {
        // Fallback for browsers that expose clipboard but reject the write
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        showShareToast();
      });
    } else {
      // Fallback for older browsers / insecure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showShareToast();
    }
  }

  function showShareToast() {
    shareToast.classList.remove("hidden");
    // Force re-trigger animation
    shareToast.style.animation = "none";
    void shareToast.offsetWidth;
    shareToast.style.animation = "";
    queueTransientTimeout(() => shareToast.classList.add("hidden"), 2000);
  }

  // ============================================================
  // SCORING & UI
  // ============================================================
  function addScore(pts) {
    const prevScore = score;
    score += pts;
    animateScoreTo(score);

    // Pop animation for big gains
    if (pts >= 15) {
      scoreEl.classList.remove("score-slam");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("score-slam");
    } else {
      scoreEl.classList.remove("score-pop");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("score-pop");
    }

    // Score "warming" — shift text color based on score magnitude
    scoreEl.classList.remove("score-warm-1", "score-warm-2", "score-warm-3", "score-warm-4");
    if (score >= 2000) scoreEl.classList.add("score-warm-4");
    else if (score >= 1000) scoreEl.classList.add("score-warm-3");
    else if (score >= 500) scoreEl.classList.add("score-warm-2");
    else if (score >= 200) scoreEl.classList.add("score-warm-1");
    if (scoreBoxEl) {
      scoreBoxEl.classList.remove("score-active");
      void scoreBoxEl.offsetWidth;
      scoreBoxEl.classList.add("score-active");
      queueTransientTimeout(() => scoreBoxEl.classList.remove("score-active"), 500);
    }

    // --- Score milestones: celebrate at key thresholds ---
    const milestones = [100, 250, 500, 1000, 2000, 5000, 10000];
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (prevScore < m && score >= m && lastMilestone < m) {
        lastMilestone = m;
        const tier = i; // 0 = small, 6 = huge
        showMilestoneBanner(m, tier);
        sfxMilestone(tier);
        if (tier >= 2) spawnConfetti(20 + tier * 15);
        if (tier >= 3) screenFlash("gold");
        if (tier >= 4) screenFlash("epic");
        if (navigator.vibrate) navigator.vibrate(tier >= 3 ? [40, 30, 40, 30, 60] : [25]);
        break; // only one milestone per score event
      }
    }

    // --- Approaching best score: glow effect ---
    if (scoreBoxEl && bestScoreAtGameStart > 0 && !hasPassedBestThisGame) {
      const threshold = bestScoreAtGameStart * 0.85;
      if (score >= threshold && score < bestScoreAtGameStart) {
        scoreBoxEl.classList.add("score-approaching-best");
      } else {
        scoreBoxEl.classList.remove("score-approaching-best");
      }
    }

    // --- Live new-best detection mid-game ---
    if (score > bestScore) {
      bestScore = score;
      bestEl.textContent = bestScore;
      localStorage.setItem("blockdoku_best", bestScore);

      if (!hasPassedBestThisGame && bestScoreAtGameStart > 0) {
        hasPassedBestThisGame = true;
        scoreBoxEl.classList.remove("score-approaching-best");
        showNewBestLive();
        sfxNewBest();
        spawnConfetti(80);
        screenFlash("epic");
        if (navigator.vibrate) navigator.vibrate([60, 40, 60, 40, 80]);
      }
    }

    // Update daily best
    if (gameMode === "daily" && score > dailyBestScore) {
      dailyBestScore = score;
      const dailyBestEl = document.getElementById("daily-best-val");
      if (dailyBestEl) dailyBestEl.textContent = dailyBestScore;
      localStorage.setItem("blockdoku_daily_best_" + dailyDateStr, dailyBestScore);
    }

    // Award XP
    addXP(pts);
  }

  // Live "NEW BEST!" banner that flies in mid-game
  function showNewBestLive() {
    const existing = document.querySelector(".new-best-live");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.className = "new-best-live";
    el.innerHTML = '<span class="new-best-live-icon">&#9733;</span> NEW BEST! <span class="new-best-live-icon">&#9733;</span>';
    document.body.appendChild(el);
    queueTransientTimeout(() => el.remove(), 2500);

    // Pulse the score box gold
    if (scoreBoxEl) {
      scoreBoxEl.classList.add("score-is-best");
    }
  }

  // Score milestone banners
  function showMilestoneBanner(value, tier) {
    const existing = document.querySelector(".milestone-banner");
    if (existing) existing.remove();

    const labels = {
      100: "NICE!",
      250: "GREAT!",
      500: "AMAZING!",
      1000: "INCREDIBLE!",
      2000: "LEGENDARY!",
      5000: "GODLIKE!",
      10000: "TRANSCENDENT!",
    };

    const el = document.createElement("div");
    el.className = `milestone-banner milestone-tier-${tier}`;
    el.innerHTML = `<span class="milestone-value">${value.toLocaleString()}</span><span class="milestone-label">${labels[value] || "WOW!"}</span>`;
    document.body.appendChild(el);
    queueTransientTimeout(() => el.remove(), 2000);
  }

  function showPerfectClearBanner() {
    const el = document.createElement("div");
    el.className = "perfect-clear-banner";
    el.textContent = "PERFECT CLEAR! +50";
    document.getElementById("app").appendChild(el);
    queueTransientTimeout(() => el.remove(), 2000);
  }

  function showFloatScore(pts, x, y, big) {
    const el = document.createElement("div");
    el.className = "float-score" + (big ? " big" : "");
    el.textContent = "+" + pts;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    queueTransientTimeout(() => el.remove(), 900);
  }

  function showComboBadge(count) {
    comboText.textContent = "x" + count;
    comboBadge.classList.remove("hidden", "combo-fire", "combo-inferno");
    if (count >= 5) {
      comboBadge.classList.add("combo-inferno");
    } else if (count >= 3) {
      comboBadge.classList.add("combo-fire");
    }
    comboBadge.style.animation = "none";
    void comboBadge.offsetWidth;
    comboBadge.style.animation = "";
  }

  function hideComboBadge() {
    comboBadge.classList.add("hidden");
    comboBadge.classList.remove("combo-fire", "combo-inferno");
  }

  // ============================================================
  // GAME FLOW
  // ============================================================
  function gameOver() {
    clearGameOverState();
    sfxGameOver();
    stopAmbientShimmer();

    // Dramatic vignette — dark radial overlay that closes in during shatter
    if (!prefersReducedMotion.matches) {
      if (gameOverVignetteTimeoutId) {
        clearTimeout(gameOverVignetteTimeoutId);
        gameOverVignetteTimeoutId = null;
      }
      if (gameOverVignetteEl) gameOverVignetteEl.remove();
      gameOverVignetteEl = document.createElement("div");
      gameOverVignetteEl.className = "game-over-vignette";
      document.body.appendChild(gameOverVignetteEl);
      // Auto-remove after animation completes
      gameOverVignetteTimeoutId = setTimeout(() => {
        if (gameOverVignetteEl) {
          gameOverVignetteEl.remove();
          gameOverVignetteEl = null;
        }
        gameOverVignetteTimeoutId = null;
      }, 2000);
    }

    // Board shatter effect: explode cells row-by-row with staggered delay
    const app = document.getElementById("app");
    for (let r = 0; r < GRID; r++) {
      const timeoutId = setTimeout(() => {
        for (let c = 0; c < GRID; c++) {
          if (board[r][c] !== 0) {
            const ci = (board[r][c] - 1) % CELL_COLORS.length;
            const x = c * cellSize + cellSize / 2;
            const y = r * cellSize + cellSize / 2;
            spawnParticles(x, y, CELL_COLORS[ci], 4, { speedMult: 2, sizeMult: 1.3 });
            board[r][c] = 0;
          }
        }
        drawBoard();
        // Mini-shake per row
        if (r % 2 === 0) {
          app.classList.remove("shake");
          void app.offsetWidth;
          app.classList.add("shake");
        }
      }, r * 50);
      gameOverRowTimeouts.push(timeoutId);
    }

    // Big shake after all rows shatter
    gameOverShakeTimeoutId = setTimeout(() => {
      app.classList.remove("shake-big");
      void app.offsetWidth;
      app.classList.add("shake-big");
    }, GRID * 50 + 50);

    screenFlash("combo");

    // Compare against the best score from BEFORE this game started,
    // not the one addScore() already updated mid-game
    const isNewBest = score > bestScoreAtGameStart && score > 0;

    // Animate score count-up on game over (with tick sound on main score)
    animateCountUp(finalScoreEl, 0, score, 600, true);
    animateCountUp(finalBestEl, 0, bestScore, 600);
    animateCountUp(goLines, 0, gameStats.linesCleared, 400);
    animateCountUp(goCombos, 0, gameStats.combos, 400);
    animateCountUp(goPieces, 0, gameStats.piecesPlaced, 400);

    goLevelVal.textContent = playerLevel;

    if (isNewBest) {
      newBestBanner.classList.remove("hidden");
      newBestBanner.innerHTML = '&#128081; NEW BEST SCORE! &#128081;';
      // Golden modal treatment for new best
      const modal = goOverlay.querySelector(".game-over-modal");
      if (modal) modal.classList.add("new-best-modal");
      // Fireworks for new best!
      spawnConfetti(150);
      screenFlash("epic");
      sfxNewBest();
      if (navigator.vibrate) navigator.vibrate([80, 50, 80, 50, 80, 50, 120]);
    } else {
      newBestBanner.classList.add("hidden");
      const modal = goOverlay.querySelector(".game-over-modal");
      if (modal) modal.classList.remove("new-best-modal");
    }

    // Try to show interstitial ad between games
    const adShown = window.BlockDokuAds && window.BlockDokuAds.tryShowInterstitial();

    // Show game over after ad (or immediately if no ad)
    if (!adShown) {
      showGameOverOverlay(isNewBest);
    } else {
      // Delay game over modal until ad is dismissed
      gameOverAdPollId = setInterval(() => {
        const adOverlay = document.getElementById("ad-interstitial-overlay");
        if (adOverlay && adOverlay.classList.contains("hidden")) {
          clearInterval(gameOverAdPollId);
          gameOverAdPollId = null;
          showGameOverOverlay(isNewBest);
        }
      }, 200);
      // Safety timeout: show game over after 15 seconds regardless
      gameOverAdSafetyId = setTimeout(() => {
        if (gameOverAdPollId) {
          clearInterval(gameOverAdPollId);
          gameOverAdPollId = null;
        }
        gameOverAdSafetyId = null;
        showGameOverOverlay(isNewBest);
      }, 15000);
    }

    // Save to lifetime stats
    updateLifetimeStats();
  }

  function newGame() {
    stopGhostAnim();
    clearGameOverState();
    clearTransientFx();
    goOverlay.classList.add("hidden");
    const goModal = goOverlay.querySelector(".game-over-modal");
    if (goModal) goModal.classList.remove("new-best-modal");
    score = 0;
    displayScore = 0;
    comboCount = 0;
    gameActive = true;
    bestScoreAtGameStart = bestScore; // snapshot before game begins
    gameStats = { linesCleared: 0, combos: 0, piecesPlaced: 0 };
    lastMilestone = 0;
    hasPassedBestThisGame = false;
    twinkleCells = [];
    registerInteraction();
    if (gameOverFireworksId) {
      clearInterval(gameOverFireworksId);
      gameOverFireworksId = null;
    }
    if (scoreBoxEl) {
      scoreBoxEl.classList.remove("score-approaching-best", "score-is-best");
    }
    undoSnapshot = null;
    btnUndo.disabled = true;
    scoreEl.textContent = "0";
    scoreEl.classList.remove("score-warm-1", "score-warm-2", "score-warm-3", "score-warm-4");
    hideComboBadge();
    clearConfetti();
    clearHints();
    clearPieceEntranceAnimations();

    // Reset daily RNG for consistent puzzle
    if (gameMode === "daily") {
      const { seed } = getDailySeed();
      dailyRng = mulberry32(seed);
    }

    initBoard();
    dealPieces();
    drawBoard();
    startAmbientShimmer();
    if (gameMode === "classic") saveState();
  }

  // ============================================================
  // STATS
  // ============================================================
  function getLifetimeStats() {
    try {
      return JSON.parse(localStorage.getItem("blockdoku_lifetime") || "null") || {
        games: 0, bestScore: 0, totalScore: 0, totalPieces: 0, totalLines: 0, streak: 0, lastPlayDate: null,
      };
    } catch {
      return { games: 0, bestScore: 0, totalScore: 0, totalPieces: 0, totalLines: 0, streak: 0, lastPlayDate: null };
    }
  }

  function updateLifetimeStats() {
    const stats = getLifetimeStats();
    stats.games++;
    stats.totalScore += score;
    stats.totalPieces += gameStats.piecesPlaced;
    stats.totalLines += gameStats.linesCleared;
    if (score > stats.bestScore) stats.bestScore = score;

    // Streak tracking (use local date, not UTC, to avoid midnight timezone bugs)
    const d = new Date();
    const today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    if (stats.lastPlayDate) {
      const last = new Date(stats.lastPlayDate);
      const now = new Date(today);
      const diff = Math.floor((now - last) / (1000 * 60 * 60 * 24));
      if (diff === 1) {
        stats.streak++;
      } else if (diff > 1) {
        stats.streak = 1;
      }
    } else {
      stats.streak = 1;
    }
    stats.lastPlayDate = today;

    localStorage.setItem("blockdoku_lifetime", JSON.stringify(stats));
  }

  function showStats() {
    const stats = getLifetimeStats();
    document.getElementById("stat-games").textContent = stats.games;
    document.getElementById("stat-best").textContent = stats.bestScore;
    document.getElementById("stat-avg").textContent = stats.games > 0 ? Math.round(stats.totalScore / stats.games) : 0;
    document.getElementById("stat-pieces").textContent = stats.totalPieces;
    document.getElementById("stat-lines").textContent = stats.totalLines;
    document.getElementById("stat-streak").textContent = stats.streak;
    statsOverlay.classList.remove("hidden");
  }

  // ============================================================
  // SAVE / LOAD
  // ============================================================
  function saveState() {
    const state = { board, score, pieces, gameStats, comboCount };
    localStorage.setItem("blockdoku_state", JSON.stringify(state));
  }

  function loadBestScore() {
    bestScore = parseInt(localStorage.getItem("blockdoku_best") || "0");
    bestScoreAtGameStart = bestScore;
    bestEl.textContent = bestScore;
  }

  function loadState() {
    loadBestScore();

    const saved = localStorage.getItem("blockdoku_state");
    if (saved) {
      try {
        const s = JSON.parse(saved);
        board = s.board;
        score = s.score;
        pieces = s.pieces;
        gameStats = s.gameStats || { linesCleared: 0, combos: 0, piecesPlaced: 0 };
        comboCount = s.comboCount || 0;
        scoreEl.textContent = score;
        displayScore = score;
        drawBoard();
        renderPieces();
        if (!anyMovePossible()) {
          scheduleGameOver(300);
        }
        return true;
      } catch {}
    }
    return false;
  }

  // Auto-save (classic mode only)
  setInterval(() => {
    if (score > 0 && gameActive && gameMode === "classic") saveState();
  }, 5000);

  // ============================================================
  // THEME & SOUND
  // ============================================================
  function setTheme(dark) {
    darkMode = dark;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? "#0a0a1a" : "#f0f2f8");
    localStorage.setItem("blockdoku_theme", dark ? "dark" : "light");
    refreshCachedStyles();
    drawBoard();
  }

  function toggleSound() {
    soundOn = !soundOn;
    document.getElementById("icon-sound-on").classList.toggle("hidden", !soundOn);
    document.getElementById("icon-sound-off").classList.toggle("hidden", soundOn);
    localStorage.setItem("blockdoku_sound", soundOn ? "on" : "off");
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  playAgainBtn.addEventListener("click", newGame);
  window.addEventListener("resize", () => {
    resize();
    resizeConfettiCanvas();
  });

  // Toolbar
  btnStats.addEventListener("click", showStats);
  btnHelp.addEventListener("click", () => helpOverlay.classList.remove("hidden"));
  btnTheme.addEventListener("click", () => setTheme(!darkMode));
  btnSound.addEventListener("click", toggleSound);
  btnUndo.addEventListener("click", performUndo);
  shareBtn.addEventListener("click", shareScore);
  btnNewgame.addEventListener("click", () => {
    if (score > 0 && gameActive) {
      newgameOverlay.classList.remove("hidden");
    } else {
      newGame();
    }
  });

  // Modal closes
  document.getElementById("stats-close").addEventListener("click", () => statsOverlay.classList.add("hidden"));
  document.getElementById("help-close").addEventListener("click", () => helpOverlay.classList.add("hidden"));
  document.getElementById("help-got-it").addEventListener("click", () => helpOverlay.classList.add("hidden"));
  document.getElementById("newgame-cancel").addEventListener("click", () => newgameOverlay.classList.add("hidden"));
  document.getElementById("newgame-confirm").addEventListener("click", () => {
    newgameOverlay.classList.add("hidden");
    newGame();
  });
  document.getElementById("stats-reset").addEventListener("click", () => {
    if (confirm("Reset all stats? This cannot be undone.")) {
      localStorage.removeItem("blockdoku_lifetime");
      localStorage.removeItem("blockdoku_best");
      bestScore = 0;
      bestScoreAtGameStart = 0;
      bestEl.textContent = "0";
      showStats();
    }
  });

  // Close modals on overlay click
  [statsOverlay, helpOverlay, newgameOverlay].forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.add("hidden");
    });
  });

  // Mode selector
  document.getElementById("mode-classic").addEventListener("click", () => switchMode("classic"));
  document.getElementById("mode-daily").addEventListener("click", () => switchMode("daily"));

  // ============================================================
  // INIT
  // ============================================================
  initBoard();
  loadBestScore();

  // IMPORTANT: resize first so cellSize/boardPx are valid before any drawing
  refreshCachedStyles();
  resize();

  // Load preferences (setTheme calls drawBoard which needs valid cellSize)
  const savedTheme = localStorage.getItem("blockdoku_theme");
  setTheme(savedTheme ? savedTheme === "dark" : true);

  const savedSound = localStorage.getItem("blockdoku_sound");
  if (savedSound) {
    soundOn = savedSound === "on";
    document.getElementById("icon-sound-on").classList.toggle("hidden", !soundOn);
    document.getElementById("icon-sound-off").classList.toggle("hidden", soundOn);
  }

  // Show help on first visit
  if (!localStorage.getItem("blockdoku_played")) {
    helpOverlay.classList.remove("hidden");
    localStorage.setItem("blockdoku_played", "1");
  }

  // Load level data
  loadLevel();

  // Restore mode preference
  const savedMode = localStorage.getItem("blockdoku_mode");
  if (savedMode === "daily") {
    switchMode("daily");
  } else {
    // Classic mode: load saved game or deal fresh pieces
    if (!loadState()) {
      dealPieces();
    }
    displayScore = score; // sync animated counter
  }

  // Second resize to pick up any layout shifts from theme/loadState
  resize();
  initialized = true;

  // Initialize ads (no-op if no publisher ID configured)
  if (window.BlockDokuAds) {
    window.BlockDokuAds.init();
  }

  // Particle animation loop starts on-demand via ensureAnimRunning()
  // Start ambient shimmer for that alive board feel
  registerInteraction();
  startAmbientShimmer();
  prefersReducedMotion.addEventListener("change", () => {
    if (prefersReducedMotion.matches) {
      stopAmbientShimmer();
      drawBoard();
    } else if (gameActive && !document.hidden) {
      startAmbientShimmer();
    }
  });
})();
