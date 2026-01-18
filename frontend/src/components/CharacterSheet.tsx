import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';

import type { Token, RollEvent, TokenAttack, Spell } from '../../../shared';

import { AutoExpandingInput } from './AutoExpandingInput';
import { ToastNotification } from './ToastNotification';
import { getAttrModifier, getProficiencyBonus } from '../utils/dndGameLogic.ts';
import { useDebounce } from '../utils/react.ts';

import './CharacterSheet.css';

interface CharacterSheetProps {
    token: Token;
    onClose: () => void;
    onUpdate: (tokenId: number, updates: Partial<Token>) => void;
    onRoll?: (data: RollEvent) => void;
    isGM?: boolean;
}

// Calculate attribute modifier
const getModifierText = (value: number): string => {
    const mod = Math.floor((value - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
};

export const CharacterSheet: React.FC<CharacterSheetProps> = ({ token, onClose, onUpdate, onRoll, isGM }) => {
    // Local state for editing
    const [localToken, setLocalToken] = useState<Token>(token);
    const [hpInput, setHpInput] = useState('');
    const [newSessionId, setNewSessionId] = useState('');
    // Track when we're waiting for our own save to complete
    const pendingSaveRef = useRef<string | null>(null);

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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { position, ...updates } = debouncedToken;
            onUpdate(debouncedToken.id, updates as Partial<Token>);
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
    }, [autoResizeAll, localToken.stats.attacks]);

    const updateField = useCallback((path: string, value: unknown) => {
        setLocalToken(prev => {
            const updated = { ...prev };
            const parts = path.split('.');
            let obj: Record<string, unknown> = updated;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (obj[part] === undefined) {
                    obj[part] = {};
                }
                // Correctly clone array or object
                obj[part] = Array.isArray(obj[part]) ? [...obj[part] as unknown[]] : { ...(obj[part] as Record<string, unknown>) };
                obj = obj[part] as Record<string, unknown>;
            }
            obj[parts[parts.length - 1]] = value;
            return updated;
        });
    }, []);

    const handleAddSessionId = () => {
        if (!newSessionId.trim()) return;
        const currentControllers = localToken.controlled_by || [];
        if (currentControllers.some(c => c.sessionId === newSessionId)) {
            setNewSessionId('');
            return;
        }

        const newControllers = [...currentControllers, { sessionId: newSessionId.trim() }];
        // Directly update local token AND trigger update
        updateField('controlled_by', newControllers);
        setNewSessionId('');
    };

    const handleRemoveSessionId = (sid: string) => {
        const currentControllers = localToken.controlled_by || [];
        const newControllers = currentControllers.filter(c => c.sessionId !== sid);
        updateField('controlled_by', newControllers);
    };

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

    const handleActionClick = (action: TokenAttack) => {
        if (action.modifiers?.attack !== undefined || action.ability !== undefined) {
            // Attack Roll
            const d20 = Math.floor(Math.random() * 20) + 1;

            let attackMod = 0;
            const breakdownParts: string[] = [];

            if (action.ability) {
                const attrMod = getAttrModifier(attrs[action.ability] || 10);
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
            const damageResults: { total: number; type?: string; formula?: string; resultText?: string }[] = [];

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
                action.extraDamage.forEach((extra) => {
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
            if (onRoll) onRoll(rollData);
        }
    };



    const handleSpellClick = (spell: Spell) => {
        // Spell Slot Logic
        if (spell.level > 0 && localToken.stats.spellSlots) {
            const slotLevel = spell.level.toString();
            const slots = localToken.stats.spellSlots[slotLevel];

            if (slots) {
                if (slots.used >= slots.max) {
                    toast.error(`No Level ${spell.level} spell slots available!`);
                    return;
                }

                // Consume slot
                // Update local and trigger save
                const newUsed = slots.used + 1;
                updateField(`stats.spellSlots.${slotLevel}.used`, newUsed);
            }
        }

        // Spell Slot Logic
        if (spell.level > 0 && localToken.stats.spellSlots) {
            const slotLevel = spell.level.toString();
            const slots = localToken.stats.spellSlots[slotLevel];

            if (slots) {
                if (slots.used >= slots.max) {
                    toast.error(`No Level ${spell.level} spell slots available!`);
                    return;
                }

                // Consume slot
                // Update local and trigger save
                const newUsed = slots.used + 1;
                updateField(`stats.spellSlots.${slotLevel}.used`, newUsed);
            }
        }

        let attackData: RollEvent['attack'] = undefined;
        const breakdownParts: string[] = [];

        // Attack Roll
        if (spell.attack_bonus) {
            const d20 = Math.floor(Math.random() * 20) + 1;

            // Try parsing attack bonus as number or dice formula? usually just a number string in APIs
            // If string "8" -> 8. If "1d4+2" -> well, 5e usually represents spell attacks as flat modifiers.
            // Schema says string, but let's try strict parse.
            let mod = parseInt(String(spell.attack_bonus), 10);
            if (isNaN(mod)) mod = 0; // Fallback

            const total = d20 + mod;
            breakdownParts.push(`${mod >= 0 ? '+' : ''}${mod}`);

            const attackType: 'crit' | 'fail' | 'normal' = d20 === 20 ? 'crit' : (d20 === 1 ? 'fail' : 'normal');
            attackData = {
                total,
                d20,
                mod,
                sign: mod >= 0 ? '+' : '',
                type: attackType,
                breakdown: `${d20} ${breakdownParts.join(' ')}`
            };
        }

        // Damage
        const damageResults: { total: number; type?: string; formula?: string; resultText?: string }[] = [];
        if (spell.damage && spell.damage.dice) {
            const dr = parseDice(spell.damage.dice);
            if (dr) {
                damageResults.push({
                    total: dr.roll,
                    type: spell.damage.type,
                    formula: spell.damage.dice,
                    resultText: dr.text
                });
            }
        }

        // Save
        let saveData = undefined;
        if (spell.save) {
            saveData = {
                dc: spell.save.dc || 10,
                ability: spell.save.ability
            };
        }

        const rollData: RollEvent = {
            tokenName: localToken.name,
            actionName: spell.name,
            attack: attackData,
            save: saveData,
            damage: damageResults.length > 0 ? damageResults : undefined
        };

        toast.custom((t) => <ToastNotification data={rollData} t={t} />, { duration: 4000 });
        if (onRoll) onRoll(rollData);
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
                                
                                className="cs-editable-wide"
                                value={localToken.name}
                                onChange={e => updateField('name', e.target.value)}
                                style={{ fontSize: '28px', fontWeight: 'bold', fontVariant: 'small-caps' }}
                            />
                        </h1>
                        <div className="cs-type-line">
                            <AutoExpandingInput
                                
                                className="cs-type-field"
                                value={localToken.size || ''}
                                onChange={e => updateField('size', e.target.value)}
                                placeholder="Size"
                            />
                            <AutoExpandingInput
                                
                                className="cs-type-field"
                                value={localToken.type || ''}
                                onChange={e => updateField('type', e.target.value)}
                                placeholder="Type"
                            />
                            {localToken.alignment !== undefined && (
                                <>
                                    <span>, </span>
                                    <AutoExpandingInput
                                        
                                        className="cs-type-field"
                                        value={localToken.alignment}
                                        onChange={e => updateField('alignment', e.target.value)}
                                        placeholder="Alignment"
                                    />
                                </>
                            )}
                        </div>
                        {isGM && (
                            <div className="cs-controlled-by">
                                <span className="cs-label-small">Controlled by: </span>
                                {localToken.controlled_by?.map((c, i) => (
                                    <span key={i} className="cs-controller-tag">
                                        {c.sessionId}
                                        <button
                                            className="cs-remove-controller"
                                            onClick={() => handleRemoveSessionId(c.sessionId)}
                                            title="Remove Controller"
                                        >×</button>
                                    </span>
                                ))}
                                <div className="cs-add-controller">
                                    <input
                                        
                                        value={newSessionId}
                                        onChange={e => setNewSessionId(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddSessionId()}
                                        placeholder="Session ID"
                                        className="cs-input-small"
                                    />
                                    <button onClick={handleAddSessionId} className="cs-btn-small" title="Add Session ID">+</button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="cs-divider" />

                    {/* Core Stats */}
                    <div className="cs-core-stats">
                        <div className="cs-stat-line">
                            <span className="cs-stat-label">Armor Class</span>
                            <AutoExpandingInput
                                
                                value={localToken.stats.ac}
                                onChange={e => updateField('stats.ac', parseInt(e.target.value) || '')}
                            />
                            <AutoExpandingInput
                                
                                value={localToken.stats.acType || ''}
                                onChange={e => updateField('stats.acType', e.target.value)}
                                placeholder="(armor type)"
                                style={{ fontStyle: 'italic' }}
                            />
                        </div>

                        <div className="cs-stat-line cs-hp-section">
                            <span className="cs-stat-label">Hit Points</span>
                            <AutoExpandingInput
                                
                                value={maxHp}
                                onChange={e => updateField('stats.hp', parseInt(e.target.value) || '')}
                            />
                            <AutoExpandingInput
                                
                                value={localToken.stats.hpFormula || ''}
                                onChange={e => updateField('stats.hpFormula', e.target.value)}
                                placeholder="(dice formula)"
                                style={{ fontStyle: 'italic' }}
                            />
                            <div className="cs-hp-current">
                                <span>Current:</span>
                                <span style={{ fontWeight: 'bold' }}>{currentHp}/{maxHp}</span>
                                <AutoExpandingInput
                                    
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
                            <AutoExpandingInput
                                
                                className="cs-editable"
                                value={localToken.stats.speed}
                                onChange={e => updateField('stats.speed', e.target.value ? parseInt(e.target.value) : '')}
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
                                <AutoExpandingInput
                                    
                                    className="cs-attr-value"
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
                                    
                                    value={localToken.stats.damageResistances.join(', ')}
                                    onChange={e => updateField('stats.damageResistances', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                />
                            </div>
                        )}

                        {localToken.stats.damageVulnerabilities && localToken.stats.damageVulnerabilities.length > 0 && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Damage Vulnerabilities </span>
                                <AutoExpandingInput
                                    
                                    value={localToken.stats.damageVulnerabilities.join(', ')}
                                    onChange={e => updateField('stats.damageVulnerabilities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                />
                            </div>
                        )}

                        {localToken.stats.damageImmunities && localToken.stats.damageImmunities.length > 0 && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Damage Immunities </span>
                                <AutoExpandingInput
                                    
                                    value={localToken.stats.damageImmunities.join(', ')}
                                    onChange={e => updateField('stats.damageImmunities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                />
                            </div>
                        )}

                        {localToken.stats.conditionImmunities && localToken.stats.conditionImmunities.length > 0 && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Condition Immunities </span>
                                <AutoExpandingInput
                                    
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
                                    
                                    value={localToken.stats.senses}
                                    onChange={e => updateField('stats.senses', e.target.value)}
                                />
                            </div>
                        )}

                        {localToken.stats.languages !== undefined && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Languages </span>
                                <AutoExpandingInput
                                    
                                    value={localToken.stats.languages || '—'}
                                    onChange={e => updateField('stats.languages', e.target.value)}
                                />
                            </div>
                        )}

                        {localToken.stats.challenge !== undefined && (
                            <div className="cs-trait-line">
                                <span className="cs-trait-label">Challenge </span>
                                <AutoExpandingInput
                                    
                                    value={localToken.stats.challenge}
                                    onChange={e => updateField('stats.challenge', parseFloat(e.target.value) || '')}
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

                    {/* Attacks */}
                    {localToken.stats.attacks && localToken.stats.attacks.length > 0 && (
                        <>
                            <h2 className="cs-section-title">Attacks</h2>
                            {localToken.stats.attacks.map((action, index) => {
                                if (action.legendary) return null;
                                const isWeapon = action.modifiers?.attack !== undefined || action.ability !== undefined;
                                return (
                                    <div className="cs-action" key={index}>
                                        <div className="cs-action-header">
                                            <input
                                                
                                                className="cs-editable cs-action-name"
                                                value={action.name}
                                                onChange={e => updateField(`stats.attacks.${index}.name`, e.target.value)}
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
                                                onChange={e => updateField(`stats.attacks.${index}.description`, e.target.value)}
                                                placeholder="Action description..."
                                                rows={1}
                                                onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
                                                    (e.target as HTMLTextAreaElement).style.height = 'auto';
                                                    (e.target as HTMLTextAreaElement).style.height = (e.target as HTMLTextAreaElement).scrollHeight + 'px';
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
                                                                updateField(`stats.attacks.${index}.range`, 30);
                                                                updateField(`stats.attacks.${index}.reach`, undefined);
                                                            } else {
                                                                updateField(`stats.attacks.${index}.reach`, 5);
                                                                updateField(`stats.attacks.${index}.range`, undefined);
                                                            }
                                                        }}
                                                    >
                                                        <option value="Melee">Melee</option>
                                                        <option value="Ranged">Ranged</option>
                                                    </select>
                                                    <select
                                                        className="cs-editable-select"
                                                        value={action.ability || ''}
                                                        onChange={e => updateField(`stats.attacks.${index}.ability`, e.target.value || undefined)}
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
                                                                onChange={e => updateField(`stats.attacks.${index}.proficient`, e.target.checked)}
                                                            />
                                                            Prof
                                                        </label>
                                                    )}

                                                    <span> +</span>
                                                    <AutoExpandingInput
                                                        
                                                        value={action.modifiers?.attack || 0}
                                                        onChange={e => updateField(`stats.attacks.${index}.modifiers.attack`, parseInt(e.target.value) || '')}
                                                        style={{ width: '30px' }}
                                                    />

                                                    {action.ability && (
                                                        <span className="cs-total-bonus">
                                                            (Total: +{
                                                                getAttrModifier(attrs[action.ability] || 10) +
                                                                (action.proficient ? getProficiencyBonus(localToken.stats.challenge || 0) : 0) +
                                                                (action.modifiers?.attack || 0)
                                                            })
                                                        </span>
                                                    )}
                                                    <span> to hit, </span>
                                                    {action.range ? (
                                                        <>
                                                            <span>Range </span>
                                                            <AutoExpandingInput
                                                                
                                                                value={action.range}
                                                                onChange={e => updateField(`stats.attacks.${index}.range`, parseInt(e.target.value) || '')}
                                                            />
                                                            <span> ft.</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span>Reach </span>
                                                            <AutoExpandingInput
                                                                
                                                                value={action.reach || 5}
                                                                onChange={e => updateField(`stats.attacks.${index}.reach`, parseInt(e.target.value) || '')}
                                                            />
                                                            <span> ft.</span>
                                                        </>
                                                    )}
                                                    <span>, </span>
                                                    <AutoExpandingInput
                                                        
                                                        value={action.targets || 1}
                                                        onChange={e => updateField(`stats.attacks.${index}.targets`, parseInt(e.target.value) || 1)}
                                                    />
                                                    <span> target(s).</span>
                                                </div>
                                            )}
                                            <div className="cs-action-hit-row">
                                                <span>Hit: </span>
                                                <AutoExpandingInput
                                                    
                                                    value={action.hit || ''}
                                                    onChange={e => updateField(`stats.attacks.${index}.hit`, e.target.value)}
                                                    placeholder="dice (e.g. 1d8+2)"
                                                />
                                                <AutoExpandingInput
                                                    
                                                    value={action.type || ''}
                                                    onChange={e => updateField(`stats.attacks.${index}.type`, e.target.value)}
                                                    placeholder="type"
                                                    style={{ fontStyle: 'italic' }}
                                                />
                                                <span> damage.</span>
                                            </div>
                                            {action.extraDamage && action.extraDamage.map((extra, eIdx) => (
                                                <div className="cs-action-hit-row" key={eIdx}>
                                                    <span>plus </span>
                                                    <AutoExpandingInput
                                                        
                                                        value={extra.hit || ''}
                                                        onChange={e => updateField(`stats.attacks.${index}.extraDamage.${eIdx}.hit`, e.target.value)}
                                                        placeholder="dice"
                                                    />
                                                    <AutoExpandingInput
                                                        
                                                        value={extra.type || ''}
                                                        onChange={e => updateField(`stats.attacks.${index}.extraDamage.${eIdx}.type`, e.target.value)}
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

                    {/* Spells */}
                    {localToken.stats.spells && localToken.stats.spells.length > 0 && (
                        <>
                            <h2 className="cs-section-title">Spells</h2>

                            {/* Spell Slots */}
                            <div className="cs-spell-slots-section">
                                <h3 className="cs-section-subtitle">Spell Slots</h3>
                                <div className="cs-slots-grid">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                                        const slots = localToken.stats.spellSlots?.[level.toString()] || { max: 0, used: 0 };
                                        // Only show if max > 0, or if we want to allow editing?
                                        // Let's show all for now so they can be edited.
                                        // Or maybe just show 1-5 by default?
                                        return (
                                            <div key={level} className="cs-slot-row">
                                                <span className="cs-slot-label">Lvl {level}</span>
                                                <div className="cs-slot-tracker">
                                                    {/* Squares for max slots */}
                                                    {Array.from({ length: Math.max(slots.max, 4) }).map((_, i) => {
                                                        if (i < slots.max) {
                                                            return (
                                                                <input
                                                                    key={i}
                                                                    type="checkbox"
                                                                    className="cs-slot-checkbox"
                                                                    checked={i < slots.used}
                                                                    onChange={() => {
                                                                        const newUsed = i < slots.used ? i : i + 1;
                                                                        updateField(`stats.spellSlots.${level}.used`, newUsed);
                                                                    }}
                                                                />
                                                            );
                                                        }
                                                        return null;
                                                    })}
                                                    {/* Edit Max */}
                                                    <input
                                                        type="number"
                                                        className="cs-slot-max-input"
                                                        value={slots.max}
                                                        onChange={e => updateField(`stats.spellSlots.${level}.max`, parseInt(e.target.value) || 0)}
                                                        title="Max Slots"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            {localToken.stats.spells.map((spell, index) => {
                                const levelText = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;


                                const slotLevel = spell.level.toString();
                                const slots = localToken.stats.spellSlots?.[slotLevel];
                                const hasSlots = spell.level === 0 || (slots ? slots.used < slots.max : false);

                                return (
                                    <div className="cs-action" key={index}>
                                        <div className="cs-action-header">
                                            <input
                                                
                                                className="cs-editable cs-action-name"
                                                value={spell.name}
                                                onChange={e => updateField(`stats.spells.${index}.name`, e.target.value)}
                                            />
                                            <span className="cs-spell-meta">
                                                {levelText} - {spell.school}
                                            </span>
                                            <button
                                                className={`cs-roll-btn ${!hasSlots ? 'cs-btn-disabled' : ''}`}
                                                onClick={() => hasSlots ? handleSpellClick(spell) : toast.error("No spell slots!")}
                                                title={hasSlots ? "Cast spell" : "No spell slots available"}
                                                disabled={!hasSlots}
                                            >
                                                ✨ Cast
                                            </button>
                                        </div>
                                        <div className="cs-action-body">
                                            <div className="cs-spell-details">
                                                <span>Time: </span>
                                                <AutoExpandingInput  value={spell.casting_time} onChange={e => updateField(`stats.spells.${index}.casting_time`, e.target.value)} />
                                                <span> | Range: </span>
                                                <AutoExpandingInput  value={spell.range} onChange={e => updateField(`stats.spells.${index}.range`, e.target.value)} />
                                                <span> | Dur: </span>
                                                <AutoExpandingInput  value={spell.duration} onChange={e => updateField(`stats.spells.${index}.duration`, e.target.value)} />
                                            </div>
                                            <div className="cs-spell-comps">
                                                <label><input type="checkbox" checked={spell.components.verbal} onChange={e => updateField(`stats.spells.${index}.components.verbal`, e.target.checked)} /> V</label>
                                                <label><input type="checkbox" checked={spell.components.somatic} onChange={e => updateField(`stats.spells.${index}.components.somatic`, e.target.checked)} /> S</label>
                                                <label><input type="checkbox" checked={spell.components.material} onChange={e => updateField(`stats.spells.${index}.components.material`, e.target.checked)} /> M</label>
                                                {spell.components.material && (
                                                    <AutoExpandingInput
                                                        
                                                        value={spell.components.material_cost || ''}
                                                        onChange={e => updateField(`stats.spells.${index}.components.material_cost`, e.target.value)}
                                                        placeholder="(materials)"
                                                        style={{ fontStyle: 'italic', marginLeft: '4px' }}
                                                    />
                                                )}
                                            </div>

                                            <textarea
                                                className="cs-editable-desc"
                                                value={spell.description || ''}
                                                onChange={e => updateField(`stats.spells.${index}.description`, e.target.value)}
                                                placeholder="Spell description..."
                                                rows={1}
                                                onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
                                                    (e.target as HTMLTextAreaElement).style.height = 'auto';
                                                    (e.target as HTMLTextAreaElement).style.height = (e.target as HTMLTextAreaElement).scrollHeight + 'px';
                                                }}
                                            />

                                            {/* Spell Stats (Attack/Save/Damage) */}
                                            <div className="cs-action-stats">
                                                {(spell.attack_bonus !== undefined || (spell.damage && spell.damage.dice)) && (
                                                    <div className="cs-action-hit-row">
                                                        {spell.attack_bonus !== undefined && (
                                                            <>
                                                                <span>Attack: +</span>
                                                                <AutoExpandingInput
                                                                    
                                                                    value={spell.attack_bonus}
                                                                    onChange={e => updateField(`stats.spells.${index}.attack_bonus`, e.target.value)}
                                                                />
                                                            </>
                                                        )}
                                                        {spell.damage && (
                                                            <>
                                                                <span style={{ marginLeft: spell.attack_bonus ? '8px' : '0' }}>Damage: </span>
                                                                <AutoExpandingInput
                                                                    
                                                                    value={spell.damage.dice}
                                                                    onChange={e => updateField(`stats.spells.${index}.damage.dice`, e.target.value)}
                                                                />
                                                                <AutoExpandingInput
                                                                    
                                                                    value={spell.damage.type}
                                                                    onChange={e => updateField(`stats.spells.${index}.damage.type`, e.target.value)}
                                                                    style={{ fontStyle: 'italic' }}
                                                                />
                                                            </>
                                                        )}
                                                    </div>
                                                )}

                                                {spell.save && (
                                                    <div className="cs-action-hit-row">
                                                        <span>Save: DC </span>
                                                        <AutoExpandingInput
                                                            
                                                            value={spell.save.dc || ''}
                                                            onChange={e => updateField(`stats.spells.${index}.save.dc`, parseInt(e.target.value))}
                                                        />
                                                        <select
                                                            className="cs-editable-select"
                                                            value={spell.save.ability}
                                                            onChange={e => updateField(`stats.spells.${index}.save.ability`, e.target.value)}
                                                        >
                                                            <option value="str">STR</option>
                                                            <option value="dex">DEX</option>
                                                            <option value="con">CON</option>
                                                            <option value="int">INT</option>
                                                            <option value="wis">WIS</option>
                                                            <option value="cha">CHA</option>
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {/* Legendary Actions */}
                    {localToken.stats.attacks && localToken.stats.attacks.some(a => a.legendary) && (
                        <>
                            <h2 className="cs-section-title">Legendary Actions</h2>
                            {localToken.stats.attacks.map((action, index) => {
                                if (!action.legendary) return null;
                                const isRollable = action.modifiers?.attack !== undefined || action.ability !== undefined || action.hit !== undefined;
                                return (
                                    <div className="cs-action" key={index}>
                                        <div className="cs-action-header">
                                            <input
                                                
                                                className="cs-editable cs-action-name"
                                                value={action.name}
                                                onChange={e => updateField(`stats.attacks.${index}.name`, e.target.value)}
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
                                                onChange={e => updateField(`stats.attacks.${index}.description`, e.target.value)}
                                                placeholder="Action description..."
                                                rows={1}
                                                onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
                                                    (e.target as HTMLTextAreaElement).style.height = 'auto';
                                                    (e.target as HTMLTextAreaElement).style.height = (e.target as HTMLTextAreaElement).scrollHeight + 'px';
                                                }}
                                            />
                                            {(action.modifiers?.attack !== undefined || action.ability !== undefined) && (
                                                <div className="cs-action-stats">
                                                    <span>Weapon Attack: </span>
                                                    <select
                                                        className="cs-editable-select"
                                                        value={action.ability || ''}
                                                        onChange={e => updateField(`stats.attacks.${index}.ability`, e.target.value || undefined)}
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
                                                                onChange={e => updateField(`stats.attacks.${index}.proficient`, e.target.checked)}
                                                            />
                                                            Prof
                                                        </label>
                                                    )}

                                                    <span> +</span>
                                                    <AutoExpandingInput
                                                        
                                                        value={action.modifiers?.attack || ''}
                                                        onChange={e => updateField(`stats.attacks.${index}.modifiers.attack`, parseInt(e.target.value) || '')}
                                                        style={{ width: '30px' }}
                                                    />

                                                    {action.ability && (
                                                        <span className="cs-total-bonus">
                                                            (Total: +{
                                                                getAttrModifier(attrs[action.ability] || 10) +
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
                                                        
                                                        value={action.hit || ''}
                                                        onChange={e => updateField(`stats.attacks.${index}.hit`, e.target.value)}
                                                        placeholder="dice"
                                                    />
                                                    <AutoExpandingInput
                                                        
                                                        value={action.type || ''}
                                                        onChange={e => updateField(`stats.attacks.${index}.type`, e.target.value)}
                                                        placeholder="type"
                                                        style={{ fontStyle: 'italic' }}
                                                    />
                                                    <span> damage.</span>
                                                </div>
                                            )}
                                            {action.extraDamage && action.extraDamage.map((extra, eIdx) => (
                                                <div className="cs-action-hit-row" key={eIdx}>
                                                    <span>plus </span>
                                                    <AutoExpandingInput
                                                        
                                                        value={extra.hit || ''}
                                                        onChange={e => updateField(`stats.attacks.${index}.extraDamage.${eIdx}.hit`, e.target.value)}
                                                        placeholder="dice"
                                                    />
                                                    <AutoExpandingInput
                                                        
                                                        value={extra.type || ''}
                                                        onChange={e => updateField(`stats.attacks.${index}.extraDamage.${eIdx}.type`, e.target.value)}
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
