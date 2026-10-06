import React, { useState } from 'react';
import { BrawlerId, BRAWLERS, PlayerInfo, BrawlGameMode } from '../types/brawl';
import {
  Users,
  Play,
  Copy,
  Check,
  Bot,
  UserPlus,
  Trash2,
  Volume2,
  VolumeX,
  Shield,
  Zap,
  Target,
  Skull,
} from 'lucide-react';

interface BrawlLobbyProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  selectedBrawler: BrawlerId;
  setSelectedBrawler: (brawler: BrawlerId) => void;
  gameMode: BrawlGameMode;
  setGameMode: (mode: BrawlGameMode) => void;
  roomCode: string;
  setRoomCode: (code: string) => void;
  isInRoom: boolean;
  isHost: boolean;
  players: PlayerInfo[];
  onHostGame: () => void;
  onJoinGame: () => void;
  onStartSingleplayer: () => void;
  onStartMatch: () => void;
  onAddBot: () => void;
  onRemovePlayer: (id: string) => void;
  onLeaveRoom: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const BrawlLobby: React.FC<BrawlLobbyProps> = ({
  playerName,
  setPlayerName,
  selectedBrawler,
  setSelectedBrawler,
  gameMode,
  setGameMode,
  roomCode,
  setRoomCode,
  isInRoom,
  isHost,
  players,
  onHostGame,
  onJoinGame,
  onStartSingleplayer,
  onStartMatch,
  onAddBot,
  onRemovePlayer,
  onLeaveRoom,
  isMuted,
  onToggleMute,
}) => {
  const [copied, setCopied] = useState(false);
  const brawlerList: BrawlerId[] = ['shelly', 'colt', 'el_primo', 'brock', 'spike', 'leon'];
  const activeCfg = BRAWLERS[selectedBrawler];

  const copyInviteLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 overflow-y-auto">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black pointer-events-none" />

      {/* Top action icons */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={onToggleMute}
          className="p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition shadow-lg cursor-pointer"
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-arcade font-bold tracking-widest mb-3 shadow-lg">
            <span>⚡ 4-10 Kişilik Çok Oyunculu Arena</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black font-arcade tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-amber-400 via-yellow-200 to-rose-400 filter drop-shadow">
            BRAWL STARS 2D
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Özel ultiler, çalı pusuları, güç küpleri ve elmas madeniyle gerçek zamanlı savaş
          </p>
        </div>

        {!isInRoom ? (
          /* ================= MAIN LOBBY: BRAWLER SELECT ================= */
          <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl flex flex-col gap-6">
            {/* Player Name */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Oyuncu Adın
              </label>
              <input
                type="text"
                maxLength={14}
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder="Takma adını gir..."
                className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 focus:border-yellow-400 focus:outline-none text-slate-100 font-bold tracking-wide transition"
              />
            </div>

            {/* Brawler Roster Selector */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Brawler Seçimi
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {brawlerList.map(bId => {
                  const bCfg = BRAWLERS[bId];
                  const isSelected = selectedBrawler === bId;

                  return (
                    <button
                      key={bId}
                      onClick={() => setSelectedBrawler(bId)}
                      style={{
                        borderColor: isSelected ? bCfg.color : '#334155',
                        backgroundColor: isSelected ? bCfg.color + '25' : '#0f172a',
                      }}
                      className={`flex flex-col items-center p-2.5 rounded-2xl border-2 transition-all cursor-pointer ${
                        isSelected ? 'scale-105 shadow-[0_0_20px_rgba(234,179,8,0.4)] ring-2 ring-yellow-400/50' : 'hover:border-slate-600'
                      }`}
                    >
                      <img
                        src={`/assets/${bId}.png`}
                        alt={bCfg.name}
                        className="w-14 h-14 object-contain filter drop-shadow-md mb-1.5 transition-transform hover:scale-110"
                        onError={(e) => {
                          // fallback if image not loaded
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <span className="font-arcade text-xs font-bold text-slate-100">{bCfg.name}</span>
                      <span className="text-[10px] text-slate-400">{bCfg.rarity}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Brawler Stats Detail Card */}
            <div className="p-5 rounded-2xl bg-slate-950/85 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-5 shadow-inner">
              <div className="flex items-center gap-4">
                <img
                  src={`/assets/${selectedBrawler}.png`}
                  alt={activeCfg.name}
                  className="w-24 h-24 object-contain filter drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] animate-pulse"
                />
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h3 style={{ color: activeCfg.color }} className="font-arcade text-xl font-black">
                      {activeCfg.name}
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700">
                      {activeCfg.title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">{activeCfg.description}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold">
                      ⚔️ {activeCfg.attackName}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-purple-500/15 border border-purple-500/40 text-purple-300 font-bold">
                      💀 {activeCfg.superName}
                    </span>
                  </div>

                  {/* Gadget & Star Power Detailed Badges */}
                  <div className="flex flex-col gap-1.5 mt-3 pt-2 border-t border-slate-800/80 text-xs">
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-arcade text-[10px] font-black shrink-0">
                        ⚡ AKSESUAR
                      </span>
                      <span className="text-slate-300">
                        <strong className="text-emerald-400">{activeCfg.gadgetName}:</strong> {activeCfg.gadgetDesc}
                      </span>
                    </div>

                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 font-arcade text-[10px] font-black shrink-0">
                        ⭐ YILDIZ GÜCÜ
                      </span>
                      <span className="text-slate-300">
                        <strong className="text-amber-400">{activeCfg.starPowerName}:</strong> {activeCfg.starPowerDesc}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stat Gauges */}
              <div className="grid grid-cols-2 gap-2 w-full md:w-auto text-xs">
                <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <Shield size={16} className="text-emerald-400" />
                  <span>Can: {activeCfg.maxHp}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <Zap size={16} className="text-amber-400" />
                  <span>Hız: {activeCfg.speed}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <Target size={16} className="text-rose-400" />
                  <span>Menzil: {activeCfg.range}px</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <Skull size={16} className="text-purple-400" />
                  <span>Hasar: {activeCfg.damagePerAttack}</span>
                </div>
              </div>
            </div>

            <div className="h-px w-full bg-slate-800" />

            {/* Play Actions */}
            <div className="flex flex-col gap-3">
              <button
                onClick={onHostGame}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-arcade font-black text-sm tracking-wider transition shadow-[0_0_25px_rgba(245,158,11,0.4)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Users size={18} />
                <span>ODA KUR (4-10 KİŞİLİK)</span>
              </button>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="ODA KODU (ÖR: 7X9K)"
                  className="flex-1 px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 focus:border-yellow-400 focus:outline-none text-slate-100 font-arcade text-center font-bold tracking-widest uppercase transition"
                />
                <button
                  onClick={onJoinGame}
                  disabled={!roomCode.trim()}
                  className="py-3 px-6 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-arcade font-bold text-xs tracking-wider transition border border-slate-700 cursor-pointer"
                >
                  KATIL
                </button>
              </div>

              <button
                onClick={onStartSingleplayer}
                className="w-full py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-slate-300 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Bot size={16} className="text-yellow-400" />
                <span>HEMEN OYNA (TEK OYUNCULU / BOTLARLA HESAPLAŞMA)</span>
              </button>
            </div>
          </div>
        ) : (
          /* ================= IN-ROOM LOBBY ================= */
          <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl flex flex-col gap-6">
            {/* Room Code & Invite Link */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Oda Kodu
                </span>
                <span className="text-2xl font-black font-arcade text-yellow-400 tracking-widest">
                  {roomCode}
                </span>
              </div>

              <button
                onClick={copyInviteLink}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition shadow cursor-pointer"
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                <span>{copied ? 'KOPYALANDI!' : 'DAVET LİNKİ'}</span>
              </button>
            </div>

            {/* Game Mode Selector (Host only) */}
            {isHost && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Oyun Modu Seçimi
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setGameMode('showdown')}
                    className={`p-3.5 rounded-2xl border-2 flex items-center gap-3 transition cursor-pointer ${
                      gameMode === 'showdown'
                        ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <span className="text-2xl">💀</span>
                    <div className="flex flex-col text-left">
                      <span className="font-arcade text-xs font-bold">HESAPLAŞMA (SHOWDOWN)</span>
                      <span className="text-[11px] opacity-75">Kutular, Zehirli Gaz, Son Kalan Kazanır</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setGameMode('gem_grab')}
                    className={`p-3.5 rounded-2xl border-2 flex items-center gap-3 transition cursor-pointer ${
                      gameMode === 'gem_grab'
                        ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <span className="text-2xl">💎</span>
                    <div className="flex flex-col text-left">
                      <span className="font-arcade text-xs font-bold">ELMAS KAPMACA (GEM GRAB)</span>
                      <span className="text-[11px] opacity-75">10 Elması Topla ve Geri Sayımı Başlat</span>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Player Slots (Up to 10 players) */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Oyuncular ({players.length}/10) - Minimum 4
                </span>
                {isHost && players.length < 10 && (
                  <button
                    onClick={onAddBot}
                    className="flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 font-bold cursor-pointer"
                  >
                    <UserPlus size={14} />
                    <span>+ Bot Ekle ({players.length}/10)</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                {[...Array(10)].map((_, slotIdx) => {
                  const p = players[slotIdx];
                  if (!p) {
                    return (
                      <div
                        key={slotIdx}
                        className="p-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 flex items-center justify-center text-slate-600 text-xs font-bold h-20"
                      >
                        Slot {slotIdx + 1}
                      </div>
                    );
                  }

                  const bCfg = BRAWLERS[p.brawler || 'shelly'];

                  return (
                    <div
                      key={p.id}
                      style={{ borderColor: bCfg.color }}
                      className="p-2.5 rounded-2xl border bg-slate-950/80 flex flex-col justify-between shadow-md h-20 relative"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          style={{ backgroundColor: bCfg.color }}
                          className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-arcade font-bold text-white"
                        >
                          {bCfg.name[0]}
                        </span>
                        {isHost && !p.isHost && (
                          <button
                            onClick={() => onRemovePlayer(p.id)}
                            className="text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-200 truncate">{p.name}</span>
                        <span className="text-[10px] text-slate-400">{bCfg.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Launch Buttons */}
            <div className="flex flex-col gap-2.5">
              {isHost ? (
                <button
                  onClick={onStartMatch}
                  disabled={players.length < 4}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-400 hover:from-emerald-400 hover:to-green-300 disabled:opacity-50 text-slate-950 font-arcade font-black text-sm tracking-wider transition shadow-[0_0_25px_rgba(34,197,94,0.4)] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play size={18} />
                  <span>
                    {players.length < 4
                      ? `EN AZ 4 OYUNCU GEREKİYOR (+Bot Ekle) (${players.length}/4)`
                      : `SAVAŞI BAŞLAT (${players.length}/10)`}
                  </span>
                </button>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-center text-xs text-yellow-400 font-bold flex items-center justify-center gap-2 animate-pulse">
                  <span>Oda sahibinin savaşı başlatması bekleniyor...</span>
                </div>
              )}

              <button
                onClick={onLeaveRoom}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold transition cursor-pointer"
              >
                Odadan Ayrıl
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
