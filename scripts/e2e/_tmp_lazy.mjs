// temporary check (deleted after): bytes before select, zone entries, errors
import { launch, startGame } from './lib.mjs';
const url = process.argv[2];
const { browser, page, errors } = await launch();
let bytes = 0; const bad = []; const warns = [];
page.on('response', async (r) => { try { const b = await r.body(); bytes += b.length; } catch {} if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
page.on('console', (m) => { if (m.type() === 'warning' && m.text().includes('[assets]')) warns.push(m.text()); });
await page.goto(url + (url.includes('?') ? '&debug' : '?debug'));
await page.waitForSelector('[data-testid=slot-0]', { timeout: 180000 });
const beforeSelect = bytes;
await page.click('[data-testid=slot-0]'); await page.click('[data-testid=class-bastion]');
const t0 = Date.now(); await page.click('[data-testid=char-create]');
await page.waitForFunction(() => window.ashfall?.ctx.tick > 30, null, { timeout: 120000 });
const startMs = Date.now() - t0; const afterStart = bytes;
const out = { beforeSelectMB: (beforeSelect / 1e6).toFixed(1), afterStartMB: (afterStart / 1e6).toFixed(1), startMs };
for (const zone of ['zone.refinery_district', 'zone.deep_mines']) {
  const t = Date.now();
  await page.evaluate((z) => window.ashfall.teleportTo ? 0 : 0, zone);
  await page.evaluate(([z]) => { const g = window.ashfall; g.enterZone ? g.enterZone(z, 0, 0) : 0; }, [zone]);
  out[zone] = { ms: Date.now() - t };
}
await page.waitForTimeout(1500);
out.placeholders = await page.evaluate(() => { let n = 0; window.ashfall.renderer.scene.traverse((o) => { if (o.userData.placeholder) n++; }); return n; });
out.totalMB = (bytes / 1e6).toFixed(1);
console.log(JSON.stringify({ ...out, errors, bad: bad.slice(0, 10), warns: warns.slice(0, 5) }));
await browser.close();
