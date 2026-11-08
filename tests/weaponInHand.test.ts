import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BASE_ITEMS } from '../src/data/loot/db';
import { CLASS_WEAPONS, WEAPON_BY_BASE, weaponMountsFor } from '../src/data/weapons';
import { classAssetIds } from '../src/data/assetSets';
import { GameRenderer } from '../src/render/gameRenderer';

const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8'));
const entries: { id: string; file?: string; source?: string; stats?: { bytes: number } }[] = manifest.assets ?? manifest;

describe('A19 weapon in hand by item', () => {
  it('maps real weapon bases to models that exist, built in Blender and small', () => {
    for (const [base, mounts] of Object.entries(WEAPON_BY_BASE)) {
      const def = BASE_ITEMS.get(base);
      expect(def, base).toBeDefined();
      expect(def!.type).toBe('weapon');
      for (const m of mounts) {
        const e = entries.find((x) => x.id === m.asset)!;
        expect(e, m.asset).toBeDefined();
        expect(e.file).toBeTruthy();
        expect(e.source).toBe('blender');
        expect(e.stats!.bytes).toBeLessThan(30_000);
      }
    }
  });

  it('follows the equipped base, and falls back to the class weapon', () => {
    expect(weaponMountsFor('bastion', 'power_sword')[0]!.asset).toBe('weapon.power_sword');
    expect(weaponMountsFor('lightbearer', 'sun_staff')[0]!.asset).toBe('weapon.sun_staff');
    expect(weaponMountsFor('bastion', 'hydraulic_hammer')).toBe(CLASS_WEAPONS.bastion);
    expect(weaponMountsFor('bastion', null)).toBe(CLASS_WEAPONS.bastion);
    expect(weaponMountsFor('spectre', 'twin_pistols')).toBe(CLASS_WEAPONS.spectre);
    expect(weaponMountsFor('unknown')).toEqual([]);
  });

  it("the class's prefetch list carries its alternative weapon models", () => {
    expect(classAssetIds('bastion')).toContain('weapon.power_sword');
    expect(classAssetIds('bastion')).not.toContain('weapon.sun_staff');
    expect(classAssetIds('lightbearer')).toContain('weapon.sun_staff');
  });

  it('equipping another weapon swaps the model in the hand (and only one at a time)', () => {
    const renderer = Object.create(GameRenderer.prototype) as { assets: unknown; attachWeapons(obj: THREE.Object3D, classId: string, base?: string | null): void };
    renderer.assets = { has: () => true, create: (id: string) => Object.assign(new THREE.Group(), { name: id }) };
    const body = new THREE.Group();
    const hand = new THREE.Object3D();
    hand.name = 'RightHand';
    body.add(hand);
    const held = () => hand.children.map((c) => c.name);
    renderer.attachWeapons(body, 'bastion', 'power_sword');
    expect(held()).toEqual(['weapon:weapon.power_sword']);
    expect(body.userData.weaponBase).toBe('power_sword');
    renderer.attachWeapons(body, 'bastion', 'hydraulic_hammer');
    expect(held()).toEqual(['weapon:weapon.hydraulic_hammer']);
    renderer.attachWeapons(body, 'bastion', null);
    expect(held()).toEqual(['weapon:weapon.hydraulic_hammer']);
    expect(body.userData.weaponBase).toBeNull();
  });
});
