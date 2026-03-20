import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { Props as SendPanelProps } from "../components/SendPanelClassic";

export type { SendPanelProps };

/** The active payload input type selected in Step 2 of the wizard. */
export type PayloadType = "json" | "binary-base64" | "binary-file" | "pcm-wav";

/** UI state owned by the wizard layer — never surfaces to App.tsx. */
interface SendPanelUIState {
  currentStep: number;
  setCurrentStep: (step: number) => void;
  completedSteps: Set<number>;
  payloadType: PayloadType;
  setPayloadType: Dispatch<SetStateAction<PayloadType>>;
  expandedHeaderRuleIds: Set<number>;
  setExpandedHeaderRuleIds: Dispatch<SetStateAction<Set<number>>>;
  showTemplateManager: boolean;
  setShowTemplateManager: Dispatch<SetStateAction<boolean>>;
  /** Per-step validation errors. Key is the 1-based step number. */
  stepErrors: Record<number, string[]>;
  setStepErrors: Dispatch<SetStateAction<Record<number, string[]>>>;
}

export type SendPanelContextValue = SendPanelProps & SendPanelUIState;

const SendPanelContext = createContext<SendPanelContextValue | null>(null);

export function useSendPanelContext(): SendPanelContextValue {
  const ctx = useContext(SendPanelContext);
  if (!ctx) {
    throw new Error("useSendPanelContext must be used inside <SendPanel>");
  }
  return ctx;
}

export { SendPanelContext };
