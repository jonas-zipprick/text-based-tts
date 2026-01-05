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

    constructor(campaignDir: string) {
        this.campaignDir = campaignDir;
    }

    public loadCampaign(): Campaign {
        const campaign: Campaign = {
            name: 'New Campaign',
            activeMapId: 0,
            maps: [],
            tokens: [],
        };
        this.tokenSourceMap.clear();

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
                if (data.maps) campaign.maps.push(...(data.maps as MapData[]));
                if (data.tokens) {
                    const tokens = data.tokens as Token[];
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

        this.currentCampaign = campaign;
        // console.log(`Loaded campaign "${campaign.name}" with ${campaign.maps.length} maps and ${campaign.tokens.length} tokens.`);
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
                // Debounce handled by awaitWriteFinish somewhat, but keeping explicit reload
                const campaign = this.loadCampaign();
                callback(campaign);
            }
        });
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
