// BREAKLINE — polished fixed 60 Hz simulation & render loop.
import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { moveCircle, rayWorld, rayCollider, raySphere } from './physics.js';
import { WEAPONS, damageAt, freshWeapon, createViewmodel } from './weapons.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createCombatant, updateBot, updateBotVisual, BOT_NAMES } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';

const FIXED = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const initialTeam = params.get('team') === 'def' ? 'def' : 'att';

function mulberry32(a) {
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(shot ? seed * 7919 : (Date.now() % 2147483647) + 1);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
// No flat background colour: the map's gradient sky dome is the backdrop.
scene.fog = new THREE.Fog(P.fog, 60, 185);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

const hemi = new THREE.HemisphereLight(P.hemiSky, P.hemiGround, 1.2);
scene.add(hemi);
// Sky bounce from the north-west: the high sun still leaves a soft shade
// side on south faces, so a gentle shadowless fill keeps walls and
// containers reading clean instead of crushing dark.
const fill = new THREE.DirectionalLight(0xd6e7f5, 0.65);
fill.position.set(-24, 26, -28);
scene.add(fill);
const sun = new THREE.DirectionalLight(P.sun, P.sunIntensity);
sun.position.set(...P.sunPos);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -42;
sun.shadow.camera.right = 42;
sun.shadow.camera.top = 42;
sun.shadow.camera.bottom = -42;
sun.shadow.camera.far = 140;
sun.shadow.bias = -0.0009;
scene.add(sun);

const map = createMap(scene);
const effects = createEffects(scene);
const audio = createAudio();

const S = {
  scene, camera, rng, time: 0,
  phase: 'idle', phaseT: 0, round: 0, scores: { att: 0, def: 0 }, targetSite: 'A',
  map, effects, audio,
  entities: [], noise: [], smokes: [], droppedWeapons: [],
  charge: { carrier: null, planted: false, site: null, x: 0, z: 0, channel: null, dropped: null },
  hud: null, rounds: null,
  botShoot, channelPlant: null, channelDefuse: null, botArrived: null,
  isBlockedBySmoke, switchSides,
};

// --- Spatial Helpers (3D Elevation & Smoke Occlusion) -------------------------
function getFloorHeight(x, z, radius, currentY) {
  let floorY = 0;
  for (const c of map.colliders) {
    if (!c.h || c.h <= 0) continue;
    if (Math.abs(x - c.x) < c.hx + radius && Math.abs(z - c.z) < c.hz + radius) {
      if (currentY >= c.h - 0.35 && c.h > floorY) {
        floorY = c.h;
      }
    }
  }
  return floorY;
}

function activeCollidersAt(y) {
  return map.colliders.filter((c) => !c.h || y < c.h - 0.15);
}

function isBlockedBySmoke(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  for (const sm of S.smokes) {
    if (S.time >= sm.until) continue;
    let t = lenSq > 0 ? ((sm.x - ax) * dx + (sm.z - az) * dz) / lenSq : 0;
    t = THREE.MathUtils.clamp(t, 0, 1);
    const px = ax + t * dx;
    const pz = az + t * dz;
    if (Math.hypot(sm.x - px, sm.z - pz) <= sm.r * 0.85) return true;
  }
  return false;
}

// --- Combatants & Teams -------------------------------------------------------
const player = createCombatant(scene, initialTeam, 'YOU', true);
player.vel = { x: 0, z: 0 };
player.vy = 0;
player.grounded = true;
player.pitch = 0;
player.eyeCur = 1.62;
player.weaponSlot = 'gun';
player.nadeType = 'frag';
player.throwAt = 0;
player.stepAcc = 0;
player.triggerWas = false;
player.aimAlpha = 0;
S.entities.push(player);

const attCount = initialTeam === 'att' ? 4 : 5;
const defCount = initialTeam === 'def' ? 4 : 5;
for (let i = 0; i < attCount; i += 1) S.entities.push(createCombatant(scene, 'att', BOT_NAMES.att[i]));
for (let i = 0; i < defCount; i += 1) S.entities.push(createCombatant(scene, 'def', BOT_NAMES.def[i]));

function switchSides() {
  for (const e of S.entities) {
    e.team = e.team === 'att' ? 'def' : 'att';
  }
  const prevAtt = S.scores.att;
  S.scores.att = S.scores.def;
  S.scores.def = prevAtt;
}

const viewmodel = createViewmodel(camera);
const hud = createHud(S);
S.hud = hud;
const rounds = createRounds(S);
S.rounds = rounds;
S.channelPlant = rounds.channelPlant;
S.channelDefuse = rounds.channelDefuse;
S.botArrived = rounds.botArrived;

// --- Spectator State ----------------------------------------------------------
let spectateTarget = null;
let spectateYaw = 0;
let spectatePitch = 0;

function cycleSpectator(dir = 1) {
  const mates = S.entities.filter((e) => !e.isPlayer && e.alive && e.team === player.team);
  if (spectateTarget && spectateTarget.mesh) spectateTarget.mesh.visible = true;
  if (!mates.length) {
    spectateTarget = null;
    return;
  }
  const idx = mates.indexOf(spectateTarget);
  spectateTarget = mates[(idx + dir + mates.length) % mates.length];
  spectateYaw = spectateTarget.yaw;
  spectatePitch = 0;
}

function clearSpectator() {
  if (spectateTarget && spectateTarget.mesh) spectateTarget.mesh.visible = true;
  spectateTarget = null;
}

// --- Dropped Weapons ----------------------------------------------------------
const dropGeo = new THREE.BoxGeometry(0.14, 0.14, 0.68);
const dropMat = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.45, metalness: 0.6 });

function spawnDroppedWeapon(weaponState, x, y, z) {
  if (!weaponState || weaponState.def.id === 'pistol') return;
  const mesh = new THREE.Mesh(dropGeo, dropMat);
  mesh.position.set(x, y + 0.08, z);
  mesh.rotation.y = rng() * Math.PI * 2;
  mesh.castShadow = true;
  scene.add(mesh);
  S.droppedWeapons.push({ weapon: weaponState, mesh, pos: mesh.position, spawnedAt: S.time });
}

function clearDroppedWeapons() {
  for (const d of S.droppedWeapons) scene.remove(d.mesh);
  S.droppedWeapons.length = 0;
}

function getNearbyDroppedWeapon() {
  let nearest = null;
  let bestDist = 2.1;
  for (const d of S.droppedWeapons) {
    const dist = Math.hypot(player.pos.x - d.pos.x, player.pos.z - d.pos.z);
    if (dist < bestDist && Math.abs(player.pos.y - d.pos.y) < 1.4) {
      bestDist = dist;
      nearest = d;
    }
  }
  return nearest;
}

function tryPickupOrSwapWeapon() {
  const nearest = getNearbyDroppedWeapon();
  if (!nearest) return false;
  const slot = nearest.weapon.def.id === 'sniper' ? 'sniper' : 'primary';
  const oldWeapon = player.weapons[slot];
  if (oldWeapon) spawnDroppedWeapon(oldWeapon, player.pos.x, player.pos.y, player.pos.z);

  player.weapons[slot] = nearest.weapon;
  scene.remove(nearest.mesh);
  S.droppedWeapons.splice(S.droppedWeapons.indexOf(nearest), 1);
  selectWeapon(slot);
  audio.reload();
  return true;
}

function dropCurrentWeapon() {
  if (player.weaponSlot !== 'gun' || !player.current) return;
  const id = player.current.def.id;
  if (id === 'pistol') return;
  const slot = id === 'sniper' ? 'sniper' : 'primary';
  spawnDroppedWeapon(player.current, player.pos.x, player.pos.y, player.pos.z);
  player.weapons[slot] = null;
  const fallback = player.weapons.primary ? 'primary' : player.weapons.sniper ? 'sniper' : 'pistol';
  selectWeapon(fallback);
}

// --- Lock & Overlay -----------------------------------------------------------
let started = false;
let paused = false;
let frozen = false;
const input = createInput(renderer.domElement, onLockChange);

hud.onPlay(() => {
  audio.resume();
  if (S.phase === 'matchover' || !started) {
    started = true;
    rounds.startMatch();
  }
  paused = false;
  hud.hideOverlay();
  document.getElementById('hud').hidden = false;
  input.requestLock();
});

function onLockChange(locked) {
  if (shot || input.isTouch) return;
  if (!locked && started && !paused && S.phase !== 'matchover') {
    paused = true;
    hud.overlay('PAUSED', 'The match is waiting. Click below to jump back in.', 'RESUME');
  }
}

// --- Damage -------------------------------------------------------------------
function damageEntity(victim, raw, head, attacker) {
  if (!victim.alive || S.phase === 'over' || S.phase === 'matchover') return;
  let dmg = raw;
  if (victim.armor > 0) {
    victim.armor = Math.max(0, victim.armor - raw * 0.45);
    dmg = raw * 0.55;
  }
  victim.hp -= dmg;
  victim.flinch = 1;
  if (attacker && attacker.isPlayer) {
    hud.hitmark(head);
    audio.hit(head);
  }
  if (victim.isPlayer) {
    hud.damageFlash();
    audio.hurt();
  }
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.deathT = 0;
    if (victim.weapons) {
      const dropW = victim.weapons.sniper || victim.weapons.primary;
      if (dropW) spawnDroppedWeapon(dropW, victim.pos.x, victim.pos.y, victim.pos.z);
    }
    if (attacker) {
      attacker.stats.kills += 1;
      hud.killfeed(attacker.name, victim.name, head, attacker.team);
      if (attacker.isPlayer) audio.hit(true);
    }
    rounds.onDeath(victim, attacker);
    if (victim.isPlayer) {
      cycleSpectator(1);
      hud.banner('YOU WERE ELIMINATED', 'Click or press SPACE to switch teammate camera', 3200);
    }
  }
}

// --- Bot Fire (With Wall & Smoke Occlusion) -----------------------------------
const _mv = new THREE.Vector3();
const _losDir = new THREE.Vector3();

function botShoot(shooter, target) {
  if (S.phase !== 'live' && S.phase !== 'planted') return;
  const w = shooter.current;
  if (!w || w.mag <= 0) return;

  if (isBlockedBySmoke(shooter.pos.x, shooter.pos.z, target.pos.x, target.pos.z)) return;
  const eyeY = shooter.pos.y + 1.45;
  const targetChestY = target.pos.y + 1.15;
  _losDir.set(target.pos.x - shooter.pos.x, targetChestY - eyeY, target.pos.z - shooter.pos.z);
  const dist3D = _losDir.length();
  if (dist3D > 0.001) {
    _losDir.divideScalar(dist3D);
    const wallT = rayWorld(shooter.pos.x, eyeY, shooter.pos.z, _losDir.x, _losDir.y, _losDir.z, map.colliders, dist3D);
    if (wallT < dist3D - 0.25) return;
  }

  w.mag -= 1;
  shooter.stats.shots += 1;
  const dx = target.pos.x - shooter.pos.x;
  const dz = target.pos.z - shooter.pos.z;
  const dist = Math.hypot(dx, dz);
  const targetSpeed = target.isPlayer ? Math.hypot(player.vel.x, player.vel.z) : target.speedNow;
  let p = 0.6 - dist * 0.0105 - targetSpeed * 0.028 - (shooter.speedNow > 0.5 ? 0.13 : 0);
  if (target.isPlayer && !player.grounded) p -= 0.07;
  p = THREE.MathUtils.clamp(p, 0.05, 0.62);
  const hit = rng() < p;
  const head = hit && rng() < 0.16;

  _mv.set(
    shooter.pos.x - Math.sin(shooter.yaw) * 0.5 + Math.cos(shooter.yaw) * 0.3,
    shooter.pos.y + 1.38,
    shooter.pos.z - Math.cos(shooter.yaw) * 0.5 - Math.sin(shooter.yaw) * 0.3
  );
  const aimY = target.pos.y + (head ? 1.62 : 1.15);
  const end = new THREE.Vector3(target.pos.x, aimY, target.pos.z);
  if (!hit) {
    end.x += (rng() - 0.5) * 3.2;
    end.y += (rng() - 0.5) * 1.6 + 0.4;
    end.z += (rng() - 0.5) * 3.2;
  }
  effects.tracer(_mv, end);
  effects.muzzle(_mv, camera.position);
  audio.shot(w.def.id, Math.hypot(player.pos.x - shooter.pos.x, player.pos.z - shooter.pos.z));
  S.noise.push({ x: shooter.pos.x, z: shooter.pos.z, t: S.time, radius: 26, team: shooter.team });
  if (hit) {
    shooter.stats.hits += 1;
    damageEntity(target, damageAt(w.def, dist) * (head ? w.def.headMult : 1), head, shooter);
    effects.impact(end, true);
  }
}

// --- Player Fire --------------------------------------------------------------
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _end = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function currentSpread() {
  const w = player.current;
  if (!w) return 0;
  const speed = Math.hypot(player.vel.x, player.vel.z);
  const move = THREE.MathUtils.clamp(speed / 5.2, 0, 1) + (player.grounded ? 0 : 0.7);
  let s = w.def.spread + w.def.moveSpread * move + w.bloom;
  if (input.aiming) s *= 0.65;
  return s;
}

function playerShoot() {
  const w = player.current;
  const now = S.time;
  if (w.reloadUntil || (w.equipUntil && now < w.equipUntil)) return;
  if (w.mag <= 0) {
    audio.dry();
    startReload();
    w.nextShotAt = now + 0.3;
    return;
  }
  w.mag -= 1;
  w.nextShotAt = now + w.def.interval;
  w.bloom = Math.min(w.def.maxBloom, w.bloom + w.def.bloom);
  player.stats.shots += 1;

  camera.getWorldDirection(_dir);
  _right.crossVectors(_dir, camera.up).normalize();
  _up.crossVectors(_right, _dir);
  const spread = currentSpread();
  _dir.addScaledVector(_right, (rng() * 2 - 1) * spread).addScaledVector(_up, (rng() * 2 - 1) * spread).normalize();

  _origin.copy(camera.position);
  let bestT = rayWorld(_origin.x, _origin.y, _origin.z, _dir.x, _dir.y, _dir.z, map.colliders, 160);
  let bestBot = null;
  let bestHead = false;

  for (const e of S.entities) {
    if (!e.alive || e.team === player.team) continue;
    const th = raySphere(_origin.x, _origin.y, _origin.z, _dir.x, _dir.y, _dir.z, e.pos.x, e.pos.y + 1.62, e.pos.z, 0.21);
    if (th < bestT) { bestT = th; bestBot = e; bestHead = true; }
    const tb = rayCollider(_origin.x, _origin.y, _origin.z, _dir.x, _dir.y, _dir.z, { x: e.pos.x, z: e.pos.z, y: e.pos.y, hx: 0.3, hz: 0.3, h: e.pos.y + 1.45 });
    if (tb < bestT) { bestT = tb; bestBot = e; bestHead = false; }
  }

  _end.copy(_origin).addScaledVector(_dir, bestT);
  viewmodel.muzzle.getWorldPosition(_muzzle);
  effects.tracer(_muzzle, _end);
  effects.muzzle(_muzzle, camera.position);
  audio.shot(w.def.id, 0);
  S.noise.push({ x: player.pos.x, z: player.pos.z, t: now, radius: 27, team: player.team });

  player.pitch += w.def.recoil * (0.85 + rng() * 0.4);
  player.yaw += (rng() - 0.5) * w.def.recoil * 0.5;
  viewmodel.kick(0.3 + w.def.recoil * 9);

  if (bestBot) {
    player.stats.hits += 1;
    damageEntity(bestBot, damageAt(w.def, bestT) * (bestHead ? w.def.headMult : 1), bestHead, player);
    effects.impact(_end, true);
  } else if (bestT < 160) {
    effects.impact(_end, false);
  }
  hud.refresh(0);
}

function startReload() {
  const w = player.current;
  if (!w || w.reloadUntil || (w.equipUntil && S.time < w.equipUntil) || w.mag >= w.def.mag || w.reserve <= 0) return;
  w.reloadUntil = S.time + w.def.reload;
  audio.reload();
}

// --- Grenades (3D Surface Bounce & Active Smoke Zones) -------------------------
const nadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const nadeMats = {
  frag: new THREE.MeshStandardMaterial({ color: 0x51683c, roughness: 0.6 }),
  smoke: new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.6 }),
};
const nades = [];
for (let i = 0; i < 8; i += 1) {
  const mesh = new THREE.Mesh(nadeGeo, nadeMats.frag);
  mesh.visible = false;
  scene.add(mesh);
  nades.push({ mesh, pos: mesh.position, vel: new THREE.Vector3(), type: 'frag', fuse: 0, active: false, by: null });
}

function throwNade(type, by, from, dir) {
  const n = nades.find((x) => !x.active) || nades[0];
  n.active = true;
  n.type = type;
  n.by = by;
  n.mesh.material = nadeMats[type];
  n.mesh.visible = true;
  n.pos.copy(from);
  n.vel.copy(dir).multiplyScalar(15.5);
  n.vel.y += 3.4;
  n.fuse = type === 'frag' ? 1.5 : 1.1;
  audio.throwNade();
}

const _nadeFrom = new THREE.Vector3();
const _nadeDir = new THREE.Vector3();
S.throwNadeAt = (e, type, tx, tz) => {
  if (e.nades[type] <= 0) return;
  e.nades[type] -= 1;
  _nadeFrom.set(e.pos.x, e.pos.y + 1.55, e.pos.z);
  _nadeDir.set(tx - e.pos.x, 3.2, tz - e.pos.z).normalize();
  throwNade(type, e, _nadeFrom, _nadeDir);
};

function stepNades(dt) {
  for (const n of nades) {
    if (!n.active) continue;
    n.fuse -= dt;
    n.vel.y -= 15 * dt;

    const beforeX = n.pos.x;
    const beforeZ = n.pos.z;
    const colliders = activeCollidersAt(n.pos.y);
    moveCircle(n.pos, 0.09, n.vel.x * dt, n.vel.z * dt, colliders);
    if (Math.abs(n.pos.x - beforeX) < Math.abs(n.vel.x * dt) * 0.4) n.vel.x *= -0.42;
    if (Math.abs(n.pos.z - beforeZ) < Math.abs(n.vel.z * dt) * 0.4) n.vel.z *= -0.42;

    n.pos.y += n.vel.y * dt;
    const floorY = getFloorHeight(n.pos.x, n.pos.z, 0.09, n.pos.y) + 0.09;
    if (n.pos.y < floorY) {
      n.pos.y = floorY;
      if (n.vel.y < -1.4) audio.bounce();
      n.vel.y *= -0.38;
      n.vel.x *= 0.72;
      n.vel.z *= 0.72;
    }

    if (n.fuse <= 0) {
      n.active = false;
      n.mesh.visible = false;
      if (n.type === 'frag') {
        effects.explosion(n.pos);
        audio.explode();
        for (const e of S.entities) {
          if (!e.alive) continue;
          const dx = e.pos.x - n.pos.x;
          const dy = (e.pos.y + 1.0) - (n.pos.y + 0.25);
          const dz = e.pos.z - n.pos.z;
          const d = Math.hypot(dx, dy, dz);
          if (d > 5.8) continue;
          const invD = 1 / (d || 1);
          const clear = rayWorld(n.pos.x, n.pos.y + 0.25, n.pos.z, dx * invD, dy * invD, dz * invD, map.colliders, d) >= d - 0.15;
          if (clear) damageEntity(e, 95 * (1 - d / 6.2), false, n.by);
        }
      } else {
        effects.smoke(n.pos, 3.4, 9);
        S.smokes.push({ x: n.pos.x, y: n.pos.y, z: n.pos.z, r: 3.4, until: S.time + 9 });
        audio.smokePop();
      }
    }
  }
}

// --- Player Step --------------------------------------------------------------
let lastPhase = 'idle';

function playerStep(dt) {
  const p = player;
  const look = input.lookDelta();

  if (S.phase !== lastPhase) {
    if (S.phase === 'buy') {
      clearSpectator();
      clearDroppedWeapons();
    }
    lastPhase = S.phase;
  }

  // Spectator Camera Controls when eliminated.
  if (!p.alive && (S.phase === 'live' || S.phase === 'planted')) {
    if (!spectateTarget || !spectateTarget.alive) cycleSpectator(1);
    if ((input.firing && !p.triggerWas) || input.pressed.has('Space')) cycleSpectator(1);
    spectateYaw -= look.x * 0.0021;
    spectatePitch = THREE.MathUtils.clamp(spectatePitch - look.y * 0.0021, -1.2, 1.2);
    p.triggerWas = input.firing;
    viewmodel.root.visible = false;
    hud.setScope(false);
    return;
  }

  if (p.alive && S.phase !== 'idle' && S.phase !== 'matchover') {
    p.yaw -= look.x * 0.0021;
    p.pitch -= look.y * 0.0021;
    p.pitch = THREE.MathUtils.clamp(p.pitch, -1.45, 1.45);
  }

  const crouch = input.keys.has('ControlLeft') || input.keys.has('ControlRight') || input.keys.has('KeyC');
  const walk = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const targetEye = !p.alive ? 0.5 : crouch ? 1.12 : 1.62;
  p.eyeCur += (targetEye - p.eyeCur) * Math.min(1, dt * 11);

  if (p.alive && (S.phase === 'live' || S.phase === 'planted')) {
    let fwd = 0;
    let strafe = 0;
    if (input.keys.has('KeyW')) fwd += 1;
    if (input.keys.has('KeyS')) fwd -= 1;
    if (input.keys.has('KeyD')) strafe += 1;
    if (input.keys.has('KeyA')) strafe -= 1;
    fwd += -input.touchMove.y;
    strafe += input.touchMove.x;
    const len = Math.hypot(fwd, strafe);
    if (len > 1) { fwd /= len; strafe /= len; }

    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    const wishX = -sin * fwd + cos * strafe;
    const wishZ = -cos * fwd - sin * strafe;
    const w = p.current;
    const maxSpeed = 5.2 * (w ? w.def.speed : 1) * (crouch ? 0.42 : walk ? 0.55 : 1);
    const accel = p.grounded ? 42 : 5;
    p.vel.x += THREE.MathUtils.clamp(wishX * maxSpeed - p.vel.x, -accel * dt, accel * dt);
    p.vel.z += THREE.MathUtils.clamp(wishZ * maxSpeed - p.vel.z, -accel * dt, accel * dt);

    if (input.pressed.has('Space') && p.grounded) {
      p.vy = 5.1;
      p.grounded = false;
    }

    // Weapon & Utility Handling.
    if (input.pressed.has('Digit1')) selectWeapon('pistol');
    if (input.pressed.has('Digit2')) selectWeapon('primary');
    if (input.pressed.has('Digit3')) selectWeapon('sniper');
    if (input.pressed.has('Digit4')) selectNade();
    if (input.pressed.has('KeyR')) startReload();
    if (input.pressed.has('KeyQ')) quickThrow();
    if (input.pressed.has('KeyG')) dropCurrentWeapon();
    if (input.pressed.has('KeyF')) tryPickupOrSwapWeapon();

    if (w && w.reloadUntil && S.time >= w.reloadUntil) {
      const take = Math.min(w.def.mag - w.mag, w.reserve);
      w.mag += take;
      w.reserve -= take;
      w.reloadUntil = 0;
    }

    if (p.weaponSlot === 'nade') {
      if (input.firing && !p.triggerWas) throwSelected();
    } else if (w) {
      const wantFire = input.firing && (w.def.auto || !p.triggerWas);
      if (wantFire && S.time >= w.nextShotAt) playerShoot();
      w.bloom = Math.max(0, w.bloom - dt * 0.028);
    }

    // Plant (Attacker) or Defuse (Defender) with KeyE.
    if (p.team === 'att') {
      const site = map.sites[S.targetSite];
      const inSite = Math.hypot(p.pos.x - site.x, p.pos.z - site.z) < site.r;
      if (p.hasCharge && inSite && input.keys.has('KeyE') && !S.charge.planted) {
        rounds.channelPlant(p, dt);
      } else if (S.charge.channel && S.charge.channel.by === p) {
        S.charge.channel = null;
        hud.plantBar(null);
      }
    } else if (p.team === 'def' && S.charge.planted && typeof rounds.channelDefuse === 'function') {
      const nearCharge = Math.hypot(p.pos.x - S.charge.x, p.pos.z - S.charge.z) < 2.4;
      if (nearCharge && input.keys.has('KeyE')) {
        rounds.channelDefuse(p, dt);
      } else if (S.charge.channel && S.charge.channel.by === p) {
        S.charge.channel = null;
        hud.plantBar(null);
      }
    }
  }

  p.triggerWas = input.firing;
  if (S.phase !== 'live' && S.phase !== 'planted') {
    p.vel.x *= Math.max(0, 1 - dt * 10);
    p.vel.z *= Math.max(0, 1 - dt * 10);
  }

  // 3D Vertical & Horizontal Collision.
  p.vy -= 12.5 * dt;
  p.pos.y += p.vy * dt;
  const floorY = getFloorHeight(p.pos.x, p.pos.z, p.radius, p.pos.y);
  if (p.pos.y <= floorY) {
    p.pos.y = floorY;
    p.vy = 0;
    p.grounded = true;
  } else {
    p.grounded = false;
  }
  moveCircle(p.pos, p.radius, p.vel.x * dt, p.vel.z * dt, activeCollidersAt(p.pos.y));

  p.speedNow = Math.hypot(p.vel.x, p.vel.z);
  if (p.grounded && p.speedNow > 3.6) {
    p.stepAcc += p.speedNow * dt;
    if (p.stepAcc > 2.6) {
      p.stepAcc = 0;
      audio.step(true);
      S.noise.push({ x: p.pos.x, z: p.pos.z, t: S.time, radius: 9, team: p.team });
    }
  }

  // Scope / Aim State.
  const canAim = p.weaponSlot === 'gun' && p.current && (!p.current.equipUntil || S.time >= p.current.equipUntil) && !p.current.reloadUntil;
  const scoped = canAim && p.current.def.zoom > 0 && input.aiming;
  const targetAim = canAim && input.aiming ? 1 : 0;
  p.aimAlpha += (targetAim - p.aimAlpha) * Math.min(1, dt * 14);

  camera.fov += ((scoped ? 74 / p.current.def.zoom : input.aiming && canAim ? 64 : 74) - camera.fov) * 0.4;
  camera.updateProjectionMatrix();
  hud.setScope(scoped);
  viewmodel.root.visible = !scoped;
  hud.setCrosshairSpread(5 + currentSpread() * 340);
}

const EQUIP_TIMES = { pistol: 0.22, rifle: 0.36, smg: 0.3, shotgun: 0.4, sniper: 0.55 };

function selectWeapon(slot) {
  const w = player.weapons[slot];
  if (!w) return;
  player.weaponSlot = 'gun';
  player.current = w;
  w.reloadUntil = 0;
  w.equipUntil = S.time + (EQUIP_TIMES[w.def.id] ?? 0.32);
  viewmodel.show(w.def.id);
  viewmodel.kick(0.22);
  hud.setScope(false);
}

function selectNade() {
  if (player.weaponSlot === 'nade') {
    player.nadeType = player.nadeType === 'frag' ? 'smoke' : 'frag';
    if (player.nades[player.nadeType] === 0) player.nadeType = player.nadeType === 'frag' ? 'smoke' : 'frag';
  }
  if (player.nades.frag === 0 && player.nades.smoke === 0) return;
  if (player.nades[player.nadeType] === 0) player.nadeType = player.nadeType === 'frag' ? 'smoke' : 'frag';
  player.weaponSlot = 'nade';
  viewmodel.show('nade');
}

function throwSelected() {
  const type = player.nadeType;
  if (player.nades[type] <= 0 || S.time < player.throwAt) return;
  player.nades[type] -= 1;
  player.throwAt = S.time + 0.55;
  camera.getWorldDirection(_dir);
  _origin.copy(camera.position);
  throwNade(type, player, _origin, _dir);
  if (player.nades.frag === 0 && player.nades.smoke === 0) {
    selectWeapon(player.weapons.primary ? 'primary' : 'pistol');
  }
}

function quickThrow() {
  const type = player.nades.frag > 0 ? 'frag' : player.nades.smoke > 0 ? 'smoke' : null;
  if (!type || S.time < player.throwAt) return;
  player.nades[type] -= 1;
  player.throwAt = S.time + 0.55;
  camera.getWorldDirection(_dir);
  _origin.copy(camera.position);
  throwNade(type, player, _origin, _dir);
}

// --- Buy Input ----------------------------------------------------------------
function buyStep() {
  if (S.phase !== 'buy') return;
  for (let i = 0; i < 6; i += 1) {
    if (input.pressed.has(`Digit${i + 1}`)) hud.buyByIndex(i);
  }
  if (input.pressed.has('KeyB')) {
    const menu = document.getElementById('buy-menu');
    hud.showBuy(!menu.classList.contains('on'));
  }
}

// --- Sim Step -----------------------------------------------------------------
function step(dt) {
  S.time += dt;
  rounds.update(dt);
  playerStep(dt);
  buyStep();
  if (S.phase !== 'buy' && S.phase !== 'idle') {
    for (const e of S.entities) if (!e.isPlayer) updateBot(S, e, dt);
  }
  for (const e of S.entities) if (!e.isPlayer) updateBotVisual(e, dt);
  stepNades(dt);
  effects.update(dt);

  while (S.noise.length && S.time - S.noise[0].t > 1.6) S.noise.shift();
  while (S.smokes.length && S.time >= S.smokes[0].until) S.smokes.shift();
  input.endFrame();
}

function syncCamera() {
  if (!player.alive && spectateTarget && spectateTarget.alive && (S.phase === 'live' || S.phase === 'planted')) {
    if (spectateTarget.mesh) spectateTarget.mesh.visible = false;
    camera.position.set(spectateTarget.pos.x, spectateTarget.pos.y + 1.62, spectateTarget.pos.z);
    camera.rotation.set(spectatePitch, spectateYaw, 0, 'YXZ');
    return;
  }
  camera.position.set(player.pos.x, player.pos.y + player.eyeCur, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

let accumulator = 0;
let lastTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && started && !paused) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED && steps < 5) {
      step(FIXED);
      accumulator -= FIXED;
      steps += 1;
    }
    if (accumulator > FIXED * 5) accumulator = 0;
  }
  syncCamera();
  const speed = Math.hypot(player.vel.x, player.vel.z);
  const reloadRatio = player.current && player.current.reloadUntil
    ? 1 - Math.max(0, (player.current.reloadUntil - S.time) / player.current.def.reload)
    : 0;
  viewmodel.update(dt, speed, player.grounded, Math.max(player.aimAlpha, reloadRatio));
  hud.refresh(dt);
  renderer.render(scene, camera);
}

// --- Screenshot Poses ---------------------------------------------------------
function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED);
}
function poseFreeze(frames = 3) {
  for (const e of S.entities) {
    if (e.mesh) {
      e.mesh.position.copy(e.pos);
      e.mesh.rotation.set(0, e.yaw, 0);
    }
  }
  hud.refresh(0);
  let painted = 0;
  (function paint() {
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted >= frames) {
      window.__shotReady = true;
      frozen = true;
      return;
    }
    requestAnimationFrame(paint);
  })();
}
function givePlayerRifle(money) {
  player.weapons.primary = freshWeapon('rifle');
  selectWeapon('primary');
  player.money = money;
}
function runShot(name) {
  started = true;
  document.getElementById('overlay').classList.remove('on');
  document.getElementById('hud').hidden = false;
  rounds.startMatch();
  S.phaseT = 999;
  const warden = S.entities[6];
  const mate = S.entities[1];
  if (name === 'buy') {
    player.money = 4650;
    S.phaseT = 9;
    hud.refreshBuy();
    hud.showBuy(true);
    player.pos.set(-4.5, 0, 24);
    player.yaw = 0.5;
    poseFreeze();
    return;
  }
  if (name === 'overview') {
    document.getElementById('hud').hidden = true;
    viewmodel.root.visible = false;
    camera.position.set(27, 36, 31);
    camera.lookAt(0, 0, -5);
    let painted = 0;
    (function paint() {
      renderer.render(scene, camera);
      painted += 1;
      if (painted >= 3) { window.__shotReady = true; frozen = true; return; }
      requestAnimationFrame(paint);
    })();
    return;
  }
  S.phase = 'live';
  S.phaseT = 83;
  givePlayerRifle(2350);
  player.armor = 65;
  if (name === 'cover') {
    S.buyOpen = false;
    hud.showBuy(false);
    player.pos.set(0.5, 0, 7);
    player.hp = 82;
    warden.pos.set(1.6, 0, -1.5);
    warden.yaw = Math.PI + 0.15;
    warden.weapons.primary = freshWeapon('rifle');
    warden.current = warden.weapons.primary;
    mate.pos.set(-3.4, 0, 10);
    mate.yaw = 0.1;
    player.yaw = Math.atan2(-(warden.pos.x - player.pos.x), -(warden.pos.z - player.pos.z));
    settle(2);
    syncCamera();
    playerShoot();
    hud.killfeed('YOU', warden.name, true, 'att');
    hud.banner('', '', 0);
    poseFreeze();
    return;
  }
  if (name === 'site') {
    S.buyOpen = false;
    hud.showBuy(false);
    S.targetSite = 'A';
    S.phase = 'planted';
    S.phaseT = 17;
    S.charge.planted = true;
    S.charge.site = 'A';
    S.charge.x = -19;
    S.charge.z = -20;
    player.pos.set(-12.5, 0, -16.5);
    player.yaw = Math.atan2(-(-19 - player.pos.x), -(-20 - player.pos.z));
    warden.pos.set(-17.5, 0, -21.5);
    warden.yaw = Math.atan2(-(player.pos.x - warden.pos.x), -(player.pos.z - warden.pos.z));
    mate.pos.set(-24, 0, -15);
    mate.yaw = Math.atan2(-(-11 - mate.pos.x), -(-20 - mate.pos.z));
    hud.banner('CHARGE PLANTED', 'Site A — 17 seconds', 60000);
    poseFreeze();
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__breakline = { S, rounds, player, switchSides, getNearbyDroppedWeapon };
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
