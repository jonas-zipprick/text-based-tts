import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { CampaignManager } from './campaignManager';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Serve static assets
app.use('/assets', express.static(path.join(__dirname, '../../campaign/assets')));


// Initialize Campaign Manager
const campaignDir = path.join(__dirname, '../../campaign'); // Go up to root/campaign
const campaignManager = new CampaignManager(campaignDir);
const campaign = campaignManager.loadCampaign();

// Watch for changes
campaignManager.watch((updatedCampaign) => {
    io.emit('campaign-update', updatedCampaign);
});

// API Endpoints
app.get('/api/campaign', (req, res) => {
    const currentCampaign = campaignManager.getCampaign();
    res.json(currentCampaign);
});

io.on('connection', (socket) => {
    console.log('a user connected', socket.id);

    // Send initial campaign state
    socket.emit('campaign-update', campaignManager.getCampaign());

    socket.on('token-move', (data: { tokenId: number, position: { map: number, x: number, y: number } }) => {
        // Optimistic update for speed
        const campaign = campaignManager.getCampaign();
        if (campaign) {
            const token = campaign.tokens.find(t => t.id === data.tokenId);
            if (token) {
                if (!token.position) token.position = [];
                const mapPos = token.position.find(p => p.map === data.position.map);
                if (mapPos) {
                    mapPos.x = data.position.x;
                    mapPos.y = data.position.y;
                } else {
                    token.position.push(data.position);
                }
                // Broadcast optimistic update
                io.emit('campaign-update', campaign);

                // Persist to disk (will trigger watcher and another broadcast)
                campaignManager.updateTokenPosition(data.tokenId, data.position.map, data.position.x, data.position.y);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);
    });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
