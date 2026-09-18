# 🐭 Mushika's Quest — Nine Days of Dharma

**A handcrafted mythological Metroidvania in pure vanilla JavaScript + Canvas 2D — no engine, no frameworks, no external art assets. Every pixel, particle and pulse of sound is generated in code.**

### ▶ PLAY NOW: [https://mushikas-quest.vercel.app](https://mushikas-quest.vercel.app)

Works in any modern browser (keyboard, gamepad & touch). No install, no build step.

---

## 📜 The Legend

You are **Mushika**, the humble mouse who carries Lord Ganesha — but in a past life you were
**Gajamukhasura**, an asura unmade by the Elephant-Headed God and reborn lowly to walk the path of dharma.
Nine Asuras of Vice have seized nine sacred realms. Each one you vanquish earns you a **Divine Boon** —
a new power that gates the next day's gate. On the ninth day waits **Sindhu, the Invincible**, who stole
the Amrita… and can only fall to a mouse who chains all eight boons into one perfect sequence.

## ✨ Features

- **9 hand-built days / biomes** — Swamps of Jealousy → Fortress of Arrogance → Labyrinth of Delusion →
  Golden Mines of Greed → Volcano of Anger → Gardens of Temptation → Web of Attachment → Hall of Mirrors →
  the Immortal Ocean — each with its own palette, parallax, weather and hazards.
- **9 multi-phase boss fights** with telegraphed attacks, breakable armour, mirror twins, stealth guards,
  laser webs and a final chain-combo finale.
- **Progressive combat arts** — every boon unlocks a new weapon *and* a new combo tier; old tricks never expire.
- **Cinematic feel, all in code** — volumetric god-rays, drifting haze & light motes, film grain, vignette,
  camera punch-ins & shake, squash-and-stretch animation, dodge after-images, glowing slash arcs.
- **Forgiving by design** — checkpoints + shrine saves, plain-language coach hints (`H`),
  casual-friendly Story difficulty, and in-fight teaching toasts that name the exact buttons.
- **Zero dependencies** — ES modules, Canvas 2D, WebAudio-synthesised music & SFX. ~100% static,
  deployable to any static host (shipped on Vercel).

## 🎮 Controls

| Action | Keys |
|---|---|
| Move | `←` `→` / `A` `D` |
| Jump / Double-jump | `Space` / `W` |
| Attack (chain `J·J·J`) | `J` / `X` |
| Cyclone spin (finisher) | `K` |
| Dodge dash (i-frames) | `Shift` / `L` |
| Boon special (shield, phase, stealth…) | `C` / `Z` |
| Swap boon / weapon | `Q` / `Tab` |
| Interact · cast at gates | `E` / `F` |
| Hint · Pause · Mute | `H` · `Esc` · `M` |
| Select boon slot | `1`–`8` |

Gamepad and touch controls are auto-detected.

## 🗓 The Nine Days

| Day | Realm | Asura of Vice | Divine Boon earned |
|---|---|---|---|
| 1 | Swamps of Jealousy | Matsarasura | Vakratunda's Boomerang |
| 2 | Fortress of Arrogance | Madasura | Ekadanta's Charge |
| 3 | Labyrinth of Delusion | Mohasura | Mahodara's True Sight |
| 4 | Golden Mines of Greed | Lobhasura | Gajanana's Pull |
| 5 | Volcano of Anger | Krodhasura | Lambodara's Shield |
| 6 | Gardens of Temptation | Kamasura | Vikata's Focus |
| 7 | Web of Attachment | Mamatasura | Vighnaraja's Phase |
| 8 | Hall of Mirrors / Ego | Abhimanasura | Dhumravarna's Smoke Form |
| 9 | The Immortal Ocean | Sindhu, the Invincible | The Parashu |

*Each boon is named for one of the eight sacred aspects of Lord Ganesha.*

## 🛠 Run locally

```bash
git clone <this repo> && cd mushikas-quest
python3 -m http.server 8080     # or: npx serve
# open http://localhost:8080
```

## 🧱 Project structure

```
index.html          shell, HUD & screen markup
css/style.css       all UI styling & animation
js/main.js          game loop, state machine, camera direction
js/core/            input (kb/gamepad/touch), audio synth, particles, fx
js/game/            player, bosses, entities, world renderer
js/ui/              HUD, screens, coach toasts
js/data/            levels, lore, boons, hints
```

---

*Built as a college project — crafted to be judged. 🙏*
