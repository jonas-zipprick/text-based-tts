import React, { useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Circle, Image as KonvaImage, Group, Line } from 'react-konva';
import useImage from 'use-image';
import type { Campaign, Token, Point, Wall } from '../../../shared';
import { calculateVisibilityPolygon, isPointInPolygon } from '../utils/lighting';

interface GameBoardProps {
    campaign: Campaign;
    onTokenMove: (tokenId: number, position: { map: number, x: number, y: number }) => void;
    isGM: boolean;
    sessionId: string;
}

const URL_PREFIX = 'http://localhost:3000/assets/';

const BackgroundImage = ({ src, width, height }: { src: string, width: number, height: number }) => {
    const [image] = useImage(src);
    return <KonvaImage image={image} width={width} height={height} />;
};

const TokenComponent = ({ token, gridSize, onMove }: { token: Token, gridSize: number, onMove: (id: number, x: number, y: number) => void }) => {
    const pos = token.position?.[0]; // Default to first position
    if (!pos) return null;

    const imageUrl = token.picture ? `${URL_PREFIX}${token.picture}` : null;
    const [image] = useImage(imageUrl || '');

    const x = pos.x * gridSize;
    const y = pos.y * gridSize;
    const radius = gridSize / 2 * 0.8;

    const handleDragEnd = (e: any) => {
        const newX = Math.round(e.target.x() / gridSize);
        const newY = Math.round(e.target.y() / gridSize);
        onMove(token.id, newX, newY);
        e.target.to({
            x: newX * gridSize + gridSize / 2 - (image ? radius : 0),
            y: newY * gridSize + gridSize / 2 - (image ? radius : 0)
        });
    };

    const kArgs = {
        draggable: true,
        onDragEnd: handleDragEnd,
    };

    if (image) {
        return (
            <KonvaImage
                x={x + gridSize / 2 - radius}
                y={y + gridSize / 2 - radius}
                width={radius * 2}
                height={radius * 2}
                image={image}
                cornerRadius={radius}
                {...kArgs}
                onDragEnd={(e) => {
                    const newX = Math.round((e.target.x() - (gridSize / 2 - radius)) / gridSize);
                    const newY = Math.round((e.target.y() - (gridSize / 2 - radius)) / gridSize);
                    onMove(token.id, newX, newY);
                }}
            />
        );
    }

    return (
        <Circle
            x={x + gridSize / 2}
            y={y + gridSize / 2}
            radius={radius}
            fill="white"
            stroke="black"
            strokeWidth={2}
            {...kArgs}
            onDragEnd={(e) => {
                const newX = Math.round((e.target.x() - gridSize / 2) / gridSize);
                const newY = Math.round((e.target.y() - gridSize / 2) / gridSize);
                onMove(token.id, newX, newY);
            }}
        />
    );
};

export const GameBoard: React.FC<GameBoardProps> = ({ campaign, onTokenMove, isGM, sessionId }) => {
    const activeMap = campaign.maps[0];
    if (!activeMap) return <div>No map found</div>;

    const gridSize = activeMap.grid.cellSize;
    const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    useEffect(() => {
        const handleResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Compute dimensions
    const mapWidth = activeMap.grid.width * gridSize;
    const mapHeight = activeMap.grid.height * gridSize;


    // Compute Visibility
    const visionPolys = useMemo(() => {
        if (isGM) return null;

        const polys: Point[][] = [];
        const wallScaler = activeMap.wallUnit === 'pixel' ? 1 : gridSize;
        const walls: Wall[] = (activeMap.walls || []).map(w => ({
            start: { x: w.start.x * wallScaler, y: w.start.y * wallScaler },
            end: { x: w.end.x * wallScaler, y: w.end.y * wallScaler }
        }));

        // 1. My Tokens (Night Vision) ONLY
        const myTokens = campaign.tokens.filter(t => t.controlled_by.some(c => c.sessionId === sessionId));
        myTokens.forEach(t => {
            if (t.visibility.night_vision) {
                const pos = t.position?.find(p => p.map === activeMap.id);
                if (pos) {
                    const p = { x: pos.x * gridSize + gridSize / 2, y: pos.y * gridSize + gridSize / 2 };
                    const radius = (t.visibility.view_distance || 12) * gridSize;
                    polys.push(calculateVisibilityPolygon(p, walls, radius));
                }
            }
        });

        // REMOVED: Global Lights and Other Token Lights do not reveal FOW automatically.
        // This enforces "I should initially see nothing until I am assigned to a token."

        return polys;
    }, [campaign, isGM, sessionId, activeMap, gridSize]);

    // Persistent Fog Layer Management
    // We need to maintain `exploredPolys`.
    const [exploredPolys, setExploredPolys] = useState<Point[][]>([]);


    // Update Explored Polys
    useEffect(() => {
        if (visionPolys) {
            // Add new vision polygons to explored history
            // Optimization: Union polygons or simplification could go here in future
            setExploredPolys(prev => [...prev, ...visionPolys]);
        }
    }, [visionPolys]);

    const bg = activeMap.background?.[0];
    const bgUrl = bg ? `${URL_PREFIX}${bg.picture}` : null;

    return (
        <div className="w-full h-full bg-gray-900 overflow-hidden">
            <Stage width={size.width} height={size.height} draggable>
                {/* Map Layer */}
                <Layer>
                    {bgUrl ? (
                        <BackgroundImage src={bgUrl} width={mapWidth} height={mapHeight} />
                    ) : (
                        <Rect width={mapWidth} height={mapHeight} fill="#333" />
                    )}
                    {/* Grid */}
                    <Group>
                        {Array.from({ length: activeMap.grid.width + 1 }).map((_, i) => (
                            <Rect key={`v${i}`} x={i * gridSize} y={0} width={1} height={mapHeight} fill="rgba(255,255,255,0.1)" />
                        ))}
                        {Array.from({ length: activeMap.grid.height + 1 }).map((_, i) => (
                            <Rect key={`h${i}`} x={0} y={i * gridSize} width={mapWidth} height={1} fill="rgba(255,255,255,0.1)" />
                        ))}
                    </Group>
                </Layer>

                {/* Shroud Layer - Grey (Memory) */}
                {/* Covers everything EXCEPT current vision. */}
                {!isGM && (
                    <Layer>
                        <Rect width={mapWidth} height={mapHeight} fill="rgba(0, 0, 0, 0.5)" listening={false} />
                        {visionPolys?.map((poly: Point[], i: number) => (
                            <Line
                                key={`v-${i}`}
                                points={poly.flatMap(p => [p.x, p.y])}
                                fill="black"
                                closed
                                globalCompositeOperation="destination-out"
                                listening={false}
                            />
                        ))}
                    </Layer>
                )}

                {/* Tokens Layer */}
                <Layer>
                    {campaign.tokens.map(token => {
                        if (token.position?.some(p => p.map === activeMap.id)) {
                            // Visibility Check
                            let isVisible = true;
                            if (!isGM && visionPolys) {
                                const pos = token.position.find(p => p.map === activeMap.id)!;
                                const center = { x: pos.x * gridSize + gridSize / 2, y: pos.y * gridSize + gridSize / 2 };
                                isVisible = visionPolys.some(poly => isPointInPolygon(center, poly));
                            }

                            if (isVisible || isGM) {
                                return (
                                    <TokenComponent
                                        key={token.id}
                                        token={token}
                                        gridSize={gridSize}
                                        onMove={(id, x, y) => onTokenMove(id, { x, y, map: activeMap.id })}
                                    />
                                );
                            }
                        }
                        return null;
                    })}
                </Layer>

                {/* Fog Layer - Black (Unexplored) */}
                {/* Covers everything EXCEPT explored history. */}
                {!isGM && (
                    <Layer>
                        <Rect width={mapWidth} height={mapHeight} fill="black" listening={false} />
                        {exploredPolys.map((poly: Point[], i: number) => (
                            <Line
                                key={`e-${i}`}
                                points={poly.flatMap(p => [p.x, p.y])}
                                fill="black"
                                closed
                                globalCompositeOperation="destination-out"
                                listening={false}
                            />
                        ))}
                    </Layer>
                )}
            </Stage>
        </div>
    );
};
