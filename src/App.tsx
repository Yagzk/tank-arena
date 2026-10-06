import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TankColor, PlayerInfo, GameStateSnapshot, PlayerInput } from './types/game';
import { GameEngine, SoundEvent } from './game/gameEngine';
import { PeerManager } from './network/peerManager';
import { soundManager } from './audio/soundManager';
import { Lobby } from './components/Lobby';
import { GameCanvas } from './components/GameCanvas';
import { GameHUD } from './components/GameHUD';
import { VictoryModal } from './components/VictoryModal';
import { HelpModal } from './components/HelpModal';

export const App: React.FC = () => {
  // Player state
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('tk_player_name') || `Komutan-${Math.floor(100 + Math.random() * 900)}`;
  });
  const [playerColor, setPlayerColor] = useState<TankColor>('cyan');
  const [roomCode, setRoomCode] = useState<string>('');

  // Game & Room state
  const [isInRoom, setIsInRoom] = useState<boolean>(false);
  const [isInGame, setIsInGame] = useState<boolean>(false);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isSingleplayer, setIsSingleplayer] = useState<boolean>(false);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [targetScore, setTargetScore] = useState<number>(5);

  // Snapshot for rendering
  const [snapshot, setSnapshot] = useState<GameStateSnapshot | null>(null);

  // Modals
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Engine & Network references
  const engineRef = useRef<GameEngine | null>(null);
  const peerManagerRef = useRef<PeerManager | null>(null);
  const myPlayerIdRef = useRef<string>('');
  const lastTimeRef = useRef<number>(performance.now());
  const loopAnimRef = useRef<number>(0);

  // Save player name
  useEffect(() => {
    localStorage.setItem('tk_player_name', playerName);
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
  const handleSoundEvent = useCallback((event: SoundEvent) => {
    switch (event.type) {
      case 'shoot':
        soundManager.playShoot();
        break;
      case 'ricochet':
        soundManager.playRicochet();
        break;
      case 'explosion':
        soundManager.playExplosion(event.isBig);
        break;
      case 'laser':
        soundManager.playLaser();
        break;
      case 'mine':
        soundManager.playMinePlace();
        break;
      case 'powerup':
        soundManager.playPowerup();
        break;
      case 'shield':
        soundManager.playShieldBreak();
        break;
      case 'victory':
        soundManager.playVictory();
        break;
    }
  }, []);

  // Host Game
  const handleHostGame = () => {
    const code = PeerManager.generateRoomCode();
    setRoomCode(code);
    setIsHost(true);
    setIsSingleplayer(false);
    const hostId = `tk2d-${code.toUpperCase()}`;
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
    pm.hostRoom(code, playerName, playerColor);
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
      onGameStart: score => {
        setTargetScore(score);
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
    pm.joinRoom(roomCode, playerName, playerColor);
  };

  // Start Singleplayer (Instant vs 3 Bots)
  const handleStartSingleplayer = () => {
    setIsHost(true);
    setIsSingleplayer(true);
    setIsInRoom(false);

    const myId = 'local-player';
    setMyPlayerId(myId);
    myPlayerIdRef.current = myId;

    const botColors: TankColor[] = ['red', 'green', 'amber'];
    const botNames = ['Titan-AI', 'Phantom-AI', 'Viper-AI'];

    const gamePlayers: PlayerInfo[] = [
      {
        id: myId,
        name: playerName || 'Komutan',
        color: playerColor,
        isHost: true,
        score: 0,
      },
      ...botNames.map((bName, i) => ({
        id: `bot-${i + 1}`,
        name: bName,
        color: botColors[i],
        isHost: false,
        isBot: true,
        score: 0,
      })),
    ];

    setPlayers(gamePlayers);
    startEngineMatch(gamePlayers, targetScore);
  };

  // Start Match (Host action)
  const handleStartMatch = () => {
    if (!isHost || players.length < 2) return;

    peerManagerRef.current?.broadcast({
      type: 'START_MATCH',
      targetScore,
    });

    startEngineMatch(players, targetScore);
  };

  // Start the engine loop (Host or Singleplayer)
  const startEngineMatch = (currentPlayers: PlayerInfo[], scoreToWin: number) => {
    const engine = new GameEngine();
    engine.onSoundTriggered = event => {
      handleSoundEvent(event);
      if (!isSingleplayer) {
        peerManagerRef.current?.broadcast({
          type: 'SOUND',
          event,
        });
      }
    };

    engine.initMatch(currentPlayers, scoreToWin);
    engineRef.current = engine;
    setIsInGame(true);

    lastTimeRef.current = performance.now();

    // Run Engine Loop
    let lastBroadcast = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      engine.update(dt);
      const currentSnap = engine.getSnapshot();
      setSnapshot(currentSnap);

      // Broadcast state to clients at 45Hz
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
  const handleSendInput = useCallback((input: PlayerInput) => {
    if (isHost || isSingleplayer) {
      engineRef.current?.setPlayerInput(myPlayerIdRef.current, input);
    } else {
      peerManagerRef.current?.sendToHost({
        type: 'INPUT',
        input,
      });
    }
  }, [isHost, isSingleplayer]);

  // Add Bot (Host action)
  const handleAddBot = () => {
    const takenColors = players.map(p => p.color);
    const allColors: TankColor[] = ['cyan', 'red', 'green', 'amber', 'purple'];
    const freeColor = allColors.find(c => !takenColors.includes(c)) || 'amber';
    const botNum = players.filter(p => p.isBot).length + 1;

    peerManagerRef.current?.addBot(`Bot-${botNum}`, freeColor);
  };

  // Remove Player/Bot
  const handleRemovePlayer = (id: string) => {
    peerManagerRef.current?.removePlayer(id);
  };

  // Restart match after game over
  const handleRestartMatch = () => {
    if (isHost) {
      startEngineMatch(players, targetScore);
    }
  };

  // Leave Game / Return to main menu
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
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  return (
    <main className="w-screen h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center overflow-hidden">
      {!isInGame ? (
        <Lobby
          playerName={playerName}
          setPlayerName={setPlayerName}
          playerColor={playerColor}
          setPlayerColor={setPlayerColor}
          roomCode={roomCode}
          setRoomCode={setRoomCode}
          isInRoom={isInRoom}
          isHost={isHost}
          players={players}
          targetScore={targetScore}
          setTargetScore={setTargetScore}
          onHostGame={handleHostGame}
          onJoinGame={handleJoinGame}
          onStartSingleplayer={handleStartSingleplayer}
          onStartMatch={handleStartMatch}
          onAddBot={handleAddBot}
          onRemovePlayer={handleRemovePlayer}
          onLeaveRoom={handleLeaveGame}
          onOpenHelp={() => setIsHelpOpen(true)}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      ) : (
        <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
          <GameCanvas
            snapshot={snapshot}
            myPlayerId={myPlayerId}
            onSendInput={handleSendInput}
            isHost={isHost}
          />

          <GameHUD
            snapshot={snapshot}
            myPlayerId={myPlayerId}
            isHost={isHost}
            onOpenHelp={() => setIsHelpOpen(true)}
            onLeaveGame={handleLeaveGame}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
          />

          {snapshot?.phase === 'match_end' && (
            <VictoryModal
              snapshot={snapshot}
              myPlayerId={myPlayerId}
              isHost={isHost}
              onRestartMatch={handleRestartMatch}
              onReturnToLobby={handleLeaveGame}
            />
          )}
        </div>
      )}

      {/* Help & Controls Modal */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </main>
  );
};

export default App;
