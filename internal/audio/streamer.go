package audio

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"wavecat/internal/frame"
	"wavecat/internal/model"
	"wavecat/internal/ws"
)

type Streamer struct {
	mu           sync.Mutex
	wsClient     *ws.Client
	store        *frame.Store
	running      bool
	stopCh       chan struct{}
	filePath     string
	frameBytes   int
	frameMs      int
	seqStart     int
	headerRules  []model.AudioHeaderFieldRule
	sentFrames   int
	sentBytes    int
	lastError    string
	finishReason string
}

type wavFileInfo struct {
	SampleRate int
	Channels   int
	BitDepth   int
	Data       []byte
}

func NewStreamer(wsClient *ws.Client, store *frame.Store) *Streamer {
	return &Streamer{wsClient: wsClient, store: store}
}

func (s *Streamer) Start(config model.AudioStreamConfig) error {
	frameBytes, cfg, err := normalizeConfig(config)
	if err != nil {
		return err
	}

	reader, err := openAudioReader(cfg.FilePath)
	if err != nil {
		return err
	}

	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		_ = reader.Close()
		return fmt.Errorf("PCM 流正在发送中")
	}
	stopCh := make(chan struct{})
	s.running = true
	s.stopCh = stopCh
	s.filePath = cfg.FilePath
	s.frameBytes = frameBytes
	s.frameMs = cfg.FrameMs
	s.seqStart = cfg.SeqStart
	s.headerRules = cfg.HeaderRules
	s.sentFrames = 0
	s.sentBytes = 0
	s.lastError = ""
	s.finishReason = ""
	s.mu.Unlock()

	s.store.Add(frame.BuildEventFrame(fmt.Sprintf("PCM stream started: %s", cfg.FilePath), ""))
	go s.streamLoop(reader, frameBytes, cfg.FrameMs, cfg.HeaderRules, stopCh)

	return nil
}

func (s *Streamer) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	stopCh := s.stopCh
	s.running = false
	s.stopCh = nil
	if s.finishReason == "" {
		s.finishReason = "stopped"
	}
	s.mu.Unlock()

	if stopCh != nil {
		close(stopCh)
	}
}

func (s *Streamer) StartLive(config model.AudioStreamConfig) error {
	frameBytes, cfg, err := normalizeLiveConfig(config)
	if err != nil {
		return err
	}

	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("PCM 流正在发送中")
	}
	stopCh := make(chan struct{})
	s.running = true
	s.stopCh = stopCh
	s.filePath = "[microphone]"
	s.frameBytes = frameBytes
	s.frameMs = cfg.FrameMs
	s.seqStart = cfg.SeqStart
	s.headerRules = cfg.HeaderRules
	s.sentFrames = 0
	s.sentBytes = 0
	s.lastError = ""
	s.finishReason = ""
	s.mu.Unlock()

	s.store.Add(frame.BuildEventFrame("Microphone stream started", ""))
	return nil
}

func (s *Streamer) SendLiveChunk(payload []byte) error {
	if len(payload) == 0 {
		return nil
	}

	s.mu.Lock()
	if !s.running || s.filePath != "[microphone]" {
		s.mu.Unlock()
		return fmt.Errorf("麦克风流未启动")
	}
	seq := s.seqStart + s.sentFrames
	isFirst := s.sentFrames == 0
	headerRules := append([]model.AudioHeaderFieldRule(nil), s.headerRules...)
	s.mu.Unlock()

	packet, err := buildPacket(headerRules, seq, payload, isFirst, true, false)
	if err != nil {
		s.mu.Lock()
		s.lastError = err.Error()
		s.finishReason = "header_error"
		s.mu.Unlock()
		s.store.Add(frame.BuildEventFrame("Microphone stream header error", err.Error()))
		return err
	}

	if err := s.wsClient.SendBinary(packet); err != nil {
		s.mu.Lock()
		s.lastError = err.Error()
		s.finishReason = "send_error"
		s.mu.Unlock()
		s.store.Add(frame.BuildEventFrame("Microphone stream send error", err.Error()))
		return err
	}

	s.markSendSuccess(len(payload))
	return nil
}

func (s *Streamer) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

func (s *Streamer) Status() model.AudioStreamStatusDTO {
	s.mu.Lock()
	defer s.mu.Unlock()
	return model.AudioStreamStatusDTO{
		Running:      s.running,
		FilePath:     s.filePath,
		FrameBytes:   s.frameBytes,
		FrameMs:      s.frameMs,
		SentFrames:   s.sentFrames,
		SentBytes:    s.sentBytes,
		LastError:    s.lastError,
		FinishReason: s.finishReason,
	}
}

func (s *Streamer) streamLoop(reader io.ReadCloser, frameBytes int, frameMs int, headerRules []model.AudioHeaderFieldRule, stopCh chan struct{}) {
	defer reader.Close()
	ticker := time.NewTicker(time.Duration(frameMs) * time.Millisecond)
	defer ticker.Stop()

	buffer := make([]byte, frameBytes)

	for {
		select {
		case <-stopCh:
			s.store.Add(frame.BuildEventFrame("PCM stream stopped", ""))
			return
		case <-ticker.C:
			n, readErr := io.ReadFull(reader, buffer)
			if readErr != nil {
				if readErr == io.EOF || readErr == io.ErrUnexpectedEOF {
					if n > 0 {
						payload := make([]byte, n)
						copy(payload, buffer[:n])
						seq, isFirst := s.currentSeqAndFirst()
						packet, err := buildPacket(headerRules, seq, payload, isFirst, false, true)
						if err != nil {
							s.mu.Lock()
							s.lastError = err.Error()
							s.finishReason = "header_error"
							s.mu.Unlock()
							s.store.Add(frame.BuildEventFrame("PCM stream header error", err.Error()))
							s.Stop()
							return
						}
						if err := s.wsClient.SendBinary(packet); err != nil {
							s.mu.Lock()
							s.lastError = err.Error()
							s.finishReason = "send_error"
							s.mu.Unlock()
							s.store.Add(frame.BuildEventFrame("PCM stream send error", err.Error()))
						} else {
							s.markSendSuccess(n)
						}
					}
					s.mu.Lock()
					s.finishReason = "finished"
					s.mu.Unlock()
					s.store.Add(frame.BuildEventFrame("PCM stream finished", ""))
					s.Stop()
					return
				}

				s.mu.Lock()
				s.lastError = readErr.Error()
				s.finishReason = "read_error"
				s.mu.Unlock()
				s.store.Add(frame.BuildEventFrame("PCM stream read error", readErr.Error()))
				s.Stop()
				return
			}

			payload := make([]byte, n)
			copy(payload, buffer[:n])
			seq, isFirst := s.currentSeqAndFirst()
			packet, err := buildPacket(headerRules, seq, payload, isFirst, true, false)
			if err != nil {
				s.mu.Lock()
				s.lastError = err.Error()
				s.finishReason = "header_error"
				s.mu.Unlock()
				s.store.Add(frame.BuildEventFrame("PCM stream header error", err.Error()))
				s.Stop()
				return
			}
			if err := s.wsClient.SendBinary(packet); err != nil {
				s.mu.Lock()
				s.lastError = err.Error()
				s.finishReason = "send_error"
				s.mu.Unlock()
				s.store.Add(frame.BuildEventFrame("PCM stream send error", err.Error()))
				s.Stop()
				return
			}
			s.markSendSuccess(n)
		}
	}
}

func (s *Streamer) currentSeqAndFirst() (int, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.seqStart + s.sentFrames, s.sentFrames == 0
}

func (s *Streamer) markSendSuccess(payloadBytes int) {
	s.mu.Lock()
	s.sentFrames++
	s.sentBytes += payloadBytes
	s.mu.Unlock()
}

func openAudioReader(filePath string) (io.ReadCloser, error) {
	ext := strings.ToLower(filepath.Ext(filePath))
	if ext == ".wav" {
		payload, err := parseWAVData(filePath)
		if err != nil {
			return nil, err
		}
		return io.NopCloser(bytes.NewReader(payload)), nil
	}
	return os.Open(filePath)
}

func parseWAVData(filePath string) ([]byte, error) {
	info, err := parseWAVFile(filePath)
	if err != nil {
		return nil, err
	}
	return info.Data, nil
}

func InspectFile(filePath string) (model.AudioFileInfoDTO, error) {
	trimmedPath := strings.TrimSpace(filePath)
	if trimmedPath == "" {
		return model.AudioFileInfoDTO{}, fmt.Errorf("filePath 不能为空")
	}

	ext := strings.ToLower(filepath.Ext(trimmedPath))
	if ext == ".wav" {
		info, err := parseWAVFile(trimmedPath)
		if err != nil {
			return model.AudioFileInfoDTO{}, err
		}
		return model.AudioFileInfoDTO{
			Success:    true,
			Path:       trimmedPath,
			Format:     "wav",
			SampleRate: info.SampleRate,
			Channels:   info.Channels,
			BitDepth:   info.BitDepth,
			DataBytes:  len(info.Data),
			Message:    "wav metadata loaded",
		}, nil
	}

	stat, err := os.Stat(trimmedPath)
	if err != nil {
		return model.AudioFileInfoDTO{}, err
	}

	return model.AudioFileInfoDTO{
		Success:   true,
		Path:      trimmedPath,
		Format:    "pcm",
		DataBytes: int(stat.Size()),
		Message:   "raw pcm file, metadata unavailable",
	}, nil
}

func parseWAVFile(filePath string) (wavFileInfo, error) {
	b, err := os.ReadFile(filePath)
	if err != nil {
		return wavFileInfo{}, err
	}
	if len(b) < 12 || string(b[0:4]) != "RIFF" || string(b[8:12]) != "WAVE" {
		return wavFileInfo{}, fmt.Errorf("不是有效的 RIFF/WAVE 文件: %s", filePath)
	}

	var info wavFileInfo
	hasFmt := false
	hasData := false
	offset := 12
	for offset+8 <= len(b) {
		chunkID := string(b[offset : offset+4])
		chunkSize := int(binary.LittleEndian.Uint32(b[offset+4 : offset+8]))
		offset += 8

		chunkEnd := offset + chunkSize
		if chunkEnd > len(b) {
			chunkEnd = len(b)
		}

		switch chunkID {
		case "fmt ":
			if chunkEnd-offset < 16 {
				return wavFileInfo{}, fmt.Errorf("WAV fmt chunk 长度不足: %s", filePath)
			}
			info.Channels = int(binary.LittleEndian.Uint16(b[offset+2 : offset+4]))
			info.SampleRate = int(binary.LittleEndian.Uint32(b[offset+4 : offset+8]))
			info.BitDepth = int(binary.LittleEndian.Uint16(b[offset+14 : offset+16]))
			hasFmt = true
		case "data":
			info.Data = make([]byte, chunkEnd-offset)
			copy(info.Data, b[offset:chunkEnd])
			hasData = true
		}

		offset += chunkSize
		if chunkSize%2 != 0 {
			offset++
		}
	}

	if !hasFmt {
		return wavFileInfo{}, fmt.Errorf("WAV 文件缺少 fmt chunk: %s", filePath)
	}
	if !hasData {
		return wavFileInfo{}, fmt.Errorf("WAV 文件缺少 data chunk: %s", filePath)
	}

	return info, nil
}

func buildPacket(rules []model.AudioHeaderFieldRule, seq int, payload []byte, isFirst bool, isMiddle bool, isLast bool) ([]byte, error) {
	header, err := buildHeader(rules, seq, len(payload), isFirst, isMiddle, isLast)
	if err != nil {
		return nil, err
	}
	packet := make([]byte, 0, len(header)+len(payload))
	packet = append(packet, header...)
	packet = append(packet, payload...)
	return packet, nil
}

func buildHeader(rules []model.AudioHeaderFieldRule, seq int, payloadLen int, isFirst bool, isMiddle bool, isLast bool) ([]byte, error) {
	if len(rules) == 0 {
		return nil, nil
	}

	totalHeaderLen := 0
	for _, field := range rules {
		if field.Length <= 0 {
			return nil, fmt.Errorf("header field %s length 必须大于 0", field.Name)
		}
		totalHeaderLen += field.Length
	}

	buf := make([]byte, 0, totalHeaderLen)
	for _, field := range rules {
		value, err := resolveHeaderFieldValue(field, seq, payloadLen, totalHeaderLen, isFirst, isMiddle, isLast)
		if err != nil {
			return nil, err
		}
		encoded, err := encodeHeaderValue(field, value)
		if err != nil {
			return nil, err
		}
		buf = append(buf, encoded...)
	}
	return buf, nil
}

func resolveHeaderFieldValue(field model.AudioHeaderFieldRule, seq int, payloadLen int, totalHeaderLen int, isFirst bool, isMiddle bool, isLast bool) (string, error) {
	rule := strings.TrimSpace(strings.ToLower(field.Rule))
	switch rule {
	case "", "default":
		return field.DefaultValue, nil
	case "seq", "seq++":
		return strconv.Itoa(seq), nil
	case "timestamp", "unix_ms":
		return strconv.FormatInt(time.Now().UnixMilli(), 10), nil
	case "payload_len", "payload_length":
		return strconv.Itoa(payloadLen), nil
	case "packet_len", "packet_length":
		return strconv.Itoa(payloadLen + totalHeaderLen), nil
	case "chunk_flag", "audio_chunk_flag", "frame_flag":
		if isFirst && isLast {
			return "3", nil
		}
		if isFirst {
			return "1", nil
		}
		if isLast {
			return "3", nil
		}
		if isMiddle {
			return "2", nil
		}
		return "2", nil
	default:
		return field.DefaultValue, nil
	}
}

func encodeHeaderValue(field model.AudioHeaderFieldRule, raw string) ([]byte, error) {
	length := field.Length
	value := strings.TrimSpace(raw)
	fieldType := strings.ToLower(strings.TrimSpace(field.Type))
	if fieldType == "" {
		fieldType = "uint"
	}
	endian := strings.ToLower(strings.TrimSpace(field.Endian))
	if endian == "" {
		endian = "big"
	}

	switch fieldType {
	case "uint8", "uint16", "uint32", "uint64", "uint":
		n, err := strconv.ParseUint(value, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("header field %s 需要无符号整数值", field.Name)
		}
		return encodeUintByEndian(n, length, endian), nil
	case "string", "bytes":
		data := []byte(value)
		buf := make([]byte, length)
		copy(buf, data)
		return buf, nil
	default:
		if n, err := strconv.ParseUint(value, 10, 64); err == nil {
			return encodeUintByEndian(n, length, endian), nil
		}
		data := []byte(value)
		buf := make([]byte, length)
		copy(buf, data)
		return buf, nil
	}
}

func encodeUintByEndian(n uint64, length int, endian string) []byte {
	buf := make([]byte, length)
	switch length {
	case 1:
		buf[0] = byte(n)
	case 2:
		if endian == "little" {
			binary.LittleEndian.PutUint16(buf, uint16(n))
		} else {
			binary.BigEndian.PutUint16(buf, uint16(n))
		}
	case 4:
		if endian == "little" {
			binary.LittleEndian.PutUint32(buf, uint32(n))
		} else {
			binary.BigEndian.PutUint32(buf, uint32(n))
		}
	case 8:
		if endian == "little" {
			binary.LittleEndian.PutUint64(buf, uint64(n))
		} else {
			binary.BigEndian.PutUint64(buf, uint64(n))
		}
	default:
		if endian == "little" {
			for i := 0; i < length; i++ {
				buf[i] = byte(n & 0xff)
				n >>= 8
			}
		} else {
			for i := length - 1; i >= 0; i-- {
				buf[i] = byte(n & 0xff)
				n >>= 8
			}
		}
	}
	return buf
}

func normalizeConfig(config model.AudioStreamConfig) (int, model.AudioStreamConfig, error) {
	cfg := config
	if cfg.FilePath == "" {
		return 0, cfg, fmt.Errorf("filePath 不能为空")
	}
	if cfg.SampleRate <= 0 {
		cfg.SampleRate = 16000
	}
	if cfg.Channels <= 0 {
		cfg.Channels = 1
	}
	if cfg.BitDepth <= 0 {
		cfg.BitDepth = 16
	}
	if cfg.FrameMs <= 0 {
		cfg.FrameMs = 20
	}

	if cfg.BitDepth%8 != 0 {
		return 0, cfg, fmt.Errorf("bitDepth 必须是 8 的倍数")
	}

	bytesPerSample := cfg.BitDepth / 8
	frameBytes := cfg.SampleRate * cfg.Channels * bytesPerSample * cfg.FrameMs / 1000
	if frameBytes <= 0 {
		return 0, cfg, fmt.Errorf("无效参数：frame bytes <= 0")
	}

	return frameBytes, cfg, nil
}

func normalizeLiveConfig(config model.AudioStreamConfig) (int, model.AudioStreamConfig, error) {
	cfg := config
	if cfg.SampleRate <= 0 {
		cfg.SampleRate = 16000
	}
	if cfg.Channels <= 0 {
		cfg.Channels = 1
	}
	if cfg.BitDepth <= 0 {
		cfg.BitDepth = 16
	}
	if cfg.FrameMs <= 0 {
		cfg.FrameMs = 20
	}

	if cfg.BitDepth%8 != 0 {
		return 0, cfg, fmt.Errorf("bitDepth 必须是 8 的倍数")
	}

	bytesPerSample := cfg.BitDepth / 8
	frameBytes := cfg.SampleRate * cfg.Channels * bytesPerSample * cfg.FrameMs / 1000
	if frameBytes <= 0 {
		return 0, cfg, fmt.Errorf("无效参数：frame bytes <= 0")
	}

	return frameBytes, cfg, nil
}
