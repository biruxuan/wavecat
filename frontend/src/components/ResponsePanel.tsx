import React from "react";
import type { Frame } from "../types";

const T = {
    bg: '#0e141b',
    surface0: '#090f16',
    surface1: '#131920',
    ghost: 'rgba(255,255,255,0.06)',
    outline: 'rgba(255,255,255,0.35)',
    textDim: 'rgba(255,255,255,0.4)',
    primary: '#a4e6ff',
    primaryCont: '#00d1ff',
};

type Props = {
    frame: Frame | null | undefined;
    sessionSummary: any;
    liveText: string;
    playbackWaveform: number[];
    playbackPositionSec: number;
    playbackTotalDurationSec: number;
    collapsed: boolean;
    dragActive: boolean;
    onToggleCollapsed: () => void;
};

function formatTime(secs: number): string {
    const s = Math.floor(Math.max(0, secs));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function statusColor(status: string | undefined): string {
    if (!status) return T.textDim;
    switch (status) {
        case 'running': return '#4ade80';
        case 'done': return T.primaryCont;
        case 'error': return '#f87171';
        default: return T.textDim;
    }
}

export function ResponsePanel(props: Props) {
    if (props.collapsed) {
        return (
            <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: T.surface0 }} onClick={props.onToggleCollapsed}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: "uppercase", fontSize: "11px", color: T.outline, fontWeight: 600 }}>RESPONSE STREAM</div>
                <div style={{ fontSize: '14px', color: T.textDim }}>▲</div>
            </div>
        );
    }

    const BARS = 60;
    const waveSlots = props.playbackWaveform.slice(-BARS);
    const hasWave = waveSlots.length > 0;

    const recentSlots = props.playbackWaveform.slice(-5);
    const peakLevel = recentSlots.length > 0 ? Math.max(...recentSlots) : 0;
    const levelBarsActive = Math.round(peakLevel * 20);

    const totalDur = props.playbackTotalDurationSec || 0;
    const positionSec = props.playbackPositionSec || 0;
    const progressPct = totalDur > 0 ? Math.min(100, (positionSec / totalDur) * 100) : 0;

    const displayText = props.liveText || props.sessionSummary?.extractedText || "";

    const handleCopy = () => {
        if (displayText) navigator.clipboard.writeText(displayText).catch(() => {});
    };

    return (
        <section style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.bg }}>

            {/* Header */}
            <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: `0 0 0 1px ${T.ghost}` }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', fontSize: '11px', fontWeight: 700 }}>
                    Audio Waveform
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: T.textDim, fontFamily: "'JetBrains Mono', monospace" }}>Level</span>
                    <div style={{ display: 'flex', gap: '2px' }}>
                        {[...Array(20)].map((_, i) => {
                            const active = i < levelBarsActive;
                            const color = i < 13 ? T.primaryCont : i < 17 ? '#fbbf24' : '#ef4444';
                            return <div key={i} style={{ width: '3px', height: '12px', background: active ? color : 'rgba(255,255,255,0.08)', borderRadius: '1px', transition: 'background 0.1s' }} />;
                        })}
                    </div>
                </div>
            </div>

            {/* Waveform */}
            <div style={{ padding: '12px 16px', boxShadow: `0 0 0 1px ${T.ghost}` }}>
                <div style={{ height: '96px', background: T.surface0, borderRadius: '6px', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', background: 'rgba(0,209,255,0.18)' }} />
                    {hasWave ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px', gap: '2px' }}>
                            {waveSlots.map((amp, i) => {
                                const h = Math.max(2, amp * 90);
                                const op = 0.4 + amp * 0.55;
                                return (
                                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                                        <div style={{ width: '100%', height: `${h / 2}%`, background: T.primaryCont, opacity: op, borderRadius: '2px 2px 0 0' }} />
                                        <div style={{ width: '100%', height: `${h / 2}%`, background: T.primaryCont, opacity: op * 0.6, borderRadius: '0 0 2px 2px' }} />
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ width: '100%', textAlign: 'center', fontSize: '11px', color: T.textDim, fontFamily: "'JetBrains Mono', monospace" }}>
                            No audio signal
                        </div>
                    )}
                    <div style={{ position: 'absolute', right: '10px', top: '6px', fontSize: '10px', color: T.textDim, fontFamily: "'JetBrains Mono', monospace" }}>
                        {peakLevel > 0 ? `${(20 * Math.log10(Math.max(0.001, peakLevel))).toFixed(1)} dB` : '—'}
                    </div>
                </div>
            </div>

            {/* Session stats */}
            <div style={{ display: 'flex', boxShadow: `0 0 0 1px ${T.ghost}` }}>
                <div style={{ flex: 1, padding: '10px 14px', borderRight: `1px solid ${T.ghost}` }}>
                    <div style={{ fontSize: '10px', color: T.textDim, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Chunks</div>
                    <div style={{ fontSize: '18px', color: T.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                        {props.sessionSummary?.extractedAudioChunks ?? 0}
                    </div>
                </div>
                <div style={{ flex: 1, padding: '10px 14px', borderRight: `1px solid ${T.ghost}` }}>
                    <div style={{ fontSize: '10px', color: T.textDim, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Audio</div>
                    <div style={{ fontSize: '18px', color: T.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                        {props.sessionSummary?.extractedAudioBytes > 0 ? formatBytes(props.sessionSummary.extractedAudioBytes) : '—'}
                    </div>
                </div>
                <div style={{ flex: 1, padding: '10px 14px' }}>
                    <div style={{ fontSize: '10px', color: T.textDim, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Status</div>
                    <div style={{ fontSize: '12px', color: statusColor(props.sessionSummary?.status), fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, textTransform: 'uppercase' }}>
                        {props.sessionSummary?.status || 'idle'}
                    </div>
                </div>
            </div>

            {/* Transcription */}
            <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', fontSize: '11px', fontWeight: 700 }}>
                        Live Transcription
                    </div>
                    <button
                        onClick={handleCopy}
                        disabled={!displayText}
                        style={{ background: 'transparent', border: 'none', color: displayText ? T.primaryCont : T.textDim, cursor: displayText ? 'pointer' : 'default', fontSize: '11px', padding: '2px 6px', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                        Copy
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', background: T.surface0, borderRadius: '6px', boxShadow: `0 0 0 1px ${T.ghost}`, padding: '12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', lineHeight: 1.7, minHeight: 0 }}>
                    {displayText ? (
                        <span style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{displayText}</span>
                    ) : (
                        <span style={{ color: T.textDim }}>Waiting for transcription data…</span>
                    )}
                </div>
            </div>

            {/* Playback controls */}
            <div style={{ padding: '12px 16px', boxShadow: `0 0 0 1px ${T.ghost}`, background: T.surface1 }}>
                <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', position: 'relative', marginBottom: '10px' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progressPct}%`, background: `linear-gradient(90deg, ${T.primaryCont}, #7c3aed)`, borderRadius: '2px', transition: 'width 0.25s ease' }} />
                    {progressPct > 0 && (
                        <div style={{ position: 'absolute', left: `${progressPct}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '9px', height: '9px', borderRadius: '50%', background: '#fff', boxShadow: `0 0 4px ${T.primaryCont}` }} />
                    )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '14px', color: T.textDim, fontSize: '16px' }}>
                        <span style={{ cursor: 'pointer' }}>⏮</span>
                        <span style={{ cursor: 'pointer', color: totalDur > 0 ? '#fff' : T.textDim }}>⏯</span>
                        <span style={{ cursor: 'pointer' }}>⏭</span>
                    </div>
                    <div style={{ fontSize: '11px', color: T.outline, fontFamily: "'JetBrains Mono', monospace" }}>
                        {formatTime(positionSec)} / {formatTime(totalDur)}
                    </div>
                </div>
            </div>

        </section>
    );
}
