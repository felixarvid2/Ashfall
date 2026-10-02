# Classes

Class data: `src/data/classes/*.ts`, skills `src/data/skills/*.ts`, trees `src/data/skillTree/*.ts`.
The tree rules, effects vocabulary, aspects and uniques are described in [skill-tree.md](skill-tree.md).

| Class | Primary | Resource | Life | Armor | Speed | Playstyle |
|---|---|---|---|---|---|---|
| Bastion | Strength | Heat: built by hitting and being hit, decays out of combat, overheats at max | 220 (+14/lvl) | 60 | 5.5 | heavy melee |
| Spectre | Dexterity | Focus: +4/s always, +4 per crit, +10 per dodged hit | 170 (+11/lvl) | 30 | 6.2 | ranged, traps, blades |
| Xenomant | Intelligence | Biomass: +8 when an enemy dies within 14 m, basics +5/+6, rots slowly out of combat | 180 (+12/lvl) | 35 | 5.8 | minions, disease, melee leech |

## Spectre skills
| Skill | Branch | Cost / CD | What it does |
|---|---|---|---|
| Quick Shot | Basic | +6 Focus | fast projectile, 0.65× |
| Vibro Slash | Basic | +7 Focus | 110° melee slash, 0.6×, Vulnerable 2 s |
| Piercing Shot | Core | 30 Focus | round through every enemy in a line, 2× |
| Pistol Barrage | Core | 35 Focus | 5 rounds in a 50° fan, 0.55× each |
| Holo Decoy | Defensive | CD 18 | hologram (60 % of your life) taunts enemies within 10 m for 6 s |
| Smoke Cloak | Defensive | CD 15, +20 Focus | stealth 4 s: enemies lose you, next hit is a crit; cleanses |
| Phase Shift | Tactical | CD 7, +10 Focus | blink up to 7 m, 0.25 s invulnerable |
| Minefield | Tactical | CD 10 | 3 mines (arm 0.6 s, trigger 1.4 m, blast 3 m, 2.6×, stun) |
| Cluster Grenade | Mastery | CD 10 | arcing grenade: 3.2 m blast 2.5× + burning, 5 bomblets 0.8× |
| Death Mark | Ultimate | CD 45 | 6 m area at the cursor: Marked 10 s (+25 % damage taken, 15 Focus refund on death) + Vulnerable |

Key passives: **Deadeye** (+10 % crit, ×20 % ranged damage), **Saboteur** (×40 % Minefield and Cluster
Grenade, +10 % CDR), **Ghost** (×35 % damage for 2.5 s after a dodge or Phase Shift, +8 % speed).

Three intended builds: **sniper** (Piercing Shot, Deadeye), **trapper** (Minefield, Cluster Grenade,
Holo Decoy, Saboteur), **blades** (Vibro Slash, Smoke Cloak, Phase Shift, Ghost).

Aspects: Ricocheting, Marksman's, Storming, Trapper's, Demolishing, Phantom, Ambusher's, Predator's,
Dancing. Uniques: **Widowmaker** (rifle: Piercing Shot explodes on every enemy it passes),
**Echo Holsters** (twin pistols: Quick Shot fires a three-round spread).

## Mechanics added for Spectre
- **Projectiles** (`kind: 'projectile'`): count, spread, pierce, explode radius; damage is computed on
  impact through the normal hit path. Resource gain is granted on the first hit.
- **Grenades** (`kind: 'grenade'`): a delayed strike that flies in an arc, optional bomblets.
- **Traps** (`kind: 'trap'`): mines that arm, then explode when an enemy is within the trigger radius.
- **Blink**, **decoy** (taunt radius, optional burst), **cursorBurst** (instant area at the cursor).
- **Statuses**: Marked (mark kind), Stealth and Evasive (buff kind; read by AI and the damage code).
- **Conditions**: `marked` (target), `evasive`, `stealthed` (attacker).
- **Enemy targeting**: decoys inside their taunt radius first, otherwise the nearest visible target.

## Xenomant skills
| Skill | Branch | Cost / CD | What it does |
|---|---|---|---|
| Spore Dart | Basic | +5 Biomass | poison dart, 0.55× + poison |
| Scalpel Slash | Basic | +6 Biomass | 100° melee slash, 0.75×, heals 8 % of damage |
| Spore Burst | Core | 25 Biomass | cloud at the cursor: 0.6× hit, then poisons for 0.8× weapon damage per second for 5 s |
| Parasite Link | Core | 25 Biomass | links the enemy nearest the cursor for 3 s: 6 × 0.5×, heals 25 % of it |
| Chitin Armor | Defensive | CD 16 | 6 s: 30 % less damage taken, melee attackers take 0.6× your weapon damage |
| Spore Cocoon | Defensive | CD 20 | barrier 25 % life, heal 10 %, cleanse |
| Raise Corpse | Tactical | 15 Biomass | raises up to 2 corpses near the cursor as minions (max 6; oldest replaced) |
| Grasping Tendrils | Tactical | CD 10 | 4 m area: Rooted 2 s + poison |
| Corpse Explosion | Mastery | CD 3, 10 Biomass | detonates up to 3 corpses: 3.2 m, 2.2× + poison each |
| Wrath of Lumen | Ultimate | CD 60 | a Lumen colossus for 12 s: taunts within 8 m, slams 3.8 m every 1.2 s (2.2× + poison) |

Key passives: **Hive Mind** (minions ×40 % damage, +2 minions), **Pandemic** (×30 % damage to Poisoned,
Spore Burst lasts 50 % longer), **Symbiote** (×25 % melee damage, Scalpel heals 6 % more, 10 % damage reduction).

Three intended builds: **minions** (Raise Corpse, Corpse Explosion, Hive Mind), **disease** (Spore Burst,
Grasping Tendrils, Pandemic), **melee** (Scalpel Slash, Parasite Link, Chitin Armor, Symbiote).

Aspects: Plaguebearer's, Swarming, Leeching, Parasitic, Detonating, Carapaced, Hivemother's, Virulent,
Ancient. Uniques: **Mother of Spores** (bio-focus: Spore Dart bursts into a spore cloud),
**Crown of the Hive** (helm: +3 minions, +1 raised per cast, minions 30 % frailer). New base: Scalpel Blade.

## Mechanics added for Xenomant
- **Corpses**: enemy bodies linger for 20 s (`Dead.corpse`) and sink during their last second.
  Raise Corpse and Corpse Explosion use them up.
- **Minions** reuse the dead enemy's own entity and model: re-teamed, healed, glowing Lumen green, with
  `MinionAI` (guard the owner: attack enemies within 10 m of them, follow otherwise, teleport back
  beyond 18 m). Drones become ranged minions. Minion hits use the owner's offence (gear, level, passives)
  and count as the `minion` condition. Enemies target minions like any other player-side entity.
- **Tether** (Parasite Link), **cloud** (Spore Burst), **corpseBurst**, **turret** (Wrath of Lumen).
- **Life steal** on any impact (`lifeSteal`), **Chitin** (ward status: damage reduction + thorns),
  **Rooted** (disable).
- Poison now stacks to 10; a full stack replaces its weakest instance.
- Enemy toxic resistance lowered (colonist 30 → 10 %, spore carrier 50 → 25 %) so Xenomant isn't
  crippled in the first zone. The balance simulator uses a neutral dummy (armor 30, no resistances).
