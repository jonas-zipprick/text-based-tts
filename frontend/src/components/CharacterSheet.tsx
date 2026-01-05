import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Token, RollEvent } from '../../../shared';
import toast from 'react-hot-toast';
import { ToastNotification } from './ToastNotification';
import './CharacterSheet.css';

interface CharacterSheetProps {
    token: Token;
    onClose: () => void;
    onUpdate: (tokenId: number, updates: Partial<Token>) => void;
    onRoll?: (data: RollEvent) => void;
}


// Calculate attribute modifier
const getModifier = (value: number): string => {
    const mod = Math.floor((value - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
};

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => clearTimeout(handler);
    }, [value, delay]);

    return debouncedValue;
}

export const CharacterSheet: React.FC<CharacterSheetProps> = ({ token, onClose, onUpdate, onRoll }) => {
    // Local state for editing
    const [localToken, setLocalToken] = useState<Token>(token);
    const [hpInput, setHpInput] = useState('');
    // Track when we're waiting for our own save to complete
    const pendingSaveRef = useRef<string | null>(null);

    // Debounced token for auto-save
    const debouncedToken = useDebounce(localToken, 300);

    // Sync with external token updates (but not our own saves echoing back)
    useEffect(() => {
        const incomingJson = JSON.stringify(token);
        // Only sync if this wasn't our own save coming back
        if (pendingSaveRef.current !== incomingJson) {
            // console.log('CharacterSheet: External update received', token);
            setLocalToken(token);
        }
    }, [token]);

    // Auto-save when debounced token changes
    useEffect(() => {
        const debouncedJson = JSON.stringify(debouncedToken);
        const tokenJson = JSON.stringify(token);
        // Only save if token actually changed from original
        if (debouncedJson !== tokenJson) {
            // Mark this as our pending save so we don't re-sync it
            pendingSaveRef.current = debouncedJson;

            // Strip position and other non-editable fields to prevent overwriting updates
            const { position, controlled_by, ...updates } = debouncedToken;
            onUpdate(debouncedToken.id, updates);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedToken, onUpdate]);

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);



    // Update handlers
    const updateField = useCallback((path: string, value: any) => {
        setLocalToken(prev => {
            const updated = { ...prev };
            const parts = path.split('.');
            let obj: any = updated;
            for (let i = 0; i < parts.length - 1; i++) {
                if (obj[parts[i]] === undefined) {
                    obj[parts[i]] = {};
                }
                obj[parts[i]] = { ...obj[parts[i]] };
                obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = value;
            return updated;
        });
    }, []);

    // Handle HP input with relative values
    const handleHpSubmit = () => {
        if (!hpInput.trim()) return;

        const currentHp = localToken.currentHp ?? localToken.stats.hp;
        let newHp: number;

        if (hpInput.startsWith('+')) {
            newHp = currentHp + parseInt(hpInput.substring(1), 10);
        } else if (hpInput.startsWith('-')) {
            newHp = currentHp + parseInt(hpInput, 10); // parseInt handles the negative
        } else {
            newHp = parseInt(hpInput, 10);
        }

        if (!isNaN(newHp)) {
            // Clamp between 0 and max HP
            newHp = Math.max(0, Math.min(newHp, localToken.stats.hp));
            setLocalToken(prev => ({ ...prev, currentHp: newHp }));
        }
        setHpInput('');
    };

    const handleHpKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleHpSubmit();
        }
    };

    const currentHp = localToken.currentHp ?? localToken.stats.hp;
    const maxHp = localToken.stats.hp;
    const attrs = localToken.stats.attributes || {};

    // Build description string
    const description = [localToken.size, localToken.type, localToken.alignment].filter(Boolean).join(' ').toLowerCase() || localToken.description;

    const parseDice = (formula: string): { roll: number, text: string } | null => {
        // Extract inner formula if in parens e.g. "5 (1d8 + 1)" -> "1d8 + 1"
        const parenMatch = formula.match(/\(([^)]+)\)/);
        const target = parenMatch ? parenMatch[1] : formula;

        // Parse NdS+M or NdS-M
        // Allow spaces
        const match = target.match(/(\d+)d(\d+)\s*([+-])?\s*(\d+)?/);
        if (match) {
            const count = parseInt(match[1], 10);
            const sides = parseInt(match[2], 10);
            const sign = match[3] === '-' ? -1 : 1;
            const mod = match[4] ? parseInt(match[4], 10) : 0;

            let total = 0;
            const rolls = [];
            for (let i = 0; i < count; i++) {
                const r = Math.floor(Math.random() * sides) + 1;
                rolls.push(r);
                total += r;
            }
            total += (sign * mod);

            return {
                roll: total,
                text: `${rolls.join('+')}${mod !== 0 ? (sign === 1 ? '+' : '-') + mod : ''}`
            };
        }
        // Fallback: try parsing as simple integer
        const staticVal = parseInt(target, 10);
        if (!isNaN(staticVal)) return { roll: staticVal, text: 'Static' };

        return null;
    };

    const handleActionClick = (action: any) => {
        if (action.modifiers?.attack !== undefined) {
            // Attack Roll
            const d20 = Math.floor(Math.random() * 20) + 1;
            const attackMod = action.modifiers.attack;
            const attackTotal = d20 + attackMod;

            let type: 'normal' | 'crit' | 'fail' = 'normal';
            if (d20 === 20) type = 'crit';
            if (d20 === 1) type = 'fail';

            const attackSign = attackMod >= 0 ? '+' : '';

            // Damage Roll
            let damageResult = null;
            if (action.hit) {
                damageResult = parseDice(action.hit);
            }

            const rollEvent: RollEvent = {
                tokenName: localToken.name,
                actionName: action.name,
                attack: {
                    total: attackTotal,
                    d20: d20,
                    mod: attackMod,
                    sign: attackSign,
                    type: type
                },
                damage: damageResult ? {
                    total: damageResult.roll,
                    type: action.type
                } : undefined
            };

            toast.custom((t) => <ToastNotification data={rollEvent} t={t} />, { duration: 4000 });

            if (onRoll) {
                onRoll(rollEvent);
            }
        }
    };

    return (
        <div className="character-sheet-overlay">
            <div className="character-sheet">
                <button className="character-sheet-close" onClick={onClose} title="Close">×</button>
                <div className="character-sheet-content">
                    {/* Header */}
                    <div className="cs-header">
                        <h1 className="cs-name">
                            <input
                                type="text"
                                className="cs-editable cs-editable-wide"
                                value={localToken.name}
                                onChange={e => updateField('name', e.target.value)}
                                style={{ fontSize: '28px', fontWeight: 'bold', fontVariant: 'small-caps' }}
                            />
                        </h1>
                        <p className="cs-description">
                            <input
                                type="text"
                                className="cs-editable cs-editable-wide"
                                value={description || ''}
                                onChange={e => updateField('description', e.target.value)}
                                placeholder="Size type, alignment"
                                style={{ fontStyle: 'italic' }}
                            />
                        </p>
                    </div>

                    <div className="cs-divider" />

                    {/* Core Stats */}
                    <div className="cs-core-stats">
                        <div className="cs-stat-line">
                            <span className="cs-stat-label">Armor Class</span>
                            <input
                                type="number"
                                className="cs-editable cs-editable-number"
                                value={localToken.stats.ac}
                                onChange={e => updateField('stats.ac', parseInt(e.target.value) || 0)}
                            />
                            <input
                                type="text"
                                className="cs-editable"
                                value={localToken.stats.acType || ''}
                                onChange={e => updateField('stats.acType', e.target.value)}
                                placeholder="(armor type)"
                                style={{ fontStyle: 'italic', width: '120px' }}
                            />
                        </div>

                        <div className="cs-stat-line cs-hp-section">
                            <span className="cs-stat-label">Hit Points</span>
                            <input
                                type="number"
                                className="cs-editable cs-editable-number"
                                value={maxHp}
                                onChange={e => updateField('stats.hp', parseInt(e.target.value) || 0)}
                            />
                            <input
                                type="text"
                                className="cs-editable"
                                value={localToken.stats.hpFormula || ''}
                                onChange={e => updateField('stats.hpFormula', e.target.value)}
                                placeholder="(dice formula)"
                                style={{ fontStyle: 'italic', width: '100px' }}
                            />
                            <div className="cs-hp-current">
                                <span>Current:</span>
                                <span style={{ fontWeight: 'bold' }}>{currentHp}/{maxHp}</span>
                                <input
                                    type="text"
                                    className="cs-hp-input"
                                    value={hpInput}
                                    onChange={e => setHpInput(e.target.value)}
                                    onKeyDown={handleHpKeyDown}
                                    onBlur={handleHpSubmit}
                                    placeholder="+/-"
                                    title="Enter a number to set HP, or +/- to modify (e.g., -5, +3)"
                                />
                            </div>
                        </div>

                        <div className="cs-stat-line">
                            <span className="cs-stat-label">Speed</span>
                            <input
                                type="number"
                                className="cs-editable cs-editable-number"
                                value={localToken.stats.speed}
                                onChange={e => updateField('stats.speed', parseInt(e.target.value) || 0)}
                            />
                            <span>ft.</span>
                        </div>
                    </div>

                    <div className="cs-divider" />

                    {/* Attributes */}
                    <div className="cs-attributes">
                        {['str', 'dex', 'con', 'int', 'wis', 'cha'].map(attr => (
                            <div className="cs-attribute" key={attr}>
                                <div className="cs-attr-label">{attr.toUpperCase()}</div>
                                <input
                                    type="number"
                                    className="cs-editable cs-editable-number cs-attr-value"
                                    value={attrs[attr] || 10}
                                    onChange={e => {
                                        const newAttrs = { ...attrs, [attr]: parseInt(e.target.value) || 10 };
                                        updateField('stats.attributes', newAttrs);
                                    }}
                                />
                                <div className="cs-attr-modifier">({getModifier(attrs[attr] || 10)})</div>
                            </div>
                        ))}
                    </div>

                    <div className="cs-thin-divider" />

                    {/* Additional Traits */}
                    <div className="cs-traits">
                        {localToken.stats.savingThrows && Object.keys(localToken.stats.savingThrows).length > 0 && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Saving Throws </span>
                                {Object.entries(localToken.stats.savingThrows).map(([key, val], i, arr) => (
                                    <span key={key}>
                                        {key.charAt(0).toUpperCase() + key.slice(1)} {val >= 0 ? '+' : ''}{val}
                                        {i < arr.length - 1 ? ', ' : ''}
                                    </span>
                                ))}
                            </div>
                        )}

                        {localToken.stats.damageResistances && localToken.stats.damageResistances.length > 0 && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Damage Resistances </span>
                                <input
                                    type="text"
                                    className="cs-editable"
                                    value={localToken.stats.damageResistances.join(', ')}
                                    onChange={e => updateField('stats.damageResistances', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    style={{ width: '250px' }}
                                />
                            </div>
                        )}

                        {localToken.stats.conditionImmunities && localToken.stats.conditionImmunities.length > 0 && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Condition Immunities </span>
                                <input
                                    type="text"
                                    className="cs-editable"
                                    value={localToken.stats.conditionImmunities.join(', ')}
                                    onChange={e => updateField('stats.conditionImmunities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    style={{ width: '300px' }}
                                />
                            </div>
                        )}

                        {localToken.stats.senses && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Senses </span>
                                <input
                                    type="text"
                                    className="cs-editable"
                                    value={localToken.stats.senses}
                                    onChange={e => updateField('stats.senses', e.target.value)}
                                    style={{ width: '300px' }}
                                />
                            </div>
                        )}

                        {localToken.stats.languages !== undefined && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Languages </span>
                                <input
                                    type="text"
                                    className="cs-editable"
                                    value={localToken.stats.languages || '—'}
                                    onChange={e => updateField('stats.languages', e.target.value)}
                                    style={{ width: '200px' }}
                                />
                            </div>
                        )}

                        {localToken.stats.challenge !== undefined && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Challenge </span>
                                <input
                                    type="number"
                                    className="cs-editable cs-editable-number"
                                    value={localToken.stats.challenge}
                                    onChange={e => updateField('stats.challenge', parseFloat(e.target.value) || 0)}
                                />
                                {localToken.stats.xp !== undefined && (
                                    <span> ({localToken.stats.xp.toLocaleString()} XP)</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Traits/Abilities */}
                    {localToken.stats.traits && localToken.stats.traits.length > 0 && (
                        <>
                            <div className="cs-thin-divider" />
                            {localToken.stats.traits.map((trait, index) => (
                                <div className="cs-ability" key={index}>
                                    <p className="cs-ability-desc">
                                        <span className="cs-ability-name">{trait.name}. </span>
                                        {trait.description}
                                    </p>
                                </div>
                            ))}
                        </>
                    )}

                    {/* Actions */}
                    {localToken.stats.actions && localToken.stats.actions.length > 0 && (
                        <>
                            <h2 className="cs-section-title">Actions</h2>
                            {localToken.stats.actions.map((action, index) => {
                                const isWeapon = action.modifiers?.attack !== undefined;
                                return (
                                    <div
                                        className={`cs-action ${isWeapon ? 'cs-action-clickable' : ''}`}
                                        key={index}
                                        onClick={() => handleActionClick(action)}
                                        title={isWeapon ? "Click to roll attack" : undefined}
                                    >
                                        <p className="cs-ability-desc">
                                            <span className="cs-action-name">{action.name}. </span>
                                            {action.description && <span>{action.description} </span>}
                                            {action.modifiers?.attack !== undefined && (
                                                <span className="cs-action-details">
                                                    {action.range ? 'Ranged' : 'Melee'} Weapon Attack: +{action.modifiers.attack} to hit,
                                                    {action.reach && ` Reach ${action.reach} ft.`}
                                                    {action.range && ` Range ${action.range} ft.`}
                                                    {action.targets && `, ${action.targets} target${action.targets > 1 ? 's' : ''}`}.
                                                </span>
                                            )}
                                            {action.hit && (
                                                <span> Hit: {action.hit} {action.type} damage.</span>
                                            )}
                                        </p>
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {/* Legendary Actions */}
                    {localToken.stats.legendaryActions && localToken.stats.legendaryActions.length > 0 && (
                        <>
                            <h2 className="cs-section-title">Legendary Actions</h2>
                            {localToken.stats.legendaryActions.map((action, index) => (
                                <div className="cs-ability" key={index}>
                                    <p className="cs-ability-desc">
                                        <span className="cs-ability-name">{action.name}. </span>
                                        {action.description}
                                    </p>
                                </div>
                            ))}
                        </>
                    )}
                </div>


            </div>
        </div>
    );
};
