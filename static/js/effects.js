class Particle {
  constructor(x, y, color, vx, vy, life, size) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 80 * dt;
    this.life -= dt;
  }

  get alpha() {
    return Math.max(0, this.life / this.maxLife);
  }

  get alive() {
    return this.life > 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * this.alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class FloatingText {
  constructor(x, y, text, color, size) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.size = size || 20;
    this.life = 1.0;
    this.maxLife = 1.0;
    this.vy = -60;
  }

  update(dt) {
    this.y += this.vy * dt;
    this.vy *= 0.95;
    this.life -= dt;
  }

  get alpha() {
    return Math.max(0, this.life / this.maxLife);
  }

  get alive() {
    return this.life > 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.font = `bold ${this.size}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

class EffectsManager {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.screenShake = 0;
    this.flashAlpha = 0;
    this.flashColor = '#ef4444';
    this.warningAlpha = 0;
    this.warningText = '';
    this.waveClearAlpha = 0;
    this.waveClearText = '';
  }

  explode(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 80 + Math.random() * 120;
      this.particles.push(new Particle(
        x, y, color,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 30,
        0.6 + Math.random() * 0.4,
        3 + Math.random() * 3
      ));
    }
  }

  bossExplode(x, y) {
    const colors = ['#f59e0b', '#ef4444', '#f97316', '#fbbf24', '#fff'];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 200;
      this.particles.push(new Particle(
        x, y, colors[Math.floor(Math.random() * colors.length)],
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 50,
        0.8 + Math.random() * 0.6,
        3 + Math.random() * 5
      ));
    }
  }

  addScoreText(x, y, score) {
    this.texts.push(new FloatingText(x, y, `+${score}`, '#fbbf24', 22));
  }

  addComboText(x, y, combo) {
    this.texts.push(new FloatingText(x, y - 25, `${combo} COMBO!`, '#f97316', 26));
  }

  triggerShake(intensity = 5) {
    this.screenShake = intensity;
  }

  triggerFlash(color = '#ef4444') {
    this.flashAlpha = 0.3;
    this.flashColor = color;
  }

  triggerWarning(text = 'WARNING') {
    this.warningAlpha = 3.0;
    this.warningText = text;
    // suppress any lingering wave-clear text so they don't overlap
    this.waveClearAlpha = 0;
    this.waveClearText = '';
  }

  triggerWaveClear(waveNum) {
    this.waveClearAlpha = 2.5;
    this.waveClearText = `WAVE ${waveNum} CLEAR!`;
  }

  triggerVictory() {
    this.waveClearAlpha = 4.0;
    this.waveClearText = 'VICTORY!';
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const x = 200 + Math.random() * 600;
        const y = 100 + Math.random() * 300;
        this.bossExplode(x, y);
      }, i * 300);
    }
  }

  update(dt) {
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter(p => p.alive);
    if (this.particles.length > 200) {
      this.particles = this.particles.slice(-200);
    }
    for (const t of this.texts) t.update(dt);
    this.texts = this.texts.filter(t => t.alive);
    if (this.screenShake > 0) this.screenShake *= 0.85;
    if (this.screenShake < 0.1) this.screenShake = 0;
    if (this.flashAlpha > 0) this.flashAlpha -= dt * 2;
    if (this.warningAlpha > 0) this.warningAlpha -= dt;
    if (this.waveClearAlpha > 0) this.waveClearAlpha -= dt;
  }

  draw(ctx, canvas) {
    for (const p of this.particles) p.draw(ctx);
    for (const t of this.texts) t.draw(ctx);

    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    if (this.warningAlpha > 0) {
      ctx.save();
      const a = Math.min(1, this.warningAlpha);
      ctx.globalAlpha = a * (0.5 + Math.sin(Date.now() / 100) * 0.3);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ef4444';
      ctx.font = `bold 72px 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 30;
      ctx.fillText(this.warningText, canvas.width / 2, canvas.height / 2 - 50);
      ctx.font = `bold 28px 'Segoe UI', sans-serif`;
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 15;
      ctx.fillText('BOSS APPROACHING...', canvas.width / 2, canvas.height / 2 + 20);
      ctx.restore();
    }

    if (this.waveClearAlpha > 0) {
      ctx.save();
      const a = Math.min(1, this.waveClearAlpha);
      ctx.globalAlpha = a;
      ctx.fillStyle = this.waveClearText === 'VICTORY!' ? '#fbbf24' : '#4ade80';
      ctx.font = `bold 56px 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 25;
      ctx.fillText(this.waveClearText, canvas.width / 2, canvas.height / 2 - 30);
      ctx.restore();
    }
  }

  getShakeOffset() {
    if (this.screenShake <= 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * this.screenShake * 2,
      y: (Math.random() - 0.5) * this.screenShake * 2
    };
  }
}

window.EffectsManager = EffectsManager;
