import { CampaignManager } from './campaignManager';
import fs from 'fs';
import chokidar from 'chokidar';

// Mock dependencies
jest.mock('fs', () => ({
    readFileSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    writeFileSync: jest.fn(),
    existsSync: jest.fn(),
}));

jest.mock('chokidar', () => ({
    watch: jest.fn(),
}));

jest.mock('path', () => ({
    join: (...args: string[]) => args.join('/'),
    resolve: (...args: string[]) => args.join('/'),
}));

describe('CampaignManager', () => {
    let cm: CampaignManager;
    const mockDir = '/mock/campaign';

    beforeEach(() => {
        jest.clearAllMocks();
        cm = new CampaignManager(mockDir);
    });

    describe('loadCampaign', () => {
        it('should load campaign metadata from yaml files', () => {
            // Mock file system listing
            (fs.readdirSync as jest.Mock).mockReturnValue(['campaign.yaml']);
            (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

            // Mock file content
            (fs.readFileSync as jest.Mock).mockReturnValue(`
name: Test Campaign
activeMapId: 1
version: 1
maps: []
tokens: []
`);

            const campaign = cm.loadCampaign();

            expect(campaign).toBeDefined();
            expect(campaign.name).toBe('Test Campaign');
            expect(campaign.activeMapId).toBe(1);
            expect(fs.readFileSync).toHaveBeenCalled();
        });

        it('should merge data from multiple files', () => {
            // Mock finding multiple files
            (fs.readdirSync as jest.Mock).mockImplementation((dir) => {
                if (dir === mockDir) return ['campaign.yaml', 'map1.yaml'];
                return [];
            });
            (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

            // Mock content
            (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
                if (path.endsWith('campaign.yaml')) return 'name: Main Campaign\nactiveMapId: 2';
                if (path.endsWith('map1.yaml')) return 'maps: [{ id: 1, name: "Village" }]';
                return '';
            });

            const campaign = cm.loadCampaign();

            expect(campaign.name).toBe('Main Campaign');
            expect(campaign.activeMapId).toBe(2);
            expect(campaign.maps).toHaveLength(1);
            expect(campaign.maps[0].name).toBe('Village');
        });
    });

    describe('watch', () => {
        it('should setup watcher and trigger callback on change', () => {
            const mockWatcher = {
                on: jest.fn(),
                close: jest.fn(),
            };
            (chokidar.watch as jest.Mock).mockReturnValue(mockWatcher);

            // Preload initial state
            (fs.readdirSync as jest.Mock).mockReturnValue(['campaign.yaml']);
            (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
            (fs.readFileSync as jest.Mock).mockReturnValue('name: Initial Campaign');
            cm.loadCampaign();

            const callback = jest.fn();
            cm.watch(callback);

            expect(chokidar.watch).toHaveBeenCalledWith(mockDir, expect.any(Object));
            expect(mockWatcher.on).toHaveBeenCalledWith('all', expect.any(Function));

            // Trigger the 'all' event
            const eventHandler = mockWatcher.on.mock.calls[0][1];

            // Setup mock data for the reload that happens on change
            // Need to clear mocks or update return value
            (fs.readFileSync as jest.Mock).mockReturnValue('name: Reloaded Campaign');

            // Simulate file change
            eventHandler('change', '/mock/campaign/campaign.yaml');

            expect(callback).toHaveBeenCalled();
            expect(callback.mock.calls[0][0].name).toBe('Reloaded Campaign');
        });
    });

    describe('updateTokenPosition', () => {
        it('should update token position in the correct file', () => {
            // Pre-load to populate tokenSourceMap
            (fs.readdirSync as jest.Mock).mockReturnValue(['tokens.yaml']);
            (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
            (fs.readFileSync as jest.Mock).mockImplementation(() => {
                // Return simple yaml with token 1
                return 'tokens:\n  - id: 1\n    name: Hero\n    position: []\n    stats:\n      hp: 10\n      ac: 10\n      speed: 30\n      attributes: {}';
            });

            cm.loadCampaign();

            // clear mocks before update
            (fs.readFileSync as jest.Mock).mockClear();

            // Mock read for update
            (fs.readFileSync as jest.Mock).mockReturnValue('tokens:\n  - id: 1\n    name: Hero\n    position: []\n    stats:\n      hp: 10\n      ac: 10\n      speed: 30\n      attributes: {}');

            cm.updateTokenPosition(1, 10, 50, 50);

            // Expect write
            expect(fs.writeFileSync).toHaveBeenCalled();
            const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
            expect(writtenContent).toContain('x: 50');
            expect(writtenContent).toContain('y: 50');
        });

        it('should handle sequential updates to same file correctly', () => {
            // Initial read
            (fs.readFileSync as jest.Mock).mockReturnValue('tokens:\n  - id: 1\n    name: Hero\n    position: []\n    stats:\n      hp: 10');
            cm.loadCampaign();
            (fs.readFileSync as jest.Mock).mockClear();

            // First update (HP)
            (fs.readFileSync as jest.Mock).mockReturnValue('tokens:\n  - id: 1\n    name: Hero\n    position: []\n    stats:\n      hp: 10');
            cm.updateTokenStats(1, { stats: { hp: 5 } });

            // Verify first write
            expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
            const write1 = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
            expect(write1).toContain('hp: 5');

            (fs.writeFileSync as jest.Mock).mockClear();
            (fs.readFileSync as jest.Mock).mockReturnValue('tokens:\n  - id: 1\n    name: Hero\n    position: []\n    stats:\n      hp: 5');

            cm.updateTokenStats(1, { stats: { ac: 15 } });

            expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
            const write2 = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
            expect(write2).toContain('hp: 5');
            expect(write2).toContain('ac: 15');
        });
    });

    describe('addToken', () => {
        it('should add new token to the same file as the blueprint', () => {
            // Setup: Blueprint exists in a specific NPC file
            (fs.readdirSync as jest.Mock).mockReturnValue(['npcs/goblin.yaml']);
            (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
            (fs.existsSync as jest.Mock).mockReturnValue(true);

            const goblinContent = `
tokens:
  - id: 100
    name: Goblin
    stats:
       hp: 7
`;
            (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
                if (path.endsWith('npcs/goblin.yaml')) return goblinContent;
                return '';
            });

            // Load campaign to populate tokenSourceMap
            cm.loadCampaign();

            (fs.readFileSync as jest.Mock).mockClear();
            (fs.writeFileSync as jest.Mock).mockClear();

            // Mock read for the addToken operation (re-reading the file to append)
            (fs.readFileSync as jest.Mock).mockReturnValue(goblinContent);

            // Action: Add token based on Goblin blueprint (id 100)
            const newToken = cm.addToken(100, 1, 10, 10);

            // Assertions
            expect(newToken).toBeDefined();
            expect(newToken?.name).toBe('Goblin');

            // Should write to npcs/goblin.yaml
            expect(fs.writeFileSync).toHaveBeenCalled();
            const [filePath, content] = (fs.writeFileSync as jest.Mock).mock.calls[0];

            expect(filePath).toContain('npcs/goblin.yaml');
            // Content should have 2 tokens now (blueprint + new instance)
            expect(content).toContain('id: 100'); // original
            expect(content).toContain(`id: ${newToken?.id}`); // new one
        });

        it('should fall back to campaign.yaml if blueprint source undefined (edge case)', () => {
            // Setup: Load campaign normally
            (fs.readdirSync as jest.Mock).mockReturnValue(['campaign.yaml']);
            (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
            (fs.existsSync as jest.Mock).mockReturnValue(true);

            const campaignContent = `
tokens:
  - id: 1
    name: Hero
    stats:
        hp: 10
`;
            (fs.readFileSync as jest.Mock).mockReturnValue(campaignContent);
            cm.loadCampaign();

            // Force fallback by removing from source map
            (cm as unknown as { tokenSourceMap: Map<number, string> }).tokenSourceMap.delete(1);

            (fs.readFileSync as jest.Mock).mockClear();
            (fs.writeFileSync as jest.Mock).mockClear();
            (fs.readFileSync as jest.Mock).mockReturnValue(campaignContent);

            const res = cm.addToken(1, 1, 0, 0);

            // Check if it added successfully
            expect(res).not.toBeNull();

            expect(fs.writeFileSync).toHaveBeenCalled();
            const [filePath] = (fs.writeFileSync as jest.Mock).mock.calls[0];
            expect(filePath).toContain('campaign.yaml');
        });
    });

    describe('Loop Prevention', () => {
        it('should suppress callback if loaded content matches in-memory state (Optimistic Update)', () => {
            const mockWatcher = { on: jest.fn(), close: jest.fn() };
            (chokidar.watch as jest.Mock).mockReturnValue(mockWatcher);

            // 1. Initial Load
            (fs.readdirSync as jest.Mock).mockReturnValue(['campaign.yaml']);
            (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
            (fs.readFileSync as jest.Mock).mockReturnValue('name: Match Campaign\ntokens: []');
            const campaign = cm.loadCampaign();

            // Setup watcher
            const callback = jest.fn();
            cm.watch(callback);

            const eventHandler = mockWatcher.on.mock.calls[0][1];

            // 2. Simulate Optimistic Update (modify in-memory)
            campaign.name = "Optimistic Name";

            // 3. Simulate File Update that matches Optimistic Update
            (fs.readFileSync as jest.Mock).mockReturnValue('name: Optimistic Name\ntokens: []');

            // 4. Trigger Watcher
            eventHandler('change', '/mock/campaign/campaign.yaml');

            // 5. Expect loads newly, compares, sees match -> NO Callback
            expect(callback).not.toHaveBeenCalled();

            // Verify positive case (ensure test setup is valid)
            (fs.readFileSync as jest.Mock).mockReturnValue('name: Divergent Name\ntokens: []');
            eventHandler('change', '/mock/campaign/campaign.yaml');
            expect(callback).toHaveBeenCalled();
        });
    });
});
