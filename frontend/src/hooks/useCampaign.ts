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
        // socket is already initialized in state, we don't need to call setSocket(newSocket) 
        // if we just use it for the listeners here and then clean up.
        // Actually, we DO need it in state for return, but calling it synchronously 
        // in effect is what ESLint complains about. We can wrap it in a microtask 
        // or just accept it's for external synchronization. 
        // A better way is to set it and then use it.

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSocket(newSocket);

        newSocket.on('campaign-update', (updatedCampaign: Campaign) => {
            if (!updatedCampaign || !updatedCampaign.maps || updatedCampaign.maps.length === 0) {
                console.warn("Received empty/invalid campaign update, ignoring.", updatedCampaign);
                return;
            }
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
