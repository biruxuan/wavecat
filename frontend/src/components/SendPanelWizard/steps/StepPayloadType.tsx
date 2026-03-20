import { useSendPanelContext, type PayloadType } from "../../../context/SendPanelContext";

const OPTIONS: { type: PayloadType; label: string; badge: string; description: string }[] = [
  {
    type: "json",
    label: "JSON",
    badge: "Text",
    description: "Send a JSON message over the WebSocket. Supports template variables like ${message_id}.",
  },
  {
    type: "binary-base64",
    label: "Binary Base64",
    badge: "Binary",
    description: "Send raw binary data encoded as a Base64 string. Useful for quick binary tests.",
  },
  {
    type: "binary-file",
    label: "Binary File",
    badge: "File",
    description: "Read a local binary file and send its contents as a single WebSocket binary frame.",
  },
  {
    type: "pcm-wav",
    label: "PCM / WAV",
    badge: "Stream",
    description: "Stream audio from a PCM or WAV file in frames with configurable size and header rules.",
  },
];

export function StepPayloadType() {
  const { payloadType, setPayloadType, setCurrentStep } = useSendPanelContext();

  return (
    <div className="wizard-step-body">
      <h2 className="wizard-step-title">2. Select Payload Type</h2>
      <p className="wizard-step-desc">
        Choose the format for the data you want to send. Only the configuration
        relevant to the selected type will be shown in the next step.
      </p>

      <div className="wizard-card-grid">
        {OPTIONS.map(({ type, label, badge, description }) => (
          <div
            key={type}
            className={`wizard-card ${payloadType === type ? "active" : ""}`}
            onClick={() => setPayloadType(type)}
          >
            <div className="wizard-card-header">
              <strong>{label}</strong>
              <span className="wizard-card-badge">{badge}</span>
            </div>
            <p className="wizard-card-desc">{description}</p>
          </div>
        ))}
      </div>

      <div className="wizard-step-nav">
        <button type="button" className="btn-nav" onClick={() => setCurrentStep(1)}>
          ← Back
        </button>
        <button type="button" className="btn-nav primary" onClick={() => setCurrentStep(3)}>
          Next →
        </button>
      </div>
    </div>
  );
}
