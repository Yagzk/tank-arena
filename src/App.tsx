import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BrawlerId,
  PlayerInfo,
  BrawlSnapshot,
  BrawlPlayerInput,
  BrawlGameMode,
} from './types/brawl';
import { BrawlEngine, BrawlSoundEvent } from './game/brawlEngine';
import { PeerManager } from './network/peerManager';
import { brawlAudio } from './audio/brawlAudio';
import { BrawlLobby } from './components/BrawlLobby';
import { BrawlCanvas } from './components/BrawlCanvas';
import { BrawlHUD } from './components/BrawlHUD';
import { StarPlayerModal } from './components/StarPlayerModal';

export const App: React.FC = () => {
  // Player state
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('brwl_player_name') || `Brawler-${Math.floor(100 + Math.random() * 900)}`;
  });
  const [selectedBrawler, setSelectedBrawler] = useState<BrawlerId>('shelly');
  const [gameMode, setGameMode] = useState<BrawlGameMode>('showdown');
  const [roomCode, setRoomCode] = useState<string>('');

  // Game & Room state
  const [isInRoom, setIsInRoom] = useState<boolean>(false);
  const [isInGame, setIsInGame] = useState<boolean>(false);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isSingleplayer, setIsSingleplayer] = useState<boolean>(false);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);

  // Snapshot for rendering
  const [snapshot, setSnapshot] = useState<BrawlSnapshot | null>(null);

  // Audio mute
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Engine & Network references
  const engineRef = useRef<BrawlEngine | null>(null);
  const peerManagerRef = useRef<PeerManager | null>(null);
  const myPlayerIdRef = useRef<string>('');
  const lastTimeRef = useRef<number>(performance.now());
  const loopAnimRef = useRef<number>(0);

  // Save player name
  useEffect(() => {
    localStorage.setItem('brwl_player_name', playerName);
  }, [playerName]);

  // Check URL query parameters for ?room=CODE
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code) {
      setRoomCode(code.toUpperCase());
    }
  }, []);

  // Audio trigger handler
  const handleSoundEvent = useCallback((event: BrawlSoundEvent) => {
    switch (event.type) {
      case 'shelly_attack':
        brawlAudio.playShellyAttack();
        break;
      case 'colt_attack':
        brawlAudio.playColtLaser();
        break;
      case 'primo_punch':
        brawlAudio.playPrimoPunch();
        break;
      case 'primo_leap':
        brawlAudio.playPrimoLeap();
        break;
      case 'brock_rocket':
        brawlAudio.playBrockRocket();
        break;
      case 'leon_shuriken':
        brawlAudio.playLeonShuriken();
        break;
      case 'super_ready':
        brawlAudio.playSuperReady();
        break;
      case 'super_blast':
        brawlAudio.playSuperBlast();
        break;
      case 'gem_pickup':
        brawlAudio.playGemPickup();
        break;
      case 'cube_pickup':
        brawlAudio.playPowerCubePickup();
        break;
      case 'star_player':
        brawlAudio.playStarPlayer();
        break;
      case 'gadget_activate':
        brawlAudio.playGadget();
        break;
      case 'band_aid':
        brawlAudio.playBandAid();
        break;
      case 'colt_reload':
        brawlAudio.playReload();
        break;
    }
  }, []);

  // Host Game
  const handleHostGame = () => {
    const code = PeerManager.generateRoomCode();
    setRoomCode(code);
    setIsHost(true);
    setIsSingleplayer(false);

    const hostId = `brwl-${code.toUpperCase()}`;
    setMyPlayerId(hostId);
    myPlayerIdRef.current = hostId;

    const pm = new PeerManager({
      onConnected: () => {
        setIsInRoom(true);
      },
      onPlayersChanged: updatedPlayers => {
        setPlayers([...updatedPlayers]);
      },
      onInputReceived: (pId, input) => {
        engineRef.current?.setPlayerInput(pId, input);
      },
      onError: err => {
        alert(err);
      },
    });

    peerManagerRef.current = pm;
    pm.hostRoom(code, playerName, selectedBrawler, gameMode);
  };

  // Join Game
  const handleJoinGame = () => {
    if (!roomCode.trim()) return;
    setIsHost(false);
    setIsSingleplayer(false);

    const pm = new PeerManager({
      onConnected: () => {
        setIsInRoom(true);
        if (pm.myId) {
          setMyPlayerId(pm.myId);
          myPlayerIdRef.current = pm.myId;
        }
      },
      onPlayersChanged: updatedPlayers => {
        setPlayers([...updatedPlayers]);
      },
      onGameStart: mode => {
        setGameMode(mode);
        setIsInGame(true);
      },
      onStateReceived: snap => {
        setSnapshot(snap);
      },
      onSoundReceived: event => {
        handleSoundEvent(event);
      },
      onError: err => {
        alert(err);
        handleLeaveGame();
      },
    });

    peerManagerRef.current = pm;
    pm.joinRoom(roomCode, playerName, selectedBrawler);
  };

  // Start Singleplayer (Instant Showdown with 7 AI Bots = 8 Brawlers Total!)
  const handleStartSingleplayer = () => {
    setIsHost(true);
    setIsSingleplayer(true);
    setIsInRoom(false);

    const myId = 'local-player';
    setMyPlayerId(myId);
    myPlayerIdRef.current = myId;

    const botBrawlers: BrawlerId[] = ['colt', 'el_primo', 'brock', 'spike', 'leon', 'shelly', 'colt'];
    const botNames = [
      'Gunslinger-AI',
      'El-Toro-AI',
      'Rocket-Pro-AI',
      'Needle-King-AI',
      'Shadow-AI',
      'Bandita-AI',
      'Sheriff-AI',
    ];

    const gamePlayers: PlayerInfo[] = [
      {
        id: myId,
        name: playerName || 'Yıldız Oyuncu',
        brawler: selectedBrawler,
        team: 0,
        isHost: true,
        score: 0,
        trophies: 0,
      },
      ...botNames.map((bName, i) => ({
        id: `bot-${i + 1}`,
        name: bName,
        brawler: botBrawlers[i],
        team: i + 1,
        isHost: false,
        isBot: true,
        score: 0,
        trophies: 0,
      })),
    ];

    setPlayers(gamePlayers);
    startEngineMatch(gamePlayers, gameMode);
  };

  // Start Match (Host action)
  const handleStartMatch = () => {
    if (!isHost || players.length < 4) return;

    peerManagerRef.current?.broadcast({
      type: 'START_MATCH',
      mode: gameMode,
    });

    startEngineMatch(players, gameMode);
  };

  // Start the engine loop (Host or Singleplayer)
  const startEngineMatch = (currentPlayers: PlayerInfo[], mode: BrawlGameMode) => {
    const engine = new BrawlEngine();
    engine.onSoundTriggered = event => {
      handleSoundEvent(event);
      if (!isSingleplayer) {
        peerManagerRef.current?.broadcast({
          type: 'SOUND',
          event,
        });
      }
    };

    engine.initMatch(currentPlayers, mode);
    engineRef.current = engine;
    setIsInGame(true);

    lastTimeRef.current = performance.now();

    // 60 FPS Engine loop
    let lastBroadcast = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      engine.update(dt);
      const currentSnap = engine.getSnapshot();
      setSnapshot(currentSnap);

      // Broadcast at 45Hz
      if (!isSingleplayer && peerManagerRef.current && now - lastBroadcast > 22) {
        lastBroadcast = now;
        peerManagerRef.current.broadcast({
          type: 'STATE',
          snapshot: currentSnap,
        });
      }

      loopAnimRef.current = requestAnimationFrame(loop);
    };

    cancelAnimationFrame(loopAnimRef.current);
    loopAnimRef.current = requestAnimationFrame(loop);
  };

  // Send local input
  const handleSendInput = useCallback((input: BrawlPlayerInput) => {
    if (isHost || isSingleplayer) {
      engineRef.current?.setPlayerInput(myPlayerIdRef.current, input);
    } else {
      peerManagerRef.current?.sendToHost({
        type: 'INPUT',
        input,
      });
    }
  }, [isHost, isSingleplayer]);

  // Send Emote
  const handleSendEmote = (emote: string) => {
    handleSendInput({
      moveX: 0,
      moveY: 0,
      aimAngle: 0,
      attack: false,
      superAttack: false,
      emote,
    });
  };

  // Add Bot (Host action up to 10 players)
  const handleAddBot = () => {
    if (players.length >= 10) return;
    const brawlerList: BrawlerId[] = ['shelly', 'colt', 'el_primo', 'brock', 'spike', 'leon'];
    const chosenBrawler = brawlerList[players.length % brawlerList.length];
    const botNum = players.filter(p => p.isBot).length + 1;

    peerManagerRef.current?.addBot(`Bot-${botNum}`, chosenBrawler);
  };

  // Remove Player/Bot
  const handleRemovePlayer = (id: string) => {
    peerManagerRef.current?.removePlayer(id);
  };

  // Restart match after game over
  const handleRestartMatch = () => {
    if (isHost) {
      startEngineMatch(players, gameMode);
    }
  };

  // Leave Game
  const handleLeaveGame = () => {
    cancelAnimationFrame(loopAnimRef.current);
    peerManagerRef.current?.destroy();
    peerManagerRef.current = null;
    engineRef.current = null;
    setIsInGame(false);
    setIsInRoom(false);
    setSnapshot(null);
  };

  const handleToggleMute = () => {
    const muted = brawlAudio.toggleMute();
    setIsMuted(muted);
  };

  return (
    <main className="w-screen h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center overflow-hidden">
      {!isInGame ? (
        <BrawlLobby
          playerName={playerName}
          setPlayerName={setPlayerName}
          selectedBrawler={selectedBrawler}
          setSelectedBrawler={setSelectedBrawler}
          gameMode={gameMode}
          setGameMode={setGameMode}
          roomCode={roomCode}
          setRoomCode={setRoomCode}
          isInRoom={isInRoom}
          isHost={isHost}
          players={players}
          onHostGame={handleHostGame}
          onJoinGame={handleJoinGame}
          onStartSingleplayer={handleStartSingleplayer}
          onStartMatch={handleStartMatch}
          onAddBot={handleAddBot}
          onRemovePlayer={handleRemovePlayer}
          onLeaveRoom={handleLeaveGame}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      ) : (
        <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
          <BrawlCanvas
            snapshot={snapshot}
            myPlayerId={myPlayerId}
            onSendInput={handleSendInput}
          />

          <BrawlHUD
            snapshot={snapshot}
            myPlayerId={myPlayerId}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onLeaveGame={handleLeaveGame}
            onSendEmote={handleSendEmote}
          />

          {snapshot?.phase === 'match_end' && (
            <StarPlayerModal
              snapshot={snapshot}
              myPlayerId={myPlayerId}
              isHost={isHost}
              onRestartMatch={handleRestartMatch}
              onReturnToLobby={handleLeaveGame}
            />
          )}
        </div>
      )}
    </main>
  );
};

export default App;
