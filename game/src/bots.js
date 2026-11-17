// Bots: the nine combatants who are not the player. Each is a small state
// machine — advance along waypoint routes, hold an angle, engage what it
// sees, hunt what it heard, plant or defuse the Charge — over one shared
// entity shape that the player also uses. Perception is a vision cone plus
// line of sight, and gunfire noise events; shooting is burst fire with a
// reaction delay and distance/movement accuracy, resolved by main.
import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { moveCircle, losClear } from './physics.js';
import { freshWeapon } from './weapons.js';

export const BOT_NAMES = {
  att: ['Rook', 'Sable', 'Juno', 'Pike'],
  def: ['Vex', 'Halo', 'Onyx', 'Rune', 'Fable'],
};
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const teamMat = {
  att: new THREE.MeshStandardMaterial({ color: P.vanguard, roughness: 0.8 }),
  attDark: new THREE.MeshStandardMaterial({ color: P.vanguardDark, roughness: 0.85 }),
  def: new THREE.MeshStandardMaterial({ color: P.warden, roughness: 0.8 }),
  defDark: new THREE.MeshStandardMaterial({ color: P.wardenDark, roughness: 0.85 }),
  leg: new THREE.MeshStandardMaterial({ color: 0x33363c, roughness: 0.95 }),
  skin: new THREE.MeshStandardMaterial({ color: P.skin, roughness: 0.7 }),
  gun: new THREE.MeshStandardMaterial({ color: P.gunmetal, roughness: 0.5, metalness: 0.4 }),
  visor: new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.25, metalness: 0.6 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.9 }),
};

function part(group, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  group.add(m);
  return m;
}

export function createBotMesh(team) {
  const g = new THREE.Group();
  const main = teamMat[team];
  const dark = teamMat[`${team}Dark`];
  part(g, teamMat.leg, -0.11, 0.4, 0, 0.17, 0.8, 0.2);
  part(g, teamMat.leg, 0.11, 0.4, 0, 0.17, 0.8, 0.2);
  part(g, teamMat.boot, -0.11, 0.05, -0.02, 0.19, 0.1, 0.26); // boots
  part(g, teamMat.boot, 0.11, 0.05, -0.02, 0.19, 0.1, 0.26);
  const torso = part(g, main, 0, 1.12, 0, 0.52, 0.62, 0.28);
  part(g, dark, 0, 1.14, -0.16, 0.44, 0.5, 0.06); // vest plate, faces -z
  part(g, dark, -0.11, 1.06, -0.2, 0.16, 0.2, 0.05); // vest pouches
  part(g, dark, 0.11, 1.06, -0.2, 0.16, 0.2, 0.05);
  part(g, dark, 0, 1.15, 0.19, 0.4, 0.5, 0.12); // backpack
  part(g, teamMat.skin, 0, 1.62, 0, 0.24, 0.26, 0.24); // head
  part(g, teamMat.visor, 0, 1.64, -0.125, 0.2, 0.07, 0.02); // visor strip
  part(g, dark, 0, 1.76, 0, 0.28, 0.1, 0.28); // helmet
  part(g, dark, 0, 1.7, -0.02, 0.33, 0.04, 0.35); // helmet brim
  part(g, main, -0.33, 1.18, -0.05, 0.13, 0.5, 0.16); // arms
  part(g, main, 0.33, 1.18, -0.05, 0.13, 0.5, 0.16);
  part(g, main, -0.34, 1.42, -0.02, 0.17, 0.1, 0.21); // shoulder pads
  part(g, main, 0.34, 1.42, -0.02, 0.17, 0.1, 0.21);
  part(g, teamMat.gun, 0.3, 1.32, -0.34, 0.07, 0.09, 0.52); // rifle
  part(g, teamMat.gun, 0.3, 1.17, -0.3, 0.05, 0.15, 0.06); // rifle magazine
  part(g, teamMat.gun, 0.3, 1.34, -0.02, 0.06, 0.07, 0.16); // rifle stock
  g.userData.torso = torso;
  return g;
}

export function createCombatant(scene, team, name, isPlayer = false) {
  const e = {
    id: `${team}-${name}`,
    team,
    name,
    isPlayer,
    pos: new THREE.Vector3(),
    yaw: 0,
    hp: 100,
    armor: 0,
    alive: true,
    radius: 0.35,
    eye: 1.62,
    weapons: { pistol: freshWeapon('pistol'), primary: null, sniper: null },
    current: null,
    nades: { frag: 0, smoke: 0 },
    money: 800,
    hasCharge: false,
    speedNow: 0,
    flinch: 0,
    deathT: -1,
    ai: null,
    stats: { shots: 0, hits: 0, kills: 0 },
  };
  e.current = e.weapons.pistol;
  if (!isPlayer) {
    e.mesh = createBotMesh(team);
    scene.add(e.mesh);
    e.ai = {
      state: 'idle', goalNode: -1, path: [], pathI: 0,
      hold: null, seen: null, lastSeenPos: new THREE.Vector3(), lastSeenT: -99,
      heardPos: null, reactAt: 0, burstLeft: 0, nextShotAt: 0, pauseUntil: 0,
      strafeDir: 1, strafeT: 0, perceiveAt: Math.random() * 0.15, stuckT: 0, lastX: 0, lastZ: 0,
      throwT: 3 + Math.random() * 4, // grenade cooldown: bots use what they buy
    };
  }
  return e;
}

export function resetCombatant(e, spawn, yaw) {
  e.pos.set(spawn.x, 0, spawn.z);
  e.yaw = yaw;
  e.hp = 100;
  e.alive = true;
  e.hasCharge = false;
  e.flinch = 0;
  e.deathT = -1;
  e.speedNow = 0;
  for (const slot of ['pistol', 'primary', 'sniper']) {
    const w = e.weapons[slot];
    if (w) { w.mag = w.def.mag; w.reserve = w.def.reserve; w.reloadUntil = 0; w.bloom = 0; }
  }
  if (e.current && !e.weapons[e.current.def.slot === 1 ? 'pistol' : e.current.def.slot === 2 ? 'primary' : 'sniper']) e.current = e.weapons.pistol;
  if (e.mesh) {
    e.mesh.visible = true;
    e.mesh.rotation.set(0, yaw, 0);
    e.mesh.position.copy(e.pos);
  }
  if (e.ai) {
    e.ai.state = 'idle';
    e.ai.seen = null;
    e.ai.lastSeenT = -99;
    e.ai.heardPos = null;
    e.ai.path = [];
  }
}

// --- Waypoints ---------------------------------------------------------------
export function nearestNode(map, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < map.waypoints.length; i += 1) {
    const w = map.waypoints[i];
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function findPath(map, from, to) {
  if (from === to) return [to];
  const prev = new Map([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of map.waypoints[cur].edges) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        const path = [to];
        let n = to;
        while (prev.get(n) !== -1 && prev.get(n) !== undefined) {
          n = prev.get(n);
          if (n === from) break;
          path.unshift(n);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

// Steer toward a point; returns the remaining distance.
function seek(S, e, tx, tz, speed, dt) {
  const dx = tx - e.pos.x;
  const dz = tz - e.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) { e.speedNow = 0; return 0; }
  const stepLen = Math.min(dist, speed * dt);
  const beforeX = e.pos.x;
  const beforeZ = e.pos.z;
  moveCircle(e.pos, e.radius, (dx / dist) * stepLen, (dz / dist) * stepLen, S.map.colliders);
  const moved = Math.hypot(e.pos.x - beforeX, e.pos.z - beforeZ);
  e.speedNow = dt > 0 ? moved / dt : 0;
  return dist;
}

function faceToward(e, tx, tz, dt, rate = 10) {
  const want = Math.atan2(-(tx - e.pos.x), -(tz - e.pos.z));
  let diff = want - e.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  e.yaw += THREE.MathUtils.clamp(diff, -rate * dt, rate * dt);
}

// --- Perception ----------------------------------------------------------------
function perceive(S, e, now) {
  const ai = e.ai;
  let bestDist = Infinity;
  let seenNow = null;
  for (const other of S.entities) {
    if (!other.alive || other.team === e.team) continue;
    const dx = other.pos.x - e.pos.x;
    const dz = other.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 42) continue;
    // Vision cone: 110 degrees, wider at point blank.
    const fx = -Math.sin(e.yaw);
    const fz = -Math.cos(e.yaw);
    const dot = (dx * fx + dz * fz) / (dist || 1);
    if (dist > 6 && dot < 0.42) continue;
    const eyeY = e.pos.y + e.eye;
    if (!losClear(e.pos.x, eyeY, e.pos.z, other.pos.x, other.pos.y + 1.2, other.pos.z, S.map.colliders, S.effects.smokes)) continue;
    if (dist < bestDist) { bestDist = dist; seenNow = other; }
  }
  if (seenNow) {
    if (ai.seen !== seenNow) ai.reactAt = now + 0.26 + S.rng() * 0.3;
    ai.seen = seenNow;
    ai.lastSeenPos.copy(seenNow.pos);
    ai.lastSeenT = now;
  } else if (now - ai.lastSeenT > 0.4) {
    ai.seen = null;
  }
  // Hearing: fresh gunfire noise pulls attention.
  for (const n of S.noise) {
    if (now - n.t > 1.2 || n.team === e.team) continue;
    const d = Math.hypot(n.x - e.pos.x, n.z - e.pos.z);
    if (d < n.radius) {
      ai.heardPos = { x: n.x, z: n.z };
      if (now - ai.lastSeenT > 3) { ai.lastSeenPos.set(n.x, 0, n.z); ai.lastSeenT = now - 2.2; }
    }
  }
}

// --- Orders ----------------------------------------------------------------------
// Rounds (and the plant/defuse logic) steer bots by setting a goal: a
// waypoint to travel to, then a behaviour on arrival.
export function orderMove(S, e, nodeIdx, then = 'hold') {
  const ai = e.ai;
  const from = nearestNode(S.map, e.pos.x, e.pos.z);
  ai.path = findPath(S.map, from, nodeIdx);
  ai.pathI = 0;
  ai.goalNode = nodeIdx;
  ai.then = then;
  ai.state = 'advance';
}
export function orderHold(e, hold) {
  e.ai.hold = hold;
  e.ai.state = 'hold';
}

// --- Main update -------------------------------------------------------------------
export function updateBot(S, e, dt) {
  const ai = e.ai;
  const now = S.time;
  if (!e.alive) return;
  if (now >= ai.perceiveAt) {
    ai.perceiveAt = now + 0.12;
    perceive(S, e, now);
  }
  ai.throwT -= dt;
  const w = e.current;
  if (w.reloadUntil && now >= w.reloadUntil) { // finish a reload
    const take = Math.min(w.def.mag - w.mag, w.reserve);
    w.mag += take;
    w.reserve -= take;
    w.reloadUntil = 0;
  }
  if (w.mag === 0 && !w.reloadUntil && w.reserve > 0) w.reloadUntil = now + w.def.reload;

  const memoryFresh = now - ai.lastSeenT < 2.6 && ai.lastSeenPos.lengthSq() > 0;

  // Engaging takes priority over everything but planting/defusing channels.
  if (ai.seen && ai.state !== 'plant' && ai.state !== 'defuse') ai.state = 'engage';

  switch (ai.state) {
    case 'engage': {
      const target = ai.seen;
      if (!target) { ai.state = memoryFresh ? 'hunt' : ai.then === 'hold' && ai.hold ? 'hold' : 'advance'; break; }
      faceToward(e, target.pos.x, target.pos.z, dt, 12);
      const dist = Math.hypot(target.pos.x - e.pos.x, target.pos.z - e.pos.z);
      // A frag is worth more than bullets at mid range: lob it, then push.
      if (e.nades.frag > 0 && ai.throwT <= 0 && dist >= 6 && dist <= 26) {
        S.throwNadeAt(e, 'frag', target.pos.x, target.pos.z);
        ai.throwT = 7 + S.rng() * 5;
      }
      // Strafe in short steps between bursts; stand still while firing.
      ai.strafeT -= dt;
      if (ai.strafeT <= 0) { ai.strafeDir = S.rng() > 0.5 ? 1 : -1; ai.strafeT = 0.5 + S.rng() * 0.7; }
      const firing = now >= ai.pauseUntil && now >= ai.reactAt;
      if (!firing || dist > 16) {
        const px = -Math.cos(e.yaw) * ai.strafeDir;
        const pz = Math.sin(e.yaw) * ai.strafeDir;
        seek(S, e, e.pos.x + px * 2, e.pos.z + pz * 2, 1.7, dt);
      } else e.speedNow = 0;
      if (firing && w.mag > 0 && !w.reloadUntil && now >= w.nextShotAt) {
        S.botShoot(e, target);
        ai.burstLeft -= 1;
        w.nextShotAt = now + w.def.interval * (0.92 + S.rng() * 0.3);
        if (ai.burstLeft <= 0) {
          ai.burstLeft = w.def.auto ? 3 + Math.floor(S.rng() * 4) : 1;
          ai.pauseUntil = now + 0.35 + S.rng() * 0.45;
        }
      }
      break;
    }
    case 'hunt': {
      const d = seek(S, e, ai.lastSeenPos.x, ai.lastSeenPos.z, 4.5, dt);
      faceToward(e, ai.lastSeenPos.x, ai.lastSeenPos.z, dt);
      if (d < 1.2 || !memoryFresh) ai.state = ai.hold ? 'hold' : 'advance';
      break;
    }
    case 'plant': {
      e.speedNow = 0;
      S.channelPlant(e, dt);
      break;
    }
    case 'defuse': {
      e.speedNow = 0;
      S.channelDefuse(e, dt);
      break;
    }
    case 'hold': {
      const h = ai.hold;
      if (!h) { ai.state = 'idle'; break; }
      const d = Math.hypot(h.x - e.pos.x, h.z - e.pos.z);
      if (d > 0.7) {
        seek(S, e, h.x, h.z, 4.2, dt);
        faceToward(e, h.x, h.z, dt);
      } else {
        e.speedNow = 0;
        // Watch the angle, with a slow scan either side of it.
        const base = Math.atan2(-(h.lx - e.pos.x), -(h.lz - e.pos.z));
        const want = base + Math.sin(now * 0.45 + e.pos.x) * 0.35;
        let diff = want - e.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        e.yaw += THREE.MathUtils.clamp(diff, -2.4 * dt, 2.4 * dt);
      }
      break;
    }
    case 'advance': {
      // Rotating onto a planted Charge, a Warden smokes it off before pushing in.
      if (e.team === 'def' && S.charge.planted && e.nades.smoke > 0 && ai.throwT <= 0) {
        const cd = Math.hypot(S.charge.x - e.pos.x, S.charge.z - e.pos.z);
        if (cd > 5 && cd < 24) {
          S.throwNadeAt(e, 'smoke', S.charge.x, S.charge.z);
          ai.throwT = 9;
        }
      }
      if (!ai.path.length) { ai.state = ai.then === 'hold' && ai.hold ? 'hold' : 'idle'; break; }
      const node = S.map.waypoints[ai.path[ai.pathI]];
      const d = seek(S, e, node.x, node.z, 4.4, dt);
      faceToward(e, node.x, node.z, dt);
      if (d < 0.9) {
        ai.pathI += 1;
        if (ai.pathI >= ai.path.length) {
          ai.path = [];
          S.botArrived(e);
        }
      }
      break;
    }
    default: // idle
      e.speedNow = 0;
  }

  // Footstep noise while running.
  if (e.speedNow > 3.4) {
    ai.stepT = (ai.stepT || 0) - dt;
    if (ai.stepT <= 0) {
      ai.stepT = 0.34;
      S.noise.push({ x: e.pos.x, z: e.pos.z, t: now, radius: 9, team: e.team, quiet: true });
    }
  }
}

// Mesh sync, flinch and the fall when a bot dies. Called for every bot,
// alive or not, so corpses finish their fall during the round-end pause.
export function updateBotVisual(e, dt) {
  if (!e.mesh) return;
  e.mesh.position.copy(e.pos);
  if (!e.alive) {
    if (e.deathT < 0) e.deathT = 0;
    e.deathT += dt;
    const k = Math.min(1, e.deathT / 0.35);
    e.mesh.rotation.set(-(Math.PI / 2) * k * 0.92, e.yaw, 0);
    e.mesh.position.y = -Math.max(0, e.deathT - 3.2) * 0.5; // sink away late
    if (e.deathT > 3.8) e.mesh.visible = false;
    return;
  }
  e.mesh.rotation.set(0, e.yaw, 0);
  e.flinch = Math.max(0, e.flinch - dt * 6);
  const torso = e.mesh.userData.torso;
  if (torso) torso.rotation.x = -e.flinch * 0.35;
  // A little run bob so movement reads in screenshots.
  const bob = e.speedNow > 0.4 ? Math.abs(Math.sin(performance.now() * 0.012 + e.pos.x)) * 0.03 : 0;
  e.mesh.position.y = bob;
}
