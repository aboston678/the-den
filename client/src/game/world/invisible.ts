// Collider handles of invisible barriers (map boundary, wading limit, dock rails). They stop
// bears, but the camera and name-tag line-of-sight checks look straight through them.
export const invisibleColliders = new Set<number>();
