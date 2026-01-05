import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Campaign } from '../../../shared';

export function useCampaign() {
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Initial fetch
        fetch('http://localhost:3000/api/campaign')
            .then(res => res.json())
            .then(data => {
                setCampaign(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch campaign", err);
                setError(err.message);
                setLoading(false);
            });

        // Socket connection
        const newSocket = io('http://localhost:3000');
        setSocket(newSocket);

        newSocket.on('campaign-update', (updatedCampaign: Campaign) => {
            // console.log('Received campaign update', updatedCampaign);
            setCampaign(updatedCampaign);
            setLoading(false);
        });

        return () => {
            newSocket.disconnect();
        };
    }, []);

    return { campaign, loading, error, socket };
}
