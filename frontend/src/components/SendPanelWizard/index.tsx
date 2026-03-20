import { useSendPanelContext } from "../../context/SendPanelContext";
import { StepMode } from "./steps/StepMode";
import { StepPayloadType } from "./steps/StepPayloadType";
import { StepPayloadContent } from "./steps/StepPayloadContent";
import { StepAdvanced } from "./steps/StepAdvanced";
import { StepReview } from "./steps/StepReview";

const STEPS = [
  { label: "Mode" },
  { label: "Payload Type" },
  { label: "Content" },
  { label: "Advanced" },
  { label: "Review" },
];

export function SendPanelWizard() {
  const { currentStep, setCurrentStep, completedSteps, stepErrors } = useSendPanelContext();

  const renderStep = () => {
    switch (currentStep) {
      case 1:  return <StepMode />;
      case 2:  return <StepPayloadType />;
      case 3:  return <StepPayloadContent />;
      case 4:  return <StepAdvanced />;
      case 5:  return <StepReview />;
      default: return null;
    }
  };

  return (
    <div className="send-panel-wizard-left">
      {/* ── Step indicator ─────────────────────────────── */}
      <div className="wizard-steps">
        {STEPS.map(({ label }, idx) => {
          const stepNum = idx + 1;
          const isActive = stepNum === currentStep;
          const isDone = completedSteps.has(stepNum) && !isActive;
          const hasError = (stepErrors[stepNum]?.length ?? 0) > 0;

          return (
            <button
              key={stepNum}
              type="button"
              className={[
                "wizard-step-btn",
                isActive  ? "active"  : "",
                isDone    ? "done"    : "",
                hasError  ? "error"   : "",
              ].filter(Boolean).join(" ")}
              onClick={() => setCurrentStep(stepNum)}
              title={label}
            >
              <span className="wizard-step-num">{stepNum}</span>
              <span className="wizard-step-label">{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Step content ───────────────────────────────── */}
      <div className="wizard-step-content">
        {renderStep()}
      </div>
    </div>
  );
}
