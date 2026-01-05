import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { parseDocument, YAMLMap, YAMLSeq, isCollection } from 'yaml';
import { Campaign, Token, Wall, Light, MapData } from '../../shared';
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
                const data = yaml.load(content) as any;

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

            const tokenItem = tokens.items.find((item: any) => {
                const id = item.get ? item.get('id') : item.id;
                return id === tokenId;
            }) as YAMLMap;

            if (tokenItem) {
                let positionSeq = tokenItem.get('position') as YAMLSeq;
                if (!positionSeq) return;

                const mapPos = positionSeq.items.find((item: any) => {
                    const m = item.get ? item.get('map') : item.map;
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

    public updateTokenStats(tokenId: number, updates: Record<string, any>) {
        const filePath = this.tokenSourceMap.get(tokenId);
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);
            const tokens = doc.get('tokens') as YAMLSeq;
            if (!tokens) return;

            const tokenItem = tokens.items.find((item: any) => {
                const id = item.get ? item.get('id') : item.id;
                return id === tokenId;
            }) as YAMLMap;

            if (tokenItem) {
                for (const [key, value] of Object.entries(updates)) {
                    if (key === 'id') continue;
                    if (key === 'stats' && typeof value === 'object') {
                        const statsNode = tokenItem.get('stats') as YAMLMap;
                        if (statsNode && statsNode.set) {
                            for (const [statKey, statValue] of Object.entries(value)) {
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

        // Persist to campaign.yaml
        const filePath = path.join(this.campaignDir, 'campaign.yaml');
        try {
            let doc;
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                doc = parseDocument(content);
            } else {
                doc = parseDocument('name: New Campaign\nactiveMapId: 0\n');
            }

            if (!doc.has('tokens')) {
                doc.set('tokens', new YAMLSeq());
            }
            const tokensSeq = doc.get('tokens') as YAMLSeq;
            tokensSeq.add(newToken);

            fs.writeFileSync(filePath, doc.toString());

            // Update in-memory source map
            this.tokenSourceMap.set(newId, filePath);

            return newToken;
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

            const indexToRemove = tokens.items.findIndex((item: any) => {
                const id = item.get ? item.get('id') : item.id;
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
            ignored: /(^|[\/\\])\../,
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

            const mapItem = maps.items.find((item: any) => (item.get ? item.get('id') : item.id) === mapId) as YAMLMap;
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

            const mapItem = maps.items.find((item: any) => (item.get ? item.get('id') : item.id) === mapId) as YAMLMap;
            if (mapItem) {
                if (!mapItem.has('lights')) mapItem.set('lights', new YAMLSeq());
                const lightsSeq = mapItem.get('lights') as YAMLSeq;
                newLights.forEach(l => {
                    const lightMap = new YAMLMap();
                    lightMap.set('x', l.x);
                    lightMap.set('y', l.y);
                    lightMap.set('radius', l.radius);
                    lightMap.set('color', l.color);
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

            const mapItem = maps.items.find((item: any) => (item.get ? item.get('id') : item.id) === mapId) as YAMLMap;
            if (mapItem) {
                const walls = mapItem.get('walls') as YAMLSeq;
                if (!walls || !isCollection(walls)) return;

                const indexToRemove = walls.items.findIndex((item: any) => {
                    const w = item.toJSON() as Wall;
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

            const mapItem = maps.items.find((item: any) => (item.get ? item.get('id') : item.id) === mapId) as YAMLMap;
            if (mapItem) {
                const lights = mapItem.get('lights') as YAMLSeq;
                if (!lights || !isCollection(lights)) return;

                const indexToRemove = lights.items.findIndex((item: any) => {
                    const l = item.toJSON() as Light;
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
