import React, { useState, useEffect, useRef } from 'react';
import { toast, type Toast } from 'react-hot-toast';
import yaml from 'js-yaml';
import type { Wall } from '../../../shared';

interface WallClipboardToastProps {
    walls: Wall[];
    t: Toast;
    onClose: () => void;
    onSave?: (walls: Wall[]) => void;
}

export const WallClipboardToast: React.FC<WallClipboardToastProps> = ({ walls, t, onClose, onSave }) => {
    const formatWall = (w: Wall) => `  - start: {x: ${Math.round(w.start.x)}, y: ${Math.round(w.start.y)}}
    end: {x: ${Math.round(w.end.x)}, y: ${Math.round(w.end.y)}}`;

    // Format initial walls
    const initialText = walls.map(formatWall).join('\n');
    const [editedText, setEditedText] = useState(initialText);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const prevWallsCount = useRef(walls.length);

    // Sync when new walls are added externally (clicks on map)
    useEffect(() => {
        if (walls.length > prevWallsCount.current) {
            const newWalls = walls.slice(prevWallsCount.current);
            const appendText = newWalls.map(formatWall).join('\n');
            setEditedText(prev => prev ? (prev + '\n' + appendText) : appendText);
        }
        prevWallsCount.current = walls.length;
    }, [walls]);

    const handleSave = () => {
        if (!onSave) return;
        try {
            const parsed = yaml.load(editedText) as Array<{ start?: { x?: unknown; y?: unknown }; end?: { x?: unknown; y?: unknown } }>;
            if (!Array.isArray(parsed)) {
                throw new Error("Invalid format: Must be a list starting with '-'");
            }

            const validatedWalls: Wall[] = parsed.map((item, index) => {
                const sx = Number(item.start?.x);
                const sy = Number(item.start?.y);
                const ex = Number(item.end?.x);
                const ey = Number(item.end?.y);

                if (isNaN(sx) || isNaN(sy) || isNaN(ex) || isNaN(ey)) {
                    throw new Error(`Wall at index ${index} is missing or has invalid coordinates`);
                }

                return {
                    start: { x: sx, y: sy },
                    end: { x: ex, y: ey }
                };
            });

            onSave(validatedWalls);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            toast.error(`YAML Error: ${message}`, { id: 'yaml-error' });
        }
    };

    return (
        <div
            className="bg-zinc-800 border border-zinc-600 rounded-lg p-4 shadow-xl text-white max-w-sm w-full pointer-events-auto relative font-sans"
            style={{
                opacity: t.visible ? 1 : 0,
                transform: t.visible ? 'translateY(0)' : 'translateY(-20px)',
                transition: 'all 0.3s ease-in-out'
            }}
        >
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
            <h3 className="font-bold text-yellow-400 mb-2 text-sm uppercase tracking-wider">Generated Walls (Editable)</h3>
            <textarea
                ref={textAreaRef}
                className="w-full bg-black/50 text-xs font-mono p-2 rounded h-40 border border-zinc-700 resize-none focus:outline-none focus:border-yellow-500/50"
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                spellCheck={false}
            />
            <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                <span>{walls.length} walls added</span>
                <span className="italic cursor-pointer hover:text-white transition-colors" onClick={() => {
                    textAreaRef.current?.select();
                }}>Edit YAML above before saving</span>
            </div>
            {onSave && (
                <button
                    className="mt-3 w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-1 px-2 rounded transition-colors text-sm"
                    onClick={handleSave}
                >
                    Save to Map
                </button>
            )}
        </div>
    );
};
