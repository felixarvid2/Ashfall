# Skill tree, aspects and uniques (Phase 3b)

Data: `src/data/skillTree/bastion.ts`, `src/data/skills/bastion.ts`, `src/data/loot/aspects.ts`,
`src/data/loot/uniques.ts`. Rules: `src/systems/skillTree.ts`. Skill building: `src/systems/skillCompile.ts`.
Names and descriptions: `src/data/lang/en.json` (`tree.*`, `skills.*`, `aspects.*`, `uniques.*`).

## Tree rules (Diablo 4 style)
- One skill point per level after 1. The starting skill (Hydraulic Strike rank 1) is free.
- Branches open by points in the tree: Basic 0 · Core 2 · Defensive 5 · Tactical 9 · Mastery 14 ·
  Ultimate 20 · Key Passive 28.
- Node types: **skill** (ranks 1–5, +10 % damage and +8 % barrier/heal per rank above 1),
  **enhancement** (1 point, needs the skill), **modifier** (choose one of two, needs the enhancement),
  **passive** (ranks 1–3, effect × rank), **key passive** (only one).
- Respec (button in the tree): refunds everything except the starting skill for 25 gold × level.
- A newly learned active skill goes to the first free action-bar slot. Click a slot then a learned skill
  to rebind; right-click a slot to clear it. Unlearned skills are removed from the bar.

## Bastion skills
| Skill | Branch | Cost / CD | What it does |
|---|---|---|---|
| Hydraulic Strike | Basic | +11 Heat | 120° swing, 0.9× weapon damage, burns above 70 Heat |
| Piston Jab | Basic | +8 Heat | fast 50° jab, 0.6×, Vulnerable 1.5 s |
| Seismic Shock | Core | 35 Heat | nova 4.2 m, 2.2×, knockback, Vulnerable 4 s |
| Furnace Cleave | Core | 40 Heat | 170° heat cleave, 2.4×, Burning |
| Energy Shield | Defensive | CD 14 | barrier 35 % life, cleanse |
| Coolant Flush | Defensive | CD 16 | −40 Heat, heal 18 %, barrier 12 % |
| Rocket Leap | Tactical | CD 7 | leap up to 9 m, landing stun |
| Magnetic Pull | Tactical | CD 10 | pulls enemies within 7 m to you, stun 0.6 s |
| Heat Vent | Mastery | CD 12, ≥ 20 Heat | spends all Heat: (1 + 0.04 × Heat)× in 5.5 m, Burning |
| Orbital Strike | Ultimate | CD 50 | 1 s telegraph at the cursor, 9×, stun 2 s, Vulnerable 6 s |

Key passives: **Reactor Core** (×25 % damage at ≥ 70 % Heat, overheat 0.5 s sooner),
**Bulwark Protocol** (×20 % damage with a barrier, barriers +30 %),
**Shockwave Engine** (×30 % damage to Vulnerable).

## Effects vocabulary
Tree nodes, aspects and uniques share one small set of effects (`src/data/effects.ts`):
- `stat` — adds to a character stat (same keys as item affixes).
- `damage` — global damage bonus, additive or multiplicative, optionally conditional
  (target: vulnerable, stunned, burning, elite …; attacker: `highResource` ≥ 70 %, `hasBarrier`).
- `skillMod` — changes one skill: `mul` / `add` / `set` a field (coefficient, radius, range, arc,
  cooldown, cost, gain, knockback, cast time, landing radius/coefficient, barrier, heal), `addApply`
  (extra status), `hazard` (burning/poison ground area), `damage` (bonus for that skill only).
- `overheat` — seconds of grace before overheating and a multiplier on overheat damage.

A skill is compiled as `(base + Σadd) × (1 + Σmul)`, then `set` overrides, then rank scaling.
Aspect values use `"$"` (rolled value) or `"-$"` in data.

## Legendary aspects
A legendary item always has one aspect that fits its type (85 % from the player's class pool).
The value rolls between min and max, scaled by item power like affixes. 16 aspects: 14 Bastion
(e.g. *Fissuring*: Seismic Shock leaves a burning fissure; *Momentum*: Rocket Leap cooldown −20–35 %;
*Exposing*: ×10–20 % damage to Vulnerable) and 2 generic (*Lifeblood*, *Unbroken*).
Items show the aspect name as a prefix ("Wrecking Mag Boots").

## Unique and mythic items
Fixed base, fixed affix ranges, and a build-changing effect:
| Item | Slot | Effect |
|---|---|---|
| Governor's Crucible | Chest | Seismic Shock costs no Heat, but gets a 3.5 s cooldown |
| Ashwalker Treads | Boots | Rocket Leap −60 % cooldown, +60 % landing damage, costs 25 Heat |
| Fist of Kharos | Weapon | Hydraulic Strike hits 360°, +0.6 m range, −20 % damage |
| Heart of Lumen (mythic) | Amulet | ×35 % damage, overheating no longer hurts; all affixes greater |

## Balance simulator
`npm run sim` runs sample builds (`scripts/sim/builds.ts`) for 60 s against a stationary training dummy
with the real combat systems and a priority rotation. Current numbers (seeded):

| Build | DPS |
|---|---|
| L1 starter (Hydraulic Strike) | 27 |
| L5 Strike + Seismic Shock | 66 |
| L15 Jab + Furnace Cleave (wildfire) | 319 |
| L15 Strike + Shock (crushing, rupture) | 238 |
| L30 Reactor Core vent build | 519 |
| L30 Shockwave Engine + Fist of Kharos | 787 |
| L30 Heart of Lumen | 933 |

The dummy does not fight back, so defensive skills and positioning are not valued; use it to compare
damage builds and to catch outliers after data changes.
