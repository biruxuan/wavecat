import type { LeftLowerDragContext, LowerDragPhase, LowerDragState } from "./types";

type TransitionLowerDragPhaseArgs = {
    lowerDragState: LowerDragState;
    leftLowerDragContext: LeftLowerDragContext;
    nextPhase: LowerDragPhase;
    reason: string;
    onPhaseTransition?: (payload: {
        prevPhase: LowerDragPhase;
        nextPhase: LowerDragPhase;
        reason: string;
        context: LeftLowerDragContext;
    }) => void;
};

type ResetLowerDragStateArgs = {
    setLowerSeparatorDragInProgress: (value: boolean) => void;
    setConnectionLowerSeparatorMinPercent: (value: number | null) => void;
    setConnectionLowerSeparatorLockActive: (value: boolean) => void;
    onAfterReset?: (payload: {
        lowerDragState: LowerDragState;
        leftLowerDragContext: LeftLowerDragContext;
    }) => void;
};

type BeginLowerSeparatorDragArgs = {
    startPointerY: number | null;
    sendCollapsedAtStart: boolean;
    connectionCollapsedAtStart: boolean;
    connectionPercentAtStart: number | null;
    connectionPixelsAtStart: number | null;
};

type MaybeEnterSendLockedPhaseArgs = {
    lowerDragState: LowerDragState;
    leftLowerDragContext: LeftLowerDragContext;
    isActuallyCollapsed: boolean;
    lockedResponseSize: number | null;
};

type MaybeEnterCascadeActivePhaseArgs = {
    lowerDragState: LowerDragState;
    leftLowerDragContext: LeftLowerDragContext;
    shouldTriggerCascade: boolean;
};

type MaybeEnterCascadeReleasingPhaseArgs = {
    lowerDragState: LowerDragState;
    leftLowerDragContext: LeftLowerDragContext;
    deltaY: number;
    minDownwardReleaseDeltaPx: number;
};

type MaybeReleaseCascadeToFreeDragArgs = {
    lowerDragState: LowerDragState;
    leftLowerDragContext: LeftLowerDragContext;
    currentResponsePercent: number;
    clampEpsilonPercent: number;
};

type FinalizeLowerSeparatorDragArgs = {
    lowerDragState: LowerDragState;
    leftLowerDragContext: LeftLowerDragContext;
    wasLowerSeparatorDragActive: boolean;
    isConnectionPhysicallyCollapsedAtPointerUp: boolean;
};

type CollapseSource = "button" | "drag" | null;

type LowerDragCompatSnapshot = {
    dragActive: boolean;
    sendCollapsedAtStart: boolean;
    connectionCollapsedAtStart: boolean;
    lockedResponseSize: number | null;
    hardLocked: boolean;
};

export const transitionLowerDragPhase = ({
    lowerDragState,
    leftLowerDragContext,
    nextPhase,
    reason,
    onPhaseTransition,
}: TransitionLowerDragPhaseArgs) => {
    const prevPhase = lowerDragState.phase;
    if (prevPhase === nextPhase) {
        return {
            lowerDragState,
            leftLowerDragContext,
            changed: false,
        };
    }

    const nextLowerDragState: LowerDragState = {
        ...lowerDragState,
        phase: nextPhase,
    };
    const nextLeftLowerDragContext: LeftLowerDragContext = {
        ...leftLowerDragContext,
        phase: nextPhase,
    };

    onPhaseTransition?.({
        prevPhase,
        nextPhase,
        reason,
        context: nextLeftLowerDragContext,
    });

    return {
        lowerDragState: nextLowerDragState,
        leftLowerDragContext: nextLeftLowerDragContext,
        changed: true,
    };
};

export const createIdleLowerDragState = (): LowerDragState => {
    return {
        phase: "idle",
        sendCollapsedAtStart: false,
        connectionCollapsedAtStart: false,
        lockedResponseSize: null,
        connectionSizeAtStart: null,
        connectionPixelsAtStart: null,
    };
};

export const createIdleLeftLowerDragContext = (): LeftLowerDragContext => {
    return {
        active: false,
        phase: "idle",
        startPointerY: null,
        lastPointerY: null,
        accumulatedDeltaY: 0,
        sendCollapsedAtStart: false,
        connectionCollapsedAtStart: false,
        lockedResponseSize: null,
    };
};

export const beginLowerSeparatorDrag = ({
    startPointerY,
    sendCollapsedAtStart,
    connectionCollapsedAtStart,
    connectionPercentAtStart,
    connectionPixelsAtStart,
}: BeginLowerSeparatorDragArgs) => {
    const lowerDragState: LowerDragState = {
        phase: "dragging_free",
        sendCollapsedAtStart,
        connectionCollapsedAtStart,
        lockedResponseSize: null,
        connectionSizeAtStart: connectionPercentAtStart,
        connectionPixelsAtStart,
    };

    const leftLowerDragContext: LeftLowerDragContext = {
        active: true,
        phase: "dragging_free",
        startPointerY,
        lastPointerY: startPointerY,
        accumulatedDeltaY: 0,
        sendCollapsedAtStart,
        connectionCollapsedAtStart,
        lockedResponseSize: null,
    };

    return {
        lowerDragState,
        leftLowerDragContext,
    };
};

export const maybeEnterSendLockedPhase = ({
    lowerDragState,
    leftLowerDragContext,
    isActuallyCollapsed,
    lockedResponseSize,
}: MaybeEnterSendLockedPhaseArgs): {
    lowerDragState: LowerDragState;
    leftLowerDragContext: LeftLowerDragContext;
    changed: boolean;
} => {
    if (
        lowerDragState.phase !== "dragging_free" ||
        lowerDragState.sendCollapsedAtStart ||
        !isActuallyCollapsed
    ) {
        return {
            lowerDragState,
            leftLowerDragContext,
            changed: false,
        };
    }

    const nextLockedResponseSize =
        typeof lockedResponseSize === "number" && Number.isFinite(lockedResponseSize)
            ? lockedResponseSize
            : null;

    return {
        lowerDragState: {
            ...lowerDragState,
            phase: "send_locked",
            lockedResponseSize: nextLockedResponseSize,
        },
        leftLowerDragContext: {
            ...leftLowerDragContext,
            phase: "send_locked",
            lockedResponseSize: nextLockedResponseSize,
        },
        changed: true,
    };
};

export const maybeEnterCascadeActivePhase = ({
    lowerDragState,
    leftLowerDragContext,
    shouldTriggerCascade,
}: MaybeEnterCascadeActivePhaseArgs): {
    lowerDragState: LowerDragState;
    leftLowerDragContext: LeftLowerDragContext;
    changed: boolean;
} => {
    const canEnterFromCurrentPhase =
        lowerDragState.phase === "send_locked" ||
        (lowerDragState.phase === "dragging_free" && lowerDragState.sendCollapsedAtStart);

    if (!canEnterFromCurrentPhase || !shouldTriggerCascade) {
        return {
            lowerDragState,
            leftLowerDragContext,
            changed: false,
        };
    }

    return {
        lowerDragState: {
            ...lowerDragState,
            phase: "cascade_active",
        },
        leftLowerDragContext: {
            ...leftLowerDragContext,
            phase: "cascade_active",
        },
        changed: true,
    };
};

export const maybeEnterCascadeReleasingPhase = ({
    lowerDragState,
    leftLowerDragContext,
    deltaY,
    minDownwardReleaseDeltaPx,
}: MaybeEnterCascadeReleasingPhaseArgs): {
    lowerDragState: LowerDragState;
    leftLowerDragContext: LeftLowerDragContext;
    changed: boolean;
} => {
    if (
        lowerDragState.phase !== "cascade_active" ||
        deltaY < minDownwardReleaseDeltaPx
    ) {
        return {
            lowerDragState,
            leftLowerDragContext,
            changed: false,
        };
    }

    return {
        lowerDragState: {
            ...lowerDragState,
            phase: "cascade_releasing",
        },
        leftLowerDragContext: {
            ...leftLowerDragContext,
            phase: "cascade_releasing",
        },
        changed: true,
    };
};

export const maybeReleaseCascadeToFreeDrag = ({
    lowerDragState,
    leftLowerDragContext,
    currentResponsePercent,
    clampEpsilonPercent,
}: MaybeReleaseCascadeToFreeDragArgs): {
    lowerDragState: LowerDragState;
    leftLowerDragContext: LeftLowerDragContext;
    changed: boolean;
    releasedWithoutLock: boolean;
    reachedRestorePoint: boolean;
} => {
    if (lowerDragState.phase !== "cascade_releasing") {
        return {
            lowerDragState,
            leftLowerDragContext,
            changed: false,
            releasedWithoutLock: false,
            reachedRestorePoint: false,
        };
    }

    const locked = lowerDragState.lockedResponseSize;
    if (typeof locked !== "number" || !Number.isFinite(locked)) {
        return {
            lowerDragState: {
                ...lowerDragState,
                phase: "dragging_free",
                lockedResponseSize: null,
            },
            leftLowerDragContext: {
                ...leftLowerDragContext,
                phase: "dragging_free",
                lockedResponseSize: null,
            },
            changed: true,
            releasedWithoutLock: true,
            reachedRestorePoint: false,
        };
    }

    const reachedRestorePoint =
        currentResponsePercent <= locked + clampEpsilonPercent;

    if (!reachedRestorePoint) {
        return {
            lowerDragState,
            leftLowerDragContext,
            changed: false,
            releasedWithoutLock: false,
            reachedRestorePoint: false,
        };
    }

    return {
        lowerDragState: {
            ...lowerDragState,
            phase: "dragging_free",
            lockedResponseSize: null,
        },
        leftLowerDragContext: {
            ...leftLowerDragContext,
            phase: "dragging_free",
            lockedResponseSize: null,
        },
        changed: true,
        releasedWithoutLock: false,
        reachedRestorePoint: true,
    };
};

export const isLowerCascadePhase = (phase: LowerDragPhase) => {
    return phase === "cascade_active" || phase === "cascade_releasing";
};

export const createLowerDragCompatSnapshot = (
    lowerDragState: LowerDragState,
    leftLowerDragContext: LeftLowerDragContext
): LowerDragCompatSnapshot => {
    return {
        dragActive: leftLowerDragContext.active,
        sendCollapsedAtStart: lowerDragState.sendCollapsedAtStart,
        connectionCollapsedAtStart: lowerDragState.connectionCollapsedAtStart,
        lockedResponseSize:
            lowerDragState.lockedResponseSize ?? leftLowerDragContext.lockedResponseSize ?? null,
        hardLocked: isLowerCascadePhase(lowerDragState.phase),
    };
};

export const finalizeLowerSeparatorDrag = ({
    lowerDragState,
    leftLowerDragContext,
    wasLowerSeparatorDragActive,
    isConnectionPhysicallyCollapsedAtPointerUp,
}: FinalizeLowerSeparatorDragArgs): {
    shouldFinalizeConnectionCollapse: boolean;
    nextConnectionPanelCollapsed: boolean | null;
    nextCollapseSource: CollapseSource;
    debug: {
        shouldFinalizeConnectionCollapse: boolean;
        isConnectionPhysicallyCollapsedAtPointerUp: boolean;
        phase: LowerDragPhase;
        context: LeftLowerDragContext;
    };
} => {
    const shouldFinalizeConnectionCollapse =
        wasLowerSeparatorDragActive &&
        isLowerCascadePhase(lowerDragState.phase) &&
        isConnectionPhysicallyCollapsedAtPointerUp;

    return {
        shouldFinalizeConnectionCollapse,
        nextConnectionPanelCollapsed: wasLowerSeparatorDragActive
            ? isConnectionPhysicallyCollapsedAtPointerUp
            : null,
        nextCollapseSource: shouldFinalizeConnectionCollapse ? "drag" : null,
        debug: {
            shouldFinalizeConnectionCollapse,
            isConnectionPhysicallyCollapsedAtPointerUp,
            phase: lowerDragState.phase,
            context: leftLowerDragContext,
        },
    };
};

export const resetLowerDragState = ({
    setLowerSeparatorDragInProgress,
    setConnectionLowerSeparatorMinPercent,
    setConnectionLowerSeparatorLockActive,
    onAfterReset,
}: ResetLowerDragStateArgs) => {
    const lowerDragState = createIdleLowerDragState();
    const leftLowerDragContext = createIdleLeftLowerDragContext();

    setLowerSeparatorDragInProgress(false);
    setConnectionLowerSeparatorMinPercent(null);
    setConnectionLowerSeparatorLockActive(false);

    onAfterReset?.({
        lowerDragState,
        leftLowerDragContext,
    });

    return {
        lowerDragState,
        leftLowerDragContext,
    };
};