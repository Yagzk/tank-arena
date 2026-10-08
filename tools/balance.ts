import { BrawlEngine } from '../src/game/brawlEngine.ts';
import { BRAWLERS, BRAWLER_IDS } from '../src/types/brawl.ts';
import { KITS } from '../src/sim/kits/index.ts';
import * as fs from 'fs';

/**
 * Balance harness: every character against every other, one on one on open
 * ground, plus random three-on-three matches on the real maps, all played by
 * bots. Prints each character's win rate.
 *
 *   npm run balance                     report only
 *   npm run balance -- 6 700 3 apply    also run 6 rounds of automatic nudging
 *                                       and write the suggestion to balance.json
 *
 * Bots are not people: they cannot use cover or time a Super, so read the
 * numbers as "nobody is hopeless and nobody is a bully", not as a tier list.
 */

let rs = 424242;
const rnd = () => { rs = (rs * 1664525 + 1013904223) % 4294967296; return rs / 4294967296; };
Math.random = rnd;

const ids = BRAWLER_IDS as string[];
const ROUNDS = Number(process.argv[2] ?? 10);
const TEAM_MATCHES = Number(process.argv[3] ?? 900);
const DUEL_SEEDS = Number(process.argv[4] ?? 4);
const APPLY = process.argv[5] === 'apply';
const W_DUEL = 0.3;

function duel(a: string, b: string, seed: number): number {
  const e = new BrawlEngine();
  e.initMatch([
    { id: 'a', name: 'A', brawler: a as any, team: 0, isHost: false, isBot: true, score: 0, trophies: 0 },
    { id: 'b', name: 'B', brawler: b as any, team: 1, isHost: false, isBot: true, score: 0, trophies: 0 },
  ], 'showdown', seed);
  e.phase = 'playing'; e.walls = []; e.boxes = []; e.bushes = []; e.poisonGas.isActive = false;
  const [A, B] = e.brawlers;
  const swap = seed % 2 === 1;
  A.x = A.prevX = swap ? 1500 : 900; B.x = B.prevX = swap ? 900 : 1500; A.y = A.prevY = B.y = B.prevY = 900;
  for (let i = 0; i < 60 * 70; i++) { e.update(1 / 60); if (!A.isAlive || !B.isAlive) break; }
  if (!A.isAlive && !B.isAlive) return 0.5;
  if (!A.isAlive) return 1;
  if (!B.isAlive) return 0;
  const ra = A.hp / A.maxHp, rb = B.hp / B.maxHp;
  return Math.abs(ra - rb) < 0.02 ? 0.5 : ra > rb ? 0 : 1;
}

function team(comp: string[], seed: number): number {
  const e = new BrawlEngine();
  e.initMatch(comp.map((b, i) => ({ id: 'p' + i, name: 'P' + i, brawler: b as any, team: i, isHost: false, isBot: true, score: 0, trophies: 0 })), 'wipeout', seed);
  e.phase = 'playing';
  for (let i = 0; i < 60 * 130 && (e.phase as string) !== 'match_end'; i++) e.update(1 / 60);
  return e.winnerTeam === null ? 0.5 : e.winnerTeam;
}

function evaluate(): Record<string, { duel: number; team: number }> {
  const out: Record<string, { duel: number; team: number }> = {};
  const dW: Record<string, number> = {}, dG: Record<string, number> = {}, tW: Record<string, number> = {}, tG: Record<string, number> = {};
  for (const id of ids) { dW[id] = dG[id] = tW[id] = tG[id] = 0; }
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) for (let s = 1; s <= DUEL_SEEDS; s++) {
    const r = duel(ids[i], ids[j], s + 7 * (i * 31 + j));
    dW[ids[i]] += 1 - r; dW[ids[j]] += r; dG[ids[i]]++; dG[ids[j]]++;
  }
  const lcg = (() => { let x = 777; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; })();
  for (let m = 0; m < TEAM_MATCHES; m++) {
    const pool = ids.slice();
    const comp: string[] = [];
    for (let k = 0; k < 6; k++) comp.push(pool.splice(Math.floor(lcg() * pool.length), 1)[0]);
    const r = team(comp, 1000 + m); // r = winning team index; team = idx % 2 in 'sides'
    for (let k = 0; k < 6; k++) {
      const side = k % 2;
      const won = r === 0.5 ? 0.5 : r === side ? 1 : 0;
      tW[comp[k]] += won; tG[comp[k]]++;
    }
  }
  for (const id of ids) out[id] = { duel: dW[id] / dG[id], team: tW[id] / Math.max(1, tG[id]) };
  return out;
}

const scale: Record<string, number> = {}, hp: Record<string, number> = {};
for (const id of ids) { scale[id] = (KITS as any)[id].traits?.damageScale ?? 1; hp[id] = (BRAWLERS as any)[id].maxHp; }
if (process.argv[6] === 'refine') {
  const t = JSON.parse(fs.readFileSync('balance.json', 'utf-8'));
  for (const id of ids) {
    const base = hp[id];
    scale[id] = t.scale[id];
    hp[id] = Math.round(Math.min(base * 1.25, Math.max(base * 0.8, t.hp[id])) / 50) * 50;
  }
}
const HP_STEP = process.argv[6] === 'refine' ? 0 : 0.35;
function applyTo() { for (const id of ids) { const k = (KITS as any)[id]; k.traits = { ...(k.traits ?? {}), damageScale: scale[id] }; (BRAWLERS as any)[id].maxHp = Math.round(hp[id] / 50) * 50; } }

for (let r = 0; r <= ROUNDS; r++) {
  applyTo();
  const res = evaluate();
  const spread = ids.map(id => W_DUEL * res[id].duel + (1 - W_DUEL) * res[id].team);
  const sd = Math.sqrt(spread.reduce((s, v) => s + (v - 0.5) ** 2, 0) / ids.length);
  console.log('round', r, 'spread(stddev from 50%)', (sd * 100).toFixed(1) + '%');
  if (r === ROUNDS) {
    for (const id of ids) console.log(id.padEnd(10), 'duel', (res[id].duel * 100).toFixed(0).padStart(3), 'team', (res[id].team * 100).toFixed(0).padStart(3), 'scale', scale[id].toFixed(2), 'hp', Math.round(hp[id] / 50) * 50);
    break;
  }
  for (const id of ids) {
    const wr = W_DUEL * res[id].duel + (1 - W_DUEL) * res[id].team;
    const e = wr - 0.5;
    scale[id] = Math.min(2.2, Math.max(0.35, scale[id] * (1 - 0.7 * e)));
    hp[id] = Math.min(9000, Math.max(1800, hp[id] * (1 - HP_STEP * e)));
  }
}
if (APPLY) fs.writeFileSync('balance.json', JSON.stringify({ scale, hp }, null, 1));
