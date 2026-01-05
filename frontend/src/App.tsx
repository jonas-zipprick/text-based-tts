import React, { useState, useEffect } from 'react';
import { useCampaign } from './hooks/useCampaign';
import { GameBoard } from './components/GameBoard';
import type { GameView } from './types/types';

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

  useEffect(() => {
    if (campaign) {
      document.title = `${campaign.name} - TTS`;
    }
  }, [campaign]);

  useEffect(() => {
    localStorage.setItem('sessionId', sessionId);
  }, [sessionId]);

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

  return (
    <div className="w-screen h-screen bg-black flex flex-col">
      <div className="absolute top-0 right-0 z-50 p-2 bg-gray-800 text-white rounded flex gap-4">
        <select
          value={campaign.activeMapId}
          onChange={e => handleMapChange(Number(e.target.value))}
          className="text-black bg-white px-1 mr-2"
        >
          {campaign.maps.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select
          value={view}
          onChange={e => setView(e.target.value as GameView)}
          className="text-black bg-white px-1"
        >
          <option value="player">Player View</option>
          <option value="dm">DM View</option>
          <option value="editor">Map Editor View</option>
        </select>
        <label>
          <input type="checkbox" checked={isDaytime} onChange={e => setIsDaytime(e.target.checked)} />
          Daytime
        </label>
        <label>
          <input
            type="text"
            value={sessionId}
            onChange={e => setSessionId(e.target.value)}
            className="text-black bg-white px-1 ml-2 w-24"
          />
          Session ID
        </label>
      </div>
      <GameBoard
        campaign={campaign}
        onTokenMove={handleTokenMove}
        view={view}
        isDaytime={isDaytime}
        sessionId={sessionId}
        activeMapId={campaign.activeMapId}
        stageScale={stageScale}
        setStageScale={setStageScale}
        stagePos={stagePos}
        setStagePos={setStagePos}
      />
    </div>
  );
}

export default App;
