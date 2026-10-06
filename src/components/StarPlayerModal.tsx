import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { BrawlSnapshot, BRAWLERS } from '../types/brawl';
import { Trophy, RotateCcw, Home, Star } from 'lucide-react';

interface StarPlayerModalProps {
  snapshot: BrawlSnapshot;
  myPlayerId: string;
  isHost: boolean;
  onRestartMatch: () => void;
  onReturnToLobby: () => void;
}

export const StarPlayerModal: React.FC<StarPlayerModalProps> = ({
  snapshot,
  myPlayerId,
  isHost,
  onRestartMatch,
  onReturnToLobby,
}) => {
  const starPlayer = snapshot.brawlers.find(b => b.id === snapshot.starPlayerId);
  const starCfg = starPlayer ? BRAWLERS[starPlayer.brawlerId] : null;

  const myBrawler = snapshot.brawlers.find(b => b.id === myPlayerId);
  const isMeStar = starPlayer?.id === myPlayerId;

  // Did local player win?
  let isWin = false;
  if (snapshot.mode === 'showdown') {
    isWin = snapshot.winnerPlayerId === myPlayerId;
  } else {
    isWin = snapshot.winnerTeam !== null && myBrawler?.team === snapshot.winnerTeam;
  }

  useEffect(() => {
    // Launch celebratory fireworks
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#eab308', '#8b5cf6', '#ef4444', '#10b981'],
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#eab308', '#8b5cf6', '#ef4444', '#10b981'],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-slate-700/80 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col items-center text-center">
        {/* Glow backdrop */}
        <div
          style={{ backgroundColor: starCfg?.color || '#eab308' }}
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl opacity-25 pointer-events-none"
        />

        {/* Star Player Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-arcade text-xs font-bold mb-3 shadow">
          <Star size={14} className="fill-yellow-400" />
          <span>MAÇIN YILDIZI (STAR PLAYER)</span>
        </div>

        {/* Star Player Portrait */}
        <div
          style={{ backgroundColor: starCfg?.color || '#eab308' }}
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-arcade font-black text-white shadow-2xl border-4 border-white mb-2"
        >
          {starCfg?.name[0] || '★'}
        </div>

        <h2 className="text-2xl font-black font-arcade tracking-wide text-slate-100">
          {starPlayer?.name || 'Bilinmeyen Brawler'}
        </h2>
        <span className="text-xs text-yellow-400 font-bold mb-4">
          {starCfg?.name} • {starPlayer?.kills || 0} LEŞ
        </span>

        {/* Victory / Defeat Header */}
        <div className="w-full p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between mb-4">
          <span className="font-arcade text-sm font-bold text-slate-300">
            {isWin ? '🏆 ZAFER! (+10 KUPA)' : '⚔️ MAÇ TAMAMLANDI (+4 KUPA)'}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-arcade font-bold">
            {snapshot.mode === 'showdown' ? 'HESAPLAŞMA' : 'ELMAS KAPMACA'}
          </span>
        </div>

        {/* Players Scoreboard */}
        <div className="w-full flex flex-col gap-1.5 max-h-48 overflow-y-auto mb-5 pr-1">
          {snapshot.brawlers.map((b, idx) => {
            const bCfg = BRAWLERS[b.brawlerId];
            const isMe = b.id === myPlayerId;

            return (
              <div
                key={b.id}
                className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                  b.id === snapshot.starPlayerId
                    ? 'border-yellow-500/60 bg-yellow-500/10'
                    : 'border-slate-800 bg-slate-950/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    style={{ backgroundColor: bCfg.color }}
                    className="w-5 h-5 rounded-md flex items-center justify-center font-arcade font-bold text-white text-[10px]"
                  >
                    {bCfg.name[0]}
                  </span>
                  <span className="font-bold text-slate-200">
                    {b.name} {isMe && '(Sen)'}
                  </span>
                </div>

                <div className="flex items-center gap-3 font-arcade">
                  {snapshot.mode === 'gem_grab' ? (
                    <span className="text-purple-400 font-bold">💎 {b.gemsCarried}</span>
                  ) : (
                    <span className="text-emerald-400 font-bold">🟩 {b.powerCubes}</span>
                  )}
                  <span className="text-slate-400">💀 {b.kills}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 w-full">
          {isHost ? (
            <button
              onClick={onRestartMatch}
              className="flex-1 py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-arcade font-bold text-xs transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw size={16} />
              <span>YENİDEN OYNA</span>
            </button>
          ) : (
            <div className="flex-1 text-xs text-slate-400 py-2">
              Oda sahibinin yeni maç başlatması bekleniyor...
            </div>
          )}

          <button
            onClick={onReturnToLobby}
            className="py-3.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home size={16} />
            <span>Lobi</span>
          </button>
        </div>
      </div>
    </div>
  );
};
