import React from 'react';
import { toast } from 'react-hot-toast';
import type { Wall } from '../../../shared';

interface WallClipboardToastProps {
    walls: Wall[];
    t: any; // Toast object provided by react-hot-toast
    onClose: () => void;
}

export const WallClipboardToast: React.FC<WallClipboardToastProps> = ({ walls, t, onClose }) => {
    // Format walls into the requested YAML-like syntax
    const text = walls.map(w =>
        `  - start: {x: ${Math.round(w.start.x)}, y: ${Math.round(w.start.y)}}
    end: {x: ${Math.round(w.end.x)}, y: ${Math.round(w.end.y)}}`
    ).join('\n');

    return (
        <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-4 shadow-xl text-white max-w-sm w-full pointer-events-auto relative font-sans">
            <button
                className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors text-lg line-height-none"
                onClick={() => {
                    onClose();
                    toast.dismiss(t.id);
                }}
                title="Close"
            >
                ✕
            </button>
            <h3 className="font-bold text-yellow-400 mb-2 text-sm uppercase tracking-wider">Generated Walls</h3>
            <textarea
                className="w-full bg-black/50 text-xs font-mono p-2 rounded h-40 border border-zinc-700 resize-none focus:outline-none focus:border-yellow-500/50"
                readOnly
                value={text}
                onClick={e => (e.target as HTMLTextAreaElement).select()}
            />
            <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                <span>{walls.length} walls added</span>
                <span className="italic">Click text to select all</span>
            </div>
        </div>
    );
};
