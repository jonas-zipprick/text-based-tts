import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LightClipboardToast } from '../LightClipboardToast';
import { toast, type Toast } from 'react-hot-toast';
import type { Light } from '../../../../shared';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
    toast: {
        error: vi.fn(),
        dismiss: vi.fn(),
    },
}));

describe('LightClipboardToast Component', () => {
    const mockLights: Light[] = [
        { x: 100, y: 200, radius: 50, color: '#f1c40f' }
    ];
    const mockToast = { id: 't-1', visible: true } as Toast;

    it('should render initial lights in YAML format', () => {
        render(<LightClipboardToast lights={mockLights} t={mockToast} onClose={vi.fn()} />);

        const textarea = screen.getByRole('textbox');
        expect(textarea.textContent).toContain('x: 100');
        expect(textarea.textContent).toContain('y: 200');
        expect(textarea.textContent).toContain('radius: 50');
        expect(textarea.textContent).toContain('color: "#f1c40f"');
    });

    it('should call onSave with parsed YAML when clicking Save', () => {
        const onSave = vi.fn();
        render(<LightClipboardToast lights={mockLights} t={mockToast} onClose={vi.fn()} onSave={onSave} />);

        const saveButton = screen.getByText('Save to Map');
        fireEvent.click(saveButton);

        expect(onSave).toHaveBeenCalledWith([
            { x: 100, y: 200, radius: 50, color: '#f1c40f' }
        ]);
    });

    it('should show error for invalid YAML', () => {
        render(<LightClipboardToast lights={mockLights} t={mockToast} onClose={vi.fn()} onSave={vi.fn()} />);

        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'not: valid: yaml: -' } });

        const saveButton = screen.getByText('Save to Map');
        fireEvent.click(saveButton);

        expect(toast.error).toHaveBeenCalled();
    });

    it('should call onClose and toast.dismiss when clicking close button', () => {
        const onClose = vi.fn();
        render(<LightClipboardToast lights={mockLights} t={mockToast} onClose={onClose} />);

        const closeButton = screen.getByTitle('Close');
        fireEvent.click(closeButton);

        expect(onClose).toHaveBeenCalled();
        expect(toast.dismiss).toHaveBeenCalledWith('t-1');
    });
});
