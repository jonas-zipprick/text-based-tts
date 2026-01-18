import React from 'react';
import { toast, type Toast } from 'react-hot-toast';
import type { RollEvent } from '../../../shared';
import './CharacterSheet.css'; // Ensure styles are available

export const ToastNotification: React.FC<{ data: RollEvent; t: Toast }> = ({ data, t }) => {
    return (
        <div
            className={`cs-toast ${data.attack?.type || 'info'}`}
            style={{
                opacity: t.visible ? 1 : 0,
                transform: t.visible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'all 0.3s ease-out',
                position: 'relative'
            }}
        >
            <button
                className="cs-toast-close"
                onClick={(e) => {
                    e.stopPropagation();
                    toast.dismiss(t.id);
                }}
            >
                ×
            </button>
            <div className="cs-toast-token">{data.tokenName}</div>
            <div className="cs-toast-header">{data.actionName}</div>
            {/* Attack Roll */}
            {data.attack && (
                <div className="cs-toast-row">
                    Attack: <strong>{data.attack.total}</strong>
                    <span className="cs-toast-detail">
                        ({data.attack.breakdown || `${data.attack.d20}${data.attack.sign}${data.attack.mod}`})
                        {data.attack.type === 'crit' && ' (CRIT!)'}
                        {data.attack.type === 'fail' && ' (MISS!)'}
                    </span>
                </div>
            )}

            {/* Save DC */}
            {data.save && (
                <div className="cs-toast-row">
                    Save: <strong>DC {data.save.dc}</strong>
                    <span className="cs-toast-detail"> {data.save.ability.toUpperCase()}</span>
                </div>
            )}

            {/* Damage Rolls */}
            {data.damage && data.damage.map((dmg, idx) => (
                <div key={idx} className="cs-toast-row">
                    Damage: <strong>{dmg.total}</strong>
                    <span className="cs-toast-detail">
                        {dmg.type} {dmg.formula && `(${dmg.formula})`}
                    </span>
                </div>
            ))}
        </div>
    );
};
