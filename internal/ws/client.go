package ws

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/coder/websocket"

	"wavecat/internal/frame"
	"wavecat/internal/model"
)

type Client struct {
	mu      sync.RWMutex
	conn    *websocket.Conn
	store   *frame.Store
	url     string
	error   string
	cancel  context.CancelFunc
	reading bool
}

func NewClient(store *frame.Store) *Client {
	return &Client{store: store}
}

func (c *Client) Connect(config model.ConnectionConfig) error {
	if config.URL == "" {
		return fmt.Errorf("websocket url 不能为空")
	}

	if err := c.Disconnect(); err != nil {
		return err
	}

	targetURL := config.URL
	if len(config.QueryParams) > 0 {
		parsedURL, err := url.Parse(config.URL)
		if err != nil {
			return fmt.Errorf("无效 websocket url: %w", err)
		}
		query := parsedURL.Query()
		for key, value := range config.QueryParams {
			query.Set(key, value)
		}
		parsedURL.RawQuery = query.Encode()
		targetURL = parsedURL.String()
	}

	header := make(http.Header)
	for key, value := range config.Headers {
		header.Set(key, value)
	}

	options := &websocket.DialOptions{
		HTTPHeader: header,
	}
	if config.Subprotocol != "" {
		options.Subprotocols = []string{config.Subprotocol}
	}

	dialCtx, dialCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer dialCancel()

	conn, _, err := websocket.Dial(dialCtx, targetURL, options)
	if err != nil {
		c.setError(err.Error())
		return err
	}

	readCtx, readCancel := context.WithCancel(context.Background())

	c.mu.Lock()
	c.conn = conn
	c.url = targetURL
	c.error = ""
	c.cancel = readCancel
	c.reading = true
	c.mu.Unlock()

	c.store.Add(frame.BuildEventFrame("Connected", ""))
	go c.readLoop(readCtx, conn)
	return nil
}

func (c *Client) Disconnect() error {
	c.mu.Lock()
	conn := c.conn
	canceller := c.cancel
	c.conn = nil
	c.url = ""
	c.reading = false
	c.cancel = nil
	c.mu.Unlock()

	if conn == nil {
		return nil
	}

	if canceller != nil {
		canceller()
	}

	err := conn.Close(websocket.StatusNormalClosure, "disconnect")
	c.store.Add(frame.BuildEventFrame("Disconnected", ""))
	return err
}

func (c *Client) SendText(text string) error {
	conn, err := c.connection()
	if err != nil {
		return err
	}

	writeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err = conn.Write(writeCtx, websocket.MessageText, []byte(text)); err != nil {
		c.setError(err.Error())
		return err
	}

	c.store.Add(frame.BuildTextFrame("out", text))
	return nil
}

func (c *Client) SendBinary(payload []byte) error {
	conn, err := c.connection()
	if err != nil {
		return err
	}

	writeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err = conn.Write(writeCtx, websocket.MessageBinary, payload); err != nil {
		c.setError(err.Error())
		return err
	}

	c.store.Add(frame.BuildBinaryFrame("out", payload))
	return nil
}

func (c *Client) Ping() error {
	conn, err := c.connection()
	if err != nil {
		return err
	}

	pingCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err = conn.Ping(pingCtx); err != nil {
		c.setError(err.Error())
		return err
	}

	c.store.Add(model.FrameDTO{
		Direction: "out",
		Type:      "ping",
		Size:      0,
		Summary:   "Ping",
	})
	return nil
}

func (c *Client) Status() model.StatusDTO {
	c.mu.RLock()
	defer c.mu.RUnlock()

	state := "disconnected"
	if c.conn != nil {
		state = "connected"
	}

	return model.StatusDTO{
		State: state,
		URL:   c.url,
		Error: c.error,
	}
}

func (c *Client) readLoop(readCtx context.Context, conn *websocket.Conn) {
	for {
		msgType, payload, err := conn.Read(readCtx)
		if err != nil {
			if c.shouldIgnoreReadError(err) {
				return
			}
			c.setError(err.Error())
			c.store.Add(frame.BuildEventFrame("Connection error", err.Error()))
			_ = c.Disconnect()
			return
		}

		switch msgType {
		case websocket.MessageText:
			c.store.Add(frame.BuildTextFrame("in", string(payload)))
		case websocket.MessageBinary:
			c.store.Add(frame.BuildBinaryFrame("in", payload))
		default:
			c.store.Add(model.FrameDTO{Direction: "in", Type: "unknown", Size: len(payload), Summary: "Unknown frame"})
		}
	}
}

func (c *Client) shouldIgnoreReadError(err error) bool {
	if err == nil {
		return false
	}

	if errors.Is(err, context.Canceled) {
		return true
	}

	status := websocket.CloseStatus(err)
	if status == websocket.StatusNormalClosure || status == websocket.StatusGoingAway {
		return true
	}

	return false
}

func (c *Client) connection() (*websocket.Conn, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if c.conn == nil {
		return nil, fmt.Errorf("当前未连接")
	}

	return c.conn, nil
}

func (c *Client) setError(message string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.error = message
}
