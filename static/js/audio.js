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

  // ---- BGM: ambient dungeon drone ----
  startBGM() {
    if (!this.enabled || this.bgmPlaying) return;
    this._ensure();
    this.bgmPlaying = true;
    const now = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.045, now + 2.0); // fade in
    masterGain.connect(this.ctx.destination);
    this.bgmMaster = masterGain;
    this.bgmOscs = [];

    // Low fundamental drone (A1)
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;
    osc1.connect(masterGain);
    osc1.start();
    this.bgmOscs.push(osc1);

    // Detuned octave for depth
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 110;
    osc2.detune.value = -8;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.55;
    osc2.connect(g2).connect(masterGain);
    osc2.start();
    this.bgmOscs.push(osc2);

    // Pad (fifth above)
    const osc3 = this.ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = 165; // E3
    osc3.detune.value = 10;
    const g3 = this.ctx.createGain();
    g3.gain.value = 0.3;
    osc3.connect(g3).connect(masterGain);
    osc3.start();
    this.bgmOscs.push(osc3);

    // Slow LFO on fundamental for breathing motion
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08; // very slow
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 1.5;
    lfo.connect(lfoGain).connect(osc1.frequency);
    lfo.start();
    this.bgmOscs.push(lfo);
  }

  stopBGM() {
    if (!this.bgmPlaying) return;
    this.bgmPlaying = false;
    const now = this.ctx.currentTime;
    try {
      this.bgmMaster.gain.cancelScheduledValues(now);
      this.bgmMaster.gain.setValueAtTime(this.bgmMaster.gain.value, now);
      this.bgmMaster.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    } catch (e) {}
    setTimeout(() => {
      for (const o of this.bgmOscs) {
        try { o.stop(); } catch (e) {}
      }
      this.bgmOscs = [];
    }, 1300);
  }
}

window.AudioManager = AudioManager;
