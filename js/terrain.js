(() => {
  const T = () => window.LIFE_TYPES;

  function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function dishCells(world) {
    const cells = [];
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        if (world.inDish(x, y) && world.get(x, y) === T().EMPTY) cells.push({ x, y });
      }
    }
    return cells;
  }

  function isProtectedCenter(world, x, y, protectCenter) {
    if (!protectCenter || !world.dish) return false;
    const { cx, cy } = world.dish;
    return Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2;
  }

  function pickCell(cells, rng, world, protectCenter) {
    if (!cells.length) return null;
    for (let i = 0; i < 24; i++) {
      const c = cells[Math.floor(rng() * cells.length)];
      if (!isProtectedCenter(world, c.x, c.y, protectCenter)) return c;
    }
    return cells[Math.floor(rng() * cells.length)];
  }

  function removeCell(cells, x, y) {
    const i = cells.findIndex((c) => c.x === x && c.y === y);
    if (i >= 0) cells.splice(i, 1);
  }

  function carveRiver(world, cells, budget, rng, protectCenter) {
    if (budget <= 0 || !cells.length) return 0;
    const edges = cells.filter((c) => {
      if (isProtectedCenter(world, c.x, c.y, protectCenter)) return false;
      const d = world.dish;
      return Math.abs(c.x - d.cx) === d.half || Math.abs(c.y - d.cy) === d.half;
    });
    if (edges.length < 2) return 0;

    const start = edges[Math.floor(rng() * edges.length)];
    let end = edges[Math.floor(rng() * edges.length)];
    for (let i = 0; i < 8 && (end.x === start.x && end.y === start.y); i++) {
      end = edges[Math.floor(rng() * edges.length)];
    }

    let x = start.x;
    let y = start.y;
    let placed = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const maxSteps = Math.max(budget * 4, 24);

    for (let step = 0; step < maxSteps && placed < budget; step++) {
      if (world.inDish(x, y) && world.get(x, y) === T().EMPTY
        && !isProtectedCenter(world, x, y, protectCenter)) {
        world.set(x, y, T().WATER);
        removeCell(cells, x, y);
        placed++;
        if (rng() < 0.22 && placed < budget) {
          const [dx, dy] = dirs[Math.floor(rng() * dirs.length)];
          const wx = x + dx;
          const wy = y + dy;
          if (world.inDish(wx, wy) && world.get(wx, wy) === T().EMPTY
            && !isProtectedCenter(world, wx, wy, protectCenter)) {
            world.set(wx, wy, T().WATER);
            removeCell(cells, wx, wy);
            placed++;
          }
        }
      }

      const dx = Math.sign(end.x - x);
      const dy = Math.sign(end.y - y);
      const options = [];
      if (dx) options.push([dx, 0]);
      if (dy) options.push([0, dy]);
      shuffle(dirs, rng).forEach((d) => options.push(d));
      const move = options[Math.floor(rng() * options.length)];
      const nx = x + move[0];
      const ny = y + move[1];
      if (world.inDish(nx, ny)) {
        x = nx;
        y = ny;
      }
    }
    return placed;
  }

  function growLake(world, cells, budget, rng, protectCenter) {
    if (budget <= 0 || !cells.length) return 0;
    const seed = pickCell(cells, rng, world, protectCenter);
    if (!seed) return 0;

    const queue = [seed];
    let placed = 0;
    const allDirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

    while (queue.length && placed < budget) {
      const c = queue.shift();
      if (!world.inDish(c.x, c.y) || world.get(c.x, c.y) !== T().EMPTY) continue;
      if (isProtectedCenter(world, c.x, c.y, protectCenter)) continue;

      world.set(c.x, c.y, T().WATER);
      removeCell(cells, c.x, c.y);
      placed++;

      for (const [dx, dy] of shuffle(allDirs.slice(), rng)) {
        if (rng() > 0.58) continue;
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (!world.inDish(nx, ny)) continue;
        if (world.get(nx, ny) !== T().EMPTY) continue;
        if (isProtectedCenter(world, nx, ny, protectCenter)) continue;
        queue.push({ x: nx, y: ny });
      }
    }
    return placed;
  }

  function scatterStones(world, cells, budget, rng, protectCenter) {
    let placed = 0;
    while (placed < budget && cells.length) {
      const seed = pickCell(cells, rng, world, protectCenter);
      if (!seed) break;
      const cluster = 1 + Math.floor(rng() * 3);
      const queue = [seed];
      let clusterPlaced = 0;

      while (queue.length && clusterPlaced < cluster && placed < budget) {
        const c = queue.shift();
        if (!world.inDish(c.x, c.y) || world.get(c.x, c.y) !== T().EMPTY) continue;
        if (isProtectedCenter(world, c.x, c.y, protectCenter)) continue;

        world.set(c.x, c.y, T().WALL);
        removeCell(cells, c.x, c.y);
        placed++;
        clusterPlaced++;

        for (const [dx, dy] of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], rng)) {
          if (rng() > 0.45) continue;
          queue.push({ x: c.x + dx, y: c.y + dy });
        }
      }
    }
    return placed;
  }

  function scatterArcadeTerrain(world, opts = {}) {
    const rng = opts.rng || Math.random;
    const waterMax = opts.waterMax ?? 0.10;
    const wallMax = opts.wallMax ?? 0.05;
    const protectCenter = opts.protectCenter !== false;

    const cells = dishCells(world);
    const total = cells.length;
    if (!total) return { water: 0, walls: 0, waterFrac: 0, wallFrac: 0 };

    const waterFrac = rng() * waterMax;
    const wallFrac = rng() * wallMax;
    let waterTarget = Math.floor(total * waterFrac);
    let wallTarget = Math.floor(total * wallFrac);

    let waterPlaced = 0;
    if (waterTarget > 0) {
      const riverBudget = waterTarget >= 14
        ? Math.floor(waterTarget * (0.28 + rng() * 0.32))
        : (waterTarget >= 6 ? Math.floor(waterTarget * 0.35) : 0);
      const rivers = waterTarget >= 20 ? (rng() < 0.55 ? 2 : 1) : 1;
      const perRiver = Math.ceil(riverBudget / rivers);
      for (let r = 0; r < rivers && waterPlaced < waterTarget; r++) {
        waterPlaced += carveRiver(world, cells, Math.min(perRiver, waterTarget - waterPlaced), rng, protectCenter);
      }
      const lakes = 1 + Math.floor(rng() * 3);
      while (waterPlaced < waterTarget && cells.length) {
        const before = waterPlaced;
        waterPlaced += growLake(
          world,
          cells,
          Math.ceil((waterTarget - waterPlaced) / lakes),
          rng,
          protectCenter
        );
        if (waterPlaced === before) break;
      }
    }

    const wallsPlaced = scatterStones(world, cells, wallTarget, rng, protectCenter);
    return {
      water: waterPlaced,
      walls: wallsPlaced,
      waterFrac: waterPlaced / total,
      wallFrac: wallsPlaced / total
    };
  }

  function waterNeighborMask(world, x, y) {
    const water = T().WATER;
    const isW = (cx, cy) => world.inside(cx, cy) && world.get(cx, cy) === water;
    return {
      n: isW(x, y - 1),
      e: isW(x + 1, y),
      s: isW(x, y + 1),
      w: isW(x - 1, y),
      ne: isW(x + 1, y - 1),
      nw: isW(x - 1, y - 1),
      se: isW(x + 1, y + 1),
      sw: isW(x - 1, y + 1)
    };
  }

  function drawWaterTile(ctx, px, py, size, mask, time = 0) {
    const pad = Math.max(1, size * 0.06);
    const x = px + pad;
    const y = py + pad;
    const w = size - pad * 2;
    const h = size - pad * 2;
    const deep = (mask.n && mask.s && mask.e && mask.w) || (
      (mask.n || mask.s) && (mask.e || mask.w) && (Number(mask.n) + Number(mask.s) + Number(mask.e) + Number(mask.w) >= 2)
    );

    const bg = ctx.createLinearGradient(x, y, x + w, y + h);
    if (deep) {
      bg.addColorStop(0, "#0f4f78");
      bg.addColorStop(0.45, "#1a78ad");
      bg.addColorStop(1, "#0e5f8f");
    } else {
      bg.addColorStop(0, "#1a628f");
      bg.addColorStop(0.5, "#2a8ec4");
      bg.addColorStop(1, "#1a6f9f");
    }
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const wave = Math.sin(time * 2.2 + px * 0.08) * 0.5 + 0.5;
    ctx.strokeStyle = `rgba(210, 245, 255, ${deep ? 0.14 : 0.22})`;
    ctx.lineWidth = Math.max(1, size * 0.05);
    for (let i = 0; i < 3; i++) {
      const ly = y + h * (0.28 + i * 0.22) + wave * size * 0.03;
      ctx.beginPath();
      ctx.moveTo(x, ly);
      ctx.bezierCurveTo(x + w * 0.3, ly - size * 0.04, x + w * 0.7, ly + size * 0.04, x + w, ly);
      ctx.stroke();
    }

    if (deep) {
      ctx.fillStyle = "rgba(120, 210, 255, 0.08)";
      ctx.beginPath();
      ctx.ellipse(x + w * 0.55, y + h * 0.45, w * 0.22, h * 0.16, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const shore = "rgba(196, 236, 255, 0.55)";
    const shoreW = Math.max(1.5, size * 0.08);
    ctx.save();
    if (!mask.n) {
      ctx.fillStyle = shore;
      ctx.fillRect(x, y, w, shoreW);
    }
    if (!mask.s) {
      ctx.fillStyle = shore;
      ctx.fillRect(x, y + h - shoreW, w, shoreW);
    }
    if (!mask.w) {
      ctx.fillStyle = shore;
      ctx.fillRect(x, y, shoreW, h);
    }
    if (!mask.e) {
      ctx.fillStyle = shore;
      ctx.fillRect(x + w - shoreW, y, shoreW, h);
    }
    ctx.restore();
  }

  function drawStoneTile(ctx, px, py, size) {
    const pad = Math.max(1, size * 0.08);
    const x = px + pad;
    const y = py + pad;
    const w = size - pad * 2;
    const h = size - pad * 2;

    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#6f7884");
    g.addColorStop(0.45, "#8d97a3");
    g.addColorStop(1, "#5a636f");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = "rgba(25, 30, 38, 0.35)";
    ctx.lineWidth = Math.max(1, size * 0.05);
    const cx = x + w * 0.5;
    const cy = y + h * 0.52;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.18, y + h * 0.62);
    ctx.lineTo(x + w * 0.42, y + h * 0.28);
    ctx.lineTo(x + w * 0.78, y + h * 0.38);
    ctx.lineTo(x + w * 0.66, y + h * 0.74);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.35, y + h * 0.34);
    ctx.lineTo(x + w * 0.52, y + h * 0.3);
    ctx.lineTo(x + w * 0.48, y + h * 0.42);
    ctx.closePath();
    ctx.fill();
  }

  function paintTileIcon(canvas, kind, size = 28) {
    const c = canvas.getContext("2d");
    canvas.width = size;
    canvas.height = size;
    c.clearRect(0, 0, size, size);
    if (kind === "water") {
      drawWaterTile(c, 0, 0, size, { n: true, e: true, s: true, w: true, ne: true, nw: true, se: true, sw: true }, 0);
    } else if (kind === "stone") {
      drawStoneTile(c, 0, 0, size);
    }
  }

  window.TerrainArt = {
    scatterArcadeTerrain,
    mulberry32,
    waterNeighborMask,
    drawWaterTile,
    drawStoneTile,
    paintTileIcon
  };
})();
