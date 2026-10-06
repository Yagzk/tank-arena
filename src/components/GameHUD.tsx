import React from 'react';
import { GameStateSnapshot, TANK_COLORS, TankColor } from '../types/game';
import { Volume2, VolumeX, HelpCircle, Shield, Zap, Bomb, RotateCcw } from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface GameHUDProps {
  snapshot: GameStateSnapshot | null;
  myPlayerId: string;
  isHost: boolean;
  onOpenHelp: () => void;
  onLeaveGame: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  snapshot,
  myPlayerId,
  isHost,
  onOpenHelp,
  onLeaveGame,
  isMuted,
  onToggleMute,
}) => {
  if (!snapshot) return null;

  const myTank = snapshot.tanks.find(t => t.id === myPlayerId);

  return (
    <div className="absolute top-0 left-0 right-0 p-4 pointer-events-none flex flex-col justify-between h-full">
      {/* Top Bar: Players & Scores & Actions */}
      <div className="flex items-center justify-between gap-4 w-full max-w-6xl mx-auto">
        {/* Left: Round Info & Action Controls */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 px-4 py-2 rounded-xl shadow-lg flex items-center gap-3">
            <span className="text-xs uppercase tracking-wider font-bold text-slate-400">Round</span>
            <span className="text-xl font-bold font-arcade text-sky-400">
              {snapshot.round} <span className="text-slate-500 text-sm">/ {snapshot.maxRounds}</span>
            </span>
          </div>

          <button
            onClick={onToggleMute}
            className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition shadow-lg"
            title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          <button
            onClick={onOpenHelp}
            className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition shadow-lg"
            title="Nasıl Oynanır?"
          >
            <HelpCircle size={18} />
          </button>
        </div>

        {/* Center: Player Score Badges */}
        <div className="flex items-center gap-2 pointer-events-auto overflow-x-auto py-1">
          {snapshot.tanks.map(tank => {
            const colorCfg = TANK_COLORS[tank.color as TankColor] || TANK_COLORS.cyan;
            const isMe = tank.id === myPlayerId;

            return (
              <div
                key={tank.id}
                style={{
                  borderColor: tank.isAlive ? colorCfg.primary : '#334155',
                }}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border bg-slate-900/85 backdrop-blur transition-all duration-200 ${
                  tank.isAlive ? 'opacity-100 shadow-md' : 'opacity-40 grayscale'
                } ${isMe ? 'ring-2 ring-sky-400/50' : ''}`}
              >
                {/* Status Dot */}
                <span
                  style={{ backgroundColor: colorCfg.primary }}
                  className="w-3 h-3 rounded-full flex-shrink-0"
                />

                <div className="flex flex-col">
                  <span className="text-xs font-bold leading-none text-slate-200 truncate max-w-[90px]">
                    {tank.name} {isMe && '(Sen)'}
                  </span>
                  <div className="flex items-center gap-1 mt-1">
                    {tank.shield && <Shield size={11} className="text-sky-400" />}
                    {tank.speedBoostTimer > 0 && <Zap size={11} className="text-amber-400" />}
                    {tank.tripleShotTimer > 0 && <span className="text-[10px] text-orange-400 font-bold">3X</span>}
                    {tank.laserShotTimer > 0 && <span className="text-[10px] text-rose-400 font-bold">LASER</span>}
                  </div>
                </div>

                {/* Score */}
                <div
                  style={{ backgroundColor: colorCfg.primary + '25', color: colorCfg.primary }}
                  className="font-arcade text-sm font-black px-2 py-0.5 rounded-lg ml-1"
                >
                  {snapshot.scores ? (snapshot.scores[tank.id] || 0) : 0}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Exit / Leave Button */}
        <div className="pointer-events-auto">
          <button
            onClick={onLeaveGame}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-200 text-xs font-bold transition shadow-lg"
          >
            <RotateCcw size={14} />
            <span>Ayrıl</span>
          </button>
        </div>
      </div>

      {/* Middle/Bottom Events Feed */}
      <div className="flex justify-between items-end w-full max-w-6xl mx-auto mb-2">
        {/* Kill & Event Feed */}
        <div className="flex flex-col gap-1.5 max-w-sm pointer-events-none">
          {snapshot.events.slice(0, 4).map(ev => (
            <div
              key={ev.id}
              style={{ borderLeftColor: ev.color }}
              className="px-3 py-1 rounded-r-lg bg-slate-900/90 backdrop-blur border-l-4 text-xs font-semibold text-slate-200 shadow-md animate-fade-in"
            >
              {ev.text}
            </div>
          ))}
        </div>

        {/* Active Weapon & Ammo HUD for Local Player */}
        {myTank && (
          <div className="pointer-events-auto bg-slate-900/90 backdrop-blur border border-slate-700/80 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cephane</span>
              <div className="flex items-center gap-1.5 mt-1">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-6 rounded-sm transition-all duration-150 ${
                      i < Math.floor(myTank.ammo)
                        ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]'
                        : 'bg-slate-700/50'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-700" />

            {/* Mine indicator */}
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-rose-400">
                <Bomb size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase">Mayın [E / Sağ Tık]</span>
                <span className="text-emerald-400">Hazır</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
