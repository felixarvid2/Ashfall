# Classes

Class data: `src/data/classes/*.ts`, skills `src/data/skills/*.ts`, trees `src/data/skillTree/*.ts`.
The tree rules, effects vocabulary, aspects and uniques are described in [skill-tree.md](skill-tree.md).

| Class | Primary | Resource | Life | Armor | Speed | Playstyle |
|---|---|---|---|---|---|---|
| Bastion | Strength | Heat: built by hitting and being hit, decays out of combat, overheats at max | 220 (+14/lvl) | 60 | 5.5 | heavy melee |
| Spectre | Dexterity | Focus: +4/s always, +4 per crit, +10 per dodged hit | 170 (+11/lvl) | 30 | 6.2 | ranged, traps, blades |
| Xenomant | Intelligence | Biomass (Phase 4b) | – | – | – | minions, disease |

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
