import type { RigidBody, World } from "@dimforge/rapier3d-compat";

/**
 * Remove a rigid body we created by hand, if it still exists. React can mount, unmount and remount
 * parts of the world while assets load; removing an already-removed body (or one from a physics
 * world that has since been rebuilt) crashes Rapier. Keep all of the property inside one Suspense
 * boundary (Property.tsx): splitting it made @react-three/rapier rebuild its world mid-load.
 */
export function removeBody(world: World, body: RigidBody) {
  try {
    if (body.isValid()) world.removeRigidBody(body);
  } catch {
    /* the physics world was rebuilt; the body went with it */
  }
}
