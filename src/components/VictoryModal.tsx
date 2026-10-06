import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { GameStateSnapshot, TANK_COLORS, TankColor } from '../types/game';
import { Trophy, RotateCcw, Home } from 'lucide-react';

interface VictoryModalProps {
  snapshot: GameStateSnapshot;
  myPlayerId: string;
  isHost: boolean;
  onRestartMatch: () => void;
  onReturnToLobby: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  snapshot,
  myPlayerId,
  isHost,
  onRestartMatch,
  onReturnToLobby,
}) => {
  const winner = snapshot.tanks.find(t => t.id === snapshot.matchWinnerId);
  const colorCfg = winner ? TANK_COLORS[winner.color as TankColor] || TANK_COLORS.cyan : TANK_COLORS.cyan;
  const isMeWinner = winner?.id === myPlayerId;

  useEffect(() => {
    // Launch celebratory fireworks
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#06b6d4', '#ef4444', '#eab308', '#22c55e'],
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#06b6d4', '#ef4444', '#eab308', '#22c55e'],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }, []);

  // Sort players by score
  const sortedTanks = [...snapshot.tanks].sort((a, b) => {
    const sA = snapshot.scores[a.id] || 0;
    const sB = snapshot.scores[b.id] || 0;
    return sB - sA;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border-2 border-slate-700/80 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col items-center text-center">
        {/* Glow backdrop */}
        <div
          style={{ backgroundColor: colorCfg.primary }}
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl opacity-25 pointer-events-none"
        />

        {/* Trophy Icon */}
        <div
          style={{ borderColor: colorCfg.primary, color: colorCfg.primary }}
          className="w-20 h-20 rounded-2xl border-2 bg-slate-800/80 flex items-center justify-center shadow-lg mb-4"
        >
          <Trophy size={42} />
        </div>

        <h2 className="text-3xl font-black font-arcade tracking-wider text-slate-100">
          {isMeWinner ? 'ZAFER SENİN!' : 'MAÇ BİTTİ!'}
        </h2>
        <p className="text-slate-400 text-sm mt-1 mb-6">
          <span style={{ color: colorCfg.primary }} className="font-bold text-base">
            {winner?.name || 'Bilinmeyen Asker'}
          </span>{' '}
          arenanın tartışmasız şampiyonu oldu!
        </p>

        {/* Leaderboard Table */}
        <div className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl p-3 mb-6 flex flex-col gap-2">
          {sortedTanks.map((tank, idx) => {
            const pColor = TANK_COLORS[tank.color as TankColor] || TANK_COLORS.cyan;
            const score = snapshot.scores[tank.id] || 0;

            return (
              <div
                key={tank.id}
                className={`flex items-center justify-between px-3 py-2 rounded-xl border ${
                  idx === 0
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-slate-800 bg-slate-900/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-arcade text-xs font-bold w-5 text-slate-500">
                    #{idx + 1}
                  </span>
                  <span
                    style={{ backgroundColor: pColor.primary }}
                    className="w-3 h-3 rounded-full"
                  />
                  <span className="text-sm font-semibold text-slate-200">
                    {tank.name} {tank.id === myPlayerId && '(Sen)'}
                  </span>
                </div>

                <div className="font-arcade text-sm font-bold text-sky-400">
                  {score} <span className="text-xs text-slate-500">Puan</span>
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
              className="flex-1 py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-arcade font-bold text-sm transition shadow-lg flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              <span>YENİ MAÇ</span>
            </button>
          ) : (
            <div className="flex-1 text-xs text-slate-400 py-2">
              Oda sahibinin yeni maç başlatması bekleniyor...
            </div>
          )}

          <button
            onClick={onReturnToLobby}
            className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-sm transition flex items-center justify-center gap-2"
          >
            <Home size={16} />
            <span>Lobi</span>
          </button>
        </div>
      </div>
    </div>
  );
};
