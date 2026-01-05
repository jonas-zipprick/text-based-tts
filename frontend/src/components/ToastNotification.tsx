import React from 'react';
import { toast } from 'react-hot-toast';
import type { RollEvent } from '../../../shared';
import './CharacterSheet.css'; // Ensure styles are available

export const ToastNotification: React.FC<{ data: RollEvent; t: any }> = ({ data, t }) => {
    return (
        <div
            className={`cs-toast ${data.attack.type}`}
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
            <div className="cs-toast-row">
                Attack: <strong>{data.attack.total}</strong>
                <span className="cs-toast-detail">
                    ({data.attack.d20}{data.attack.sign}{data.attack.mod})
                </span>
            </div>
            {data.damage && (
                <div className="cs-toast-row">
                    Damage: <strong>{data.damage.total}</strong>
                    <span className="cs-toast-detail">{data.damage.type}</span>
                </div>
            )}
        </div>
    );
};
