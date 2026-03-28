import type React from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import type { LeftLanePanelId, LeftLanePanelSnapshot, LeftLaneSnapshot } from "./types";

type PanelRef = React.RefObject<PanelImperativeHandle | null>;

type LeftLanePanelControllerDeps = {
    connectionPanelRef: PanelRef;
    sendPanelRef: PanelRef;
    responsePanelRef: PanelRef;
    connectionPanelCollapsed: boolean;
    sendPanelCollapsed: boolean;
    responsePanelCollapsed: boolean;
    connectionCollapsedHeightPx: number;
    responseCollapsedHeightPx: number;
    isPanelVisuallyCollapsed: (panelRef: PanelRef, collapsedPx: number, epsilonPx?: number) => boolean;
    getConnectionCollapsedSizePercent: () => number;
    getSendCollapsedSizePercent: () => number;
    getResponseCollapsedSizePercent: () => number;
};

export const getPanelPercent = (panelRef: PanelRef) => {
    const percent = panelRef.current?.getSize().asPercentage;
    return typeof percent === "number" && Number.isFinite(percent) ? percent : null;
};

export const getPanelPixels = (panelRef: PanelRef) => {
    const pixels = panelRef.current?.getSize().inPixels;
    return typeof pixels === "number" && Number.isFinite(pixels) ? pixels : null;
};

export const clampPercent = (value: number, min: number, max: number) => {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
};

export const resizePanelPercent = (panelRef: PanelRef, percent: number) => {
    if (!Number.isFinite(percent)) {
        return;
    }
    panelRef.current?.resize(`${percent}%`);
};

export const collapsePanel = (panelRef: PanelRef) => {
    panelRef.current?.collapse();
};

export const expandPanel = (panelRef: PanelRef) => {
    panelRef.current?.expand();
};

export const createLeftLanePanelController = (deps: LeftLanePanelControllerDeps) => {
    const getLeftLanePanelRef = (panelId: LeftLanePanelId) => {
        if (panelId === "connection") {
            return deps.connectionPanelRef;
        }
        if (panelId === "send") {
            return deps.sendPanelRef;
        }
        return deps.responsePanelRef;
    };

    const getLeftLanePanelCollapsedPercent = (panelId: LeftLanePanelId) => {
        if (panelId === "connection") {
            return deps.getConnectionCollapsedSizePercent();
        }
        if (panelId === "send") {
            return deps.getSendCollapsedSizePercent();
        }
        return deps.getResponseCollapsedSizePercent();
    };

    const resizeLeftLanePanel = (panelId: LeftLanePanelId, percent: number) => {
        const clampedPercent = clampPercent(percent, getLeftLanePanelCollapsedPercent(panelId), 100);
        resizePanelPercent(getLeftLanePanelRef(panelId), clampedPercent);
    };

    const collapseLeftLanePanel = (panelId: LeftLanePanelId) => {
        collapsePanel(getLeftLanePanelRef(panelId));
    };

    const expandLeftLanePanel = (panelId: LeftLanePanelId) => {
        expandPanel(getLeftLanePanelRef(panelId));
    };

    const getLeftLanePanelSnapshot = (panelId: LeftLanePanelId): LeftLanePanelSnapshot => {
        if (panelId === "connection") {
            return {
                id: panelId,
                percent: getPanelPercent(deps.connectionPanelRef),
                pixels: getPanelPixels(deps.connectionPanelRef),
                visuallyCollapsed: deps.isPanelVisuallyCollapsed(deps.connectionPanelRef, deps.connectionCollapsedHeightPx),
                semanticallyCollapsed: deps.connectionPanelCollapsed,
                collapsedPercent: deps.getConnectionCollapsedSizePercent(),
            };
        }
        if (panelId === "send") {
            return {
                id: panelId,
                percent: getPanelPercent(deps.sendPanelRef),
                pixels: getPanelPixels(deps.sendPanelRef),
                visuallyCollapsed: deps.isPanelVisuallyCollapsed(deps.sendPanelRef, deps.connectionCollapsedHeightPx),
                semanticallyCollapsed: deps.sendPanelCollapsed,
                collapsedPercent: deps.getSendCollapsedSizePercent(),
            };
        }
        return {
            id: panelId,
            percent: getPanelPercent(deps.responsePanelRef),
            pixels: getPanelPixels(deps.responsePanelRef),
            visuallyCollapsed: deps.isPanelVisuallyCollapsed(deps.responsePanelRef, deps.responseCollapsedHeightPx),
            semanticallyCollapsed: deps.responsePanelCollapsed,
            collapsedPercent: deps.getResponseCollapsedSizePercent(),
        };
    };

    const getLeftLaneSnapshot = (): LeftLaneSnapshot => {
        return {
            connection: getLeftLanePanelSnapshot("connection"),
            send: getLeftLanePanelSnapshot("send"),
            response: getLeftLanePanelSnapshot("response"),
        };
    };

    return {
        getLeftLanePanelRef,
        getLeftLanePanelCollapsedPercent,
        resizeLeftLanePanel,
        collapseLeftLanePanel,
        expandLeftLanePanel,
        getLeftLanePanelSnapshot,
        getLeftLaneSnapshot,
    };
};