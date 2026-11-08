/**
 * The "hide low loot" setting (C01): common and magic drops vanish from the ground (model, beam and label). Crystals
 * and gold are not items of this kind and always show; Alt (`showAll`) brings everything back.
 */
export function hiddenByLootFilter(rarity: string, crystal: boolean, hideLow: boolean, showAll = false): boolean {
  return hideLow && !showAll && !crystal && (rarity === 'common' || rarity === 'magic');
}
