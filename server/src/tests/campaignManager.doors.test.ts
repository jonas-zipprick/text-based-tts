import { CampaignManager } from '../campaignManager';
import fs from 'fs';
import { Door } from '../../../shared';

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

describe('CampaignManager Doors', () => {
    let cm: CampaignManager;
    const mockDir = '/mock/campaign';

    beforeEach(() => {
        jest.clearAllMocks();
        cm = new CampaignManager(mockDir);

        // Setup initial map source map
        (fs.readdirSync as jest.Mock).mockReturnValue(['map1.yaml']);
        (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
        (fs.readFileSync as jest.Mock).mockReturnValue('maps: [{ id: 1, name: "Test Map", walls: [], doors: [] }]');
        cm.loadCampaign();
    });

    it('should add doors to a map', () => {
        const newDoors: Door[] = [
            { id: 0, start: { x: 10, y: 10 }, end: { x: 20, y: 20 }, open: false }
        ];

        (fs.readFileSync as jest.Mock).mockReturnValue('maps: [{ id: 1, name: "Test Map", walls: [], doors: [] }]');
        cm.addDoors(1, newDoors);

        expect(fs.writeFileSync).toHaveBeenCalled();
        const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
        expect(writtenContent).toContain('doors:');
        expect(writtenContent).toContain('x: 10');
        expect(writtenContent).toContain('open: false');
    });

    it('should toggle door state', () => {
        // Initial state with a door
        (fs.readFileSync as jest.Mock).mockReturnValue('maps: [{ id: 1, name: "Test Map", walls: [], doors: [{ id: 1, start: {x:0, y:0}, end: {x:10, y:10}, open: false }] }]');
        cm.loadCampaign();

        (fs.readFileSync as jest.Mock).mockReturnValue('maps: [{ id: 1, name: "Test Map", walls: [], doors: [{ id: 1, start: {x:0, y:0}, end: {x:10, y:10}, open: false }] }]');
        cm.toggleDoor(1, 1);

        expect(fs.writeFileSync).toHaveBeenCalled();
        const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
        expect(writtenContent).toContain('open: true');
    });

    it('should remove a door', () => {
        const doorToRemove = { id: 1, start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, open: false };

        (fs.readFileSync as jest.Mock).mockReturnValue('maps: [{ id: 1, name: "Test Map", walls: [], doors: [{ id: 1, start: {x:0, y:0}, end: {x:10, y:10}, open: false }] }]');
        cm.loadCampaign();

        (fs.readFileSync as jest.Mock).mockReturnValue('maps: [{ id: 1, name: "Test Map", walls: [], doors: [{ id: 1, start: {x:0, y:0}, end: {x:10, y:10}, open: false }] }]');
        cm.removeDoor(1, doorToRemove);

        expect(fs.writeFileSync).toHaveBeenCalled();
        const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
        // The doors array should be empty or the specific door should be gone
        expect(writtenContent).not.toContain('open: false');
    });
});
