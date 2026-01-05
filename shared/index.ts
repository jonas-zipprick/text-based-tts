export type Point = {
    x: number;
    y: number;
};

export type Wall = {
    start: Point;
    end: Point;
};

export type Light = {
    x: number;
    y: number;
    radius: number;
    color: string;
};

export type MapData = {
    id: number;
    name: string;
    grid: {
        width: number;
        height: number;
        cellSize: number;
    };
    background?: {
        picture: string;
        size: string;
    }[];
    walls: Wall[];
    wallUnit?: 'cell' | 'pixel';
    lights: Light[];
};

export type TokenStats = {
    ac: number;
    hp: number;
    speed: number;
    attributes: Record<string, number>;
    actions?: any[];
};

export type TokenVisibility = {
    night_vision: boolean;
    view_distance?: number;
    emit_light?: {
        enabled: boolean;
        radius: number;
        color: string;
    };
};

export type Token = {
    id: number;
    name: string;
    picture: string;
    controlled_by: { sessionId: string }[];
    position?: {
        map: number;
        x: number;
        y: number;
    }[];
    visibility: TokenVisibility;
    stats: TokenStats;
    currentHp?: number;
};

export type Campaign = {
    name: string;
    activeMapId: number;
    maps: MapData[];
    tokens: Token[];
};

export type GameState = {
    campaign: Campaign;
    activeMapId: number;
};
