/* ===========================================================================
   data/boons.js — the eight Divine Boons (aspects of Shri Ganesha) + Parashu
   =========================================================================== */

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}${extra}</svg>`;

export const BOONS = [
  {
    id: 'boomerang', day: 1, key: 'Vakratunda', deva: 'वक्रतुण्ड',
    name: "Vakratunda's Boomerang", aspect: 'The Curved Tusk · वक्रतुण्ड',
    glyph: '☾', color: '#7fe3ff', cd: 1.05, kind: 'throw',
    icon: svg('<path d="M4 17c1-7 6-12 14-13-3 3-4 6-4 9s-2 6-6 6c-2 0-3.6-.7-4-2z"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/>'),
    desc: 'Hurl Ganesha\u2019s broken tusk as a spinning ethereal blade. It arcs out, slices through multiple foes, strikes distant switches, and always returns to your hand.',
    tip: 'Throw it at glowing switches you cannot reach — and let it hit enemies on the way back for a second strike.',
    verb: 'Throw', meter: 34,
  },
  {
    id: 'charge', day: 2, key: 'Ekadanta', deva: 'एकदन्त',
    name: "Ekadanta's Charge", aspect: 'The One-Tusked · एकदन्त',
    glyph: '➤', color: '#ffd166', cd: 1.5, kind: 'dash',
    icon: svg('<path d="M3 12h9"/><path d="M8 7l5 5-5 5"/><path d="M14 4l7 8-7 8z" fill="currentColor" stroke="none" opacity=".85"/>'),
    desc: 'An unstoppable divine dash. It shatters heavy armour, bursts through cracked walls, and grants brief invulnerability while you tear through the enemy line.',
    tip: 'Cracked walls hide shortcuts and secret modak chambers. Armoured guards can ONLY be broken by the Charge.',
    verb: 'Charge', meter: 40,
  },
  {
    id: 'truesight', day: 3, key: 'Mahodara', deva: 'महोदर',
    name: "Mahodara's True Sight", aspect: 'The Great-Bellied · महोदर',
    glyph: '◉', color: '#c792ff', cd: .35, kind: 'toggle', drain: 11,
    icon: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.1" fill="currentColor" stroke="none"/><path d="M12 2.2v2.2"/>'),
    desc: 'Open the third eye. The world\u2019s illusions dissolve: hidden platforms shimmer into being, spike traps glow, and the weak cores of invulnerable demons are exposed.',
    tip: 'Toggle it while running — illusions in the Labyrinth only exist to fool the closed eye. Drains Bhakti while active.',
    verb: 'Open the Eye', meter: 0,
  },
  {
    id: 'pull', day: 4, key: 'Gajanana', deva: 'गजानन',
    name: "Gajanana's Pull", aspect: 'The Elephant-Faced · गजानन',
    glyph: '➰', color: '#ff9f6e', cd: .9, kind: 'tether',
    icon: svg('<path d="M6 3c0 5 1 7 3 9s3 4 3 6"/><path d="M12 18a3 3 0 1 0 3 3"/><circle cx="17.5" cy="6.5" r="3.2"/><path d="M17.5 9.7c0 4-2 6-5.5 8.3"/>'),
    desc: 'A spectral trunk-tether of magnetic devotion. Yank airborne demons to the ground for combos, rip shields from defenders, or grapple onto lotus anchors to swing across chasms.',
    tip: 'Aim upward at glowing lotus anchors to fly across gaps. Yank a flying enemy down, then swipe in mid-air.',
    verb: 'Tether', meter: 26,
  },
  {
    id: 'shield', day: 5, key: 'Lambodara', deva: 'लम्बोदर',
    name: "Lambodara's Shield", aspect: 'The Round-Bellied · लम्बोदर',
    glyph: '◈', color: '#6ee7a8', cd: 2.2, kind: 'shield',
    icon: svg('<path d="M12 2.6l7.4 3v5.6c0 4.6-3.1 8.6-7.4 10.2-4.3-1.6-7.4-5.6-7.4-10.2V5.6z"/><circle cx="12" cy="11" r="2.6" fill="currentColor" stroke="none"/>'),
    desc: 'A golden energy bubble that swallows projectiles and flame. Absorb enough kinetic fury and release it as one devastating concentrated burst of reflected light.',
    tip: 'Hold it up as a fireball strikes, then release — the stored shot becomes YOURS, at triple damage.',
    verb: 'Raise', meter: 46,
  },
  {
    id: 'focus', day: 6, key: 'Vikata', deva: 'विकट',
    name: "Vikata's Focus", aspect: 'The Auspiciously Strange · विकट',
    glyph: '❂', color: '#8fd3ff', cd: 6.5, kind: 'slowtime',
    icon: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.2V12l3.4 2.2"/><path d="M4.2 8.4C7 9 9.4 9 12 9s5-.1 7.8-.6"/>'),
    desc: 'Bend time around your devotion. The world slows to a crawl while Mushika moves at full speed — perfect for threading hyper-fast strikes and crossing crumbling hazards.',
    tip: 'Use it mid-air to walk across collapsing petals and crumbling ledges that would otherwise drop you.',
    verb: 'Focus', meter: 100,
  },
  {
    id: 'phase', day: 7, key: 'Vighnaraja', deva: 'विघ्नराज',
    name: "Vighnaraja's Phase", aspect: 'Lord of Obstacles · विघ्नराज',
    glyph: '⊘', color: '#a0f0ff', cd: 3.4, kind: 'phase',
    icon: svg('<circle cx="12" cy="12" r="8.6" stroke-dasharray="3 3"/><path d="M6.4 17.6L17.6 6.4"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>'),
    desc: 'Slip into the ethereal plane. For a breath you are untouchable — passing through solid demons, laser barriers, grasping webs and cursed gates alike.',
    tip: 'Phase THROUGH the barrier at the instant a beam crosses you. Also escapes a grapple instantly.',
    verb: 'Phase', meter: 62,
  },
  {
    id: 'smoke', day: 8, key: 'Dhumravarna', deva: 'धूम्रवर्ण',
    name: "Dhumravarna's Smoke Form", aspect: 'The Smoke-Coloured · धूम्रवर्ण',
    glyph: '≋', color: '#b9a7d6', cd: 4.0, kind: 'stealth', drain: 14,
    icon: svg('<path d="M3 15c2.6 0 3.4-2 6-2s3.4 2 6 2 3.4-2 6-2"/><path d="M3 19c2.6 0 3.4-2 6-2s3.4 2 6 2 3.4-2 6-2"/><path d="M8 9c0-2 2-2.6 2-4.6"/><path d="M14 9c0-2 2-2.6 2-4.6"/>'),
    desc: 'Dissolve into sacred incense smoke. Ego-guards — invincible to all direct attack — cannot see you. Slip past their gaze, crawl through vents, and strike from behind for an instant takedown.',
    tip: 'Stay inside shadow pools while smoked. Behind a guard, the takedown prompt appears: one strike, no contest.',
    verb: 'Dissolve', meter: 0,
  },
];

export const PARASHU = {
  id: 'parashu', day: 9, key: 'Parashu', deva: 'परशु',
  name: 'The Parashu', aspect: 'Ganesha\u2019s Battle-Axe · परशु',
  glyph: '⚒', color: '#ffe6a3',
  icon: svg('<path d="M5 19L15 9"/><path d="M12.5 3.5c3.5-1 6 1.5 5 5-2.5 1.6-5.5 1.2-7.4-.8s-2.1-4.4.4-4.2z" fill="currentColor" stroke="none"/>'),
  desc: 'The axe with which Shri Ganesha split the belly of Sindhu and released the stolen nectar of immortality. It cannot be wielded lightly — it answers only a heart free of all nine vices.',
};

export const boonById = (id) => BOONS.find((b) => b.id === id) || null;
export const boonByDay = (d) => BOONS.find((b) => b.day === d) || null;
