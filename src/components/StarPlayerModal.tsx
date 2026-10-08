import React, { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { BrawlSnapshot, BRAWLERS } from '../types/brawl';
import { RotateCcw, Home, Star } from 'lucide-react';
import { computeResults } from '../game/results';
import { CharacterPortrait } from './CharacterPortrait';
import { brawlAudio } from '../audio/brawlAudio';

interface StarPlayerModalProps {
  snapshot: BrawlSnapshot;
  myPlayerId: string;
  isHost: boolean;
  onRestartMatch: () => void;
  onReturnToLobby: () => void;
}

/** How long the headline stands alone before the scoreboard comes in. */
const HEADLINE_MS = 1700;

/**
 * The end of a round.
 *
 * Two beats rather than one. The headline comes first and alone, over a game
 * that is still running underneath, so the last second of the fight is not
 * hidden behind a table the instant it happens; then the scoreboard arrives.
 */
export const StarPlayerModal: React.FC<StarPlayerModalProps> = ({
  snapshot,
  myPlayerId,
  isHost,
  onRestartMatch,
  onReturnToLobby,
}) => {
  const result = useMemo(() => computeResults(snapshot, myPlayerId), [snapshot, myPlayerId]);
  const [showBoard, setShowBoard] = useState(false);

  const star = result.rows.find(r => r.isStar);
  const starCfg = star ? BRAWLERS[star.brawlerId] : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setShowBoard(true), HEADLINE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Fireworks are for winning. They used to go off for everybody, including
  // whoever had just been eliminated.
  useEffect(() => {
    if (!result.isWin) return;
    const end = Date.now() + 2800;
    let raf = 0;
    const frame = () => {
      const colors = ['#eab308', '#8b5cf6', '#ef4444', '#10b981'];
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors });
      if (Date.now() < end) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [result.isWin]);

  // Said once, as the headline appears.
  useEffect(() => {
    brawlAudio.speak(result.isWin ? 'Zafer!' : result.title === 'BERABERE' ? 'Berabere' : 'Maç bitti');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headline = result.isWin ? '#facc15' : result.title === 'BERABERE' ? '#94a3b8' : '#f87171';

  if (!showBoard) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center pointer-events-none select-none animate-fade-in">
        <div className="absolute inset-0 bg-slate-950/45" />
        <h1
          style={{
            color: headline,
            textShadow: '0 4px 0 #0f172a, 0 0 40px ' + headline + '88',
          }}
          className="relative font-arcade font-black text-5xl sm:text-7xl tracking-widest text-center px-4"
        >
          {result.title}
        </h1>
        <p className="relative mt-3 font-arcade text-sm sm:text-base text-slate-200 tracking-wide">
          {result.subtitle}
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-lg max-h-full bg-slate-900 border-2 border-slate-700/80 rounded-3xl p-5 shadow-2xl overflow-hidden flex flex-col items-center text-center">
        <div
          style={{ backgroundColor: result.isWin ? '#eab308' : starCfg?.color || '#64748b' }}
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl opacity-25 pointer-events-none"
        />

        {/* Result */}
        <div className="relative flex items-baseline justify-center gap-3 mb-1">
          <h2
            style={{ color: headline }}
            className="font-arcade font-black text-3xl tracking-widest"
          >
            {result.title}
          </h2>
          <span className="text-[11px] px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-arcade font-bold">
            {result.mode === 'showdown' ? 'HESAPLAŞMA' : 'ELMAS KAPMACA'}
          </span>
        </div>
        <p className="relative text-xs text-slate-400 mb-3">
          {result.subtitle}
          {snapshot.mapName ? ' · ' + snapshot.mapName : ''}
        </p>

        {/* Star player: drawn with the character's own art, not a letter box */}
        {star && starCfg && (
          <div className="relative w-full flex items-center gap-3 p-2.5 mb-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/40">
            <CharacterPortrait brawlerId={star.brawlerId} size={56} animated />
            <div className="flex flex-col items-start min-w-0">
              <span className="inline-flex items-center gap-1 font-arcade text-[10px] font-bold text-yellow-300">
                <Star size={12} className="fill-yellow-400" />
                MAÇIN YILDIZI
              </span>
              <span className="font-arcade text-base font-black text-slate-100 truncate max-w-full">
                {star.name}
              </span>
              <span className="text-[11px] text-yellow-400/90 font-bold">
                {starCfg.name} · {star.kills} leş
              </span>
            </div>
          </div>
        )}

        {/* Scoreboard, in finishing order */}
        <div className="relative w-full flex flex-col gap-1.5 overflow-y-auto mb-4 pr-1 min-h-0">
          {result.rows.map(r => {
            const bCfg = BRAWLERS[r.brawlerId];
            return (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-2 p-2 rounded-xl border text-xs ${
                  r.isMe
                    ? 'border-sky-400/70 bg-sky-500/10'
                    : r.isWinner
                      ? 'border-yellow-500/50 bg-yellow-500/5'
                      : 'border-slate-800 bg-slate-950/50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 shrink-0 font-arcade font-black text-slate-400 text-[11px]">
                    {r.rank}
                  </span>
                  <span
                    style={{ backgroundColor: bCfg.color }}
                    className="w-5 h-5 shrink-0 rounded-md flex items-center justify-center font-arcade font-bold text-white text-[10px]"
                  >
                    {bCfg.name[0]}
                  </span>
                  <span className="font-bold text-slate-200 truncate">
                    {r.name}
                    {r.isMe && ' (Sen)'}
                  </span>
                  {r.isStar && <Star size={11} className="shrink-0 fill-yellow-400 text-yellow-400" />}
                </div>

                <div className="flex items-center gap-3 font-arcade shrink-0">
                  {result.mode === 'gem_grab' ? (
                    <span className="text-purple-400 font-bold">💎 {r.gems}</span>
                  ) : (
                    <span className="text-emerald-400 font-bold">🟩 {r.powerCubes}</span>
                  )}
                  <span className="text-slate-300">⚔ {r.kills}</span>
                  <span className="text-slate-500">💀 {r.deaths}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative flex items-center gap-3 w-full">
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
