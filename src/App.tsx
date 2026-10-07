import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BrawlerId,
  BRAWLER_IDS,
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
import { GameLoop } from './core/loop';
import { seedFromString } from './core/rng';
import { profiler } from './core/profiler';

/**
 * How often React is allowed to re-render the HUD.
 *
 * The old loop called setSnapshot 60 times a second with the engine's live
 * entity arrays, re-rendering App, the HUD and the canvas on every frame. The
 * canvas now reads the engine directly at 60 fps, so React only needs to tick
 * often enough for health, ammo and timers to read as live.
 */
const HUD_REFRESH_INTERVAL = 1 / 12;

/** Seconds between authoritative state broadcasts to connected peers. */
const NET_SNAPSHOT_INTERVAL = 1 / 30;

export const App: React.FC = () => {
  // Player state
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('brwl_player_name') || `Brawler-${Math.floor(100 + Math.random() * 900)}`;
  });
  const [selectedBrawler, setSelectedBrawler] = useState<BrawlerId>('mira');
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
  const gameLoopRef = useRef<GameLoop | null>(null);
  /** Lets the canvas pull live state without a React render. */
  const snapshotSourceRef = useRef<(() => BrawlSnapshot | null) | undefined>(undefined);

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
      case 'scatter_shot':
        brawlAudio.playScatterShot();
        break;
      case 'rapid_shot':
        brawlAudio.playRapidShot();
        break;
      case 'heavy_punch':
        brawlAudio.playHeavyPunch();
        break;
      case 'heavy_leap':
        brawlAudio.playHeavyLeap();
        break;
      case 'rocket_launch':
        brawlAudio.playRocketLaunch();
        break;
      case 'blade_throw':
        brawlAudio.playBladeThrow();
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
      case 'rapid_reload':
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

    // Filled from the roster, offset by one so the bots are not all the
    // character the player just picked.
    const botBrawlers = BRAWLER_IDS.map(
      (_, i) => BRAWLER_IDS[(i + 1) % BRAWLER_IDS.length]
    );
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

    // Seeding from the room code makes a match reproducible: the same lobby and
    // the same inputs now produce the same match on every machine.
    const seed = seedFromString(roomCode || `${mode}-solo`);
    engine.initMatch(currentPlayers, mode, seed);
    engineRef.current = engine;
    snapshotSourceRef.current = () => engine.getSnapshot();
    setIsInGame(true);
    setSnapshot(engine.getSnapshot());

    let hudAccumulator = 0;
    let netAccumulator = 0;

    // Fixed-timestep simulation: the engine always advances in whole 1/60 s
    // steps regardless of display refresh rate, so the game no longer plays
    // differently at 60 Hz and 144 Hz and a backgrounded tab cannot teleport
    // everything through walls on the next frame.
    const loop = new GameLoop({
      update: dt => {
        profiler.simulation.begin();
        engine.update(dt);
        profiler.simulation.end();

        hudAccumulator += dt;
        if (hudAccumulator >= HUD_REFRESH_INTERVAL) {
          hudAccumulator = 0;
          setSnapshot(engine.getSnapshot());
        }

        if (!isSingleplayer && peerManagerRef.current) {
          netAccumulator += dt;
          if (netAccumulator >= NET_SNAPSHOT_INTERVAL) {
            netAccumulator = 0;
            peerManagerRef.current.broadcast({
              type: 'STATE',
              snapshot: engine.getSnapshot(),
            });
          }
        }
      },
      render: () => {
        // The canvas owns its own render loop and pulls state directly.
        profiler.stepsLastFrame = loop.lastStepCount;
      },
    });

    gameLoopRef.current?.stop();
    gameLoopRef.current = loop;
    loop.start();
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
    const chosenBrawler = BRAWLER_IDS[players.length % BRAWLER_IDS.length];
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
    gameLoopRef.current?.stop();
    gameLoopRef.current = null;
    snapshotSourceRef.current = undefined;
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
            getSnapshot={snapshotSourceRef.current}
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
