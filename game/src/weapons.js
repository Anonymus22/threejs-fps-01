// Weapon data and the first-person viewmodel. Damage is hitscan; `spread`
// is the base cone in radians, `moveSpread` is added in full while moving
// at run speed, and `bloom` accumulates per shot — standing still and
// tapping is the accurate way to play, spraying on the move is not.
import * as THREE from 'three';
import { PALETTE as P } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Kestrel P9', slot: 1, price: 400, dmg: 26, headMult: 3,
    interval: 0.29, auto: false, mag: 12, reserve: 60, reload: 1.1,
    spread: 0.006, moveSpread: 0.028, bloom: 0.004, maxBloom: 0.028, recoil: 0.011,
    falloff: 0.55, speed: 1.0, zoom: 0, pellets: 1,
  },
  smg: {
    id: 'smg', name: 'Raptor SMG', slot: 2, price: 1250, dmg: 21, headMult: 2.5,
    interval: 0.075, auto: true, mag: 30, reserve: 90, reload: 1.6,
    spread: 0.013, moveSpread: 0.034, bloom: 0.006, maxBloom: 0.05, recoil: 0.007,
    falloff: 0.5, speed: 1.02, zoom: 0, pellets: 1,
  },
  rifle: {
    id: 'rifle', name: 'Harrier AR-12', slot: 2, price: 2700, dmg: 33, headMult: 3,
    interval: 0.105, auto: true, mag: 30, reserve: 90, reload: 1.9,
    spread: 0.004, moveSpread: 0.046, bloom: 0.005, maxBloom: 0.045, recoil: 0.013,
    falloff: 0.7, speed: 0.96, zoom: 0, pellets: 1,
  },
  sniper: {
    id: 'sniper', name: 'Ibis SR-1', slot: 3, price: 4300, dmg: 96, headMult: 2,
    interval: 1.35, auto: false, mag: 5, reserve: 25, reload: 2.6,
    spread: 0.0008, moveSpread: 0.09, bloom: 0, maxBloom: 0, recoil: 0.05,
    falloff: 1, speed: 0.92, zoom: 3.1, pellets: 1,
  },
};
export const NADE_DEFS = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, dmg: 95, radius: 5.5, fuse: 1.5 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, radius: 3.4, time: 9, fuse: 1.1 },
};
export const ARMOR_PRICE = 650;
export const START_MONEY = 800;

// A fresh runtime copy of a weapon for one combatant.
export function freshWeapon(id) {
  const def = WEAPONS[id];
  return { def, mag: def.mag, reserve: def.reserve, nextShotAt: 0, reloadUntil: 0, bloom: 0 };
}

// Damage after distance falloff (head multiplier applied by the caller).
export function damageAt(def, dist) {
  const f = Math.max(def.falloff, 1 - dist / 110);
  return def.dmg * f;
}

// --- Viewmodel -------------------------------------------------------------
// Simple built-from-boxes guns parented to the camera, one group per weapon,
// with a muzzle anchor for flash/tracer origins, a recoil spring and a
// walk-bob/sway update. No external models.
const gunMat = new THREE.MeshStandardMaterial({ color: P.gunmetal, roughness: 0.45, metalness: 0.55 });
const accMat = new THREE.MeshStandardMaterial({ color: P.gunAccent, roughness: 0.5, metalness: 0.4 });
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

function part(group, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  group.add(m);
  return m;
}

function buildGun(id) {
  const g = new THREE.Group();
  if (id === 'pistol') {
    part(g, gunMat, 0, 0, -0.1, 0.055, 0.09, 0.24);
    part(g, gunMat, 0, 0.045, -0.2, 0.04, 0.035, 0.1);
    part(g, accMat, 0, -0.085, -0.03, 0.05, 0.09, 0.07);
  } else if (id === 'smg') {
    part(g, gunMat, 0, 0, -0.16, 0.06, 0.08, 0.42);
    part(g, gunMat, 0, 0, -0.42, 0.035, 0.035, 0.14);
    part(g, accMat, 0, -0.1, -0.14, 0.045, 0.13, 0.06);
    part(g, accMat, 0, 0.055, -0.2, 0.03, 0.03, 0.1);
    part(g, gunMat, 0, -0.02, 0.1, 0.05, 0.05, 0.12);
  } else if (id === 'sniper') {
    part(g, gunMat, 0, 0, -0.24, 0.065, 0.085, 0.55);
    part(g, gunMat, 0, -0.01, -0.62, 0.03, 0.03, 0.3);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.17, 10), accMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.085, -0.22);
    g.add(scope);
    part(g, accMat, 0, -0.09, -0.18, 0.045, 0.11, 0.06);
    part(g, gunMat, 0, -0.03, 0.12, 0.05, 0.05, 0.14);
  } else if (id === 'nade') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x51683c, roughness: 0.6 }));
    ball.position.set(0.01, -0.02, -0.12);
    g.add(ball);
    part(g, accMat, 0.01, 0.035, -0.12, 0.02, 0.03, 0.02);
  } else {
    // rifle
    part(g, gunMat, 0, 0, -0.22, 0.065, 0.09, 0.52);
    part(g, gunMat, 0, 0.005, -0.55, 0.035, 0.035, 0.18);
    part(g, accMat, 0, -0.105, -0.2, 0.045, 0.14, 0.065);
    part(g, accMat, 0, 0.07, -0.28, 0.025, 0.045, 0.03);
    part(g, gunMat, 0, -0.02, 0.11, 0.05, 0.05, 0.13);
    part(g, accMat, 0, -0.01, -0.02, 0.055, 0.07, 0.1);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, id === 'sniper' ? -0.78 : id === 'pistol' ? -0.26 : -0.62);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  return g;
}

export function createViewmodel(camera) {
  const root = new THREE.Group();
  root.position.set(0.26, -0.235, -0.45);
  camera.add(root);
  const groups = {};
  for (const id of ['pistol', 'smg', 'rifle', 'sniper', 'nade']) {
    groups[id] = buildGun(id);
    groups[id].visible = false;
    root.add(groups[id]);
  }
  let current = 'pistol';
  let kick = 0;
  let bobT = 0;
  groups.pistol.visible = true;

  return {
    root,
    get muzzle() { return groups[current].userData.muzzle; },
    show(id) {
      groups[current].visible = false;
      current = id;
      groups[id].visible = true;
    },
    kick(amount) { kick = Math.min(1, kick + amount); },
    update(dt, speed, grounded, lookX) {
      kick = Math.max(0, kick - dt * 7);
      bobT += dt * (4 + speed * 1.6);
      const bob = grounded && speed > 0.4 ? Math.sin(bobT) * 0.011 * Math.min(1, speed / 5) : 0;
      root.position.z = -0.45 + kick * 0.07;
      root.position.y = -0.235 + bob - kick * 0.012;
      root.rotation.x = kick * 0.14;
      root.rotation.z = THREE.MathUtils.clamp(-lookX * 0.0016, -0.05, 0.05);
    },
  };
}
