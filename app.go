package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"wavecat/internal/audio"
	"wavecat/internal/frame"
	"wavecat/internal/model"
	"wavecat/internal/ws"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx        context.Context
	frameStore *frame.Store
	wsClient   *ws.Client
	audio      *audio.Streamer
}

// NewApp creates a new App application struct
func NewApp() *App {
	store := frame.NewStore(2000)
	client := ws.NewClient(store)
	return &App{
		frameStore: store,
		wsClient:   client,
		audio:      audio.NewStreamer(client, store),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

func (a *App) WsConnect(config model.ConnectionConfig) model.SendResult {
	if err := a.wsClient.Connect(config); err != nil {
		return model.SendResult{Success: false, Message: err.Error()}
	}
	return model.SendResult{Success: true, Message: "connected"}
}

func (a *App) WsDisconnect() model.SendResult {
	a.audio.Stop()
	if err := a.wsClient.Disconnect(); err != nil {
		return model.SendResult{Success: false, Message: err.Error()}
	}
	return model.SendResult{Success: true, Message: "disconnected"}
}

func (a *App) WsSendText(message string) model.SendResult {
	payload := message
	trimmed := strings.TrimSpace(message)
	if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		var jsonVal any
		if err := json.Unmarshal([]byte(trimmed), &jsonVal); err != nil {
			return model.SendResult{Success: false, Message: "JSON 格式错误: " + err.Error()}
		}

		serialized, err := json.Marshal(jsonVal)
		if err != nil {
			return model.SendResult{Success: false, Message: "JSON 序列化失败: " + err.Error()}
		}
		payload = string(serialized)
	}

	if err := a.wsClient.SendText(payload); err != nil {
		return model.SendResult{Success: false, Message: err.Error()}
	}
	return model.SendResult{Success: true, Message: "sent"}
}

func (a *App) WsSendBinaryBase64(encoded string) model.SendResult {
	payload, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return model.SendResult{Success: false, Message: "base64 解析失败"}
	}

	if err = a.wsClient.SendBinary(payload); err != nil {
		return model.SendResult{Success: false, Message: err.Error()}
	}

	return model.SendResult{Success: true, Message: "sent"}
}

func (a *App) WsPing() model.SendResult {
	if err := a.wsClient.Ping(); err != nil {
		return model.SendResult{Success: false, Message: err.Error()}
	}
	return model.SendResult{Success: true, Message: "ping"}
}

func (a *App) WsSendBinaryFile(filePath string) model.SendResult {
	payload, err := os.ReadFile(filePath)
	if err != nil {
		return model.SendResult{Success: false, Message: err.Error()}
	}

	if err = a.wsClient.SendBinary(payload); err != nil {
		return model.SendResult{Success: false, Message: err.Error()}
	}

	return model.SendResult{Success: true, Message: "binary file sent"}
}

func (a *App) WsGetFrames() []model.FrameDTO {
	return a.frameStore.List()
}

func (a *App) WsClearFrames() model.SendResult {
	a.frameStore.Clear()
	return model.SendResult{Success: true, Message: "cleared"}
}

func (a *App) WsStatus() model.StatusDTO {
	return a.wsClient.Status()
}

func (a *App) WsStartPCMStream(config model.AudioStreamConfig) model.SendResult {
	if err := a.audio.Start(config); err != nil {
		return model.SendResult{Success: false, Message: err.Error()}
	}
	return model.SendResult{Success: true, Message: "pcm stream started"}
}

func (a *App) WsStopPCMStream() model.SendResult {
	a.audio.Stop()
	return model.SendResult{Success: true, Message: "pcm stream stopped"}
}

func (a *App) WsPCMStreamStatus() model.AudioStreamStatusDTO {
	return a.audio.Status()
}

func (a *App) WsPickBinaryFile() model.FilePickResult {
	if a.ctx == nil {
		return model.FilePickResult{Success: false, Message: "应用上下文未就绪"}
	}

	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择 Binary 文件",
		Filters: []runtime.FileFilter{
			{DisplayName: "Binary Files", Pattern: "*"},
		},
	})
	if err != nil {
		return model.FilePickResult{Success: false, Message: err.Error()}
	}
	if path == "" {
		return model.FilePickResult{Success: false, Message: "已取消选择"}
	}

	return model.FilePickResult{Success: true, Path: path, Message: "selected"}
}

func (a *App) WsPickPCMFile() model.FilePickResult {
	if a.ctx == nil {
		return model.FilePickResult{Success: false, Message: "应用上下文未就绪"}
	}

	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择 PCM/WAV 文件",
		Filters: []runtime.FileFilter{
			{DisplayName: "PCM Audio", Pattern: "*.pcm"},
			{DisplayName: "WAV Audio", Pattern: "*.wav"},
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
	if err != nil {
		return model.FilePickResult{Success: false, Message: err.Error()}
	}
	if path == "" {
		return model.FilePickResult{Success: false, Message: "已取消选择"}
	}

	return model.FilePickResult{Success: true, Path: path, Message: "selected"}
}

func (a *App) WsInspectAudioFile(filePath string) model.AudioFileInfoDTO {
	info, err := audio.InspectFile(filePath)
	if err != nil {
		return model.AudioFileInfoDTO{
			Success: false,
			Path:    strings.TrimSpace(filePath),
			Message: err.Error(),
		}
	}
	return info
}

func (a *App) WsSavePCMBytes(base64Data string) model.SendResult {
	if a.ctx == nil {
		return model.SendResult{Success: false, Message: "应用上下文未就绪"}
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "保存 PCM 录音",
		DefaultFilename: fmt.Sprintf("wavecat_%d.pcm", time.Now().UnixMilli()),
		Filters: []runtime.FileFilter{
			{DisplayName: "PCM Audio (*.pcm)", Pattern: "*.pcm"},
		},
	})
	if err != nil {
		return model.SendResult{Success: false, Message: err.Error()}
	}
	if path == "" {
		return model.SendResult{Success: false, Message: "已取消"}
	}
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return model.SendResult{Success: false, Message: "base64 decode 失败: " + err.Error()}
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		return model.SendResult{Success: false, Message: "写文件失败: " + err.Error()}
	}
	return model.SendResult{Success: true, Message: path}
}
