/**
 * Playthrough simulator: npm run play [-- --minutes 40 --filter spectre --seed x]
 * A bot plays the test-arena waves from level 1 to 10 with every plan in scripts/sim/plans.ts.
 */
import { PLANS } from './plans';
import { playthrough } from './playthrough';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const minutes = Number(arg('minutes') ?? 40);
const filter = arg('filter')?.toLowerCase();
const seeds = (arg('seeds') ?? 'a,b').split(',');

const fmt = (s: number | undefined) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '  –  ');
console.log(`Bot playthrough to level 10 (max ${minutes} min, seeds ${seeds.join('/')})\n`);
console.log(`${'plan'.padEnd(28)} ${'L5'.padStart(6)} ${'L10'.padStart(6)} ${'lvl'.padStart(4)} ${'deaths'.padStart(6)} ${'life'.padStart(5)} ${'wave'.padStart(5)} ${'kills'.padStart(6)}`);
for (const plan of PLANS) {
  if (filter && !plan.name.toLowerCase().includes(filter)) continue;
  for (const seed of seeds) {
    const r = playthrough(plan, { maxMinutes: minutes, seed });
    console.log(
      `${(plan.name + ' ' + seed).padEnd(28)} ${fmt(r.levelTimes[5]).padStart(6)} ${fmt(r.levelTimes[10]).padStart(6)} ${String(r.reached).padStart(4)} ${String(r.deaths).padStart(6)} ${(Math.round(r.avgLife * 100) + '%').padStart(5)} ${String(r.wave).padStart(5)} ${String(r.kills).padStart(6)}${process.env.PLAY_TAKEN ? '  ' + Object.entries(r.taken).map(([k, v]) => `${k}:${Math.round(v)}`).join(' ') : ''}${process.env.PLAY_ACTIVITY ? '  ' + Object.entries(r.activity).map(([k, v]) => `${k}:${Math.round(v / 60)}s`).join(' ') : ''}`,
    );
  }
}
