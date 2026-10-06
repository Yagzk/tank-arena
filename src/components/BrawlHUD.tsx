import React from 'react';
import { BrawlSnapshot, BRAWLERS, BrawlerEntity } from '../types/brawl';
import { MAP_WIDTH, MAP_HEIGHT } from '../game/brawlMaps';
import { Volume2, VolumeX, RotateCcw, Radio } from 'lucide-react';

interface BrawlHUDProps {
  snapshot: BrawlSnapshot | null;
  myPlayerId: string;
  isMuted: boolean;
  onToggleMute: () => void;
  onLeaveGame: () => void;
  onSendEmote: (emote: string) => void;
}

export const BrawlHUD: React.FC<BrawlHUDProps> = ({
  snapshot,
  myPlayerId,
  isMuted,
  onToggleMute,
  onLeaveGame,
  onSendEmote,
}) => {
  if (!snapshot) return null;

  const myBrawler = snapshot.brawlers.find(b => b.id === myPlayerId);
  const cfg = myBrawler ? BRAWLERS[myBrawler.brawlerId] : null;

  // Showdown alive count
  const aliveCount = snapshot.brawlers.filter(b => b.isAlive).length;

  // Gem Grab Team Counts
  const blueGems = snapshot.brawlers.filter(b => b.team === 0).reduce((acc, b) => acc + b.gemsCarried, 0);
  const redGems = snapshot.brawlers.filter(b => b.team === 1).reduce((acc, b) => acc + b.gemsCarried, 0);

  const isSuperReady = (myBrawler?.superCharge || 0) >= 100;

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between select-none">
      {/* ================= TOP BAR ================= */}
      <div className="flex items-start justify-between w-full max-w-7xl mx-auto">
        {/* Left: Exit & Sound Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={onLeaveGame}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-rose-300 font-bold text-xs shadow-lg transition"
          >
            <RotateCcw size={14} />
            <span>Ayrıl</span>
          </button>

          <button
            onClick={onToggleMute}
            className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 shadow-lg transition"
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>

        {/* Center: Match Mode Status */}
        <div className="flex flex-col items-center">
          {snapshot.mode === 'showdown' ? (
            <div className="px-5 py-2 rounded-2xl bg-slate-900/90 border border-amber-500/50 backdrop-blur shadow-2xl flex items-center gap-2.5">
              <span className="text-xl">💀</span>
              <span className="font-arcade text-base font-black text-amber-400 tracking-wider">
                {aliveCount} / {snapshot.brawlers.length} KALDI
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {/* Blue Team Gems */}
              <div className="px-4 py-2 rounded-2xl bg-blue-950/90 border border-blue-500/80 shadow-lg flex items-center gap-2">
                <span className="text-sm">💎</span>
                <span className="font-arcade text-lg font-bold text-blue-300">{blueGems}</span>
              </div>

              {/* Countdown Banner if active */}
              {snapshot.countdownTeam !== null && (
                <div className="px-5 py-2 rounded-2xl bg-rose-950 border-2 border-rose-500 shadow-2xl flex items-center gap-2 animate-bounce">
                  <Radio size={16} className="text-rose-400 animate-spin" />
                  <span className="font-arcade text-sm font-black text-rose-200">
                    GERİ SAYIM: {Math.ceil(snapshot.countdownTimer)}s
                  </span>
                </div>
              )}

              {/* Red Team Gems */}
              <div className="px-4 py-2 rounded-2xl bg-rose-950/90 border border-rose-500/80 shadow-lg flex items-center gap-2">
                <span className="text-sm">💎</span>
                <span className="font-arcade text-lg font-bold text-rose-300">{redGems}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Holographic Minimap Radar */}
        <div className="w-32 h-24 rounded-2xl border-2 border-slate-700 bg-slate-950/80 backdrop-blur relative overflow-hidden shadow-2xl hidden md:block">
          {/* Poison gas border indicator */}
          {snapshot.poisonGas?.isActive && (
            <div
              style={{
                top: `${(snapshot.poisonGas.inset / MAP_HEIGHT) * 100}%`,
                left: `${(snapshot.poisonGas.inset / MAP_WIDTH) * 100}%`,
                right: `${(snapshot.poisonGas.inset / MAP_WIDTH) * 100}%`,
                bottom: `${(snapshot.poisonGas.inset / MAP_HEIGHT) * 100}%`,
              }}
              className="absolute border border-emerald-500/80 bg-emerald-500/10 pointer-events-none transition-all duration-300"
            />
          )}

          {/* Brawler blips */}
          {snapshot.brawlers.map(b => {
            if (!b.isAlive) return null;
            const bx = (b.x / MAP_WIDTH) * 100;
            const by = (b.y / MAP_HEIGHT) * 100;
            const isMe = b.id === myPlayerId;

            return (
              <span
                key={b.id}
                style={{ top: `${by}%`, left: `${bx}%` }}
                className={`absolute w-2 h-2 rounded-full -translate-x-1 -translate-y-1 ${
                  isMe
                    ? 'bg-sky-400 ring-2 ring-white z-10'
                    : b.team === 0
                    ? 'bg-blue-400'
                    : 'bg-rose-400'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* ================= BOTTOM BAR ================= */}
      <div className="flex items-end justify-between w-full max-w-5xl mx-auto">
        {/* Left: Emote Wheel / Pins */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-slate-900/85 backdrop-blur border border-slate-700/80 p-1.5 rounded-2xl shadow-xl">
          {['👑', '😂', '💀', '🔥', '🎯'].map(emo => (
            <button
              key={emo}
              onClick={() => onSendEmote(emo)}
              className="w-10 h-10 rounded-xl hover:bg-slate-800 flex items-center justify-center text-xl transition active:scale-90 cursor-pointer"
            >
              {emo}
            </button>
          ))}
        </div>

        {/* Center: Health, Ammo & Super Controls */}
        {myBrawler && cfg && (
          <div className="flex flex-col items-center gap-2 pointer-events-auto">
            {/* Health Bar */}
            <div className="w-64 bg-slate-950/90 border-2 border-slate-700 rounded-2xl p-1 shadow-2xl relative">
              <div
                style={{ width: `${Math.max(0, (myBrawler.hp / myBrawler.maxHp) * 100)}%` }}
                className="h-6 rounded-xl bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-150 flex items-center justify-center shadow-[0_0_12px_rgba(34,197,94,0.6)]"
              />
              <span className="absolute inset-0 flex items-center justify-center font-arcade text-xs font-black text-slate-100 drop-shadow">
                {Math.round(myBrawler.hp)} / {myBrawler.maxHp}
              </span>
            </div>

            {/* 3 Ammo Bars */}
            <div className="flex items-center gap-1.5 w-64">
              {[0, 1, 2].map(slot => {
                const segPct = Math.max(0, Math.min(1, myBrawler.ammo - slot));
                return (
                  <div
                    key={slot}
                    className="flex-1 h-3 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden p-0.5"
                  >
                    <div
                      style={{ width: `${segPct * 100}%` }}
                      className="h-full rounded-md bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)] transition-all duration-75"
                    />
                  </div>
                );
              })}
            </div>

            {/* Star Power & Passive Trait Badges */}
            <div className="flex items-center gap-2 mt-0.5">
              {myBrawler.brawlerId === 'shelly' && (
                <div
                  className={`px-3 py-1 rounded-xl text-[10px] font-arcade font-bold tracking-wide border transition flex items-center gap-1.5 shadow ${
                    (myBrawler.bandAidCooldown || 0) <= 0
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.4)]'
                      : 'bg-slate-900/80 border-slate-700 text-slate-400'
                  }`}
                >
                  <span>🩹</span>
                  <span>
                    {(myBrawler.bandAidCooldown || 0) <= 0
                      ? 'YARA BANDI: HAZIR'
                      : `YARA BANDI: ${Math.ceil(myBrawler.bandAidCooldown || 0)}s`}
                  </span>
                </div>
              )}

              {myBrawler.brawlerId === 'colt' && (
                <div className="px-3 py-1 rounded-xl text-[10px] font-arcade font-bold tracking-wide border bg-amber-500/20 border-amber-400/80 text-amber-300 shadow flex items-center gap-1.5">
                  <span>👟</span>
                  <span>KAYAN ÇİZMELER: +%12 HIZ</span>
                </div>
              )}

              {myBrawler.brawlerId === 'el_primo' && (
                <div className="flex items-center gap-1.5">
                  <div className="px-3 py-1 rounded-xl text-[10px] font-arcade font-bold tracking-wide border bg-emerald-500/20 border-emerald-400/80 text-emerald-300 shadow flex items-center gap-1.5">
                    <span>🛡️</span>
                    <span>TANK ÖZELLİĞİ: HASARLA ULTİ DOLAR</span>
                  </div>
                  {(myBrawler.meteorRushTimer || 0) > 0 && (
                    <div className="px-2.5 py-1 rounded-xl text-[10px] font-arcade font-bold tracking-wide border bg-amber-500/30 border-amber-400 text-amber-200 animate-pulse flex items-center gap-1">
                      <span>☄️</span>
                      <span>METEOR HIZI!</span>
                    </div>
                  )}
                </div>
              )}

              {myBrawler.brawlerId === 'brock' && (
                <div className="px-3 py-1 rounded-xl text-[10px] font-arcade font-bold tracking-wide border bg-orange-500/20 border-orange-400/80 text-orange-300 shadow flex items-center gap-1.5">
                  <span>🔥</span>
                  <span>ALEV İZLERİ: PATLAMA YAKAR</span>
                </div>
              )}

              {myBrawler.brawlerId === 'spike' && (
                <div className="px-3 py-1 rounded-xl text-[10px] font-arcade font-bold tracking-wide border bg-lime-500/20 border-lime-400/80 text-lime-300 shadow flex items-center gap-1.5">
                  <span>🌵</span>
                  <span>FİDANLIK & KAVİSLİ İĞNELER</span>
                </div>
              )}

              {myBrawler.brawlerId === 'leon' && (
                <div className="px-3 py-1 rounded-xl text-[10px] font-arcade font-bold tracking-wide border bg-indigo-500/20 border-indigo-400/80 text-indigo-300 shadow flex items-center gap-1.5">
                  <span>💨</span>
                  <span>GİZLİ İYİLEŞME & SİS İZLERİ</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right: Gadget & Super Buttons */}
        {myBrawler && (
          <div className="flex items-end gap-3 pointer-events-auto">
            {/* Gadget Button (Green) */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => {
                  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE' }));
                  setTimeout(() => {
                    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e', code: 'KeyE' }));
                  }, 80);
                }}
                disabled={(myBrawler.gadgetCharges || 0) <= 0 || (myBrawler.gadgetCooldown || 0) > 0}
                className={`relative w-16 h-16 rounded-full border-4 flex flex-col items-center justify-center shadow-xl transition-all duration-150 cursor-pointer active:scale-95 ${
                  (myBrawler.gadgetCharges || 0) > 0 && (myBrawler.gadgetCooldown || 0) <= 0
                    ? 'border-emerald-400 bg-gradient-to-tr from-emerald-600 to-green-400 shadow-[0_0_25px_rgba(52,211,153,0.7)] hover:scale-105'
                    : 'border-slate-700 bg-slate-900/90 opacity-50 cursor-not-allowed'
                }`}
              >
                <span className="text-xl drop-shadow">⚡</span>
                <span className="text-[9px] font-arcade font-black text-slate-950">
                  {(myBrawler.gadgetCooldown || 0) > 0
                    ? `${Math.ceil(myBrawler.gadgetCooldown || 0)}s`
                    : `${myBrawler.gadgetCharges || 0}/3`}
                </span>

                {/* Charges badge */}
                <div className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-slate-950 border border-emerald-400 text-[9px] font-arcade font-black text-emerald-300">
                  x{myBrawler.gadgetCharges ?? 0}
                </div>
              </button>
              <span className="text-[10px] font-bold text-slate-300 mt-1 uppercase tracking-wider">
                [E] Aksesuar
              </span>
            </div>

            {/* Super Button (Yellow) */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => {
                  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
                  setTimeout(() => {
                    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
                  }, 80);
                }}
                className={`w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center shadow-2xl transition-all duration-200 cursor-pointer active:scale-95 ${
                  isSuperReady
                    ? 'border-yellow-400 bg-gradient-to-tr from-amber-500 to-yellow-300 shadow-[0_0_35px_rgba(234,179,8,0.85)] scale-105 animate-pulse'
                    : 'border-slate-700 bg-slate-900/90 opacity-70'
                }`}
              >
                <span className="text-2xl drop-shadow">💀</span>
                <span className="text-[10px] font-arcade font-black text-slate-900">
                  {isSuperReady ? 'ULTİ!' : `${Math.floor(myBrawler.superCharge)}%`}
                </span>
              </button>
              <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                [Boşluk / Sağ Tık]
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
