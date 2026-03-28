import { useState } from 'react';

// ─── Design tokens (from DESIGN.md "Precision Observatory") ──────────────────
const T = {
    bg:          '#0e141b',   // surface / foundation
    surface0:    '#090f16',   // surface_container_lowest
    surface1:    '#131920',   // surface_container_low
    surface2:    '#1a2333',   // surface_container
    surface3:    '#2f353d',   // surface_container_highest
    primary:     '#a4e6ff',
    primaryCont: '#00d1ff',
    ghost:       'rgba(255,255,255,0.06)', // outline_variant @15% — "felt not seen"
    onSurface:   '#c8d6e8',
    muted:       '#7f8fa8',
} as const;

// ─── Waveform amplitudes (center-line symmetric, peak at middle frame) ────────
const WAVEFORM: number[] = [
    12, 18, 25, 32, 40, 50, 58, 66, 72, 80, 86, 92, 96, 100, 98, 94, 88, 82,
    75, 68, 60, 68, 76, 84, 90, 96, 100, 96, 90, 84, 76, 68, 60, 52, 62, 72,
    80, 88, 94, 98, 100, 96, 90, 82, 74, 64, 54, 46, 38, 32, 26, 20, 16, 12,
    18, 24, 32, 42, 52, 62, 72, 80, 88, 94, 98, 94, 88, 80, 70, 60, 50, 42,
    34, 26, 20, 14, 10, 8, 12, 16,
];

// ─── Constants ────────────────────────────────────────────────────────────────

type SectionKey = 'primary' | 'secondary' | 'interim' | 'final';
type RuleKey = 'rule-a' | 'rule-b' | 'rule-c';

const SECTION_LABELS: Record<SectionKey, string> = {
    primary:   'Audio Waveform (Primary)',
    secondary: 'Audio Waveform (Secondary)',
    interim:   'Transcription List (Interim)',
    final:     'Transcription List (Final)',
};

const RULE_OPTIONS = [
    { key: 'none',   label: 'Select Rule' },
    { key: 'rule-a', label: 'Rule A (Audio)' },
    { key: 'rule-b', label: 'Rule B (Text)' },
    { key: 'rule-c', label: 'Rule C (Text)' },
];

type RuleConfig = {
    jsonpath:     string;
    codec:        string;
    sampleRate:   string;
    decodeBase64: boolean;
};

// ─── Reusable Select with focus ring (40% primary on focus, ghost at rest) ───

type SelectProps = {
    value: string;
    onChange: (v: string) => void;
    options: { key: string; label: string }[];
};
function StyledSelect({ value, onChange, options }: SelectProps) {
    const [focused, setFocused] = useState(false);
    return (
        <div style={{ position: 'relative' }}>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={{
                    width: '100%', backgroundColor: T.surface0,
                    border: `1px solid ${focused ? 'rgba(0,209,255,0.4)' : T.ghost}`,
                    color: value === 'none' ? T.muted : '#fff',
                    padding: '7px 28px 7px 10px',
                    borderRadius: '6px', fontSize: '13px',
                    appearance: 'none', cursor: 'pointer',
                    outline: 'none', transition: 'border-color 0.15s',
                }}
            >
                {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                style={{ position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <path d="M2 3.5l3 3 3-3" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    );
}

// ─── JSONPath input: real-time validation (must start with $) ─────────────────

function JsonPathInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [focused, setFocused] = useState(false);
    const isValid = value.trim().startsWith('$') && value.trim().length > 1;
    return (
        <div style={{ position: 'relative' }}>
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                spellCheck={false}
                style={{
                    width: '100%', boxSizing: 'border-box',
                    backgroundColor: T.surface0,
                    border: `1px solid ${focused ? 'rgba(0,209,255,0.4)' : T.ghost}`,
                    color: '#fff', padding: '8px 34px 8px 12px',
                    borderRadius: '6px', fontSize: '13px',
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    outline: 'none', transition: 'border-color 0.15s',
                }}
            />
            {isValid ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                    <circle cx="8" cy="8" r="7" fill="#10b981" />
                    <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                    <circle cx="8" cy="8" r="7" fill="rgba(255,174,109,0.7)" />
                    <path d="M8 5v3" stroke="#090f16" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8" cy="11" r="0.75" fill="#090f16" />
                </svg>
            )}
        </div>
    );
}

// ─── Waveform: center-line, gradient brightest at 50% (DESIGN.md spec) ───────

function Waveform() {
    return (
        <div style={{ flex: 1, height: '56px', display: 'flex', alignItems: 'center', gap: '1.5px', overflow: 'hidden' }}>
            {WAVEFORM.map((h, i) => (
                <div key={i} style={{
                    flex: 1, minWidth: '2px', height: `${h}%`,
                    // Gradient: fades toward top/bottom, brightest (100%) at center
                    background: `linear-gradient(to bottom,
                        rgba(164,230,255,0.4) 0%,
                        rgba(0,209,255,1) 50%,
                        rgba(164,230,255,0.4) 100%)`,
                    borderRadius: '2px',
                }} />
            ))}
        </div>
    );
}

// ─── Left-panel section item ──────────────────────────────────────────────────

function SectionItem({ sectionKey, boundRuleKey, onChange }: {
    sectionKey: SectionKey;
    boundRuleKey: string;
    onChange: (section: SectionKey, ruleKey: string) => void;
}) {
    const isBound = boundRuleKey !== 'none';
    return (
        <div style={{ marginBottom: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: T.onSurface, flex: 1 }}>
                    {SECTION_LABELS[sectionKey]}
                </span>
                {isBound && (
                    <span style={{
                        fontSize: '11px', fontWeight: 700, color: T.primaryCont,
                        backgroundColor: 'rgba(0,209,255,0.1)',
                        border: '1px solid rgba(0,209,255,0.22)',
                        borderRadius: '4px', padding: '1px 7px', letterSpacing: '0.03em',
                    }}>Bound</span>
                )}
            </div>
            <StyledSelect
                value={boundRuleKey}
                onChange={v => onChange(sectionKey, v)}
                options={RULE_OPTIONS}
            />
        </div>
    );
}

// ─── Rule card (expanded shows full config; collapsed shows summary row) ──────

function RuleCard({ ruleKey, ruleName, boundToSection, expanded, onToggle, config, onConfigChange }: {
    ruleKey: RuleKey;
    ruleName: string;
    boundToSection: string | null;
    expanded: boolean;
    onToggle: () => void;
    config: RuleConfig;
    onConfigChange: (patch: Partial<RuleConfig>) => void;
}) {
    const [headerHover, setHeaderHover] = useState(false);
    const isAudio = ruleKey === 'rule-a';
    const labelStyle: React.CSSProperties = {
        display: 'block', fontSize: '11px', fontWeight: 600, color: T.muted,
        marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.07em',
    };
    const codecOptions = [
        { key: 'Opus', label: 'Opus' },
        { key: 'PCM',  label: 'PCM' },
        { key: 'AAC',  label: 'AAC' },
        { key: 'MP3',  label: 'MP3' },
    ];
    const srOptions = [
        { key: '8000Hz',  label: '8000Hz' },
        { key: '16000Hz', label: '16000Hz' },
        { key: '24000Hz', label: '24000Hz' },
        { key: '44100Hz', label: '44100Hz' },
    ];

    return (
        // Ghost border @15% as accessibility fallback (no opaque section lines)
        <div style={{ backgroundColor: T.surface1, borderRadius: '10px', overflow: 'hidden', boxShadow: `0 0 0 1px ${T.ghost}` }}>

            {/* Header row */}
            <div
                onClick={onToggle}
                onMouseEnter={() => setHeaderHover(true)}
                onMouseLeave={() => setHeaderHover(false)}
                style={{
                    display: 'flex', alignItems: 'center', padding: '14px 20px', gap: '12px',
                    cursor: 'pointer', backgroundColor: headerHover ? T.surface2 : 'transparent',
                    transition: 'background-color 0.15s',
                }}
            >
                {isAudio ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <rect x="1"  y="7" width="3" height="4" rx="1" fill={T.primaryCont} />
                        <rect x="5"  y="5" width="3" height="8" rx="1" fill={T.primaryCont} />
                        <rect x="9"  y="1" width="3" height="16" rx="1" fill={T.primary} />
                        <rect x="13" y="4" width="3" height="10" rx="1" fill={T.primaryCont} />
                    </svg>
                ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="1" y="3"  width="14" height="2" rx="1" fill={T.muted} />
                        <rect x="1" y="7"  width="10" height="2" rx="1" fill={T.muted} />
                        <rect x="1" y="11" width="12" height="2" rx="1" fill={T.muted} />
                    </svg>
                )}

                <span style={{ fontWeight: 600, fontSize: '14px', color: '#fff', flexShrink: 0 }}>{ruleName}</span>

                <span style={{ color: T.muted, fontSize: '13px', flex: 1 }}>
                    Match Condition:&nbsp;
                    <span style={{ color: T.primary, fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
                        {config.jsonpath}
                    </span>
                </span>

                {/* Dynamic binding label — updates as user changes left-panel dropdowns */}
                {boundToSection && (
                    <span style={{
                        color: T.primary, fontSize: '13px', fontWeight: 500,
                        paddingLeft: '18px', marginLeft: '6px',
                        borderLeft: `1px solid ${T.ghost}`,
                        whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                        Bound to {boundToSection}
                    </span>
                )}

                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                    style={{ marginLeft: '8px', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease-out' }}>
                    <path d="M3 5l4 4 4-4" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </div>

            {/* Expanded detail — tonal depression (no border divider) */}
            {expanded && (
                <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ backgroundColor: T.bg, borderRadius: '8px', overflow: 'hidden' }}>

                        {/* Two columns: Extraction Logic | Sample Message */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                            {/* Left: Extraction Logic */}
                            <div style={{ padding: '18px', borderRight: `1px solid ${T.ghost}` }}>
                                <h3 style={{ fontSize: '11px', fontWeight: 700, color: T.onSurface, margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                                    Extraction Logic
                                </h3>

                                <label style={labelStyle}>JSONPath</label>
                                <div style={{ marginBottom: '15px' }}>
                                    <JsonPathInput
                                        value={config.jsonpath}
                                        onChange={v => onConfigChange({ jsonpath: v })}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
                                    <div>
                                        <label style={labelStyle}>Codec</label>
                                        <StyledSelect value={config.codec} onChange={v => onConfigChange({ codec: v })} options={codecOptions} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Sample Rate</label>
                                        <StyledSelect value={config.sampleRate} onChange={v => onConfigChange({ sampleRate: v })} options={srOptions} />
                                    </div>
                                </div>

                                <div
                                    onClick={() => onConfigChange({ decodeBase64: !config.decodeBase64 })}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                                >
                                    <div style={{
                                        width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                                        backgroundColor: config.decodeBase64 ? T.primaryCont : 'transparent',
                                        boxShadow: config.decodeBase64 ? 'none' : `0 0 0 1px ${T.ghost}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'background-color 0.15s',
                                    }}>
                                        {config.decodeBase64 && (
                                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                                <path d="M1 4l3 3 5-6" stroke={T.surface0} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '13px', color: T.onSurface }}>Decode Base64</span>
                                </div>
                            </div>

                            {/* Right: Sample Message JSON viewer */}
                            <div style={{ padding: '18px' }}>
                                <h3 style={{ fontSize: '11px', fontWeight: 700, color: T.onSurface, margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                                    Sample Message
                                </h3>
                                <div style={{
                                    backgroundColor: T.surface0, borderRadius: '6px', padding: '12px 14px',
                                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                                    fontSize: '12px', lineHeight: '1.65',
                                    overflowY: 'auto', maxHeight: '210px',
                                    boxShadow: `0 0 0 1px ${T.ghost}`, // ghost border as a11y fallback
                                }}>
                                    {[
                                        '{',
                                        '  "data": {',
                                        '    ".data.audio_chunk",',
                                        '    "sample": {',
                                        '      "saw_Id": "16000z",',
                                        '      "saw_mid": "12588",',
                                        '      "samplerate": 1000,',
                                        '      "status": "fel",',
                                        '      "rate_Rate": "808",',
                                        '      "contact": {',
                                        '        "sanpl": "Auto".',
                                        '      }',
                                        '    }',
                                        '  }',
                                        '}',
                                    ].map((line, i) => (
                                        // No dividers between rows (DESIGN.md: "Forbid Dividers")
                                        <div key={i} style={{ display: 'flex', gap: '16px' }}>
                                            <span style={{ color: T.surface3, minWidth: '18px', textAlign: 'right', userSelect: 'none', flexShrink: 0 }}>{i + 1}</span>
                                            <span style={{ color: T.onSurface, whiteSpace: 'pre' }}>{line}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Live Preview — deeper surface layer (surface_container_lowest) */}
                        <div style={{ backgroundColor: T.surface0, padding: '16px 18px' }}>
                            <h3 style={{ fontSize: '11px', fontWeight: 700, color: T.muted, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                                Live Preview
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                {/* Play button — "hero" element, glow per DESIGN.md */}
                                <button style={{
                                    width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                                    background: `linear-gradient(180deg, ${T.primary} 0%, ${T.primaryCont} 100%)`,
                                    border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 0 14px rgba(0,209,255,0.45)',
                                    transition: 'box-shadow 0.15s',
                                }}
                                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 22px rgba(0,209,255,0.7)')}
                                    onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 0 14px rgba(0,209,255,0.45)')}
                                >
                                    <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                                        <path d="M2 1.5l9 5-9 5V1.5z" fill={T.surface0} />
                                    </svg>
                                </button>
                                <Waveform />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ExtractionConfig() {
    // Core interaction: left-panel dropdowns → right-panel "Bound to..." labels
    // Changing a dropdown re-binds that section, potentially unbinding another
    const [sectionBindings, setSectionBindings] = useState<Record<SectionKey, string>>({
        primary:   'rule-a',
        secondary: 'rule-b',
        interim:   'rule-c',
        final:     'none',
    });

    const [expandedRule, setExpandedRule] = useState<RuleKey | null>('rule-a');

    const [ruleConfigs, setRuleConfigs] = useState<Record<RuleKey, RuleConfig>>({
        'rule-a': { jsonpath: '$.data.audio_chunk', codec: 'Opus',  sampleRate: '16000Hz', decodeBase64: true },
        'rule-b': { jsonpath: '$.data.text',        codec: 'PCM',   sampleRate: '16000Hz', decodeBase64: false },
        'rule-c': { jsonpath: '$.data.partial_text',codec: 'PCM',   sampleRate: '16000Hz', decodeBase64: false },
    });

    function handleSectionChange(section: SectionKey, ruleKey: string) {
        setSectionBindings(prev => {
            const next = { ...prev };
            // Each rule can only be bound to one section at a time
            if (ruleKey !== 'none') {
                for (const k of Object.keys(next) as SectionKey[]) {
                    if (next[k] === ruleKey && k !== section) next[k] = 'none';
                }
            }
            next[section] = ruleKey;
            return next;
        });
    }

    // Derive which section name (if any) is currently bound to a given rule
    function getBoundSection(ruleKey: RuleKey): string | null {
        const entry = Object.entries(sectionBindings).find(([, v]) => v === ruleKey);
        return entry ? SECTION_LABELS[entry[0] as SectionKey] : null;
    }

    const rules: { key: RuleKey; name: string }[] = [
        { key: 'rule-a', name: 'Rule A (Audio)' },
        { key: 'rule-b', name: 'Rule B (Text)' },
        { key: 'rule-c', name: 'Rule C (Text)' },
    ];

    return (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, backgroundColor: T.bg, color: '#fff', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>

            {/* ── Left panel ── tonal separation from bg (no border per No-Line Rule) */}
            <div style={{
                width: '280px', minWidth: '280px', backgroundColor: T.surface0,
                padding: '24px 20px', display: 'flex', flexDirection: 'column', overflowY: 'auto',
            }}>
                <h2 style={{ fontSize: '11px', fontWeight: 700, color: T.onSurface, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 24px 0' }}>
                    UI Sections
                </h2>
                {(Object.keys(SECTION_LABELS) as SectionKey[]).map(sk => (
                    <SectionItem
                        key={sk}
                        sectionKey={sk}
                        boundRuleKey={sectionBindings[sk]}
                        onChange={handleSectionChange}
                    />
                ))}
            </div>

            {/* ── Right panel ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Header — surface1 tonal lift above bg */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 28px', backgroundColor: T.surface1, flexShrink: 0 }}>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
                        Extraction Rules Management
                    </h1>
                    <button
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: `linear-gradient(180deg, ${T.primary} 0%, ${T.primaryCont} 100%)`,
                            border: 'none', color: T.surface0, padding: '8px 18px',
                            borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                        onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <line x1="6" y1="1" x2="6" y2="11" stroke={T.surface0} strokeWidth="2" strokeLinecap="round" />
                            <line x1="1" y1="6" x2="11" y2="6" stroke={T.surface0} strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        Add New Rule
                    </button>
                </div>

                {/* Rule cards list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {rules.map(r => (
                        <RuleCard
                            key={r.key}
                            ruleKey={r.key}
                            ruleName={r.name}
                            boundToSection={getBoundSection(r.key)}
                            expanded={expandedRule === r.key}
                            onToggle={() => setExpandedRule(prev => prev === r.key ? null : r.key)}
                            config={ruleConfigs[r.key]}
                            onConfigChange={patch => setRuleConfigs(prev => ({
                                ...prev,
                                [r.key]: { ...prev[r.key], ...patch },
                            }))}
                        />
                    ))}
                </div>

                {/* Footer — tonal lift, Apply All Changes */}
                <div style={{ flexShrink: 0, padding: '14px 28px', backgroundColor: T.surface1, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        style={{
                            background: `linear-gradient(180deg, ${T.primary} 0%, ${T.primaryCont} 100%)`,
                            border: 'none', color: T.surface0, padding: '10px 30px',
                            borderRadius: '7px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                        onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                    >
                        Apply All Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
