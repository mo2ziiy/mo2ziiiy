/* ============================================================
   hero3d.js — interactive network / threat graph (Three.js)

   Gold nodes on a sphere, linked to their nearest neighbours.
   Packets travel the edges; every few seconds a node "detects"
   a threat (teal flash) and sends teal packets out.
   - loads Three.js lazily, after the page is idle
   - desktop + fine pointer + capable device only; otherwise the
     static SVG (assets/img/hero-graph.svg) stays
   - never runs under prefers-reduced-motion
   - pixel ratio capped at 1.5; pauses off-screen / hidden tab
   The layout mirrors the SVG generator so the swap is seamless.
   ============================================================ */

const stage = document.querySelector('.hero-stage');
const canvas = document.getElementById('heroCanvas');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const desktop = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');

function capable() {
  if (!stage || !canvas || reduce.matches || !desktop.matches) return false;
  const conn = navigator.connection;
  if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return false;
  if ((navigator.hardwareConcurrency || 4) < 4) return false;
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

function whenIdle(fn) {
  const go = () => ('requestIdleCallback' in window)
    ? window.requestIdleCallback(fn, { timeout: 1500 })
    : setTimeout(fn, 300);
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

if (capable()) {
  whenIdle(() => {
    import('../vendor/three.module.min.js').then(init).catch(() => { /* keep static fallback */ });
  });
}

/* same PRNG + parameters as scratch gen_graph_svg.py */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeDotTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function init(THREE) {
  const N = 150, R = 2.35, K = 3, PACKETS = 30;
  const CAM_Z = 7.2, BG = 0x0c0b09;
  const GOLD = new THREE.Color(0xe6c884);
  const TEAL = new THREE.Color(0x5fd4c4);
  const rand = mulberry32(7);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 5.4, 9.6);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 40);
  camera.position.set(0, 0, CAM_Z);

  const group = new THREE.Group();
  group.rotation.set(0.28, 0.6, 0);
  scene.add(group);

  /* ---- nodes on a fibonacci sphere ---- */
  const nodes = [];
  const nodePos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * 2.399963229728653;
    const j = 1 + (rand() - 0.5) * 0.1;
    const v = new THREE.Vector3(Math.cos(th) * r * R * j, y * R * j, Math.sin(th) * r * R * j);
    nodes.push(v);
    v.toArray(nodePos, i * 3);
  }

  /* ---- k-nearest edges + adjacency ---- */
  const edgeKeys = new Set();
  const edges = [];
  const adj = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) {
    const near = [];
    for (let j = 0; j < N; j++) if (j !== i) near.push([nodes[i].distanceToSquared(nodes[j]), j]);
    near.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < K; k++) {
      const j = near[k][1];
      const a = Math.min(i, j), b = Math.max(i, j), key = a * N + b;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push([a, b]);
      adj[a].push(b);
      adj[b].push(a);
    }
  }
  const linePos = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], e) => { nodes[a].toArray(linePos, e * 6); nodes[b].toArray(linePos, e * 6 + 3); });
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0xc9a35f, transparent: true, opacity: 0.26, depthWrite: false });
  group.add(new THREE.LineSegments(lineGeo, lineMat));

  /* ---- node points ---- */
  const dot = makeDotTexture(THREE);
  const nodeCol = new Float32Array(N * 3);
  const nodeSize = new Float32Array(N);
  for (let i = 0; i < N; i++) { GOLD.toArray(nodeCol, i * 3); nodeSize[i] = 1; }
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
  nodeGeo.setAttribute('color', new THREE.BufferAttribute(nodeCol, 3));
  const nodeMat = new THREE.PointsMaterial({
    size: 0.11, map: dot, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
  });
  group.add(new THREE.Points(nodeGeo, nodeMat));

  /* ---- packets travelling along edges ---- */
  const pktPos = new Float32Array(PACKETS * 3);
  const pktCol = new Float32Array(PACKETS * 3);
  const packets = [];
  for (let p = 0; p < PACKETS; p++) {
    const from = Math.floor(rand() * N);
    packets.push({ from, to: adj[from][Math.floor(rand() * adj[from].length)], t: rand(), speed: 0.35 + rand() * 0.45, teal: 0 });
  }
  const pktGeo = new THREE.BufferGeometry();
  pktGeo.setAttribute('position', new THREE.BufferAttribute(pktPos, 3));
  pktGeo.setAttribute('color', new THREE.BufferAttribute(pktCol, 3));
  const pktMat = new THREE.PointsMaterial({
    size: 0.085, map: dot, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
  });
  group.add(new THREE.Points(pktGeo, pktMat));

  /* ---- dashed HUD orbit ---- */
  const ringPts = [];
  for (let k = 0; k <= 128; k++) {
    const a = (k / 128) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * 3.0, 0, Math.sin(a) * 3.0));
  }
  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  const ring = new THREE.Line(ringGeo, new THREE.LineDashedMaterial({
    color: 0xc9a35f, transparent: true, opacity: 0.22, dashSize: 0.05, gapSize: 0.14, depthWrite: false
  }));
  ring.computeLineDistances();
  ring.rotation.set(-0.32, 0, 0.12);
  scene.add(ring);

  /* ---- threat alerts ---- */
  const alerts = [];        // { node, age }
  const ALERT_DUR = 1.8;
  let alertTimer = 1.2;
  function raiseAlert() {
    const node = Math.floor(rand() * N);
    alerts.push({ node, age: 0 });
    let sent = 0;
    for (const p of packets) {
      if (sent >= 3) break;
      if (rand() < 0.5) continue;
      p.from = node;
      p.to = adj[node][sent % adj[node].length];
      p.t = 0;
      p.teal = 2;              // stays teal for two hops
      sent++;
    }
  }

  /* ---- sizing ---- */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);

  /* ---- input: pointer + scroll ---- */
  let tx = 0, ty = 0, mx = 0, my = 0, spin = 0;
  window.addEventListener('pointermove', (e) => {
    tx = e.clientX / window.innerWidth - 0.5;
    ty = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });
  const hero = stage.closest('.hero') || document.body;
  function scrollProgress() {
    const h = hero.offsetHeight || window.innerHeight;
    return Math.min(Math.max(window.scrollY / h, 0), 1);
  }

  /* ---- loop with pause when off-screen / hidden ---- */
  const tmp = new THREE.Vector3();
  const col = new THREE.Color();
  let running = false, visible = true, raf = 0, last = 0, first = true;

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000 || 0, 0.05);
    last = now;

    // camera + group respond to pointer and scroll
    mx += (tx - mx) * 0.045;
    my += (ty - my) * 0.045;
    const p = scrollProgress();
    spin += dt * 0.05;
    group.rotation.y = 0.6 + spin + mx * 0.55 + p * 1.1;
    group.rotation.x = 0.28 + my * 0.32 - p * 0.2;
    ring.rotation.y += dt * 0.08;
    camera.position.z = CAM_Z + p * 2.4;
    canvas.style.opacity = String(1 - p * 0.85);

    // alerts
    alertTimer -= dt;
    if (alertTimer <= 0) { raiseAlert(); alertTimer = 2.2 + rand() * 1.6; }
    for (let i = alerts.length - 1; i >= 0; i--) {
      const a = alerts[i];
      a.age += dt;
      const k = Math.sin(Math.min(a.age / ALERT_DUR, 1) * Math.PI);
      col.copy(GOLD).lerp(TEAL, k).multiplyScalar(1 + k * 1.2);
      col.toArray(nodeCol, a.node * 3);
      if (a.age >= ALERT_DUR) { GOLD.toArray(nodeCol, a.node * 3); alerts.splice(i, 1); }
    }
    nodeGeo.attributes.color.needsUpdate = true;

    // packets
    for (let i = 0; i < PACKETS; i++) {
      const pk = packets[i];
      pk.t += pk.speed * dt;
      if (pk.t >= 1) {
        const prev = pk.from;
        pk.from = pk.to;
        const choices = adj[pk.from];
        let next = choices[Math.floor(rand() * choices.length)];
        if (next === prev && choices.length > 1) next = choices[(choices.indexOf(next) + 1) % choices.length];
        pk.to = next;
        pk.t = 0;
        if (pk.teal > 0) pk.teal--;
      }
      tmp.lerpVectors(nodes[pk.from], nodes[pk.to], pk.t).toArray(pktPos, i * 3);
      (pk.teal > 0 ? TEAL : GOLD).toArray(pktCol, i * 3);
    }
    pktGeo.attributes.position.needsUpdate = true;
    pktGeo.attributes.color.needsUpdate = true;

    renderer.render(scene, camera);
    if (first) { first = false; stage.classList.add('is-live'); }
  }

  function update() {
    const should = visible && !document.hidden && !reduce.matches;
    if (should && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  }

  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: 0 }).observe(stage);
  document.addEventListener('visibilitychange', update);
  reduce.addEventListener('change', () => {
    update();
    if (reduce.matches) stage.classList.remove('is-live');
  });
  update();
}
