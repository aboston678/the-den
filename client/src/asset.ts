// Files in client/public (models, textures, sounds) are cached by browsers for a day. Each build
// asks for them by a new name (?v=<build>), so a browser never mixes yesterday's bear with today's
// code (game-night fixes: a cached bear without the new crouch clip left a blank home screen).
export const asset = (path: string) => (import.meta.env.DEV ? path : `${path}?v=${__ASSET_VERSION__}`);
