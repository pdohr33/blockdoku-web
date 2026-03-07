// ============================================================
// BlockDoku - Browser Edition (Complete Overhaul)
// ============================================================

(() => {
  "use strict";

  // --- Constants ---
  const GRID = 9;
  const BOX = 3;
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

  // Per-game stats
  let gameStats = { linesCleared: 0, combos: 0, piecesPlaced: 0 };

  // --- DOM Elements ---
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const fxCanvas = document.getElementById("fx-layer");
  const fxCtx = fxCanvas.getContext("2d");
  const tray = document.getElementById("pieces-tray");
  const scoreEl = document.getElementById("score");
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
    playTone(600, 0.07, "sine", 0.05);
    playTone(900, 0.05, "sine", 0.03);
  }

  function sfxClear(count) {
    const baseFreq = 500 + count * 100;
    playTone(baseFreq, 0.12, "sine", 0.06);
    setTimeout(() => playTone(baseFreq + 200, 0.12, "sine", 0.06), 60);
    if (count > 1) {
      setTimeout(() => playTone(baseFreq + 400, 0.15, "sine", 0.06), 120);
    }
  }

  function sfxCombo(count) {
    const baseFreq = 600 + count * 150;
    for (let i = 0; i < Math.min(count, 4); i++) {
      setTimeout(() => playTone(baseFreq + i * 100, 0.1, "sine", 0.05), i * 60);
    }
  }

  function sfxGameOver() {
    playTone(300, 0.3, "sawtooth", 0.04);
    setTimeout(() => playTone(200, 0.4, "sawtooth", 0.04), 150);
    setTimeout(() => playTone(150, 0.5, "sawtooth", 0.03), 300);
  }

  // ============================================================
  // PARTICLE SYSTEM
  // ============================================================
  let particles = [];

  function spawnParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 1.5 + Math.random() * 3;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.015 + Math.random() * 0.02,
        size: 2 + Math.random() * 3,
        color,
      });
    }
    ensureAnimRunning();
  }

  function spawnClearParticles(cellIndices) {
    for (const idx of cellIndices) {
      const r = Math.floor(idx / GRID);
      const c = idx % GRID;
      const x = c * cellSize + cellSize / 2;
      const y = r * cellSize + cellSize / 2;
      const colorIdx = board[r][c];
      const color = colorIdx > 0 ? CELL_COLORS[(colorIdx - 1) % CELL_COLORS.length] : "#6c8cff";
      spawnParticles(x, y, color, 5);
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    for (const p of particles) {
      fxCtx.globalAlpha = p.life;
      fxCtx.fillStyle = p.color;
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      fxCtx.fill();
    }
    fxCtx.globalAlpha = 1;
  }

  // Animation loop for particles - only runs when particles exist (battery friendly)
  let animFrameId = null;
  let animRunning = false;

  function animLoop() {
    if (particles.length > 0) {
      updateParticles();
      drawParticles();
      animFrameId = requestAnimationFrame(animLoop);
    } else {
      // No particles left, stop the loop to save battery
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
    const appPad = 16 + 8; // padding + gaps
    const trayMinH = 80;
    const vh = window.innerHeight || document.documentElement.clientHeight || 700;
    const vw = window.innerWidth || document.documentElement.clientWidth || 375;

    const availH = vh - headerH - toolbarH - storeBannerH - adBannerH - appPad - trayMinH - 20;
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
    }

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(totalClears > 1 ? [30, 20, 30] : [20]);
    }

    return pts;
  }

  function animateClearStaggered(cells) {
    // Flash and board glow
    const wrapper = document.getElementById("board-wrapper");
    wrapper.classList.remove("board-glow");
    void wrapper.offsetWidth;
    wrapper.classList.add("board-glow");

    if (cells.length > 12) {
      // Big clear: screen shake
      const app = document.getElementById("app");
      app.classList.remove("shake");
      void app.offsetWidth;
      app.classList.add("shake");
    }
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

  function drawBoard() {
    const { gridBg, gridLine, cellEmpty } = cachedStyles;

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

          // Main fill
          ctx.fillStyle = color;
          ctx.beginPath();
          roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
          ctx.fill();

          // Top shine (gradient)
          const shineGrad = ctx.createLinearGradient(x, y + pad, x, y + cellSize * 0.5);
          shineGrad.addColorStop(0, "rgba(255,255,255,0.2)");
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
        } else {
          ctx.fillStyle = cellEmpty;
          ctx.beginPath();
          roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
          ctx.fill();
        }
      }
    }

    // 3x3 box outlines
    ctx.strokeStyle = gridLine;
    ctx.lineWidth = 2;
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        ctx.beginPath();
        roundRect(ctx, bc * cellSize * 3 + 0.5, br * cellSize * 3 + 0.5, cellSize * 3, cellSize * 3, 6);
        ctx.stroke();
      }
    }
  }

  function drawGhost(piece, row, col, valid) {
    drawBoard(); // clears canvas and redraws board

    // Save and restore context state to prevent alpha/style leaks
    ctx.save();
    try {
      if (valid) {
        const ci = (piece.colorIdx - 1) % CELL_COLORS.length;
        const color = CELL_COLORS[ci];
        for (const [dr, dc] of piece.cells) {
          const r = row + dr, c = col + dc;
          if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
          const x = c * cellSize, y = r * cellSize;

          // Ghost fill
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          roundRect(ctx, x + 2, y + 2, cellSize - 4, cellSize - 4, 4);
          ctx.fill();

          // Ghost border
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          roundRect(ctx, x + 2, y + 2, cellSize - 4, cellSize - 4, 4);
          ctx.stroke();
        }
      } else {
        const hoverColor = cachedStyles.hoverInvalid;
        for (const [dr, dc] of piece.cells) {
          const r = row + dr, c = col + dc;
          if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
          const x = c * cellSize, y = r * cellSize;
          ctx.fillStyle = hoverColor;
          ctx.beginPath();
          roundRect(ctx, x + 2, y + 2, cellSize - 4, cellSize - 4, 4);
          ctx.fill();
        }
      }
    } finally {
      ctx.restore(); // always restores globalAlpha, fillStyle, etc.
    }
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
    const def = PIECE_DEFS[Math.floor(Math.random() * PIECE_DEFS.length)];
    const colorIdx = Math.floor(Math.random() * CELL_COLORS.length) + 1;
    return { cells: def, colorIdx };
  }

  function dealPieces() {
    pieces = [randomPiece(), randomPiece(), randomPiece()];
    renderPieces();
  }

  function renderPieces() {
    const slots = tray.querySelectorAll(".piece-slot");
    slots.forEach((slot, idx) => {
      slot.innerHTML = "";
      const piece = pieces[idx];

      if (piece) {
        slot.classList.remove("used");
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

  function startDrag(idx, clientX, clientY) {
    if (!pieces[idx] || !gameActive) return;
    dragPiece = pieces[idx];
    dragIdx = idx;

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
    // Offset ghost above finger by 2 cells so piece is visible while dragging
    const dragLift = cellSize * 2;
    ghostEl.style.left = (clientX - ghostEl.offsetWidth / 2) + "px";
    ghostEl.style.top = (clientY - ghostEl.offsetHeight - dragLift) + "px";

    const rect = canvas.getBoundingClientRect();
    const bx = clientX - rect.left;
    const by = clientY - rect.top - dragLift;

    const col = Math.round(bx / cellSize - dragOffsetC);
    const row = Math.round(by / cellSize - dragOffsetR);

    // Only redraw if ghost position changed
    if (row !== lastGhostRow || col !== lastGhostCol) {
      lastGhostRow = row;
      lastGhostCol = col;
      if (row >= -2 && row < GRID + 2 && col >= -2 && col < GRID + 2) {
        const valid = canPlace(dragPiece, row, col);
        drawGhost(dragPiece, row, col, valid);
      } else {
        drawBoard();
      }
    }
  }

  function endDrag(clientX, clientY) {
    if (!dragPiece) return;

    const dragLift = cellSize * 2;
    const rect = canvas.getBoundingClientRect();
    const bx = clientX - rect.left;
    const by = clientY - rect.top - dragLift;

    const col = Math.round(bx / cellSize - dragOffsetC);
    const row = Math.round(by / cellSize - dragOffsetR);

    if (canPlace(dragPiece, row, col)) {
      placePiece(dragPiece, row, col);
      sfxPlace();
      gameStats.piecesPlaced++;

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
        dealPieces();
      }

      // Check game over
      if (!anyMovePossible()) {
        gameActive = false;
        setTimeout(gameOver, 500);
      }

      saveState();
    }

    // Cleanup
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
  });

  // ============================================================
  // SCORING & UI
  // ============================================================
  function addScore(pts) {
    score += pts;
    scoreEl.textContent = score;
    scoreEl.classList.remove("score-pop");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("score-pop");

    if (score > bestScore) {
      bestScore = score;
      bestEl.textContent = bestScore;
      localStorage.setItem("blockdoku_best", bestScore);
    }
  }

  function showFloatScore(pts, x, y, big) {
    const el = document.createElement("div");
    el.className = "float-score" + (big ? " big" : "");
    el.textContent = "+" + pts;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function showComboBadge(count) {
    comboText.textContent = "x" + count;
    comboBadge.classList.remove("hidden");
    comboBadge.style.animation = "none";
    void comboBadge.offsetWidth;
    comboBadge.style.animation = "";
  }

  function hideComboBadge() {
    comboBadge.classList.add("hidden");
  }

  // ============================================================
  // GAME FLOW
  // ============================================================
  function gameOver() {
    sfxGameOver();
    // Compare against the best score from BEFORE this game started,
    // not the one addScore() already updated mid-game
    const isNewBest = score > bestScoreAtGameStart && score > 0;

    finalScoreEl.textContent = score;
    finalBestEl.textContent = bestScore;
    goLines.textContent = gameStats.linesCleared;
    goCombos.textContent = gameStats.combos;
    goPieces.textContent = gameStats.piecesPlaced;

    if (isNewBest) {
      newBestBanner.classList.remove("hidden");
    } else {
      newBestBanner.classList.add("hidden");
    }

    // Try to show interstitial ad between games
    const adShown = window.BlockDokuAds && window.BlockDokuAds.tryShowInterstitial();

    // Show game over after ad (or immediately if no ad)
    if (!adShown) {
      goOverlay.classList.remove("hidden");
    } else {
      // Delay game over modal until ad is dismissed
      const checkAdClosed = setInterval(() => {
        const adOverlay = document.getElementById("ad-interstitial-overlay");
        if (adOverlay && adOverlay.classList.contains("hidden")) {
          clearInterval(checkAdClosed);
          goOverlay.classList.remove("hidden");
        }
      }, 200);
      // Safety timeout: show game over after 15 seconds regardless
      setTimeout(() => {
        clearInterval(checkAdClosed);
        goOverlay.classList.remove("hidden");
      }, 15000);
    }

    // Save to lifetime stats
    updateLifetimeStats();
  }

  function newGame() {
    goOverlay.classList.add("hidden");
    score = 0;
    comboCount = 0;
    gameActive = true;
    bestScoreAtGameStart = bestScore; // snapshot before game begins
    gameStats = { linesCleared: 0, combos: 0, piecesPlaced: 0 };
    scoreEl.textContent = "0";
    hideComboBadge();
    initBoard();
    dealPieces();
    drawBoard();
    saveState();
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

    // Streak tracking
    const today = new Date().toISOString().slice(0, 10);
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

  function loadState() {
    bestScore = parseInt(localStorage.getItem("blockdoku_best") || "0");
    bestScoreAtGameStart = bestScore;
    bestEl.textContent = bestScore;

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
        drawBoard();
        renderPieces();
        if (!anyMovePossible()) {
          gameActive = false;
          setTimeout(gameOver, 300);
        }
        return true;
      } catch {}
    }
    return false;
  }

  // Auto-save
  setInterval(() => {
    if (score > 0 && gameActive) saveState();
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
  window.addEventListener("resize", resize);

  // Toolbar
  btnStats.addEventListener("click", showStats);
  btnHelp.addEventListener("click", () => helpOverlay.classList.remove("hidden"));
  btnTheme.addEventListener("click", () => setTheme(!darkMode));
  btnSound.addEventListener("click", toggleSound);
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

  // ============================================================
  // INIT
  // ============================================================
  initBoard();

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

  // Load saved game or deal fresh pieces, then ensure layout is correct
  if (!loadState()) {
    dealPieces();
  }
  // Second resize to pick up any layout shifts from theme/loadState
  resize();
  initialized = true;

  // Initialize ads (no-op if no publisher ID configured)
  if (window.BlockDokuAds) {
    window.BlockDokuAds.init();
  }

  // Particle animation loop starts on-demand via ensureAnimRunning()
  // No need to run at startup when there are no particles
})();
