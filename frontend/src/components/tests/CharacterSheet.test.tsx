import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterSheet } from '../CharacterSheet';
import type { Token } from '../../../../shared';

// Mock character sheet props
const mockToken: Token = {
    id: 1,
    name: 'Strahd von Zarovich',
    picture: 'strahd.png',
    type: 'Undead',
    size: 'Medium',
    currentHp: 10,
    controlled_by: [],
    visibility: {
        night_vision: true,
    },
    stats: {
        hp: 20,
        ac: 15,
        attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        speed: 30,
    },
    position: [
        { map: 1, x: 100, y: 100 }
    ],
};

// Mock dependencies
vi.mock('react-hot-toast', () => ({
    toast: {
        custom: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        dismiss: vi.fn(),
    },
}));

describe('CharacterSheet Component', () => {
    it('should render basic character information', () => {
        const onClose = vi.fn();
        const onUpdate = vi.fn();

        render(
            <CharacterSheet
                token={mockToken}
                onClose={onClose}
                onUpdate={onUpdate}
                isGM={true}
            />
        );

        expect(screen.getByDisplayValue('Strahd von Zarovich')).toBeDefined();
        expect(screen.getByDisplayValue('Undead')).toBeDefined();
        expect(screen.getByText('Current:')).toBeDefined();
    });

    it('should show "Controlled by" section for GMs', () => {
        const onClose = vi.fn();
        const onUpdate = vi.fn();

        render(
            <CharacterSheet
                token={mockToken}
                onClose={onClose}
                onUpdate={onUpdate}
                isGM={true}
            />
        );

        expect(screen.getByText('Controlled by:')).toBeDefined();
    });

    it('should calculate and display attribute modifiers correctly', () => {
        const tokenWithStats = {
            ...mockToken,
            stats: {
                ...mockToken.stats,
                attributes: { str: 18, dex: 14, con: 12, int: 10, wis: 8, cha: 6 },
            },
        };

        render(
            <CharacterSheet
                token={tokenWithStats}
                onClose={vi.fn()}
                onUpdate={vi.fn()}
            />
        );

        expect(screen.getByText('(+4)')).toBeDefined(); // STR 18 -> +4
        expect(screen.getByText('(+2)')).toBeDefined(); // DEX 14 -> +2
        expect(screen.getByText('(+1)')).toBeDefined(); // CON 12 -> +1
        expect(screen.getByText('(+0)')).toBeDefined(); // INT 10 -> +0
        expect(screen.getByText('(-1)')).toBeDefined(); // WIS 8 -> -1
        expect(screen.getByText('(-2)')).toBeDefined(); // CHA 6 -> -2
    });

    it('should render visibility and light emission fields', () => {
        const tokenWithLight = {
            ...mockToken,
            visibility: {
                night_vision: true,
                emit_light: {
                    enabled: true,
                    radius: 20,
                },
            },
        };

        render(
            <CharacterSheet
                token={tokenWithLight}
                onClose={vi.fn()}
                onUpdate={vi.fn()}
            />
        );

        expect(screen.getByText('Visibility & Light')).toBeDefined();
        expect(screen.getByLabelText('Night Vision')).toBeDefined();
        expect(screen.getByLabelText('Emit Light')).toBeDefined();

        const radiusInput = document.getElementById('emit-light-radius') as HTMLTextAreaElement;
        expect(radiusInput).toBeDefined();
        expect(radiusInput.value).toBe('20');
    });
});
