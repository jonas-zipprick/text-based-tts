import type { PropsWithChildren } from 'react';
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { GameBoard } from '../GameBoard';
import { toast } from 'react-hot-toast';
import type { Campaign, Light } from '../../../../shared';

// Mock react-konva to avoid canvas issues in jsdom
vi.mock('react-konva', () => {
    return {
        Stage: ({ children, onClick }: PropsWithChildren<{ onClick?: (e: unknown) => void }>) => (
            <div data-testid="stage" onClick={onClick}>{children}</div>
        ),
        Layer: ({ children }: PropsWithChildren) => <div>{children}</div>,
        Rect: () => <div />,
        Circle: () => <div />,
        KonvaImage: () => <div />,
        Group: ({ children }: PropsWithChildren) => <div>{children}</div>,
        Line: () => <div />,
        Text: () => <div />,
        Path: () => <div />,
    };
});

// Mock use-image
vi.mock('use-image', () => ({
    default: () => [null]
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
    toast: {
        custom: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        dismiss: vi.fn(),
    },
}));

// Mock clipboard toasts to avoid deep testing there
vi.mock('../LightClipboardToast', () => ({
    LightClipboardToast: ({ lights }: { lights: Light[] }) => (
        <div data-testid="light-toast" data-lights={JSON.stringify(lights)} />
    )
}));

describe('GameBoard Component', () => {
    const mockCampaign: Campaign = {
        name: 'Test',
        activeMapId: 1,
        maps: [{
            id: 1,
            name: 'Map 1',
            grid: { width: 10, height: 10, cellSize: 50 },
            walls: [],
            lights: []
        }],
        tokens: [],
        version: 1
    };

    it('should use Math.floor for grid coordinates during clicks', () => {
        const onAddLights = vi.fn();
        const { getByTestId, getByTitle } = render(
            <GameBoard
                campaign={mockCampaign}
                onTokenMove={vi.fn()}
                view="editor"
                isDaytime={true}
                sessionId="test-session"
                activeMapId={1}
                stageScale={1}
                setStageScale={vi.fn()}
                stagePos={{ x: 0, y: 0 }}
                setStagePos={vi.fn()}
                onAddWalls={vi.fn()}
                onAddLights={onAddLights}
                onRemoveWall={vi.fn()}
                onRemoveLight={vi.fn()}
                onAddDoors={vi.fn()}
                onRemoveDoor={vi.fn()}
                onToggleDoor={vi.fn()}
                onAddToken={vi.fn()}
                onRemoveToken={vi.fn()}
                onTokenUpdate={vi.fn()}
            />
        );

        // Select Light tool
        const lightTool = getByTitle('Light Tool');
        fireEvent.click(lightTool);

        const stage = getByTestId('stage');

        // Mock the Konva event structure
        const createClickEvent = (x: number, y: number) => ({
            target: {
                getStage: () => ({
                    isDragging: () => false,
                    getPointerPosition: () => ({ x, y })
                })
            }
        });

        // Click at x=37.5, y=37.5 (75% of first cell)
        // Currently bugged: Math.round(37.5/50) = 1.
        // Should be: Math.floor(37.5/50) = 0.
        fireEvent.click(stage, createClickEvent(37.5, 37.5));

        expect(toast.custom).toHaveBeenCalled();
        const toastRenderFn = (toast.custom as Mock).mock.calls[0][0];
        const toastElement = toastRenderFn({ id: 't1', visible: true });

        // Check coordinates in the mocked toast
        expect(toastElement.props.lights[0]).toMatchObject({ x: 0, y: 0 });
    });

    it('should reset tool to select when switching from DM to Player view', () => {
        const onRemoveToken = vi.fn();
        const campaignWithToken: Campaign = {
            ...mockCampaign,
            tokens: [{
                id: 1,
                name: 'Test Token',
                picture: '',
                stats: {
                    hp: 10,
                    ac: 10,
                    speed: 30,
                    attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
                },
                controlled_by: [],
                position: [{ map: 1, x: 2, y: 2 }],
                visibility: { night_vision: false }
            }]
        };

        const { getByTitle, rerender, getByTestId } = render(
            <GameBoard
                campaign={campaignWithToken}
                onTokenMove={vi.fn()}
                view="dm"
                isDaytime={true}
                sessionId="test-session"
                activeMapId={1}
                stageScale={1}
                setStageScale={vi.fn()}
                stagePos={{ x: 0, y: 0 }}
                setStagePos={vi.fn()}
                onAddWalls={vi.fn()}
                onAddLights={vi.fn()}
                onRemoveWall={vi.fn()}
                onRemoveLight={vi.fn()}
                onAddDoors={vi.fn()}
                onRemoveDoor={vi.fn()}
                onToggleDoor={vi.fn()}
                onAddToken={vi.fn()}
                onRemoveToken={onRemoveToken}
                onTokenUpdate={vi.fn()}
            />
        );

        // 1. Select Trash tool
        const trashTool = getByTitle('Trash Tool');
        fireEvent.click(trashTool);

        // 2. Switch to Player view via rerender
        rerender(
            <GameBoard
                campaign={campaignWithToken}
                onTokenMove={vi.fn()}
                view="player"
                isDaytime={true}
                sessionId="test-session"
                activeMapId={1}
                stageScale={1}
                setStageScale={vi.fn()}
                stagePos={{ x: 0, y: 0 }}
                setStagePos={vi.fn()}
                onAddWalls={vi.fn()}
                onAddLights={vi.fn()}
                onRemoveWall={vi.fn()}
                onRemoveLight={vi.fn()}
                onAddDoors={vi.fn()}
                onRemoveDoor={vi.fn()}
                onToggleDoor={vi.fn()}
                onAddToken={vi.fn()}
                onRemoveToken={onRemoveToken}
                onTokenUpdate={vi.fn()}
            />
        );

        // 3. Try to use trash tool (click on stage where token is)
        const stage = getByTestId('stage');
        const createClickEvent = (x: number, y: number) => ({
            target: {
                getStage: () => ({
                    isDragging: () => false,
                    getPointerPosition: () => ({ x, y })
                })
            }
        });

        // Click at grid (2,2) -> pixel (100+25, 100+25) = (125, 125)
        fireEvent.click(stage, createClickEvent(125, 125));

        // 4. Verify onRemoveToken was NOT called (because tool reset to 'select')
        expect(onRemoveToken).not.toHaveBeenCalled();
    });
});
