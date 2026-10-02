# Damage formula

Implemented in [`src/systems/damage.ts`](../src/systems/damage.ts) and covered by `tests/damage.test.ts`.
The model follows the Diablo 4 idea of **damage buckets**: bonuses inside the same bucket are *added*,
while separate buckets *multiply* each other.

## Overview

```
outgoing = W × C × (1 + mainStat × 0.001) × (1 + ΣA) × Π(1 + Mᵢ) × crit
taken    = outgoing × vulnerable × (1 − mitigation)
```

| Symbol | Meaning | Where it comes from |
|---|---|---|
| **W** | Weapon damage | Class starter weapon (Phase 1), items (Phase 3) |
| **C** | Skill coefficient | `effect.coefficient` in `src/data/skills/*.ts` (e.g. Hydraulic Strike 0.9, Seismic Shock 2.2) |
| **mainStat** | Strength / Agility / Intelligence | Each point = +0.1 % damage, its own multiplier |
| **ΣA** | Sum of **additive** bonuses | `CombatStats.additive` — "+20 % damage", "+15 % vs vulnerable", "+10 % melee" |
| **Mᵢ** | Each **multiplicative** bonus | `CombatStats.multiplicative` — aspects, key passives ("×25 % damage") |
| **crit** | `1 + critDamage` on a crit, otherwise 1 | Crit roll uses the seeded RNG; base crit damage is +50 % |
| **vulnerable** | 1.2 if the target is Vulnerable | `src/data/statuses.ts` |
| **mitigation** | Armor (physical) or resistance (elemental) | Target `CombatStats` |

### Additive vs multiplicative — worked example

Two bonuses of +20 % and +30 %:

- both **additive** → one bucket: `1 + 0.2 + 0.3 = ×1.50`
- both **multiplicative** → separate buckets: `1.2 × 1.3 = ×1.56`

Stacking more of the same additive bonus therefore has diminishing value, which is what makes
multiplicative sources (aspects, key passives) feel strong and build-defining.

### Conditional bonuses

A bonus can carry `when: 'vulnerable' | 'stunned' | 'burning' | 'poisoned' | 'chilled' | 'elite' | 'melee' | 'ranged'`.
It only joins its bucket when the condition is true for the current hit
(e.g. "+20 % vs vulnerable" is part of ΣA only against Vulnerable targets).

## Mitigation

**Armor** (physical damage only), with diminishing returns and a cap:

```
armorReduction = min(0.85, armor / (armor + 50 + 15 × attackerLevel))
```

Higher-level attackers punch through the same armor more easily, so armor must keep up with zone level.

**Resistances** (heat, cold, toxic, energy, void) are stored as fractions and capped at **70 %**.
They ignore armor.

## Damage over time

DoTs (Burning, Poisoned) snapshot the attacker's **outgoing** damage when applied (no crit),
spread it evenly over the duration, and are mitigated by the target's resistance **at each tick**
(every 0.5 s), so making a target Vulnerable mid-burn increases the remaining ticks.

## Barrier

After mitigation, damage first depletes Barrier (Energy Shield, Spore Carrier shields), then life.

## Example (Phase 1 numbers)

Bastion Hydraulic Strike vs. an Infected Colonist (armor 20), no crit:

```
14 (W) × 0.9 (C) × 1.02 (20 Strength) = 12.85 outgoing
armor: 20 / (20 + 50 + 15) = 23.5 % → 12.85 × 0.765 = 9.83 damage
```

If the colonist is Vulnerable (after Seismic Shock): `9.83 × 1.2 = 11.8`.
