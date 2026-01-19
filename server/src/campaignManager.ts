import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { parseDocument, YAMLMap, YAMLSeq, isCollection } from 'yaml';
import { Campaign, Token, Wall, Light, MapData, Door } from '../../shared';
import chokidar from 'chokidar';

export class CampaignManager {
    private campaignDir: string;
    private currentCampaign: Campaign | null = null;
    private watcher: chokidar.FSWatcher | null = null;
    private tokenSourceMap: Map<number, string> = new Map();
    private mapSourceMap: Map<number, string> = new Map();
    private lastWrittenVersion: number = 0;

    constructor(campaignDir: string) {
        this.campaignDir = campaignDir;
    }

    public loadCampaign(): Campaign {
        const preservedVersion = this.currentCampaign?.version ?? this.lastWrittenVersion;

        const campaign: Campaign = {
            name: 'New Campaign',
            activeMapId: 0,
            maps: [],
            tokens: [],
            version: preservedVersion,
        };
        this.tokenSourceMap.clear();
        this.mapSourceMap.clear();

        const files = this.getAllYamlFiles(this.campaignDir);

        for (const file of files) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const data = yaml.load(content) as Partial<Campaign>;

                if (!data) continue;

                if (data.name) campaign.name = data.name;
                if (data.activeMapId !== undefined) campaign.activeMapId = data.activeMapId;
                if (data.maps) {
                    const newMaps = data.maps as MapData[];
                    campaign.maps.push(...newMaps);
                    newMaps.forEach(m => this.mapSourceMap.set(m.id, file));
                }
                if (data.tokens) {
                    const tokens = (data.tokens as Token[]).map(t => ({
                        ...t,
                        currentHp: t.currentHp !== undefined ? t.currentHp : t.stats.hp
                    }));
                    campaign.tokens.push(...tokens);
                    tokens.forEach(t => this.tokenSourceMap.set(t.id, file));
                }

            } catch (e) {
                console.error(`Error parsing file ${file}:`, e);
            }
        }

        if (campaign.maps.length === 0 && this.currentCampaign && this.currentCampaign.maps.length > 0) {
            campaign.maps = this.currentCampaign.maps;
        }

        if (!this.currentCampaign) {
            this.currentCampaign = campaign;
        }
        return campaign;
    }

    public getCampaign(): Campaign | null {
        return this.currentCampaign;
    }

    public setActiveMapId(mapId: number) {
        const filePath = path.join(this.campaignDir, 'campaign.yaml');
        if (!fs.existsSync(filePath)) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            doc.set('activeMapId', mapId);
            fs.writeFileSync(filePath, doc.toString());
        } catch (e) {
            console.error(`Error updating activeMapId:`, e);
        }
    }

    public updateTokenPosition(tokenId: number, mapId: number, x: number, y: number) {
        const filePath = this.tokenSourceMap.get(tokenId);
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            const tokens = doc.get('tokens') as YAMLSeq;
            if (!tokens) return;

            const tokenItem = tokens.items.find((item: unknown) => {
                const i = item as { get?: (s: string) => unknown, id?: number };
                const id = i.get ? i.get('id') : i.id;
                return id === tokenId;
            }) as YAMLMap;

            if (tokenItem) {
                const positionSeq = tokenItem.get('position') as YAMLSeq;
                if (!positionSeq) return;

                const mapPos = positionSeq.items.find((item: unknown) => {
                    const i = item as { get?: (s: string) => unknown, map?: number };
                    const m = i.get ? i.get('map') : i.map;
                    return m === mapId;
                }) as YAMLMap;

                if (mapPos) {
                    mapPos.set('x', x);
                    mapPos.set('y', y);
                } else {
                    positionSeq.add({ map: mapId, x, y });
                }
                fs.writeFileSync(filePath, doc.toString());
            }
        } catch (e) {
            console.error(`Error updating token position:`, e);
        }
    }

    public updateTokenStats(tokenId: number, updates: Record<string, unknown>) {
        const filePath = this.tokenSourceMap.get(tokenId);
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            const tokens = doc.get('tokens') as YAMLSeq;
            if (!tokens) return;

            const tokenItem = tokens.items.find((item: unknown) => {
                const i = item as { get?: (s: string) => unknown, id?: number };
                const id = i.get ? i.get('id') : i.id;
                return id === tokenId;
            }) as YAMLMap;

            if (tokenItem) {
                for (const [key, value] of Object.entries(updates)) {
                    if (key === 'id') continue;
                    if (key === 'stats' && value && typeof value === 'object') {
                        const statsNode = tokenItem.get('stats') as YAMLMap;
                        if (statsNode && statsNode.set) {
                            for (const [statKey, statValue] of Object.entries(value as Record<string, unknown>)) {
                                statsNode.set(statKey, statValue);
                            }
                        }
                    } else {
                        tokenItem.set(key, value);
                    }
                }
                fs.writeFileSync(filePath, doc.toString());
            }
        } catch (e) {
            console.error(`Error updating token stats:`, e);
        }
    }

    public addToken(blueprintId: number, mapId: number, x: number, y: number): Token | null {
        // Find blueprint
        const blueprint = this.currentCampaign?.tokens.find(t => t.id === blueprintId);
        if (!blueprint) return null;

        // Create new ID
        const maxId = this.currentCampaign?.tokens.reduce((max, t) => Math.max(max, t.id), 0) || 0;
        const newId = maxId + 1;

        // Copy and setup new token
        const newToken: Token = JSON.parse(JSON.stringify(blueprint));
        newToken.id = newId;
        newToken.position = [{ map: mapId, x, y }];
        // NPCs are typically not controlled by anyone initially
        newToken.controlled_by = [];

        // Determine target file
        // Default to campaign.yaml if source not found
        let targetFile = this.tokenSourceMap.get(blueprintId);
        if (!targetFile) {
            targetFile = path.join(this.campaignDir, 'campaign.yaml');
        }

        try {
            let doc;
            if (fs.existsSync(targetFile)) {
                const content = fs.readFileSync(targetFile, 'utf8');
                doc = parseDocument(content);
            } else {
                // specific case where file might not exist yet? unlikely for source map
                doc = parseDocument('tokens: []\n');
            }

            // Handle different root structures (array vs object with tokens key)
            // Ideally we check how the file is structured. 
            // Most valid NPC files have a root object or array. 
            // If it's an array root, we just add to it?
            // BUT parser typically expects an object for named fields like 'tokens'.
            // If the file root IS an array (like some older files?), we can't easily add a 'tokens' key.
            // Let's assume standard structure: root object with 'tokens' key, OR array of tokens.

            // Re-read structure logic from loadCampaign? 
            // loadCampaign just does `yaml.load`.

            // `parseDocument` gives us a CST/AST.

            if (doc.contents && isCollection(doc.contents) && (doc.contents as unknown as { items: unknown[] }).items) {
                // It's a collection (Seq or Map)
            } else {
                // Empty or scalar
            }

            // We need to be careful. If the file is a LIST of tokens (Array root), we add to that list.
            // If the file is an OBJECT with a `tokens` key, we add to that list.

            // Detection:
            let tokensSeq: YAMLSeq<unknown> | null = null;

            if (doc.contents instanceof YAMLSeq) {
                tokensSeq = doc.contents;
            } else if (doc.contents instanceof YAMLMap) {
                if (!doc.has('tokens')) {
                    doc.set('tokens', new YAMLSeq());
                }
                tokensSeq = doc.get('tokens') as YAMLSeq;
            } else {
                // Fallback for empty file or weird state
                // If it was parsed as null/empty, we can initialize it?
                // But `doc.contents` might be null.
                if (!doc.contents) {
                    // Assume object structure default
                    const root = new YAMLMap() as unknown as YAMLMap<unknown, unknown>;
                    doc.contents = root as unknown as (typeof doc.contents);
                    root.set('tokens', new YAMLSeq());
                    tokensSeq = root.get('tokens') as YAMLSeq;
                } else {
                    console.error(`Unknown YAML structure in ${targetFile}`);
                    return null;
                }
            }

            if (tokensSeq) {
                tokensSeq.add(newToken);
                fs.writeFileSync(targetFile, doc.toString());

                // Update in-memory source map
                this.tokenSourceMap.set(newId, targetFile);
                this.currentCampaign?.tokens.push(newToken);

                return newToken;
            } else {
                return null;
            }

        } catch (e) {
            console.error('Error adding token:', e);
            return null;
        }
    }

    public removeToken(tokenId: number) {
        const filePath = this.tokenSourceMap.get(tokenId);
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            const tokens = doc.get('tokens') as YAMLSeq;
            if (!tokens || !isCollection(tokens)) return;

            const indexToRemove = tokens.items.findIndex((item: unknown) => {
                const i = item as { get?: (s: string) => unknown, id?: number };
                const id = i.get ? i.get('id') : i.id;
                return id === tokenId;
            });

            if (indexToRemove !== -1) {
                tokens.delete(indexToRemove);
                fs.writeFileSync(filePath, doc.toString());
                this.tokenSourceMap.delete(tokenId);
            }
        } catch (e) {
            console.error(`Error removing token:`, e);
        }
    }

    public watch(callback: (campaign: Campaign) => void) {
        if (this.watcher) this.watcher.close();

        this.watcher = chokidar.watch(this.campaignDir, {
            ignored: /(^|[/\\])\../,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
        });

        this.watcher.on('all', (event: string, path: string) => {
            if (path.endsWith('.yaml') || path.endsWith('.yml')) {
                const newCampaign = this.loadCampaign();
                if (JSON.stringify(this.currentCampaign) !== JSON.stringify(newCampaign)) {
                    this.currentCampaign = newCampaign;
                    callback(newCampaign);
                }
            }
        });
    }

    public addWalls(mapId: number, newWalls: Wall[]) {
        const filePath = this.mapSourceMap.get(mapId);
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            const maps = doc.get('maps') as YAMLSeq;
            if (!maps) return;

            const mapItem = maps.items.find((item: unknown) => ((item as { get?: (s: string) => unknown, id?: number }).get ? (item as { get: (s: string) => unknown }).get('id') : (item as { id: number }).id) === mapId) as YAMLMap;
            if (mapItem) {
                if (!mapItem.has('walls')) mapItem.set('walls', new YAMLSeq());
                const wallsSeq = mapItem.get('walls') as YAMLSeq;
                newWalls.forEach(w => {
                    const wallMap = new YAMLMap();
                    const startMap = new YAMLMap();
                    startMap.set('x', Math.round(w.start.x));
                    startMap.set('y', Math.round(w.start.y));
                    const endMap = new YAMLMap();
                    endMap.set('x', Math.round(w.end.x));
                    endMap.set('y', Math.round(w.end.y));
                    wallMap.set('start', startMap);
                    wallMap.set('end', endMap);
                    wallsSeq.add(wallMap);
                });
                fs.writeFileSync(filePath, doc.toString());
            }
        } catch (e) {
            console.error(`Error adding walls:`, e);
        }
    }

    public addLights(mapId: number, newLights: Light[]) {
        const filePath = this.mapSourceMap.get(mapId);
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            const maps = doc.get('maps') as YAMLSeq;
            if (!maps) return;

            const mapItem = maps.items.find((item: unknown) => ((item as { get?: (s: string) => unknown, id?: number }).get ? (item as { get: (s: string) => unknown }).get('id') : (item as { id: number }).id) === mapId) as YAMLMap;
            if (mapItem) {
                if (!mapItem.has('lights')) mapItem.set('lights', new YAMLSeq());
                const lightsSeq = mapItem.get('lights') as YAMLSeq;
                newLights.forEach(l => {
                    const lightMap = new YAMLMap();
                    lightMap.set('x', l.x);
                    lightMap.set('y', l.y);
                    lightMap.set('radius', l.radius);
                    lightsSeq.add(lightMap);
                });
                fs.writeFileSync(filePath, doc.toString());
            }
        } catch (e) {
            console.error(`Error adding lights:`, e);
        }
    }

    public removeWall(mapId: number, wallToRemove: Wall) {
        const filePath = this.mapSourceMap.get(mapId);
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            const maps = doc.get('maps') as YAMLSeq;
            if (!maps) return;

            const mapItem = maps.items.find((item: unknown) => ((item as { get?: (s: string) => unknown, id?: number }).get ? (item as { get: (s: string) => unknown }).get('id') : (item as { id: number }).id) === mapId) as YAMLMap;
            if (mapItem) {
                const walls = mapItem.get('walls') as YAMLSeq;
                if (!walls || !isCollection(walls)) return;

                const indexToRemove = walls.items.findIndex((item: unknown) => {
                    const w = (item as { toJSON: () => Wall }).toJSON();
                    return Math.abs(w.start.x - wallToRemove.start.x) < 0.1 &&
                        Math.abs(w.start.y - wallToRemove.start.y) < 0.1 &&
                        Math.abs(w.end.x - wallToRemove.end.x) < 0.1 &&
                        Math.abs(w.end.y - wallToRemove.end.y) < 0.1;
                });

                if (indexToRemove !== -1) {
                    walls.delete(indexToRemove);
                    fs.writeFileSync(filePath, doc.toString());
                }
            }
        } catch (e) {
            console.error(`Error removing wall:`, e);
        }
    }

    public removeLight(mapId: number, lightToRemove: Light) {
        const filePath = this.mapSourceMap.get(mapId);
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            const maps = doc.get('maps') as YAMLSeq;
            if (!maps) return;

            const mapItem = maps.items.find((item: unknown) => ((item as { get?: (s: string) => unknown, id?: number }).get ? (item as { get: (s: string) => unknown }).get('id') : (item as { id: number }).id) === mapId) as YAMLMap;
            if (mapItem) {
                const lights = mapItem.get('lights') as YAMLSeq;
                if (!lights || !isCollection(lights)) return;

                const indexToRemove = lights.items.findIndex((item: unknown) => {
                    const l = (item as { toJSON: () => Light }).toJSON();
                    return Math.abs(l.x - lightToRemove.x) < 0.1 &&
                        Math.abs(l.y - lightToRemove.y) < 0.1;
                });

                if (indexToRemove !== -1) {
                    lights.delete(indexToRemove);
                    fs.writeFileSync(filePath, doc.toString());
                }
            }
        } catch (e) {
            console.error(`Error removing light:`, e);
        }
    }

    public addDoors(mapId: number, newDoors: Door[]) {
        const filePath = this.mapSourceMap.get(mapId);
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            const maps = doc.get('maps') as YAMLSeq;
            if (!maps) return;

            const mapItem = maps.items.find((item: unknown) => ((item as { get?: (s: string) => unknown, id?: number }).get ? (item as { get: (s: string) => unknown }).get('id') : (item as { id: number }).id) === mapId) as YAMLMap;
            if (mapItem) {
                if (!mapItem.has('doors')) mapItem.set('doors', new YAMLSeq());
                const doorsSeq = mapItem.get('doors') as YAMLSeq;

                // Find current max ID across all doors in the campaign for this map
                const currentMap = this.currentCampaign?.maps.find(m => m.id === mapId);
                let maxId = currentMap?.doors?.reduce((max, d) => Math.max(max, d.id), 0) || 0;

                newDoors.forEach(d => {
                    maxId++;
                    const doorMap = new YAMLMap();
                    doorMap.set('id', maxId);
                    const startMap = new YAMLMap();
                    startMap.set('x', Math.round(d.start.x));
                    startMap.set('y', Math.round(d.start.y));
                    const endMap = new YAMLMap();
                    endMap.set('x', Math.round(d.end.x));
                    endMap.set('y', Math.round(d.end.y));
                    doorMap.set('start', startMap);
                    doorMap.set('end', endMap);
                    doorMap.set('open', d.open || false);
                    doorsSeq.add(doorMap);
                });
                fs.writeFileSync(filePath, doc.toString());
            }
        } catch (e) {
            console.error(`Error adding doors:`, e);
        }
    }

    public removeDoor(mapId: number, doorToRemove: Door) {
        const filePath = this.mapSourceMap.get(mapId);
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            const maps = doc.get('maps') as YAMLSeq;
            if (!maps) return;

            const mapItem = maps.items.find((item: unknown) => ((item as { get?: (s: string) => unknown, id?: number }).get ? (item as { get: (s: string) => unknown }).get('id') : (item as { id: number }).id) === mapId) as YAMLMap;
            if (mapItem) {
                const doors = mapItem.get('doors') as YAMLSeq;
                if (!doors || !isCollection(doors)) return;

                const indexToRemove = doors.items.findIndex((item: unknown) => {
                    const d = (item as { get?: (s: string) => unknown, id?: number }).get ? (item as { get: (s: string) => unknown }).get('id') : (item as { id: number }).id;
                    return d === doorToRemove.id;
                });

                if (indexToRemove !== -1) {
                    doors.delete(indexToRemove);
                    fs.writeFileSync(filePath, doc.toString());
                }
            }
        } catch (e) {
            console.error(`Error removing door:`, e);
        }
    }

    public toggleDoor(mapId: number, doorId: number) {
        const filePath = this.mapSourceMap.get(mapId);
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            const maps = doc.get('maps') as YAMLSeq;
            if (!maps) return;

            const mapItem = maps.items.find((item: unknown) => ((item as { get?: (s: string) => unknown, id?: number }).get ? (item as { get: (s: string) => unknown }).get('id') : (item as { id: number }).id) === mapId) as YAMLMap;
            if (mapItem) {
                const doors = mapItem.get('doors') as YAMLSeq;
                if (!doors || !isCollection(doors)) return;

                const doorItem = doors.items.find((item: unknown) => {
                    const id = (item as { get?: (s: string) => unknown, id?: number }).get ? (item as { get: (s: string) => unknown }).get('id') : (item as { id: number }).id;
                    return id === doorId;
                }) as YAMLMap;

                if (doorItem) {
                    const isOpen = doorItem.get('open');
                    doorItem.set('open', !isOpen);
                    fs.writeFileSync(filePath, doc.toString());
                }
            }
        } catch (e) {
            console.error(`Error toggling door:`, e);
        }
    }

    private getAllYamlFiles(dir: string, fileList: string[] = []): string[] {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                this.getAllYamlFiles(filePath, fileList);
            } else if (file.endsWith('.yaml') || file.endsWith('.yml')) {
                fileList.push(filePath);
            }
        });
        return fileList;
    }
}
