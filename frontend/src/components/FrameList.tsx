import type { Frame } from "../types";

const MAX_RENDER_FRAMES = 500;

type Props = {
  frames: Frame[];
  selectedId: number | null;
  collapsed: boolean;
  searchText: string;
  directionFilter: string;
  typeFilter: string;
  onToggleCollapsed: () => void;
  onSelect: (id: number) => void;
  onClear: () => void;
  onSearchTextChange: (value: string) => void;
  onDirectionFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
};

export function FrameList({
  frames,
  selectedId,
  collapsed,
  searchText,
  directionFilter,
  typeFilter,
  onToggleCollapsed,
  onSelect,
  onClear,
  onSearchTextChange,
  onDirectionFilterChange,
  onTypeFilterChange,
}: Props) {
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredFrames = frames.filter((frame) => {
    const matchDirection = directionFilter === "all" || frame.direction === directionFilter;
    const matchType = typeFilter === "all" || frame.type === typeFilter;
    const haystack = `${frame.summary} ${frame.text ?? ""} ${frame.type} ${frame.direction}`.toLowerCase();
    const matchSearch = !normalizedSearch || haystack.includes(normalizedSearch);
    return matchDirection && matchType && matchSearch;
  });
  const visibleFrames =
    filteredFrames.length > MAX_RENDER_FRAMES ? filteredFrames.slice(-MAX_RENDER_FRAMES) : filteredFrames;

  return (
    <section className="panel frame-list-panel">
      <div className="frame-list-panel-header">
        <div className="panel-title">
          Frame List
          {collapsed && <span className="status-text frame-list-count"> {filteredFrames.length}/{frames.length}</span>}
        </div>
        <div className="frame-list-actions">
          {!collapsed && <button type="button" onClick={onClear}>Clear</button>}
        </div>
        <button
          type="button"
          className="connection-collapse-button"
          aria-label={collapsed ? "Expand frame list" : "Collapse frame list"}
          title={collapsed ? "Expand" : "Collapse"}
          onClick={onToggleCollapsed}
        >
          <svg
            className={`collapse-chevron${collapsed ? " is-collapsed" : ""}`}
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </button>
      </div>
      <div className={`frame-list-body-wrap${collapsed ? " collapsed" : ""}`}>
        <div className="frame-list-body-inner">
          <div className="audio-grid">
            <label className="field">
              <span>Search</span>
              <input value={searchText} onChange={(event) => onSearchTextChange(event.target.value)} placeholder="summary / text" />
            </label>
            <label className="field">
              <span>Direction</span>
              <select value={directionFilter} onChange={(event) => onDirectionFilterChange(event.target.value)}>
                <option value="all">All</option>
                <option value="in">In</option>
                <option value="out">Out</option>
                <option value="system">System</option>
              </select>
            </label>
            <label className="field">
              <span>Type</span>
              <select value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value)}>
                <option value="all">All</option>
                <option value="text">text</option>
                <option value="binary">binary</option>
                <option value="ping">ping</option>
                <option value="event">event</option>
                <option value="unknown">unknown</option>
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Dir</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {visibleFrames.map((frame) => (
                  <tr
                    key={frame.id}
                    className={selectedId === frame.id ? "selected" : ""}
                    onClick={() => onSelect(frame.id)}
                  >
                    <td>{new Date(frame.timestamp).toLocaleTimeString()}</td>
                    <td>{frame.direction}</td>
                    <td>{frame.type}</td>
                    <td>{frame.size}</td>
                    <td title={frame.summary}>{frame.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="status-text">
            已过滤 {filteredFrames.length} / 总计 {frames.length}
            {filteredFrames.length > MAX_RENDER_FRAMES ? `，仅渲染最近 ${MAX_RENDER_FRAMES} 条` : ""}
          </div>
        </div>
      </div>
    </section>
  );
}
