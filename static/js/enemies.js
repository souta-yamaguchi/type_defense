const ENEMY_TYPES = {
  slime: {
    name: 'スライム',
    color: '#4ade80',
    glowColor: '#22c55e',
    hp: 1,
    speed: 0.7,
    wordLength: [4, 5],
    size: 28,
    score: 100,
    draw(ctx, x, y, size, hp, maxHp) {
      const s = size;
      ctx.save();
      ctx.shadowColor = this.glowColor;
      ctx.shadowBlur = 8;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.15, s * 0.5, s * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y - s * 0.05, s * 0.4, s * 0.3, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - s * 0.12, y - s * 0.05, s * 0.08, 0, Math.PI * 2);
      ctx.arc(x + s * 0.12, y - s * 0.05, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(x - s * 0.12, y - s * 0.03, s * 0.04, 0, Math.PI * 2);
      ctx.arc(x + s * 0.12, y - s * 0.03, s * 0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  bat: {
    name: 'コウモリ',
    color: '#a855f7',
    glowColor: '#9333ea',
    hp: 1,
    speed: 1.2,
    wordLength: [5, 6],
    size: 30,
    score: 150,
    draw(ctx, x, y, size, hp, maxHp) {
      const s = size;
      const wingFlap = Math.sin(Date.now() / 150) * 0.3;
      ctx.save();
      ctx.shadowColor = this.glowColor;
      ctx.shadowBlur = 8;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.2, s * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.15, y - s * 0.05);
      ctx.quadraticCurveTo(x - s * 0.5, y - s * (0.4 + wingFlap), x - s * 0.55, y + s * 0.1);
      ctx.quadraticCurveTo(x - s * 0.35, y - s * 0.05, x - s * 0.15, y + s * 0.05);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + s * 0.15, y - s * 0.05);
      ctx.quadraticCurveTo(x + s * 0.5, y - s * (0.4 + wingFlap), x + s * 0.55, y + s * 0.1);
      ctx.quadraticCurveTo(x + s * 0.35, y - s * 0.05, x + s * 0.15, y + s * 0.05);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(x - s * 0.07, y - s * 0.06, s * 0.04, 0, Math.PI * 2);
      ctx.arc(x + s * 0.07, y - s * 0.06, s * 0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  wolf: {
    name: 'オオカミ',
    color: '#94a3b8',
    glowColor: '#64748b',
    hp: 1,
    speed: 0.85,
    wordLength: [7, 9],
    size: 34,
    score: 200,
    draw(ctx, x, y, size, hp, maxHp) {
      const s = size;
      ctx.save();
      ctx.shadowColor = this.glowColor;
      ctx.shadowBlur = 8;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.05, s * 0.35, s * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - s * 0.25, y - s * 0.05, s * 0.18, s * 0.2, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.35, y - s * 0.2);
      ctx.lineTo(x - s * 0.25, y - s * 0.45);
      ctx.lineTo(x - s * 0.15, y - s * 0.18);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.15, y - s * 0.22);
      ctx.lineTo(x - s * 0.08, y - s * 0.42);
      ctx.lineTo(x - s * 0.0, y - s * 0.18);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(x - s * 0.3, y - s * 0.1, s * 0.05, 0, Math.PI * 2);
      ctx.arc(x - s * 0.18, y - s * 0.1, s * 0.05, 0, Math.PI * 2);
      ctx.fill();
      if (hp < maxHp) {
        drawHpBar(ctx, x, y - s * 0.55, s * 0.7, hp, maxHp);
      }
      ctx.restore();
    }
  },
  dragon: {
    name: 'ドラゴン',
    color: '#ef4444',
    glowColor: '#dc2626',
    hp: 1,
    speed: 0.55,
    wordLength: [9, 12],
    size: 40,
    score: 350,
    draw(ctx, x, y, size, hp, maxHp) {
      const s = size;
      ctx.save();
      ctx.shadowColor = this.glowColor;
      ctx.shadowBlur = 12;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.35, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - s * 0.2, y - s * 0.2, s * 0.2, s * 0.18, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(x - s * 0.3, y - s * 0.3);
      ctx.lineTo(x - s * 0.15, y - s * 0.6);
      ctx.lineTo(x - s * 0.1, y - s * 0.28);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.15, y - s * 0.33);
      ctx.lineTo(x - s * 0.02, y - s * 0.55);
      ctx.lineTo(x + s * 0.02, y - s * 0.28);
      ctx.fill();
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.15, y - s * 0.1);
      ctx.quadraticCurveTo(x + s * 0.55, y - s * 0.35, x + s * 0.5, y + s * 0.15);
      ctx.quadraticCurveTo(x + s * 0.4, y + s * 0.0, x + s * 0.15, y + s * 0.05);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(x - s * 0.26, y - s * 0.25, s * 0.055, 0, Math.PI * 2);
      ctx.arc(x - s * 0.12, y - s * 0.25, s * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.ellipse(x - s * 0.26, y - s * 0.24, s * 0.025, s * 0.04, 0, 0, Math.PI * 2);
      ctx.ellipse(x - s * 0.12, y - s * 0.24, s * 0.025, s * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
      drawHpBar(ctx, x, y - s * 0.65, s * 0.8, hp, maxHp);
      ctx.restore();
    }
  },
  boss: {
    name: 'ボス',
    color: '#f59e0b',
    glowColor: '#d97706',
    hp: 1,
    speed: 0.45,
    wordLength: [11, 14],
    size: 50,
    score: 500,
    draw(ctx, x, y, size, hp, maxHp) {
      const s = size;
      const pulse = 1 + Math.sin(Date.now() / 300) * 0.05;
      ctx.save();
      ctx.shadowColor = this.glowColor;
      ctx.shadowBlur = 20;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.4 * pulse, s * 0.35 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.ellipse(x, y - s * 0.15, s * 0.25, s * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      const crownPoints = [
        [-0.2, -0.3], [-0.15, -0.5], [-0.05, -0.35],
        [0, -0.55], [0.05, -0.35], [0.15, -0.5], [0.2, -0.3]
      ];
      ctx.beginPath();
      ctx.moveTo(x + crownPoints[0][0] * s, y + crownPoints[0][1] * s);
      for (let i = 1; i < crownPoints.length; i++) {
        ctx.lineTo(x + crownPoints[i][0] * s, y + crownPoints[i][1] * s);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - s * 0.1, y - s * 0.12, s * 0.07, 0, Math.PI * 2);
      ctx.arc(x + s * 0.1, y - s * 0.12, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(x - s * 0.1, y - s * 0.1, s * 0.04, 0, Math.PI * 2);
      ctx.arc(x + s * 0.1, y - s * 0.1, s * 0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.08, s * 0.12, s * 0.06, 0, 0, Math.PI);
      ctx.fill();
      drawHpBar(ctx, x, y - s * 0.7, s, hp, maxHp);
      ctx.restore();
    }
  }
};

function drawHpBar(ctx, x, y, width, hp, maxHp) {
  const barH = 6;
  const ratio = hp / maxHp;
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x - width / 2, y, width, barH);
  const hpColor = ratio > 0.5 ? '#4ade80' : ratio > 0.25 ? '#fbbf24' : '#ef4444';
  ctx.fillStyle = hpColor;
  ctx.fillRect(x - width / 2, y, width * ratio, barH);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - width / 2, y, width, barH);
}

const WAVE_CONFIGS = {
  easy: {
    waves: 5,
    wallHp: 5,
    speedMult: 1.0,
    generate(waveNum) {
      const enemies = [];
      const count = 3 + waveNum;
      for (let i = 0; i < count; i++) {
        if (waveNum >= 5 && i === count - 1) {
          enemies.push('boss');
        } else if (waveNum >= 3 && Math.random() < 0.4) {
          enemies.push('bat');
        } else if (waveNum >= 2 && Math.random() < 0.2) {
          enemies.push('wolf');
        } else {
          enemies.push('slime');
        }
      }
      return enemies;
    }
  },
  normal: {
    waves: 5,
    wallHp: 5,
    speedMult: 1.2,
    generate(waveNum) {
      const enemies = [];
      const count = 4 + Math.floor(waveNum * 1.0);
      for (let i = 0; i < count; i++) {
        if (waveNum === 5 && i === count - 1) {
          enemies.push('boss');
        } else if (waveNum >= 4 && Math.random() < 0.3) {
          enemies.push('dragon');
        } else if (waveNum >= 2 && Math.random() < 0.4) {
          enemies.push('wolf');
        } else if (Math.random() < 0.45) {
          enemies.push('bat');
        } else {
          enemies.push('slime');
        }
      }
      return enemies;
    }
  },
  hard: {
    waves: 5,
    wallHp: 5,
    speedMult: 1.5,
    generate(waveNum) {
      const enemies = [];
      const count = 5 + Math.floor(waveNum * 0.9);
      for (let i = 0; i < count; i++) {
        if (waveNum === 5 && i === count - 1) {
          enemies.push('boss');
        } else if (waveNum >= 3 && Math.random() < 0.4) {
          enemies.push('dragon');
        } else if (waveNum >= 2 && Math.random() < 0.45) {
          enemies.push('wolf');
        } else if (Math.random() < 0.4) {
          enemies.push('bat');
        } else {
          enemies.push('slime');
        }
      }
      return enemies;
    }
  }
};

window.ENEMY_TYPES = ENEMY_TYPES;
window.WAVE_CONFIGS = WAVE_CONFIGS;
