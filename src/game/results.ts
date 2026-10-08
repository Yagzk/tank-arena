/**
 * Who won, who placed where, and what to call it.
 *
 * The results screen used to work this out inline: it listed brawlers in
 * whatever order the snapshot held them, never said where *you* finished in a
 * Showdown, and decided whether to throw confetti without asking whether
 * anybody had won. Working it out here, as a pure function of the final
 * snapshot, means the rules can be tested and the screen only has to draw.
 */

import type { BrawlSnapshot, BrawlerEntity, BrawlerId } from '../types/brawl';

export interface ResultRow {
  id: string;
  name: string;
  brawlerId: BrawlerId;
  team: number;
  /** Final position, from 1. */
  rank: number;
  kills: number;
  deaths: number;
  powerCubes: number;
  gems: number;
  isMe: boolean;
  isStar: boolean;
  /** On the winning side. In Showdown that is the single winner. */
  isWinner: boolean;
}

export interface MatchResult {
  mode: BrawlSnapshot['mode'];
  /** Whether the local player won. A spectator never has. */
  isWin: boolean;
  /** The local player's finishing position, or null if they were not playing. */
  myRank: number | null;
  /** How many were ranked. */
  total: number;
  /** The headline: "ZAFER!", "YENİLGİ", "3. SIRA". */
  title: string;
  /** One line under it. */
  subtitle: string;
  rows: ResultRow[];
}

/** How a gem-carrier is ordered against a fighter on the same team. */
function contribution(b: BrawlerEntity): number {
  return b.gemsCarried * 2 + b.kills;
}

function toRow(
  b: BrawlerEntity,
  rank: number,
  myId: string,
  starId: string | null,
  isWinner: boolean
): ResultRow {
  return {
    id: b.id,
    name: b.name,
    brawlerId: b.brawlerId,
    team: b.team,
    rank,
    kills: b.kills,
    deaths: b.deaths ?? 0,
    powerCubes: b.powerCubes,
    gems: b.gemsCarried,
    isMe: b.id === myId,
    isStar: b.id === starId,
    isWinner,
  };
}

export function computeResults(snapshot: BrawlSnapshot, myId: string): MatchResult {
  // A decoy is a body, not a player, and has no place on a scoreboard.
  const players = snapshot.brawlers.filter(b => !b.isClone);
  const me = players.find(b => b.id === myId);

  return snapshot.mode === 'showdown'
    ? showdownResult(snapshot, players, me, myId)
    : teamResult(snapshot, players, me, myId);
}

function showdownResult(
  snapshot: BrawlSnapshot,
  players: BrawlerEntity[],
  me: BrawlerEntity | undefined,
  myId: string
): MatchResult {
  const byId = new Map(players.map(b => [b.id, b] as const));
  const ordered: BrawlerEntity[] = [];
  const placed = new Set<string>();

  const place = (id: string | null) => {
    if (!id || placed.has(id)) return;
    const b = byId.get(id);
    if (!b) return;
    placed.add(id);
    ordered.push(b);
  };

  // The survivor is first. Everyone else is ranked by how late they went out:
  // the last one eliminated placed second, the first one eliminated placed last.
  place(snapshot.winnerPlayerId);
  for (let i = snapshot.eliminationOrder.length - 1; i >= 0; i--) place(snapshot.eliminationOrder[i]);

  // Anybody not accounted for — a player who was still standing when two went
  // out together, or one who left mid-round — ranks by what they achieved.
  players
    .filter(b => !placed.has(b.id))
    .sort((a, b) => b.kills - a.kills || b.powerCubes - a.powerCubes)
    .forEach(b => place(b.id));

  const rows = ordered.map((b, i) =>
    toRow(b, i + 1, myId, snapshot.starPlayerId, b.id === snapshot.winnerPlayerId)
  );

  const myRow = rows.find(r => r.isMe);
  const myRank = myRow ? myRow.rank : null;
  const isWin = myRank === 1 && snapshot.winnerPlayerId === myId;

  let title = 'MAÇ BİTTİ';
  let subtitle = 'Bu turu izledin.';
  if (myRank !== null) {
    if (isWin) {
      title = 'ZAFER!';
      subtitle = 'Son ayakta kalan sendin.';
    } else {
      title = myRank + '. SIRA';
      subtitle = myRank <= Math.ceil(rows.length / 2) ? 'İyi mücadele.' : 'Bir dahaki sefere.';
    }
  }

  return { mode: 'showdown', isWin, myRank, total: rows.length, title, subtitle, rows };
}

function teamResult(
  snapshot: BrawlSnapshot,
  players: BrawlerEntity[],
  me: BrawlerEntity | undefined,
  myId: string
): MatchResult {
  const winning = snapshot.winnerTeam;

  // The winners first, then the rest; inside each side, whoever did the most.
  const ordered = players.slice().sort((a, b) => {
    const aWon = a.team === winning ? 1 : 0;
    const bWon = b.team === winning ? 1 : 0;
    return bWon - aWon || contribution(b) - contribution(a);
  });

  const rows = ordered.map((b, i) =>
    toRow(b, i + 1, myId, snapshot.starPlayerId, winning !== null && b.team === winning)
  );

  const myRow = rows.find(r => r.isMe);
  const isWin = winning !== null && me !== undefined && me.team === winning;

  let title = 'MAÇ BİTTİ';
  let subtitle = 'Bu turu izledin.';
  if (me) {
    if (winning === null) {
      title = 'BERABERE';
      subtitle = 'Kimse kazanamadı.';
    } else if (isWin) {
      title = 'ZAFER!';
      subtitle = 'Takımın kazandı.';
    } else {
      title = 'YENİLGİ';
      subtitle = 'Rakip takım kazandı.';
    }
  }

  return {
    mode: snapshot.mode,
    isWin,
    myRank: myRow ? myRow.rank : null,
    total: rows.length,
    title,
    subtitle,
    rows,
  };
}
