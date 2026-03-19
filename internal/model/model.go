package model

type ConnectionConfig struct {
	URL         string            `json:"url"`
	Headers     map[string]string `json:"headers"`
	QueryParams map[string]string `json:"queryParams"`
	Subprotocol string            `json:"subprotocol"`
}

type FrameDTO struct {
	ID        int64  `json:"id"`
	Timestamp int64  `json:"timestamp"`
	Direction string `json:"direction"`
	Type      string `json:"type"`
	Size      int    `json:"size"`
	Summary   string `json:"summary"`
	Text      string `json:"text,omitempty"`
	Base64    string `json:"base64,omitempty"`
	Hex       string `json:"hex,omitempty"`
	ASCII     string `json:"ascii,omitempty"`
	Error     string `json:"error,omitempty"`
}

type StatusDTO struct {
	State string `json:"state"`
	URL   string `json:"url"`
	Error string `json:"error"`
}

type SendResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type AudioHeaderFieldRule struct {
	Name         string `json:"name"`
	Type         string `json:"type"`
	Length       int    `json:"length"`
	Endian       string `json:"endian"`
	DefaultValue string `json:"defaultValue"`
	Rule         string `json:"rule"`
}

type AudioStreamConfig struct {
	FilePath    string                 `json:"filePath"`
	SampleRate  int                    `json:"sampleRate"`
	Channels    int                    `json:"channels"`
	BitDepth    int                    `json:"bitDepth"`
	FrameMs     int                    `json:"frameMs"`
	SeqStart    int                    `json:"seqStart"`
	HeaderRules []AudioHeaderFieldRule `json:"headerRules"`
}

type FilePickResult struct {
	Success bool   `json:"success"`
	Path    string `json:"path"`
	Message string `json:"message"`
}

type AudioFileInfoDTO struct {
	Success    bool   `json:"success"`
	Path       string `json:"path"`
	Format     string `json:"format"`
	SampleRate int    `json:"sampleRate"`
	Channels   int    `json:"channels"`
	BitDepth   int    `json:"bitDepth"`
	DataBytes  int    `json:"dataBytes"`
	Message    string `json:"message"`
}

type AudioStreamStatusDTO struct {
	Running      bool   `json:"running"`
	FilePath     string `json:"filePath"`
	FrameBytes   int    `json:"frameBytes"`
	FrameMs      int    `json:"frameMs"`
	SentFrames   int    `json:"sentFrames"`
	SentBytes    int    `json:"sentBytes"`
	LastError    string `json:"lastError"`
	FinishReason string `json:"finishReason"`
}
