package frame

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"wavecat/internal/model"
)

const maxBinaryPayloadPreviewBytes = 4096
const maxTextPayloadBytes = 262144

type Store struct {
	mu      sync.RWMutex
	frames  []model.FrameDTO
	maxSize int
	nextID  int64
}

func NewStore(maxSize int) *Store {
	if maxSize <= 0 {
		maxSize = 2000
	}

	return &Store{
		frames:  make([]model.FrameDTO, 0, maxSize),
		maxSize: maxSize,
		nextID:  1,
	}
}

func (s *Store) Add(frame model.FrameDTO) {
	s.mu.Lock()
	defer s.mu.Unlock()

	frame.ID = s.nextID
	s.nextID++
	if frame.Timestamp == 0 {
		frame.Timestamp = time.Now().UnixMilli()
	}

	if len(s.frames) >= s.maxSize {
		s.frames = append(s.frames[1:], frame)
		return
	}

	s.frames = append(s.frames, frame)
}

func (s *Store) List() []model.FrameDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]model.FrameDTO, len(s.frames))
	copy(result, s.frames)
	return result
}

func (s *Store) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.frames = s.frames[:0]
}

func BuildEventFrame(summary string, errMsg string) model.FrameDTO {
	return model.FrameDTO{
		Direction: "system",
		Type:      "event",
		Summary:   summary,
		Error:     errMsg,
	}
}

func BuildTextFrame(direction string, text string) model.FrameDTO {
	originalSize := len([]byte(text))
	preview, truncated := truncateString(text, maxTextPayloadBytes)

	summaryPrefix := "Text"
	prettyText := preview
	semantic := ""
	if prettyJSON, ok := tryPrettyJSON(preview); ok {
		summaryPrefix = "JSON"
		prettyText = prettyJSON
		semantic = extractJSONSemantic(text)
	}

	summary := fmt.Sprintf("%s %d bytes", summaryPrefix, originalSize)
	if semantic != "" {
		summary = fmt.Sprintf("%s %s %d bytes", summaryPrefix, semantic, originalSize)
	}
	if truncated {
		summary = fmt.Sprintf("%s (preview %d bytes)", summary, maxTextPayloadBytes)
	}

	return model.FrameDTO{
		Direction: direction,
		Type:      "text",
		Size:      originalSize,
		Summary:   summary,
		Text:      prettyText,
	}
}

func BuildBinaryFrame(direction string, payload []byte) model.FrameDTO {
	originalSize := len(payload)
	preview, truncated := truncateBytes(payload, maxBinaryPayloadPreviewBytes)

	hexText := strings.ToUpper(hex.EncodeToString(preview))
	spacedHex := splitEvery(hexText, 2)
	asciiText := toASCII(preview)

	summary := fmt.Sprintf("Binary %d bytes", originalSize)
	if desc, ok := describeGatewayBinary(payload); ok {
		summary = fmt.Sprintf("%s (%d bytes)", desc, originalSize)
	}
	if truncated {
		summary = fmt.Sprintf("%s (preview %d bytes)", summary, maxBinaryPayloadPreviewBytes)
	}

	return model.FrameDTO{
		Direction: direction,
		Type:      "binary",
		Size:      originalSize,
		Summary:   summary,
		Base64:    base64.StdEncoding.EncodeToString(preview),
		Hex:       spacedHex,
		ASCII:     asciiText,
	}
}

func truncateBytes(payload []byte, maxBytes int) ([]byte, bool) {
	if len(payload) <= maxBytes {
		return payload, false
	}
	return payload[:maxBytes], true
}

func truncateString(content string, maxBytes int) (string, bool) {
	raw := []byte(content)
	if len(raw) <= maxBytes {
		return content, false
	}
	return string(raw[:maxBytes]), true
}

func tryPrettyJSON(text string) (string, bool) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return "", false
	}

	var val any
	if err := json.Unmarshal([]byte(trimmed), &val); err != nil {
		return "", false
	}

	buf := &bytes.Buffer{}
	if err := json.Indent(buf, []byte(trimmed), "", "  "); err != nil {
		return "", false
	}

	return buf.String(), true
}

func extractJSONSemantic(text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return ""
	}

	var parsed struct {
		Type    string `json:"type"`
		Event   string `json:"event"`
		Payload struct {
			Role        string `json:"role"`
			ContentType string `json:"content_type"`
		} `json:"payload"`
	}

	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return ""
	}

	parts := make([]string, 0, 3)
	if parsed.Type != "" || parsed.Event != "" {
		parts = append(parts, strings.ToLower(strings.TrimSpace(parsed.Type))+"/"+strings.ToLower(strings.TrimSpace(parsed.Event)))
	}
	if parsed.Payload.Role != "" || parsed.Payload.ContentType != "" {
		parts = append(parts, strings.ToLower(strings.TrimSpace(parsed.Payload.Role))+"/"+strings.ToLower(strings.TrimSpace(parsed.Payload.ContentType)))
	}

	cleaned := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.Trim(part, "/")
		if part != "" {
			cleaned = append(cleaned, part)
		}
	}

	if len(cleaned) == 0 {
		return ""
	}

	return strings.Join(cleaned, " ")
}

func describeGatewayBinary(payload []byte) (string, bool) {
	if len(payload) < 12 {
		return "", false
	}

	magic := binary.BigEndian.Uint16(payload[0:2])
	if magic != 0xAA55 {
		return "", false
	}

	flags := payload[3]
	streamID := binary.BigEndian.Uint16(payload[4:6])
	seq := binary.BigEndian.Uint32(payload[6:10])
	payloadLen := binary.BigEndian.Uint16(payload[10:12])

	flagName := "AUDIO_UNKNOWN"
	switch flags {
	case 0x01:
		flagName = "AUDIO_START"
	case 0x02:
		flagName = "AUDIO_CHUNK"
	case 0x03:
		flagName = "AUDIO_END"
	case 0x04:
		flagName = "AUDIO_STOP"
	}

	return fmt.Sprintf("Gateway %s sid=%d seq=%d payload=%d", flagName, streamID, seq, payloadLen), true
}

func splitEvery(text string, step int) string {
	if len(text) == 0 || step <= 0 {
		return text
	}

	parts := make([]string, 0, len(text)/step+1)
	for i := 0; i < len(text); i += step {
		end := i + step
		if end > len(text) {
			end = len(text)
		}
		parts = append(parts, text[i:end])
	}

	return strings.Join(parts, " ")
}

func toASCII(payload []byte) string {
	result := make([]byte, len(payload))
	for index, b := range payload {
		if b >= 32 && b <= 126 {
			result[index] = b
			continue
		}
		result[index] = '.'
	}
	return string(result)
}
