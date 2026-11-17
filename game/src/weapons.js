// Weapon data and the first-person viewmodel with ADS, reload & equip animations.
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

export function freshWeapon(id) {
  const def = WEAPONS[id];
  return { def, mag: def.mag, reserve: def.reserve, nextShotAt: 0, reloadUntil: 0, equipUntil: 0, bloom: 0 };
}

export function damageAt(def, dist) {
  const f = Math.max(def.falloff, 1 - dist / 110);
  return def.dmg * f;
}

// --- Viewmodel -------------------------------------------------------------
const gunMat = new THREE.MeshStandardMaterial({ color: P.gunmetal, roughness: 0.42, metalness: 0.62 });
const accMat = new THREE.MeshStandardMaterial({ color: P.gunAccent, roughness: 0.48, metalness: 0.45 });
const polyMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.72, metalness: 0.15 });
const tanMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.62, metalness: 0.1 });
const opticGlassMat = new THREE.MeshBasicMaterial({ color: 0x29c7ac, transparent: true, opacity: 0.45 });
const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x6f7a58, roughness: 0.95, metalness: 0 });
const gloveMat = new THREE.MeshStandardMaterial({ color: 0x35322e, roughness: 0.85, metalness: 0.05 });
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);

function part(group, mat, x, y, z, sx, sy, sz, rx = 0, rz = 0) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, 0, rz);
  group.add(m);
  return m;
}

function tube(group, mat, x, y, z, r, len) {
  const m = new THREE.Mesh(cylGeo, mat);
  m.position.set(x, y, z);
  m.scale.set(r, len, r);
  m.rotation.x = Math.PI / 2;
  group.add(m);
  return m;
}

function buildGun(id) {
  const g = new THREE.Group();
  let magMesh = null;

  if (id === 'pistol') {
    part(g, gunMat, 0, 0, -0.1, 0.062, 0.1, 0.26);
    part(g, accMat, 0, 0.052, -0.2, 0.048, 0.036, 0.11);
    part(g, polyMat, 0, -0.02, 0.05, 0.058, 0.11, 0.11);
    magMesh = part(g, accMat, 0, -0.085, -0.03, 0.056, 0.1, 0.078);
    part(g, gunMat, 0, 0.088, -0.03, 0.036, 0.03, 0.05);
    part(g, gunMat, 0, 0.084, -0.245, 0.014, 0.034, 0.02);
    part(g, gloveMat, 0, -0.145, -0.01, 0.062, 0.1, 0.085);
    part(g, sleeveMat, 0.07, -0.23, 0.05, 0.08, 0.08, 0.24, 0.55);
  } else if (id === 'smg') {
    part(g, gunMat, 0, 0, -0.16, 0.075, 0.095, 0.44);
    part(g, gunMat, 0, 0, -0.42, 0.042, 0.042, 0.15);
    tube(g, polyMat, 0, 0, -0.56, 0.032, 0.16);
    part(g, accMat, 0, 0.066, -0.18, 0.024, 0.02, 0.32);
    // Holo reflex sight
    part(g, polyMat, 0, 0.095, -0.14, 0.042, 0.038, 0.065);
    part(g, opticGlassMat, 0, 0.096, -0.14, 0.032, 0.026, 0.004);
    magMesh = part(g, accMat, 0, -0.11, -0.14, 0.052, 0.14, 0.068);
    part(g, polyMat, 0, -0.115, -0.33, 0.048, 0.12, 0.052);
    part(g, accMat, 0, 0.062, -0.2, 0.036, 0.034, 0.11);
    part(g, gunMat, 0, -0.02, 0.1, 0.058, 0.058, 0.13);
    part(g, polyMat, 0, -0.01, 0.19, 0.056, 0.064, 0.11);
    part(g, gloveMat, 0, -0.165, -0.33, 0.07, 0.075, 0.1);
    part(g, sleeveMat, 0.09, -0.25, -0.22, 0.082, 0.082, 0.3, 0.5);
    part(g, gloveMat, 0, -0.075, 0.03, 0.062, 0.09, 0.075);
  } else if (id === 'sniper') {
    part(g, gunMat, 0, 0, -0.24, 0.078, 0.1, 0.57);
    part(g, gunMat, 0, -0.01, -0.62, 0.036, 0.036, 0.3);
    tube(g, accMat, 0, 0.098, -0.22, 0.032, 0.18);
    tube(g, gunMat, 0, 0.098, -0.315, 0.04, 0.032);
    part(g, gunMat, 0, 0.062, -0.28, 0.016, 0.032, 0.016);
    part(g, gunMat, 0, 0.062, -0.16, 0.016, 0.032, 0.016);
    magMesh = part(g, accMat, 0, -0.1, -0.18, 0.052, 0.12, 0.068);
    part(g, tanMat, 0, 0.052, 0.1, 0.064, 0.04, 0.13);
    part(g, gunMat, 0, -0.03, 0.12, 0.058, 0.058, 0.15);
    part(g, polyMat, -0.05, -0.15, -0.52, 0.016, 0.17, 0.016, 0, 0.45);
    part(g, polyMat, 0.05, -0.15, -0.52, 0.016, 0.17, 0.016, 0, -0.45);
    part(g, gloveMat, 0, -0.095, -0.44, 0.07, 0.07, 0.11);
    part(g, sleeveMat, 0.09, -0.2, -0.3, 0.082, 0.082, 0.3, 0.5);
    part(g, gloveMat, 0, -0.08, 0.04, 0.062, 0.09, 0.075);
  } else if (id === 'nade') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x51683c, roughness: 0.6 }));
    ball.position.set(0.01, -0.02, -0.12);
    g.add(ball);
    part(g, accMat, 0.01, 0.035, -0.12, 0.02, 0.03, 0.02);
  } else {
    // Harrier AR-12 with tactical red-dot reflex optic & muzzle brake
    part(g, gunMat, 0, 0, -0.22, 0.082, 0.108, 0.54);
    part(g, gunMat, 0, 0.005, -0.56, 0.044, 0.044, 0.19);
    part(g, accMat, 0, 0.005, -0.66, 0.052, 0.052, 0.045); // muzzle brake
    part(g, polyMat, 0, 0.002, -0.41, 0.098, 0.1, 0.27);
    part(g, accMat, 0, 0.074, -0.3, 0.026, 0.024, 0.44);
    // Reflex red-dot sight on top rail
    part(g, polyMat, 0, 0.105, -0.14, 0.046, 0.044, 0.08);
    part(g, opticGlassMat, 0, 0.107, -0.14, 0.036, 0.03, 0.004);
    magMesh = part(g, tanMat, 0, -0.135, -0.2, 0.056, 0.17, 0.078, 0.1);
    part(g, accMat, 0, 0.082, -0.28, 0.03, 0.052, 0.036);
    part(g, gunMat, 0, 0.088, -0.06, 0.048, 0.042, 0.024);
    part(g, gunMat, 0, -0.02, 0.11, 0.06, 0.06, 0.15);
    part(g, polyMat, 0, -0.01, 0.02, 0.068, 0.088, 0.14);
    part(g, accMat, 0, -0.01, -0.02, 0.066, 0.082, 0.11);
    part(g, gloveMat, 0, -0.105, -0.44, 0.078, 0.075, 0.115);
    part(g, sleeveMat, 0.095, -0.21, -0.31, 0.088, 0.088, 0.32, 0.5);
    part(g, gloveMat, 0, -0.082, 0.03, 0.066, 0.095, 0.08);
  }
  g.scale.setScalar(1.1);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, id === 'sniper' ? -0.78 : id === 'pistol' ? -0.26 : -0.66);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.userData.mag = magMesh;
  g.userData.magBaseY = magMesh ? magMesh.position.y : 0;
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
    // Supports both legacy lookX (number) and polished state { aimAlpha, reloadRatio, lookX }.
    update(dt, speed, grounded, state = 0) {
      kick = Math.max(0, kick - dt * 7);
      bobT += dt * (4 + speed * 1.6);

      const isObj = typeof state === 'object' && state !== null;
      const aimAlpha = isObj ? (state.aimAlpha || 0) : 0;
      const reloadRatio = isObj ? (state.reloadRatio || 0) : (state > 0 && state <= 1 ? state : 0);
      const lookX = isObj ? (state.lookX || 0) : (Math.abs(state) > 1 ? state : 0);

      // Reload tilt & magazine drop animation.
      const reloadArc = reloadRatio > 0 ? Math.sin(reloadRatio * Math.PI) : 0;
      const g = groups[current];
      if (g && g.userData.mag) {
        g.userData.mag.position.y = g.userData.magBaseY - reloadArc * 0.14;
      }

      // ADS centering (pulls sight closer to screen center when aiming).
      const adsBlend = aimAlpha * (1 - reloadArc);
      const baseX = THREE.MathUtils.lerp(0.26, 0.11, adsBlend);
      const baseY = THREE.MathUtils.lerp(-0.235, -0.175, adsBlend);
      const baseZ = THREE.MathUtils.lerp(-0.45, -0.37, adsBlend);

      const bobScale = THREE.MathUtils.lerp(1, 0.25, adsBlend);
      const bob = grounded && speed > 0.4 ? Math.sin(bobT) * 0.011 * Math.min(1, speed / 5) * bobScale : 0;
      const swayX = grounded && speed > 0.4 ? Math.cos(bobT * 0.5) * 0.007 * Math.min(1, speed / 5) * bobScale : 0;

      root.position.x = baseX + swayX;
      root.position.z = baseZ + kick * 0.07;
      root.position.y = baseY + bob - kick * 0.012 - reloadArc * 0.04;
      root.rotation.x = kick * 0.14 - reloadArc * 0.28;
      root.rotation.z = THREE.MathUtils.clamp(-lookX * 0.0016, -0.05, 0.05) + reloadArc * 0.35;
    },
  };
}
