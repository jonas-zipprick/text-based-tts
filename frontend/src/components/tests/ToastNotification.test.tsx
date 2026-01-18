import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastNotification } from '../ToastNotification';
import { toast, type Toast } from 'react-hot-toast';
import type { RollEvent } from '../../../../shared';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
    toast: {
        dismiss: vi.fn(),
    },
}));

describe('ToastNotification Component', () => {
    const mockToast = {
        id: 'toast-1',
        visible: true,
    } as Toast;

    it('should render attack roll results correctly', () => {
        const data: RollEvent = {
            tokenName: 'Hero',
            actionName: 'Longsword Attack',
            attack: {
                total: 18,
                d20: 15,
                mod: 3,
                sign: '+',
                type: 'normal',
                breakdown: '15 + 3',
            },
            damage: [
                { total: 8, type: 'slashing', formula: '1d8+3' }
            ],
        };

        render(<ToastNotification data={data} t={mockToast} />);

        expect(screen.getByText('Hero')).toBeDefined();
        expect(screen.getByText('Longsword Attack')).toBeDefined();
        expect(screen.getByText('18')).toBeDefined();
        expect(screen.getByText('(15 + 3)')).toBeDefined();
        expect(screen.getByText('8')).toBeDefined();
        expect(screen.getByText('slashing (1d8+3)')).toBeDefined();
    });

    it('should render critical hits differently', () => {
        const data: RollEvent = {
            tokenName: 'Hero',
            actionName: 'Dagger Attack',
            attack: {
                total: 22,
                d20: 20,
                mod: 2,
                sign: '+',
                type: 'crit',
            },
        };

        render(<ToastNotification data={data} t={mockToast} />);

        expect(screen.getByText('22')).toBeDefined();
        expect(screen.getByText('(20+2) (CRIT!)')).toBeDefined();
    });

    it('should render save DCs', () => {
        const data: RollEvent = {
            tokenName: 'Wizard',
            actionName: 'Fireball',
            save: {
                dc: 15,
                ability: 'dex',
            },
            damage: [
                { total: 28, type: 'fire', formula: '8d6' }
            ],
        };

        render(<ToastNotification data={data} t={mockToast} />);

        expect(screen.getByText(/DC 15/)).toBeDefined();
        expect(screen.getByText('DEX')).toBeDefined();
        expect(screen.getByText('28')).toBeDefined();
    });

    it('should call toast.dismiss when close button is clicked', () => {
        const data: RollEvent = {
            tokenName: 'Hero',
            actionName: 'Action',
        };

        render(<ToastNotification data={data} t={mockToast} />);

        const closeButton = screen.getByText('×');
        fireEvent.click(closeButton);

        expect(toast.dismiss).toHaveBeenCalledWith('toast-1');
    });
});
