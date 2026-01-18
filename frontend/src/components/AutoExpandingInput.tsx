import { useRef } from 'react';

export interface AutoExpandingInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    className?: string;
}

export const AutoExpandingInput: React.FC<AutoExpandingInputProps> = ({ className = '', style, ...props }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const displayValue = props.value || props.placeholder || '';

    return (
        <div
            className="auto-expand-container"
            style={{
                display: 'inline-grid',
                position: 'relative',
                maxWidth: '100%',
                verticalAlign: 'bottom'
            }}
        >
            <span
                className={`cs-editable ${className}`}
                style={{
                    ...style,
                    gridArea: '1 / 1 / 2 / 2',
                    visibility: 'hidden',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    padding: '1px 4px', // Match cs-editable padding
                    border: 'none',
                    minWidth: '4px',
                    pointerEvents: 'none',
                }}
            >
                {displayValue + '\u200B'}
            </span>
            <textarea
                ref={textareaRef}
                {...props}
                className={`cs-editable ${className}`}
                style={{
                    ...style,
                    gridArea: '1 / 1 / 2 / 2',
                    width: 0,
                    minWidth: '100%',
                    height: 0,
                    minHeight: '100%',
                    resize: 'none',
                    overflow: 'hidden',
                    margin: 0,
                    padding: '1px 4px',
                }}
                rows={1}
            />
        </div>
    );
};
