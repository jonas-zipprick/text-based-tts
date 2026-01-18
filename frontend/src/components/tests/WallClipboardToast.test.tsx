import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallClipboardToast } from '../WallClipboardToast';
import { toast, type Toast } from 'react-hot-toast';
import type { Wall } from '../../../../shared';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
    toast: {
        error: vi.fn(),
        dismiss: vi.fn(),
    },
}));

describe('WallClipboardToast Component', () => {
    const mockWalls: Wall[] = [
        { start: { x: 0, y: 0 }, end: { x: 100, y: 100 } }
    ];
    const mockToast = { id: 't-1', visible: true } as Toast;

    it('should render initial walls in YAML format', () => {
        render(<WallClipboardToast walls={mockWalls} t={mockToast} onClose={vi.fn()} />);

        const textarea = screen.getByRole('textbox');
        expect(textarea.textContent).toContain('start: {x: 0, y: 0}');
        expect(textarea.textContent).toContain('end: {x: 100, y: 100}');
    });

    it('should call onSave with parsed YAML when clicking Save', () => {
        const onSave = vi.fn();
        render(<WallClipboardToast walls={mockWalls} t={mockToast} onClose={vi.fn()} onSave={onSave} />);

        const saveButton = screen.getByText('Save to Map');
        fireEvent.click(saveButton);

        expect(onSave).toHaveBeenCalledWith([
            { start: { x: 0, y: 0 }, end: { x: 100, y: 100 } }
        ]);
    });

    it('should show error for invalid YAML syntax', () => {
        render(<WallClipboardToast walls={mockWalls} t={mockToast} onClose={vi.fn()} onSave={vi.fn()} />);

        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'invalid: yml: {{' } });

        const saveButton = screen.getByText('Save to Map');
        fireEvent.click(saveButton);

        expect(toast.error).toHaveBeenCalled();
    });

    it('should show error for missing coordinates', () => {
        render(<WallClipboardToast walls={mockWalls} t={mockToast} onClose={vi.fn()} onSave={vi.fn()} />);

        const textarea = screen.getByRole('textbox');
        // Missing 'end' coordinate
        fireEvent.change(textarea, { target: { value: '- start: {x: 10, y: 10}' } });

        const saveButton = screen.getByText('Save to Map');
        fireEvent.click(saveButton);

        expect(toast.error).toHaveBeenCalled();
    });

    it('should call onClose and toast.dismiss when clicking close button', () => {
        const onClose = vi.fn();
        render(<WallClipboardToast walls={mockWalls} t={mockToast} onClose={onClose} />);

        const closeButton = screen.getByTitle('Close');
        fireEvent.click(closeButton);

        expect(onClose).toHaveBeenCalled();
        expect(toast.dismiss).toHaveBeenCalledWith('t-1');
    });
});
