import type {
    LeftLaneSnapshot,
    LeftLowerDownwardDragPlan,
    LeftLowerUpwardDragPlan,
    LowerDragState,
} from "./types";

type UpwardDeltaConsumption = {
    nextPercent: number | null;
    consumedDeltaPercent: number;
    remainingDeltaPercent: number;
};

type PlanLeftLowerSeparatorUpwardDragArgs = {
    deltaY: number;
    lowerDrag: LowerDragState;
    snapshot: LeftLaneSnapshot;
    pxToLeftColPercent: (px: number) => number;
    clampEpsilonPercent: number;
};

type PlanLeftLowerSeparatorDownwardDragArgs = {
    deltaY: number;
    lowerDrag: LowerDragState;
    lockedResponsePercent: number | null;
    currentResponsePercent: number | null;
    clampEpsilonPercent: number;
};

export const consumePanelUpwardDelta = (
    currentPercent: number | null,
    collapsedPercent: number,
    requestedDeltaPercent: number
): UpwardDeltaConsumption => {
    if (
        currentPercent === null ||
        !Number.isFinite(currentPercent) ||
        !Number.isFinite(collapsedPercent) ||
        !Number.isFinite(requestedDeltaPercent) ||
        requestedDeltaPercent <= 0
    ) {
        return {
            nextPercent: currentPercent,
            consumedDeltaPercent: 0,
            remainingDeltaPercent: Math.max(0, requestedDeltaPercent),
        };
    }

    const maxConsumableDelta = Math.max(0, currentPercent - collapsedPercent);
    const consumedDeltaPercent = Math.min(maxConsumableDelta, requestedDeltaPercent);
    const nextPercent = Math.min(100, Math.max(collapsedPercent, currentPercent - consumedDeltaPercent));

    return {
        nextPercent,
        consumedDeltaPercent,
        remainingDeltaPercent: Math.max(0, requestedDeltaPercent - consumedDeltaPercent),
    };
};

export const consumeSendUpwardDelta = (snapshot: LeftLaneSnapshot, requestedDeltaPercent: number) => {
    return consumePanelUpwardDelta(snapshot.send.percent, snapshot.send.collapsedPercent, requestedDeltaPercent);
};

export const consumeConnectionUpwardDelta = (snapshot: LeftLaneSnapshot, requestedDeltaPercent: number) => {
    return consumePanelUpwardDelta(snapshot.connection.percent, snapshot.connection.collapsedPercent, requestedDeltaPercent);
};

export const planLeftLowerSeparatorDownwardDrag = ({
    deltaY,
    lowerDrag,
    lockedResponsePercent,
    currentResponsePercent,
    clampEpsilonPercent,
}: PlanLeftLowerSeparatorDownwardDragArgs): LeftLowerDownwardDragPlan | null => {
    if (!Number.isFinite(deltaY) || deltaY <= 0) {
        return null;
    }

    if (lowerDrag.phase !== "cascade_active" && lowerDrag.phase !== "cascade_releasing") {
        return null;
    }

    if (typeof lockedResponsePercent !== "number" || !Number.isFinite(lockedResponsePercent)) {
        return {
            responseLockedPercent: null,
            reachedRestorePoint: true,
            shouldKeepSendCollapsed: false,
            shouldReleaseCascade: true,
            nextPhase: "dragging_free",
            debugReason: "manual-downward-missing-response-lock",
        };
    }

    const reachedRestorePoint =
        typeof currentResponsePercent === "number" &&
        Number.isFinite(currentResponsePercent) &&
        currentResponsePercent <= lockedResponsePercent + clampEpsilonPercent;

    return {
        responseLockedPercent: lockedResponsePercent,
        reachedRestorePoint,
        shouldKeepSendCollapsed: !reachedRestorePoint,
        shouldReleaseCascade: reachedRestorePoint,
        nextPhase: reachedRestorePoint ? "dragging_free" : "cascade_releasing",
        debugReason: reachedRestorePoint
            ? "manual-downward-response-restored-to-lock"
            : "manual-downward-keep-response-restoring",
    };
};

export const planLeftLowerSeparatorUpwardDrag = ({
    deltaY,
    lowerDrag,
    snapshot,
    pxToLeftColPercent,
    clampEpsilonPercent,
}: PlanLeftLowerSeparatorUpwardDragArgs): LeftLowerUpwardDragPlan | null => {
    if (!Number.isFinite(deltaY) || deltaY >= 0) {
        return null;
    }

    const cascadeGateOpen =
        lowerDrag.phase === "send_locked" ||
        lowerDrag.phase === "cascade_active" ||
        lowerDrag.phase === "cascade_releasing" ||
        lowerDrag.sendCollapsedAtStart;
    if (!cascadeGateOpen && lowerDrag.phase !== "dragging_free") {
        return null;
    }

    const upwardDeltaPercent = pxToLeftColPercent(-deltaY);
    if (!Number.isFinite(upwardDeltaPercent) || upwardDeltaPercent <= 0) {
        return null;
    }

    const sendConsumption = consumeSendUpwardDelta(snapshot, upwardDeltaPercent);
    const allowConnectionConsumption =
        lowerDrag.phase === "send_locked" ||
        lowerDrag.phase === "cascade_active" ||
        lowerDrag.phase === "cascade_releasing" ||
        lowerDrag.sendCollapsedAtStart ||
        (sendConsumption.nextPercent !== null &&
            sendConsumption.nextPercent <= snapshot.send.collapsedPercent + clampEpsilonPercent);
    const connectionConsumption = allowConnectionConsumption
        ? consumeConnectionUpwardDelta(snapshot, sendConsumption.remainingDeltaPercent)
        : {
              nextPercent: snapshot.connection.percent,
              consumedDeltaPercent: 0,
              remainingDeltaPercent: sendConsumption.remainingDeltaPercent,
          };
    const sendCanStillShrink =
        typeof snapshot.send.percent === "number" &&
        snapshot.send.percent > snapshot.send.collapsedPercent + clampEpsilonPercent;
    const enteredCascade = connectionConsumption.consumedDeltaPercent > 0;
    const nextPhase = enteredCascade
        ? "cascade_active"
        : sendConsumption.consumedDeltaPercent > 0 || sendCanStillShrink
          ? lowerDrag.phase === "send_locked"
              ? "send_locked"
              : "dragging_free"
          : lowerDrag.phase;

    return {
        sendTargetPercent: sendConsumption.nextPercent,
        connectionTargetPercent: connectionConsumption.nextPercent,
        consumedSendDeltaPercent: sendConsumption.consumedDeltaPercent,
        consumedConnectionDeltaPercent: connectionConsumption.consumedDeltaPercent,
        remainingDeltaPercent: connectionConsumption.remainingDeltaPercent,
        shouldFreezeResponse: enteredCascade,
        shouldLockSendCollapsed:
            sendConsumption.nextPercent !== null &&
            sendConsumption.nextPercent <= snapshot.send.collapsedPercent + clampEpsilonPercent,
        nextPhase,
        debugReason: enteredCascade
            ? "manual-upward-cascade-into-connection"
            : sendConsumption.consumedDeltaPercent > 0
              ? "manual-upward-delta-consumed-by-send"
              : cascadeGateOpen
                ? "manual-upward-gate-open-no-consumption"
                : "manual-upward-gate-closed",
    };
};