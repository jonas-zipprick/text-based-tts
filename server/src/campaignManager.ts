import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { parseDocument, YAMLMap, YAMLSeq } from 'yaml';
import { Campaign, MapData, Token } from '../../shared';

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
        // Preserve version from current campaign or use lastWrittenVersion
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

                if (data.name && !campaign.name) {
                    // Basic heuristic: if it has a name and we haven't set it (or it's the main file), use it.
                    // Ideally we should look for specific campaign.yaml structure but merging is the goal.
                }

                // Merge properties
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

        // Safety check: If we lost all maps but had them before, something probably went wrong with reading.
        // This prevents the UI from unmounting the GameBoard during a blip.
        if (campaign.maps.length === 0 && this.currentCampaign && this.currentCampaign.maps.length > 0) {
            console.warn("loadCampaign loaded 0 maps. Conserving previous maps to prevent UI flicker.");
            campaign.maps = this.currentCampaign.maps;
            // We might also want to conserve tokens if they rely on maps, but tokens are usually the ones being updated.
            // But if maps are gone, tokens position references might be invalid anyway.
            // Let's stick to just maps for now.
        }

        if (campaign.maps.length === 0) {
            console.warn("loadCampaign: Returning 0 maps!", { previousMaps: this.currentCampaign?.maps?.length });
        }

        // console.log(`Loaded campaign "${campaign.name}" with ${campaign.maps.length} maps and ${campaign.tokens.length} tokens.`);

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
        if (!fs.existsSync(filePath)) {
            console.error(`campaign.yaml not found at ${filePath}`);
            return;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);

            doc.set('activeMapId', mapId);

            fs.writeFileSync(filePath, doc.toString());
            console.log(`Updated activeMapId to ${mapId} in ${filePath}`);
        } catch (e) {
            console.error(`Error updating activeMapId in ${filePath}:`, e);
        }
    }

    public updateTokenPosition(tokenId: number, mapId: number, x: number, y: number) {
        const filePath = this.tokenSourceMap.get(tokenId);
        if (!filePath) {
            console.error(`Source file for token ${tokenId} not found.`);
            return;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);

            const tokens = doc.get('tokens') as YAMLSeq;
            if (!tokens) return;

            const tokenItem = tokens.items.find((item: any) => {
                // Handle direct mapping or YAMLNode
                const id = item.get ? item.get('id') : item.id;
                return id === tokenId;
            }) as YAMLMap;

            if (tokenItem) {
                let positionSeq = tokenItem.get('position') as YAMLSeq;

                // If position doesn't exist, create it (not implementing full creation here for brevity, assuming exists as per realistic example)
                if (!positionSeq) {
                    // Creating complex structures with 'yaml' requires more setup, assuming existence for now
                    return;
                }

                const mapPos = positionSeq.items.find((item: any) => {
                    const m = item.get ? item.get('map') : item.map;
                    return m === mapId;
                }) as YAMLMap;

                if (mapPos) {
                    mapPos.set('x', x);
                    mapPos.set('y', y);
                } else {
                    // Add new position entry
                    positionSeq.add({ map: mapId, x, y });
                }

                fs.writeFileSync(filePath, doc.toString());
                console.log(`Updated token ${tokenId} position in ${filePath}`);
            }

        } catch (e) {
            console.error(`Error updating token position in ${filePath}:`, e);
        }
    }

    public updateTokenStats(tokenId: number, updates: Record<string, any>) {
        const filePath = this.tokenSourceMap.get(tokenId);
        if (!filePath) {
            console.error(`Source file for token ${tokenId} not found.`);
            return;
        }

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
                // Helper to set nested values
                const setNestedValue = (obj: YAMLMap, path: string[], value: any) => {
                    if (path.length === 1) {
                        obj.set(path[0], value);
                        return;
                    }

                    let current = obj.get(path[0]) as YAMLMap;
                    if (!current) {
                        // Create the nested object if it doesn't exist
                        obj.set(path[0], {});
                        current = obj.get(path[0]) as YAMLMap;
                    }

                    // For stats and other nested objects
                    if (path.length === 2) {
                        if (current.set) {
                            current.set(path[1], value);
                        }
                    }
                };

                // Apply updates
                for (const [key, value] of Object.entries(updates)) {
                    if (key === 'id') continue; // Don't update ID

                    if (key === 'stats' && typeof value === 'object') {
                        // Handle stats object specially
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
                console.log(`Updated token ${tokenId} stats in ${filePath}`);
            }

        } catch (e) {
            console.error(`Error updating token stats in ${filePath}:`, e);
        }
    }

    public watch(callback: (campaign: Campaign) => void) {
        if (this.watcher) {
            this.watcher.close();
        }

        this.watcher = chokidar.watch(this.campaignDir, {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { // Wait for writes to finish to avoid partial reads/loops
                stabilityThreshold: 200,
                pollInterval: 100
            }
        });

        this.watcher.on('all', (event, path) => {
            if (path.endsWith('.yaml') || path.endsWith('.yml')) {
                console.log(`File ${path} changed (${event}), reloading campaign...`);

                const newCampaign = this.loadCampaign();

                // Deep comparison to avoid redundant updates (glitch fix)
                // We strip the version field for comparison if we decide to persist it later, 
                // but for now relying on strict JSON equality of the content.
                // Note: We need to ensure we don't compare the version field if it's just a counter we manage.

                const currentJson = JSON.stringify(this.currentCampaign);
                const newJson = JSON.stringify(newCampaign);

                if (currentJson !== newJson) {
                    console.log('Campaign changed externally, broadcasting update.');
                    this.currentCampaign = newCampaign;
                    callback(newCampaign);
                } else {
                    console.log('Campaign file changed but content matches in-memory state (likely internal write). suppressing update.');
                }
            }
        });
    }

    public addWalls(mapId: number, newWalls: any[]) {
        const filePath = this.mapSourceMap.get(mapId);
        if (!filePath) {
            console.error(`Source file for map ${mapId} not found. Available maps:`, Array.from(this.mapSourceMap.keys()));
            return;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);

            const maps = doc.get('maps') as YAMLSeq;
            if (!maps) {
                console.error(`No maps section in ${filePath}`);
                return;
            }

            const mapItem = maps.items.find((item: any) => {
                const id = item.get ? item.get('id') : item.id;
                return id === mapId;
            }) as YAMLMap;

            if (mapItem) {
                if (!mapItem.has('walls')) {
                    mapItem.set('walls', new YAMLSeq());
                }
                const wallsSeq = mapItem.get('walls') as YAMLSeq;

                newWalls.forEach(w => {
                    const wallMap = new YAMLMap();
                    const startMap = new YAMLMap();
                    startMap.set('x', w.start.x);
                    startMap.set('y', w.start.y);

                    const endMap = new YAMLMap();
                    endMap.set('x', w.end.x);
                    endMap.set('y', w.end.y);

                    wallMap.set('start', startMap);
                    wallMap.set('end', endMap);
                    wallsSeq.add(wallMap);
                });

                fs.writeFileSync(filePath, doc.toString());
                console.log(`Added ${newWalls.length} walls to map ${mapId} in ${filePath}`);
            } else {
                console.error(`Map ${mapId} not found in ${filePath}`);
            }

        } catch (e) {
            console.error(`Error adding walls in ${filePath}:`, e);
        }
    }

    public addLights(mapId: number, newLights: any[]) {
        const filePath = this.mapSourceMap.get(mapId);
        if (!filePath) {
            console.error(`Source file for map ${mapId} not found. Available maps:`, Array.from(this.mapSourceMap.keys()));
            return;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = parseDocument(content);

            const maps = doc.get('maps') as YAMLSeq;
            if (!maps) {
                console.error(`No maps section in ${filePath}`);
                return;
            }

            const mapItem = maps.items.find((item: any) => {
                const id = item.get ? item.get('id') : item.id;
                return id === mapId;
            }) as YAMLMap;

            if (mapItem) {
                if (!mapItem.has('lights')) {
                    mapItem.set('lights', new YAMLSeq());
                }
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
                console.log(`Added ${newLights.length} lights to map ${mapId} in ${filePath}`);
            } else {
                console.error(`Map ${mapId} not found in ${filePath}`);
            }

        } catch (e) {
            console.error(`Error adding lights in ${filePath}:`, e);
        }
    }

    private getAllYamlFiles(dir: string, fileList: string[] = []): string[] {
        const files = fs.readdirSync(dir);

        files.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                this.getAllYamlFiles(filePath, fileList);
            } else {
                if (file.endsWith('.yaml') || file.endsWith('.yml')) {
                    fileList.push(filePath);
                }
            }
        });

        return fileList;
    }
}
