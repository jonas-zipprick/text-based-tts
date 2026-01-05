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

export type TokenAction = {
    name: string;
    description?: string;
    modifiers?: {
        attack?: number;
    };
    reach?: number;
    range?: number;
    targets?: number;
    hit?: string;
    type?: string;
    extraDamage?: {
        hit: string;
        type: string;
    }[];
};

export type TokenTrait = {
    name: string;
    description: string;
};

export type TokenStats = {
    ac: number;
    acType?: string; // e.g., "natural armor"
    hp: number;
    hpFormula?: string; // e.g., "17d20 + 85"
    speed: number;
    attributes: Record<string, number>;
    savingThrows?: Record<string, number>;
    skills?: Record<string, number>;
    damageResistances?: string[];
    damageVulnerabilities?: string[];
    damageImmunities?: string[];
    conditionImmunities?: string[];
    senses?: string;
    languages?: string;
    challenge?: number;
    xp?: number;
    traits?: TokenTrait[];
    actions?: TokenAction[];
    legendaryActions?: TokenAction[];
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
    description?: string; // e.g., "Gargantuan construct, unaligned"
    size?: string; // e.g., "Gargantuan"
    type?: string; // e.g., "construct"
    alignment?: string; // e.g., "unaligned"
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
    version: number; // In-memory version counter for change tracking
};

export type GameState = {
    campaign: Campaign;
    activeMapId: number;
};

export type RollEvent = {
    tokenName: string;
    actionName: string;
    attack: {
        total: number;
        d20: number;
        mod: number;
        sign: string;
        type: 'normal' | 'crit' | 'fail';
    };
    damage?: {
        total: number;
        type?: string;
        formula?: string;
        resultText?: string;
    }[];
};
