// 3D scene units. enemy.x (logical 100..1050) maps to world z (-1..-50).
const Z_WALL = -1.0;
const Z_FAR = -50.0;
const LANE_HALF = 2.5;

function logicalToWorld(enemy) {
  const t = Math.max(0, Math.min(1.4, (enemy.x - 100) / 950));
  const z = Z_WALL + (Z_FAR - Z_WALL) * t;
  const x = (enemy.y - 250) / 170 * LANE_HALF;
  return { x, z };
}

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
    this.mesh = null;
    this.bobOffset = Math.random() * Math.PI * 2;
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
  constructor(canvas3d, canvas2d, difficulty, words, onGameEnd) {
    this.canvas3d = canvas3d;
    this.canvas2d = canvas2d;
    this.ctx2d = canvas2d.getContext('2d');
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
    this.cameraShake = 0;

    this._setupThree();
    this._buildScene();

    this._boundKeyHandler = this._onKey.bind(this);
    this._boundClickHandler = this._onClick.bind(this);
    document.addEventListener('keydown', this._boundKeyHandler);
    canvas3d.addEventListener('click', this._boundClickHandler);

    this._startWave();
    requestAnimationFrame(this._loop.bind(this));
  }

  _setupThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas3d, antialias: true });
    this.renderer.setSize(1000, 600, false);
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05030a);
    this.scene.fog = new THREE.Fog(0x0a0408, 8, 40);

    this.camera = new THREE.PerspectiveCamera(62, 1000 / 600, 0.1, 100);
    this.camera.position.set(0, 1.5, 1.2);
    this.camera.lookAt(0, 1.3, -5);
  }

  _buildScene() {
    const scene = this.scene;

    // ---- TEXTURES ----
    const rockTex = this._makeRockTexture(512);
    rockTex.repeat.set(4, 2);
    const floorTex = this._makeFloorTexture(512);
    floorTex.repeat.set(6, 12);

    // ---- TUNNEL GEOMETRY ----
    const tunnelLen = 60;
    const tunnelW = 8;
    const tunnelH = 5;

    // floor
    const floorGeo = new THREE.PlaneGeometry(tunnelW, tunnelLen);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      color: 0x6a4a2a,
      roughness: 0.95,
      metalness: 0.05
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -tunnelLen / 2 + 5);
    scene.add(floor);

    // ceiling
    const ceilGeo = new THREE.PlaneGeometry(tunnelW, tunnelLen);
    const ceilMat = new THREE.MeshStandardMaterial({
      map: rockTex,
      color: 0x2a1a10,
      roughness: 1,
      metalness: 0
    });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, tunnelH, -tunnelLen / 2 + 5);
    scene.add(ceil);

    // walls
    const wallGeo = new THREE.PlaneGeometry(tunnelLen, tunnelH);
    const wallMatL = new THREE.MeshStandardMaterial({
      map: this._makeRockTexture(512, 0.7),
      color: 0x5a3a22,
      roughness: 1,
      metalness: 0
    });
    wallMatL.map.repeat.set(6, 1);
    const leftWall = new THREE.Mesh(wallGeo, wallMatL);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-tunnelW / 2, tunnelH / 2, -tunnelLen / 2 + 5);
    scene.add(leftWall);

    const wallMatR = wallMatL.clone();
    wallMatR.map = this._makeRockTexture(512, 0.6);
    wallMatR.map.repeat.set(6, 1);
    const rightWall = new THREE.Mesh(wallGeo, wallMatR);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(tunnelW / 2, tunnelH / 2, -tunnelLen / 2 + 5);
    scene.add(rightWall);

    // tunnel end cap (far darkness)
    const endGeo = new THREE.PlaneGeometry(tunnelW, tunnelH);
    const endMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const endCap = new THREE.Mesh(endGeo, endMat);
    endCap.position.set(0, tunnelH / 2, -tunnelLen + 5);
    scene.add(endCap);

    // wood support beams (overhead, periodic)
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x2a1808, roughness: 1 });
    for (let z = -2; z > -tunnelLen + 5; z -= 6) {
      // horizontal beam
      const beamGeo = new THREE.BoxGeometry(tunnelW + 0.2, 0.3, 0.35);
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(0, tunnelH - 0.15, z);
      scene.add(beam);
      // vertical posts
      const postGeo = new THREE.BoxGeometry(0.35, tunnelH, 0.35);
      const post1 = new THREE.Mesh(postGeo, beamMat);
      post1.position.set(-tunnelW / 2 + 0.18, tunnelH / 2, z);
      scene.add(post1);
      const post2 = new THREE.Mesh(postGeo, beamMat);
      post2.position.set(tunnelW / 2 - 0.18, tunnelH / 2, z);
      scene.add(post2);
    }

    // scattered rocks on the floor
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1, flatShading: true });
    for (let i = 0; i < 30; i++) {
      const r = 0.08 + Math.random() * 0.18;
      const g = new THREE.DodecahedronGeometry(r, 0);
      const m = new THREE.Mesh(g, rockMat);
      m.position.set(
        (Math.random() - 0.5) * (tunnelW - 1),
        r * 0.3,
        -2 - Math.random() * (tunnelLen - 10)
      );
      m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(m);
    }

    // ---- LIGHTING ----
    const ambient = new THREE.AmbientLight(0x2a1830, 0.7);
    scene.add(ambient);

    // soft fill from above
    const fill = new THREE.HemisphereLight(0x4a2a1a, 0x0a0408, 0.45);
    scene.add(fill);

    // ---- TORCHES ----
    this.torches = [];
    const torchZs = [-3, -9, -15, -22, -30, -38];
    for (const z of torchZs) {
      for (const side of [-1, 1]) {
        const x = side * (tunnelW / 2 - 0.1);
        this._addTorch(x, 2.7, z, side);
      }
    }

    // ---- ENTITY GROUPS ----
    this.enemyGroup = new THREE.Group();
    scene.add(this.enemyGroup);
    this.arrowGroup = new THREE.Group();
    scene.add(this.arrowGroup);
  }

  _makeFlameSprite() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size * 0.62, 2, size / 2, size * 0.5, size * 0.45);
    g.addColorStop(0.0, 'rgba(255, 255, 220, 1)');
    g.addColorStop(0.15, 'rgba(255, 230, 140, 1)');
    g.addColorStop(0.35, 'rgba(255, 160, 50, 0.95)');
    g.addColorStop(0.6, 'rgba(220, 80, 20, 0.6)');
    g.addColorStop(1.0, 'rgba(120, 30, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  _addTorch(x, y, z, side) {
    if (!this._flameTex) this._flameTex = this._makeFlameSprite();
    const group = new THREE.Group();
    const bracketMat = new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 0.5, metalness: 0.8 });
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.35, 8), bracketMat);
    bracket.position.set(-side * 0.15, 0, 0);
    bracket.rotation.z = side * Math.PI / 2;
    group.add(bracket);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 8, 16), bracketMat);
    ring.position.set(0, 0, 0);
    ring.rotation.y = Math.PI / 2;
    group.add(ring);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 1 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.42, 10), handleMat);
    handle.position.set(-side * 0.34, 0.06, 0);
    handle.rotation.z = side * Math.PI / 2.6;
    group.add(handle);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.08, 10), bracketMat);
    cup.position.set(-side * 0.5, 0.18, 0);
    cup.rotation.z = side * Math.PI / 12;
    group.add(cup);

    const flameMat = new THREE.SpriteMaterial({
      map: this._flameTex, color: 0xffa030,
      transparent: true, opacity: 1.0, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const flame = new THREE.Sprite(flameMat);
    flame.position.set(-side * 0.5, 0.45, 0);
    flame.scale.set(0.6, 0.9, 1);
    group.add(flame);

    const flameInnerMat = new THREE.SpriteMaterial({
      map: this._flameTex, color: 0xffe080,
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const flameInner = new THREE.Sprite(flameInnerMat);
    flameInner.position.set(-side * 0.5, 0.4, 0);
    flameInner.scale.set(0.35, 0.55, 1);
    group.add(flameInner);

    const haloMat = new THREE.SpriteMaterial({
      map: this._flameTex, color: 0xff6020,
      transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const halo = new THREE.Sprite(haloMat);
    halo.position.set(-side * 0.5, 0.45, -0.05);
    halo.scale.set(1.4, 1.4, 1);
    group.add(halo);

    const light = new THREE.PointLight(0xff9030, 6.5, 22, 1.4);
    light.position.set(-side * 0.5, 0.45, 0);
    group.add(light);

    // wall scorch
    const scorchMat = new THREE.MeshBasicMaterial({ color: 0x0a0604, transparent: true, opacity: 0.55, depthWrite: false });
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), scorchMat);
    scorch.position.set(side * 0.04, 1.2, 0);
    scorch.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(scorch);

    group.position.set(x, y, z);
    this.scene.add(group);
    this.torches.push({
      group, flame, flameInner, halo, light, side,
      baseScale: { o: 0.6, i: 0.35, h: 1.4 },
      baseIntensity: 6.5,
      time: Math.random() * 100
    });
  }

  _animateTorches(dt) {
    for (const tt of this.torches) {
      tt.time += dt;
      const f1 = Math.sin(tt.time * 12) * 0.08;
      const f2 = Math.sin(tt.time * 27 + 1.4) * 0.05;
      const f3 = (Math.random() - 0.5) * 0.12;
      const flick = 1.0 + f1 + f2 + f3;
      tt.light.intensity = tt.baseIntensity * Math.max(0.6, flick);
      const sH = 0.9 + Math.sin(tt.time * 10) * 0.12 + Math.random() * 0.05;
      const sW = 0.95 + Math.cos(tt.time * 13) * 0.08;
      tt.flame.scale.set(tt.baseScale.o * sW, tt.baseScale.o * 1.5 * sH, 1);
      tt.flameInner.scale.set(tt.baseScale.i * sW * 0.95, tt.baseScale.i * 1.6 * sH, 1);
      tt.halo.scale.set(tt.baseScale.h * (0.9 + Math.random() * 0.2), tt.baseScale.h * (0.95 + Math.random() * 0.15), 1);
      tt.halo.material.opacity = 0.4 + Math.random() * 0.2;
    }
  }

  _makeRockTexture(size = 256, variant = 0) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2c1d10';
    ctx.fillRect(0, 0, size, size);
    // noise blobs
    for (let i = 0; i < 1600; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 1 + Math.random() * 9;
      const v = Math.random();
      const shade = v < 0.3 ? '#0a0604' : v < 0.6 ? '#1a1008' : v < 0.85 ? '#4a3018' : '#6a4426';
      ctx.fillStyle = shade;
      ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // cracks
    ctx.strokeStyle = '#080402';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 30; i++) {
      ctx.beginPath();
      let cx = Math.random() * size;
      let cy = Math.random() * size;
      ctx.moveTo(cx, cy);
      const segs = 3 + Math.floor(Math.random() * 6);
      for (let j = 0; j < segs; j++) {
        cx += (Math.random() - 0.5) * 60;
        cy += (Math.random() - 0.5) * 60;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    // larger boulders
    for (let i = 0; i < 6; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 20 + Math.random() * 40;
      const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 2, x, y, r);
      g.addColorStop(0, '#5a3a1e');
      g.addColorStop(0.6, '#3a2410');
      g.addColorStop(1, '#0a0604');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeFloorTexture(size = 512) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a2818';
    ctx.fillRect(0, 0, size, size);
    // cobblestones
    const stoneSize = 64;
    for (let y = 0; y < size; y += stoneSize) {
      const off = (y / stoneSize) % 2 === 0 ? 0 : stoneSize / 2;
      for (let x = -stoneSize; x < size + stoneSize; x += stoneSize) {
        const sx = x + off + (Math.random() - 0.5) * 6;
        const sy = y + (Math.random() - 0.5) * 6;
        const sw = stoneSize - 4 + Math.random() * 4;
        const sh = stoneSize - 4 + Math.random() * 4;
        const shade = Math.random();
        const g = ctx.createRadialGradient(sx + sw / 2 - 8, sy + sh / 2 - 8, 4, sx + sw / 2, sy + sh / 2, sw / 1.4);
        if (shade < 0.5) {
          g.addColorStop(0, '#6a4828');
          g.addColorStop(1, '#1c1208');
        } else {
          g.addColorStop(0, '#5a3a22');
          g.addColorStop(1, '#10080a');
        }
        ctx.fillStyle = g;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#0a0604';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(sx, sy, sw, sh);
      }
    }
    // dirt overlay
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(${20 + Math.random() * 60},${10 + Math.random() * 30},0,${0.1 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildEnemyMesh(enemy) {
    const t = enemy.type;
    const g = new THREE.Group();
    if (t === 'slime') {
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x4ade80, emissive: 0x10401a, emissiveIntensity: 0.5,
        roughness: 0.3, metalness: 0.1
      });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 20), bodyMat);
      body.scale.set(1.1, 0.85, 1.1);
      body.position.y = 0.38;
      g.add(body);
      // belly highlight
      const highlightMat = new THREE.MeshBasicMaterial({ color: 0x90f0b0, transparent: true, opacity: 0.4 });
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), highlightMat);
      hl.position.set(-0.15, 0.46, 0.3);
      g.add(hl);
      // eyes (raised on top so visible from camera looking down)
      const eyeWMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const eyeBMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
      for (const side of [-1, 1]) {
        const ew = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), eyeWMat);
        ew.position.set(side * 0.14, 0.56, 0.28);
        g.add(ew);
        const eb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), eyeBMat);
        eb.position.set(side * 0.14, 0.56, 0.36);
        g.add(eb);
        const ehl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        ehl.position.set(side * 0.14 + 0.015, 0.58, 0.4);
        g.add(ehl);
      }
      // mouth (smile, open)
      const mouthMat = new THREE.MeshBasicMaterial({ color: 0x102818 });
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), mouthMat);
      mouth.scale.set(1.3, 0.5, 0.5);
      mouth.position.set(0, 0.42, 0.38);
      g.add(mouth);
      g.userData.scale = 1.0;
    } else if (t === 'bat') {
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x6a30a0, emissive: 0x301050, emissiveIntensity: 0.5,
        roughness: 0.5, metalness: 0
      });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 14), bodyMat);
      body.scale.set(0.8, 1.1, 1.0);
      g.add(body);
      // wings
      const wingMat = new THREE.MeshStandardMaterial({
        color: 0x4a1f80, side: THREE.DoubleSide, roughness: 0.7
      });
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.quadraticCurveTo(0.5, 0.2, 0.8, -0.1);
      wingShape.lineTo(0.6, -0.2);
      wingShape.quadraticCurveTo(0.3, -0.05, 0, -0.15);
      wingShape.lineTo(0, 0);
      const wingGeo = new THREE.ShapeGeometry(wingShape);
      const wingL = new THREE.Mesh(wingGeo, wingMat);
      wingL.position.x = -0.18;
      wingL.scale.x = -1;
      g.add(wingL);
      const wingR = new THREE.Mesh(wingGeo, wingMat);
      wingR.position.x = 0.18;
      g.add(wingR);
      g.userData.wings = [wingL, wingR];
      // eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
      for (const side of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), eyeMat);
        e.position.set(side * 0.08, 0.05, 0.18);
        g.add(e);
      }
      // ears
      const earGeo = new THREE.ConeGeometry(0.06, 0.14, 6);
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.position.set(side * 0.1, 0.22, 0);
        g.add(ear);
      }
      g.userData.scale = 0.95;
    } else if (t === 'wolf') {
      const furMat = new THREE.MeshStandardMaterial({
        color: 0x7a8a98, emissive: 0x202830, emissiveIntensity: 0.35,
        roughness: 0.9, metalness: 0
      });
      // body
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 1.1), furMat);
      body.position.y = 0.55;
      g.add(body);
      // head
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), furMat);
      head.position.set(0, 0.7, 0.7);
      g.add(head);
      // snout
      const snoutMat = new THREE.MeshStandardMaterial({ color: 0x4a5060, roughness: 1 });
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.35), snoutMat);
      snout.position.set(0, 0.6, 1.0);
      g.add(snout);
      // ears
      const earGeo = new THREE.ConeGeometry(0.08, 0.2, 4);
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(earGeo, furMat);
        ear.position.set(side * 0.18, 1.0, 0.65);
        g.add(ear);
      }
      // legs
      const legGeo = new THREE.BoxGeometry(0.16, 0.4, 0.16);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, furMat);
        leg.position.set(sx * 0.22, 0.2, sz * 0.4);
        g.add(leg);
      }
      // eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
      for (const side of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat);
        e.position.set(side * 0.13, 0.78, 0.95);
        g.add(e);
      }
      g.userData.scale = 0.9;
    } else if (t === 'dragon') {
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xef4444, emissive: 0x601010, emissiveIntensity: 0.6,
        roughness: 0.4, metalness: 0.15
      });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 18), bodyMat);
      body.scale.set(1.0, 0.9, 1.3);
      body.position.y = 0.65;
      g.add(body);
      // head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 16), bodyMat);
      head.position.set(0, 0.85, 0.7);
      head.scale.set(0.9, 0.85, 1.1);
      g.add(head);
      // horns
      const hornMat = new THREE.MeshStandardMaterial({ color: 0x301008, roughness: 0.8 });
      const hornGeo = new THREE.ConeGeometry(0.07, 0.35, 6);
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(hornGeo, hornMat);
        horn.position.set(side * 0.15, 1.15, 0.65);
        horn.rotation.set(0.3, 0, side * -0.3);
        g.add(horn);
      }
      // wings
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x801010, roughness: 0.6, side: THREE.DoubleSide });
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.quadraticCurveTo(0.8, 0.5, 1.0, -0.1);
      wingShape.quadraticCurveTo(0.6, -0.3, 0.3, -0.1);
      wingShape.lineTo(0, 0);
      const wingGeo = new THREE.ShapeGeometry(wingShape);
      const wingL = new THREE.Mesh(wingGeo, wingMat);
      wingL.position.set(-0.4, 0.9, 0);
      wingL.scale.x = -1;
      g.add(wingL);
      const wingR = new THREE.Mesh(wingGeo, wingMat);
      wingR.position.set(0.4, 0.9, 0);
      g.add(wingR);
      g.userData.wings = [wingL, wingR];
      // eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
      for (const side of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), eyeMat);
        e.position.set(side * 0.13, 0.9, 0.95);
        g.add(e);
      }
      g.userData.scale = 1.1;
    } else if (t === 'boss') {
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b, emissive: 0x803010, emissiveIntensity: 0.8,
        roughness: 0.4, metalness: 0.25
      });
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 24), bodyMat);
      body.scale.set(1.1, 1.0, 1.1);
      body.position.y = 1.1;
      g.add(body);
      // crown
      const crownMat = new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0x804000, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.2 });
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI - Math.PI / 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 6), crownMat);
        spike.position.set(Math.sin(ang) * 0.7, 2.0, Math.cos(ang) * 0.7);
        spike.lookAt(spike.position.x * 2, spike.position.y + 1, spike.position.z * 2);
        g.add(spike);
      }
      const crownBase = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 8, 16), crownMat);
      crownBase.position.y = 1.85;
      crownBase.rotation.x = Math.PI / 2;
      g.add(crownBase);
      // eyes (large evil)
      const eyeWMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const eyeBMat = new THREE.MeshBasicMaterial({ color: 0xff0040 });
      for (const side of [-1, 1]) {
        const ew = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), eyeWMat);
        ew.position.set(side * 0.32, 1.3, 0.85);
        g.add(ew);
        const eb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), eyeBMat);
        eb.position.set(side * 0.32, 1.3, 0.96);
        g.add(eb);
      }
      // mouth (jagged smile)
      const mouthMat = new THREE.MeshBasicMaterial({ color: 0x301010 });
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.05), mouthMat);
      mouth.position.set(0, 0.95, 1.0);
      g.add(mouth);
      // glow point light
      const glow = new THREE.PointLight(0xff8030, 2.5, 6, 2);
      glow.position.set(0, 1.3, 0);
      g.add(glow);
      g.userData.scale = 1.2;
      g.userData.glow = glow;
    }

    g.userData.bobBase = g.position.y;
    return g;
  }

  _addEnemyMesh(enemy) {
    const mesh = this._buildEnemyMesh(enemy);
    const pos = logicalToWorld(enemy);
    mesh.position.set(pos.x, 0, pos.z);
    this.enemyGroup.add(mesh);
    enemy.mesh = mesh;
  }

  _removeEnemyMesh(enemy) {
    if (enemy.mesh) {
      this.enemyGroup.remove(enemy.mesh);
      enemy.mesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      enemy.mesh = null;
    }
  }

  _updateEnemyMeshes(dt) {
    const time = Date.now() / 1000;
    for (const enemy of this.enemies) {
      if (!enemy.mesh) continue;
      const pos = logicalToWorld(enemy);
      enemy.mesh.position.x = pos.x;
      enemy.mesh.position.z = pos.z;
      // bobbing
      let bob = 0;
      if (enemy.type === 'slime') {
        bob = Math.abs(Math.sin(time * 4 + enemy.bobOffset)) * 0.08;
        enemy.mesh.position.y = bob;
        const squish = 0.85 + Math.cos(time * 4 + enemy.bobOffset) * 0.08;
        enemy.mesh.scale.y = squish;
        enemy.mesh.scale.x = 2 - squish;
        enemy.mesh.scale.z = 2 - squish;
      } else if (enemy.type === 'bat') {
        enemy.mesh.position.y = 1.5 + Math.sin(time * 2 + enemy.bobOffset) * 0.15;
        if (enemy.mesh.userData.wings) {
          const flap = Math.sin(time * 14) * 0.6;
          enemy.mesh.userData.wings[0].rotation.y = flap;
          enemy.mesh.userData.wings[1].rotation.y = -flap;
        }
      } else if (enemy.type === 'wolf') {
        enemy.mesh.position.y = Math.sin(time * 6 + enemy.bobOffset) * 0.04;
      } else if (enemy.type === 'dragon') {
        enemy.mesh.position.y = 0.5 + Math.sin(time * 2.5 + enemy.bobOffset) * 0.1;
        if (enemy.mesh.userData.wings) {
          const flap = Math.sin(time * 6) * 0.5;
          enemy.mesh.userData.wings[0].rotation.y = flap;
          enemy.mesh.userData.wings[1].rotation.y = -flap;
        }
      } else if (enemy.type === 'boss') {
        enemy.mesh.position.y = Math.sin(time * 1.5 + enemy.bobOffset) * 0.15;
        enemy.mesh.rotation.y += dt * 0.3;
        const pulse = 0.8 + Math.sin(time * 3) * 0.4;
        if (enemy.mesh.userData.glow) enemy.mesh.userData.glow.intensity = 2.5 + pulse;
      }
      // face the camera (rotate toward player on +Z)
      if (enemy.type !== 'boss') {
        enemy.mesh.lookAt(this.camera.position.x, enemy.mesh.position.y, this.camera.position.z);
      }
      // hit flash
      if (enemy.hitFlash > 0) {
        const flash = 0.5 + Math.sin(Date.now() / 30) * 0.5;
        enemy.mesh.traverse(obj => {
          if (obj.material && obj.material.emissive) {
            obj.material.emissiveIntensity = 0.5 + flash * 2;
          }
        });
      } else if (enemy.mesh.userData.normalizedEmissive !== true) {
        // reset emissive intensity periodically
      }
    }
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
    const laneMax = 420;
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
        for (let h = 1; h < def.hp; h++) words.push(this._getWord(minL, maxL));
        enemy.setWords(words);
      }
      return enemy;
    });
  }

  _spawnPending() {
    for (const enemy of this.pendingEnemies) {
      enemy.initRomaji();
      this._addEnemyMesh(enemy);
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

  _onClick(e) {}

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
        if (!hasMore) this._killEnemy(enemy);
        else this._shootArrowAt(enemy, false);
      }
      return;
    }
    this._pendingBuffer = (this._pendingBuffer || '') + key;
    const buf = this._pendingBuffer;
    const candidates = [];
    for (const enemy of this.enemies) {
      if (!enemy.alive || !enemy.romaji) continue;
      if (enemy.x > 1000) continue;
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
      for (const ch of buf) enemy.romaji.processKey(ch);
      this.totalCorrect += buf.length;
      this.audio.keyCorrect();
      if (enemy.romaji.isComplete) {
        const hasMore = enemy.nextWord();
        if (!hasMore) this._killEnemy(enemy);
        else this._shootArrowAt(enemy, false);
      }
      this._pendingBuffer = '';
      return;
    }
    this.audio.keyCorrect();
  }

  _arrowStartWorld() {
    // bow grip approximate world position (just below + right of camera)
    return new THREE.Vector3(
      this.camera.position.x + 0.4,
      this.camera.position.y - 0.5,
      this.camera.position.z - 0.4
    );
  }

  _shootArrowAt(enemy, isFatal) {
    this.bowRecoil = 1.0;
    const start = this._arrowStartWorld();
    this._spawnArrow3D({
      enemy,
      startWorld: start,
      isHit: true,
      isBoss: false,
      pts: 0,
      combo: 0
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
    const start = this._arrowStartWorld();
    this._spawnArrow3D({
      enemy,
      startWorld: start,
      isHit: false,
      isBoss: enemy.type === 'boss',
      pts,
      combo: this.combo
    });
    this._setTarget(null);
  }

  _spawnArrow3D(opts) {
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, emissive: 0x402010, emissiveIntensity: 0.4, roughness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.7, roughness: 0.3 });
    const fletchMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.7 });

    const group = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 8), shaftMat);
    shaft.rotation.z = Math.PI / 2;
    group.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 8), headMat);
    head.rotation.z = -Math.PI / 2;
    head.position.x = 0.42;
    group.add(head);
    // fletching (3 fins)
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.005), fletchMat);
      fin.position.x = -0.32;
      fin.rotation.x = (i / 3) * Math.PI * 2;
      group.add(fin);
    }

    group.position.copy(opts.startWorld);
    this.arrowGroup.add(group);

    this.arrows.push({
      enemy: opts.enemy,
      startWorld: opts.startWorld.clone(),
      progress: 0,
      duration: 0.22,
      alive: true,
      isHit: opts.isHit,
      isBoss: opts.isBoss,
      pts: opts.pts,
      combo: opts.combo,
      mesh: group
    });
  }

  _enemyHitPoint(enemy) {
    const pos = logicalToWorld(enemy);
    let y = 0.7;
    if (enemy.type === 'bat') y = 1.5;
    else if (enemy.type === 'dragon') y = 1.0;
    else if (enemy.type === 'boss') y = 1.4;
    else if (enemy.type === 'wolf') y = 0.7;
    return new THREE.Vector3(pos.x, y, pos.z);
  }

  _updateArrows(dt) {
    for (const arrow of this.arrows) {
      if (!arrow.alive) continue;
      arrow.progress += dt / arrow.duration;
      if (arrow.progress >= 1) {
        arrow.alive = false;
        this._onArrowHit(arrow);
        if (arrow.mesh) {
          this.arrowGroup.remove(arrow.mesh);
          arrow.mesh.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
          });
        }
        continue;
      }
      const target = arrow.enemy ? this._enemyHitPoint(arrow.enemy) : new THREE.Vector3(0, 1.5, -10);
      const p = arrow.progress;
      if (arrow.mesh) {
        arrow.mesh.position.lerpVectors(arrow.startWorld, target, p);
        // rotate to point toward target
        const dir = new THREE.Vector3().subVectors(target, arrow.mesh.position).normalize();
        arrow.mesh.lookAt(arrow.mesh.position.clone().add(dir));
        arrow.mesh.rotation.z = 0;
      }
    }
    this.arrows = this.arrows.filter(a => a.alive);
  }

  _onArrowHit(arrow) {
    let screenPos = null;
    if (arrow.enemy) {
      const wp = this._enemyHitPoint(arrow.enemy);
      screenPos = this._worldToScreen(wp);
    }
    const tx = screenPos ? screenPos.x : 500;
    const ty = screenPos ? screenPos.y : 300;

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
      this.cameraShake = 0.6;
    } else {
      this.effects.explode(tx, ty, '#d4a017');
      this.audio.enemyKill();
    }
    this.effects.addScoreText(tx, ty - 20, arrow.pts);
    if (arrow.combo >= 3) this.effects.addComboText(tx, ty, arrow.combo);
  }

  _worldToScreen(vec3) {
    const v = vec3.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * 1000,
      y: (-v.y * 0.5 + 0.5) * 600,
      z: v.z
    };
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
    this.canvas3d.removeEventListener('click', this._boundClickHandler);
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
    this._render();
    if (this.running || this.state === 'victory' || this.state === 'gameover' || this.state === 'wave_clear' || this.state === 'wave_intro') {
      requestAnimationFrame(this._loop.bind(this));
    }
  }

  _update(dt) {
    this.effects.update(dt);
    this._updateArrows(dt);
    if (this.bowRecoil > 0) this.bowRecoil = Math.max(0, this.bowRecoil - dt * 6);
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2);
    if (this.cameraShake > 0) this.cameraShake = Math.max(0, this.cameraShake - dt * 4);

    this._animateTorches(dt);
    this._updateEnemyMeshes(dt);

    // subtle breathing camera
    const t = Date.now() / 1000;
    this.camera.position.y = 1.7 + Math.sin(t * 0.7) * 0.02;

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
      if (this.stateTimer <= 0) this._startWave();
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
        this.cameraShake = 0.5;
        this.effects.triggerShake(8);
        this.effects.triggerFlash('#ef4444');
        this.audio.wallHit();
        if (enemy === this.targetEnemy) this.targetEnemy = null;
        if (this.wallHp <= 0) {
          this._gameOver();
          return;
        }
      }
    }

    // remove off-game enemies + cleanup their meshes
    const keep = [];
    for (const e of this.enemies) {
      if (e.alive || e.dying || e === this.targetEnemy) {
        keep.push(e);
      } else {
        this._removeEnemyMesh(e);
      }
    }
    this.enemies = keep;

    if (this.targetEnemy && !this.targetEnemy.alive) this._setTarget(null);

    const allDead = this.enemies.every(e => !e.alive) && this.arrows.length === 0;
    if (allDead && this.state === 'playing') {
      this.score += this.currentWave * 200;
      this.effects.triggerWaveClear(this.currentWave);
      this.state = 'wave_clear';
      this.stateTimer = 2.0;
    }
  }

  _render() {
    // camera shake
    if (this.cameraShake > 0) {
      const s = this.cameraShake;
      this.camera.position.x = (Math.random() - 0.5) * s * 0.3;
      this.camera.rotation.z = (Math.random() - 0.5) * s * 0.04;
    } else {
      this.camera.position.x = 0;
      this.camera.rotation.z = 0;
    }
    this.renderer.render(this.scene, this.camera);
    this._drawOverlay();
  }

  _drawOverlay() {
    const ctx = this.ctx2d;
    const w = 1000;
    const h = 600;
    ctx.clearRect(0, 0, w, h);

    // labels above enemies
    for (const enemy of this.enemies) {
      if (!enemy.alive && !enemy.dying) continue;
      if (!enemy.romaji) continue;
      const wp = this._enemyHitPoint(enemy);
      // raise label above head
      wp.y += enemy.type === 'boss' ? 1.5 : enemy.type === 'dragon' ? 1.2 : enemy.type === 'wolf' ? 0.9 : 0.8;
      const sp = this._worldToScreen(wp);
      if (sp.z > 1 || sp.z < -1) continue;
      this._drawEnemyLabel(ctx, enemy, sp);
    }

    this._drawBow(ctx);
    this._drawHUD(ctx, w);
    this._drawInputArea(ctx, w, h);
    this._drawVignette(ctx, w, h);
    this.effects.draw(ctx, this.canvas2d);
  }

  _drawEnemyLabel(ctx, enemy, sp) {
    const depthScale = Math.max(0.5, Math.min(1.4, 1 / (Math.abs(sp.z) + 0.6)));
    const fontKana = 14 * depthScale;
    const fontRoma = 16 * depthScale;
    const labelY = sp.y;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // kana on top
    ctx.font = `bold ${fontKana}px 'Segoe UI', sans-serif`;
    const kanaW = ctx.measureText(enemy.currentWord).width;
    ctx.fillStyle = 'rgba(8, 10, 14, 0.85)';
    ctx.fillRect(sp.x - kanaW / 2 - 6, labelY - fontKana / 2 - 2, kanaW + 12, fontKana + 4);
    ctx.fillStyle = enemy.targeted ? '#fbbf24' : '#ffffff';
    if (enemy.targeted) {
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 8;
    }
    ctx.fillText(enemy.currentWord, sp.x, labelY);
    ctx.shadowBlur = 0;

    // romaji below
    const romaji = enemy.romaji.displayRomaji;
    const confirmed = enemy.romaji.confirmed;
    const remaining = romaji.slice(confirmed.length);
    ctx.font = `bold ${fontRoma}px 'Courier New', monospace`;
    const romaW = ctx.measureText(romaji).width;
    const romaY = labelY + fontKana / 2 + fontRoma / 2 + 4;
    const bgColor = enemy.targeted ? 'rgba(70, 100, 180, 0.95)' : 'rgba(30, 50, 90, 0.85)';
    ctx.fillStyle = bgColor;
    const pad = 6;
    ctx.fillRect(sp.x - romaW / 2 - pad, romaY - fontRoma / 2 - 2, romaW + pad * 2, fontRoma + 4);
    ctx.textAlign = 'left';
    const startX = sp.x - romaW / 2;
    ctx.fillStyle = '#86efac';
    ctx.fillText(confirmed, startX, romaY);
    const cw = ctx.measureText(confirmed).width;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(remaining, startX + cw, romaY);
    ctx.restore();
  }

  _drawBow(ctx) {
    const recoil = this.bowRecoil;
    const recoilOffset = recoil * 14;

    const topTip = { x: 670 + recoilOffset, y: 60 - recoilOffset * 0.3 };
    const botTip = { x: 1050 + recoilOffset, y: 720 - recoilOffset * 0.3 };
    const grip = { x: 880 + recoilOffset, y: 410 - recoilOffset * 0.3 };
    const bulge = 60 - recoil * 25;
    const ctrl = { x: grip.x + bulge, y: grip.y };

    ctx.save();
    ctx.lineCap = 'round';

    ctx.strokeStyle = '#2a1606';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(topTip.x, topTip.y);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, botTip.x, botTip.y);
    ctx.stroke();

    ctx.strokeStyle = '#5d3115';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(topTip.x, topTip.y);
    ctx.quadraticCurveTo(ctrl.x - 2, ctrl.y, botTip.x, botTip.y);
    ctx.stroke();

    ctx.strokeStyle = '#8a4f1f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(topTip.x + 3, topTip.y + 2);
    ctx.quadraticCurveTo(ctrl.x + 3, ctrl.y, botTip.x + 3, botTip.y);
    ctx.stroke();

    ctx.fillStyle = '#1a0e04';
    ctx.beginPath();
    ctx.arc(topTip.x, topTip.y, 7, 0, Math.PI * 2);
    ctx.arc(botTip.x, botTip.y, 7, 0, Math.PI * 2);
    ctx.fill();

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

    if (recoil < 0.4) {
      const arrowAlpha = 1 - recoil / 0.4;
      ctx.save();
      ctx.globalAlpha = arrowAlpha;
      const arrowStart = stringMid;
      const arrowEnd = { x: arrowStart.x - 360, y: arrowStart.y - 110 };
      const ang = Math.atan2(arrowEnd.y - arrowStart.y, arrowEnd.x - arrowStart.x);
      ctx.strokeStyle = '#d4a017';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(arrowStart.x, arrowStart.y);
      ctx.lineTo(arrowEnd.x, arrowEnd.y);
      ctx.stroke();
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

    // leather grip
    ctx.save();
    ctx.translate(grip.x, grip.y);
    const tang = Math.atan2(botTip.y - topTip.y, botTip.x - topTip.x);
    ctx.rotate(tang);
    ctx.fillStyle = '#15080a';
    ctx.fillRect(-12, -50, 24, 100);
    ctx.strokeStyle = '#3a1f0a';
    ctx.lineWidth = 1.5;
    for (let i = -42; i < 45; i += 8) {
      ctx.beginPath();
      ctx.moveTo(-12, i);
      ctx.lineTo(14, i + 2);
      ctx.stroke();
    }
    ctx.restore();

    // hand
    ctx.save();
    ctx.translate(grip.x + 8, grip.y + 4);
    ctx.rotate(tang - 0.1);
    ctx.fillStyle = '#d8a878';
    ctx.beginPath();
    ctx.ellipse(0, 0, 32, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120, 70, 30, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-12, 5, 18, 30, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c89868';
    for (let i = -22; i <= 22; i += 12) {
      ctx.beginPath();
      ctx.ellipse(-20, i, 7, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#d8a878';
    ctx.beginPath();
    ctx.ellipse(8, -22, 10, 18, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c08858';
    for (let i = -16; i <= 16; i += 10) {
      ctx.beginPath();
      ctx.arc(-12, i, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // forearm extending off bottom-right
    ctx.save();
    ctx.fillStyle = '#1f3a18';
    ctx.beginPath();
    ctx.moveTo(grip.x + 30, grip.y + 30);
    ctx.lineTo(grip.x - 10, grip.y + 50);
    ctx.lineTo(1100, 720);
    ctx.lineTo(1100, 560);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5a3416';
    ctx.beginPath();
    ctx.moveTo(grip.x + 30, grip.y + 30);
    ctx.lineTo(grip.x - 10, grip.y + 50);
    ctx.lineTo(grip.x + 30, grip.y + 90);
    ctx.lineTo(grip.x + 60, grip.y + 70);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
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

  _drawHUD(ctx, w) {
    ctx.save();
    const tg = ctx.createLinearGradient(0, 0, 0, 42);
    tg.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    tg.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, w, 42);

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

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e5e7eb';
    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    ctx.fillText(`WAVE ${this.currentWave}/${this.totalWaves}`, w / 2, 21);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('SCORE', w - 90, 21);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.score.toLocaleString(), w - 14, 21);

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

  _drawVignette(ctx, w, h) {
    const v = ctx.createRadialGradient(w / 2, h / 2 - 50, 220, w / 2, h / 2, 600);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    if (this.damageFlash > 0) {
      ctx.fillStyle = `rgba(180, 20, 20, ${this.damageFlash * 0.25})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  destroy() {
    this.running = false;
    document.removeEventListener('keydown', this._boundKeyHandler);
    this.canvas3d.removeEventListener('click', this._boundClickHandler);
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}

window.Game = Game;
