/* Contextual guidance in plain, short sentences. */
export const BOSS_HINTS = [
  'Beat him in 4 steps: 1) Keep moving side to side. 2) Green spit flies → walk away from it. 3) A green vine sweeps the floor → JUMP over it. 4) When he finishes an attack and rests, run in and press J·J·J or K. If sweets (modaks) appear, grab them before he does!',
  'His golden armour deflects FRONT hits — that is normal, not a bug. Do this: 1) Press K (Tail Cyclone) whenever it is ready — every spin cracks the armour, and 3 cracks shatter it for a few seconds. 2) During that window (or from his back) press J·J·J freely. 3) In phase 2 three gold banners appear — stop hitting him and destroy the banners, they heal him. 4) In phase 3 his crown cracks and the armour is gone for good. Dodge shockwave rings with Shift/L or by jumping.',
  'Many copies surround you, but only the REAL one casts a shadow and has an open eye — decoys float a little higher. Study the feet, pick the shadow, and hit that one. The K cyclone spins through every copy near you.',
  'He pulls you with golden chains. When he pulls, dodge TOWARD him to get close, then hit the gold pile on his back.',
  'His fire slam is telegraphed by a long glow — run sideways out of the impact zone, then jump the fire waves that follow. Between slams run in and press J·J·J or K. His back is always safe.',
  'Pink spore clouds temporarily reverse your controls — walk out of them quickly and wait a second for your head to clear. Hit him between attacks; the K cyclone cannot miss.',
  'Her glowing threads are lasers you can CUT — slash them (they die in a few hits) and the arena opens. If a vine grabs you, mash jump + dodge to break free. Then close in with J·J·J or K.',
  'While even one mirror stands, he takes no damage at all — smash the mirrors with ANY weapon: J swings, K cyclone, boomerang (C), charge. Press C (Phase) first: phase-touch shatters glass three times faster and his yellow gaze cannot see you. In phase 3 keep your BACK to him (face away) and then attack.',
  'Normal hits do nothing to him. Cycle your 8 boons with Q and cast each one with C to strip his shields, then finish with the axe.',
];

export function resolveHint(G) {
  const p = G.player; if (!p) return 'Walk right (D). Jump with SPACE. Light shrines as checkpoints.';
  const wx = p.x + p.w / 2;
  if (G.boss) return BOSS_HINTS[(G.run.day - 1) % BOSS_HINTS.length];
  for (const g of G.world.gates || []) {
    if (!g.open && g.kind !== 'boss' && Math.abs(wx - (g.x + g.w / 2)) < 260)
      return 'This wall only breaks with a later power (Day 2 Charge). Don’t fight it — the path continues over the platforms. Come back later.';
  }
  for (const s of G.world.shrines || []) {
    if (!s.lit && Math.abs(wx - s.x) < 300)
      return 'Shrine ahead! Walk into it (or press F): it heals you fully and saves your checkpoint.';
  }
  const c = G.run._clang;
  if (c && G.run.elapsed - c.t < 6 && Math.abs(wx - c.x) < 420)
    return 'That enemy is armoured in front. Jump or dodge OVER it, then hit its BACK — front hits will never work.';
  if (p.inWater) return 'Water slows you down. Keep moving and jump between platforms — don’t stand in it.';
  for (const g of G.world.gates || []) {
    if (g.kind === 'boss' && Math.abs(wx - g.x) < 340)
      return 'Boss door! Inside, the door locks until he dies. Dodge his attacks, hit him when he rests (J·J·J or K), and grab sweets when they appear.';
  }
  if (G.run.deaths >= 2 && G.run.elapsed < 20) return 'Tip: shrines auto-light as checkpoints. Dodge (SHIFT) through hits instead of trading blows.';
  return 'Walk right (D) to progress. Light every shrine, check high ledges for sweets, and press H again if something blocks you.';
}
