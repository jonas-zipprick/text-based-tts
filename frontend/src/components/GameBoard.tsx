import React, { useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Circle, Image as KonvaImage, Group, Line, Text } from 'react-konva';
import useImage from 'use-image';
import type { Campaign, Token, Point, Wall } from '../../../shared';
import type { GameView } from '../types/types';
import { calculateVisibilityPolygon, isPointInPolygon, unionPolygons, intersectPolygons } from '../utils/lighting';

interface GameBoardProps {
    campaign: Campaign;
    onTokenMove: (tokenId: number, position: { x: number, y: number, map: number }) => void;
    onTokenDoubleClick?: (token: Token) => void;
    view: GameView;
    isDaytime: boolean;
    sessionId: string;
    activeMapId: number;
    stageScale: number;
    setStageScale: (scale: number) => void;
    stagePos: { x: number, y: number };
    setStagePos: (pos: { x: number, y: number }) => void;
}

type MouseCoords = {
    x: number;
    y: number;
    gridX?: number; // Made optional
    gridY?: number; // Made optional
    dragStart?: { gridX: number, gridY: number };
    distance?: number;
} | null;

const URL_PREFIX = 'http://localhost:3000/assets/';

const BackgroundImage = ({ src, width, height }: { src: string, width: number, height: number }) => {
    const [image] = useImage(src);
    return <KonvaImage image={image} width={width} height={height} />;
};

const TokenComponent = ({ token, gridSize, onMove, activeMapId, onDragStart, onDragEnd, onDoubleClick }: {
    token: Token,
    gridSize: number,
    onMove: (id: number, x: number, y: number) => void,
    activeMapId: number,
    onDragStart?: (gridX: number, gridY: number) => void,
    onDragEnd?: () => void,
    onDoubleClick?: (token: Token) => void
}) => {
    const pos = token.position?.find(p => p.map === activeMapId);
    if (!pos) return null;

    const imageUrl = token.picture ? `${URL_PREFIX}${token.picture}` : null;
    const [image] = useImage(imageUrl || '');

    const x = pos.x * gridSize;
    const y = pos.y * gridSize;
    const radius = gridSize / 2 * 0.8;

    const [isHovered, setIsHovered] = useState(false);

    const handleDragEndInternal = (e: any) => {
        const newX = Math.round(e.target.x() / gridSize);
        const newY = Math.round(e.target.y() / gridSize);
        onMove(token.id, newX, newY);

        // Snap the group back to grid center
        e.target.to({
            x: newX * gridSize,
            y: newY * gridSize,
            duration: 0.1
        });

        if (onDragEnd) onDragEnd();
    };

    const handleDragStartInternal = (e: any) => {
        if (onDragStart) {
            const gridX = Math.round(e.target.x() / gridSize);
            const gridY = Math.round(e.target.y() / gridSize);
            onDragStart(gridX, gridY);
        }
    };

    const curHp = token.currentHp ?? token.stats.hp;
    const maxHp = token.stats.hp;
    const showHp = (curHp < maxHp) || isHovered;

    return (
        <Group
            x={x}
            y={y}
            draggable
            onDragStart={handleDragStartInternal}
            onDragEnd={handleDragEndInternal}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onDblClick={() => onDoubleClick?.(token)}
        >
            {showHp && (
                <Group x={0} y={-10}>
                    <Rect
                        x={2}
                        y={0}
                        width={gridSize - 4}
                        height={6}
                        fill="#444"
                        cornerRadius={2}
                    />
                    <Rect
                        x={2}
                        y={0}
                        width={(gridSize - 4) * (curHp / maxHp)}
                        height={6}
                        fill="#2ecc71"
                        cornerRadius={2}
                    />
                    <Text
                        text={`${curHp}/${maxHp}`}
                        x={0}
                        y={- 2}
                        width={gridSize}
                        align="center"
                        fill="white"
                        fontSize={8}
                        shadowColor="black"
                        shadowBlur={1}
                        listening={false}
                    />
                </Group >
            )}
            {
                image ? (
                    <KonvaImage
                        x={gridSize / 2 - radius}
                        y={gridSize / 2 - radius}
                        width={radius * 2}
                        height={radius * 2}
                        image={image}
                        cornerRadius={radius}
                    />
                ) : (
                    <Circle
                        x={gridSize / 2}
                        y={gridSize / 2}
                        radius={radius}
                        fill="white"
                        stroke="black"
                        strokeWidth={2}
                    />
                )
            }
            <Text
                text={token.name}
                x={0}
                y={gridSize / 2 + radius + 2}
                width={gridSize}
                align="center"
                fill="white"
                fontSize={12}
                shadowColor="black"
                shadowBlur={2}
                shadowOffset={{ x: 1, y: 1 }}
                shadowOpacity={1}
                listening={false}
            />
        </Group >
    );
};

export const GameBoard = ({ campaign, activeMapId, onTokenMove, onTokenDoubleClick, view, isDaytime, sessionId, stageScale, setStageScale, stagePos, setStagePos }: GameBoardProps) => {
    const activeMap = campaign.maps.find(m => m.id === activeMapId);
    if (!activeMap) return <div className="text-white p-4">Map not found.</div>;

    const gridSize = activeMap.grid.cellSize;
    const isGM = view === 'dm' || view === 'editor';
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

        // 1. Calculate Global Lit Area (Map Lights)
        // Note: For now we only have map lights. If tokens emit light, we'd add them here too.
        // We cast a visibility polygon for each light to account for walls blocking the light.
        const lightPolys: Point[][] = [];
        (activeMap.lights || []).forEach(light => {
            // Light coords might need scaling if map unit is different?
            // Assuming lights are in grid coords because shared/index.ts says x,y.
            // But wait, walls are pixels or cells. Lights likely follow the grid?
            // campaign.yaml says lights x: 20, y: 12. That's grid cells.
            const lightPos = {
                x: light.x * gridSize + gridSize / 2,
                y: light.y * gridSize + gridSize / 2
            };
            const radius = light.radius * gridSize;
            lightPolys.push(calculateVisibilityPolygon(lightPos, walls, radius));
        });

        // Also check if any tokens emit light (future proofing, though not fully implemented in UI yet)
        campaign.tokens.forEach(t => {
            if (t.visibility.emit_light?.enabled && t.position?.some(p => p.map === activeMap.id)) {
                const pos = t.position.find(p => p.map === activeMap.id)!;
                const lightPos = { x: pos.x * gridSize + gridSize / 2, y: pos.y * gridSize + gridSize / 2 };
                const radius = t.visibility.emit_light.radius * gridSize;
                lightPolys.push(calculateVisibilityPolygon(lightPos, walls, radius));
            }
        });

        // 2. Calculate Vision for My Tokens
        const myTokens = campaign.tokens.filter(t => t.controlled_by.some(c => c.sessionId === sessionId));
        myTokens.forEach(t => {
            const pos = t.position?.find(p => p.map === activeMap.id);
            if (pos) {
                const p = { x: pos.x * gridSize + gridSize / 2, y: pos.y * gridSize + gridSize / 2 };
                const radius = (t.visibility.view_distance || 12) * gridSize;
                const losPoly = calculateVisibilityPolygon(p, walls, radius);

                // During daytime, all tokens see as if they have night vision
                if (isDaytime || t.visibility.night_vision) {
                    // Sees everything in LoS
                    polys.push(losPoly);
                } else {
                    // Normal Vision: Sees LoS INTERSECT (Global Lights UNION "Self Light"?)
                    // If the token emits light, it's already in lightPolys.
                    // If it doesn't, it relies on external lights.
                    // So we intersect LoS with the union of all lights.
                    // If no lights exist, result is empty (blind in dark).

                    const visibleParts = intersectPolygons(losPoly, lightPolys);
                    polys.push(...visibleParts);
                }
            }
        });

        return polys;
    }, [campaign, isGM, isDaytime, sessionId, activeMap, gridSize]);

    // Persistent Fog Layer Management
    // We need to maintain `exploredPolys`.
    const [exploredPolys, setExploredPolys] = useState<Point[][]>([]);
    const [mousePos, setMousePos] = useState<MouseCoords>(null);
    const [dragStartPos, setDragStartPos] = useState<{ gridX: number, gridY: number } | null>(null);

    // Reset explored areas when switching maps
    useEffect(() => {
        setExploredPolys([]);
    }, [activeMapId]);


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

    // Internal state moved to props
    // const [stageScale, setStageScale] = useState<number>(1);
    // const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

    const handleWheel = (e: any) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();

        const scaleBy = 1.1;
        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };

        setStageScale(newScale);
        setStagePos(newPos);
    };

    const handleMouseMove = (e: any) => {
        const stage = e.target.getStage();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const pixelX = Math.round((pointer.x - stagePos.x) / stageScale);
        const pixelY = Math.round((pointer.y - stagePos.y) / stageScale);
        const gridX = Math.floor(pixelX / gridSize);
        const gridY = Math.floor(pixelY / gridSize);

        let distance = undefined;
        if (dragStartPos) {
            const dx = Math.abs(gridX - dragStartPos.gridX);
            const dy = Math.abs(gridY - dragStartPos.gridY);
            distance = Math.max(dx, dy) * 5; // 5ft per square, Chebyshev
        }

        setMousePos({
            x: pixelX,
            y: pixelY,
            gridX,
            gridY,
            dragStart: dragStartPos || undefined,
            distance: distance
        });
    };

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <Stage
                width={size.width}
                height={size.height}
                draggable
                onWheel={handleWheel}
                onMouseMove={handleMouseMove}
                onDragMove={handleMouseMove}
                onMouseLeave={() => setMousePos(null)}
                scaleX={stageScale}
                scaleY={stageScale}
                x={stagePos.x}
                y={stagePos.y}
                onDragEnd={(e) => {
                    // Only update if the stage itself was dragged, not a child (token)
                    if (e.target === e.target.getStage()) {
                        setStagePos(e.target.position());
                    }
                }}
            >
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
                            <Rect key={`v${i}`} x={i * gridSize} y={0} width={1} height={mapHeight} fill="rgba(0,0,0,0.25)" />
                        ))}
                        {Array.from({ length: activeMap.grid.height + 1 }).map((_, i) => (
                            <Rect key={`h${i}`} x={0} y={i * gridSize} width={mapWidth} height={1} fill="rgba(0,0,0,0.25)" />
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
                                        activeMapId={activeMap.id}
                                        onDragStart={(gx, gy) => setDragStartPos({ gridX: gx, gridY: gy })}
                                        onDragEnd={() => setDragStartPos(null)}
                                        onDoubleClick={onTokenDoubleClick}
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

            {/* Coordinate Overlay */}
            {mousePos && (
                <div style={{
                    position: 'absolute',
                    bottom: '10px',
                    right: '10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    pointerEvents: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    zIndex: 1000
                }}>
                    {view === 'editor' && <div>Pixel: {mousePos.x}, {mousePos.y}</div>}
                    <div>Grid: {mousePos.gridX}, {mousePos.gridY}</div>
                    {mousePos.dragStart && (
                        <>
                            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', marginTop: '2px', paddingTop: '2px' }}>
                                Start: {mousePos.dragStart.gridX}, {mousePos.dragStart.gridY}
                            </div>
                            <div style={{ color: '#2ecc71', fontWeight: 'bold' }}>
                                Dist: {mousePos.distance} ft
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
