// The Sable Yard: an original container depot. Three lanes (west, mid, east)
// feed two charge sites in the north; the Vanguard spawn south, the Wardens
// north between the sites. Every solid is an AABB collider {x, z, hx, hz, h}
// and a matching box mesh, so what you see is exactly what blocks you.
// Bots travel the waypoint graph; hold points name a spot and a look target.
import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import {
  corrugatedTexture, woodTexture, concreteTexture, glowTexture, cloudTexture, skylineTexture,
} from './textures.js';

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
  // Sand speckle.
  for (let i = 0; i < 9000; i += 1) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,246,220,0.05)' : 'rgba(122,90,40,0.06)';
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  // Dusty tonal patches, so the sand is not one flat sheet.
  for (const [sx, sz, r, a] of [[-22, 8, 5, 0.09], [24, -2, 6, 0.07], [2, -18, 4, 0.08], [-6, 26, 5, 0.06], [18, 18, 4, 0.07]]) {
    const grad = g.createRadialGradient(px(sx), pz(sz), 4, px(sx), pz(sz), r * S);
    grad.addColorStop(0, `rgba(133,102,52,${a})`);
    grad.addColorStop(1, 'rgba(133,102,52,0)');
    g.fillStyle = grad;
    g.fillRect(px(sx) - r * S, pz(sz) - r * S, r * S * 2, r * S * 2);
  }
  // Expansion joints: a faint grid that gives the yard its scale.
  g.strokeStyle = 'rgba(120,90,40,0.10)';
  g.lineWidth = 2;
  for (let m = -32; m <= 32; m += 8) {
    g.beginPath();
    g.moveTo(px(m), 0);
    g.lineTo(px(m), 1024);
    g.stroke();
    g.beginPath();
    g.moveTo(0, pz(m));
    g.lineTo(1024, pz(m));
    g.stroke();
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

  // Procedural surfaces (see textures.js): one painted sheet per material,
  // tinted by colour, so the steel and timber stop reading as flat paint.
  const corrugated = corrugatedTexture();
  const containerMats = new Map();
  function containerMat(color) {
    if (!containerMats.has(color)) {
      containerMats.set(color, new THREE.MeshStandardMaterial({ color, map: corrugated, roughness: 0.6, metalness: 0.06 }));
    }
    return containerMats.get(color);
  }
  const wood = woodTexture();
  const crateMat = new THREE.MeshStandardMaterial({ color: P.crate, map: wood, roughness: 0.95 });
  const crateDarkMat = new THREE.MeshStandardMaterial({ color: P.crateDark, map: wood, roughness: 0.95 });
  const concrete = concreteTexture();
  const wallMat = new THREE.MeshStandardMaterial({ color: P.wall, map: concrete, roughness: 0.94 });
  const wallDarkMat = new THREE.MeshStandardMaterial({ color: P.wallDark, map: concrete, roughness: 0.94 });

  function solid(x, z, hx, hz, h, color, rough) {
    const mesh = new THREE.Mesh(boxGeo, color && color.isMaterial ? color : mat(color, rough));
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
    solid(x, z, hx, hz, 2.6, containerMat(color));
    const lid = new THREE.Mesh(boxGeo, mat(P.roof, 0.7));
    lid.scale.set(hx * 2 + 0.12, 0.14, hz * 2 + 0.12);
    lid.position.set(x, 2.67, z);
    lid.castShadow = true;
    scene.add(lid);
  }
  const crate = (x, z, h = 1.15) => solid(x, z, 1.05, 1.05, h, h > 1.5 ? crateDarkMat : crateMat);

  // Ground and the dark apron beyond the walls.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 64),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.96 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat(0xb59a68, 1));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.05;
  scene.add(apron);

  // Gradient sky dome with the sun's glow in a tiny shader: horizon haze,
  // a warm band around the sun's azimuth, and the disc itself. Pure
  // backdrop — no fog, no depth write, drawn inside the camera's far plane.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(P.skyZenith) },
      horizonColor: { value: new THREE.Color(P.skyHorizon) },
      glowColor: { value: new THREE.Color(P.skyGlow) },
      sunDir: { value: new THREE.Vector3(...P.sunPos).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 glowColor;
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
        float s = max(dot(d, sunDir), 0.0);
        col += glowColor * (pow(s, 220.0) * 1.6 + pow(s, 10.0) * 0.28);
        vec2 flatD = normalize(d.xz);
        vec2 flatS = normalize(sunDir.xz);
        col += glowColor * pow(max(dot(flatD, flatS), 0.0), 5.0) * (1.0 - h) * 0.16;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(185, 24, 12), skyMat));

  // A few soft billboard clouds drifting overhead (static: the shot
  // poses must stay deterministic).
  const cloudTex = cloudTexture();
  for (const [x, y, z, s, o] of [[-60, 47, -70, 62, 0.4], [42, 53, -82, 74, 0.34], [-24, 58, 64, 68, 0.3], [72, 45, 28, 52, 0.36], [-84, 51, 6, 58, 0.3], [8, 63, -44, 84, 0.26]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: P.cloud, transparent: true, opacity: o, depthWrite: false, fog: false }));
    sp.position.set(x, y, z);
    sp.scale.set(s, s * 0.42, 1);
    scene.add(sp);
  }

  // Perimeter.
  solid(0, -31.5, 32, 0.5, 5, wallDarkMat);
  solid(0, 31.5, 32, 0.5, 5, wallDarkMat);
  solid(-31.5, 0, 0.5, 32, 5, wallDarkMat);
  solid(31.5, 0, 0.5, 32, 5, wallDarkMat);

  // North-mid wall (Warden spawn behind it) with a centre door at |x| < 1.5.
  solid(-8.75, -15.5, 6.75, 0.5, 3.4, wallMat);
  solid(8.75, -15.5, 6.75, 0.5, 3.4, wallMat);

  // Site walls: east wall and south wall per site, each with one wide door.
  for (const s of [-1, 1]) {
    solid(s * 11, -25, 0.5, 2.5, 3.4, wallMat); // site east wall, north part
    solid(s * 11, -15.5, 0.5, 2.5, 3.4, wallMat); // site east wall, south part (door z -22.5..-18)
    solid(s * 26, -13, 4.5, 0.5, 3.4, wallMat); // site south wall, outer part
    solid(s * 14, -13, 3, 0.5, 3.4, wallMat); // site south wall, inner part (door x 17..21.5)
  }

  // Mid walls with a centre door each side, and the south dividers.
  solid(-4.5, 7, 0.5, 8, 3.4, wallMat);
  solid(4.5, 7, 0.5, 8, 3.4, wallMat);
  solid(-4.5, -9.5, 0.5, 4.5, 3.4, wallMat);
  solid(4.5, -9.5, 0.5, 4.5, 3.4, wallMat);
  solid(-9, 17, 0.5, 3, 3.4, wallDarkMat);
  solid(9, 17, 0.5, 3, 3.4, wallDarkMat);
  solid(-16, 14, 0.5, 6, 3.4, wallDarkMat);
  solid(16, 14, 0.5, 6, 3.4, wallDarkMat);

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

  // Yard lamps: pole, emissive head, a glow sprite and a faint warm pool
  // on the sand. Midday sun does the real lighting now — these are dressing,
  // kept dim so they read as fixtures, not light sources.
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6);
  const glowTex = glowTexture();
  const poolGeo = new THREE.CircleGeometry(3.4, 20);
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffbe78, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [x, z] of [[-8, 12], [8, 12], [-8, -12], [8, -12], [0, -24]]) {
    const pole = new THREE.Mesh(lampGeo, mat(P.metal, 0.5));
    pole.position.set(x, 2.7, z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc978, emissiveIntensity: 0.5 }));
    head.scale.set(0.7, 0.16, 0.7);
    head.position.set(x, 5.45, z);
    scene.add(head);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: P.lampGlow, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(3.2, 3.2, 1);
    glow.position.set(x, 5.45, z);
    scene.add(glow);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.02, z);
    scene.add(pool);
  }
  const lampLight = new THREE.PointLight(0xffd9a0, 12, 26, 1.8);
  lampLight.position.set(0, 5.2, -24);
  scene.add(lampLight);
  for (const [x, z] of [[-8, -12], [8, -12]]) {
    const extra = new THREE.PointLight(0xffd9a0, 8, 22, 1.8);
    extra.position.set(x, 5.2, z);
    scene.add(extra);
  }

  // Distant depot silhouettes for the skyline, hazed by the midday fog.
  const skylineMat = new THREE.MeshBasicMaterial({ map: skylineTexture() });
  for (const [x, z, w, h] of [[-46, -44, 26, 13], [30, -48, 34, 17], [52, 6, 20, 11], [-52, 14, 22, 9], [4, -52, 22, 8]]) {
    const m = new THREE.Mesh(boxGeo, skylineMat);
    m.scale.set(w, h, 8);
    m.position.set(x, h / 2, z);
    scene.add(m);
  }

  // --- Set dressing ------------------------------------------------------
  // Barrels, sandbag lines and pallet stacks dress the yard's edges. Every
  // spot was checked against the waypoint graph and the hold points below:
  // nothing sits on a bot lane, and the solid props add colliders in the
  // same AABB style as the cover above. Puddles are flat gloss only.
  const barrelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.92, 12);
  const barrelBandGeo = new THREE.CylinderGeometry(0.335, 0.335, 0.1, 12);
  const barrelMats = [P.barrelRust, P.barrelSteel, P.barrelOlive].map(
    (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.62, metalness: 0.3 }),
  );
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x2e3237, roughness: 0.6, metalness: 0.3 });
  function barrel(x, z, i, y = 0.46) {
    const b = new THREE.Mesh(barrelGeo, barrelMats[i % 3]);
    b.position.set(x, y, z);
    b.castShadow = true;
    scene.add(b);
    const band = new THREE.Mesh(barrelBandGeo, bandMat);
    band.position.set(x, y + 0.09, z);
    scene.add(band);
    if (y < 1) {
      colliders.push({ x, z, hx: 0.34, hz: 0.34, h: 0.92 });
      boxes.push({ x, z, hx: 0.34, hz: 0.34 });
    }
  }
  function barrelCluster(x, z, n, topped) {
    barrel(x, z, n);
    barrel(x + 0.72, z + 0.2, n + 1);
    barrel(x + 0.3, z - 0.66, n + 2);
    if (topped) barrel(x + 0.36, z - 0.14, n + 1, 1.38);
  }
  barrelCluster(-29, -19, 0, true);
  barrelCluster(29, -19, 1, false);
  barrelCluster(-29, 12, 2, false);
  barrelCluster(29, 12, 0, true);

  const bagGeo = new THREE.SphereGeometry(0.42, 9, 7);
  const bagMat = new THREE.MeshStandardMaterial({ color: P.sand, roughness: 1 });
  function sandbagLine(x, z) {
    for (let i = 0; i < 4; i += 1) {
      const b = new THREE.Mesh(bagGeo, bagMat);
      b.scale.set(1.3, 0.52, 0.85);
      b.position.set(x - 1.05 + i * 0.7, 0.2, z);
      b.castShadow = true;
      scene.add(b);
    }
    for (let i = 0; i < 3; i += 1) {
      const b = new THREE.Mesh(bagGeo, bagMat);
      b.scale.set(1.3, 0.52, 0.85);
      b.position.set(x - 0.7 + i * 0.7, 0.55, z);
      b.castShadow = true;
      scene.add(b);
    }
    colliders.push({ x, z, hx: 1.55, hz: 0.45, h: 0.8 });
    boxes.push({ x, z, hx: 1.55, hz: 0.45 });
  }
  sandbagLine(-13, 4);
  sandbagLine(13, 4);

  function palletStack(x, z) {
    for (let i = 0; i < 3; i += 1) {
      const p = new THREE.Mesh(boxGeo, i % 2 ? crateMat : crateDarkMat);
      p.scale.set(1.7, 0.13, 1.7);
      p.position.set(x, 0.1 + i * 0.19, z);
      p.castShadow = true;
      p.receiveShadow = true;
      scene.add(p);
    }
    colliders.push({ x, z, hx: 0.85, hz: 0.85, h: 0.6 });
    boxes.push({ x, z, hx: 0.85, hz: 0.85 });
  }
  palletStack(-27, 8);
  palletStack(27, 8);
  palletStack(24, 26);

  // Puddles: near-black, near-mirror discs that catch the sun's specular
  // streak and the lamp pools. No collider — they are water, not cover.
  const puddleMat = new THREE.MeshStandardMaterial({ color: P.puddle, roughness: 0.07, metalness: 0.05 });
  const puddleGeo = new THREE.CircleGeometry(1, 22);
  for (const [x, z, sx, sz] of [[-22, -6, 1.9, 1.1], [22, -6, 1.7, 1.2], [2.5, 17, 2.2, 1.3], [-13, -24.5, 1.5, 1], [16, 10, 1.6, 0.9]]) {
    const p = new THREE.Mesh(puddleGeo, puddleMat);
    p.rotation.set(-Math.PI / 2, 0, x * 1.7);
    p.scale.set(sx, sz, 1);
    p.position.set(x, 0.012, z);
    p.receiveShadow = true;
    scene.add(p);
  }

  // Palms: low-poly trees — a curved trunk of stacked segments under a
  // crown of arcing frond planes. They ring the depot outside the walls
  // and stand in the yard's corners and edges; every inside trunk was
  // checked clear of the waypoint graph and hold points below, and
  // carries a slim collider in the usual style.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a7358, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x5e8f3e, roughness: 0.9, side: THREE.DoubleSide });
  const nutMat = new THREE.MeshStandardMaterial({ color: 0x6d5a35, roughness: 1 });
  const frondGeo = (() => {
    const geo = new THREE.PlaneGeometry(0.62, 2.9, 1, 5);
    geo.translate(0, 1.45, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const y0 = pos.getY(i);
      const t = y0 / 2.9;
      pos.setX(i, pos.getX(i) * (1 - t * 0.72)); // taper to the tip
      pos.setY(i, 0.38 * t - 1.02 * t * t); // rise, then droop
      pos.setZ(i, y0); // length axis becomes +Z: the frond reaches out
    }
    geo.computeVertexNormals();
    return geo;
  })();
  const trunkSegGeo = new THREE.CylinderGeometry(0.12, 0.17, 1.02, 7);
  const nutGeo = new THREE.SphereGeometry(0.15, 8, 6);
  function palm(x, z, lean, rot, s, inside) {
    const g = new THREE.Group();
    let px = 0;
    for (let i = 0; i < 5; i += 1) {
      const seg = new THREE.Mesh(trunkSegGeo, trunkMat);
      px += lean * 0.14 * (0.5 + i * 0.28);
      seg.position.set(px, 0.5 + i * 0.94, 0);
      seg.rotation.z = -lean * (0.35 + i * 0.13);
      seg.castShadow = true;
      g.add(seg);
    }
    const topY = 4.88;
    for (let f = 0; f < 7; f += 1) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      frond.position.set(px, topY, 0);
      frond.rotation.y = rot + (f / 7) * Math.PI * 2 + (f % 3) * 0.21;
      frond.castShadow = true;
      g.add(frond);
    }
    for (const [nx, nz] of [[0.16, 0.1], [-0.13, 0.14]]) {
      const nut = new THREE.Mesh(nutGeo, nutMat);
      nut.position.set(px + nx, topY - 0.22, nz);
      g.add(nut);
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    scene.add(g);
    if (inside) {
      colliders.push({ x, z, hx: 0.26, hz: 0.26, h: 4.8 });
      boxes.push({ x, z, hx: 0.26, hz: 0.26 });
    }
  }
  // Inside the walls: corners and lane edges, all off the bot graph.
  palm(-28.6, -28.6, 0.5, 0.4, 1.05, true);
  palm(28.6, -28.6, -0.4, 1.7, 0.95, true);
  palm(-28.6, 28.6, 0.3, 2.6, 1.1, true);
  palm(28.6, 28.6, -0.55, 0.9, 1.0, true);
  palm(-29.5, 6, 0.45, 1.2, 0.9, true);
  palm(29.5, 6, -0.3, 2.2, 1.08, true);
  // Outside the walls: a loose ring in the desert.
  palm(-38, -20, 0.6, 0.2, 1.15, false);
  palm(38, -24, -0.5, 1.4, 1.05, false);
  palm(-40, 14, 0.35, 2.9, 0.95, false);
  palm(40, 18, -0.6, 0.6, 1.12, false);
  palm(-20, -40, 0.4, 1.9, 1.0, false);
  palm(16, -42, -0.35, 2.4, 1.08, false);
  palm(24, 40, -0.45, 0.1, 0.98, false);
  palm(-24, 42, 0.55, 1.1, 1.06, false);

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
