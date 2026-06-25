import { useCallback, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { syntaxTree } from "@codemirror/language";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { useSendPanelContext } from "../../context/SendPanelContext";
import type { SendTemplate } from "../../types";

const RECENT_KEY = "wavecat.recentJson";
const MAX_RECENT = 10;
const TEMPLATES_KEY = "wavecat.sendTemplates";

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

function loadJsonTemplates(): SendTemplate[] {
  try {
    const all: SendTemplate[] = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || "[]");
    return all.filter((t) => t.type === "json");
  } catch {
    return [];
  }
}

// Real-time JSON linter using Lezer parse tree
const jsonLinter = linter((view): Diagnostic[] => {
  const doc = view.state.doc.toString();
  if (!doc.trim()) return [];
  const diagnostics: Diagnostic[] = [];
  const tree = syntaxTree(view.state);
  tree.iterate({
    enter(node) {
      if (node.type.isError) {
        const from = node.from;
        const to = node.to > node.from ? node.to : Math.min(from + 1, doc.length);
        diagnostics.push({
          from,
          to,
          severity: "error",
          message: "JSON syntax error",
        });
      }
    },
  });
  // JSON.parse fallback for structural errors
  if (diagnostics.length === 0) {
    try {
      JSON.parse(doc);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const posMatch = msg.match(/position\s+(\d+)/i);
      const from = posMatch ? Math.min(Number(posMatch[1]), doc.length) : doc.length - 1;
      diagnostics.push({
        from,
        to: Math.min(from + 1, doc.length),
        severity: "error",
        message: msg,
      });
    }
  }
  return diagnostics;
}, { delay: 150 });

export function QuickSendBar() {
  const {
    textPayload,
    onTextChange,
    onSendText,
    connected,
    onApplyJSONTemplate,
    sessionProfile,
  } = useSendPanelContext();

  const [expanded, setExpanded] = useState(true);
  const [recentOpen, setRecentOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [recentList, setRecentList] = useState<string[]>(loadRecent);
  const [jsonTemplates, setJsonTemplates] = useState<SendTemplate[]>(loadJsonTemplates);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    if (!connected || !textPayload.trim()) return;
    onSendText();
    const trimmed = textPayload.trim();
    if (trimmed) {
      const updated = [trimmed, ...recentList.filter((r) => r !== trimmed)].slice(0, MAX_RECENT);
      setRecentList(updated);
      saveRecent(updated);
    }
  }, [connected, textPayload, onSendText, recentList]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const sendKeymap = keymap.of([{
    key: "Mod-Enter",
    run: () => { handleSend(); return true; },
  }]);

  const extensions = [
    json(),
    jsonLinter,
    lintGutter(),
    sendKeymap,
  ];

  const handleFormat = useCallback(() => {
    try {
      onTextChange(JSON.stringify(JSON.parse(textPayload), null, 2));
    } catch {
      // invalid JSON, ignore
    }
  }, [textPayload, onTextChange]);

  useEffect(() => {
    if (templatesOpen) setJsonTemplates(loadJsonTemplates());
  }, [templatesOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".qsb-dropdown")) {
        setRecentOpen(false);
        setTemplatesOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const renderDropdowns = () => (
    <>
      <div className="qsb-dropdown">
        <button
          type="button"
          className="qsb-dropdown-trigger"
          onClick={() => { setRecentOpen((v) => !v); setTemplatesOpen(false); }}
          title="Recent JSON"
        >
          Recent ▾
        </button>
        {recentOpen && recentList.length > 0 && (
          <div className="qsb-dropdown-menu">
            {recentList.map((item, i) => (
              <button
                key={i}
                type="button"
                className="qsb-dropdown-item"
                onClick={() => {
                  onTextChange(item);
                  setRecentOpen(false);
                  inputRef.current?.focus();
                }}
              >
                <span className="qsb-dropdown-item-text">{item}</span>
              </button>
            ))}
            <button
              type="button"
              className="qsb-dropdown-item qsb-dropdown-clear"
              onClick={() => {
                setRecentList([]);
                saveRecent([]);
                setRecentOpen(false);
              }}
            >
              Clear history
            </button>
          </div>
        )}
      </div>
      <div className="qsb-dropdown">
        <button
          type="button"
          className="qsb-dropdown-trigger"
          onClick={() => { setTemplatesOpen((v) => !v); setRecentOpen(false); }}
          title="Insert from template"
        >
          Templates ▾
        </button>
        {templatesOpen && (
          <div className="qsb-dropdown-menu">
            <button
              type="button"
              className="qsb-dropdown-item"
              onClick={() => {
                onApplyJSONTemplate(`${sessionProfile}_start`);
                setTemplatesOpen(false);
              }}
            >
              {sessionProfile} start
            </button>
            <button
              type="button"
              className="qsb-dropdown-item"
              onClick={() => {
                onApplyJSONTemplate(`${sessionProfile}_close`);
                setTemplatesOpen(false);
              }}
            >
              {sessionProfile} close
            </button>
            {jsonTemplates.length > 0 && <div className="qsb-dropdown-divider" />}
            {jsonTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="qsb-dropdown-item"
                onClick={() => {
                  onTextChange(t.content);
                  setTemplatesOpen(false);
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="qsb-container">
      {/* Toggle bar — always visible */}
      <div className="qsb-toggle-bar">
        <span className="qsb-toggle-label">JSON Editor</span>
        <div className="qsb-toggle-actions">
          {renderDropdowns()}
          <button type="button" className="qsb-format-btn" onClick={handleFormat} title="Format JSON">
            Format
          </button>
          <button
            type="button"
            className="qsb-toggle-btn"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▴ Collapse" : "▾ Expand"}
          </button>
        </div>
      </div>

      {/* Collapsed: single-line input */}
      {!expanded ? (
        <div className="qsb-single-row">
          <input
            ref={inputRef}
            type="text"
            className="qsb-input"
            value={textPayload}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='{"type":"start"} — Enter to send'
            spellCheck={false}
          />
          <button
            type="button"
            className="qsb-send-btn"
            disabled={!connected || !textPayload.trim()}
            onClick={handleSend}
          >
            Send ↵
          </button>
        </div>
      ) : (
        /* Expanded: CodeMirror — auto height */
        <div className="qsb-expanded">
          <div className="qsb-editor-wrap">
            <CodeMirror
              value={textPayload}
              onChange={(v) => onTextChange(v)}
              extensions={extensions}
              theme={oneDark}
              basicSetup={{
                lineNumbers: false,
                foldGutter: true,
                highlightActiveLine: true,
                bracketMatching: true,
                closeBrackets: true,
                indentOnInput: true,
              }}
            />
          </div>
          <div className="qsb-expanded-footer">
            <span className="qsb-hint">Ctrl+Enter to send · Format to prettify</span>
            <button
              type="button"
              className="qsb-send-btn"
              disabled={!connected || !textPayload.trim()}
              onClick={handleSend}
            >
              Send ↵
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
