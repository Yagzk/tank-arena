import React from 'react';
import { Radio } from 'lucide-react';
import type { BrawlSnapshot } from '../types/brawl';
import { MODES } from '../game/modes';

interface ModeStatusProps {
  snapshot: BrawlSnapshot;
  myPlayerId: string;
}

function clock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/** One side's score, in the colour that side wears everywhere else. */
const SideBox: React.FC<{
  side: 0 | 1;
  icon: string;
  value: React.ReactNode;
  mine: boolean;
  glow?: boolean;
}> = ({ side, icon, value, mine, glow }) => (
  <div
    className={`px-4 py-2 rounded-2xl shadow-lg flex items-center gap-2 border transition ${
      side === 0
        ? 'bg-blue-950/90 border-blue-500/80 text-blue-300'
        : 'bg-rose-950/90 border-rose-500/80 text-rose-300'
    } ${mine ? 'ring-2 ring-white/70' : ''} ${glow ? 'shadow-[0_0_22px_rgba(250,204,21,0.55)] scale-105' : ''}`}
  >
    <span className="text-sm">{icon}</span>
    <span className="font-arcade text-lg font-bold tabular-nums">{value}</span>
  </div>
);

/** Round markers for Knockout: filled for a round won. */
const Pips: React.FC<{ won: number; needed: number; side: 0 | 1 }> = ({ won, needed, side }) => (
  <div className="flex gap-1.5">
    {Array.from({ length: needed }, (_, i) => (
      <span
        key={i}
        className={`w-3 h-3 rounded-full border ${
          i < won
            ? side === 0
              ? 'bg-blue-400 border-blue-200'
              : 'bg-rose-400 border-rose-200'
            : 'bg-slate-800 border-slate-600'
        }`}
      />
    ))}
  </div>
);

/**
 * The strip at the top of the screen that says how the match is going.
 *
 * Each mode is decided differently — last one standing, a count of kills, who
 * holds a place, who wins rounds — so each reports a different number. This used
 * to be two hard-coded layouts, and every new mode meant editing the HUD.
 */
export const ModeStatus: React.FC<ModeStatusProps> = ({ snapshot, myPlayerId }) => {
  const def = MODES[snapshot.mode];
  const me = snapshot.brawlers.find(b => b.id === myPlayerId);
  const myTeam = me ? me.team : -1;
  const players = snapshot.brawlers.filter(b => !b.isClone);

  const scores = snapshot.teamScores;
  const timer = snapshot.timeLeft !== null && (
    <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 font-arcade text-sm font-bold text-slate-200 tabular-nums">
      {clock(snapshot.timeLeft)}
    </div>
  );

  switch (snapshot.mode) {
    case 'showdown': {
      const alive = players.filter(b => b.isAlive).length;
      return (
        <div className="px-5 py-2 rounded-2xl bg-slate-900/90 border border-amber-500/50 backdrop-blur shadow-2xl flex items-center gap-2.5">
          <span className="text-xl">{def.icon}</span>
          <span className="font-arcade text-base font-black text-amber-400 tracking-wider">
            {alive} / {players.length} KALDI
          </span>
        </div>
      );
    }

    case 'duo_showdown': {
      const aliveTeams = new Set(players.filter(b => b.isAlive).map(b => b.team)).size;
      const allTeams = new Set(players.map(b => b.team)).size;
      return (
        <div className="px-5 py-2 rounded-2xl bg-slate-900/90 border border-amber-500/50 backdrop-blur shadow-2xl flex items-center gap-2.5">
          <span className="text-xl">{def.icon}</span>
          <span className="font-arcade text-base font-black text-amber-400 tracking-wider">
            {aliveTeams} / {allTeams} TAKIM KALDI
          </span>
        </div>
      );
    }

    case 'gem_grab': {
      const blue = players.filter(b => b.team === 0).reduce((n, b) => n + b.gemsCarried, 0);
      const red = players.filter(b => b.team === 1).reduce((n, b) => n + b.gemsCarried, 0);
      return (
        <div className="flex items-center gap-3">
          <SideBox side={0} icon="💎" value={blue} mine={myTeam === 0} />
          {snapshot.countdownTeam !== null && (
            <div className="px-5 py-2 rounded-2xl bg-rose-950 border-2 border-rose-500 shadow-2xl flex items-center gap-2 animate-bounce">
              <Radio size={16} className="text-rose-400 animate-spin" />
              <span className="font-arcade text-sm font-black text-rose-200">
                GERİ SAYIM: {Math.ceil(snapshot.countdownTimer)}s
              </span>
            </div>
          )}
          <SideBox side={1} icon="💎" value={red} mine={myTeam === 1} />
        </div>
      );
    }

    case 'brawl_ball': {
      const carrier = snapshot.ball?.carrier
        ? players.find(b => b.id === snapshot.ball?.carrier)
        : undefined;
      return (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <SideBox side={0} icon={def.icon} value={scores[0] ?? 0} mine={myTeam === 0} glow={snapshot.goalTeam === 0} />
            {snapshot.timeLeft !== null && snapshot.timeLeft <= 0 ? (
              <div className="px-3 py-1.5 rounded-xl bg-amber-950/90 border border-amber-500 font-arcade text-sm font-black text-amber-300 animate-pulse">
                UZATMA
              </div>
            ) : (
              timer
            )}
            <SideBox side={1} icon={def.icon} value={scores[1] ?? 0} mine={myTeam === 1} glow={snapshot.goalTeam === 1} />
          </div>
          <span className="font-arcade text-[10px] font-bold text-slate-400">
            {carrier ? carrier.name + ' TOPU TAŞIYOR' : 'İLK ' + (snapshot.scoreLimit ?? 2) + ' GOL KAZANIR'}
          </span>
        </div>
      );
    }

    case 'heist': {
      const bar = (team: number) => {
        const safe = snapshot.safes.find(s => s.team === team);
        const frac = safe ? Math.max(0, safe.hp) / safe.maxHp : 0;
        return (
          <div
            className={`w-32 sm:w-44 h-5 rounded-lg bg-slate-900/90 border overflow-hidden relative ${
              myTeam === team ? 'border-white/70' : 'border-slate-700'
            }`}
          >
            <div
              style={{ width: frac * 100 + '%' }}
              className={`h-full transition-all duration-200 ${team === 0 ? 'bg-blue-500' : 'bg-rose-500'}`}
            />
            <span className="absolute inset-0 flex items-center justify-center font-arcade text-[10px] font-black text-white">
              🔐 {Math.round(frac * 100)}%
            </span>
          </div>
        );
      };
      return (
        <div className="flex items-center gap-3">
          {bar(0)}
          {timer}
          {bar(1)}
        </div>
      );
    }

    case 'wipeout':
    case 'bounty':
    case 'hot_zone': {
      const holder = snapshot.zone ? snapshot.zone.controller : null;
      return (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <SideBox side={0} icon={def.icon} value={scores[0] ?? 0} mine={myTeam === 0} glow={holder === 0} />
            {timer}
            <SideBox side={1} icon={def.icon} value={scores[1] ?? 0} mine={myTeam === 1} glow={holder === 1} />
          </div>
          {snapshot.mode === 'bounty' && (() => {
            const richest = players.filter(b => b.isAlive).sort((x, y) => y.bounty - x.bounty)[0];
            return richest && richest.bounty > 1 ? (
              <span className="font-arcade text-[10px] font-bold text-amber-300">
                EN DEĞERLİ: {richest.name} ★{richest.bounty}
              </span>
            ) : null;
          })()}
          {snapshot.scoreLimit !== null && (
            <span className="font-arcade text-[10px] font-bold text-slate-400">
              İLK {snapshot.scoreLimit} PUAN KAZANIR
            </span>
          )}
        </div>
      );
    }

    case 'knockout': {
      const needed = snapshot.roundsToWin ?? 2;
      const blueAlive = players.filter(b => b.team === 0 && b.isAlive).length;
      const redAlive = players.filter(b => b.team === 1 && b.isAlive).length;
      return (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <SideBox side={0} icon="🧍" value={blueAlive} mine={myTeam === 0} />
            <div className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700">
              <span className="font-arcade text-[10px] font-bold text-slate-300">TUR {snapshot.round}</span>
              <div className="flex items-center gap-3">
                <Pips won={snapshot.roundWins[0] ?? 0} needed={needed} side={0} />
                {timer}
                <Pips won={snapshot.roundWins[1] ?? 0} needed={needed} side={1} />
              </div>
            </div>
            <SideBox side={1} icon="🧍" value={redAlive} mine={myTeam === 1} />
          </div>
        </div>
      );
    }
  }
};
