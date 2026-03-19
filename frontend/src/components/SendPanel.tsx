import { useRef } from "react";
import type { AudioFileInfo, AudioHeaderFieldRule, AudioStreamStatus, SessionProfileType } from "../types";

type HeaderTemplate = {
  name: string;
  seqStart: number;
  headerRules: AudioHeaderFieldRule[];
};

type ScrollExpandPreset = "sensitive" | "stable";

type Props = {
  textPayload: string;
  binaryPayload: string;
  binaryFilePath: string;
  pcmFilePath: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  frameMs: number;
  seqStart: number;
  headerRules: AudioHeaderFieldRule[];
  headerTemplates: HeaderTemplate[];
  streaming: boolean;
  connected: boolean;
  sessionProfile: SessionProfileType;
  streamStatus: AudioStreamStatus;
  audioFileInfo?: AudioFileInfo;
  translationFromLanguage: string;
  translationToLanguagesText: string;
  audioParamSource: string;
  headerConfigSource: string;
  onTextChange: (value: string) => void;
  onBinaryChange: (value: string) => void;
  onBinaryFilePathChange: (value: string) => void;
  onPcmFilePathChange: (value: string) => void;
  onPickBinaryFile: () => void;
  onPickPcmFile: () => void;
  onSampleRateChange: (value: number) => void;
  onChannelsChange: (value: number) => void;
  onBitDepthChange: (value: number) => void;
  onFrameMsChange: (value: number) => void;
  onSeqStartChange: (value: number) => void;
  onHeaderRulesChange: (value: AudioHeaderFieldRule[]) => void;
  onSaveHeaderTemplate: () => void;
  onLoadHeaderTemplate: (index: number) => void;
  onRenameHeaderTemplate: (index: number) => void;
  onDeleteHeaderTemplate: (index: number) => void;
  onApplyMiniTranslationPreset: () => void;
  onRunMiniTranslation: () => void;
  onTranslationFromLanguageChange: (value: string) => void;
  onTranslationToLanguagesChange: (value: string) => void;
  onApplyTranslationLanguagePreset: (fromLanguage: string, toLanguages: string[]) => void;
  onSessionProfileChange: (value: SessionProfileType) => void;
  onApplyJSONTemplate: (template: string) => void;
  onSendText: () => void;
  onSendBinary: () => void;
  onSendBinaryFile: () => void;
  onRunSession: () => void;
  onStartStream: () => void;
  onStopStream: () => void;
  onScrollCollapse?: (collapsed: boolean) => void;
  scrollExpandPreset: ScrollExpandPreset;
};

export function SendPanel({
  textPayload,
  binaryPayload,
  binaryFilePath,
  pcmFilePath,
  sampleRate,
  channels,
  bitDepth,
  frameMs,
  seqStart,
  headerRules,
  headerTemplates,
  streaming,
  connected,
  sessionProfile,
  streamStatus,
  audioFileInfo,
  translationFromLanguage,
  translationToLanguagesText,
  audioParamSource,
  headerConfigSource,
  onTextChange,
  onSendText,
  onBinaryChange,
  onBinaryFilePathChange,
  onPcmFilePathChange,
  onPickBinaryFile,
  onPickPcmFile,
  onSampleRateChange,
  onChannelsChange,
  onBitDepthChange,
  onFrameMsChange,
  onSeqStartChange,
  onHeaderRulesChange,
  onSaveHeaderTemplate,
  onLoadHeaderTemplate,
  onRenameHeaderTemplate,
  onDeleteHeaderTemplate,
  onApplyMiniTranslationPreset,
  onRunMiniTranslation,
  onTranslationFromLanguageChange,
  onTranslationToLanguagesChange,
  onApplyTranslationLanguagePreset,
  onSessionProfileChange,
  onApplyJSONTemplate,
  onSendBinary,
  onSendBinaryFile,
  onRunSession,
  onStartStream,
  onStopStream,
  onScrollCollapse,
  scrollExpandPreset,
}: Props) {
  const atTopSinceRef = useRef<number | null>(null);
  const topUpWheelAccumRef = useRef(0);
  const TOP_DWELL_MS = scrollExpandPreset === "sensitive" ? 220 : 420;
  const TOP_UP_ACCUM_THRESHOLD = scrollExpandPreset === "sensitive" ? 10 : 20;
  const TOP_FORCE_UP_ACCUM_THRESHOLD = scrollExpandPreset === "sensitive" ? 22 : 36;

  const handleScroll = onScrollCollapse
    ? (e: React.UIEvent<HTMLElement>) => {
        const top = e.currentTarget.scrollTop;
        if (top > 0) {
          atTopSinceRef.current = null;
          topUpWheelAccumRef.current = 0;
          onScrollCollapse(true);
        } else if (atTopSinceRef.current === null) {
          atTopSinceRef.current = Date.now();
          topUpWheelAccumRef.current = 0;
        }
      }
    : undefined;

  const handleWheel = onScrollCollapse
    ? (e: React.WheelEvent<HTMLElement>) => {
        if (e.currentTarget.scrollTop !== 0) {
          return;
        }
        if (e.deltaY < 0) {
          topUpWheelAccumRef.current += -e.deltaY;
          const since = atTopSinceRef.current;
          const dwellReached = since !== null && Date.now() - since >= TOP_DWELL_MS;
          const intentReached = topUpWheelAccumRef.current >= TOP_UP_ACCUM_THRESHOLD;
          const forceReached = topUpWheelAccumRef.current >= TOP_FORCE_UP_ACCUM_THRESHOLD;
          if ((dwellReached && intentReached) || forceReached) {
            onScrollCollapse(false);
            atTopSinceRef.current = Date.now();
            topUpWheelAccumRef.current = 0;
          }
        } else if (e.deltaY > 0) {
          topUpWheelAccumRef.current = 0;
        }
      }
    : undefined;

  const bytesPerSample = bitDepth > 0 ? bitDepth / 8 : 0;
  const frameBytes =
    sampleRate > 0 && channels > 0 && bytesPerSample > 0 && frameMs > 0
      ? Math.floor((sampleRate * channels * bytesPerSample * frameMs) / 1000)
      : 0;

  const handleHeaderRuleChange = (
    index: number,
    key: keyof AudioHeaderFieldRule,
    value: string
  ) => {
    const next = headerRules.map((item, idx) =>
      idx === index
        ? {
            ...item,
            [key]: key === "length" ? Number(value) || 0 : value,
          }
        : item
    );
    onHeaderRulesChange(next);
  };

  const createHeaderTemplate = (template: string): AudioHeaderFieldRule => {
    switch (template) {
      case "seq":
        return { name: "seq", type: "uint16", length: 2, endian: "big", defaultValue: "0", rule: "seq" };
      case "timestamp":
        return { name: "timestamp", type: "uint64", length: 8, endian: "big", defaultValue: "0", rule: "timestamp" };
      case "payload_len":
        return { name: "payload_len", type: "uint16", length: 2, endian: "big", defaultValue: "0", rule: "payload_len" };
      case "packet_len":
        return { name: "packet_len", type: "uint16", length: 2, endian: "big", defaultValue: "0", rule: "packet_len" };
      case "stream_id":
        return { name: "stream_id", type: "uint8", length: 1, endian: "big", defaultValue: "1", rule: "default" };
      case "type":
        return { name: "type", type: "uint8", length: 1, endian: "big", defaultValue: "1", rule: "default" };
      default:
        return { name: "field", type: "uint16", length: 2, endian: "big", defaultValue: "0", rule: "default" };
    }
  };

  const addHeaderRule = () => {
    onHeaderRulesChange([...headerRules, createHeaderTemplate("seq")]);
  };

  const addHeaderTemplate = (template: string) => {
    onHeaderRulesChange([...headerRules, createHeaderTemplate(template)]);
  };

  const encodeUintPreview = (value: number, length: number, endian: string) => {
    const bytes = new Array<number>(length).fill(0);
    let current = value >>> 0;
    if (endian === "little") {
      for (let i = 0; i < length; i += 1) {
        bytes[i] = current & 0xff;
        current = Math.floor(current / 256);
      }
    } else {
      for (let i = length - 1; i >= 0; i -= 1) {
        bytes[i] = current & 0xff;
        current = Math.floor(current / 256);
      }
    }
    return bytes;
  };

  const previewTimestamp = Date.now();
  const previewHeaderLength = headerRules.reduce((sum, rule) => sum + (rule.length || 0), 0);
  const headerPreviewHex = headerRules
    .flatMap((rule) => {
      const fieldType = (rule.type || "uint").toLowerCase();
      const endian = (rule.endian || "big").toLowerCase();
      const normalizedRule = (rule.rule || "").toLowerCase();
      let value = rule.defaultValue;
      if (normalizedRule === "payload_len" || normalizedRule === "payload_length") {
        value = String(frameBytes);
      } else if (normalizedRule === "packet_len" || normalizedRule === "packet_length") {
        value = String(frameBytes + previewHeaderLength);
      } else if (normalizedRule === "seq" || normalizedRule === "seq++") {
        value = String(seqStart);
      } else if (normalizedRule === "timestamp" || normalizedRule === "unix_ms") {
        value = String(previewTimestamp);
      }
      if (["uint", "uint8", "uint16", "uint32", "uint64"].includes(fieldType)) {
        const n = Number(value) || 0;
        return encodeUintPreview(n, rule.length || 0, endian);
      }
      const bytes = new Array<number>(rule.length || 0).fill(0);
      Array.from(value).slice(0, rule.length || 0).forEach((ch, idx) => {
        bytes[idx] = ch.charCodeAt(0);
      });
      return bytes;
    })
    .map((value) => value.toString(16).padStart(2, "0"))
    .join(" ");

  const removeHeaderRule = (index: number) => {
    onHeaderRulesChange(headerRules.filter((_, idx) => idx !== index));
  };

  const validationErrors = headerRules.flatMap((rule, index) => {
    const errors: string[] = [];
    if (!rule.name.trim()) {
      errors.push(`字段 #${index + 1} 缺少 name`);
    }
    if (rule.length <= 0) {
      errors.push(`字段 ${rule.name || `#${index + 1}`} length 必须大于 0`);
    }
    const fieldType = (rule.type || "").toLowerCase();
    if (fieldType === "uint8" && rule.length !== 1) errors.push(`${rule.name} 作为 uint8 时 length 应为 1`);
    if (fieldType === "uint16" && rule.length !== 2) errors.push(`${rule.name} 作为 uint16 时 length 应为 2`);
    if (fieldType === "uint32" && rule.length !== 4) errors.push(`${rule.name} 作为 uint32 时 length 应为 4`);
    if (fieldType === "uint64" && rule.length !== 8) errors.push(`${rule.name} 作为 uint64 时 length 应为 8`);
    if (["seq", "seq++", "timestamp", "unix_ms", "payload_len", "payload_length", "packet_len", "packet_length"].includes((rule.rule || "").toLowerCase()) && !fieldType.startsWith("uint")) {
      errors.push(`${rule.name} 使用动态数值规则时建议 type 为 uint*`);
    }
    return errors;
  });

  const moveHeaderRule = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= headerRules.length) {
      return;
    }
    const next = [...headerRules];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    onHeaderRulesChange(next);
  };

  const translationTargetPresets = [
    { label: "English", value: ["en-US"] },
    { label: "Japanese", value: ["ja-JP"] },
    { label: "Korean", value: ["ko-KR"] },
    { label: "English + Japanese", value: ["en-US", "ja-JP"] },
  ];

  return (
    <section
      className="panel send-panel"
      onScroll={handleScroll}
      onWheel={handleWheel}
    >
      <div className="panel-title">Send Panel</div>
      <div className="panel-header">
        <div className="panel-title">JSON Body</div>
        <div className="button-row">
          <button type="button" onClick={() => onApplyJSONTemplate(`${sessionProfile}_start`)}>Use Start Template</button>
          <button type="button" onClick={() => onApplyJSONTemplate(`${sessionProfile}_close`)}>Use Close Template</button>
        </div>
      </div>
      <label className="field">
        <span>Session Profile</span>
        <select value={sessionProfile} onChange={(event) => onSessionProfileChange(event.target.value as SessionProfileType)}>
          <option value="translation">translation</option>
          <option value="chat">chat</option>
        </select>
      </label>
      {sessionProfile === "translation" ? (
        <>
          <div className="panel-header">
            <div className="panel-title">Translation Languages</div>
            <button type="button" onClick={() => onApplyJSONTemplate("translation_start")}>Apply To Start JSON</button>
          </div>
          <div className="audio-grid">
            <label className="field">
              <span>From Language</span>
              <input
                value={translationFromLanguage}
                onChange={(event) => onTranslationFromLanguageChange(event.target.value)}
                placeholder="zh-CN"
              />
            </label>
            <label className="field">
              <span>To Languages</span>
              <input
                value={translationToLanguagesText}
                onChange={(event) => onTranslationToLanguagesChange(event.target.value)}
                placeholder="en-US, ja-JP"
              />
            </label>
          </div>
          <div className="button-row button-row-wrap">
            <button type="button" onClick={() => onApplyTranslationLanguagePreset("zh-CN", ["en-US"])}>zh-CN → en-US</button>
            <button type="button" onClick={() => onApplyTranslationLanguagePreset("zh-CN", ["ja-JP"])}>zh-CN → ja-JP</button>
            <button type="button" onClick={() => onApplyTranslationLanguagePreset("en-US", ["zh-CN"])}>en-US → zh-CN</button>
            {translationTargetPresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => onApplyTranslationLanguagePreset(translationFromLanguage || "zh-CN", preset.value)}
              >
                Targets: {preset.value.join(", ")}
              </button>
            ))}
          </div>
          <div className="status-text">Language tags use full form, for example zh-CN / en-US / ja-JP.</div>
        </>
      ) : null}
      {audioFileInfo?.success ? (
        <div className="status-text">
          Audio file: {audioFileInfo.format.toUpperCase()} | bytes: {audioFileInfo.dataBytes}
          {audioFileInfo.format === "wav"
            ? ` | ${audioFileInfo.sampleRate}Hz | ${audioFileInfo.channels}ch | ${audioFileInfo.bitDepth}bit`
            : " | raw metadata unavailable"}
        </div>
      ) : null}
      <div className="status-text">Audio params source: {audioParamSource}</div>
      <div className="status-text">Header config source: {headerConfigSource}</div>
      <label className="field">
        <span>Variables: {"${message_id}"} {"${operation_id}"} {"${conversation_id}"} {"${stream_id}"} {"${created_at}"}</span>
        <textarea
          value={textPayload}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder='{"type":"translation|chat","event":"start","message_id":"${message_id}"}'
          rows={6}
        />
      </label>
      <button disabled={!connected} onClick={onSendText}>
        Send JSON
      </button>

      <label className="field">
        <span>Binary (Base64)</span>
        <textarea
          value={binaryPayload}
          onChange={(event) => onBinaryChange(event.target.value)}
          placeholder="aGVsbG8="
          rows={3}
        />
      </label>
      <button disabled={!connected} onClick={onSendBinary}>
        Send Binary Base64
      </button>

      <label className="field">
        <span>Binary File Path</span>
        <div className="path-row">
          <input
            value={binaryFilePath}
            onChange={(event) => onBinaryFilePathChange(event.target.value)}
            placeholder="/absolute/path/to/payload.bin"
          />
          <button type="button" onClick={onPickBinaryFile}>
            选择文件
          </button>
        </div>
      </label>
      <button disabled={!connected || !binaryFilePath.trim()} onClick={onSendBinaryFile}>
        Send Binary File
      </button>

      <label className="field">
        <span>PCM/WAV File Path</span>
        <div className="path-row">
          <input
            value={pcmFilePath}
            onChange={(event) => onPcmFilePathChange(event.target.value)}
            placeholder="/absolute/path/to/audio.pcm or audio.wav"
          />
          <button type="button" onClick={onPickPcmFile}>
            选择文件
          </button>
        </div>
      </label>

      <div className="audio-grid">
        <label className="field">
          <span>Sample Rate</span>
          <input
            type="number"
            value={sampleRate}
            onChange={(event) => onSampleRateChange(Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span>Channels</span>
          <input
            type="number"
            value={channels}
            onChange={(event) => onChannelsChange(Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span>Bit Depth</span>
          <input
            type="number"
            value={bitDepth}
            onChange={(event) => onBitDepthChange(Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span>Frame Ms</span>
          <input
            type="number"
            value={frameMs}
            onChange={(event) => onFrameMsChange(Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span>Seq Start</span>
          <input
            type="number"
            value={seqStart}
            onChange={(event) => onSeqStartChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="panel-header">
        <div className="panel-title">PCM Header Rules</div>
        <div className="button-row">
          <button type="button" onClick={addHeaderRule}>Add Header Field</button>
          <button type="button" onClick={onApplyMiniTranslationPreset}>Use Mini Translation Preset</button>
          <button type="button" onClick={() => addHeaderTemplate("seq")}>+ seq</button>
          <button type="button" onClick={() => addHeaderTemplate("timestamp")}>+ timestamp</button>
          <button type="button" onClick={() => addHeaderTemplate("payload_len")}>+ payload_len</button>
          <button type="button" onClick={() => addHeaderTemplate("packet_len")}>+ packet_len</button>
          <button type="button" onClick={() => addHeaderTemplate("stream_id")}>+ stream_id</button>
          <button type="button" onClick={() => addHeaderTemplate("type")}>+ type</button>
          <button type="button" onClick={onSaveHeaderTemplate}>Save Template</button>
        </div>
      </div>
      {headerTemplates.length > 0 ? (
        <div className="audio-grid">
          <label className="field">
            <span>Header Template</span>
            <select defaultValue="" onChange={(event) => onLoadHeaderTemplate(Number(event.target.value))}>
              <option value="" disabled>
                选择已保存模板
              </option>
              {headerTemplates.map((template, index) => (
                <option key={`${template.name}-${index}`} value={index}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Rename Template</span>
            <select defaultValue="" onChange={(event) => onRenameHeaderTemplate(Number(event.target.value))}>
              <option value="" disabled>
                选择模板重命名
              </option>
              {headerTemplates.map((template, index) => (
                <option key={`${template.name}-rename-${index}`} value={index}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Delete Template</span>
            <select defaultValue="" onChange={(event) => onDeleteHeaderTemplate(Number(event.target.value))}>
              <option value="" disabled>
                选择模板删除
              </option>
              {headerTemplates.map((template, index) => (
                <option key={`${template.name}-delete-${index}`} value={index}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {headerRules.length === 0 ? <div className="status-text">No custom header. PCM payload will be sent directly.</div> : null}
      {headerRules.map((rule, index) => (
        <div key={`${rule.name}-${index}`} className="audio-grid">
          <label className="field">
            <span>Name</span>
            <input value={rule.name} onChange={(event) => handleHeaderRuleChange(index, "name", event.target.value)} />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={rule.type} onChange={(event) => handleHeaderRuleChange(index, "type", event.target.value)}>
              <option value="uint8">uint8</option>
              <option value="uint16">uint16</option>
              <option value="uint32">uint32</option>
              <option value="uint64">uint64</option>
              <option value="string">string</option>
              <option value="bytes">bytes</option>
            </select>
          </label>
          <label className="field">
            <span>Length</span>
            <input type="number" value={rule.length} onChange={(event) => handleHeaderRuleChange(index, "length", event.target.value)} />
          </label>
          <label className="field">
            <span>Endian</span>
            <select value={rule.endian} onChange={(event) => handleHeaderRuleChange(index, "endian", event.target.value)}>
              <option value="big">big</option>
              <option value="little">little</option>
            </select>
          </label>
          <label className="field">
            <span>Default</span>
            <input value={rule.defaultValue} onChange={(event) => handleHeaderRuleChange(index, "defaultValue", event.target.value)} />
          </label>
          <label className="field">
            <span>Rule</span>
            <input value={rule.rule} onChange={(event) => handleHeaderRuleChange(index, "rule", event.target.value)} placeholder="default / seq / timestamp / payload_len" />
          </label>
          <div className="button-row">
            <button type="button" onClick={() => moveHeaderRule(index, -1)} disabled={index === 0}>↑</button>
            <button type="button" onClick={() => moveHeaderRule(index, 1)} disabled={index === headerRules.length - 1}>↓</button>
            <button type="button" onClick={() => removeHeaderRule(index)}>Remove</button>
          </div>
        </div>
      ))}

      {validationErrors.length > 0 ? (
        <div className="error-box">{validationErrors.join("；")}</div>
      ) : null}
      <div className="status-text">Estimated frame size: {frameBytes} bytes / frame</div>
      <div className="status-text">Estimated header size: {previewHeaderLength} bytes</div>
      <div className="status-text">Estimated packet size: {previewHeaderLength + frameBytes} bytes</div>
      <div className="status-text">Header preview HEX: {headerPreviewHex || "(empty)"}</div>
      <div className="status-text">
        Stream status: {streamStatus.running ? "running" : "idle"} | sent frames: {streamStatus.sentFrames} | sent bytes: {streamStatus.sentBytes}
        {streamStatus.finishReason ? ` | reason: ${streamStatus.finishReason}` : ""}
      </div>
      {streamStatus.lastError ? <div className="error-box">{streamStatus.lastError}</div> : null}

      <div className="button-row">
        <button disabled={streaming || !pcmFilePath.trim() || validationErrors.length > 0} onClick={onRunMiniTranslation}>
          Run Mini Translation
        </button>
        <button disabled={streaming || !pcmFilePath.trim() || validationErrors.length > 0} onClick={onRunSession}>
          Run Session
        </button>
        <button disabled={!connected || streaming || !pcmFilePath.trim() || validationErrors.length > 0} onClick={onStartStream}>
          Start PCM Stream
        </button>
        <button disabled={!streaming} onClick={onStopStream}>
          Stop PCM Stream
        </button>
      </div>
    </section>
  );
}
