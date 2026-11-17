// The Sable Yard: an original container depot. Three lanes (west, mid, east)
// feed two charge sites in the north; the Vanguard spawn south, the Wardens
// north between the sites. Every solid is an AABB collider {x, z, hx, hz, h}
// and a matching box mesh, so what you see is exactly what blocks you.
// Bots travel the waypoint graph; hold points name a spot and a look target.
import * as THREE from 'three';
import { PALETTE as P } from './palette.js';

const MATS = new Map();
function mat(color, rough = 0.92) {
  if (!MATS.has(color)) MATS.set(color, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.04 }));
  return MATS.get(color);
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  const S = 1024 / 64; // world is 64 x 64 m, centred on 0
  const px = (x) => (x + 32) * S;
  const pz = (z) => (z + 32) * S;
  g.fillStyle = P.ground;
  g.fillRect(0, 0, 1024, 1024);
  // Asphalt speckle.
  for (let i = 0; i < 9000; i += 1) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.07)';
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  // Worn lane dashes down the three lanes and the south apron.
  g.fillStyle = P.lanePaint;
  g.globalAlpha = 0.5;
  for (let z = -28; z < 28; z += 4) {
    g.fillRect(px(-22) - 1, pz(z), 2, 26);
    g.fillRect(px(22) - 1, pz(z), 2, 26);
    g.fillRect(px(0) - 1, pz(z), 2, 26);
  }
  g.globalAlpha = 1;
  // Site rings and letters, painted big enough to read from anywhere.
  for (const [cx, col, letter] of [[-19, P.siteA, 'A'], [19, P.siteB, 'B']]) {
    g.strokeStyle = col;
    g.lineWidth = 7;
    g.beginPath();
    g.arc(px(cx), pz(-20), 6.5 * S, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = col;
    g.globalAlpha = 0.9;
    g.font = `700 ${7.2 * S}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, px(cx), pz(-20) + 4);
    g.globalAlpha = 1;
  }
  // Spawn aprons.
  g.fillStyle = 'rgba(240,168,48,0.13)';
  g.fillRect(px(-5), pz(23.5), 10 * S, 6.5 * S);
  g.fillStyle = 'rgba(55,182,168,0.13)';
  g.fillRect(px(-5), pz(-30), 10 * S, 6.5 * S);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#22252b';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.strokeRect(10, 10, 236, 236);
  g.fillStyle = color;
  g.font = '700 170px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMap(scene) {
  const colliders = [];
  const boxes = []; // for the minimap: {x, z, hx, hz}
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function solid(x, z, hx, hz, h, color, rough) {
    const mesh = new THREE.Mesh(boxGeo, mat(color, rough));
    mesh.scale.set(hx * 2, h, hz * 2);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push({ x, z, hx, hz, h });
    boxes.push({ x, z, hx, hz });
    return mesh;
  }
  // A container: body plus a darker lid line, reads as stacked steel.
  function container(x, z, hx, hz, color) {
    solid(x, z, hx, hz, 2.6, color, 0.6);
    const lid = new THREE.Mesh(boxGeo, mat(P.roof, 0.7));
    lid.scale.set(hx * 2 + 0.12, 0.14, hz * 2 + 0.12);
    lid.position.set(x, 2.67, z);
    lid.castShadow = true;
    scene.add(lid);
  }
  const crate = (x, z, h = 1.15) => solid(x, z, 1.05, 1.05, h, h > 1.5 ? P.crateDark : P.crate, 0.95);

  // Ground and the dark apron beyond the walls.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 64),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.96 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat(0x232830, 1));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.05;
  scene.add(apron);

  // Perimeter.
  solid(0, -31.5, 32, 0.5, 5, P.wallDark);
  solid(0, 31.5, 32, 0.5, 5, P.wallDark);
  solid(-31.5, 0, 0.5, 32, 5, P.wallDark);
  solid(31.5, 0, 0.5, 32, 5, P.wallDark);

  // North-mid wall (Warden spawn behind it) with a centre door at |x| < 1.5.
  solid(-8.75, -15.5, 6.75, 0.5, 3.4, P.wall);
  solid(8.75, -15.5, 6.75, 0.5, 3.4, P.wall);

  // Site walls: east wall and south wall per site, each with one wide door.
  for (const s of [-1, 1]) {
    solid(s * 11, -25, 0.5, 2.5, 3.4, P.wall); // site east wall, north part
    solid(s * 11, -15.5, 0.5, 2.5, 3.4, P.wall); // site east wall, south part (door z -22.5..-18)
    solid(s * 26, -13, 4.5, 0.5, 3.4, P.wall); // site south wall, outer part
    solid(s * 14, -13, 3, 0.5, 3.4, P.wall); // site south wall, inner part (door x 17..21.5)
  }

  // Mid walls with a centre door each side, and the south dividers.
  solid(-4.5, 7, 0.5, 8, 3.4, P.wall);
  solid(4.5, 7, 0.5, 8, 3.4, P.wall);
  solid(-4.5, -9.5, 0.5, 4.5, 3.4, P.wall);
  solid(4.5, -9.5, 0.5, 4.5, 3.4, P.wall);
  solid(-9, 17, 0.5, 3, 3.4, P.wallDark);
  solid(9, 17, 0.5, 3, 3.4, P.wallDark);
  solid(-16, 14, 0.5, 6, 3.4, P.wallDark);
  solid(16, 14, 0.5, 6, 3.4, P.wallDark);

  // Cover: containers and crates.
  container(-19, -27.6, 4, 1.2, P.containerA);
  container(19, -27.6, 4, 1.2, P.containerB);
  container(-20, -5, 1.2, 3, P.containerC);
  container(20, -5, 1.2, 3, P.containerD);
  container(0, 21, 3.4, 1.2, P.containerB);
  crate(-24, -19, 2.3);
  crate(24, -19, 2.3);
  crate(-15.5, -18);
  crate(15.5, -18);
  crate(2, 4);
  crate(-2, -7);
  crate(-24, 2);
  crate(24, 2);
  crate(-14, 24);
  crate(14, 24);
  crate(-5, -23.5);
  crate(5, -23.5);
  crate(-24, -16);
  crate(24, -16);

  // Site signs on the walls facing the lanes.
  for (const [x, z, ry, letter, col] of [
    [-10.4, -20, Math.PI / 2, 'A', P.siteA],
    [10.4, -20, -Math.PI / 2, 'B', P.siteB],
  ]) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshStandardMaterial({ map: signTexture(letter, col), roughness: 0.8 }),
    );
    sign.position.set(x, 2.2, z);
    sign.rotation.y = ry;
    scene.add(sign);
  }

  // Yard lamps: pole, emissive head, one real light at each site approach.
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6);
  for (const [x, z] of [[-8, 12], [8, 12], [-8, -12], [8, -12], [0, -24]]) {
    const pole = new THREE.Mesh(lampGeo, mat(P.metal, 0.5));
    pole.position.set(x, 2.7, z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc978, emissiveIntensity: 2.2 }));
    head.scale.set(0.7, 0.16, 0.7);
    head.position.set(x, 5.45, z);
    scene.add(head);
  }
  const lampLight = new THREE.PointLight(0xffd9a0, 60, 26, 1.8);
  lampLight.position.set(0, 5.2, -24);
  scene.add(lampLight);

  // Distant depot silhouettes for the skyline.
  for (const [x, z, w, h] of [[-46, -44, 26, 13], [30, -48, 34, 17], [52, 6, 20, 11], [-52, 14, 22, 9], [4, -52, 22, 8]]) {
    const m = new THREE.Mesh(boxGeo, mat(0x1d232e, 1));
    m.scale.set(w, h, 8);
    m.position.set(x, h / 2, z);
    scene.add(m);
  }

  const sites = {
    A: { name: 'A', x: -19, z: -20, r: 6.5, color: P.siteA },
    B: { name: 'B', x: 19, z: -20, r: 6.5, color: P.siteB },
  };
  const spawns = {
    att: [
      { x: 0, z: 26.5 }, { x: -2.6, z: 27.5 }, { x: 2.6, z: 27.5 }, { x: -1.4, z: 29 }, { x: 1.4, z: 29 },
    ],
    def: [
      { x: 0, z: -26.5 }, { x: -2.6, z: -27.5 }, { x: 2.6, z: -27.5 }, { x: -1.4, z: -29 }, { x: 1.4, z: -29 },
    ],
  };
  // Waypoint graph (see the header): index, position, neighbours.
  const nodes = [
    [0, 25], [-13, 20], [13, 20], [-22, 22], [-22, -2], [-22, -10], [-19, -19], [-25, -24],
    [0, 13], [0, -1], [0, -10], [0, -13.5], [0, -25], [0, -17.5], [-7, -20], [7, -20],
    [22, 22], [22, -2], [22, -10], [19, -19], [25, -24], [-9, -3], [9, -3], [-14, -22], [14, -22],
  ];
  const edges = [
    [0, 1], [0, 2], [0, 8], [1, 3], [2, 16], [3, 4], [16, 17], [4, 5], [17, 18], [5, 6],
    [18, 19], [8, 9], [9, 10], [10, 11], [11, 13], [13, 12], [13, 14], [13, 15], [12, 14],
    [12, 15], [14, 6], [15, 19], [14, 23], [15, 24], [6, 7], [19, 20], [6, 23], [19, 24],
    [4, 21], [21, 9], [17, 22], [22, 9],
  ];
  const waypoints = nodes.map(([x, z]) => ({ x, z, edges: [] }));
  for (const [a, b] of edges) {
    waypoints[a].edges.push(b);
    waypoints[b].edges.push(a);
  }
  // Named indices for the AI and the round logic.
  const WP = {
    tSpawn: 0, tWest: 1, tEast: 2, laneWs: 3, laneWm: 4, laneWn: 5, aSite: 6, aBack: 7,
    midS: 8, mid: 9, midN: 10, doorS: 11, ctSpawn: 12, doorN: 13, aConn: 14, bConn: 15,
    laneEs: 16, laneEm: 17, laneEn: 18, bSite: 19, bBack: 20, linkW: 21, linkE: 22, aHold2: 23, bHold2: 24,
  };
  // Defender holds: a spot plus the point to watch. Attackers reuse the site
  // holds after a plant.
  const holds = {
    A: [
      { x: -25, z: -24, lx: -16, lz: -15 },
      { x: -14, z: -22, lx: -22, lz: -12 },
      { x: -23.5, z: -15.5, lx: -10, lz: -20 },
    ],
    B: [
      { x: 25, z: -24, lx: 16, lz: -15 },
      { x: 14, z: -22, lx: 22, lz: -12 },
      { x: 23.5, z: -15.5, lx: 10, lz: -20 },
    ],
    mid: [
      { x: 2.5, z: -11, lx: 0, lz: 4 },
      { x: -2.5, z: -12, lx: 0, lz: 2 },
    ],
  };

  return { colliders, boxes, sites, spawns, waypoints, WP, holds };
}
