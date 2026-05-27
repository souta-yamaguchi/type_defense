class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  _ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  _playTone(freq, duration, type = 'square', volume = 0.15) {
    if (!this.enabled) return;
    this._ensure();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  keyCorrect() {
    this._playTone(880, 0.08, 'square', 0.08);
  }

  keyMiss() {
    this._playTone(150, 0.15, 'sawtooth', 0.12);
  }

  enemyKill() {
    this._playTone(523, 0.1, 'square', 0.12);
    setTimeout(() => this._playTone(659, 0.1, 'square', 0.12), 50);
    setTimeout(() => this._playTone(784, 0.15, 'square', 0.12), 100);
  }

  bossKill() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => {
      setTimeout(() => this._playTone(n, 0.2, 'square', 0.15), i * 80);
    });
  }

  wallHit() {
    this._playTone(100, 0.3, 'sawtooth', 0.2);
    this._playTone(80, 0.4, 'sine', 0.15);
  }

  waveStart() {
    this._playTone(440, 0.15, 'sine', 0.12);
    setTimeout(() => this._playTone(660, 0.2, 'sine', 0.12), 150);
  }

  bossWarning() {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this._playTone(200, 0.3, 'sawtooth', 0.18);
      }, i * 350);
    }
  }

  victory() {
    const melody = [523, 659, 784, 1047, 784, 1047];
    melody.forEach((n, i) => {
      setTimeout(() => this._playTone(n, 0.25, 'sine', 0.15), i * 120);
    });
  }

  gameOver() {
    const notes = [400, 350, 300, 200];
    notes.forEach((n, i) => {
      setTimeout(() => this._playTone(n, 0.35, 'sine', 0.15), i * 200);
    });
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

window.AudioManager = AudioManager;
