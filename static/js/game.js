const FPV_SIZE = {
  slime: 95,
  bat: 100,
  wolf: 115,
  dragon: 145,
  boss: 200
};

class Enemy {
  constructor(type, word, laneY, delay) {
    const def = ENEMY_TYPES[type];
    this.type = type;
    this.def = def;
    this.word = word;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.currentWord = word;
    this.x = 1050 + delay * 80;
    this.y = laneY;
    this.baseSpeed = def.speed;
    this.size = def.size;
    this.alive = true;
    this.romaji = null;
    this.targeted = false;
    this.hitFlash = 0;
    this.words = [word];
  }

  setWords(words) {
    this.words = words;
    this.currentWord = words[0];
  }

  initRomaji() {
    this.romaji = new RomajiEngine(this.currentWord);
  }

  nextWord() {
    this.hp--;
    if (this.hp <= 0) return false;
    const idx = this.maxHp - this.hp;
    if (idx < this.words.length) {
      this.currentWord = this.words[idx];
    }
    this.romaji = new RomajiEngine(this.currentWord);
    return true;
  }

  update(dt, speedMult) {
    this.x -= this.baseSpeed * speedMult * 60 * dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }
}

class Game {
  constructor(canvas, difficulty, words, onGameEnd) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.difficulty = difficulty;
    this.allWords = words;
    this.onGameEnd = onGameEnd;
    this.config = WAVE_CONFIGS[difficulty];

    this.effects = new EffectsManager();
    this.audio = new AudioManager();

    this.enemies = [];
    this.targetEnemy = null;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalCorrect = 0;
    this.totalMiss = 0;
    this.kills = 0;
    this.wallHp = this.config.wallHp;
    this.maxWallHp = this.config.wallHp;
    this.currentWave = 0;
    this.totalWaves = this.config.waves;
    this.state = 'wave_intro';
    this.stateTimer = 0;
    this.running = true;
    this.lastTime = 0;
    this.wallX = 100;
    this.usedWords = new Set();
    this.arrows = [];
    this.bowRecoil = 0;
    this.damageFlash = 0;

    this.vp = { x: 500, y: 175 };
    this.groundY = 510;
    this.bowAnchor = { x: 880, y: 410 };

    this._boundKeyHandler = this._onKey.bind(this);
    this._boundClickHandler = this._onClick.bind(this);
    document.addEventListener('keydown', this._boundKeyHandler);
    canvas.addEventListener('click', this._boundClickHandler);

    this._startWave();
    requestAnimationFrame(this._loop.bind(this));
  }

  _project(enemy) {
    const t = Math.max(0, Math.min(1, (enemy.x - 100) / 950));
    const near = 1 - t;
    const laneNorm = (enemy.y - 250) / 170;
    const spread = 90 + near * 410;
    const sx = this.vp.x + laneNorm * spread;
    const sy = this.vp.y + near * (this.groundY - this.vp.y);
    const baseFpv = FPV_SIZE[enemy.type] || 100;
    const scale = (0.45 + Math.pow(near, 1.15) * 1.1);
    const appSize = baseFpv * scale;
    return { sx, sy, scale, near, appSize };
  }

  _getWord(minLen, maxLen) {
    const pools = [this.difficulty, 'normal', 'easy', 'hard'];
    for (const key of pools) {
      const pool = this.allWords[key];
      if (!pool) continue;
      const filtered = pool.filter(w => {
        const len = w.length;
        return len >= minLen && len <= maxLen && !this.usedWords.has(w);
      });
      if (filtered.length > 0) {
        const word = filtered[Math.floor(Math.random() * filtered.length)];
        this.usedWords.add(word);
        return word;
      }
    }
    this.usedWords.clear();
    const allPool = [...(this.allWords.easy || []), ...(this.allWords.normal || []), ...(this.allWords.hard || [])];
    const filtered = allPool.filter(w => w.length >= minLen && w.length <= maxLen);
    if (filtered.length > 0) {
      return filtered[Math.floor(Math.random() * filtered.length)];
    }
    return 'てすと';
  }

  _startWave() {
    this.currentWave++;
    if (this.currentWave > this.totalWaves) {
      this._victory();
      return;
    }

    this.state = 'wave_intro';
    this.stateTimer = 2.0;

    const types = this.config.generate(this.currentWave);
    const hasBoss = types.includes('boss');

    if (hasBoss) {
      this.effects.triggerWarning('WARNING');
      this.audio.bossWarning();
      this.stateTimer = 3.5;
    } else {
      this.audio.waveStart();
    }

    const laneMin = 80;
    const laneMax = this.canvas.height - 180;
    const laneCount = types.length;

    this.pendingEnemies = types.map((type, i) => {
      const def = ENEMY_TYPES[type];
      const [minL, maxL] = def.wordLength;
      const y = type === 'boss'
        ? (laneMin + laneMax) / 2
        : laneMin + ((laneMax - laneMin) / (laneCount + 1)) * (i + 1);
      const spawnDelay = Math.max(0.4, 1.2 - this.currentWave * 0.05);
      const enemy = new Enemy(type, this._getWord(minL, maxL), y, i * spawnDelay);

      if (def.hp > 1) {
        const words = [enemy.word];
        for (let h = 1; h < def.hp; h++) {
          words.push(this._getWord(minL, maxL));
        }
        enemy.setWords(words);
      }
      return enemy;
    });
  }

  _spawnPending() {
    for (const enemy of this.pendingEnemies) {
      enemy.initRomaji();
    }
    this.enemies.push(...this.pendingEnemies);
    this.pendingEnemies = [];
  }

  _setTarget(enemy) {
    if (this.targetEnemy) this.targetEnemy.targeted = false;
    this.targetEnemy = enemy;
    this._pendingBuffer = '';
    if (enemy) {
      enemy.targeted = true;
      if (!enemy.romaji) enemy.initRomaji();
    }
  }

  _onClick(e) {
  }

  _onKey(e) {
    if (!this.running) return;
    if (this.state !== 'playing') return;

    const key = e.key.toLowerCase();
    if (key.length !== 1 || key < 'a' || key > 'z') {
      if (key !== '-' && key !== "'") return;
    }

    if (this.targetEnemy && this.targetEnemy.alive) {
      const result = this.targetEnemy.romaji.processKey(key);
      if (result.result === 'miss') {
        this.totalMiss++;
        this.combo = 0;
        this.audio.keyMiss();
        this.effects.triggerShake(3);
        this.effects.triggerFlash('#ef4444');
      } else if (result.result === 'continue' || result.result === 'segment_complete') {
        this.totalCorrect++;
        this.audio.keyCorrect();
      } else if (result.result === 'word_complete') {
        this.totalCorrect++;
        const enemy = this.targetEnemy;
        const hasMore = enemy.nextWord();
        if (!hasMore) {
          this._killEnemy(enemy);
        } else {
          this._shootArrowAt(enemy, false);
        }
      }
      return;
    }

    this._pendingBuffer = (this._pendingBuffer || '') + key;
    const buf = this._pendingBuffer;

    const candidates = [];
    for (const enemy of this.enemies) {
      if (!enemy.alive || !enemy.romaji) continue;
      if (enemy.x > this.canvas.width) continue;
      const testEngine = new RomajiEngine(enemy.currentWord);
      let valid = true;
      for (const ch of buf) {
        const r = testEngine.processKey(ch);
        if (r.result === 'miss') { valid = false; break; }
      }
      if (valid) candidates.push(enemy);
    }

    if (candidates.length === 0) {
      this._pendingBuffer = '';
      return;
    }

    if (candidates.length === 1) {
      const enemy = candidates[0];
      this._setTarget(enemy);
      for (const ch of buf) {
        enemy.romaji.processKey(ch);
      }
      this.totalCorrect += buf.length;
      this.audio.keyCorrect();
      if (enemy.romaji.isComplete) {
        const hasMore = enemy.nextWord();
        if (!hasMore) {
          this._killEnemy(enemy);
        } else {
          this._shootArrowAt(enemy, false);
        }
      }
      this._pendingBuffer = '';
      return;
    }

    this.audio.keyCorrect();
  }

  _shootArrowAt(enemy, isFatal) {
    this.bowRecoil = 1.0;
    this.arrows.push({
      enemy: enemy,
      startX: this.bowAnchor.x - 50,
      startY: this.bowAnchor.y - 30,
      progress: 0,
      duration: 0.18,
      alive: true,
      isBoss: false,
      pts: 0,
      combo: 0,
      isHit: true
    });
    enemy.hitFlash = 0.3;
    this.audio.keyCorrect();
  }

  _killEnemy(enemy) {
    this.bowRecoil = 1.0;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    const comboMult = 1 + Math.floor(this.combo / 3) * 0.2;
    const pts = Math.floor(enemy.def.score * enemy.maxHp * comboMult);

    enemy.dying = true;
    enemy.alive = false;

    this.arrows.push({
      enemy: enemy,
      startX: this.bowAnchor.x - 50,
      startY: this.bowAnchor.y - 30,
      progress: 0,
      duration: 0.18,
      alive: true,
      isBoss: enemy.type === 'boss',
      pts: pts,
      combo: this.combo,
      isHit: false
    });

    this._setTarget(null);
  }

  _updateArrows(dt) {
    for (const arrow of this.arrows) {
      if (!arrow.alive) continue;
      arrow.progress += dt / arrow.duration;
      if (arrow.progress >= 1) {
        arrow.alive = false;
        this._onArrowHit(arrow);
      }
    }
    this.arrows = this.arrows.filter(a => a.alive);
  }

  _onArrowHit(arrow) {
    let tx, ty;
    if (arrow.enemy) {
      const proj = this._project(arrow.enemy);
      tx = proj.sx;
      ty = proj.sy;
    } else {
      tx = this.vp.x;
      ty = this.vp.y;
    }

    if (arrow.isHit) {
      this.effects.explode(tx, ty, '#d4a017', 8);
      this.audio.keyCorrect();
      this.effects.addScoreText(tx, ty - 20, 'HIT!');
      if (arrow.enemy) arrow.enemy.hitFlash = 0.3;
      return;
    }

    this.kills++;
    this.score += arrow.pts;

    if (arrow.enemy) arrow.enemy.dying = false;

    if (arrow.isBoss) {
      this.effects.bossExplode(tx, ty);
      this.audio.bossKill();
      this.effects.triggerShake(10);
    } else {
      this.effects.explode(tx, ty, '#d4a017');
      this.audio.enemyKill();
    }
    this.effects.addScoreText(tx, ty - 20, arrow.pts);
    if (arrow.combo >= 3) {
      this.effects.addComboText(tx, ty, arrow.combo);
    }
  }

  _victory() {
    this.state = 'victory';
    this.running = false;
    this.effects.triggerVictory();
    this.audio.victory();
    setTimeout(() => this._endGame(true), 3000);
  }

  _gameOver() {
    this.state = 'gameover';
    this.running = false;
    for (const arrow of this.arrows) {
      if (arrow.alive) {
        this.kills++;
        this.score += arrow.pts;
        if (arrow.enemy) arrow.enemy.dying = false;
      }
    }
    this.arrows = [];
    this.audio.gameOver();
    this.effects.triggerFlash('#ef4444');
    this.effects.triggerShake(15);
    setTimeout(() => this._endGame(false), 2000);
  }

  _endGame(victory) {
    document.removeEventListener('keydown', this._boundKeyHandler);
    this.canvas.removeEventListener('click', this._boundClickHandler);
    this.onGameEnd({
      victory,
      score: this.score,
      kills: this.kills,
      wave: this.currentWave,
      totalWaves: this.totalWaves,
      combo: this.maxCombo,
      correct: this.totalCorrect,
      miss: this.totalMiss,
      accuracy: this.totalCorrect + this.totalMiss > 0
        ? this.totalCorrect / (this.totalCorrect + this.totalMiss) : 1,
      difficulty: this.difficulty,
      wallHp: this.wallHp,
      maxWallHp: this.maxWallHp
    });
  }

  _loop(time) {
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.05) : 0.016;
    this.lastTime = time;

    this._update(dt);
    this._draw();

    if (this.running || this.state === 'victory' || this.state === 'gameover' || this.state === 'wave_clear' || this.state === 'wave_intro') {
      requestAnimationFrame(this._loop.bind(this));
    }
  }

  _update(dt) {
    this.effects.update(dt);
    this._updateArrows(dt);
    if (this.bowRecoil > 0) this.bowRecoil = Math.max(0, this.bowRecoil - dt * 6);
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2);

    if (this.state === 'wave_intro') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'playing';
        this._spawnPending();
      }
      return;
    }

    if (this.state === 'wave_clear') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this._startWave();
      }
      return;
    }

    if (this.state !== 'playing') return;

    for (const enemy of this.enemies) {
      if (!enemy.alive && !enemy.dying) continue;
      enemy.update(dt, this.config.speedMult);
      if (enemy.dying) continue;
      if (enemy.x <= this.wallX) {
        enemy.alive = false;
        this.wallHp--;
        this.combo = 0;
        this.damageFlash = 1.0;
        this.effects.triggerShake(8);
        this.effects.triggerFlash('#ef4444');
        this.audio.wallHit();
        if (enemy === this.targetEnemy) {
          this.targetEnemy = null;
        }
        if (this.wallHp <= 0) {
          this._gameOver();
          return;
        }
      }
    }

    this.enemies = this.enemies.filter(e => e.alive || e.dying || e === this.targetEnemy);

    if (this.targetEnemy && !this.targetEnemy.alive) {
      this._setTarget(null);
    }

    const allDead = this.enemies.every(e => !e.alive) && this.arrows.length === 0;
    if (allDead && this.state === 'playing') {
      this.score += this.currentWave * 200;
      this.effects.triggerWaveClear(this.currentWave);
      this.state = 'wave_clear';
      this.stateTimer = 2.0;
    }
  }

  _draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const shake = this.effects.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    this._drawCave(ctx, w, h);
    this._drawEnemies(ctx);
    this._drawArrows(ctx);
    this._drawBow(ctx);
    this._drawVignette(ctx, w, h);
    this._drawHUD(ctx, w);
    this._drawInputArea(ctx, w, h);

    this.effects.draw(ctx, this.canvas);

    ctx.restore();
  }

  _drawCave(ctx, w, h) {
    const vpX = this.vp.x;
    const vpY = this.vp.y;

    // far black depth at vanishing point
    const bg = ctx.createRadialGradient(vpX, vpY, 10, vpX, vpY, 500);
    bg.addColorStop(0, '#050308');
    bg.addColorStop(0.4, '#0c0a14');
    bg.addColorStop(1, '#1a1208');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // ceiling (dark) — top region tapering to vanishing point
    ctx.fillStyle = '#0a0608';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, 60);
    ctx.lineTo(vpX + 80, vpY);
    ctx.lineTo(vpX - 80, vpY);
    ctx.lineTo(0, 60);
    ctx.closePath();
    ctx.fill();

    // left wall (perspective)
    const lwGrad = ctx.createLinearGradient(0, h / 2, vpX, vpY);
    lwGrad.addColorStop(0, '#3a2a18');
    lwGrad.addColorStop(0.7, '#1a1208');
    lwGrad.addColorStop(1, '#080404');
    ctx.fillStyle = lwGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(vpX - 80, vpY);
    ctx.lineTo(vpX - 80, vpY + 50);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // right wall
    const rwGrad = ctx.createLinearGradient(w, h / 2, vpX, vpY);
    rwGrad.addColorStop(0, '#3a2a18');
    rwGrad.addColorStop(0.7, '#1a1208');
    rwGrad.addColorStop(1, '#080404');
    ctx.fillStyle = rwGrad;
    ctx.beginPath();
    ctx.moveTo(w, 0);
    ctx.lineTo(vpX + 80, vpY);
    ctx.lineTo(vpX + 80, vpY + 50);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // ground (perspective)
    const gGrad = ctx.createLinearGradient(0, vpY, 0, h);
    gGrad.addColorStop(0, '#1a1208');
    gGrad.addColorStop(0.5, '#2a1d10');
    gGrad.addColorStop(1, '#3a2818');
    ctx.fillStyle = gGrad;
    ctx.beginPath();
    ctx.moveTo(vpX - 80, vpY);
    ctx.lineTo(vpX + 80, vpY);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // perspective lines on ground
    ctx.strokeStyle = 'rgba(80, 50, 30, 0.5)';
    ctx.lineWidth = 1;
    for (let i = -5; i <= 5; i++) {
      const groundX = vpX + i * 100;
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(groundX < 0 ? 0 : groundX > w ? w : groundX, h);
      if (i !== 0) {
        const slope = (groundX - vpX) / (h - vpY);
        const xAtBottom = vpX + slope * (h - vpY);
        ctx.moveTo(vpX, vpY);
        ctx.lineTo(xAtBottom, h);
      }
      ctx.stroke();
    }

    // perspective horizontal "depth" lines on ground
    ctx.strokeStyle = 'rgba(80, 50, 30, 0.3)';
    for (let i = 1; i <= 8; i++) {
      const t = 1 - i / 9;
      const ly = vpY + (h - vpY) * (1 - Math.pow(t, 1.5));
      const halfW = ((ly - vpY) / (h - vpY)) * (w / 2);
      ctx.beginPath();
      ctx.moveTo(vpX - halfW, ly);
      ctx.lineTo(vpX + halfW, ly);
      ctx.stroke();
    }

    // torches on walls
    this._drawTorch(ctx, 70, 240, 1.0);
    this._drawTorch(ctx, w - 70, 240, 1.0);
    this._drawTorch(ctx, 200, 215, 0.7);
    this._drawTorch(ctx, w - 200, 215, 0.7);
    this._drawTorch(ctx, 320, 200, 0.45);
    this._drawTorch(ctx, w - 320, 200, 0.45);
  }

  _drawTorch(ctx, x, y, scale) {
    const flick = 0.85 + Math.sin(Date.now() / 80 + x) * 0.15;
    // bracket
    ctx.fillStyle = '#2a1a08';
    ctx.fillRect(x - 4 * scale, y, 8 * scale, 16 * scale);
    // glow
    const glow = ctx.createRadialGradient(x, y - 8 * scale, 0, x, y - 8 * scale, 80 * scale);
    glow.addColorStop(0, `rgba(255, 180, 80, ${0.5 * flick})`);
    glow.addColorStop(1, 'rgba(255, 120, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 80 * scale, y - 80 * scale, 160 * scale, 160 * scale);
    // flame
    ctx.save();
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 20 * scale;
    ctx.fillStyle = '#ffaa30';
    ctx.beginPath();
    ctx.ellipse(x, y - 8 * scale, 5 * scale, 12 * scale * flick, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe680';
    ctx.beginPath();
    ctx.ellipse(x, y - 8 * scale, 2.5 * scale, 6 * scale * flick, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawVignette(ctx, w, h) {
    const v = ctx.createRadialGradient(w / 2, h / 2 - 50, 150, w / 2, h / 2, 600);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);

    if (this.damageFlash > 0) {
      ctx.fillStyle = `rgba(180, 20, 20, ${this.damageFlash * 0.25})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  _drawEnemies(ctx) {
    const sorted = [...this.enemies]
      .filter(e => e.alive || e.dying)
      .sort((a, b) => b.x - a.x);

    for (const enemy of sorted) {
      const proj = this._project(enemy);
      if (proj.near <= 0) continue;

      // shadow on ground
      ctx.save();
      ctx.globalAlpha = 0.4 * proj.near;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(proj.sx, proj.sy + proj.appSize * 0.42, proj.appSize * 0.35, proj.appSize * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      if (enemy.hitFlash > 0) {
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 30) * 0.5;
      }
      enemy.def.draw(ctx, proj.sx, proj.sy, proj.appSize, enemy.hp, enemy.maxHp);
      ctx.restore();

      this._drawEnemyLabel(ctx, enemy, proj);
    }
  }

  _drawEnemyLabel(ctx, enemy, proj) {
    if (!enemy.romaji) return;

    const fontKana = Math.max(11, Math.min(18, 11 + proj.near * 7));
    const fontRoma = Math.max(12, Math.min(20, 12 + proj.near * 8));
    const labelY = proj.sy - proj.appSize * 0.45 - 20;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // kana (top)
    ctx.font = `bold ${fontKana}px 'Segoe UI', sans-serif`;
    const kanaW = ctx.measureText(enemy.currentWord).width;
    ctx.fillStyle = 'rgba(10, 12, 16, 0.85)';
    ctx.fillRect(proj.sx - kanaW / 2 - 6, labelY - fontKana / 2 - 2, kanaW + 12, fontKana + 4);
    ctx.fillStyle = enemy.targeted ? '#fbbf24' : '#ffffff';
    ctx.shadowColor = enemy.targeted ? '#fbbf24' : 'transparent';
    ctx.shadowBlur = enemy.targeted ? 6 : 0;
    ctx.fillText(enemy.currentWord, proj.sx, labelY);
    ctx.shadowBlur = 0;

    // romaji (below kana)
    const romaji = enemy.romaji.displayRomaji;
    const confirmed = enemy.romaji.confirmed;
    const remaining = romaji.slice(confirmed.length);
    ctx.font = `bold ${fontRoma}px 'Courier New', monospace`;
    const romaW = ctx.measureText(romaji).width;
    const romaY = labelY + fontKana / 2 + fontRoma / 2 + 4;

    // background
    const bgColor = enemy.targeted ? 'rgba(70, 100, 180, 0.95)' : 'rgba(30, 50, 90, 0.85)';
    ctx.fillStyle = bgColor;
    const pad = 6;
    const bgX = proj.sx - romaW / 2 - pad;
    const bgY = romaY - fontRoma / 2 - 2;
    ctx.fillRect(bgX, bgY, romaW + pad * 2, fontRoma + 4);

    ctx.textAlign = 'left';
    const startX = proj.sx - romaW / 2;
    ctx.fillStyle = '#86efac';
    ctx.fillText(confirmed, startX, romaY);
    const cw = ctx.measureText(confirmed).width;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(remaining, startX + cw, romaY);

    ctx.restore();
  }

  _drawArrows(ctx) {
    for (const arrow of this.arrows) {
      if (!arrow.alive) continue;
      let tx, ty, tScale;
      if (arrow.enemy) {
        const proj = this._project(arrow.enemy);
        tx = proj.sx;
        ty = proj.sy;
        tScale = proj.scale;
      } else {
        tx = this.vp.x;
        ty = this.vp.y;
        tScale = 0.2;
      }
      const p = arrow.progress;
      const ax = arrow.startX + (tx - arrow.startX) * p;
      const ay = arrow.startY + (ty - arrow.startY) * p;
      const scale = 1.0 - p * (1 - tScale);
      const angle = Math.atan2(ty - ay, tx - ax);

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      const len = 60 * scale;
      const head = 12 * scale;
      // shaft
      ctx.strokeStyle = '#d4a017';
      ctx.lineWidth = Math.max(1.5, 3 * scale);
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
      // arrowhead
      ctx.fillStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(len / 2 + head, 0);
      ctx.lineTo(len / 2, -head * 0.4);
      ctx.lineTo(len / 2, head * 0.4);
      ctx.closePath();
      ctx.fill();
      // fletching
      ctx.fillStyle = '#cc3333';
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(-len / 2 - head * 0.8, -head * 0.5);
      ctx.lineTo(-len / 2 + head * 0.2, 0);
      ctx.lineTo(-len / 2 - head * 0.8, head * 0.5);
      ctx.closePath();
      ctx.fill();
      // trail glow
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.4 * (1 - p)})`;
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(-len / 2 - 30 * scale, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawBow(ctx) {
    const recoil = this.bowRecoil;
    const recoilOffset = recoil * 14;

    // bow geometry: diagonal from upper-left tip down to off-screen lower-right
    const topTip = { x: 670 + recoilOffset, y: 60 - recoilOffset * 0.3 };
    const botTip = { x: 1050 + recoilOffset, y: 720 - recoilOffset * 0.3 };
    const grip = { x: 880 + recoilOffset, y: 410 - recoilOffset * 0.3 };
    // bow's curvature: control point pushed to the RIGHT (convex right)
    const bulge = 60 - recoil * 25;
    const ctrl = { x: grip.x + bulge, y: grip.y };

    ctx.save();
    ctx.lineCap = 'round';

    // outer dark wood (back of bow)
    ctx.strokeStyle = '#2a1606';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(topTip.x, topTip.y);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, botTip.x, botTip.y);
    ctx.stroke();

    // inner mid-tone wood
    ctx.strokeStyle = '#5d3115';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(topTip.x, topTip.y);
    ctx.quadraticCurveTo(ctrl.x - 2, ctrl.y, botTip.x, botTip.y);
    ctx.stroke();

    // wood grain highlight strip on outer (convex) side
    ctx.strokeStyle = '#8a4f1f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(topTip.x + 3, topTip.y + 2);
    ctx.quadraticCurveTo(ctrl.x + 3, ctrl.y, botTip.x + 3, botTip.y);
    ctx.stroke();

    // tips (carved horn caps)
    ctx.fillStyle = '#1a0e04';
    ctx.beginPath();
    ctx.arc(topTip.x, topTip.y, 7, 0, Math.PI * 2);
    ctx.arc(botTip.x, botTip.y, 7, 0, Math.PI * 2);
    ctx.fill();

    // bowstring (taut line between tips, slightly pulled toward grip when nocked)
    const drawback = 1 - recoil;
    const stringMid = {
      x: (topTip.x + botTip.x) / 2 - drawback * 30,
      y: (topTip.y + botTip.y) / 2
    };
    ctx.strokeStyle = '#f0e0b0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(topTip.x, topTip.y);
    ctx.lineTo(stringMid.x, stringMid.y);
    ctx.lineTo(botTip.x, botTip.y);
    ctx.stroke();

    // nocked arrow (visible when not recoiling; points forward-left toward enemies)
    if (recoil < 0.4) {
      const arrowAlpha = 1 - recoil / 0.4;
      ctx.save();
      ctx.globalAlpha = arrowAlpha;
      const arrowStart = stringMid;
      const arrowEnd = { x: arrowStart.x - 360, y: arrowStart.y - 110 };
      const ang = Math.atan2(arrowEnd.y - arrowStart.y, arrowEnd.x - arrowStart.x);
      // shaft
      ctx.strokeStyle = '#d4a017';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(arrowStart.x, arrowStart.y);
      ctx.lineTo(arrowEnd.x, arrowEnd.y);
      ctx.stroke();
      // arrowhead
      ctx.save();
      ctx.translate(arrowEnd.x, arrowEnd.y);
      ctx.rotate(ang);
      ctx.fillStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-14, -6);
      ctx.lineTo(-14, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // fletching (near nock)
      ctx.save();
      ctx.translate(arrowStart.x, arrowStart.y);
      ctx.rotate(ang);
      ctx.fillStyle = '#cc3333';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(14, -7);
      ctx.lineTo(8, 0);
      ctx.lineTo(14, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.restore();
    }

    // leather grip wrap at hand position
    ctx.save();
    ctx.translate(grip.x, grip.y);
    // angle along the bow line (tangent direction at grip)
    const tang = Math.atan2(botTip.y - topTip.y, botTip.x - topTip.x);
    ctx.rotate(tang);
    ctx.fillStyle = '#15080a';
    ctx.fillRect(-12, -50, 24, 100);
    // wrap stripes
    ctx.strokeStyle = '#3a1f0a';
    ctx.lineWidth = 1.5;
    for (let i = -42; i < 45; i += 8) {
      ctx.beginPath();
      ctx.moveTo(-12, i);
      ctx.lineTo(14, i + 2);
      ctx.stroke();
    }
    ctx.restore();

    // hand holding the grip
    ctx.save();
    ctx.translate(grip.x + 8, grip.y + 4);
    ctx.rotate(tang - 0.1);
    // palm
    ctx.fillStyle = '#d8a878';
    ctx.beginPath();
    ctx.ellipse(0, 0, 32, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    // palm shading
    ctx.fillStyle = 'rgba(120, 70, 30, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-12, 5, 18, 30, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // fingers wrapped around grip (4 small bumps on the far side of grip)
    ctx.fillStyle = '#c89868';
    for (let i = -22; i <= 22; i += 12) {
      ctx.beginPath();
      ctx.ellipse(-20, i, 7, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // thumb on near side
    ctx.fillStyle = '#d8a878';
    ctx.beginPath();
    ctx.ellipse(8, -22, 10, 18, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // knuckle highlights
    ctx.fillStyle = '#c08858';
    for (let i = -16; i <= 16; i += 10) {
      ctx.beginPath();
      ctx.arc(-12, i, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // forearm extending off bottom-right of screen
    ctx.save();
    ctx.fillStyle = '#1f3a18';
    ctx.beginPath();
    ctx.moveTo(grip.x + 30, grip.y + 30);
    ctx.lineTo(grip.x - 10, grip.y + 50);
    ctx.lineTo(1100, 720);
    ctx.lineTo(1100, 560);
    ctx.closePath();
    ctx.fill();
    // sleeve cuff (leather band)
    ctx.fillStyle = '#5a3416';
    ctx.beginPath();
    ctx.moveTo(grip.x + 30, grip.y + 30);
    ctx.lineTo(grip.x - 10, grip.y + 50);
    ctx.lineTo(grip.x + 30, grip.y + 90);
    ctx.lineTo(grip.x + 60, grip.y + 70);
    ctx.closePath();
    ctx.fill();
    // sleeve stitching
    ctx.strokeStyle = '#3a1f0a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(grip.x + 35, grip.y + 38);
    ctx.lineTo(grip.x + 50, grip.y + 78);
    ctx.stroke();
    // sleeve shading on lower edge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.moveTo(grip.x - 10, grip.y + 50);
    ctx.lineTo(1100, 720);
    ctx.lineTo(1100, 680);
    ctx.lineTo(grip.x + 5, grip.y + 70);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  _getAimAngle() {
    if (this.targetEnemy && this.targetEnemy.alive) {
      const proj = this._project(this.targetEnemy);
      const dx = proj.sx - this.bowAnchor.x;
      const dy = proj.sy - this.bowAnchor.y;
      const mag = Math.sqrt(dx * dx + dy * dy);
      return { x: dx / mag, y: dy / mag };
    }
    return { x: -0.5, y: -0.5 };
  }

  _drawHUD(ctx, w) {
    ctx.save();
    // top bar with subtle gradient
    const tg = ctx.createLinearGradient(0, 0, 0, 42);
    tg.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    tg.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, w, 42);

    // HP hearts (top left)
    ctx.font = "bold 14px 'Segoe UI', sans-serif";
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#cc3333';
    ctx.fillText('HP', 14, 21);

    const heartStart = 42;
    const heartSize = 18;
    const heartGap = 6;
    for (let i = 0; i < this.maxWallHp; i++) {
      const hx = heartStart + i * (heartSize + heartGap) + heartSize / 2;
      const hy = 21;
      this._drawHeart(ctx, hx, hy, heartSize, i < this.wallHp);
    }

    // wave (center)
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e5e7eb';
    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    ctx.fillText(`WAVE ${this.currentWave}/${this.totalWaves}`, w / 2, 21);

    // score (top right)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('SCORE', w - 90, 21);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.score.toLocaleString(), w - 14, 21);

    // combo
    if (this.combo >= 3) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f97316';
      ctx.font = "bold 14px 'Segoe UI', sans-serif";
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 8;
      ctx.fillText(`${this.combo} COMBO`, heartStart + this.maxWallHp * (heartSize + heartGap) + 16, 21);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  _drawHeart(ctx, x, y, size, alive) {
    const s = size / 2;
    ctx.save();
    if (alive) {
      ctx.fillStyle = '#dc2626';
      ctx.shadowColor = '#dc2626';
      ctx.shadowBlur = 6;
    } else {
      ctx.fillStyle = '#3a2828';
      ctx.shadowBlur = 0;
    }
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.4);
    ctx.bezierCurveTo(x, y - s * 0.2, x - s, y - s * 0.6, x - s, y + s * 0.05);
    ctx.bezierCurveTo(x - s, y + s * 0.6, x, y + s * 0.9, x, y + s * 1.1);
    ctx.bezierCurveTo(x, y + s * 0.9, x + s, y + s * 0.6, x + s, y + s * 0.05);
    ctx.bezierCurveTo(x + s, y - s * 0.6, x, y - s * 0.2, x, y + s * 0.4);
    ctx.fill();
    if (alive) {
      ctx.fillStyle = 'rgba(255, 150, 150, 0.4)';
      ctx.beginPath();
      ctx.ellipse(x - s * 0.3, y + s * 0.05, s * 0.2, s * 0.25, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawInputArea(ctx, w, h) {
    const areaY = h - 110;
    const ag = ctx.createLinearGradient(0, areaY, 0, h);
    ag.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    ag.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
    ctx.fillStyle = ag;
    ctx.fillRect(0, areaY, w, 110);
    ctx.strokeStyle = 'rgba(212, 160, 23, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, areaY);
    ctx.lineTo(w, areaY);
    ctx.stroke();

    if (this.targetEnemy && this.targetEnemy.alive && this.targetEnemy.romaji) {
      const enemy = this.targetEnemy;
      const romaji = enemy.romaji;

      ctx.font = "bold 14px 'Segoe UI', sans-serif";
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(`TARGET: ${enemy.def.name}`, 20, areaY + 25);

      if (enemy.maxHp > 1) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(`HP ${enemy.hp}/${enemy.maxHp}`, 200, areaY + 25);
      }

      ctx.font = "bold 28px 'Segoe UI', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(enemy.currentWord, w / 2, areaY + 55);

      const display = romaji.displayRomaji;
      const confirmed = romaji.confirmed;
      const remaining = display.slice(confirmed.length);

      ctx.font = "bold 24px 'Courier New', monospace";
      const fullW = ctx.measureText(display).width;
      const startX = w / 2 - fullW / 2;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#86efac';
      ctx.fillText(confirmed, startX, areaY + 90);

      const confW = ctx.measureText(confirmed).width;
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(remaining, startX + confW, areaY + 90);

      ctx.fillStyle = '#86efac';
      ctx.fillRect(startX + confW, areaY + 94, 2, 4);
    } else if (this._pendingBuffer) {
      ctx.font = "bold 24px 'Courier New', monospace";
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d4a017';
      ctx.fillText(this._pendingBuffer + '_', w / 2, areaY + 55);
      ctx.font = "14px 'Segoe UI', sans-serif";
      ctx.fillStyle = '#9ca3af';
      ctx.fillText('入力中... 候補を絞り込んでいます', w / 2, areaY + 88);
    } else {
      ctx.font = "16px 'Segoe UI', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6b7280';
      ctx.fillText('タイピングで敵を撃破！', w / 2, areaY + 60);
    }

    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9ca3af';
    const acc = this.totalCorrect + this.totalMiss > 0
      ? (this.totalCorrect / (this.totalCorrect + this.totalMiss) * 100).toFixed(1) : '100.0';
    ctx.fillText(`撃破: ${this.kills}体  正確率: ${acc}%`, w - 20, areaY + 100);
  }

  destroy() {
    this.running = false;
    document.removeEventListener('keydown', this._boundKeyHandler);
    this.canvas.removeEventListener('click', this._boundClickHandler);
  }
}

window.Game = Game;
