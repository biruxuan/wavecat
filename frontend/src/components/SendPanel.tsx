import { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { SendPanelContext, type SendPanelContextValue, type PayloadType } from "../context/SendPanelContext";
import type { Props } from "./SendPanelClassic";
import { SendPanelWizard } from "./SendPanelWizard";
import { StickyActions } from "./SendPanelWizard/StickyActions";

export function SendPanel(props: Props) {
  const MOBILE_BREAKPOINT = 700;
  const [currentStep, setCurrentStepRaw] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [payloadType, setPayloadType] = useState<PayloadType>("json");
  const [expandedHeaderRuleIds, setExpandedHeaderRuleIds] = useState<Set<number>>(new Set());
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<number, string[]>>({});
  const [compactLayout, setCompactLayout] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
  );

  useEffect(() => {
    const onResize = () => setCompactLayout(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setCurrentStep = (step: number) => {
    setCompletedSteps((prev) => new Set([...prev, currentStep]));
    setCurrentStepRaw(step);
  };

  const ctx: SendPanelContextValue = {
    ...props,
    currentStep,
    setCurrentStep,
    completedSteps,
    payloadType,
    setPayloadType,
    expandedHeaderRuleIds,
    setExpandedHeaderRuleIds,
    showTemplateManager,
    setShowTemplateManager,
    stepErrors,
    setStepErrors,
  };

  return (
    <SendPanelContext.Provider value={ctx}>
      <section className="panel send-panel-wizard">
        {compactLayout ? (
          <div className="send-panel-wizard-mobile">
            <div className="send-panel-wizard-mobile-main">
              <SendPanelWizard />
            </div>
            <div className="send-panel-wizard-mobile-sticky">
              <StickyActions />
            </div>
          </div>
        ) : (
          <Group
            orientation="horizontal"
            style={{ flex: 1, minHeight: 0 }}
          >
            <Panel defaultSize={60} minSize={30}>
              <SendPanelWizard />
            </Panel>
            <Separator className="send-panel-resize-handle">
              <div className="resize-handle-bar" />
            </Separator>
            <Panel defaultSize={40} minSize={25}>
              <StickyActions />
            </Panel>
          </Group>
        )}
      </section>
    </SendPanelContext.Provider>
  );
}
