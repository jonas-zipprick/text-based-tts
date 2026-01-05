import React, { useState, useEffect } from 'react';
import { useCampaign } from './hooks/useCampaign';
import { GameBoard } from './components/GameBoard';
import { CharacterSheet } from './components/CharacterSheet';
import './components/Navbar.css';
import type { GameView } from './types/types';
import type { Token } from '../../shared';

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

  if (loading) { console.log("App: Loading..."); return <div className="text-white p-4">Loading campaign...</div>; }
  if (error) { console.log("App: Error", error); return <div className="text-red-500 p-4">Error: {error}</div>; }
  if (!campaign) { console.log("App: No Campaign"); return <div className="text-white p-4">No campaign data.</div>; }

  const handleTokenMove = (tokenId: number, position: { map: number, x: number, y: number }) => {
    if (socket) {
      socket.emit('token-move', { tokenId, position });
    }
  };

  const handleMapChange = (newMapId: number) => {
    if (socket && newMapId !== campaign.activeMapId) {
      socket.emit('change-map', { newMapId });
    }
  };

  const handleTokenDoubleClick = (token: Token) => {
    setSelectedToken(token);
  };

  const handleTokenStatsUpdate = (tokenId: number, updates: Partial<Token>) => {
    if (socket) {
      socket.emit('token-update-stats', { tokenId, updates });
    }
  };

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
      />
      {selectedToken && (
        <CharacterSheet
          token={selectedToken}
          onClose={() => setSelectedToken(null)}
          onUpdate={handleTokenStatsUpdate}
        />
      )}
    </div>
  );
}

export default App;
