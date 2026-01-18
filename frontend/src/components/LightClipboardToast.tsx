import React, { useState, useEffect, useRef } from 'react';
import { toast, type Toast } from 'react-hot-toast';
import yaml from 'js-yaml';
import type { Light } from '../../../shared';

interface LightClipboardToastProps {
    lights: Light[];
    t: Toast;
    onClose: () => void;
    onSave?: (lights: Light[]) => void;
}

export const LightClipboardToast: React.FC<LightClipboardToastProps> = ({ lights, t, onClose, onSave }) => {
    const formatLight = (l: Light) => `  - x: ${Math.round(l.x)}
    y: ${Math.round(l.y)}
    radius: ${l.radius}
    color: "${l.color}"`;

    // Format initial lights
    const initialText = lights.map(formatLight).join('\n');
    const [editedText, setEditedText] = useState(initialText);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const prevLightsCount = useRef(lights.length);

    // Sync when new lights are added externally (clicks on map)
    useEffect(() => {
        if (lights.length > prevLightsCount.current) {
            const newLights = lights.slice(prevLightsCount.current);
            const appendText = newLights.map(formatLight).join('\n');
            setEditedText(prev => prev ? (prev + '\n' + appendText) : appendText);
        }
        prevLightsCount.current = lights.length;
    }, [lights]);

    const handleSave = () => {
        if (!onSave) return;
        try {
            const parsed = yaml.load(editedText) as Array<{ x: unknown; y: unknown; radius: unknown; color?: string }>;
            if (!Array.isArray(parsed)) {
                throw new Error("Invalid format: Must be a list starting with '-'");
            }

            const validatedLights: Light[] = parsed.map((item, index) => {
                const x = Number(item.x);
                const y = Number(item.y);
                const radius = Number(item.radius);

                if (isNaN(x) || isNaN(y) || isNaN(radius)) {
                    throw new Error(`Light at index ${index} has invalid numeric values`);
                }

                return {
                    x,
                    y,
                    radius,
                    color: item.color || "#f1c40f"
                };
            });

            onSave(validatedLights);
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
            <h3 className="font-bold text-yellow-400 mb-2 text-sm uppercase tracking-wider">Generated Lights (Editable)</h3>
            <textarea
                ref={textAreaRef}
                className="w-full bg-black/50 text-xs font-mono p-2 rounded h-40 border border-zinc-700 resize-none focus:outline-none focus:border-yellow-500/50"
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                spellCheck={false}
            />
            <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                <span>{lights.length} lights added</span>
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
