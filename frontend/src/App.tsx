import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCampaign } from './hooks/useCampaign';
import { GameBoard } from './components/GameBoard';
import { CharacterSheet } from './components/CharacterSheet';
import './components/Navbar.css';
import type { GameView } from './types/types';
import type { Token, RollEvent, Wall, Light } from '../../shared';
import { ToastNotification } from './components/ToastNotification';
import { Toaster, toast } from 'react-hot-toast';

function App() {
  const { campaign, loading, error, socket } = useCampaign();

  const [view, setView] = useState<GameView>('player');
  const [isDaytime, setIsDaytime] = useState(true);

  // Persistent Session ID
  const [sessionId, setSessionId] = useState(() => {
    const saved = localStorage.getItem('sessionId');
    if (saved) return saved;
    const generated = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem('sessionId', generated);
    return generated;
  });

  const [stageScale, setStageScale] = useState<number>(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);

  useEffect(() => {
    if (campaign) {
      document.title = `${campaign.name} - TTS`;
    }
  }, [campaign]);

  useEffect(() => {
    localStorage.setItem('sessionId', sessionId);
  }, [sessionId]);

  // Keep selected token in sync with campaign updates
  useEffect(() => {
    if (selectedToken && campaign) {
      const updatedToken = campaign.tokens.find(t => t.id === selectedToken.id);
      if (updatedToken && JSON.stringify(updatedToken) !== JSON.stringify(selectedToken)) {
        setSelectedToken(updatedToken);
      }
    }
  }, [campaign, selectedToken]);

  const handleTokenMove = useCallback((tokenId: number, position: { map: number, x: number, y: number }) => {
    if (socket) {
      socket.emit('token-move', { tokenId, position });
    }
  }, [socket]);

  const handleMapChange = useCallback((newMapId: number) => {
    if (socket && newMapId !== campaign?.activeMapId) {
      socket.emit('change-map', { newMapId });
    }
  }, [socket, campaign?.activeMapId]);

  const handleTokenDoubleClick = useCallback((token: Token) => {
    setSelectedToken(token);
  }, []);

  useEffect(() => {
    if (socket) {
      const onRoll = (data: RollEvent) => {
        toast.custom((t) => <ToastNotification data={data} t={t} />, { duration: 4000 });
      };
      socket.on('roll', onRoll);
      return () => { socket.off('roll', onRoll); };
    }
  }, [socket]);

  const handleRoll = useCallback((data: RollEvent) => {
    if (socket) socket.emit('roll', data);
  }, [socket]);

  const handleTokenStatsUpdate = useCallback((tokenId: number, updates: Partial<Token>) => {
    if (socket) {
      // console.log('App: Emitting token-update-stats', { tokenId, updates });
      socket.emit('token-update-stats', { tokenId, updates });
    }
  }, [socket]);

  const handleAddWalls = useCallback((mapId: number, walls: Wall[]) => {
    if (socket) {
      socket.emit('add-walls', { mapId, walls });
    }
  }, [socket]);

  const handleAddLights = useCallback((mapId: number, lights: Light[]) => {
    if (socket) {
      socket.emit('add-lights', { mapId, lights });
    }
  }, [socket]);

  const hasControlledTokens = useMemo(() => {
    if (!campaign) return false;
    return campaign.tokens.some(t => t.controlled_by?.some(c => c.sessionId === sessionId));
  }, [campaign, sessionId]);

  if (loading) { console.log("App: Loading..."); return <div className="text-white p-4">Loading campaign...</div>; }
  if (error) { console.log("App: Error", error); return <div className="text-red-500 p-4">Error: {error}</div>; }
  if (!campaign) { console.log("App: No Campaign"); return <div className="text-white p-4">No campaign data.</div>; }

  return (
    <div className="w-screen h-screen bg-black flex flex-col">
      <div className="nav-bar">
        <select
          value={campaign.activeMapId}
          onChange={e => handleMapChange(Number(e.target.value))}
          className="nav-select"
        >
          {campaign.maps.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select
          value={view}
          onChange={e => setView(e.target.value as GameView)}
          className="nav-select"
        >
          <option value="player">Player View</option>
          <option value="dm">DM View</option>
          <option value="editor">Map Editor View</option>
        </select>
        <label className="nav-label">
          <input
            type="checkbox"
            checked={isDaytime}
            onChange={e => setIsDaytime(e.target.checked)}
            className="nav-checkbox"
          />
          Daytime
        </label>
        <label className="nav-label">
          <input
            type="text"
            value={sessionId}
            onChange={e => setSessionId(e.target.value)}
            className="nav-input"
            title="Session ID"
          />
          Session ID
        </label>
      </div>
      <GameBoard
        campaign={campaign}
        onTokenMove={handleTokenMove}
        onTokenDoubleClick={handleTokenDoubleClick}
        view={view}
        isDaytime={isDaytime}
        sessionId={sessionId}
        activeMapId={campaign.activeMapId}
        stageScale={stageScale}
        setStageScale={setStageScale}
        stagePos={stagePos}
        setStagePos={setStagePos}
        onAddWalls={handleAddWalls}
        onAddLights={handleAddLights}
      />
      {selectedToken && (
        <CharacterSheet
          token={selectedToken}
          onClose={() => setSelectedToken(null)}
          onUpdate={handleTokenStatsUpdate}
          onRoll={handleRoll}
        />
      )}
      {view === 'player' && !hasControlledTokens && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <div className="bg-zinc-800 border border-zinc-600 p-6 rounded-lg shadow-2xl text-center pointer-events-auto max-w-lg">
            <h2 className="text-xl font-bold text-yellow-400 mb-3">No Assigned Token</h2>
            <p className="text-gray-200 mb-4 text-lg">
              The server admin has to set up a user for you to be able to see anything.
            </p>
            <div className="text-sm text-gray-400 bg-black/30 p-2 rounded inline-block">
              Session ID: <span className="font-mono text-white ml-2">{sessionId}</span>
            </div>
          </div>
        </div>
      )}
      <Toaster position="bottom-right" reverseOrder={false} />
    </div>
  );
}

export default App;
