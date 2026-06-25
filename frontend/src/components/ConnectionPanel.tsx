import { useState, type FormEvent } from "react";

type HeaderEntry = { key: string; value: string; enabled: boolean };
type AuthType = "none" | "bearer" | "apikey" | "basic";
type AuthConfig = {
  bearerToken: string;
  apiKey: { key: string; value: string; addTo: "header" | "query" };
  basicAuth: { username: string; password: string };
};

type SavedConnection = {
  name: string;
  url: string;
  headersList?: HeaderEntry[];
  authType?: AuthType;
  authConfig?: AuthConfig;
  headersText?: string;
  queryParamsText: string;
  subprotocol: string;
};

type Props = {
  url: string;
  headersList: HeaderEntry[];
  authType: AuthType;
  authConfig: AuthConfig;
  queryParamsText: string;
  subprotocol: string;
  connected: boolean;
  statusText: string;
  savedConnections: SavedConnection[];
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onUrlChange: (value: string) => void;
  onHeadersListChange: (list: HeaderEntry[]) => void;
  onAuthTypeChange: (type: AuthType) => void;
  onAuthConfigChange: (config: AuthConfig) => void;
  onQueryParamsChange: (value: string) => void;
  onSubprotocolChange: (value: string) => void;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onPing: () => void;
  onUseSavedConnection: (index: number) => void;
  onSaveCurrentConnection: () => void;
};

const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  none: "No Auth",
  bearer: "Bearer Token",
  apikey: "API Key",
  basic: "Basic Auth",
};

export function ConnectionPanel(props: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showBearerToken, setShowBearerToken] = useState(false);
  const [showBasicPassword, setShowBasicPassword] = useState(false);
  const {
    url,
    headersList,
    authType,
    authConfig,
    queryParamsText,
    subprotocol,
    connected,
    statusText,
    savedConnections,
    isCollapsed,
    onToggleCollapsed,
    onUrlChange,
    onHeadersListChange,
    onAuthTypeChange,
    onAuthConfigChange,
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

  const updateHeaderEntry = (index: number, patch: Partial<HeaderEntry>) => {
    const next = headersList.map((h, i) => (i === index ? { ...h, ...patch } : h));
    onHeadersListChange(next);
  };

  const removeHeaderEntry = (index: number) => {
    onHeadersListChange(headersList.filter((_, i) => i !== index));
  };

  const addHeaderEntry = () => {
    onHeadersListChange([...headersList, { key: "", value: "", enabled: true }]);
  };

  return (
    <form className="panel connection-panel" onSubmit={handleSubmit}>
      <div className="connection-panel-header">
        <div className="connection-collapsed-left">
          <span className="panel-title">Connection</span>
          {isCollapsed && (
            <span className="status-text connection-url-preview">{url}</span>
          )}
        </div>
        <div className="connection-collapsed-right">
          {isCollapsed && <span className="status-text">{statusText}</span>}
        </div>
        <button
          type="button"
          className="connection-collapse-button"
          aria-label={isCollapsed ? "Expand connection panel" : "Collapse connection panel"}
          title={isCollapsed ? "Expand" : "Collapse"}
          onClick={onToggleCollapsed}
        >
          <svg
            className={`collapse-chevron${isCollapsed ? " is-collapsed" : ""}`}
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </button>
      </div>
      <div className={`connection-body-wrap${isCollapsed ? " collapsed" : ""}`}>
        <div className="connection-body-inner">
          <label className="field">
            <span>URL</span>
            <input
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder="ws://localhost:8080/ws"
            />
          </label>
          <div className="panel-header">
            <div className="status-text">Advanced: Auth / Headers / Query Params / Subprotocol</div>
            <button type="button" onClick={() => setShowAdvanced((prev) => !prev)}>
              {showAdvanced ? "Collapse" : "Expand"}
            </button>
          </div>
          {showAdvanced ? (
            <>
              {/* ── Auth Section ── */}
              <div className="field">
                <span>Auth</span>
                <select
                  className="auth-type-select"
                  value={authType}
                  onChange={(event) => onAuthTypeChange(event.target.value as AuthType)}
                >
                  {(Object.entries(AUTH_TYPE_LABELS) as [AuthType, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              {authType === "bearer" ? (
                <div className="auth-fields">
                  <label className="field">
                    <span>Token</span>
                    <div className="input-with-eye">
                      <input
                        type={showBearerToken ? "text" : "password"}
                        value={authConfig.bearerToken}
                        onChange={(event) =>
                          onAuthConfigChange({ ...authConfig, bearerToken: event.target.value })
                        }
                        placeholder="粘贴 JWT / Bearer Token"
                      />
                      <button
                        type="button"
                        className="eye-toggle"
                        onClick={() => setShowBearerToken((v) => !v)}
                        title={showBearerToken ? "隐藏" : "显示"}
                      >
                        {showBearerToken ? "👁" : "👁‍🗨"}
                      </button>
                    </div>
                  </label>
                </div>
              ) : null}
              {authType === "apikey" ? (
                <div className="auth-fields">
                  <label className="field">
                    <span>Key</span>
                    <input
                      value={authConfig.apiKey.key}
                      onChange={(event) =>
                        onAuthConfigChange({
                          ...authConfig,
                          apiKey: { ...authConfig.apiKey, key: event.target.value },
                        })
                      }
                      placeholder="X-API-Key"
                    />
                  </label>
                  <label className="field">
                    <span>Value</span>
                    <input
                      value={authConfig.apiKey.value}
                      onChange={(event) =>
                        onAuthConfigChange({
                          ...authConfig,
                          apiKey: { ...authConfig.apiKey, value: event.target.value },
                        })
                      }
                      placeholder="your-api-key"
                    />
                  </label>
                  <label className="field">
                    <span>Add to</span>
                    <select
                      value={authConfig.apiKey.addTo}
                      onChange={(event) =>
                        onAuthConfigChange({
                          ...authConfig,
                          apiKey: { ...authConfig.apiKey, addTo: event.target.value as "header" | "query" },
                        })
                      }
                    >
                      <option value="header">Header</option>
                      <option value="query">Query Params</option>
                    </select>
                  </label>
                </div>
              ) : null}
              {authType === "basic" ? (
                <div className="auth-fields">
                  <label className="field">
                    <span>Username</span>
                    <input
                      value={authConfig.basicAuth.username}
                      onChange={(event) =>
                        onAuthConfigChange({
                          ...authConfig,
                          basicAuth: { ...authConfig.basicAuth, username: event.target.value },
                        })
                      }
                      placeholder="username"
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <div className="input-with-eye">
                      <input
                        type={showBasicPassword ? "text" : "password"}
                        value={authConfig.basicAuth.password}
                        onChange={(event) =>
                          onAuthConfigChange({
                            ...authConfig,
                            basicAuth: { ...authConfig.basicAuth, password: event.target.value },
                          })
                        }
                        placeholder="password"
                      />
                      <button
                        type="button"
                        className="eye-toggle"
                        onClick={() => setShowBasicPassword((v) => !v)}
                        title={showBasicPassword ? "隐藏" : "显示"}
                      >
                        {showBasicPassword ? "👁" : "👁‍🗨"}
                      </button>
                    </div>
                  </label>
                </div>
              ) : null}

              {/* ── Custom Headers Section ── */}
              <div className="field">
                <span>Custom Headers</span>
                {headersList.length > 0 ? (
                  <div className="header-rows">
                    {headersList.map((h, i) => (
                      <div key={i} className="header-row">
                        <input
                          type="checkbox"
                          checked={h.enabled}
                          onChange={(event) => updateHeaderEntry(i, { enabled: event.target.checked })}
                          title={h.enabled ? "禁用" : "启用"}
                        />
                        <input
                          className="header-key"
                          value={h.key}
                          onChange={(event) => updateHeaderEntry(i, { key: event.target.value })}
                          placeholder="Key"
                        />
                        <input
                          className="header-value"
                          value={h.value}
                          onChange={(event) => updateHeaderEntry(i, { value: event.target.value })}
                          placeholder="Value"
                        />
                        <button
                          type="button"
                          className="header-delete-btn"
                          onClick={() => removeHeaderEntry(i)}
                          title="删除"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <button type="button" className="add-header-btn" onClick={addHeaderEntry}>
                  + Add Header
                </button>
              </div>

              {/* ── Query Params / Subprotocol ── */}
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
        </div>
      </div>
    </form>
  );
}
