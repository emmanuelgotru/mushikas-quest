# Judge Demo Route — 4 minutes that sell the game

A beat-by-beat script for live demos (class presentation, judging panel, video recording).
Every beat is real gameplay — no cheats needed. Practice it once end-to-end before presenting.

**Presenter keyboard card:** `A/D` move · `Space` jump · `J` swipe (3-hit combo) · `K` Tail Cyclone (AoE spin) · `Shift` dodge ·
`C` Divine Boon · `F` interact/shrine · `Esc` pause · `M` mute · `V` Siddhi Surge (full Bhakti).

---

## The route (Day 1 — The Swamps of Jealousy)

| Time | Beat | What you do | What you say |
| --- | --- | --- | --- |
| 0:00 | **Title** | Let the masthead animate (petals, moon, halo). | "Nine Days of Dharma — a Metroidvania of Indian myth. Every pixel you see is drawn in code: zero image assets, zero build step, one static folder." |
| 0:20 | **Festival Calendar** | Open it; hover the nine day-cards. | "Nine days, nine Asuras of vice, nine Divine Boons. Each boon is a key that unlocks the next day's gates — progression is ability-gated, classic Metroidvania." |
| 0:40 | **Codex of Dharma** | Flip Boons → Vices → Story tabs. | "The lore layer: Mushika is Ganesha's mouse — reincarnated Gajamukhasura — redeeming nine lifetimes of vice." |
| 1:00 | **Begin the Quest** | On a fresh profile the **How to Play** modal auto-opens. Show both columns, dismiss with *Got it*. | "First run teaches itself: full control map plus combat doctrine — Bhakti, armoured enemies, shrines, secrets." |
| 1:15 | **The coach** | Follow the on-screen cues: walk → jump → swipe → dodge. | "Then an in-world coach cues each basic until you actually perform it — no walls of text, learn by doing." |
| 2:00 | **First contact** | Let a crawler touch you once, then kill it with the 3-hit combo. | "Watch the feedback: the enemy flashes '!' when it spots you, flashes white when it claws you, and the toast explains the damage. Nothing in this game is unexplained." |
| 2:30 | **Thief** | Let a modak-thief steal, chase it, recover the modak. | "Even the economy fights back — thieves steal collected modaks; chase them for restitution." |
| 2:50 | **Shrine** | Press `F` at the shrine; watch the bless flash + hearts refill. | "Shrines are checkpoints and full heals — they remember where you fell." |
| 3:10 | **Boss gate → Matsarasura** | Enter the arena; dodge two telegraphs; finish it. | "Day 1's Asura of Jealousy. Telegraphed attacks, readable tells — and on death, the boon ceremony." |
| 3:50 | **Boon ceremony** | Let the Boon screen play (Sanskrit verse + translation), accept. | "Each boon is a ritual moment — verse, translation, and a new traversal verb." |
| 4:00 | **Boon in action** | Press `C`: throw the Boomerang, recall distant modaks. Open the Calendar: Day 2 unlocked. | "The Boomerang gathers modaks across gaps — and tomorrow, Ekadanta's Charge will shatter cracked walls. Nine verbs, nine days. Thank you." |

**If you only have 90 seconds:** Title (10 s) → How-to modal (15 s) → coach cues (20 s) →
one telegraphed kill + toast (20 s) → boss intro card + boss bar (15 s) → Calendar with
Day 2 unlocked (10 s).

---

## Contingencies (keep smiling, keep talking)

- **Fell in a pit:** the death veil is a feature — "THE MOUSE FALLS…" — shrine respawn keeps
  the demo flowing. Say: "Even failure is staged."
- **Boss fight drags:** dodge-first play is fine; or say "the full fight chain is in the
  recording" and move to the Calendar beat.
- **Wrong key fumble:** `Esc` pauses cleanly (stats + resume); nothing breaks mid-pause.
- **Projector/low-end machine:** Settings → reduce particles / disable grain; the game
  honours `prefers-reduced-motion` automatically.
- **Phone demo:** hand over the device — thumb-stick + four buttons appear by themselves;
  landscape recommended.

## Wow-points to name out loud (judges love constraints)

1. **Zero binary assets** — terrain, characters, bosses, particles: all procedural canvas.
2. **Zero dependencies at runtime** — vanilla ES modules; hosts on any static CDN.
3. **Self-teaching** — first-run modal + adaptive coach + telegraphed combat feedback.
4. **Nine-day ability-gating** — boons as keys (boomerang → charge → true sight → tether →
   shield → focus → phase → smoke → the Parashu finale against Sindhu).
5. **Accessible & responsive** — touch controls, reduced-motion, five verified viewport
   classes, keyboard-only playable.

## Evidence folder (if they ask "does it actually run?")

`shots/` contains 60+ captured frames: `title_final.png`, `onboard_1_howto.png` (modal),
`onboard_2..5` (coach), `hit_1.png` (telegraph + toast), `sweep_09..44` (all nine days +
boss arenas), `boss_day*_combat.png`, `phone_hud_lanes.png` (mobile HUD), plus harness
logs: full 1→9 playthrough (`tools/smoke.mjs`), reachability + gate tests, 46-shot visual
sweep, responsive matrix — all green, zero console errors.
