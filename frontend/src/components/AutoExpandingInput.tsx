import {useEffect, useRef, useState} from 'react';

export interface AutoExpandingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    className?: string;
}

export const AutoExpandingInput: React.FC<AutoExpandingInputProps> = ({ className = '', style, ...props }) => {
    const spanRef = useRef<HTMLSpanElement>(null);
    const [width, setWidth] = useState<number | string>('auto');

    useEffect(() => {
        if (spanRef.current) {
            setWidth(spanRef.current.offsetWidth + 6); // Small buffer
        }
    }, [props.value, props.placeholder]);

    const displayValue = props.value || props.placeholder || '';

    return (
        <div className="auto-expand-container" style={{ display: 'inline-block', position: 'relative' }}>
            <input
                {...props}
                className={`cs-editable ${className}`}
                style={{ ...style, width: typeof width === 'number' ? `${width}px` : width }}
            />
            <span
                ref={spanRef}
                className={`cs-editable ${className}`}
                style={{
                    ...style,
                    position: 'absolute',
                    visibility: 'hidden',
                    whiteSpace: 'pre',
                    height: 0,
                    padding: '1px 4px', // Match cs-editable padding
                    border: 'none',
                    left: 0,
                    top: 0,
                }}
            >
                {displayValue}
            </span>
        </div>
    );
};
