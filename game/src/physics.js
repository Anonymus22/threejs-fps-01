// Physics helpers: circle-vs-AABB movement on the ground plane and ray tests
// against AABB colliders and spheres. Colliders are { x, z, hx, hz, h } —
// centre, half extents, and height from the ground (y = 0 .. h).
// No allocations in the hot paths: results come back through return values
// and module-level scratch only where a single caller uses them at a time.

// Move a circle (pos.x / pos.z, radius r) by (dx, dz), resolving each axis
// separately so the body slides along walls. Mutates pos; returns nothing.
export function moveCircle(pos, r, dx, dz, colliders) {
  if (dx !== 0) {
    pos.x += dx;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      if (pos.x + r > c.x - c.hx && pos.x - r < c.x + c.hx && pos.z + r > c.z - c.hz && pos.z - r < c.z + c.hz) {
        pos.x = dx > 0 ? c.x - c.hx - r : c.x + c.hx + r;
      }
    }
  }
  if (dz !== 0) {
    pos.z += dz;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      if (pos.x + r > c.x - c.hx && pos.x - r < c.x + c.hx && pos.z + r > c.z - c.hz && pos.z - r < c.z + c.hz) {
        pos.z = dz > 0 ? c.z - c.hz - r : c.z + c.hz + r;
      }
    }
  }
}

// Is the circle at (x, z) clear of every collider? Used for spawn checks.
export function circleClear(x, z, r, colliders) {
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    if (x + r > c.x - c.hx && x - r < c.x + c.hx && z + r > c.z - c.hz && z - r < c.z + c.hz) return false;
  }
  return true;
}

// Ray vs one AABB collider (vertical span 0..h). o/d are {x,y,z}-likes.
// Returns the entry distance t, or Infinity when the ray misses.
export function rayCollider(ox, oy, oz, dx, dy, dz, c) {
  const minX = c.x - c.hx;
  const maxX = c.x + c.hx;
  const minZ = c.z - c.hz;
  const maxZ = c.z + c.hz;
  let tmin = 0;
  let tmax = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < minX || ox > maxX) return Infinity;
  } else {
    let t1 = (minX - ox) / dx;
    let t2 = (maxX - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < 0 || oy > c.h) return Infinity;
  } else {
    let t1 = (0 - oy) / dy;
    let t2 = (c.h - oy) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < minZ || oz > maxZ) return Infinity;
  } else {
    let t1 = (minZ - oz) / dz;
    let t2 = (maxZ - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Nearest hit distance of a ray against every collider, or Infinity.
export function rayWorld(ox, oy, oz, dx, dy, dz, colliders, maxT) {
  let best = maxT;
  for (let i = 0; i < colliders.length; i += 1) {
    const t = rayCollider(ox, oy, oz, dx, dy, dz, colliders[i]);
    if (t < best) best = t;
  }
  // The ground plane y = 0.
  if (dy < -1e-9) {
    const t = -oy / dy;
    if (t > 0 && t < best) best = t;
  }
  return best;
}

// Ray vs sphere (bot heads). Returns t or Infinity.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

// Line of sight between two points: false when a collider or a smoke cloud
// blocks the segment. Eye heights ride in the y arguments.
export function losClear(x1, y1, z1, x2, y2, z2, colliders, smokes) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const inv = 1 / dist;
  const t = rayWorld(x1, y1, z1, dx * inv, dy * inv, dz * inv, colliders, dist);
  if (t < dist - 0.05) return false;
  if (smokes) {
    for (let i = 0; i < smokes.length; i += 1) {
      const s = smokes[i];
      if (!s.active) continue;
      // Segment vs sphere: distance from the smoke centre to the ray line.
      const lx = s.pos.x - x1;
      const ly = s.pos.y - y1;
      const lz = s.pos.z - z1;
      const along = lx * dx * inv + ly * dy * inv + lz * dz * inv;
      if (along < 0 || along > dist) continue;
      const px = x1 + dx * inv * along - s.pos.x;
      const py = y1 + dy * inv * along - s.pos.y;
      const pz = z1 + dz * inv * along - s.pos.z;
      if (px * px + py * py + pz * pz < s.r * s.r) return false;
    }
  }
  return true;
}
