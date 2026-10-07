import * as THREE from 'three';
import { animator, clamp, ease, rand } from '../core/animator';
import { layout } from '../core/layout';
import type { Piece } from '../game/Piece';
import { applyDissolve, createDissolveDepthMaterial, createDissolveUniforms, type DissolveUniforms } from './dissolve';
import { applyRecolor } from './recolor';
import { randomUnit } from './effects';

export interface ShatterOptions {
  /** World-space point where the blow lands; shards fly away from it. */
  impact: THREE.Vector3;
  /** Extra push in this direction (normalised), e.g. the attacker's swing. */
  direction?: THREE.Vector3;
  force?: number;
  /** Outward explosion speed. */
  radial?: number;
  lift?: number;
  spin?: number;
  shards?: number;
  rubble?: number;
  /** Colour of the glowing embers when the debris dissolves away. */
  glow: THREE.Color;
}

interface Fragment {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  ang: THREE.Vector3;
  radius: number;
  resting: boolean;
}

interface DebrisGroup {
  fragments: Fragment[];
  material: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
  uniforms: DissolveUniforms;
  geometries: THREE.BufferGeometry[];
  age: number;
}

const GRAVITY = 22;
const SETTLE_TIME = 2.6;
const DISSOLVE_TIME = 1.4;

const v = new THREE.Vector3();
const q = new THREE.Quaternion();
const axis = new THREE.Vector3();
const nm = new THREE.Matrix3();

/**
 * Breaks a piece into Voronoi-ish shell shards (triangles clustered around
 * random seeds, biased towards the impact), adds solid rubble, then runs a
 * small rigid-body-ish simulation against the board, the table and the
 * remaining pieces. Debris finally burns away with the dissolve shader.
 */
export class Debris {
  private readonly groups: DebrisGroup[] = [];
  private readonly rubbleGeometries: THREE.BufferGeometry[];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly obstacles: () => Iterable<Piece>,
  ) {
    this.rubbleGeometries = Array.from({ length: 4 }, () => makeRock());
    animator.onFrame((dt) => this.update(dt));
  }

  shatter(piece: Piece, o: ShatterOptions): void {
    piece.root.updateWorldMatrix(true, true);

    const uniforms = createDissolveUniforms(3.2);
    uniforms.uEdgeColor.value.copy(o.glow).multiplyScalar(6);
    uniforms.uEdgeWidth.value = 0.1;
    const material = piece.material.clone();
    material.emissiveIntensity = piece.glow;
    applyDissolve(material, uniforms);
    if (piece.recolor) applyRecolor(material, piece.recolor);
    const depth = createDissolveDepthMaterial(uniforms);

    const group: DebrisGroup = { fragments: [], material, depth, uniforms, geometries: [], age: 0 };

    const tris = collectTriangles(piece.meshes);
    const box = new THREE.Box3().setFromObject(piece.root);
    const seeds = makeSeeds(box, o.impact, o.shards ?? 22);
    const clusters = clusterTriangles(tris, seeds);

    for (const cluster of clusters) {
      if (cluster.length === 0) continue;
      const { geometry, center } = buildShard(tris, cluster);
      this.addFragment(group, geometry, center, Math.max(0.05, geometry.boundingSphere!.radius * 0.45), o);
    }

    const rubble = o.rubble ?? 10;
    for (let i = 0; i < rubble; i++) {
      const geometry = this.rubbleGeometries[i % this.rubbleGeometries.length];
      const s = rand(0.07, 0.15);
      const center = new THREE.Vector3(
        rand(box.min.x, box.max.x) * 0.6 + piece.root.position.x * 0.4,
        rand(box.min.y + 0.1, box.min.y + (box.max.y - box.min.y) * 0.7),
        rand(box.min.z, box.max.z) * 0.6 + piece.root.position.z * 0.4,
      );
      const f = this.addFragment(group, geometry, center, s, o, false);
      f.mesh.scale.setScalar(s);
      f.mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    }

    // embers cool down
    const startGlow = Math.max(piece.glow, 0.8);
    void animator.tween(0.9, (k) => {
      material.emissiveIntensity = startGlow * (1 - k);
    }, ease.outCubic);

    this.groups.push(group);
  }

  private addFragment(
    group: DebrisGroup,
    geometry: THREE.BufferGeometry,
    center: THREE.Vector3,
    radius: number,
    o: ShatterOptions,
    owned = true,
  ): Fragment {
    const mesh = new THREE.Mesh(geometry, group.material);
    mesh.customDepthMaterial = group.depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(center);
    this.scene.add(mesh);
    if (owned) group.geometries.push(geometry);

    const out = v.copy(center).sub(o.impact);
    out.y *= 0.5;
    if (out.lengthSq() < 1e-4) randomUnit(out);
    out.normalize();

    const vel = out.clone().multiplyScalar((o.radial ?? 4) * rand(0.5, 1.25));
    if (o.direction) vel.addScaledVector(o.direction, (o.force ?? 0) * rand(0.45, 1.15));
    vel.y += (o.lift ?? 3) * rand(0.4, 1.2);

    const ang = randomUnit(new THREE.Vector3()).multiplyScalar((o.spin ?? 9) * rand(0.4, 1.4));
    const f: Fragment = { mesh, vel, ang, radius, resting: false };
    group.fragments.push(f);
    return f;
  }

  private update(dt: number): void {
    const pieces = [...this.obstacles()];
    for (let gi = this.groups.length - 1; gi >= 0; gi--) {
      const g = this.groups[gi];
      g.age += dt;
      for (const f of g.fragments) {
        if (!f.resting) this.simulate(f, dt, pieces);
      }

      const d = (g.age - SETTLE_TIME) / DISSOLVE_TIME;
      if (d > 0) g.uniforms.uDissolve.value = clamp(d, 0, 1) * 1.1;
      if (d >= 1) {
        for (const f of g.fragments) this.scene.remove(f.mesh);
        for (const geo of g.geometries) geo.dispose();
        g.material.dispose();
        g.depth.dispose();
        this.groups.splice(gi, 1);
      }
    }
  }

  private simulate(f: Fragment, dt: number, pieces: Piece[]): void {
    const p = f.mesh.position;
    f.vel.y -= GRAVITY * dt;
    f.vel.multiplyScalar(1 - 0.25 * dt);
    p.addScaledVector(f.vel, dt);

    const angSpeed = f.ang.length();
    if (angSpeed > 1e-3) {
      q.setFromAxisAngle(axis.copy(f.ang).divideScalar(angSpeed), angSpeed * dt);
      f.mesh.quaternion.premultiply(q);
    }

    // Remaining pieces act as cylinders the debris bounces off.
    for (const piece of pieces) {
      const pp = piece.root.position;
      if (p.y > pp.y + piece.height) continue;
      const dx = p.x - pp.x;
      const dz = p.z - pp.z;
      const min = piece.radius * 0.75 + f.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      p.x = pp.x + nx * min;
      p.z = pp.z + nz * min;
      const vn = f.vel.x * nx + f.vel.z * nz;
      if (vn < 0) {
        f.vel.x -= 1.5 * vn * nx;
        f.vel.z -= 1.5 * vn * nz;
      }
    }

    const onBoard = Math.abs(p.x) < layout.boardHalf && Math.abs(p.z) < layout.boardHalf;
    const floor = (onBoard ? layout.boardTop : 0) + f.radius;
    if (p.y < floor) {
      // only collide with the board top when we arrive from above
      if (!onBoard || p.y > floor - 0.3) {
        p.y = floor;
        if (f.vel.y < 0) f.vel.y = -f.vel.y * 0.32;
        f.vel.x *= 0.72;
        f.vel.z *= 0.72;
        f.ang.multiplyScalar(0.72);
        if (f.vel.lengthSq() < 0.08) {
          f.resting = true;
        }
      }
    }
    if (p.y < -3) f.resting = true;
  }
}

interface Triangles {
  pos: Float32Array;
  nor: Float32Array;
  uv: Float32Array;
  cen: Float32Array;
  count: number;
}

function collectTriangles(meshes: THREE.Mesh[]): Triangles {
  let total = 0;
  for (const m of meshes) {
    const g = m.geometry;
    total += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  const t: Triangles = {
    pos: new Float32Array(total * 9),
    nor: new Float32Array(total * 9),
    uv: new Float32Array(total * 6),
    cen: new Float32Array(total * 3),
    count: total,
  };

  let tri = 0;
  for (const m of meshes) {
    const g = m.geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const index = g.index;
    nm.getNormalMatrix(m.matrixWorld);
    const n = index ? index.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(i + k) : i + k;
        v.fromBufferAttribute(pos, vi).applyMatrix4(m.matrixWorld);
        const o9 = tri * 9 + k * 3;
        t.pos[o9] = v.x;
        t.pos[o9 + 1] = v.y;
        t.pos[o9 + 2] = v.z;
        cx += v.x;
        cy += v.y;
        cz += v.z;
        v.fromBufferAttribute(nor, vi).applyMatrix3(nm).normalize();
        t.nor[o9] = v.x;
        t.nor[o9 + 1] = v.y;
        t.nor[o9 + 2] = v.z;
        if (uv) {
          t.uv[tri * 6 + k * 2] = uv.getX(vi);
          t.uv[tri * 6 + k * 2 + 1] = uv.getY(vi);
        }
      }
      t.cen[tri * 3] = cx / 3;
      t.cen[tri * 3 + 1] = cy / 3;
      t.cen[tri * 3 + 2] = cz / 3;
      tri++;
    }
  }
  return t;
}

function makeSeeds(box: THREE.Box3, impact: THREE.Vector3, count: number): THREE.Vector3[] {
  const seeds: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Vector3(
      rand(box.min.x, box.max.x),
      rand(box.min.y, box.max.y),
      rand(box.min.z, box.max.z),
    );
    // denser (smaller) shards around the point of impact
    if (i < count * 0.45) s.lerp(impact, rand(0.3, 0.75));
    seeds.push(s);
  }
  return seeds;
}

function clusterTriangles(t: Triangles, seeds: THREE.Vector3[]): number[][] {
  const clusters: number[][] = seeds.map(() => []);
  for (let i = 0; i < t.count; i++) {
    const x = t.cen[i * 3];
    const y = t.cen[i * 3 + 1];
    const z = t.cen[i * 3 + 2];
    let best = 0;
    let bestD = Infinity;
    for (let s = 0; s < seeds.length; s++) {
      const dx = x - seeds[s].x;
      const dy = (y - seeds[s].y) * 0.8;
      const dz = z - seeds[s].z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    clusters[best].push(i);
  }
  return clusters;
}

function buildShard(t: Triangles, tris: number[]): { geometry: THREE.BufferGeometry; center: THREE.Vector3 } {
  const center = new THREE.Vector3();
  for (const i of tris) center.x += t.cen[i * 3], center.y += t.cen[i * 3 + 1], center.z += t.cen[i * 3 + 2];
  center.divideScalar(tris.length);

  const pos = new Float32Array(tris.length * 9);
  const nor = new Float32Array(tris.length * 9);
  const uv = new Float32Array(tris.length * 6);
  tris.forEach((ti, j) => {
    for (let k = 0; k < 9; k += 3) {
      pos[j * 9 + k] = t.pos[ti * 9 + k] - center.x;
      pos[j * 9 + k + 1] = t.pos[ti * 9 + k + 1] - center.y;
      pos[j * 9 + k + 2] = t.pos[ti * 9 + k + 2] - center.z;
    }
    nor.set(t.nor.subarray(ti * 9, ti * 9 + 9), j * 9);
    uv.set(t.uv.subarray(ti * 6, ti * 6 + 6), j * 6);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeBoundingSphere();
  return { geometry, center };
}

/** A unit-sized irregular rock (faceted, flat shaded). */
function makeRock(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.attributes.position;
  const offsets = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let s = offsets.get(key);
    if (s === undefined) offsets.set(key, (s = rand(0.65, 1.2)));
    v.multiplyScalar(s);
    pos.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
