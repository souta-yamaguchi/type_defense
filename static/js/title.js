// Title-screen live 3D cave background for CAVE STRIKE.
// Self-contained: builds its own lightweight Three.js scene (tunnel + torches +
// embers + dust + fog + bloom) and slowly drifts the camera. Never touches the
// Game class. Created/destroyed by main.js's showScreen() so only one WebGL
// context exists at a time (title OR game, never both).
class TitleBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.rafId = null;
    this.lastTime = 0;
    this.torches = [];
    this.embers = [];
    this.dustMotes = [];
    this._textures = [];
    this._setupThree();
    this._buildScene();
    this._boundResize = () => this._onResize();
    this._boundVis = () => { if (document.hidden) this.pause(); else this.resume(); };
    window.addEventListener('resize', this._boundResize);
    document.addEventListener('visibilitychange', this._boundVis);
    this.start();
  }

  _setupThree() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05030a);
    this.scene.fog = new THREE.Fog(0x0a0408, 6, 40);

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.1, 100);
    this.camera.position.set(0, 1.6, -1.5);
    this.camera.rotation.order = 'YXZ';

    this._mobile = window.innerWidth < 768;
    if (!this._mobile && window.EffectComposer && window.RenderPass && window.UnrealBloomPass) {
      this.composer = new window.EffectComposer(this.renderer);
      this.composer.setSize(w, h);
      this.composer.addPass(new window.RenderPass(this.scene, this.camera));
      this._bloomPass = new window.UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.6, 0.7);
      this.composer.addPass(this._bloomPass);
    }
  }

  _buildScene() {
    const scene = this.scene;
    const tunnelLen = 60;
    const tunnelW = 8;
    const tunnelH = 5;

    const floorTex = this._makeTexture(this._makeFloorCanvas(256), 6, 12);
    const ceilTex = this._makeTexture(this._makeRockCanvas(256), 4, 2);
    const wallTexL = this._makeTexture(this._makeRockCanvas(256), 6, 1);
    const wallTexR = this._makeTexture(this._makeRockCanvas(256), 6, 1);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(tunnelW, tunnelLen, 16, 32),
      new THREE.MeshStandardMaterial({ map: floorTex, color: 0x6a4a2a, roughness: 0.95, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -tunnelLen / 2 + 5);
    scene.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(tunnelW, tunnelLen, 8, 16),
      new THREE.MeshStandardMaterial({ map: ceilTex, color: 0x2a1a10, roughness: 1, metalness: 0 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, tunnelH, -tunnelLen / 2 + 5);
    scene.add(ceil);

    const leftWall = new THREE.Mesh(
      new THREE.PlaneGeometry(tunnelLen, tunnelH, 32, 4),
      new THREE.MeshStandardMaterial({ map: wallTexL, color: 0x5a3a22, roughness: 0.92, metalness: 0.02 })
    );
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-tunnelW / 2, tunnelH / 2, -tunnelLen / 2 + 5);
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(
      new THREE.PlaneGeometry(tunnelLen, tunnelH, 32, 4),
      new THREE.MeshStandardMaterial({ map: wallTexR, color: 0x5a3a22, roughness: 0.92, metalness: 0.02 })
    );
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(tunnelW / 2, tunnelH / 2, -tunnelLen / 2 + 5);
    scene.add(rightWall);

    const endCap = new THREE.Mesh(
      new THREE.PlaneGeometry(tunnelW, tunnelH),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    endCap.position.set(0, tunnelH / 2, -tunnelLen + 5);
    scene.add(endCap);

    // wood support beams for depth cues
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x2a1808, roughness: 1 });
    for (let z = -4; z > -32; z -= 7) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(tunnelW + 0.2, 0.3, 0.35), beamMat);
      beam.position.set(0, tunnelH - 0.15, z);
      scene.add(beam);
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, tunnelH, 0.35), beamMat);
        post.position.set(sx * (tunnelW / 2 - 0.18), tunnelH / 2, z);
        scene.add(post);
      }
    }

    scene.add(new THREE.AmbientLight(0x2a1830, 0.7));
    scene.add(new THREE.HemisphereLight(0x4a2a1a, 0x0a0408, 0.45));

    // torches — near side only (6)
    this._flameTex = this._makeFlameSprite();
    this._emberTex = this._makeEmberSprite();
    const torchZs = [-4, -11, -20];
    for (const z of torchZs) {
      for (const side of [-1, 1]) {
        this._addTorch(side * (tunnelW / 2 - 0.1), 2.7, z, side);
      }
    }

    this.emberGroup = new THREE.Group();
    scene.add(this.emberGroup);
    this._spawnDustField();
  }

  _makeTexture(canvas, repX, repY) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(repX, repY);
    this._textures.push(tex);
    return tex;
  }

  _makeRockCanvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2c1d10';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1200; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = 1 + Math.random() * 9;
      const v = Math.random();
      ctx.fillStyle = v < 0.3 ? '#0a0604' : v < 0.6 ? '#1a1008' : v < 0.85 ? '#4a3018' : '#6a4426';
      ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#080402'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 24; i++) {
      ctx.beginPath();
      let cx = Math.random() * size, cy = Math.random() * size;
      ctx.moveTo(cx, cy);
      const segs = 3 + Math.floor(Math.random() * 6);
      for (let j = 0; j < segs; j++) { cx += (Math.random() - 0.5) * 60; cy += (Math.random() - 0.5) * 60; ctx.lineTo(cx, cy); }
      ctx.stroke();
    }
    return c;
  }

  _makeFloorCanvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a2818';
    ctx.fillRect(0, 0, size, size);
    const stone = 64;
    for (let y = 0; y < size; y += stone) {
      const off = (y / stone) % 2 === 0 ? 0 : stone / 2;
      for (let x = -stone; x < size + stone; x += stone) {
        const sx = x + off + (Math.random() - 0.5) * 6, sy = y + (Math.random() - 0.5) * 6;
        const sw = stone - 4 + Math.random() * 4, sh = stone - 4 + Math.random() * 4;
        const g = ctx.createRadialGradient(sx + sw / 2 - 8, sy + sh / 2 - 8, 4, sx + sw / 2, sy + sh / 2, sw / 1.4);
        if (Math.random() < 0.5) { g.addColorStop(0, '#6a4828'); g.addColorStop(1, '#1c1208'); }
        else { g.addColorStop(0, '#5a3a22'); g.addColorStop(1, '#10080a'); }
        ctx.fillStyle = g; ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#0a0604'; ctx.lineWidth = 2.5; ctx.strokeRect(sx, sy, sw, sh);
      }
    }
    return c;
  }

  _makeFlameSprite() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size * 0.62, 2, size / 2, size * 0.5, size * 0.45);
    g.addColorStop(0.0, 'rgba(255,255,220,1)');
    g.addColorStop(0.15, 'rgba(255,230,140,1)');
    g.addColorStop(0.35, 'rgba(255,160,50,0.95)');
    g.addColorStop(0.6, 'rgba(220,80,20,0.6)');
    g.addColorStop(1.0, 'rgba(120,30,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c); this._textures.push(t); return t;
  }

  _makeEmberSprite() {
    const size = 32;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,230,150,1)');
    g.addColorStop(0.3, 'rgba(255,150,40,0.95)');
    g.addColorStop(0.7, 'rgba(220,80,20,0.5)');
    g.addColorStop(1, 'rgba(120,30,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c); this._textures.push(t); return t;
  }

  _addTorch(x, y, z, side) {
    const group = new THREE.Group();
    const bracketMat = new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 0.5, metalness: 0.8 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 1 }));
    handle.position.set(-side * 0.34, 0.06, 0); handle.rotation.z = side * Math.PI / 2.6;
    group.add(handle);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.08, 10), bracketMat);
    cup.position.set(-side * 0.5, 0.18, 0); cup.rotation.z = side * Math.PI / 12;
    group.add(cup);

    const mk = (color, op, sx, sy, dz) => {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._flameTex, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.set(-side * 0.5, 0.45, dz); m.scale.set(sx, sy, 1); group.add(m); return m;
    };
    const flame = mk(0xffa030, 1.0, 0.6, 0.9, 0);
    const flameInner = mk(0xffe080, 0.95, 0.35, 0.55, 0);
    flameInner.position.y = 0.4;
    const halo = mk(0xff6020, 0.5, 1.4, 1.4, -0.05);

    const light = new THREE.PointLight(0xff9030, 6.5, 22, 1.4);
    light.position.set(-side * 0.5, 0.45, 0);
    group.add(light);

    group.position.set(x, y, z);
    this.scene.add(group);
    this.torches.push({ group, flame, flameInner, halo, light, side, baseScale: { o: 0.6, i: 0.35, h: 1.4 }, baseIntensity: 6.5, time: Math.random() * 100 });
  }

  _animateTorches(dt) {
    for (const tt of this.torches) {
      tt.time += dt;
      const flick = 1.0 + Math.sin(tt.time * 12) * 0.08 + Math.sin(tt.time * 27 + 1.4) * 0.05 + (Math.random() - 0.5) * 0.12;
      tt.light.intensity = tt.baseIntensity * Math.max(0.6, flick);
      const sH = 0.9 + Math.sin(tt.time * 10) * 0.12 + Math.random() * 0.05;
      const sW = 0.95 + Math.cos(tt.time * 13) * 0.08;
      tt.flame.scale.set(tt.baseScale.o * sW, tt.baseScale.o * 1.5 * sH, 1);
      tt.flameInner.scale.set(tt.baseScale.i * sW * 0.95, tt.baseScale.i * 1.6 * sH, 1);
      tt.halo.scale.set(tt.baseScale.h * (0.9 + Math.random() * 0.2), tt.baseScale.h * (0.95 + Math.random() * 0.15), 1);
      tt.halo.material.opacity = 0.4 + Math.random() * 0.2;
    }
  }

  _spawnEmber(torch) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._emberTex, color: 0xffb050, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(0.06, 0.06, 1);
    s.position.set(
      torch.group.position.x - torch.side * 0.5 + (Math.random() - 0.5) * 0.05,
      torch.group.position.y + 0.5,
      torch.group.position.z + (Math.random() - 0.5) * 0.05
    );
    this.emberGroup.add(s);
    this.embers.push({ sprite: s, vx: (Math.random() - 0.5) * 0.4, vy: 0.6 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.4, life: 0, maxLife: 1.2 + Math.random() });
  }

  _updateEmbers(dt) {
    if (this.embers.length < 40) {
      for (const t of this.torches) if (Math.random() < 0.08) this._spawnEmber(t);
    }
    const keep = [];
    for (const em of this.embers) {
      em.life += dt;
      if (em.life >= em.maxLife) { this.emberGroup.remove(em.sprite); em.sprite.material.dispose(); continue; }
      em.sprite.position.x += em.vx * dt; em.sprite.position.y += em.vy * dt; em.sprite.position.z += em.vz * dt;
      em.vy += dt * 0.3; em.vx *= 0.96; em.vz *= 0.96;
      const t = em.life / em.maxLife;
      em.sprite.material.opacity = 0.95 * (1 - t);
      em.sprite.scale.setScalar(0.06 + t * 0.04);
      keep.push(em);
    }
    this.embers = keep;
  }

  _spawnDustField() {
    const size = 16;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,220,180,0.9)'); g.addColorStop(0.5, 'rgba(255,200,130,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    this._dustTex = new THREE.CanvasTexture(c); this._textures.push(this._dustTex);
    this.dustGroup = new THREE.Group();
    this.scene.add(this.dustGroup);
    for (let i = 0; i < 30; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._dustTex, color: 0xfff0d0, transparent: true, opacity: 0.25 + Math.random() * 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.set(0.04, 0.04, 1);
      s.position.set((Math.random() - 0.5) * 7, 0.5 + Math.random() * 4, -2 - Math.random() * 32);
      this.dustGroup.add(s);
      this.dustMotes.push({ sprite: s, vy: 0.04 + Math.random() * 0.08, vx: (Math.random() - 0.5) * 0.03, phase: Math.random() * Math.PI * 2 });
    }
  }

  _updateDust(dt, t) {
    for (const m of this.dustMotes) {
      m.sprite.position.y += m.vy * dt;
      m.sprite.position.x += m.vx * dt + Math.sin(t * 0.5 + m.phase) * dt * 0.02;
      if (m.sprite.position.y > 4.8) { m.sprite.position.y = 0.3; m.sprite.position.x = (Math.random() - 0.5) * 7; m.sprite.position.z = -2 - Math.random() * 32; }
    }
  }

  _updateCamera(t) {
    this.camera.position.set(
      Math.sin(t * 0.04) * 0.3,
      1.6 + Math.sin(t * 0.5) * 0.03,
      -1.5 + Math.sin(t * 0.06) * 1.5
    );
    this.camera.rotation.set(Math.sin(t * 0.037) * 0.03, Math.sin(t * 0.05) * 0.06, 0);
  }

  _loop(time) {
    if (!this.running) return;
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.05) : 0.016;
    this.lastTime = time;
    const t = time / 1000;
    this._animateTorches(dt);
    this._updateEmbers(dt);
    this._updateDust(dt, t);
    this._updateCamera(t);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this._loop.bind(this));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = 0;
    this.rafId = requestAnimationFrame(this._loop.bind(this));
  }

  pause() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  resume() {
    if (this.running || !this.renderer) return;
    this.start();
  }

  _onResize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = w; this.canvas.height = h;
    this.renderer.setSize(w, h, false);
    if (this.composer) this.composer.setSize(w, h);
    if (this._bloomPass) this._bloomPass.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    window.removeEventListener('resize', this._boundResize);
    document.removeEventListener('visibilitychange', this._boundVis);
    if (this.scene) {
      this.scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m.map) m.map.dispose();
            m.dispose();
          }
        }
      });
    }
    for (const tex of this._textures) tex.dispose();
    this._textures = [];
    if (this.composer && this.composer.dispose) this.composer.dispose();
    if (this.renderer) {
      // dispose() only — NOT forceContextLoss(). The title reuses the same
      // <canvas> on every show, and forceContextLoss permanently kills that
      // canvas's GL context, breaking the next renderer. game.js's destroy()
      // uses the same dispose-only approach and re-inits fine.
      this.renderer.dispose();
    }
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.composer = null;
  }
}

window.TitleBackground = TitleBackground;
