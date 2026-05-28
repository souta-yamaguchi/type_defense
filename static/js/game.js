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

  draw(ctx) {
    ctx.save();
    if (this.hitFlash > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 30) * 0.5;
    }
    this.def.draw(ctx, this.x, this.y, this.size, this.hp, this.maxHp);
    ctx.restore();

    ctx.save();
    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    ctx.textAlign = 'center';

    if (this.romaji) {
      const romaji = this.romaji.displayRomaji;
      const confirmed = this.romaji.confirmed;
      const remaining = romaji.slice(confirmed.length);

      const fullWidth = ctx.measureText(romaji).width;
      const startX = this.x - fullWidth / 2;

      ctx.fillStyle = '#1a1a2e';
      ctx.globalAlpha = 0.7;
      const pad = 4;
      ctx.fillRect(this.x - fullWidth / 2 - pad, this.y + this.size * 0.4 - 2, fullWidth + pad * 2, 22);
      ctx.globalAlpha = 1;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#4ade80';
      ctx.fillText(confirmed, startX, this.y + this.size * 0.4 + 14);

      const confWidth = ctx.measureText(confirmed).width;
      ctx.fillStyle = this.targeted ? '#e2e8f0' : '#64748b';
      ctx.fillText(remaining, startX + confWidth, this.y + this.size * 0.4 + 14);
    }

    ctx.font = "bold 14px 'Segoe UI', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillStyle = this.targeted ? '#fbbf24' : '#e2e8f0';
    ctx.shadowColor = this.targeted ? '#fbbf24' : 'transparent';
    ctx.shadowBlur = this.targeted ? 8 : 0;
    ctx.fillText(this.currentWord, this.x, this.y - this.size * 0.5 - 8);
    ctx.restore();
  }

  containsPoint(px, py) {
    const dx = px - this.x;
    const dy = py - this.y;
    return Math.sqrt(dx * dx + dy * dy) < this.size * 0.8;
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
    this.heroY = 280;
    this.heroDrawAngle = 0;
    this.princessShake = 0;

    this._boundKeyHandler = this._onKey.bind(this);
    this._boundClickHandler = this._onClick.bind(this);
    document.addEventListener('keydown', this._boundKeyHandler);
    canvas.addEventListener('click', this._boundClickHandler);

    this._startWave();
    requestAnimationFrame(this._loop.bind(this));
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
      const y = laneMin + ((laneMax - laneMin) / (laneCount + 1)) * (i + 1);
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
    const heroX = 55;
    const dx = enemy.x - heroX;
    const dy = enemy.y - this.heroY;
    this.heroDrawAngle = Math.atan2(dy, dx);

    this.arrows.push({
      x: heroX,
      y: this.heroY,
      targetX: enemy.x,
      targetY: enemy.y,
      enemy: enemy,
      speed: 4000,
      alive: true,
      isBoss: false,
      isFatal: false,
      pts: 0,
      combo: 0,
      life: 1.0,
      isHit: true
    });

    enemy.hitFlash = 0.3;
    this.audio.keyCorrect();
  }

  _killEnemy(enemy) {
    const heroX = 55;
    const dx = enemy.x - heroX;
    const dy = enemy.y - this.heroY;
    this.heroDrawAngle = Math.atan2(dy, dx);

    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    const comboMult = 1 + Math.floor(this.combo / 3) * 0.2;
    const pts = Math.floor(enemy.def.score * enemy.maxHp * comboMult);

    enemy.dying = true;
    enemy.alive = false;

    this.arrows.push({
      x: heroX,
      y: this.heroY,
      targetX: enemy.x,
      targetY: enemy.y,
      enemy: enemy,
      speed: 4000,
      alive: true,
      isBoss: enemy.type === 'boss',
      pts: pts,
      combo: this.combo,
      life: 1.0
    });

    this._setTarget(null);
  }

  _updateArrows(dt) {
    for (const arrow of this.arrows) {
      if (!arrow.alive) continue;
      arrow.life -= dt;
      if (arrow.enemy && arrow.enemy.dying) {
        arrow.targetX = arrow.enemy.x;
        arrow.targetY = arrow.enemy.y;
      }
      if (arrow.life <= 0) {
        arrow.alive = false;
        this._onArrowHit(arrow);
        continue;
      }
      const dx = arrow.targetX - arrow.x;
      const dy = arrow.targetY - arrow.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 30 || (arrow.speed * dt) >= dist) {
        arrow.alive = false;
        this._onArrowHit(arrow);
      } else {
        const vx = (dx / dist) * arrow.speed * dt;
        const vy = (dy / dist) * arrow.speed * dt;
        arrow.x += vx;
        arrow.y += vy;
      }
    }
    this.arrows = this.arrows.filter(a => a.alive);
  }

  _onArrowHit(arrow) {
    const tx = arrow.targetX;
    const ty = arrow.targetY;

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
    this.princessShake = 0.3;
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
      wallHp: this.wallHp
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
    if (this.princessShake > 0) this.princessShake -= dt;

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
        this.effects.triggerShake(8);
        this.effects.triggerFlash('#ef4444');
        this.audio.wallHit();
        this.princessShake = 1.0;
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

    ctx.fillStyle = '#0c1a0c';
    ctx.fillRect(0, 0, w, h);

    this._drawGround(ctx, w, h);
    this._drawWall(ctx, h);
    this._drawPrincess(ctx);
    this._drawHero(ctx);
    this._drawArrows(ctx);
    this._drawEnemies(ctx);
    this._drawHUD(ctx, w);
    this._drawInputArea(ctx, w, h);

    this.effects.draw(ctx, this.canvas);

    ctx.restore();
  }

  _drawGround(ctx, w, h) {
    const grad = ctx.createLinearGradient(0, h - 120, 0, h);
    grad.addColorStop(0, '#142014');
    grad.addColorStop(1, '#0a140a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - 120, w, 120);

    ctx.strokeStyle = '#1e3020';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    for (let y = 60; y < h - 120; y += 60) {
      ctx.beginPath();
      ctx.moveTo(this.wallX + 20, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  _drawWall(ctx, h) {
    const x = this.wallX;
    ctx.fillStyle = '#3a4a3a';
    ctx.fillRect(x - 15, 30, 30, h - 150);

    const brickH = 20;
    const rows = Math.floor((h - 150) / brickH);
    ctx.strokeStyle = '#1e2e1e';
    ctx.lineWidth = 1;
    for (let r = 0; r < rows; r++) {
      const by = 30 + r * brickH;
      ctx.strokeRect(x - 15, by, 30, brickH);
      if (r % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(x, by);
        ctx.lineTo(x, by + brickH);
        ctx.stroke();
      }
    }

    const damage = 1 - this.wallHp / this.maxWallHp;
    if (damage > 0) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      const cracks = Math.floor(damage * 5);
      for (let c = 0; c < cracks; c++) {
        const cy = 80 + c * 60;
        ctx.beginPath();
        ctx.moveTo(x - 5, cy);
        ctx.lineTo(x + 3, cy + 15);
        ctx.lineTo(x - 8, cy + 30);
        ctx.stroke();
      }
    }

    const heartSize = 22;
    const heartGap = 8;
    for (let i = 0; i < this.maxWallHp; i++) {
      const hx = x;
      const hy = 50 + i * (heartSize + heartGap);
      const alive = i < this.wallHp;
      this._drawHeart(ctx, hx, hy, heartSize, alive);
    }
  }

  _drawHeart(ctx, x, y, size, alive) {
    const s = size / 2;
    ctx.save();
    if (alive) {
      ctx.fillStyle = '#cc3333';
      ctx.shadowColor = '#cc3333';
      ctx.shadowBlur = 8;
    } else {
      ctx.fillStyle = '#2a3a2a';
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

  _drawEnemies(ctx) {
    for (const enemy of this.enemies) {
      if (enemy.alive || enemy.dying) enemy.draw(ctx);
    }
  }

  _drawHero(ctx) {
    const x = 55;
    const y = this.heroY;
    const angle = this.targetEnemy && this.targetEnemy.alive
      ? Math.atan2(this.targetEnemy.y - y, this.targetEnemy.x - x)
      : this.heroDrawAngle || 0;
    this.heroDrawAngle = angle;

    ctx.save();
    ctx.translate(x, y);

    // legs
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(-8, 20, 6, 16);
    ctx.fillRect(2, 20, 6, 16);
    // boots
    ctx.fillStyle = '#3a2510';
    ctx.fillRect(-9, 32, 8, 5);
    ctx.fillRect(1, 32, 8, 5);

    // torso
    ctx.fillStyle = '#2a6e2a';
    ctx.beginPath();
    ctx.moveTo(-14, -5);
    ctx.lineTo(14, -5);
    ctx.lineTo(12, 22);
    ctx.lineTo(-12, 22);
    ctx.closePath();
    ctx.fill();
    // belt
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(-13, 14, 26, 4);
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(-2, 14, 4, 4);

    // cloak
    ctx.fillStyle = '#1a5a1a';
    ctx.beginPath();
    ctx.moveTo(-14, -5);
    ctx.lineTo(-18, 20);
    ctx.lineTo(-10, 22);
    ctx.closePath();
    ctx.fill();

    // arm (back)
    ctx.fillStyle = '#2a6e2a';
    ctx.save();
    ctx.translate(0, 0);
    ctx.rotate(angle * 0.3);
    ctx.fillRect(-16, -3, 10, 6);
    ctx.restore();

    // neck
    ctx.fillStyle = '#e8c090';
    ctx.fillRect(-4, -10, 8, 6);

    // head
    ctx.fillStyle = '#e8c090';
    ctx.beginPath();
    ctx.arc(0, -22, 13, 0, Math.PI * 2);
    ctx.fill();

    // hood
    ctx.fillStyle = '#1a5a1a';
    ctx.beginPath();
    ctx.arc(0, -24, 14, Math.PI * 1.15, Math.PI * 1.85);
    ctx.lineTo(10, -12);
    ctx.lineTo(-10, -12);
    ctx.closePath();
    ctx.fill();
    // hood rim
    ctx.fillStyle = '#145014';
    ctx.beginPath();
    ctx.arc(0, -22, 14, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();

    // face
    ctx.fillStyle = '#e8c090';
    ctx.beginPath();
    ctx.arc(0, -20, 10, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = '#2d5a1e';
    ctx.beginPath();
    ctx.ellipse(-4, -21, 2.5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(4, -21, 2.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(-4, -21, 1.5, 0, Math.PI * 2);
    ctx.arc(4, -21, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // eye highlights
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-3, -22, 0.7, 0, Math.PI * 2);
    ctx.arc(5, -22, 0.7, 0, Math.PI * 2);
    ctx.fill();

    // eyebrows
    ctx.strokeStyle = '#3a2510';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-7, -26);
    ctx.lineTo(-2, -25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2, -25);
    ctx.lineTo(7, -26);
    ctx.stroke();

    // nose
    ctx.strokeStyle = '#c8a070';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.lineTo(-1, -16);
    ctx.stroke();

    // mouth (determined)
    ctx.strokeStyle = '#8a5a3a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-3, -13);
    ctx.lineTo(3, -13);
    ctx.stroke();

    // bow arm + bow
    ctx.save();
    ctx.rotate(angle);
    // arm
    ctx.fillStyle = '#2a6e2a';
    ctx.fillRect(5, -4, 18, 7);
    // hand
    ctx.fillStyle = '#e8c090';
    ctx.beginPath();
    ctx.arc(24, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    // bow
    ctx.strokeStyle = '#6B3410';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(26, 0, 24, -0.9, 0.9);
    ctx.stroke();
    // bow detail
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(26, 0, 22, -0.85, 0.85);
    ctx.stroke();
    // bowstring
    ctx.strokeStyle = '#c8b89a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(26 + 24 * Math.cos(-0.9), 24 * Math.sin(-0.9));
    ctx.lineTo(26 + 24 * Math.cos(0.9), 24 * Math.sin(0.9));
    ctx.stroke();
    // arrow on bow
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(52, 0);
    ctx.stroke();
    // arrowhead
    ctx.fillStyle = '#c0c0c0';
    ctx.beginPath();
    ctx.moveTo(56, 0);
    ctx.lineTo(48, -4);
    ctx.lineTo(48, 4);
    ctx.closePath();
    ctx.fill();
    // fletching
    ctx.fillStyle = '#cc3333';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(6, -4);
    ctx.lineTo(8, 0);
    ctx.lineTo(6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // quiver on back
    ctx.fillStyle = '#5a3a1a';
    ctx.save();
    ctx.translate(-8, -2);
    ctx.rotate(-0.2);
    ctx.fillRect(-3, -12, 6, 24);
    ctx.restore();
    // arrows in quiver
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-10 + i * 2, -15 - i * 2);
      ctx.lineTo(-8 + i * 2, 5);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawPrincess(ctx) {
    const x = 30;
    const y = 400;
    const shake = this.princessShake > 0 ? (Math.sin(Date.now() / 50) * 3) : 0;

    ctx.save();
    ctx.translate(x + shake, y);

    // dress bottom (wide skirt)
    const grad = ctx.createLinearGradient(0, 5, 0, 45);
    grad.addColorStop(0, '#e84393');
    grad.addColorStop(1, '#c0276e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-8, 5);
    ctx.lineTo(8, 5);
    ctx.lineTo(18, 42);
    ctx.quadraticCurveTo(0, 48, -18, 42);
    ctx.closePath();
    ctx.fill();
    // dress folds
    ctx.strokeStyle = '#a0205a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, 10);
    ctx.quadraticCurveTo(-5, 28, -8, 42);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3, 10);
    ctx.quadraticCurveTo(6, 28, 10, 42);
    ctx.stroke();

    // dress lace trim
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-17, 40);
    for (let i = 0; i < 12; i++) {
      ctx.lineTo(-15 + i * 3, 40 + (i % 2 === 0 ? 3 : 0));
    }
    ctx.stroke();

    // shoes
    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    ctx.ellipse(-6, 44, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6, 44, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // bodice
    ctx.fillStyle = '#fd79a8';
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.lineTo(10, -8);
    ctx.lineTo(8, 8);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    // neckline
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.quadraticCurveTo(0, -3, 8, -8);
    ctx.lineTo(6, -6);
    ctx.quadraticCurveTo(0, -2, -6, -6);
    ctx.closePath();
    ctx.fill();

    // arms
    ctx.fillStyle = '#ffeaa7';
    if (this.princessShake > 0) {
      // hands up scared
      ctx.fillRect(-16, -10, 6, 14);
      ctx.fillRect(10, -10, 6, 14);
      ctx.fillStyle = '#ffeaa7';
      ctx.beginPath();
      ctx.arc(-13, -10, 4, 0, Math.PI * 2);
      ctx.arc(13, -10, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // arms down relaxed
      ctx.fillStyle = '#ffeaa7';
      ctx.fillRect(-15, -4, 5, 12);
      ctx.fillRect(10, -4, 5, 12);
    }

    // sleeve puffs
    ctx.fillStyle = '#fd79a8';
    ctx.beginPath();
    ctx.ellipse(-11, -6, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(11, -6, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // neck
    ctx.fillStyle = '#ffeaa7';
    ctx.fillRect(-3, -14, 6, 7);

    // head
    ctx.fillStyle = '#ffeaa7';
    ctx.beginPath();
    ctx.arc(0, -24, 13, 0, Math.PI * 2);
    ctx.fill();

    // hair back
    ctx.fillStyle = '#e8a020';
    ctx.beginPath();
    ctx.arc(0, -26, 14, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    // side hair
    ctx.beginPath();
    ctx.ellipse(-12, -16, 4, 16, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(12, -16, 4, 16, -0.15, 0, Math.PI * 2);
    ctx.fill();
    // bangs
    ctx.fillStyle = '#d4900a';
    ctx.beginPath();
    ctx.moveTo(-10, -30);
    ctx.quadraticCurveTo(-6, -22, -8, -18);
    ctx.lineTo(-4, -22);
    ctx.quadraticCurveTo(-2, -28, 0, -22);
    ctx.quadraticCurveTo(2, -28, 4, -22);
    ctx.lineTo(8, -18);
    ctx.quadraticCurveTo(6, -22, 10, -30);
    ctx.arc(0, -26, 12, -0.3, Math.PI + 0.3, true);
    ctx.closePath();
    ctx.fill();

    // crown
    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    ctx.moveTo(-8, -35);
    ctx.lineTo(-6, -43);
    ctx.lineTo(-3, -37);
    ctx.lineTo(0, -46);
    ctx.lineTo(3, -37);
    ctx.lineTo(6, -43);
    ctx.lineTo(8, -35);
    ctx.closePath();
    ctx.fill();
    // crown gems
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(0, -40, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(-5, -38, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5, -38, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // crown base
    ctx.fillStyle = '#b8860b';
    ctx.fillRect(-8, -35, 16, 3);

    // face
    ctx.fillStyle = '#0a0a0a';
    if (this.princessShake > 0) {
      // scared eyes (wide open)
      ctx.beginPath();
      ctx.ellipse(-4, -25, 3, 4, 0, 0, Math.PI * 2);
      ctx.ellipse(4, -25, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-4, -25, 2, 0, Math.PI * 2);
      ctx.arc(4, -25, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a6fa5';
      ctx.beginPath();
      ctx.arc(-4, -24, 1.5, 0, Math.PI * 2);
      ctx.arc(4, -24, 1.5, 0, Math.PI * 2);
      ctx.fill();
      // eyebrows (worried)
      ctx.strokeStyle = '#c88a10';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-7, -31);
      ctx.lineTo(-2, -29);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2, -29);
      ctx.lineTo(7, -31);
      ctx.stroke();
      // open mouth
      ctx.fillStyle = '#c0276e';
      ctx.beginPath();
      ctx.ellipse(0, -17, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // normal eyes
      ctx.fillStyle = '#4a6fa5';
      ctx.beginPath();
      ctx.ellipse(-4, -25, 2.5, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(4, -25, 2.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(-4, -25, 1.5, 0, Math.PI * 2);
      ctx.arc(4, -25, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-3, -26, 0.8, 0, Math.PI * 2);
      ctx.arc(5, -26, 0.8, 0, Math.PI * 2);
      ctx.fill();
      // eyelashes
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-7, -26);
      ctx.lineTo(-6, -28);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(7, -26);
      ctx.lineTo(6, -28);
      ctx.stroke();
      // blush
      ctx.fillStyle = 'rgba(253, 121, 168, 0.4)';
      ctx.beginPath();
      ctx.ellipse(-8, -22, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(8, -22, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // smile
      ctx.strokeStyle = '#c0276e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -20, 4, 0.3, Math.PI - 0.3);
      ctx.stroke();
    }

    // nose
    ctx.strokeStyle = '#d8b080';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -23);
    ctx.lineTo(-1, -20);
    ctx.stroke();

    ctx.restore();
  }

  _drawArrows(ctx) {
    for (const arrow of this.arrows) {
      if (!arrow.alive) continue;
      const dx = arrow.targetX - arrow.x;
      const dy = arrow.targetY - arrow.y;
      const angle = Math.atan2(dy, dx);

      ctx.save();
      ctx.translate(arrow.x, arrow.y);
      ctx.rotate(angle);

      // arrow shaft
      ctx.strokeStyle = '#d4a017';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();

      // arrowhead
      ctx.fillStyle = '#d4a017';
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(9, -3);
      ctx.lineTo(9, 3);
      ctx.closePath();
      ctx.fill();

      // fletching
      ctx.fillStyle = '#cc3333';
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-16, -3);
      ctx.lineTo(-14, 0);
      ctx.lineTo(-16, 3);
      ctx.closePath();
      ctx.fill();

      // trail glow
      ctx.shadowColor = '#d4a017';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(212, 160, 23, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-25, 0);
      ctx.stroke();

      ctx.restore();
    }
  }

  _drawHUD(ctx, w) {
    ctx.fillStyle = 'rgba(10, 20, 10, 0.85)';
    ctx.fillRect(0, 0, w, 35);

    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    ctx.textBaseline = 'middle';

    ctx.textAlign = 'left';
    ctx.fillStyle = '#d4a017';
    ctx.fillText('TYPE DEFENSE', 15, 18);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#d4dcc4';
    ctx.fillText(`Wave ${this.currentWave}/${this.totalWaves}`, w / 2, 18);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#d4a017';
    ctx.fillText(`SCORE ${this.score.toLocaleString()}`, w - 15, 18);

    if (this.combo >= 3) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#cc3333';
      ctx.font = "bold 14px 'Segoe UI', sans-serif";
      ctx.fillText(`${this.combo} COMBO`, 200, 18);
    }
  }

  _drawInputArea(ctx, w, h) {
    const areaY = h - 110;
    ctx.fillStyle = 'rgba(10, 20, 10, 0.9)';
    ctx.fillRect(0, areaY, w, 110);
    ctx.strokeStyle = '#1e3020';
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
      ctx.fillStyle = '#7a8a6a';
      ctx.fillText(`TARGET: ${enemy.def.name}`, 20, areaY + 25);

      if (enemy.maxHp > 1) {
        ctx.fillStyle = '#5a6a4a';
        ctx.fillText(`HP ${enemy.hp}/${enemy.maxHp}`, 200, areaY + 25);
      }

      ctx.font = "bold 28px 'Segoe UI', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d4dcc4';
      ctx.fillText(enemy.currentWord, w / 2, areaY + 55);

      const display = romaji.displayRomaji;
      const confirmed = romaji.confirmed;
      const remaining = display.slice(confirmed.length);

      ctx.font = "bold 22px 'Courier New', monospace";
      const fullW = ctx.measureText(display).width;
      const startX = w / 2 - fullW / 2;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#5cb85c';
      ctx.fillText(confirmed, startX, areaY + 88);

      const confW = ctx.measureText(confirmed).width;
      ctx.fillStyle = '#3a4a3a';
      ctx.fillText(remaining, startX + confW, areaY + 88);

      ctx.fillStyle = '#5cb85c';
      ctx.fillRect(startX + confW, areaY + 92, 2, 4);
    } else if (this._pendingBuffer) {
      ctx.font = "bold 22px 'Courier New', monospace";
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d4a017';
      ctx.fillText(this._pendingBuffer + '_', w / 2, areaY + 55);
      ctx.font = "14px 'Segoe UI', sans-serif";
      ctx.fillStyle = '#5a6a4a';
      ctx.fillText('入力中... 候補を絞り込んでいます', w / 2, areaY + 85);
    } else {
      ctx.font = "16px 'Segoe UI', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = '#3a4a3a';
      ctx.fillText('タイピングで敵を撃破！', w / 2, areaY + 55);
    }

    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.textAlign = 'right';
    ctx.fillStyle = '#5a6a4a';
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
