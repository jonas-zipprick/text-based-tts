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

    socket.on('token-update-stats', (data: { tokenId: number, updates: Record<string, any> }) => {
        const campaign = campaignManager.getCampaign();
        if (campaign) {
            const token = campaign.tokens.find(t => t.id === data.tokenId);
            if (token) {
                // Apply updates to in-memory token
                Object.assign(token, data.updates);
                if (data.updates.stats) {
                    Object.assign(token.stats, data.updates.stats);
                }

                // Broadcast optimistic update
                io.emit('campaign-update', campaign);

                // Persist to disk
                campaignManager.updateTokenStats(data.tokenId, data.updates);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);
    });

    socket.on('change-map', (data: { newMapId: number }) => {
        const campaign = campaignManager.getCampaign();
        if (campaign) {
            // Persist the active map choice
            campaignManager.setActiveMapId(data.newMapId);

            // Move all player-controlled tokens to the new map
            campaign.tokens.forEach(token => {
                if (token.controlled_by && token.controlled_by.length > 0) {
                    // Find existing position on new map or create one
                    if (!token.position) token.position = [];
                    const existingPos = token.position.find(p => p.map === data.newMapId);
                    if (!existingPos) {
                        // Add a default position on the new map (center-ish)
                        token.position.push({ map: data.newMapId, x: 10, y: 10 });
                    }
                    // Persist the position update
                    const pos = token.position.find(p => p.map === data.newMapId)!;
                    campaignManager.updateTokenPosition(token.id, data.newMapId, pos.x, pos.y);
                }
            });
            // Broadcast the updated campaign is handled by the file watcher in CampaignManager
            // but we can also broadcast it here for immediate response (optimistic)
            io.emit('campaign-update', { ...campaign, activeMapId: data.newMapId });
        }
    });

    socket.on('roll', (data: any) => {
        socket.broadcast.emit('roll', data);
    });

    socket.on('add-walls', (data: { mapId: number, walls: any[] }) => {
        campaignManager.addWalls(data.mapId, data.walls);
    });

    socket.on('add-lights', ({ mapId, lights }) => {
        campaignManager.addLights(mapId, lights);
    });

    socket.on('remove-wall', ({ mapId, wall }) => {
        campaignManager.removeWall(mapId, wall);
    });

    socket.on('remove-light', ({ mapId, light }) => {
        campaignManager.removeLight(mapId, light);
    });

    socket.on('add-token', (data: { blueprintId: number, mapId: number, x: number, y: number }) => {
        const newToken = campaignManager.addToken(data.blueprintId, data.mapId, data.x, data.y);
        if (newToken) {
            // Optimistically update memory and broadcast
            const campaign = campaignManager.getCampaign();
            if (campaign) {
                campaign.tokens.push(newToken);
                io.emit('campaign-update', campaign);
            }
        }
    });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
