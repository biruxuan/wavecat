import { useCallback, useEffect, useState } from "react";
import { useSendPanelContext } from "../../context/SendPanelContext";
import type { SendProfile } from "../../types";

const PROFILES_KEY = "wavecat.sendProfiles";

function loadProfiles(): SendProfile[] {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProfiles(profiles: SendProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function ProfileSelector() {
  const ctx = useSendPanelContext();
  const [profiles, setProfiles] = useState<SendProfile[]>(loadProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [showManager, setShowManager] = useState(false);
  const [editingName, setEditingName] = useState("");

  // Load profiles on mount
  useEffect(() => {
    setProfiles(loadProfiles());
  }, []);

  const captureCurrentState = useCallback(
    (name: string): SendProfile => ({
      id: generateId(),
      name,
      sessionProfile: ctx.sessionProfile,
      translationFromLanguage: ctx.translationFromLanguage,
      translationToLanguagesText: ctx.translationToLanguagesText,
      sampleRate: ctx.sampleRate,
      channels: ctx.channels,
      bitDepth: ctx.bitDepth,
      frameMs: ctx.frameMs,
      seqStart: ctx.seqStart,
      headerRules: [...ctx.headerRules],
      textPayload: ctx.textPayload,
    }),
    [ctx]
  );

  const handleSave = useCallback(() => {
    const name = editingName.trim() || `Profile ${profiles.length + 1}`;
    const profile = captureCurrentState(name);
    const updated = [...profiles, profile];
    setProfiles(updated);
    saveProfiles(updated);
    setActiveProfileId(profile.id);
    setEditingName("");
    setShowManager(false);
  }, [editingName, profiles, captureCurrentState]);

  const handleLoad = useCallback(
    (profile: SendProfile) => {
      ctx.onSessionProfileChange(profile.sessionProfile);
      ctx.onTranslationFromLanguageChange(profile.translationFromLanguage);
      ctx.onTranslationToLanguagesChange(profile.translationToLanguagesText);
      ctx.onSampleRateChange(profile.sampleRate);
      ctx.onChannelsChange(profile.channels);
      ctx.onBitDepthChange(profile.bitDepth);
      ctx.onFrameMsChange(profile.frameMs);
      ctx.onSeqStartChange(profile.seqStart);
      ctx.onHeaderRulesChange([...profile.headerRules]);
      ctx.onTextChange(profile.textPayload);
      setActiveProfileId(profile.id);
    },
    [ctx]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const updated = profiles.filter((p) => p.id !== id);
      setProfiles(updated);
      saveProfiles(updated);
      if (activeProfileId === id) setActiveProfileId(null);
    },
    [profiles, activeProfileId]
  );

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  return (
    <div className="ps-container">
      <div className="ps-row">
        <select
          className="ps-select"
          value={activeProfileId || ""}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) {
              setActiveProfileId(null);
              return;
            }
            const profile = profiles.find((p) => p.id === id);
            if (profile) handleLoad(profile);
          }}
        >
          <option value="">— Select Profile —</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="ps-save-btn"
          onClick={() => setShowManager((v) => !v)}
          title="Save / Manage profiles"
        >
          💾 Save
        </button>
      </div>

      {showManager && (
        <div className="ps-manager">
          <div className="ps-save-row">
            <input
              type="text"
              className="ps-name-input"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              placeholder="Profile name..."
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            <button type="button" onClick={handleSave}>
              Save Current
            </button>
          </div>

          {profiles.length > 0 && (
            <div className="ps-list">
              {profiles.map((p) => (
                <div key={p.id} className={`ps-list-item ${p.id === activeProfileId ? "active" : ""}`}>
                  <span className="ps-list-name">{p.name}</span>
                  <span className="ps-list-meta">{p.sessionProfile} · {p.sampleRate}Hz</span>
                  <button type="button" className="ps-list-load" onClick={() => handleLoad(p)}>
                    Load
                  </button>
                  <button type="button" className="ps-list-delete" onClick={() => handleDelete(p.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
