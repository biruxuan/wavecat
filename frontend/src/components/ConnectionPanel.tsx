import { useState, type FormEvent } from "react";

type SavedConnection = {
  name: string;
  url: string;
  headersText: string;
  queryParamsText: string;
  subprotocol: string;
};

type Props = {
  url: string;
  headersText: string;
  queryParamsText: string;
  subprotocol: string;
  connected: boolean;
  statusText: string;
  savedConnections: SavedConnection[];
  onUrlChange: (value: string) => void;
  onHeadersChange: (value: string) => void;
  onQueryParamsChange: (value: string) => void;
  onSubprotocolChange: (value: string) => void;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onPing: () => void;
  onUseSavedConnection: (index: number) => void;
  onSaveCurrentConnection: () => void;
};

export function ConnectionPanel(props: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const {
    url,
    headersText,
    queryParamsText,
    subprotocol,
    connected,
    statusText,
    savedConnections,
    onUrlChange,
    onHeadersChange,
    onQueryParamsChange,
    onSubprotocolChange,
    onConnect,
    onReconnect,
    onDisconnect,
    onPing,
    onUseSavedConnection,
    onSaveCurrentConnection,
  } = props;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (connected) {
      onDisconnect();
      return;
    }
    onConnect();
  };

  return (
    <form className="panel connection-panel" onSubmit={handleSubmit}>
      <div className="panel-title">Connection</div>
      <label className="field">
        <span>URL</span>
        <input
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder="ws://localhost:8080/ws"
        />
      </label>
      <div className="panel-header">
        <div className="status-text">Advanced: Headers / Query Params / Subprotocol</div>
        <button type="button" onClick={() => setShowAdvanced((prev) => !prev)}>
          {showAdvanced ? "Collapse" : "Expand"}
        </button>
      </div>
      {showAdvanced ? (
        <>
          <label className="field">
            <span>Headers (JSON)</span>
            <textarea
              className="headers-textarea"
              value={headersText}
              onChange={(event) => onHeadersChange(event.target.value)}
              placeholder='{"Authorization":"Bearer ..."}'
              rows={2}
            />
          </label>
          <label className="field">
            <span>Query Params (JSON)</span>
            <textarea
              className="headers-textarea"
              value={queryParamsText}
              onChange={(event) => onQueryParamsChange(event.target.value)}
              placeholder='{"token":"abc","debug":"1"}'
              rows={2}
            />
          </label>
          <label className="field">
            <span>Subprotocol</span>
            <input
              value={subprotocol}
              onChange={(event) => onSubprotocolChange(event.target.value)}
              placeholder="例如：chat / asr / tts"
            />
          </label>
        </>
      ) : null}
      {savedConnections.length > 0 ? (
        <label className="field">
          <span>Recent Connections</span>
          <select defaultValue="" onChange={(event) => onUseSavedConnection(Number(event.target.value))}>
            <option value="" disabled>
              选择最近保存的连接
            </option>
            {savedConnections.map((item, index) => (
              <option key={`${item.name}-${index}`} value={index}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="button-row">
        <button type="submit">{connected ? "Disconnect" : "Connect"}</button>
        <button type="button" onClick={onPing} disabled={!connected}>
          Ping
        </button>
        <button type="button" onClick={onReconnect}>
          Reconnect
        </button>
        <button type="button" onClick={onSaveCurrentConnection}>
          Save
        </button>
      </div>
      <div className="status-text">{statusText}</div>
    </form>
  );
}
