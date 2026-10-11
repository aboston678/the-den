import { heightAt } from "@den/shared";
import { usePartyStore } from "../../net/party.ts";

/** Ground height at (x, z) on whichever map this party is playing. */
export function groundY(x: number, z: number) {
  return usePartyStore.getState().world === "test" ? 0 : heightAt(x, z);
}
