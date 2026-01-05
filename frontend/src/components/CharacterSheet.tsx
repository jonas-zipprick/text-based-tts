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
const getModifierText = (value: number): string => {
    const mod = Math.floor((value - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
};

const getModifier = (value: number): number => {
    return Math.floor((value - 10) / 2);
};

const getProficiencyBonus = (challenge: number): number => {
    if (challenge < 5) return 2;
    if (challenge < 9) return 3;
    if (challenge < 13) return 4;
    if (challenge < 17) return 5;
    if (challenge < 21) return 6;
    if (challenge < 25) return 7;
    if (challenge < 29) return 8;
    return 9;
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

interface AutoExpandingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    className?: string;
}

const AutoExpandingInput: React.FC<AutoExpandingInputProps> = ({ className = '', style, ...props }) => {
    const spanRef = useRef<HTMLSpanElement>(null);
    const [width, setWidth] = useState<number | string>('auto');

    useEffect(() => {
        if (spanRef.current) {
            setWidth(spanRef.current.offsetWidth + 2); // Small buffer
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

    // Auto-resize textareas
    const autoResizeAll = useCallback(() => {
        const textareas = document.querySelectorAll('.cs-editable-desc');
        textareas.forEach(ta => {
            const el = ta as HTMLTextAreaElement;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        });
    }, []);

    useEffect(() => {
        // Small delay to ensure styles are applied and fonts are loaded
        const timer = setTimeout(autoResizeAll, 50);
        return () => clearTimeout(timer);
    }, [autoResizeAll, localToken.stats.actions]);



    // Update handlers
    const updateField = useCallback((path: string, value: any) => {
        setLocalToken(prev => {
            const updated = { ...prev };
            const parts = path.split('.');
            let obj: any = updated;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (obj[part] === undefined) {
                    obj[part] = {};
                }
                // Correctly clone array or object
                obj[part] = Array.isArray(obj[part]) ? [...obj[part]] : { ...obj[part] };
                obj = obj[part];
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
        if (action.modifiers?.attack !== undefined || action.ability !== undefined) {
            // Attack Roll
            const d20 = Math.floor(Math.random() * 20) + 1;

            let attackMod = 0;
            let breakdownParts: string[] = [];

            if (action.ability) {
                const attrMod = getModifier(attrs[action.ability] || 10);
                attackMod += attrMod;
                breakdownParts.push(`${attrMod >= 0 ? '+' : ''}${attrMod} [${action.ability.toUpperCase()}]`);

                if (action.proficient) {
                    const pb = getProficiencyBonus(localToken.stats.challenge || 0);
                    attackMod += pb;
                    breakdownParts.push(`+${pb} [PROF]`);
                }

                const bonus = action.modifiers?.attack || 0;
                if (bonus !== 0) {
                    attackMod += bonus;
                    breakdownParts.push(`${bonus >= 0 ? '+' : ''}${bonus} [BONUS]`);
                }
            } else {
                // Legacy / Static mode
                attackMod = action.modifiers?.attack ?? 0;
                breakdownParts.push(`${attackMod >= 0 ? '+' : ''}${attackMod}`);
            }

            const attackTotal = d20 + attackMod;
            const breakdown = `${d20} ${breakdownParts.join(' ')}`;

            // Initial roll results
            let damageResults: { total: number; type?: string; formula?: string; resultText?: string }[] = [];

            // Primary Damage
            if (action.hit) {
                const dr = parseDice(action.hit);
                if (dr) {
                    damageResults.push({
                        total: dr.roll,
                        type: action.type,
                        formula: action.hit,
                        resultText: dr.text
                    });
                }
            }

            // Extra Damage
            if (action.extraDamage) {
                action.extraDamage.forEach((extra: any) => {
                    const dr = parseDice(extra.hit);
                    if (dr) {
                        damageResults.push({
                            total: dr.roll,
                            type: extra.type,
                            formula: extra.hit,
                            resultText: dr.text
                        });
                    }
                });
            }

            const rollData: RollEvent = {
                tokenName: localToken.name,
                actionName: action.name,
                attack: {
                    total: attackTotal,
                    d20,
                    mod: attackMod,
                    sign: attackMod >= 0 ? '+' : '',
                    type: d20 === 20 ? 'crit' : (d20 === 1 ? 'fail' : 'normal'),
                    breakdown
                },
                damage: damageResults.length > 0 ? damageResults : undefined
            };

            toast.custom((t) => <ToastNotification data={rollData} t={t} />, { duration: 4000 });

            if (onRoll) {
                onRoll(rollData);
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
                            <AutoExpandingInput
                                type="text"
                                className="cs-editable-wide"
                                value={localToken.name}
                                onChange={e => updateField('name', e.target.value)}
                                style={{ fontSize: '28px', fontWeight: 'bold', fontVariant: 'small-caps' }}
                            />
                        </h1>
                        <div className="cs-type-line">
                            <AutoExpandingInput
                                type="text"
                                className="cs-type-field"
                                value={localToken.size || ''}
                                onChange={e => updateField('size', e.target.value)}
                                placeholder="Size"
                            />
                            <AutoExpandingInput
                                type="text"
                                className="cs-type-field"
                                value={localToken.type || ''}
                                onChange={e => updateField('type', e.target.value)}
                                placeholder="Type"
                            />
                            {localToken.alignment !== undefined && (
                                <>
                                    <span>, </span>
                                    <AutoExpandingInput
                                        type="text"
                                        className="cs-type-field"
                                        value={localToken.alignment}
                                        onChange={e => updateField('alignment', e.target.value)}
                                        placeholder="Alignment"
                                    />
                                </>
                            )}
                        </div>
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
                            <AutoExpandingInput
                                type="text"
                                value={localToken.stats.acType || ''}
                                onChange={e => updateField('stats.acType', e.target.value)}
                                placeholder="(armor type)"
                                style={{ fontStyle: 'italic' }}
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
                            <AutoExpandingInput
                                type="text"
                                value={localToken.stats.hpFormula || ''}
                                onChange={e => updateField('stats.hpFormula', e.target.value)}
                                placeholder="(dice formula)"
                                style={{ fontStyle: 'italic' }}
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
                                <div className="cs-attr-modifier">({getModifierText(attrs[attr] || 10)})</div>
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
                                <AutoExpandingInput
                                    type="text"
                                    value={localToken.stats.damageResistances.join(', ')}
                                    onChange={e => updateField('stats.damageResistances', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                />
                            </div>
                        )}

                        {localToken.stats.damageVulnerabilities && localToken.stats.damageVulnerabilities.length > 0 && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Damage Vulnerabilities </span>
                                <AutoExpandingInput
                                    type="text"
                                    value={localToken.stats.damageVulnerabilities.join(', ')}
                                    onChange={e => updateField('stats.damageVulnerabilities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                />
                            </div>
                        )}

                        {localToken.stats.damageImmunities && localToken.stats.damageImmunities.length > 0 && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Damage Immunities </span>
                                <AutoExpandingInput
                                    type="text"
                                    value={localToken.stats.damageImmunities.join(', ')}
                                    onChange={e => updateField('stats.damageImmunities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                />
                            </div>
                        )}

                        {localToken.stats.conditionImmunities && localToken.stats.conditionImmunities.length > 0 && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Condition Immunities </span>
                                <AutoExpandingInput
                                    type="text"
                                    value={localToken.stats.conditionImmunities.join(', ')}
                                    onChange={e => updateField('stats.conditionImmunities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                />
                            </div>
                        )}

                        {localToken.stats.skills && Object.keys(localToken.stats.skills).length > 0 && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Skills </span>
                                {Object.entries(localToken.stats.skills).map(([key, val], i, arr) => (
                                    <span key={key}>
                                        {key.charAt(0).toUpperCase() + key.slice(1)} {val >= 0 ? '+' : ''}{val}
                                        {i < arr.length - 1 ? ', ' : ''}
                                    </span>
                                ))}
                            </div>
                        )}

                        {localToken.stats.senses && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Senses </span>
                                <AutoExpandingInput
                                    type="text"
                                    value={localToken.stats.senses}
                                    onChange={e => updateField('stats.senses', e.target.value)}
                                />
                            </div>
                        )}

                        {localToken.stats.languages !== undefined && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Languages </span>
                                <AutoExpandingInput
                                    type="text"
                                    value={localToken.stats.languages || '—'}
                                    onChange={e => updateField('stats.languages', e.target.value)}
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
                                const isWeapon = action.modifiers?.attack !== undefined || action.ability !== undefined;
                                return (
                                    <div className="cs-action" key={index}>
                                        <div className="cs-action-header">
                                            <input
                                                type="text"
                                                className="cs-editable cs-action-name"
                                                value={action.name}
                                                onChange={e => updateField(`stats.actions.${index}.name`, e.target.value)}
                                            />
                                            {(isWeapon || action.hit || action.extraDamage) && (
                                                <button
                                                    className="cs-roll-btn"
                                                    onClick={() => handleActionClick(action)}
                                                    title="Roll weapon attack"
                                                >
                                                    🎲 Roll
                                                </button>
                                            )}
                                        </div>
                                        <div className="cs-action-body">
                                            <textarea
                                                className="cs-editable-desc"
                                                value={action.description || ''}
                                                onChange={e => updateField(`stats.actions.${index}.description`, e.target.value)}
                                                placeholder="Action description..."
                                                rows={1}
                                                onInput={(e: any) => {
                                                    e.target.style.height = 'auto';
                                                    e.target.style.height = e.target.scrollHeight + 'px';
                                                }}
                                            />
                                            {isWeapon && (
                                                <div className="cs-action-stats">
                                                    <span>Weapon Attack: </span>
                                                    <select
                                                        className="cs-editable-select"
                                                        value={action.range ? 'Ranged' : 'Melee'}
                                                        onChange={e => {
                                                            if (e.target.value === 'Ranged') {
                                                                updateField(`stats.actions.${index}.range`, 30);
                                                                updateField(`stats.actions.${index}.reach`, undefined);
                                                            } else {
                                                                updateField(`stats.actions.${index}.reach`, 5);
                                                                updateField(`stats.actions.${index}.range`, undefined);
                                                            }
                                                        }}
                                                    >
                                                        <option value="Melee">Melee</option>
                                                        <option value="Ranged">Ranged</option>
                                                    </select>
                                                    <select
                                                        className="cs-editable-select"
                                                        value={action.ability || ''}
                                                        onChange={e => updateField(`stats.actions.${index}.ability`, e.target.value || undefined)}
                                                    >
                                                        <option value="">(None)</option>
                                                        <option value="str">STR</option>
                                                        <option value="dex">DEX</option>
                                                        <option value="con">CON</option>
                                                        <option value="int">INT</option>
                                                        <option value="wis">WIS</option>
                                                        <option value="cha">CHA</option>
                                                    </select>

                                                    {action.ability && (
                                                        <label className="cs-prof-label">
                                                            <input
                                                                type="checkbox"
                                                                checked={action.proficient || false}
                                                                onChange={e => updateField(`stats.actions.${index}.proficient`, e.target.checked)}
                                                            />
                                                            Prof
                                                        </label>
                                                    )}

                                                    <span> +</span>
                                                    <input
                                                        type="number"
                                                        className="cs-editable cs-editable-number"
                                                        value={action.modifiers?.attack || 0}
                                                        onChange={e => updateField(`stats.actions.${index}.modifiers.attack`, parseInt(e.target.value) || 0)}
                                                        style={{ width: '30px' }}
                                                    />

                                                    {action.ability && (
                                                        <span className="cs-total-bonus">
                                                            (Total: +{
                                                                getModifier(attrs[action.ability] || 10) +
                                                                (action.proficient ? getProficiencyBonus(localToken.stats.challenge || 0) : 0) +
                                                                (action.modifiers?.attack || 0)
                                                            })
                                                        </span>
                                                    )}
                                                    <span> to hit, </span>
                                                    {action.range ? (
                                                        <>
                                                            <span>Range </span>
                                                            <input
                                                                type="number"
                                                                className="cs-editable cs-editable-number"
                                                                value={action.range}
                                                                onChange={e => updateField(`stats.actions.${index}.range`, parseInt(e.target.value) || 0)}
                                                            />
                                                            <span> ft.</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span>Reach </span>
                                                            <input
                                                                type="number"
                                                                className="cs-editable cs-editable-number"
                                                                value={action.reach || 5}
                                                                onChange={e => updateField(`stats.actions.${index}.reach`, parseInt(e.target.value) || 0)}
                                                            />
                                                            <span> ft.</span>
                                                        </>
                                                    )}
                                                    <span>, </span>
                                                    <input
                                                        type="number"
                                                        className="cs-editable cs-editable-number"
                                                        value={action.targets || 1}
                                                        onChange={e => updateField(`stats.actions.${index}.targets`, parseInt(e.target.value) || 1)}
                                                    />
                                                    <span> target(s).</span>
                                                </div>
                                            )}
                                            <div className="cs-action-hit-row">
                                                <span>Hit: </span>
                                                <AutoExpandingInput
                                                    type="text"
                                                    value={action.hit || ''}
                                                    onChange={e => updateField(`stats.actions.${index}.hit`, e.target.value)}
                                                    placeholder="dice (e.g. 1d8+2)"
                                                />
                                                <AutoExpandingInput
                                                    type="text"
                                                    value={action.type || ''}
                                                    onChange={e => updateField(`stats.actions.${index}.type`, e.target.value)}
                                                    placeholder="type"
                                                    style={{ fontStyle: 'italic' }}
                                                />
                                                <span> damage.</span>
                                            </div>
                                            {action.extraDamage && action.extraDamage.map((extra: any, eIdx: number) => (
                                                <div className="cs-action-hit-row" key={eIdx}>
                                                    <span>plus </span>
                                                    <AutoExpandingInput
                                                        type="text"
                                                        value={extra.hit || ''}
                                                        onChange={e => updateField(`stats.actions.${index}.extraDamage.${eIdx}.hit`, e.target.value)}
                                                        placeholder="dice"
                                                    />
                                                    <AutoExpandingInput
                                                        type="text"
                                                        value={extra.type || ''}
                                                        onChange={e => updateField(`stats.actions.${index}.extraDamage.${eIdx}.type`, e.target.value)}
                                                        placeholder="type"
                                                        style={{ fontStyle: 'italic' }}
                                                    />
                                                    <span> damage.</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {/* Legendary Actions */}
                    {localToken.stats.legendaryActions && localToken.stats.legendaryActions.length > 0 && (
                        <>
                            <h2 className="cs-section-title">Legendary Actions</h2>
                            {localToken.stats.legendaryActions.map((action, index) => {
                                const isRollable = action.modifiers?.attack !== undefined || action.ability !== undefined || action.hit !== undefined;
                                return (
                                    <div className="cs-action" key={index}>
                                        <div className="cs-action-header">
                                            <input
                                                type="text"
                                                className="cs-editable cs-action-name"
                                                value={action.name}
                                                onChange={e => updateField(`stats.legendaryActions.${index}.name`, e.target.value)}
                                            />
                                            {isRollable && (
                                                <button
                                                    className="cs-roll-btn"
                                                    onClick={() => handleActionClick(action)}
                                                    title="Roll action"
                                                >
                                                    🎲 Roll
                                                </button>
                                            )}
                                        </div>
                                        <div className="cs-action-body">
                                            <textarea
                                                className="cs-editable-desc"
                                                value={action.description || ''}
                                                onChange={e => updateField(`stats.legendaryActions.${index}.description`, e.target.value)}
                                                placeholder="Action description..."
                                                rows={1}
                                                onInput={(e: any) => {
                                                    e.target.style.height = 'auto';
                                                    e.target.style.height = e.target.scrollHeight + 'px';
                                                }}
                                            />
                                            {(action.modifiers?.attack !== undefined || action.ability !== undefined) && (
                                                <div className="cs-action-stats">
                                                    <span>Weapon Attack: </span>
                                                    <select
                                                        className="cs-editable-select"
                                                        value={action.ability || ''}
                                                        onChange={e => updateField(`stats.legendaryActions.${index}.ability`, e.target.value || undefined)}
                                                    >
                                                        <option value="">(None)</option>
                                                        <option value="str">STR</option>
                                                        <option value="dex">DEX</option>
                                                        <option value="con">CON</option>
                                                        <option value="int">INT</option>
                                                        <option value="wis">WIS</option>
                                                        <option value="cha">CHA</option>
                                                    </select>

                                                    {action.ability && (
                                                        <label className="cs-prof-label">
                                                            <input
                                                                type="checkbox"
                                                                checked={action.proficient || false}
                                                                onChange={e => updateField(`stats.legendaryActions.${index}.proficient`, e.target.checked)}
                                                            />
                                                            Prof
                                                        </label>
                                                    )}

                                                    <span> +</span>
                                                    <input
                                                        type="number"
                                                        className="cs-editable cs-editable-number"
                                                        value={action.modifiers?.attack || 0}
                                                        onChange={e => updateField(`stats.legendaryActions.${index}.modifiers.attack`, parseInt(e.target.value) || 0)}
                                                        style={{ width: '30px' }}
                                                    />

                                                    {action.ability && (
                                                        <span className="cs-total-bonus">
                                                            (Total: +{
                                                                getModifier(attrs[action.ability] || 10) +
                                                                (action.proficient ? getProficiencyBonus(localToken.stats.challenge || 0) : 0) +
                                                                (action.modifiers?.attack || 0)
                                                            })
                                                        </span>
                                                    )}
                                                    <span> to hit, </span>
                                                </div>
                                            )}
                                            {(action.hit || action.extraDamage) && (
                                                <div className="cs-action-hit-row">
                                                    <span>Hit: </span>
                                                    <AutoExpandingInput
                                                        type="text"
                                                        value={action.hit || ''}
                                                        onChange={e => updateField(`stats.legendaryActions.${index}.hit`, e.target.value)}
                                                        placeholder="dice"
                                                    />
                                                    <AutoExpandingInput
                                                        type="text"
                                                        value={action.type || ''}
                                                        onChange={e => updateField(`stats.legendaryActions.${index}.type`, e.target.value)}
                                                        placeholder="type"
                                                        style={{ fontStyle: 'italic' }}
                                                    />
                                                    <span> damage.</span>
                                                </div>
                                            )}
                                            {action.extraDamage && action.extraDamage.map((extra: any, eIdx: number) => (
                                                <div className="cs-action-hit-row" key={eIdx}>
                                                    <span>plus </span>
                                                    <AutoExpandingInput
                                                        type="text"
                                                        value={extra.hit || ''}
                                                        onChange={e => updateField(`stats.legendaryActions.${index}.extraDamage.${eIdx}.hit`, e.target.value)}
                                                        placeholder="dice"
                                                    />
                                                    <AutoExpandingInput
                                                        type="text"
                                                        value={extra.type || ''}
                                                        onChange={e => updateField(`stats.legendaryActions.${index}.extraDamage.${eIdx}.type`, e.target.value)}
                                                        placeholder="type"
                                                        style={{ fontStyle: 'italic' }}
                                                    />
                                                    <span> damage.</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>


            </div>
        </div>
    );
};
