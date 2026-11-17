// Effects: pooled tracers, impact sparks, muzzle flashes, explosions and
// smoke clouds. Everything is preallocated and recycled — the update loop
// allocates nothing. Smoke clouds are also gameplay: bots check them when
// they test line of sight (see physics.losClear).
import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { puffTexture } from './textures.js';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createEffects(scene) {
  const glow = glowTexture();
  const up = new THREE.Vector3(0, 1, 0);

  // Tracers: thin stretched boxes flying the shot line for a blink.
  const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: P.tracer, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < 40; i += 1) {
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  let tracerIdx = 0;

  // Sparks: small glowing boxes with velocity and gravity.
  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparks = [];
  for (let i = 0; i < 60; i += 1) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true }));
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
  }
  let sparkIdx = 0;

  // Muzzle flashes: camera-facing glow quads plus one shared point light.
  const flashMat = new THREE.MeshBasicMaterial({ map: glow, color: P.muzzle, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flashes = [];
  for (let i = 0; i < 10; i += 1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), flashMat);
    m.visible = false;
    scene.add(m);
    flashes.push({ mesh: m, life: 0 });
  }
  let flashIdx = 0;
  const flashLight = new THREE.PointLight(0xffbe78, 0, 11, 1.6);
  scene.add(flashLight);

  // Smoke clouds (gameplay objects, see the header): clusters of big soft
  // puff sprites that read as one stylised dust wall. The entry's pos/r are
  // the logical sphere losClear tests against — same radius as ever.
  const puffTex = puffTexture();
  const PUFFS = [ // [x, y, z, size] in metres around the centre, for r = 3.4
    [0, 0.1, 0, 3.4], [-1.5, -0.3, 0.5, 2.7], [1.5, -0.2, -0.4, 2.9],
    [-0.8, 0.8, -0.8, 2.5], [0.9, 0.9, 0.8, 2.4], [0, -0.6, 1.2, 2.3],
    [-1.9, 0.5, -1.1, 2.1], [1.9, 0.6, 1.2, 2.0], [0.1, 1.3, 0, 2.0],
  ];
  const smokes = [];
  for (let i = 0; i < 6; i += 1) {
    const mat = new THREE.SpriteMaterial({ map: puffTex, color: P.smoke, transparent: true, opacity: 0, depthWrite: false });
    const grp = new THREE.Group();
    for (const [px, py, pz, ps] of PUFFS) {
      const sp = new THREE.Sprite(mat);
      sp.position.set(px, py, pz);
      sp.scale.set(ps, ps, 1);
      grp.add(sp);
    }
    grp.visible = false;
    scene.add(grp);
    smokes.push({ mesh: grp, mat, pos: grp.position, r: 3.4, t: 0, active: false, spin: i * 1.13 });
  }

  // Explosion flash: one big glow sphere reused.
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ map: glow, color: 0xffa050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  boom.visible = false;
  scene.add(boom);
  let boomLife = 0;

  const tmp = new THREE.Vector3();

  function burst(pos, color, count, speed, life) {
    for (let n = 0; n < count; n += 1) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      s.mesh.visible = true;
      s.mesh.material.color.setHex(color);
      s.mesh.position.copy(pos);
      s.vel.set((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.life = life * (0.6 + Math.random() * 0.7);
      s.mesh.material.opacity = 1;
    }
  }

  return {
    smokes,
    tracer(a, b) {
      const t = tracers[tracerIdx];
      tracerIdx = (tracerIdx + 1) % tracers.length;
      t.mesh.visible = true;
      t.mesh.position.copy(a).add(b).multiplyScalar(0.5);
      t.mesh.lookAt(b);
      t.mesh.scale.set(1, 1, a.distanceTo(b));
      t.life = 0.055;
    },
    impact(pos, flesh) {
      burst(pos, flesh ? 0xd84a38 : 0xd8c9a0, flesh ? 7 : 5, flesh ? 2.4 : 3.2, 0.32);
    },
    muzzle(pos, cameraPos) {
      const f = flashes[flashIdx];
      flashIdx = (flashIdx + 1) % flashes.length;
      f.mesh.visible = true;
      f.mesh.position.copy(pos);
      f.mesh.lookAt(cameraPos);
      f.mesh.rotation.z = Math.random() * Math.PI;
      const s = 0.7 + Math.random() * 0.5;
      f.mesh.scale.set(s, s, 1);
      f.life = 0.045;
      flashLight.position.copy(pos);
      flashLight.intensity = 15;
    },
    explosion(pos) {
      boom.visible = true;
      boom.position.copy(pos);
      boomLife = 0.28;
      flashLight.position.copy(pos);
      flashLight.intensity = 160;
      burst(pos, 0xffa050, 22, 7, 0.5);
      burst(pos, 0x777777, 10, 3, 0.7);
    },
    smoke(pos, radius, time) {
      const s = smokes.find((x) => !x.active) || smokes[0];
      s.active = true;
      s.r = radius;
      s.t = time;
      s.mesh.visible = true;
      s.mesh.position.set(pos.x, 1.3, pos.z);
      s.mesh.scale.setScalar(radius / 3.4);
      s.mesh.rotation.y = s.spin;
      s.mat.opacity = 0;
      return s;
    },
    update(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        if (s.life <= 0) { s.mesh.visible = false; continue; }
        s.vel.y -= 9.8 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.mesh.position.y < 0.03) { s.mesh.position.y = 0.03; s.vel.y *= -0.4; }
        s.mesh.material.opacity = Math.min(1, s.life * 3);
      }
      for (const f of flashes) {
        if (f.life <= 0) continue;
        f.life -= dt;
        if (f.life <= 0) f.mesh.visible = false;
      }
      flashLight.intensity = Math.max(0, flashLight.intensity - dt * 500);
      if (boomLife > 0) {
        boomLife -= dt;
        const k = 1 - Math.max(0, boomLife) / 0.28;
        boom.scale.setScalar(0.6 + k * 4.4);
        boom.material.opacity = 1 - k;
        if (boomLife <= 0) boom.visible = false;
      }
      for (const s of smokes) {
        if (!s.active) continue;
        s.t -= dt;
        const target = s.t > 1 ? 0.92 : Math.max(0, s.t) * 0.92;
        s.mat.opacity += (target - s.mat.opacity) * Math.min(1, dt * 5);
        s.mesh.rotation.y += dt * 0.06; // slow billow, no allocation
        if (s.t <= 0) { s.active = false; s.mesh.visible = false; }
      }
    },
  };
}
