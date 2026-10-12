import {
  BOUNDARY_HALF, CLEARING, DRIVEWAY, DRIVEWAY_WIDTH, FRONT_BOULDER, TRAIL, TRAIL_WIDTH, HOUSE_FOOTPRINT, LAWN_PINES, fbm, heightAt, isWild, lawnMask, noise2, rng, smoothstep,
  streamCenter,
} from "@den/shared";

// Where every tree, sapling, fern, rock, log and stump goes (GAME_SPEC §4). Seeded, so every
// player's forest is identical. Positions are generated once at load.

export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Rotation about y, and an optional tilt about the item's own x axis (logs lying on slopes). */
  rot: number;
  tilt?: number;
  scale: number;
}

export const TREE_KINDS = ["whitepine_a", "whitepine_b", "hemlock", "maple", "oak", "birch"] as const;
export type TreeKind = (typeof TREE_KINDS)[number];
export const SAPLING_KINDS = ["sapling_pine", "sapling_leafy"] as const;
export const FERNS = ["fern_a", "fern_b", "fern_c", "fern_d"] as const;
export const ROCKS = Array.from({ length: 13 }, (_, i) => `rock_${i + 1}`);
export const SHRUBS = ["shrub_a", "shrub_b", "shrub_c", "shrub_d"] as const;

const EDGE = 170; // scenery reaches this far; the walkable area ends at BOUNDARY_HALF

/** Walk a jittered grid of `cell`-metre squares, calling `place` with a seeded random source per cell. */
function grid(cell: number, seed: number, place: (x: number, z: number, rand: () => number) => void) {
  for (let gz = -EDGE; gz < EDGE; gz += cell) {
    for (let gx = -EDGE; gx < EDGE; gx += cell) {
      const rand = rng(seed ^ Math.imul(Math.round(gx * 7 + 3001), 73856093) ^ Math.imul(Math.round(gz * 7 + 5003), 19349663));
      place(gx + rand() * cell, gz + rand() * cell, rand);
    }
  }
}

/** Lowest ground under a footprint, so things sit into slopes instead of floating. */
const groundUnder = (x: number, z: number, r: number) =>
  Math.min(heightAt(x, z), heightAt(x + r, z), heightAt(x - r, z), heightAt(x, z + r), heightAt(x, z - r));

/** True within `gap` metres of the driveway's or trail's edge (trees keep back so the way stays open). */
const nearPath = (x: number, z: number, gap: number) =>
  !!DRIVEWAY.closest(x, z, DRIVEWAY_WIDTH / 2 + gap) || !!TRAIL.closest(x, z, TRAIL_WIDTH / 2 + gap);

/** 0 inside the map, rising to 1 near the boundary (thicker woods there hide the edge). */
const nearEdge = (x: number, z: number) => smoothstep(BOUNDARY_HALF - 18, BOUNDARY_HALF - 4, Math.max(Math.abs(x), Math.abs(z)));

function pickTree(x: number, z: number, r: number): TreeKind {
  const damp = smoothstep(-60, -20, x - streamCenter(z)); // near the stream: hemlock and birch
  const grove = noise2(x, z, 45, 31) > 0.3 ? 1 : 0; // birch groves
  const w: [TreeKind, number][] = [
    ["whitepine_a", 0.24], ["whitepine_b", 0.2], ["hemlock", 0.16 + 0.22 * damp], ["maple", 0.16], ["oak", 0.12],
    ["birch", 0.07 + 0.5 * grove + 0.1 * damp],
  ];
  let t = r * w.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of w) if ((t -= v) <= 0) return k;
  return "whitepine_a";
}

export function scatterAll() {
  const trees = Object.fromEntries(TREE_KINDS.map((k) => [k, [] as Placement[]])) as Record<TreeKind, Placement[]>;
  const saplings = Object.fromEntries(SAPLING_KINDS.map((k) => [k, [] as Placement[]])) as Record<(typeof SAPLING_KINDS)[number], Placement[]>;
  const ferns = Object.fromEntries(FERNS.map((k) => [k, [] as Placement[]])) as Record<string, Placement[]>;
  const rocks = Object.fromEntries(ROCKS.map((k) => [k, [] as Placement[]])) as Record<string, Placement[]>;
  const logs: Placement[] = [], stumps: Placement[] = [];
  const shrubs = Object.fromEntries(SHRUBS.map((k) => [k, [] as Placement[]])) as Record<string, Placement[]>;

  // Trees: a mixed Maine forest, thicker at the edge of the map.
  grid(4, 101, (x, z, rand) => {
    const edge = nearEdge(x, z);
    const tries = edge > 0.5 ? 2 : 1;
    for (let k = 0; k < tries; k++) {
      const px = k ? x + (rand() - 0.5) * 3.2 : x, pz = k ? z + (rand() - 0.5) * 3.2 : z;
      const density = 0.74 + 0.2 * fbm(px, pz, 60, 21) + 0.3 * edge;
      if (rand() > density || !isWild(px, pz, 0.5) || nearPath(px, pz, 3.5)) continue;
      const scale = 0.78 + rand() * 0.45;
      trees[pickTree(px, pz, rand())].push({ x: px, y: groundUnder(px, pz, 0.6) - 0.1, z: pz, rot: rand() * Math.PI * 2, scale });
    }
  });
  // The big lawn pines near the house (photos). The model is 27 m tall at scale 1.
  for (const [x, z, h] of LAWN_PINES) trees.whitepine_a.push({ x, y: heightAt(x, z) - 0.1, z, rot: x * 0.37, scale: h / 27 });

  // Saplings through the woods and thickest along the lawn's edge.
  grid(6, 202, (x, z, rand) => {
    if (rand() > 0.2 + 0.4 * nearEdge(x, z) || !isWild(x, z, 0.3) || nearPath(x, z, 3)) return;
    saplings[rand() < 0.55 ? "sapling_pine" : "sapling_leafy"].push({ x, y: heightAt(x, z) - 0.05, z, rot: rand() * 6.28, scale: 0.7 + rand() * 0.6 });
  });
  grid(3.5, 203, (x, z, rand) => {
    // Just outside the lawn: a point ~12% closer to the clearing's centre is lawn.
    const inward = lawnMask(CLEARING.cx + (x - CLEARING.cx) * 0.88, CLEARING.cz + (z - CLEARING.cz) * 0.88);
    if (inward < 0.5 || rand() > 0.5 || !isWild(x, z, 0) || nearPath(x, z, 3)) return;
    saplings[rand() < 0.5 ? "sapling_pine" : "sapling_leafy"].push({ x, y: heightAt(x, z) - 0.05, z, rot: rand() * 6.28, scale: 0.6 + rand() * 0.6 });
  });

  // Ferns in patches.
  grid(2.4, 304, (x, z, rand) => {
    const p = Math.min(0.85, Math.max(0, 0.12 + 0.75 * fbm(x, z, 22, 41)) + 0.25 * nearEdge(x, z));
    if (rand() > p || !isWild(x, z, -0.8)) return;
    ferns[FERNS[Math.floor(rand() * FERNS.length)]!]!.push({ x, y: heightAt(x, z) - 0.05, z, rot: rand() * 6.28, scale: 1 + rand() * 0.7 });
  });

  // Mossy rocks, fallen logs and stumps.
  grid(8, 405, (x, z, rand) => {
    if (rand() > 0.1 + 0.3 * nearEdge(x, z) || !isWild(x, z, 0)) return;
    const scale = 0.5 + rand() * 0.7;
    rocks[ROCKS[Math.floor(rand() * ROCKS.length)]!]!.push({ x, y: groundUnder(x, z, scale) - 0.25 * scale, z, rot: rand() * 6.28, scale });
  });
  grid(12, 506, (x, z, rand) => {
    if (rand() > 0.15 || !isWild(x, z, 1)) return;
    const scale = 1.3 + rand() * 0.6, rot = rand() * 6.28;
    const half = 1.5 * scale; // the log model is 3 m long along x
    const ax = Math.cos(rot) * half, az = -Math.sin(rot) * half;
    const h1 = heightAt(x - ax, z - az), h2 = heightAt(x + ax, z + az);
    logs.push({ x, y: Math.min(h1, h2) + Math.abs(h2 - h1) / 2 + 0.02, z, rot, tilt: Math.atan2(h2 - h1, half * 2), scale });
  });
  grid(14, 607, (x, z, rand) => {
    if (rand() > 0.12 || !isWild(x, z, 0.5)) return;
    stumps.push({ x, y: groundUnder(x, z, 0.5) - 0.08, z, rot: rand() * 6.28, scale: 0.55 + rand() * 0.3 });
  });

  // Rhododendrons along the front of the house and porch, and a few beds out back (photos).
  const house = HOUSE_FOOTPRINT.find((r) => r.name === "house")!, porch = HOUSE_FOOTPRINT.find((r) => r.name === "porch")!;
  const r = rng(708);
  const shrub = (x: number, z: number) =>
    shrubs[SHRUBS[Math.floor(r() * SHRUBS.length)]!]!.push({ x, y: heightAt(x, z) - 0.05, z, rot: r() * 6.28, scale: 1.25 + r() * 0.35 });
  for (let x = house.minX + 1.5; x < porch.minX - 1; x += 2.3) shrub(x, house.minZ - 1.1);
  for (let x = porch.minX + 1.2; x < porch.maxX - 0.5; x += 2.4) if (Math.abs(x - (porch.minX + porch.maxX) / 2) > 1.6) shrub(x, porch.minZ - 1.1);
  for (const [x, z] of [[-8, 11], [-5, 12.5], [20, 13], [23, 10], [26, 14], [-23, 10.5]] as const) shrub(x, z);

  const boulder: Placement[] = [{ x: FRONT_BOULDER.x, y: heightAt(FRONT_BOULDER.x, FRONT_BOULDER.z) - 0.35, z: FRONT_BOULDER.z, rot: FRONT_BOULDER.rotY, scale: FRONT_BOULDER.scale }];

  return { trees, saplings, ferns, rocks, logs, stumps, shrubs, boulder };
}
export type Scatter = ReturnType<typeof scatterAll>;
