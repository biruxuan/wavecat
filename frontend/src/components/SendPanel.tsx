import { SendPanelClassic } from "./SendPanelClassic";
import type { Props as SendPanelProps } from "./SendPanelClassic";

export function SendPanel(props: SendPanelProps) {
  return <SendPanelClassic {...props} />;
}
