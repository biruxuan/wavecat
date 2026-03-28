import type { Frame } from "../types";

type Props = {
    frame: Frame | null | undefined;
    collapsed: boolean;
    onToggleCollapsed: () => void;
};

const T = {
    bg: "var(--sys-background)",
    surface: "var(--sys-surface-lowest)",
    border: "var(--sys-outline-variant)",
    title: "#fff",
    dim: "var(--sys-outline)",
};

function formatTimestamp(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return "-";
    }
    return new Date(timestamp).toLocaleString();
}

function buildPayloadView(frame: Frame): string {
    if (frame.text && frame.text.trim()) {
        try {
            return JSON.stringify(JSON.parse(frame.text), null, 2);
        } catch {
            return frame.text;
        }
    }

    if (frame.ascii && frame.ascii.trim()) return frame.ascii;
    if (frame.base64 && frame.base64.trim()) return frame.base64;
    if (frame.hex && frame.hex.trim()) return frame.hex;
    if (frame.summary && frame.summary.trim()) return frame.summary;

    return "(empty payload)";
}

function payloadSource(frame: Frame): string {
    if (frame.text && frame.text.trim()) return "text";
    if (frame.ascii && frame.ascii.trim()) return "ascii";
    if (frame.base64 && frame.base64.trim()) return "base64";
    if (frame.hex && frame.hex.trim()) return "hex";
    if (frame.summary && frame.summary.trim()) return "summary";
    return "none";
}

export function FrameDetail(props: Props) {
    if (props.collapsed) {
        return (
            <div
                style={{
                    padding: "12px",
                    borderTop: `1px solid ${T.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                }}
                onClick={props.onToggleCollapsed}
            >
                <div style={{ fontWeight: 600, fontSize: "14px", color: T.dim, textTransform: "uppercase" }}>DETAILS</div>
            </div>
        );
    }

    return (
        <section
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                background: T.bg,
                borderTop: `1px solid ${T.border}`,
            }}
        >
            <div
                style={{
                    padding: "16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: `1px solid ${T.border}`,
                }}
            >
                <div
                    style={{
                        fontFamily: "var(--font-display)",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: T.title,
                        fontSize: "14px",
                        fontWeight: 600,
                    }}
                >
                    Details
                </div>
            </div>

            <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
                {props.frame ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div
                            style={{
                                background: T.surface,
                                padding: "12px",
                                borderRadius: "4px",
                                border: `1px solid ${T.border}`,
                                fontFamily: "monospace",
                                fontSize: "12px",
                                lineHeight: "1.5",
                            }}
                        >
                            <div style={{ color: T.dim }}>
                                id: <span style={{ color: T.title }}>{props.frame.id}</span>
                            </div>
                            <div style={{ color: T.dim }}>
                                direction: <span style={{ color: T.title }}>{props.frame.direction}</span>
                            </div>
                            <div style={{ color: T.dim }}>
                                type: <span style={{ color: T.title }}>{props.frame.type || "-"}</span>
                            </div>
                            <div style={{ color: T.dim }}>
                                timestamp: <span style={{ color: T.title }}>{formatTimestamp(props.frame.timestamp)}</span>
                            </div>
                            <div style={{ color: T.dim }}>
                                size: <span style={{ color: T.title }}>{props.frame.size || 0} bytes</span>
                            </div>
                            <div style={{ color: T.dim }}>
                                payload source: <span style={{ color: T.title }}>{payloadSource(props.frame)}</span>
                            </div>
                        </div>

                        <div
                            style={{
                                background: T.surface,
                                padding: "12px",
                                borderRadius: "4px",
                                border: `1px solid ${T.border}`,
                                fontFamily: "monospace",
                                fontSize: "12px",
                                lineHeight: "1.5",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                                color: T.title,
                            }}
                        >
                            {buildPayloadView(props.frame)}
                        </div>
                    </div>
                ) : (
                    <div
                        style={{
                            background: T.surface,
                            padding: "16px",
                            borderRadius: "4px",
                            border: `1px solid ${T.border}`,
                            fontFamily: "monospace",
                            fontSize: "12px",
                            lineHeight: "1.5",
                            color: T.dim,
                        }}
                    >
                        Select a frame to view details
                    </div>
                )}
            </div>
        </section>
    );
}
