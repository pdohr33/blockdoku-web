// ============================================================
// BlockDoku - Browser Edition
// ============================================================

(() => {
  "use strict";

  // --- Constants ---
  const GRID = 9;
  const BOX = 3;
  const CELL_COLORS = [
    "#f72585", "#7209b7", "#3a0ca3", "#4361ee",
    "#4cc9f0", "#06d6a0", "#ffd166", "#ef476f",
  ];

  // --- Piece Definitions (relative cells) ---
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
    [[0,0],[1,0],[0,1]],
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

  // --- State ---
  let board = [];       // 9x9 grid: 0 = empty, colorIndex otherwise
  let score = 0;
  let bestScore = 0;
  let pieces = [null, null, null];   // current 3 piece slots
  let soundOn = true;
  let darkMode = true;

  // --- DOM ---
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const tray = document.getElementById("pieces-tray");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best-score");
  const overlay = document.getElementById("game-over-overlay");
  const finalScoreEl = document.getElementById("final-score");
  const finalBestEl = document.getElementById("final-best");
  const playAgainBtn = document.getElementById("play-again-btn");
  const themeBtn = document.getElementById("theme-toggle");
  const soundBtn = document.getElementById("sound-toggle");

  // --- Audio (simple oscillator beeps) ---
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function playTone(freq, duration, type = "square") {
    if (!soundOn) return;
    try {
      const ac = getAudioCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.connect(gain).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + duration);
    } catch {}
  }
  function sfxPlace() { playTone(520, 0.08, "sine"); }
  function sfxClear() { playTone(780, 0.15, "sine"); setTimeout(() => playTone(1040, 0.15, "sine"), 80); }
  function sfxGameOver() { playTone(220, 0.3, "sawtooth"); setTimeout(() => playTone(160, 0.4, "sawtooth"), 200); }

  // --- Sizing ---
  let cellSize, boardPx, boardX, boardY;

  function resize() {
    const maxW = Math.min(window.innerWidth - 24, 500);
    const maxH = window.innerHeight * 0.52;
    boardPx = Math.min(maxW, maxH);
    boardPx = Math.floor(boardPx / GRID) * GRID; // snap to grid
    cellSize = boardPx / GRID;
    canvas.width = boardPx;
    canvas.height = boardPx;
    canvas.style.width = boardPx + "px";
    canvas.style.height = boardPx + "px";
    drawBoard();
    renderPieces();
  }

  // --- Board Logic ---
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

    // Rows
    for (let r = 0; r < GRID; r++) {
      if (board[r].every(c => c !== 0)) rowsToClear.push(r);
    }
    // Cols
    for (let c = 0; c < GRID; c++) {
      let full = true;
      for (let r = 0; r < GRID; r++) { if (board[r][c] === 0) { full = false; break; } }
      if (full) colsToClear.push(c);
    }
    // 3x3 Boxes
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
    if (totalClears === 0) return 0;

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

    // Flash animation
    animateClear([...clearSet]);

    // Clear cells
    for (const idx of clearSet) {
      const r = Math.floor(idx / GRID);
      const c = idx % GRID;
      board[r][c] = 0;
    }

    // Scoring: 9 per line/box, bonus for combos
    let pts = clearSet.size;
    if (totalClears > 1) {
      pts += totalClears * 10; // combo bonus
    }

    return pts;
  }

  function animateClear(cells) {
    // Quick white flash on cleared cells
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--clear-flash").trim() || "rgba(255,255,255,0.8)";
    for (const idx of cells) {
      const r = Math.floor(idx / GRID);
      const c = idx % GRID;
      const x = c * cellSize;
      const y = r * cellSize;
      ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
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

  // --- Drawing ---
  function drawBoard() {
    const style = getComputedStyle(document.documentElement);
    const gridBg = style.getPropertyValue("--grid-bg").trim();
    const gridLine = style.getPropertyValue("--grid-line").trim();
    const cellEmpty = style.getPropertyValue("--cell-empty").trim();

    // Background
    ctx.fillStyle = gridBg;
    ctx.beginPath();
    roundRect(ctx, 0, 0, boardPx, boardPx, 12);
    ctx.fill();

    // Cells
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const x = c * cellSize;
        const y = r * cellSize;
        const pad = 1.5;

        if (board[r][c] !== 0) {
          const color = CELL_COLORS[(board[r][c] - 1) % CELL_COLORS.length];
          ctx.fillStyle = color;
          ctx.beginPath();
          roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, 4);
          ctx.fill();

          // Shine
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.beginPath();
          roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, (cellSize - pad * 2) * 0.4, 4);
          ctx.fill();
        } else {
          ctx.fillStyle = cellEmpty;
          ctx.beginPath();
          roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, 4);
          ctx.fill();
        }
      }
    }

    // 3x3 box outlines
    ctx.strokeStyle = gridLine;
    ctx.lineWidth = 2;
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        ctx.strokeRect(bc * cellSize * 3 + 0.5, br * cellSize * 3 + 0.5, cellSize * 3, cellSize * 3);
      }
    }
  }

  function drawGhost(piece, row, col, valid) {
    drawBoard(); // redraw base
    const style = getComputedStyle(document.documentElement);
    const hoverColor = valid
      ? (style.getPropertyValue("--cell-hover-valid").trim())
      : (style.getPropertyValue("--cell-hover-invalid").trim());

    if (valid) {
      const color = CELL_COLORS[(piece.colorIdx - 1) % CELL_COLORS.length];
      for (const [dr, dc] of piece.cells) {
        const r = row + dr, c = col + dc;
        if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
        const x = c * cellSize, y = r * cellSize;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        roundRect(ctx, x + 1.5, y + 1.5, cellSize - 3, cellSize - 3, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      for (const [dr, dc] of piece.cells) {
        const r = row + dr, c = col + dc;
        if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
        const x = c * cellSize, y = r * cellSize;
        ctx.fillStyle = hoverColor;
        ctx.beginPath();
        roundRect(ctx, x + 1.5, y + 1.5, cellSize - 3, cellSize - 3, 4);
        ctx.fill();
      }
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

  // --- Piece Generation ---
  function randomPiece() {
    const def = PIECE_DEFS[Math.floor(Math.random() * PIECE_DEFS.length)];
    const colorIdx = Math.floor(Math.random() * CELL_COLORS.length) + 1;
    return { cells: def, colorIdx };
  }

  function dealPieces() {
    pieces = [randomPiece(), randomPiece(), randomPiece()];
    renderPieces();
  }

  // --- Piece Rendering in Tray ---
  function renderPieces() {
    tray.innerHTML = "";
    pieces.forEach((piece, idx) => {
      const slot = document.createElement("div");
      slot.className = "piece-slot" + (piece ? "" : " used");
      slot.dataset.idx = idx;

      if (piece) {
        const pCanvas = document.createElement("canvas");
        const pCtx = pCanvas.getContext("2d");

        // Calculate bounds
        let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
        for (const [dr, dc] of piece.cells) {
          minR = Math.min(minR, dr); maxR = Math.max(maxR, dr);
          minC = Math.min(minC, dc); maxC = Math.max(maxC, dc);
        }
        const rows = maxR - minR + 1;
        const cols = maxC - minC + 1;
        const pCellSize = Math.min(28, (window.innerWidth - 80) / 15);
        pCanvas.width = cols * pCellSize;
        pCanvas.height = rows * pCellSize;

        const color = CELL_COLORS[(piece.colorIdx - 1) % CELL_COLORS.length];
        for (const [dr, dc] of piece.cells) {
          const x = (dc - minC) * pCellSize;
          const y = (dr - minR) * pCellSize;
          pCtx.fillStyle = color;
          pCtx.beginPath();
          roundRect(pCtx, x + 1, y + 1, pCellSize - 2, pCellSize - 2, 3);
          pCtx.fill();
          pCtx.fillStyle = "rgba(255,255,255,0.18)";
          pCtx.beginPath();
          roundRect(pCtx, x + 1, y + 1, pCellSize - 2, (pCellSize - 2) * 0.4, 3);
          pCtx.fill();
        }

        slot.appendChild(pCanvas);
      }

      tray.appendChild(slot);
    });
  }

  // --- Drag & Drop ---
  let dragPiece = null;
  let dragIdx = -1;
  let dragOffsetR = 0;
  let dragOffsetC = 0;
  let ghostEl = null;

  function startDrag(idx, clientX, clientY) {
    if (!pieces[idx]) return;
    dragPiece = pieces[idx];
    dragIdx = idx;

    // Calculate piece center offset
    let sumR = 0, sumC = 0;
    for (const [dr, dc] of dragPiece.cells) { sumR += dr; sumC += dc; }
    dragOffsetR = sumR / dragPiece.cells.length;
    dragOffsetC = sumC / dragPiece.cells.length;

    // Create floating ghost
    const slot = tray.children[idx];
    slot.classList.add("dragging");

    ghostEl = document.createElement("div");
    ghostEl.style.position = "fixed";
    ghostEl.style.pointerEvents = "none";
    ghostEl.style.zIndex = "200";
    ghostEl.style.opacity = "0.85";

    const pc = slot.querySelector("canvas");
    if (pc) {
      const clone = pc.cloneNode(true);
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
    ghostEl.style.left = (clientX - ghostEl.offsetWidth / 2) + "px";
    ghostEl.style.top = (clientY - ghostEl.offsetHeight - 40) + "px";

    // Calculate board position
    const rect = canvas.getBoundingClientRect();
    const bx = clientX - rect.left;
    const by = clientY - rect.top - cellSize * 2; // offset up so you can see

    const col = Math.round(bx / cellSize - dragOffsetC);
    const row = Math.round(by / cellSize - dragOffsetR);

    if (row >= -1 && row < GRID + 1 && col >= -1 && col < GRID + 1) {
      const valid = canPlace(dragPiece, row, col);
      drawGhost(dragPiece, row, col, valid);
    } else {
      drawBoard();
    }
  }

  function endDrag(clientX, clientY) {
    if (!dragPiece) return;

    const rect = canvas.getBoundingClientRect();
    const bx = clientX - rect.left;
    const by = clientY - rect.top - cellSize * 2;

    const col = Math.round(bx / cellSize - dragOffsetC);
    const row = Math.round(by / cellSize - dragOffsetR);

    if (canPlace(dragPiece, row, col)) {
      placePiece(dragPiece, row, col);
      sfxPlace();

      // Score for placing
      const placePts = dragPiece.cells.length;
      addScore(placePts);

      // Check clears
      const clearPts = checkClears();
      if (clearPts > 0) {
        sfxClear();
        addScore(clearPts);
        showFloatScore(clearPts, clientX, clientY - 60);
      }

      pieces[dragIdx] = null;
      renderPieces();

      // Deal new pieces if all used
      if (pieces.every(p => p === null)) {
        dealPieces();
      }

      // Check game over
      if (!anyMovePossible()) {
        setTimeout(gameOver, 400);
      }
    }

    // Cleanup
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
    const slot = tray.children[dragIdx];
    if (slot) slot.classList.remove("dragging");
    dragPiece = null;
    dragIdx = -1;
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
      const t = e.changedTouches[0];
      endDrag(t.clientX, t.clientY);
    }
  });

  // --- Scoring ---
  function addScore(pts) {
    score += pts;
    scoreEl.textContent = score;
    scoreEl.classList.remove("score-pop");
    void scoreEl.offsetWidth; // reflow
    scoreEl.classList.add("score-pop");

    if (score > bestScore) {
      bestScore = score;
      bestEl.textContent = bestScore;
      localStorage.setItem("blockdoku_best", bestScore);
    }
  }

  function showFloatScore(pts, x, y) {
    const el = document.createElement("div");
    el.className = "float-score";
    el.textContent = "+" + pts;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  // --- Game Over ---
  function gameOver() {
    sfxGameOver();
    finalScoreEl.textContent = score;
    finalBestEl.textContent = bestScore;
    overlay.classList.remove("hidden");
  }

  // --- New Game ---
  function newGame() {
    overlay.classList.add("hidden");
    score = 0;
    scoreEl.textContent = "0";
    initBoard();
    dealPieces();
    drawBoard();
    saveState();
  }

  // --- Save / Load ---
  function saveState() {
    const state = { board, score, pieces };
    localStorage.setItem("blockdoku_state", JSON.stringify(state));
  }

  function loadState() {
    bestScore = parseInt(localStorage.getItem("blockdoku_best") || "0");
    bestEl.textContent = bestScore;

    const saved = localStorage.getItem("blockdoku_state");
    if (saved) {
      try {
        const s = JSON.parse(saved);
        board = s.board;
        score = s.score;
        pieces = s.pieces;
        scoreEl.textContent = score;
        drawBoard();
        renderPieces();
        if (!anyMovePossible()) {
          setTimeout(gameOver, 300);
        }
        return true;
      } catch {}
    }
    return false;
  }

  // Auto-save periodically
  setInterval(() => {
    if (score > 0) saveState();
  }, 5000);

  // --- Theme ---
  function setTheme(dark) {
    darkMode = dark;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    themeBtn.textContent = dark ? "🌙" : "☀️";
    localStorage.setItem("blockdoku_theme", dark ? "dark" : "light");
    drawBoard();
  }

  themeBtn.addEventListener("click", () => setTheme(!darkMode));

  // --- Sound ---
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
    localStorage.setItem("blockdoku_sound", soundOn ? "on" : "off");
  });

  // --- Init ---
  playAgainBtn.addEventListener("click", newGame);
  window.addEventListener("resize", resize);

  // Init board early so setTheme -> drawBoard doesn't crash on empty array
  initBoard();

  // Load preferences
  const savedTheme = localStorage.getItem("blockdoku_theme");
  setTheme(savedTheme ? savedTheme === "dark" : true);

  const savedSound = localStorage.getItem("blockdoku_sound");
  if (savedSound) {
    soundOn = savedSound === "on";
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
  }

  // Start — loadState overwrites board if saved data exists
  if (!loadState()) {
    dealPieces();
  }
  resize();
})();
