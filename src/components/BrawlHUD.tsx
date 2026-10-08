import React from 'react';
import { getInputMode, onInputModeChange } from '../input/inputMode';
import { BrawlSnapshot, BRAWLERS, BrawlerEntity } from '../types/brawl';
import { MAP_WIDTH, MAP_HEIGHT } from '../maps';
import { Volume2, VolumeX, RotateCcw, Radio } from 'lucide-react';
import { kitTraitLabels, listCooldownPassives } from '../sim/kitInfo';
import { ModeStatus } from './ModeStatus';

interface BrawlHUDProps {
  snapshot: BrawlSnapshot | null;
  myPlayerId: string;
  isMuted: boolean;
  onToggleMute: () => void;
  onLeaveGame: () => void;
  onSendEmote: (emote: string) => void;
  /** Round trip to the host or server in milliseconds, if it is being measured. */
  ping?: number | null;
}

/**
 * Tap-to-open emote wheel, for touch layouts where a permanently open row of
 * buttons would sit under the player's movement thumb.
 */
const EmoteWheel: React.FC<{ onSendEmote: (emote: string) => void }> = ({ onSendEmote }) => {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex items-center gap-1.5 pointer-events-auto">
      <button
        onClick={() => setOpen(value => !value)}
        className="w-11 h-11 rounded-2xl bg-slate-900/85 backdrop-blur border border-slate-700/80 text-xl shadow-xl active:scale-90 transition"
        aria-label="Emoji"
      >
        {open ? '✕' : '😂'}
      </button>

      {open && (
        <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border border-slate-700/80 p-1 rounded-2xl shadow-xl">
          {['👑', '😂', '💀', '🔥', '🎯'].map(emo => (
            <button
              key={emo}
              onClick={() => {
                onSendEmote(emo);
                setOpen(false);
              }}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl active:scale-90 transition"
            >
              {emo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Detects a touch device once, on mount.
 *
 * The HUD serves two quite different players. On a phone the canvas already
 * draws the sticks, the Super and the gadget, so repeating them in the DOM both
 * clutters the screen and puts dead buttons under the player's thumbs. On a
 * desktop there is room for the detail and no on-screen controls to collide
 * with, so that layout stays exactly as it was.
 */
function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = React.useState(() => getInputMode() === 'touch');
  React.useEffect(() => onInputModeChange(mode => setIsTouch(mode === 'touch')), []);
  return isTouch;
}

export const BrawlHUD: React.FC<BrawlHUDProps> = ({
  snapshot,
  myPlayerId,
  isMuted,
  onToggleMute,
  onLeaveGame,
  onSendEmote,
  ping = null,
}) => {
  // Hooks first, always. This used to sit below the early return, so a client —
  // which has no snapshot for the first moments of a round — rendered the HUD
  // with no hooks and then with one, which React flags as a broken invariant.
  const isTouch = useIsTouchDevice();

  if (!snapshot) return null;

  const myBrawler = snapshot.brawlers.find(b => b.id === myPlayerId);
  const cfg = myBrawler ? BRAWLERS[myBrawler.brawlerId] : null;

  // Showdown alive count
  const aliveCount = snapshot.brawlers.filter(b => b.isAlive).length;

  // Gem Grab Team Counts
  const blueGems = snapshot.brawlers.filter(b => b.team === 0).reduce((acc, b) => acc + b.gemsCarried, 0);
  const redGems = snapshot.brawlers.filter(b => b.team === 1).reduce((acc, b) => acc + b.gemsCarried, 0);

  const isSuperReady = (myBrawler?.superCharge || 0) >= 100;

  // Showdown placement, read off the elimination order: the last player
  // knocked out finished second, the one before them third, and so on.
  const contenders = snapshot?.brawlers.filter(b => !b.isClone) ?? [];
  const totalContenders = contenders.length;
  const eliminatedIndex = snapshot?.eliminationOrder?.indexOf(myPlayerId) ?? -1;
  const placement = eliminatedIndex >= 0 ? totalContenders - eliminatedIndex : totalContenders;

  return (
    <div className="absolute inset-0 pointer-events-none p-2 sm:p-4 flex flex-col justify-between select-none">
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

          {/* Coloured by what it means for play, not by an arbitrary scale:
              under 60 ms is invisible, past 130 it is felt in every shot. */}
          {ping !== null && (
            <div
              title="Sunucuya gecikme"
              className={`px-2.5 py-1.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-lg font-arcade text-[11px] font-bold tabular-nums ${
                ping < 60 ? 'text-emerald-400' : ping < 130 ? 'text-amber-300' : 'text-rose-400'
              }`}
            >
              {ping} ms
            </div>
          )}
        </div>

        {/* Center: how the match is going, which depends on the mode */}
        <div className="flex flex-col items-center">
          <ModeStatus snapshot={snapshot} myPlayerId={myPlayerId} />
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

          {/* Hot Zone's zone */}
          {snapshot.zone && (
            <span
              style={{
                top: `${(snapshot.zone.y / MAP_HEIGHT) * 100}%`,
                left: `${(snapshot.zone.x / MAP_WIDTH) * 100}%`,
                width: `${(snapshot.zone.radius * 2 / MAP_WIDTH) * 100}%`,
                height: `${(snapshot.zone.radius * 2 / MAP_HEIGHT) * 100}%`,
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                snapshot.zone.controller === null
                  ? 'border-amber-300/80 bg-amber-300/10'
                  : snapshot.zone.controller === 0
                    ? 'border-blue-400 bg-blue-500/30'
                    : 'border-rose-400 bg-rose-500/30'
              }`}
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
                    : myBrawler && b.team === myBrawler.team
                    ? 'bg-blue-400'
                    : 'bg-rose-400'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* ================= KILL FEED =================
          Sits under the radar, newest at the bottom, oldest fading out. Without
          it a Showdown lobby silently emptied and the only clue was the counter
          at the top ticking down. */}
      {snapshot.killFeed && snapshot.killFeed.length > 0 && (
        <div className="absolute top-24 right-2 sm:right-4 flex flex-col items-end gap-1 pointer-events-none">
          {snapshot.killFeed.slice(-4).map((entry, index, shown) => (
            <div
              key={entry.id}
              style={{ opacity: 0.45 + ((index + 1) / shown.length) * 0.55 }}
              className="px-2.5 py-1 rounded-xl bg-slate-950/85 border border-slate-700/70 text-[10px] font-bold flex items-center gap-1.5 shadow-lg"
            >
              <span className="text-slate-300">{entry.killerName}</span>
              <span className="text-rose-400">⚔</span>
              <span className="text-slate-500 line-through">{entry.victimName}</span>
            </div>
          ))}
        </div>
      )}

      {/* ================= ELIMINATION BANNER =================
          Being knocked out used to leave the player watching a corpse with no
          explanation. The camera now follows someone still playing, and this
          says what happened and where they finished. */}
      {myBrawler && !myBrawler.isAlive && snapshot.phase === 'playing' && (
        <div className="absolute inset-x-0 top-1/3 flex flex-col items-center gap-2 pointer-events-none">
          <div className="px-6 py-3 rounded-3xl bg-slate-950/90 border-2 border-rose-500/70 shadow-2xl flex flex-col items-center gap-1">
            <span className="font-arcade text-xl font-black text-rose-300 tracking-widest">
              ELENDİN
            </span>
            {snapshot.mode === 'showdown' && (
              <span className="font-arcade text-sm font-bold text-amber-300">
                {`#${placement} / ${totalContenders}`}
              </span>
            )}
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              Maçı izliyorsun
            </span>
          </div>
        </div>
      )}

      {/* ================= BOTTOM BAR ================= */}
      <div className="flex items-end justify-between w-full max-w-5xl mx-auto">
        {/* Left: Emote Wheel / Pins.
            On a phone the open row sat directly under the movement thumb,
            so hitting it was usually an accident. Touch gets a single
            tap-to-open button instead. */}
        {isTouch ? (
          <EmoteWheel onSendEmote={onSendEmote} />
        ) : (
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
        )}

        {/* Center: Health, Ammo & Super Controls.
            Hidden on touch: the canvas draws health and ammo under the
            character, which is where the player is already looking. */}
        {myBrawler && cfg && !isTouch && (
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
              {/* Cooldown-gated passives, read off the kit rather than
                  hard-coded per character. */}
              {listCooldownPassives(myBrawler).map(passive => (
                <div
                  key={passive.name}
                  className={`px-3 py-1 rounded-xl text-[10px] font-arcade font-bold tracking-wide border transition flex items-center gap-1.5 shadow ${
                    passive.ready
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.4)]'
                      : 'bg-slate-900/80 border-slate-700 text-slate-400'
                  }`}
                >
                  <span>🩹</span>
                  <span>
                    {passive.ready
                      ? `${passive.name.toLocaleUpperCase('tr')}: HAZIR`
                      : `${passive.name.toLocaleUpperCase('tr')}: ${Math.ceil(passive.remaining)}s`}
                  </span>
                </div>
              ))}

              {/* Always-on kit traits, and the star power's own name. Five
                  per-character blocks used to live here, which meant every new
                  brawler was also a HUD change. */}
              <div className="px-3 py-1 rounded-xl text-[10px] font-arcade font-bold tracking-wide border bg-indigo-500/20 border-indigo-400/80 text-indigo-200 shadow flex items-center gap-1.5">
                <span>⭐</span>
                <span>{BRAWLERS[myBrawler.brawlerId].starPowerName.toLocaleUpperCase('tr')}</span>
              </div>

              {kitTraitLabels(myBrawler).map(label => (
                <div
                  key={label}
                  className="px-3 py-1 rounded-xl text-[10px] font-arcade font-bold tracking-wide border bg-emerald-500/20 border-emerald-400/80 text-emerald-300 shadow flex items-center gap-1.5"
                >
                  <span>🛡️</span>
                  <span>{label}</span>
                </div>
              ))}

              {(myBrawler.speedBoostTimer || 0) > 0 && (
                <div className="px-2.5 py-1 rounded-xl text-[10px] font-arcade font-bold tracking-wide border bg-amber-500/30 border-amber-400 text-amber-200 animate-pulse flex items-center gap-1">
                  <span>☄️</span>
                  <span>+%{Math.round(((myBrawler.speedBoostMagnitude || 1) - 1) * 100)} HIZ</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right: Gadget & Super Buttons.
            On touch the canvas draws these where the thumb already is,
            and they support drag-to-aim, which a DOM button cannot. */}
        {myBrawler && !isTouch && (
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
