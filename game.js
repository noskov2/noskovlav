// Doggo Catch - Endless Runner 3D (mobile friendly)
// Uses Three.js; simple shapes for performance.

(() => {
  const TWO_PI = Math.PI * 2;

  // Scene basics
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 4.5, 8);
  camera.lookAt(0, 1.2, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 5);
  scene.add(dir);

  // Ground (moving conveyor)
  const groundGeo = new THREE.PlaneGeometry(30, 400, 1, 40);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.1, roughness: 0.9, side: THREE.DoubleSide });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -180;
  scene.add(ground);

  // Lane guides (subtle)
  const laneMat = new THREE.LineBasicMaterial({ color: 0x333333 });
  for (let i = -1; i <= 1; i++) {
    const pts = [new THREE.Vector3(i * 2.2, 0.01, 10), new THREE.Vector3(i * 2.2, 0.01, -350)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, laneMat);
    scene.add(line);
  }

  // Dog (capsule + head sphere + ears)
  const dog = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.4, 6, 12), new THREE.MeshStandardMaterial({ color: 0x996633, roughness: 0.7 }));
  body.position.y = 1.1;
  dog.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshStandardMaterial({ color: 0x996633 }));
  head.position.set(0, 2.1, 0.1);
  dog.add(head);
  const earGeo = new THREE.ConeGeometry(0.15, 0.3, 6);
  const earMat = new THREE.MeshStandardMaterial({ color: 0x553311 });
  const earL = new THREE.Mesh(earGeo, earMat); earL.position.set(-0.25, 2.5, 0); earL.rotation.z = 0.2; dog.add(earL);
  const earR = new THREE.Mesh(earGeo, earMat); earR.position.set(0.25, 2.5, 0); earR.rotation.z = -0.2; dog.add(earR);
  dog.position.set(0, 0, 3);
  scene.add(dog);

  // Shadow (fake)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
  shadow.rotation.x = -Math.PI/2;
  shadow.position.set(0, 0.01, dog.position.z);
  scene.add(shadow);

  // UI
  const scoreEl = document.getElementById('score');
  const centerMsg = document.getElementById('centerMsg');
  const hint = document.getElementById('hint');

  // Game state
  let running = false;
  let speed = 12;         // ground/object speed (z units per second)
  let time = 0;
  let score = 0;
  let jumpV = 0;
  const GRAVITY = -26;
  const JUMP_FORCE = 12.5;
  const MAX_Y = 3.5;
  let grounded = true;
  let spawnTimer = 0;
  let difficultyTimer = 0;

  // Objects
  const spawned = []; // {mesh, type:'ball'|'obstacle', caught:boolean}

  function resetGame() {
    // remove spawned
    for (const o of spawned) scene.remove(o.mesh);
    spawned.length = 0;
    score = 0;
    speed = 12;
    time = 0;
    spawnTimer = 0;
    difficultyTimer = 0;
    dog.position.set(0, 0, 3);
    jumpV = 0;
    grounded = true;
    updateScore(0);
    centerMsg.style.display = 'flex';
    hint.textContent = 'Tap to start';
    running = false;
  }

  function updateScore(delta) {
    score += delta;
    scoreEl.textContent = Math.floor(score).toString();
  }

  // Spawn utilities
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xff3333, metalness: 0.2, roughness: 0.6, emissive: 0x300000 });
  const obsMat  = new THREE.MeshStandardMaterial({ color: 0x885522, metalness: 0.0, roughness: 0.9 });
  function spawnBall() {
    const y = 1.4 + Math.random() * 1.6;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), ballMat);
    ball.position.set(0, y, -70);
    scene.add(ball);
    spawned.push({ mesh: ball, type: 'ball', caught: false });
  }
  function spawnObstacle() {
    const s = 0.8 + Math.random() * 0.6;
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.0*s, 1.0*s, 1.0*s), obsMat);
    box.position.set(0, 0.5*s, -70);
    scene.add(box);
    spawned.push({ mesh: box, type: 'obstacle', caught: false });
  }

  function spawnPattern() {
    // Randomly choose between: single obstacle, single ball, or combo (ball then obstacle)
    const r = Math.random();
    if (r < 0.4) spawnObstacle();
    else if (r < 0.8) spawnBall();
    else { spawnBall(); setTimeout(spawnObstacle, 450); }
  }

  // Input
  function tryJump() {
    if (!running) { running = true; centerMsg.style.display = 'none'; hint.textContent = ' '; return; }
    if (grounded) {
      grounded = false;
      jumpV = JUMP_FORCE;
    }
  }
  window.addEventListener('pointerdown', tryJump, { passive: true });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') tryJump(); });

  // Resize
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // Main loop
  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (running) {
      time += dt;
      difficultyTimer += dt;
      if (difficultyTimer > 6) { // ramp difficulty
        difficultyTimer = 0;
        speed = Math.min(speed + 0.9, 24);
      }

      // Move "world" (spawned objects move +z toward the dog)
      for (let i = spawned.length - 1; i >= 0; i--) {
        const o = spawned[i];
        o.mesh.position.z += speed * dt;

        // Interaction
        const dz = o.mesh.position.z - dog.position.z;
        if (Math.abs(dz) < 0.6) {
          const dy = (o.mesh.position.y) - (dog.position.y + 1.0); // approx head height
          if (o.type === 'ball' && Math.abs(dy) < 0.6 && !o.caught) {
            o.caught = true;
            updateScore(10);
            // tiny pop
            o.mesh.scale.setScalar(1.4);
            setTimeout(() => { scene.remove(o.mesh); }, 60);
          }
          if (o.type === 'obstacle' && Math.abs(dy) < 0.9) {
            // collision -> game over
            gameOver();
          }
        }

        if (o.mesh.position.z > 12) {
          scene.remove(o.mesh);
          spawned.splice(i, 1);
        }
      }

      // Spawn pacing
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnPattern();
        const base = 1.05;
        spawnTimer = Math.max(0.55, base + (Math.random()*0.6) - (speed-12)*0.03);
      }

      // Dog jump physics
      if (!grounded) {
        jumpV += GRAVITY * dt;
        dog.position.y += jumpV * dt;
        if (dog.position.y <= 0) { dog.position.y = 0; grounded = true; jumpV = 0; }
        dog.position.y = Math.min(dog.position.y, MAX_Y);
      }

      // Subtle bobbing
      head.rotation.x = Math.sin(time*6) * 0.06;
      body.rotation.x = Math.sin(time*8) * 0.04;
      shadow.position.set(dog.position.x, 0.01, dog.position.z);
      shadow.material.opacity = THREE.MathUtils.mapLinear(dog.position.y, 0, MAX_Y, 0.25, 0.07);
      updateScore(dt * 1.2); // passive score over time
    }

    // Simple ground UV scroll illusion (by moving vertices)
    const verts = ground.geometry.attributes.position;
    for (let i = 0; i < verts.count; i++) {
      const z = verts.getZ(i);
      const row = i % verts.itemSize;
      // skip manipulation by rows to avoid distortion; instead simulate waves
    }
    ground.position.z = ((-time*speed*0.7) % 20) - 190;

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function gameOver() {
    running = false;
    centerMsg.style.display = 'flex';
    centerMsg.querySelector('.box').innerHTML = `<div style="font-size:18px; font-weight:700; margin-bottom:6px;">Game Over</div>
      <div style="font-size:14px; opacity:.9;">Score: <b>${Math.floor(score)}</b><br/>Tap to play again</div>`;
    setTimeout(resetGame, 400);
  }

  // Start state
  resetGame();
})();
