import { useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Circle, Image as KonvaImage, Group, Line, Text } from 'react-konva';
import { toast } from 'react-hot-toast';
import { WallClipboardToast } from './WallClipboardToast';
import { LightClipboardToast } from './LightClipboardToast';
import useImage from 'use-image';
import type { Campaign, Token, Point, Wall, Light } from '../../../shared';
import type { GameView } from '../types/types';
import { calculateVisibilityPolygon, isPointInPolygon, intersectPolygons } from '../utils/lighting';

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
    onAddWalls: (mapId: number, walls: Wall[]) => void;
    onAddLights: (mapId: number, lights: Light[]) => void;
    onRemoveWall: (mapId: number, wall: Wall) => void;
    onRemoveLight: (mapId: number, light: Light) => void;
    onAddToken: (blueprintId: number, mapId: number, x: number, y: number) => void;
    onRemoveToken: (tokenId: number) => void;
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
                x={-gridSize / 2}
                y={gridSize / 2 + radius + 2}
                width={gridSize * 2}
                align="center"
                fill="white"
                fontSize={12}
                shadowColor="black"
                shadowBlur={2}
                shadowOffset={{ x: 1, y: 1 }}
                shadowOpacity={1}
                listening={false}
                wrap="word"
            />
        </Group >
    );
};

type EditorTool = 'select' | 'wall' | 'light' | 'trash' | 'npc';

export const GameBoard = (props: GameBoardProps) => {
    const {
        campaign, onTokenMove, onTokenDoubleClick, view, isDaytime, sessionId,
        activeMapId, stageScale, setStageScale, stagePos, setStagePos,
        onAddWalls, onAddLights, onRemoveWall, onRemoveLight, onAddToken, onRemoveToken
    } = props;

    const activeMap = campaign.maps.find(m => m.id === activeMapId);
    if (!activeMap) return <div className="text-white p-4">Map not found.</div>;

    const gridSize = activeMap.grid.cellSize;
    const isGM = view === 'dm' || view === 'editor';
    const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    // Map Editor State
    const [activeTool, setActiveTool] = useState<EditorTool>('select');
    const [wallBuilderStart, setWallBuilderStart] = useState<{ x: number, y: number } | null>(null);
    const [wallBuilderWalls, setWallBuilderWalls] = useState<Wall[]>([]);
    const [lightBuilderLights, setLightBuilderLights] = useState<Light[]>([]);

    // NPC Search State
    const [npcSearch, setNpcSearch] = useState('');
    const [selectedBlueprint, setSelectedBlueprint] = useState<Token | null>(null);

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

    // Reset explored areas and wall builder when switching maps
    useEffect(() => {
        setExploredPolys([]);
        setWallBuilderWalls([]);
        setWallBuilderStart(null);
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

    const getDistanceToSegment = (p: Point, s: Point, e: Point) => {
        const l2 = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
        if (l2 === 0) return Math.sqrt((p.x - s.x) ** 2 + (p.y - s.y) ** 2);
        let t = ((p.x - s.x) * (e.x - s.x) + (p.y - s.y) * (e.y - s.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const proj = {
            x: s.x + t * (e.x - s.x),
            y: s.y + t * (e.y - s.y)
        };
        return Math.sqrt((p.x - proj.x) ** 2 + (p.y - proj.y) ** 2);
    };

    const handleStageClick = (e: any) => {
        if (!isGM || activeTool === 'select') return;
        const stage = e.target.getStage();
        if (stage.isDragging()) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const pixelX = (pointer.x - stagePos.x) / stageScale;
        const pixelY = (pointer.y - stagePos.y) / stageScale;
        const gridX = Math.round(pixelX / gridSize);
        const gridY = Math.round(pixelY / gridSize);
        const clickPoint = { x: Math.round(pixelX), y: Math.round(pixelY) };

        if (activeTool === 'wall') {
            // ... (existing wall logic)
            if (!wallBuilderStart) {
                setWallBuilderStart(clickPoint);
                toast('Click endpoint to finish wall', { id: 'wall-hint', duration: 2000, icon: '✏️' });
            } else {
                const newWall: Wall = { start: wallBuilderStart, end: clickPoint };
                const updatedWalls = [...wallBuilderWalls, newWall];
                setWallBuilderWalls(updatedWalls);
                setWallBuilderStart(null);

                toast.custom((t) => (
                    <WallClipboardToast
                        walls={updatedWalls}
                        t={t}
                        onClose={() => setWallBuilderWalls([])}
                        onSave={(editedWalls) => {
                            onAddWalls(activeMapId, editedWalls);
                            setWallBuilderWalls([]);
                            toast.success("Walls saved!");
                            toast.dismiss(t.id);
                        }}
                    />
                ), {
                    id: 'wall-builder',
                    duration: Infinity
                });
            }
        } else if (activeTool === 'light') {
            // ... (existing light logic)
            const newLight: Light = { x: gridX, y: gridY, radius: 6, color: '#f1c40f' }; // Reverted to original defaults
            const updatedLights = [...lightBuilderLights, newLight];
            setLightBuilderLights(updatedLights);

            toast.custom((t) => (
                <LightClipboardToast
                    lights={updatedLights}
                    t={t}
                    onClose={() => setLightBuilderLights([])}
                    onSave={(editedLights) => {
                        onAddLights(activeMapId, editedLights);
                        setLightBuilderLights([]);
                        toast.success("Lights saved!");
                        toast.dismiss(t.id);
                    }}
                />
            ), {
                id: 'light-builder',
                duration: Infinity
            });
        } else if (activeTool === 'trash') {
            // New logic: check for tokens first
            const hitToken = campaign.tokens.find(t => {
                if (!t.position) return false;
                const pos = t.position.find(p => p.map === activeMapId);
                if (!pos) return false;
                const centerX = pos.x * gridSize + gridSize / 2;
                const centerY = pos.y * gridSize + gridSize / 2;
                const dist = Math.sqrt((clickPoint.x - centerX) ** 2 + (clickPoint.y - centerY) ** 2);
                return dist < gridSize / 2;
            });

            if (hitToken) {
                onRemoveToken(hitToken.id);
                return;
            }

            // Fallback: check lights and walls (Map Editor only)
            if (view === 'editor') {
                const hitLight = activeMap.lights?.find(l => {
                    const centerX = l.x * gridSize + gridSize / 2;
                    const centerY = l.y * gridSize + gridSize / 2;
                    const dist = Math.sqrt((clickPoint.x - centerX) ** 2 + (clickPoint.y - centerY) ** 2);
                    return dist < 20;
                });

                if (hitLight) {
                    onRemoveLight(activeMapId, hitLight);
                    return;
                }

                const wallScaler = activeMap.wallUnit === 'pixel' ? 1 : gridSize;
                const hitWall = activeMap.walls?.find(w => {
                    const start = { x: w.start.x * wallScaler, y: w.start.y * wallScaler };
                    const end = { x: w.end.x * wallScaler, y: w.end.y * wallScaler };
                    const dist = getDistanceToSegment(clickPoint, start, end);
                    return dist < 15;
                });

                if (hitWall) {
                    onRemoveWall(activeMapId, hitWall);
                }
            }
        } else if (activeTool === 'npc' && selectedBlueprint) {
            onAddToken(selectedBlueprint.id, activeMapId, gridX, gridY);
        }
    };

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <Stage
                width={size.width}
                height={size.height}
                draggable
                onClick={handleStageClick}
                onTap={handleStageClick}
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

                {/* Editor Walls Layer */}
                {view === 'editor' && (
                    <Layer>
                        {(activeMap.walls || []).map((wall, i) => {
                            const wallScaler = activeMap.wallUnit === 'pixel' ? 1 : gridSize;
                            const points = [
                                wall.start.x * wallScaler,
                                wall.start.y * wallScaler,
                                wall.end.x * wallScaler,
                                wall.end.y * wallScaler
                            ];
                            return (
                                <Group key={`wall-${i}`}>
                                    {/* Base black line */}
                                    <Line
                                        points={points}
                                        stroke="black"
                                        strokeWidth={6}
                                        lineCap="round"
                                        opacity={0.8}
                                        listening={false}
                                    />
                                    {/* Dashed yellow line */}
                                    <Line
                                        points={points}
                                        stroke="#f1c40f"
                                        strokeWidth={4}
                                        dash={[12, 12]}
                                        lineCap="round"
                                        listening={false}
                                    />
                                </Group>
                            );
                        })}

                        {/* Editor Lights */}
                        {(activeMap.lights || []).map((light, i) => (
                            <Group
                                key={`light-${i}`}
                                x={light.x * gridSize + gridSize / 2}
                                y={light.y * gridSize + gridSize / 2}
                            >
                                {/* Range Circle */}
                                <Circle
                                    radius={light.radius * gridSize}
                                    stroke={light.color || "#f1c40f"}
                                    strokeWidth={3}
                                    dash={[10, 10]}
                                    opacity={0.8}
                                    listening={false}
                                />
                                {/* Icon Background */}
                                <Circle
                                    radius={gridSize / 3}
                                    fill="rgba(0,0,0,0.7)"
                                    stroke="white"
                                    strokeWidth={1}
                                    listening={false}
                                />
                                {/* Light Bulb Icon */}
                                <Text
                                    text="💡"
                                    fontSize={gridSize * 0.5}
                                    x={-gridSize / 2}
                                    y={-gridSize / 4}
                                    width={gridSize}
                                    align="center"
                                    shadowColor="black"
                                    shadowBlur={5}
                                    listening={false}
                                />
                            </Group>
                        ))}

                        {/* Wall Builder Feedback */}
                        {wallBuilderStart && (
                            <Group>
                                <Circle
                                    x={wallBuilderStart.x}
                                    y={wallBuilderStart.y}
                                    radius={4}
                                    fill="#e74c3c"
                                    stroke="white"
                                    strokeWidth={1}
                                    listening={false}
                                />
                                {mousePos && (
                                    <Line
                                        points={[
                                            wallBuilderStart.x,
                                            wallBuilderStart.y,
                                            mousePos.x,
                                            mousePos.y
                                        ]}
                                        stroke="#e74c3c"
                                        strokeWidth={2}
                                        dash={[5, 5]}
                                        listening={false}
                                    />
                                )}
                            </Group>
                        )}
                    </Layer>
                )}

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

            {/* Editor Toolbar */}
            {isGM && (
                <div style={{
                    position: 'absolute',
                    top: '60px',
                    right: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    zIndex: 1000
                }}>
                    <button
                        onClick={() => setActiveTool('select')}
                        className={`p-2 rounded border border-zinc-600 transition-colors ${activeTool === 'select' ? 'bg-yellow-600 text-white shadow-[0_0_10px_rgba(202,138,4,0.5)]' : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'}`}
                        title="Selection Tool"
                    >
                        🖱️
                    </button>
                    {view === 'editor' && (
                        <>
                            <button
                                onClick={() => {
                                    setActiveTool('wall');
                                    setWallBuilderStart(null);
                                }}
                                className={`p-2 rounded border border-zinc-600 transition-colors ${activeTool === 'wall' ? 'bg-yellow-600 text-white shadow-[0_0_10px_rgba(202,138,4,0.5)]' : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'}`}
                                title="Wall Builder"
                            >
                                🧱
                            </button>
                            <button
                                onClick={() => setActiveTool('light')}
                                className={`p-2 rounded border border-zinc-600 transition-colors ${activeTool === 'light' ? 'bg-yellow-600 text-white shadow-[0_0_10px_rgba(202,138,4,0.5)]' : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'}`}
                                title="Light Tool"
                            >
                                💡
                            </button>
                        </>
                    )}
                    <button
                        className={`p-2 rounded border border-zinc-600 transition-colors ${activeTool === 'trash' ? 'bg-red-600 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'}`}
                        onClick={() => setActiveTool('trash')}
                        title="Trash Tool"
                    >
                        🗑️
                    </button>
                    <button
                        onClick={() => {
                            setActiveTool('npc');
                            setNpcSearch('');
                            setSelectedBlueprint(null);
                        }}
                        className={`p-2 rounded border border-zinc-600 transition-colors ${activeTool === 'npc' ? 'bg-yellow-600 text-white shadow-[0_0_10px_rgba(202,138,4,0.5)]' : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'}`}
                        title="Add NPC Tool"
                    >
                        👥
                    </button>
                </div>
            )}

            {/* NPC Search Bar */}
            {isGM && activeTool === 'npc' && (
                <div style={{
                    position: 'absolute',
                    top: '60px',
                    right: '50px',
                    width: '300px',
                    backgroundColor: '#18181b', // zinc-900
                    border: '1px solid #3f3f46', // zinc-700
                    borderRadius: '8px',
                    padding: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                    zIndex: 1001,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    <input
                        type="text"
                        placeholder="Search NPC..."
                        value={npcSearch}
                        onChange={(e) => setNpcSearch(e.target.value)}
                        autoFocus
                        style={{
                            backgroundColor: '#09090b', // zinc-950
                            border: '1px solid #52525b', // zinc-600
                            borderRadius: '4px',
                            color: 'white',
                            padding: '4px 8px',
                            fontSize: '14px',
                            width: '100%'
                        }}
                    />
                    <div style={{
                        maxHeight: '400px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                    }}>
                        {Array.from(new Map(
                            campaign.tokens
                                .filter(t => t.name.toLowerCase().includes(npcSearch.toLowerCase()))
                                .map(t => [t.name, t])
                        ).values())
                            .slice(0, 50)
                            .map(blueprint => (
                                <button
                                    key={blueprint.id}
                                    onClick={() => setSelectedBlueprint(blueprint)}
                                    style={{
                                        textAlign: 'left',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '13px',
                                        transition: 'background-color 0.2s',
                                        backgroundColor: selectedBlueprint?.id === blueprint.id ? '#ca8a04' : 'transparent', // yellow-600
                                        color: selectedBlueprint?.id === blueprint.id ? 'white' : '#d4d4d8', // zinc-300
                                        border: 'none',
                                        cursor: 'pointer'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (selectedBlueprint?.id !== blueprint.id) {
                                            e.currentTarget.style.backgroundColor = '#27272a'; // zinc-800
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (selectedBlueprint?.id !== blueprint.id) {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }
                                    }}
                                >
                                    {blueprint.name}
                                </button>
                            ))}
                    </div>
                </div>
            )}

            {/* Coordinate Overlay */}
            {mousePos && (
                <div style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
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
