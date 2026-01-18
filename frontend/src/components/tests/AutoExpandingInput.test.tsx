import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutoExpandingInput } from '../AutoExpandingInput';

describe('AutoExpandingInput Component', () => {
    it('should apply correct styles for auto-expanding grid layout', () => {
        const value = 'Test content';
        render(
            <AutoExpandingInput
                value={value}
                onChange={() => { }}
            />
        );

        const textarea = screen.getByDisplayValue(value);
        expect(textarea.tagName).toBe('TEXTAREA');

        const container = textarea.closest('.auto-expand-container');
        expect(container).toBeDefined();

        const containerStyle = window.getComputedStyle(container!);
        expect(containerStyle.display).toBe('inline-grid');
        expect(containerStyle.maxWidth).toBe('100%');

        const textareaStyle = window.getComputedStyle(textarea);
        expect(textareaStyle.width).toBe('0px');
        expect(textareaStyle.minWidth).toBe('100%');
    });

    it('should use a hidden span with pre-wrap to drive size', () => {
        const value = 'A long text that should wrap';
        render(
            <AutoExpandingInput
                value={value}
                onChange={() => { }}
            />
        );

        const expectedText = value + '\u200B';
        const span = document.querySelector('.auto-expand-container span');

        expect(span).toBeDefined();
        expect(span?.textContent).toBe(expectedText);

        const spanStyle = window.getComputedStyle(span!);
        expect(spanStyle.whiteSpace).toBe('pre-wrap');
        expect(spanStyle.wordBreak).toBe('break-word');
        expect(spanStyle.visibility).toBe('hidden');
    });
});
