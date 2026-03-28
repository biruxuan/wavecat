export type LowerDragPhase = "idle" | "dragging_free" | "send_locked" | "cascade_active" | "cascade_releasing";

export type LowerDragState = {
    phase: LowerDragPhase;
    sendCollapsedAtStart: boolean;
    connectionCollapsedAtStart: boolean;
    lockedResponseSize: number | null;
    connectionSizeAtStart: number | null;
    connectionPixelsAtStart: number | null;
};

export type LeftLowerDragContext = {
    active: boolean;
    phase: LowerDragPhase;
    startPointerY: number | null;
    lastPointerY: number | null;
    accumulatedDeltaY: number;
    sendCollapsedAtStart: boolean;
    connectionCollapsedAtStart: boolean;
    lockedResponseSize: number | null;
};

export type LeftLanePanelId = "connection" | "send" | "response";

export type LeftLanePanelSnapshot = {
    id: LeftLanePanelId;
    percent: number | null;
    pixels: number | null;
    visuallyCollapsed: boolean;
    semanticallyCollapsed: boolean;
    collapsedPercent: number;
};

export type LeftLaneSnapshot = {
    connection: LeftLanePanelSnapshot;
    send: LeftLanePanelSnapshot;
    response: LeftLanePanelSnapshot;
};

export type LeftLowerUpwardDragPlan = {
    sendTargetPercent: number | null;
    connectionTargetPercent: number | null;
    consumedSendDeltaPercent: number;
    consumedConnectionDeltaPercent: number;
    remainingDeltaPercent: number;
    shouldFreezeResponse: boolean;
    shouldLockSendCollapsed: boolean;
    nextPhase: LowerDragPhase;
    debugReason: string;
};

export type LeftLowerDownwardDragPlan = {
    responseLockedPercent: number | null;
    reachedRestorePoint: boolean;
    shouldKeepSendCollapsed: boolean;
    shouldReleaseCascade: boolean;
    nextPhase: LowerDragPhase;
    debugReason: string;
};