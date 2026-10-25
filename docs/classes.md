# Classes

Class data: `src/data/classes/*.ts`, skills `src/data/skills/*.ts`, trees `src/data/skillTree/*.ts`.
The tree rules, effects vocabulary, aspects and uniques are described in [skill-tree.md](skill-tree.md).

| Class | Primary | Resource | Life | Armor | Speed | Playstyle |
|---|---|---|---|---|---|---|
| Bastion | Strength | Heat: built by hitting and being hit, decays out of combat, overheats at max | 220 (+14/lvl) | 60 | 5.8 | heavy melee |
| Spectre | Dexterity | Focus: +4/s always, +4 per crit, +10 per dodged hit | 205 (+14/lvl) | 45 | 6.2 | ranged, traps, blades |
| Xenomant | Intelligence | Biomass: +8 when an enemy dies within 14 m, basics +5/+6, rots slowly out of combat | 180 (+12/lvl) | 35 | 5.8 | minions, disease, melee leech |
| Lightbearer | Intelligence | Devotion: +3/s always, +0.5 per 1 % of an ally's max life healed or shielded (overheal excluded) | 190 (+12/lvl) | 45 | 5.8 | support priest who still deals damage |

Base resistances: Bastion energy 10 %, Spectre energy 20 % (was 10 %: drone bolts were 90 % of what the Blades
build took, see decisions.md 2026-10-25), Xenomant energy 5 %, Lightbearer energy 20 %.

The percentage passives (`maxLifePct`, `armorPct`: Reinforced Plating, Vital Systems, Kevlar Weave, Survival
Instinct, Cell Division, Thick Hide) scale with the whole build; flat +15 armor was noise from level 15 on.

## Bastion skills (changed in the balance pass)
| Skill | Branch | What changed |
|---|---|---|
| Piston Jab | Basic | arc 50 to 90 degrees, so packs that surround you are still hit |
| Furnace Cleave | Core | arc 170 to 200 degrees (the 360 degree Molten modifier keeps its penalty) |
| Heat Vent | Mastery | 2 + 0.10 x Heat times weapon damage (was 1 + 0.04 x Heat), CD 10 s |
| Orbital Strike | Ultimate | 16x weapon damage (was 9x), CD 50 s; about 9 % of a shockwave build's damage |

## Spectre skills
| Skill | Branch | Cost / CD | What it does |
|---|---|---|---|
| Quick Shot | Basic | +6 Focus | fast projectile, 0.65× |
| Vibro Slash | Basic | +7 Focus | 110° melee slash, 0.95×, Vulnerable 2 s |
| Piercing Shot | Core | 30 Focus | round through every enemy in a line, 2× |
| Pistol Barrage | Core | 35 Focus | 5 rounds in a 40° fan, 0.65× each |
| Holo Decoy | Defensive | CD 18 | hologram (60 % of your life) taunts enemies within 10 m for 6 s |
| Smoke Cloak | Defensive | CD 12, +20 Focus | stealth 4 s: enemies lose you, next hit is a crit; cleanses |
| Phase Shift | Tactical | CD 7, +10 Focus | blink up to 7 m, 0.4 s invulnerable |
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
| Spore Dart | Basic | +5 Biomass | homing poison dart, 0.42× + 0.3× poison over 3 s (stacks to 10) |
| Scalpel Slash | Basic | +6 Biomass | 100° melee slash, 1.0×, heals 8 % of damage |
| Spore Burst | Core | 30 Biomass | cloud at the cursor: 1.0× hit, then poisons for 0.44× weapon damage per second for 5 s |
| Parasite Link | Core | 25 Biomass | links the enemy nearest the cursor for 3 s: 6 × 0.6×, heals 25 % of it |
| Chitin Armor | Defensive | CD 16 | 6 s: 30 % less damage taken, melee attackers take 0.6× your weapon damage |
| Spore Cocoon | Defensive | CD 20 | barrier 25 % life, heal 10 %, cleanse |
| Raise Corpse | Tactical | 15 Biomass | raises up to 2 corpses near the cursor as minions (max 6; oldest replaced) |
| Grasping Tendrils | Tactical | CD 10 | 4 m area: Rooted 2 s + poison |
| Corpse Explosion | Mastery | CD 3, 10 Biomass | detonates up to 3 corpses: 3.2 m, 2.2× + poison each |
| Wrath of Lumen | Ultimate | CD 60 | a Lumen colossus for 12 s: taunts within 8 m, slams 3.8 m every 1.2 s (2.2× + poison) |

Key passives: **Hive Mind** (minions ×40 % damage, +2 minions), **Pandemic** (×90 % damage to Poisoned,
Spore Burst lasts 50 % longer), **Symbiote** (×25 % melee damage, and Parasite Link, a ranged tether, is named too; Scalpel heals 6 % more, 10 % damage reduction).

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

## Lightbearer skills
| Skill | Branch | Cost / CD | What it does |
|---|---|---|---|
| Censer Strike | Basic | +4 Devotion | 120° melee arc, 1.15×, corrupted +20 %, knockback |
| Holy Light | Basic | +3 Devotion | seeking mote (homes at 420°/s within 7 m), 0.6× energy, recovery 0.14 s (about 2.3× per second), corrupted +30 % |
| Heal | Core | 35 Devotion, CD 2.5 | heals you and allies within 8 m for 15 % of their life; 6 m energy burst (2.2×) on corrupted enemies only |
| Magnus Exorcismus | Core | 35 Devotion, CD 2 | holy sigil at the cursor (12 m), radius 4.5 m, lasts 4.8 s, pulses every 0.8 s (six pulses, the first at once; never faster than every 0.35 s after modifiers), 0.6× each, corrupted +50 %; two sigils per owner at most, a third cast removes the oldest |
| Kyrie Eleison | Defensive | +10 Devotion, CD 14 | barrier of 25 % life for 6 s on you and allies within 10 m |
| Sanctuary | Defensive | CD 20 | 5 m of holy ground for 7 s: allies recover 4 % life each second, enemies take 0.35× each second (corrupted ×1.6); one zone per owner (a recast replaces it) and duration bonuses stop at 17.5 s (2.5×) |
| Blessing | Tactical | +15 Devotion, CD 16 | 12 m: you and allies get Blessed for 10 s (+20 % damage, 12 % faster moves and casts); removes stuns and slows |
| Lex Aeterna | Tactical | 10 Devotion, CD 8 | 0.8× burst on enemies at the cursor (3.5 m); each one takes 35 % more damage from every source for 6 s (the judgment is not used up) |
| Guardian Light | Mastery | 20 Devotion, CD 1 | summons a hovering light for 25 s (up to 2) with 40 % of your life; shoots 0.7× every 0.8 s within 11 m, bolts burst in 1.5 m (corrupted +30 %); heals 3 % of life every 3 s within 6 m |
| Benediction | Ultimate | CD 60 | 12 m: heals 30 % of life and cleanses allies, who survive the first lethal blow within 8 s (the blessing is spent and 1.5 s of invulnerability follows); cooldown never under 30 s; enemies within 7 m take 3× and are stunned 1.2 s (corrupted +60 %), knocked back 2 m |

Key passives (choose one):
- **Devout** (healer): Heal, Kyrie Eleison and Sanctuary are 35 % stronger (heal, barrier, heal), Devotion builds 15 % faster.
- **Zealot** (exorcist): ranged attacks +15 % damage (multiplicative), +15 % more against corrupted enemies;
  Magnus Exorcismus pulses 20 % faster; Lex Aeterna's cooldown is 25 % shorter.
- **Shepherd** (shepherd): one more Guardian Light (2 → 3), with +40 % life, +25 % duration and 15 % faster
  shots; Blessing reaches 20 % farther; 5 % less damage taken.

Three intended builds:
- **Healer**: Heal, Sanctuary, Kyrie Eleison, Benediction; Devout.
- **Exorcist**: Magnus Exorcismus, Lex Aeterna, Holy Light; Zealot.
- **Shepherd**: Guardian Light, Blessing, Kyrie Eleison; Shepherd.

Aspects: Merciful, Warding, Hallowed, Litanist's, Judge's, Sentinel's, Radiant, Fervent, Daybreak's.
Uniques: **Dawnbringer** (sun staff: Holy Light bursts on impact, leaves burning ground 3 s, 20 % less
damage per hit), **Halo of the Penitent** (combat helm: Sanctuary lasts twice as long and covers 40 % more
area, its cooldown is 50 % longer).

New bases: **Censer Mace** (weapon, 22–27 weapon damage, 12–18 life, 2 sockets), **Sun Staff** (weapon,
25–31 weapon damage, +5 % Devotion gain, 2 sockets), **Reliquary Lantern** (off-hand, +6 % Devotion gain,
10–16 life, 1 socket).

## Mechanics added for Lightbearer
- **allyArea** (`kind: 'allyArea'`): heals, shields or buffs allies in an area around the caster, the caster
  included. Optional `enemyImpact` strikes enemies in a radius; `corruptedOnly` limits that strike to the
  corrupted families.
- **sanctum** (`kind: 'sanctum'`): a ground area that pulses for its duration; the first pulse is immediate.
  Each pulse heals allies (`allyHealFraction`) and hits enemies with its `impact`.
- **guardian** (`kind: 'guardian'`): a summoned hovering light with a Guardian marker. It runs `MinionAI` at
  range, fires its `bolt`, and pulses heals (`healPulse`). It does not count toward Raise Corpse's cap. Its
  model is the existing `light_mote` with a `halo` look.
- **Corrupted families** (`infected`, `lumen`, `CORRUPTED_FAMILIES` in `src/data/schemas.ts`) are read through
  `Impact.corruptedMul` and the `corrupted` condition (target).
- **Data-driven buff fields** on statuses instead of per-status code: `damageMul`, `hasteMul`,
  `damageTakenMul` and `cheatDeath`.
- **Marks**: Lex Aeterna is a plain 6 s "takes 35 % more" mark (not consumed). The `consumeOnHit` status
  option still exists for marks that should be used up by the next direct hit.
- **Sanctum limits**: `maxConcurrent` (live sanctums of a skill per owner; the oldest goes) and `maxDuration`; the
  compiler keeps every sanctum's `interval` at 0.35 s or more. Skills have `minCooldown`, a floor applied after
  cooldown reduction (`effectiveCooldown`). Guardian bolts can burst (`explodeRadius`).
- **Devotion** is fed by `healAlly` and `applyAllyStatus`: the healing or shielding of allies counts for the
  resource, and `resourceGen` (Devout, Piety, the bases) scales it.
- **Weapon look**: the censer and staff are drawn procedurally (a lantern-censer), with no separate model.
- **Effects**: `holy` and `holyRing` vfx, tinted by the skill's `color` (`#fff2b0`, `#ffe9a8`, `#bfe4ff`,
  `#ffe08a`, `#fff6d8`).
- **Skill fields** added: `maxGuardians`, `allyHealFraction` (see [skill-tree.md](skill-tree.md)).
