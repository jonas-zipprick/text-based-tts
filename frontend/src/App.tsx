import React, { useState } from 'react';
import { useCampaign } from './hooks/useCampaign';
import { GameBoard } from './components/GameBoard';

function App() {
  const { campaign, loading, error, socket } = useCampaign();
  const [isGM, setIsGM] = useState(false);
  const [sessionId, setSessionId] = useState("239981"); // Default to player 1
  const [stageScale, setStageScale] = useState<number>(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  if (loading) { console.log("App: Loading..."); return <div className="text-white p-4">Loading campaign...</div>; }
  if (error) { console.log("App: Error", error); return <div className="text-red-500 p-4">Error: {error}</div>; }
  if (!campaign) { console.log("App: No Campaign"); return <div className="text-white p-4">No campaign data.</div>; }

  const handleTokenMove = (tokenId: number, position: { map: number, x: number, y: number }) => {
    if (socket) {
      socket.emit('token-move', { tokenId, position });
    }
  };

  return (
    <div className="w-screen h-screen bg-black flex flex-col">
      <div className="absolute top-0 right-0 z-50 p-2 bg-gray-800 text-white rounded flex gap-4">
        <label>
          <input type="checkbox" checked={isGM} onChange={e => setIsGM(e.target.checked)} />
          GM Mode
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
        isGM={isGM}
        sessionId={sessionId}
        stageScale={stageScale}
        setStageScale={setStageScale}
        stagePos={stagePos}
        setStagePos={setStagePos}
      />
    </div>
  );
}

export default App;
