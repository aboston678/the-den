import { FURNITURE, type KindId, KINDS, kindOf, levelOfRoom, roomFloorY } from "@den/shared";
import { Matrix4 } from "three";
import type { GeoBuckets } from "../geometry.ts";
import type { WallPiece } from "../walls.ts";
import { Kit } from "./parts.ts";
import * as bowling from "./pieces/bowling.ts";
import * as decor from "./pieces/decor.ts";
import * as greenhouse from "./pieces/greenhouse.ts";
import * as kitchen from "./pieces/kitchen.ts";
import * as rooms from "./pieces/rooms.ts";
import * as soft from "./pieces/soft.ts";
import * as tables from "./pieces/tables.ts";
import type { Builder } from "./pieces/types.ts";

// Builds every code-built piece of furniture (GAME_SPEC §8.2, milestone 2.1), merged per material
// (plain colours share a few colour-sheet materials, atlas.ts), so furniture adds triangles but few
// draw calls. Hero pieces (Higgsfield models) are drawn by Furniture.tsx.

type CodeKind = { [K in KindId]: (typeof KINDS)[K] extends { model: string } ? never : K }[KindId];

const BUILDERS: Record<CodeKind, Builder> = {
  workbench: tables.workbench,
  pegboard: tables.pegboard,
  steel_shelf: tables.steelShelf,
  bins: tables.bins,
  firewood_rack: tables.firewoodRack,
  closet_doors: decor.closetDoors,
  toilet: decor.toilet,
  vanity: decor.vanity,
  mirror: decor.mirror,
  counter: kitchen.counter,
  upper_cabinet: kitchen.upperCabinet,
  range: kitchen.range,
  range_hood: kitchen.rangeHood,
  fridge: kitchen.fridge,
  island: kitchen.island,
  microwave: kitchen.microwave,
  toaster: kitchen.toaster,
  kettle: kitchen.kettle,
  fruit_bowl: kitchen.fruitBowl,
  trash_can: kitchen.trashCan,
  pantry_shelf: kitchen.pantryShelf,
  farm_table: tables.farmTable,
  slat_chair: tables.slatChair,
  dining_table: tables.diningTable,
  coffee_table: tables.coffeeTable,
  side_table: tables.sideTable,
  console_table: tables.consoleTable,
  sofa: soft.sofa,
  armchair: soft.armchair,
  tv_stand: tables.tvStand,
  tv: tables.tv,
  bookshelf: decor.bookshelf,
  cabinet_low: tables.cabinetLow,
  queen_bed: soft.queenBed,
  nightstand: tables.nightstand,
  desk: tables.desk,
  floor_lamp: decor.floorLamp,
  table_lamp: decor.tableLamp,
  ceiling_fan: decor.ceilingFan,
  chandelier: decor.chandelier,
  pendant_lantern: decor.pendantLantern,
  plant_stand: decor.plantStand,
  flowers: decor.flowers,
  frame: decor.frame,
  painting: decor.painting,
  rug_braided: decor.rugBraided,
  rug_round: decor.rugRound,
  rug_oriental: decor.rugOriental,
  patio_set: tables.patioSet,
  rocking_chair: tables.rockingChair,
  twin_bed: rooms.twinBed,
  daybed: rooms.daybed,
  papasan: rooms.papasan,
  tub: rooms.tub,
  dresser: rooms.dresser,
  curio_cabinet: rooms.curioCabinet,
  armoire: rooms.armoire,
  drapes: rooms.drapes,
  globe: rooms.globe,
  pennant: rooms.pennant,
  plant_bench: greenhouse.plantBench,
  plant_shelf: greenhouse.plantShelf,
  hanging_basket: greenhouse.hangingBasket,
  donut_boxes: greenhouse.donutBoxes,
  canned_pasta: greenhouse.cannedPasta,
  cooler_salmon: greenhouse.coolerSalmon,
  salmon_shelf: greenhouse.salmonShelf,
  crates: greenhouse.crates,
  ball_wall: bowling.ballWall,
  high_top_table: bowling.highTopTable,
  bar_stool: bowling.barStool,
  cube_stool: bowling.cubeStool,
};

/** Curtains by room (photos): office plaid, cream tie-backs in the formal dining room, florals in the blue bedroom. */
const CURTAINS: Record<string, { fabric: string; toFloor: boolean }> = {
  bedroom_pink: { fabric: "fabric:#f6efe6", toFloor: false },
  office: { fabric: "tex:fabric_plaid", toFloor: true },
  formal_dining: { fabric: "fabric:#efe6d2", toFloor: true },
  bedroom_main: { fabric: "tex:fabric_floral", toFloor: false },
};

function curtains(out: GeoBuckets, pieces: WallPiece[]) {
  for (const p of pieces) {
    const room = !p.a ? p.b : !p.b ? p.a : null;
    const style = room && CURTAINS[room.id];
    if (!style) continue;
    const side = p.a ? -1 : 1; // which side of the wall the room is on
    const face = p.c + side * (p.thickness / 2 + 0.02);
    const floor = roomFloorY(room.id);
    for (const o of p.openings) {
      if (o.kind !== "window") continue;
      const u = (o.u0 + o.u1) / 2, half = (o.u1 - o.u0) / 2;
      const [x, z] = p.axis === "x" ? [u, face] : [face, u];
      const rot = p.axis === "x" ? (side > 0 ? 0 : 180) : side > 0 ? 90 : 270;
      const k = new Kit(out, new Matrix4().makeTranslation(x, floor, z).multiply(new Matrix4().makeRotationY((rot * Math.PI) / 180)));
      // Window heights are absolute (upstairs ones include the upper floor); the kit stands on the room's floor.
      const top = o.y1 - floor + 0.16, bottom = style.toFloor ? 0.02 : o.y0 - floor - 0.12;
      k.rodX(-half - 0.4, half + 0.4, top, 0.06, 0.015, "brass");
      for (const s of [-1, 1]) {
        const x0 = s * (half - 0.06), x1 = s * (half + 0.32);
        k.box([Math.min(x0, x1), bottom, 0.02], [Math.max(x0, x1), top - 0.02, 0.07], style.fabric);
      }
      if (room.id === "bedroom_main") k.box([-half - 0.32, top - 0.3, 0.07], [half + 0.32, top, 0.11], style.fabric); // valance
    }
  }
}

/**
 * Every code-built piece and the curtains (floorplan metres): pieces in rooms into `inside` (drawn
 * only near the house, Furniture.tsx), the porch / deck / greenhouse ones into `outside` (always drawn).
 */
export function buildFurniture(inside: GeoBuckets, outside: GeoBuckets, pieces: WallPiece[]) {
  for (const p of FURNITURE) {
    const k = kindOf(p);
    if (k.model) continue;
    const out = levelOfRoom(p.room)?.outdoor.some((r) => r.id === p.room) ? outside : inside;
    const build = BUILDERS[p.kind as CodeKind];
    const y = roomFloorY(p.room) + (p.y ?? 0);
    const m = new Matrix4().makeTranslation(p.x, y, p.z).multiply(new Matrix4().makeRotationY(((p.rot ?? 0) * Math.PI) / 180));
    build(new Kit(out, m), { w: k.w, d: k.d, h: k.h }, p.look);
  }
  curtains(inside, pieces);
}
