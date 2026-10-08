import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { SnapshotDecoder, SnapshotEncoder, type NetSnapshot } from './network/codec';
import { ServerManager } from './network/serverManager';
import { getServerUrl } from './network/config';
import { SnapshotInterpolator } from './net/interpolation';
import { Predictor } from './net/prediction';
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

/**
 * Seconds between state broadcasts, by how many clients there are to feed.
 *
 * Upload is shared out: every client is sent every packet, so the host's
 * bandwidth is the packet rate times the packet size times the number of
 * peers. Up to four clients the full rate is affordable; beyond that it drops
 * to twenty a second, which the client's 110 ms interpolation buffer still
 * spans with two packets, so motion stays smooth.
 */
function netSnapshotInterval(peerCount: number): number {
  return peerCount <= 4 ? 1 / 30 : 1 / 20;
}

export const App: React.FC = () => {
  // Player state
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('brwl_player_name') || `Brawler-${Math.floor(100 + Math.random() * 900)}`;
  });
  const [selectedBrawler, setSelectedBrawlerState] = useState<BrawlerId>('mira');

  /**
   * Picking a character, before a room exists and from inside one.
   *
   * Changing your pick used to mean leaving the room, which hands everybody
   * a new code to type in. In a room the host owns the roster, so this asks
   * rather than tells and the answer comes back as a room update.
   */
  const setSelectedBrawler = (brawler: BrawlerId) => {
    setSelectedBrawlerState(brawler);
    peerManagerRef.current?.setBrawler(brawler);
    serverRef.current?.pick(brawler);
  };
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

  /** Host: remembers what clients already have, so geometry is not resent. */
  const encoderRef = useRef(new SnapshotEncoder());
  /** Client: rebuilds full snapshots from the stream. */
  const decoderRef = useRef(new SnapshotDecoder());
  /** Client: every packet is fed here the moment it arrives. */
  const interpolatorRef = useRef(new SnapshotInterpolator());
  /** Client: runs this player's own movement ahead of the server's word. */
  const predictorRef = useRef(new Predictor());
  /** Whether a match is on screen, readable from callbacks that outlive a render. */
  const inGameRef = useRef(false);
  /** Counts rounds in a room, so a rematch is not the same match again. */
  const matchCountRef = useRef(0);

  /**
   * Where the game server is, if there is one. With it, rooms live there and no
   * browser runs a match; without it the game is peer-to-peer as before.
   */
  const serverUrl = useMemo(() => getServerUrl(), []);
  const serverRef = useRef<ServerManager | null>(null);
  /** Whether this connection has actually been put in a room yet. */
  const joinedRef = useRef(false);
  /** Numbers each input, so the server can say how many it has applied. */
  const inputSeqRef = useRef(0);
  /** Round trip to the host or server, in milliseconds. */
  const [ping, setPing] = useState<number | null>(null);
  const lastClientHudRef = useRef(0);
  const lastClientPhaseRef = useRef<string>('');

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

  // Browsers keep audio silent until the player has done something. The first
  // click, key or touch unlocks it, and whatever music was waiting starts.
  useEffect(() => {
    const unlock = () => {
      brawlAudio.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // The music is the room's: gentle in the lobby, and each mode has its own.
  useEffect(() => {
    brawlAudio.music(isInGame ? gameMode : 'lobby');
    if (!isInGame) brawlAudio.clearListener();
  }, [isInGame, gameMode]);

  // Audio trigger handler. Which sound it is, where it happened and who it is
  // for all come with the event; deciding how it sounds from here is the audio
  // module's job, not this file's.
  const handleSoundEvent = useCallback((event: BrawlSoundEvent) => {
    // A cue addressed to somebody else — their Super is ready, their kill — is
    // not for this player to hear.
    if (event.to && event.to !== myPlayerIdRef.current) return;
    brawlAudio.play(event);
  }, []);

  /**
   * A state packet from whoever runs the match — a host's browser or the
   * server. Both end up here, so a client behaves the same whichever it is.
   */
  const receiveState = (net: NetSnapshot) => {
    // Late packets from a round that has already ended are noise.
    if (!inGameRef.current) return;

    const snap = decoderRef.current.decode(net);

    // Our own body is predicted; the server's account of it corrects the guess.
    const me = snap.brawlers.find(b => b.id === myPlayerIdRef.current);
    if (me) predictorRef.current.reconcile(me, snap.walls, snap.boxes, snap.phase === 'playing');

    // Every packet goes straight to the interpolator, so motion is smooth at
    // the rate packets arrive. React only needs the HUD's rate: it used to
    // re-render the whole tree on every packet.
    interpolatorRef.current.push(snap, performance.now());

    const now = performance.now();
    const phaseChanged = snap.phase !== lastClientPhaseRef.current;
    if (phaseChanged || now - lastClientHudRef.current >= HUD_REFRESH_INTERVAL * 1000) {
      lastClientPhaseRef.current = snap.phase;
      lastClientHudRef.current = now;
      setSnapshot(snap);
    }
  };

  /**
   * Opens the game server and then creates a room on it or joins one.
   *
   * Nobody here runs a match, the room's owner included: they are a client
   * like everyone else, and "host" in the interface only means the person who
   * may start the round.
   */
  const connectToServer = async (action: 'create' | 'join') => {
    if (!serverUrl) return;
    // A previous attempt that never got into a room must not be left open.
    serverRef.current?.destroy();
    joinedRef.current = false;
    setIsSingleplayer(false);

    const manager = new ServerManager(serverUrl, {
      onJoined: (code, you) => {
        joinedRef.current = true;
        myPlayerIdRef.current = you;
        setMyPlayerId(you);
        setRoomCode(code);
        setIsInRoom(true);
      },
      onRoom: (list, mode, owner) => {
        setPlayers([...list]);
        setGameMode(mode);
        setIsHost(owner === myPlayerIdRef.current);
        const me = list.find(p => p.id === myPlayerIdRef.current);
        if (me) setSelectedBrawlerState(me.brawler);
      },
      onStart: mode => {
        setGameMode(mode);
        beginClientMatch();
        setIsInGame(true);
      },
      onState: net => receiveState(net),
      onSound: event => handleSoundEvent(event),
      onLobby: () => stopMatchKeepRoom(),
      onPing: rtt => setPing(rtt),
      onError: message => {
        alert(message);
        // An error before a room was entered — wrong code, server full — leaves
        // a connection open to nothing. Close it, so the next try starts clean.
        if (!joinedRef.current) {
          manager.destroy();
          if (serverRef.current === manager) serverRef.current = null;
        }
      },
      onClosed: () => {
        alert('Sunucu ile bağlantı kesildi.');
        handleLeaveGame();
      },
    });
    serverRef.current = manager;

    try {
      await manager.connect();
    } catch (error) {
      serverRef.current = null;
      alert(error instanceof Error ? error.message : 'Sunucuya bağlanılamadı.');
      return;
    }

    if (action === 'create') manager.create(playerName, selectedBrawler, gameMode);
    else manager.join(roomCode, playerName, selectedBrawler);
  };

  // The owner picking a mode in the room. Everybody else follows the room.
  const handleSetGameMode = (mode: BrawlGameMode) => {
    setGameMode(mode);
    serverRef.current?.setMode(mode);
  };

  // Host Game
  const handleHostGame = () => {
    if (serverUrl) {
      void connectToServer('create');
      return;
    }
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
        // The host owns the roster, so the picker shows what was actually
        // accepted rather than what this client asked for.
        const me = updatedPlayers.find(p => p.id === myPlayerIdRef.current);
        if (me) setSelectedBrawlerState(me.brawler);
      },
      onInputReceived: (pId, input, seq) => {
        engineRef.current?.setPlayerInput(pId, input, seq);
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
    if (serverUrl) {
      void connectToServer('join');
      return;
    }
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
        // The host owns the roster, so the picker shows what was actually
        // accepted rather than what this client asked for.
        const me = updatedPlayers.find(p => p.id === myPlayerIdRef.current);
        if (me) setSelectedBrawlerState(me.brawler);
      },
      onGameStart: mode => {
        setGameMode(mode);
        beginClientMatch();
        setIsInGame(true);
      },
      onReturnToLobby: () => {
        stopMatchKeepRoom();
      },
      onPing: rtt => setPing(rtt),
      onStateReceived: net => receiveState(net),
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
    if (serverRef.current) {
      serverRef.current.start();
      return;
    }
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
    // the same inputs now produce the same match on every machine. The round
    // number is part of it, or every rematch in a room would be the same map.
    matchCountRef.current += 1;
    const seed = seedFromString(`${roomCode || `${mode}-solo`}#${matchCountRef.current}`);
    encoderRef.current.reset();
    engine.initMatch(currentPlayers, mode, seed);
    inGameRef.current = true;
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

        netAccumulator += dt;
      },
      afterSteps: () => {
        // Once per wake-up, never once per step. After a stall the loop
        // catches up with dozens of steps in a row, and sending from inside
        // each of them turned one hiccup into a burst of packets that flooded
        // every client at once.
        const pm = peerManagerRef.current;
        if (isSingleplayer || !pm || pm.connections.size === 0) {
          netAccumulator = 0;
          return;
        }
        const interval = netSnapshotInterval(pm.connections.size);
        if (netAccumulator < interval) return;
        // Keep the remainder, so the average rate stays what it should be
        // instead of drifting below it by up to a step every time.
        netAccumulator %= interval;
        // Encoded once and handed to every peer: the work of building the
        // packet does not grow with the size of the room.
        pm.broadcastState({
          type: 'STATE',
          snapshot: encoderRef.current.encode(engine.getSnapshot(), performance.now()),
        });
      },
      render: () => {
        // The canvas owns its own render loop and pulls state directly.
        profiler.stepsLastFrame = loop.lastStepCount;
      },
    });

    gameLoopRef.current?.stop();
    gameLoopRef.current = loop;
    loop.start();
    profiler.clockSource = loop.survivesBackground ? 'worker' : 'timer';
  };

  // Send local input
  const handleSendInput = useCallback((input: BrawlPlayerInput) => {
    const server = serverRef.current;
    if (server) {
      const seq = ++inputSeqRef.current;
      predictorRef.current.onLocalInput(seq, input.moveX, input.moveY, performance.now());
      server.sendInput(seq, input);
      return;
    }
    if (isHost || isSingleplayer) {
      // The host's own body is simulated right here, so there is nothing to
      // predict and nothing to wait for.
      engineRef.current?.setPlayerInput(myPlayerIdRef.current, input);
    } else {
      const seq = ++inputSeqRef.current;
      predictorRef.current.onLocalInput(seq, input.moveX, input.moveY, performance.now());
      peerManagerRef.current?.sendToHost({
        type: 'INPUT',
        input,
        seq,
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
    if (serverRef.current) {
      serverRef.current.addBot();
      return;
    }
    const chosenBrawler = BRAWLER_IDS[players.length % BRAWLER_IDS.length];
    const botNum = players.filter(p => p.isBot).length + 1;

    peerManagerRef.current?.addBot(`Bot-${botNum}`, chosenBrawler);
  };

  // Remove Player/Bot
  const handleRemovePlayer = (id: string) => {
    serverRef.current?.remove(id);
    peerManagerRef.current?.removePlayer(id);
  };

  // Restart match after game over
  const handleRestartMatch = () => {
    if (serverRef.current) {
      serverRef.current.restart();
      return;
    }
    if (!isHost) return;
    // Clients that went back to the room while the host was still looking at
    // the results are brought back in by the start signal, so a rematch does
    // not leave anybody behind.
    peerManagerRef.current?.broadcast({ type: 'START_MATCH', mode: gameMode });
    startEngineMatch(players, gameMode);
  };

  /** A client entering a round: fresh geometry cache, fresh interpolation. */
  const beginClientMatch = () => {
    decoderRef.current.reset();
    interpolatorRef.current.clear();
    predictorRef.current.reset();
    lastClientPhaseRef.current = '';
    lastClientHudRef.current = 0;
    inGameRef.current = true;
    // Feeds the canvas straight from the interpolator, so it draws the
    // newest packet the moment it arrives rather than the next React render.
    snapshotSourceRef.current = () => interpolatorRef.current.sample(performance.now());
  };

  /**
   * Ends the round and returns to the room, leaving the room itself alone.
   *
   * The old "back to lobby" was `handleLeaveGame`, which destroys the peer: the
   * host fell to the create-a-room page holding a stale code, and everybody
   * else was dropped with a connection error. That is what "the lobby breaks
   * after a match" was.
   */
  const stopMatchKeepRoom = () => {
    gameLoopRef.current?.stop();
    gameLoopRef.current = null;
    engineRef.current = null;
    snapshotSourceRef.current = undefined;
    inGameRef.current = false;
    interpolatorRef.current.clear();
    setIsInGame(false);
    setSnapshot(null);
  };

  // Back to the room after a match. The host takes everybody with it; a
  // client goes back on its own and is brought in again by the next start.
  const handleReturnToLobby = () => {
    const server = serverRef.current;
    if (server) {
      // The owner ends the round for the room and the server tells everybody,
      // them included. Anyone else just steps back to the room on their own.
      if (isHost) server.returnToLobby();
      else stopMatchKeepRoom();
      return;
    }
    const pm = peerManagerRef.current;
    if (!pm || isSingleplayer) {
      handleLeaveGame();
      return;
    }
    if (isHost) pm.returnToLobby();
    stopMatchKeepRoom();
  };

  // Leave Game: the room goes too.
  const handleLeaveGame = () => {
    serverRef.current?.destroy();
    serverRef.current = null;
    joinedRef.current = false;
    setPing(null);
    gameLoopRef.current?.stop();
    gameLoopRef.current = null;
    snapshotSourceRef.current = undefined;
    peerManagerRef.current?.destroy();
    peerManagerRef.current = null;
    engineRef.current = null;
    inGameRef.current = false;
    matchCountRef.current = 0;
    encoderRef.current.reset();
    decoderRef.current.reset();
    interpolatorRef.current.clear();
    setIsInGame(false);
    setIsInRoom(false);
    setSnapshot(null);
    // The room is gone, so its roster must go with it, or a dead player list
    // is left on screen. A host's code goes too — it names a room that no
    // longer exists — but a client keeps what it typed, to try again.
    setPlayers([]);
    if (isHost) setRoomCode('');
    setIsHost(false);
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
          setGameMode={handleSetGameMode}
          roomCode={roomCode}
          setRoomCode={setRoomCode}
          isInRoom={isInRoom}
          isHost={isHost}
          players={players}
          onHostGame={handleHostGame}
          usesServer={serverUrl !== null}
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
            predictor={isSingleplayer || (isHost && !serverRef.current) ? null : predictorRef.current}
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
            ping={ping}
          />

          {snapshot?.phase === 'match_end' && (
            <StarPlayerModal
              snapshot={snapshot}
              myPlayerId={myPlayerId}
              isHost={isHost}
              onRestartMatch={handleRestartMatch}
              onReturnToLobby={handleReturnToLobby}
            />
          )}
        </div>
      )}
    </main>
  );
};

export default App;
