import React, { useState } from 'react';
import { TankColor, TANK_COLORS, PlayerInfo } from '../types/game';
import {
  Users,
  Play,
  Copy,
  Check,
  Bot,
  UserPlus,
  Trash2,
  HelpCircle,
  Volume2,
  VolumeX,
  ShieldAlert,
} from 'lucide-react';

interface LobbyProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  playerColor: TankColor;
  setPlayerColor: (color: TankColor) => void;
  roomCode: string;
  setRoomCode: (code: string) => void;
  isInRoom: boolean;
  isHost: boolean;
  players: PlayerInfo[];
  targetScore: number;
  setTargetScore: (score: number) => void;
  onHostGame: () => void;
  onJoinGame: () => void;
  onStartSingleplayer: () => void;
  onStartMatch: () => void;
  onAddBot: () => void;
  onRemovePlayer: (id: string) => void;
  onLeaveRoom: () => void;
  onOpenHelp: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  playerName,
  setPlayerName,
  playerColor,
  setPlayerColor,
  roomCode,
  setRoomCode,
  isInRoom,
  isHost,
  players,
  targetScore,
  setTargetScore,
  onHostGame,
  onJoinGame,
  onStartSingleplayer,
  onStartMatch,
  onAddBot,
  onRemovePlayer,
  onLeaveRoom,
  onOpenHelp,
  isMuted,
  onToggleMute,
}) => {
  const [copied, setCopied] = useState(false);
  const colorList: TankColor[] = ['cyan', 'red', 'green', 'amber', 'purple'];

  const copyInviteLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 overflow-y-auto">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black pointer-events-none" />

      {/* Top action icons */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={onToggleMute}
          className="p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition shadow-lg"
          title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button
          onClick={onOpenHelp}
          className="p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition shadow-lg"
          title="Yardım & Kontroller"
        >
          <HelpCircle size={18} />
        </button>
      </div>

      <div className="relative z-10 w-full max-w-xl flex flex-col items-center">
        {/* Logo & Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-bold uppercase tracking-widest mb-3">
            <span>⚡ 4 Kişilik P2P Online Arena</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black font-arcade tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-sky-400 via-cyan-200 to-amber-300 filter drop-shadow">
            TANK ARENA 2D
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Taktiksel, mermi sekmeli, portallı ve patlayıcı mekanikli çok oyunculu tank savaşı
          </p>
        </div>

        {!isInRoom ? (
          /* ================= MAIN MENU ================= */
          <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl flex flex-col gap-6">
            {/* Player Customization */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Oyuncu Adın
              </label>
              <input
                type="text"
                maxLength={14}
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder="Takma adını yaz..."
                className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 focus:border-sky-400 focus:outline-none text-slate-100 font-bold tracking-wide transition"
              />
            </div>

            {/* Tank Color Selection */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Tank Rengi
              </label>
              <div className="grid grid-cols-5 gap-2.5">
                {colorList.map(c => {
                  const cfg = TANK_COLORS[c];
                  const isSelected = playerColor === c;

                  return (
                    <button
                      key={c}
                      onClick={() => setPlayerColor(c)}
                      style={{
                        borderColor: isSelected ? cfg.primary : '#334155',
                        backgroundColor: isSelected ? cfg.primary + '20' : '#0f172a',
                      }}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all ${
                        isSelected ? 'scale-105 shadow-lg' : 'hover:border-slate-600'
                      }`}
                    >
                      <span
                        style={{ backgroundColor: cfg.primary }}
                        className="w-5 h-5 rounded-full shadow-inner mb-1.5"
                      />
                      <span className="text-[11px] font-bold text-slate-300 truncate w-full text-center">
                        {cfg.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px w-full bg-slate-800 my-1" />

            {/* Play Options */}
            <div className="flex flex-col gap-3">
              {/* Host Room */}
              <button
                onClick={onHostGame}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-arcade font-black text-sm tracking-wider transition shadow-[0_0_25px_rgba(6,182,212,0.35)] flex items-center justify-center gap-2 group cursor-pointer"
              >
                <Users size={18} />
                <span>ODA KUR (4 KİŞİLİK)</span>
              </button>

              {/* Join Room */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="ODA KODU (ÖR: 7X9K)"
                  className="flex-1 px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 focus:border-sky-400 focus:outline-none text-slate-100 font-arcade text-center font-bold tracking-widest uppercase transition"
                />
                <button
                  onClick={onJoinGame}
                  disabled={!roomCode.trim()}
                  className="py-3 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-arcade font-bold text-xs tracking-wider transition border border-slate-700"
                >
                  KATIL
                </button>
              </div>

              {/* Singleplayer Practice */}
              <button
                onClick={onStartSingleplayer}
                className="w-full py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-slate-300 font-bold text-xs transition flex items-center justify-center gap-2"
              >
                <Bot size={16} className="text-amber-400" />
                <span>BOTLARLA HEMEN OYNA (TEK OYUNCULU)</span>
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
                <span className="text-2xl font-black font-arcade text-sky-400 tracking-widest">
                  {roomCode}
                </span>
              </div>

              <button
                onClick={copyInviteLink}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition shadow"
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                <span>{copied ? 'KOPYALANDI!' : 'DAVET LİNKİ'}</span>
              </button>
            </div>

            {/* Players List (Slots 1 to 4) */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Oyuncular ({players.length}/4)
                </span>
                {isHost && players.length < 4 && (
                  <button
                    onClick={onAddBot}
                    className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-bold"
                  >
                    <UserPlus size={14} />
                    <span>+ Bot Ekle</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {[0, 1, 2, 3].map(slotIdx => {
                  const p = players[slotIdx];
                  if (!p) {
                    return (
                      <div
                        key={slotIdx}
                        className="p-3.5 rounded-2xl border-2 border-dashed border-slate-800 bg-slate-950/40 flex items-center justify-center text-slate-600 text-xs font-bold"
                      >
                        Slot {slotIdx + 1}: Bekleniyor...
                      </div>
                    );
                  }

                  const cfg = TANK_COLORS[p.color] || TANK_COLORS.cyan;

                  return (
                    <div
                      key={p.id}
                      style={{ borderColor: cfg.primary }}
                      className="p-3.5 rounded-2xl border bg-slate-950/80 flex items-center justify-between shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          style={{ backgroundColor: cfg.primary }}
                          className="w-4 h-4 rounded-full shadow"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-200 truncate max-w-[120px]">
                            {p.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {p.isHost ? '👑 Oda Sahibi' : p.isBot ? '🤖 Bot' : 'Asker'}
                          </span>
                        </div>
                      </div>

                      {isHost && !p.isHost && (
                        <button
                          onClick={() => onRemovePlayer(p.id)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                          title="Çıkar"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Match Settings (Target score) */}
            {isHost && (
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-xs font-bold text-slate-300">Hedef Galibiyet Skoru</span>
                <div className="flex items-center gap-1">
                  {[3, 5, 10].map(s => (
                    <button
                      key={s}
                      onClick={() => setTargetScore(s)}
                      className={`px-3 py-1 rounded-xl text-xs font-arcade font-bold transition ${
                        targetScore === s
                          ? 'bg-sky-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s} Round
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5">
              {isHost ? (
                <button
                  onClick={onStartMatch}
                  disabled={players.length < 2}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-slate-950 font-arcade font-black text-sm tracking-wider transition shadow-[0_0_25px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play size={18} />
                  <span>OYUNU BAŞLAT ({players.length}/4)</span>
                </button>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-center text-xs text-sky-400 font-bold flex items-center justify-center gap-2 animate-pulse">
                  <span>Oda sahibinin maçı başlatması bekleniyor...</span>
                </div>
              )}

              <button
                onClick={onLeaveRoom}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold transition"
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
