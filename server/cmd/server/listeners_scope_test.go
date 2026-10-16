package main

import (
	"sync"
	"testing"

	"github.com/iteamify-ai/iteamify/server/internal/events"
	"github.com/iteamify-ai/iteamify/server/pkg/protocol"
)

// fakeBroadcaster records every fanout call so tests can assert which scope a
// given event landed on.
type fakeBroadcaster struct {
	mu              sync.Mutex
	scopeCalls      []scopeCall
	workspaceCalls  []workspaceCall
	userCalls       []userCall
	broadcastCalled int
}

type scopeCall struct {
	scopeType, scopeID string
	msg                []byte
}
type workspaceCall struct {
	workspaceID string
	msg         []byte
}
type userCall struct {
	userID  string
	msg     []byte
	exclude []string
}

func (f *fakeBroadcaster) BroadcastToScope(scopeType, scopeID string, message []byte) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.scopeCalls = append(f.scopeCalls, scopeCall{scopeType, scopeID, message})
}
func (f *fakeBroadcaster) BroadcastToWorkspace(workspaceID string, message []byte) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.workspaceCalls = append(f.workspaceCalls, workspaceCall{workspaceID, message})
}
func (f *fakeBroadcaster) SendToUser(userID string, message []byte, excludeWorkspace ...string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.userCalls = append(f.userCalls, userCall{userID, message, excludeWorkspace})
}
func (f *fakeBroadcaster) Broadcast(message []byte) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.broadcastCalled++
}

// Task events retain workspace fanout until clients subscribe to task scopes.
func TestRegisterListeners_TaskEventsGoToWorkspace(t *testing.T) {
	cases := []struct {
		name      string
		eventType string
		taskID    string
		chatID    string
	}{
		{"task:message with TaskID", protocol.EventTaskMessage, "task-1", ""},
		{"task:progress with TaskID", protocol.EventTaskProgress, "task-2", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			bus := events.New()
			fb := &fakeBroadcaster{}
			registerListeners(bus, fb)

			bus.Publish(events.Event{
				Type:          tc.eventType,
				WorkspaceID:   "ws-1",
				TaskID:        tc.taskID,
				ChatSessionID: tc.chatID,
				Payload:       map[string]any{"hello": "world"},
			})

			if len(fb.scopeCalls) != 0 {
				t.Fatalf("expected no BroadcastToScope calls (must-fix #1: keep workspace fanout until client lands), got %+v", fb.scopeCalls)
			}
			if len(fb.workspaceCalls) != 1 {
				t.Fatalf("expected exactly 1 BroadcastToWorkspace call, got %d", len(fb.workspaceCalls))
			}
			if fb.workspaceCalls[0].workspaceID != "ws-1" {
				t.Fatalf("expected workspace ws-1, got %q", fb.workspaceCalls[0].workspaceID)
			}
		})
	}
}

// Private chat delivery reaches the recipient even in the active workspace;
// a missing recipient must fail closed instead of broadcasting private data.
func TestRegisterListeners_PrivateChatTargetsRecipient(t *testing.T) {
	for _, eventType := range []string{protocol.EventChatMessage, protocol.EventChatDone, protocol.EventChatSessionRead} {
		for _, recipient := range []string{"user-owner", ""} {
			t.Run(eventType+"/"+recipient, func(t *testing.T) {
				bus := events.New()
				fb := &fakeBroadcaster{}
				registerListeners(bus, fb)
				bus.Publish(events.Event{Type: eventType, WorkspaceID: "ws-1", ChatSessionID: "chat-private", RecipientUserID: recipient, Payload: map[string]any{"content": "private"}})
				if len(fb.workspaceCalls) != 0 || len(fb.scopeCalls) != 0 || fb.broadcastCalled != 0 {
					t.Fatal("private chat leaked to a broad scope")
				}
				if recipient == "" {
					if len(fb.userCalls) != 0 {
						t.Fatal("missing recipient must not deliver")
					}
					return
				}
				if len(fb.userCalls) != 1 || fb.userCalls[0].userID != recipient || len(fb.userCalls[0].exclude) != 0 {
					t.Fatalf("private delivery = %+v", fb.userCalls)
				}
			})
		}
	}
}

func TestRegisterListeners_ExplicitRecipientNeverBroadcastsWorkspace(t *testing.T) {
	bus := events.New()
	fb := &fakeBroadcaster{}
	registerListeners(bus, fb)

	bus.Publish(events.Event{
		Type:            protocol.EventChatMessage,
		WorkspaceID:     "ws-1",
		ChatSessionID:   "chat-private",
		RecipientUserID: "user-owner",
		Payload:         map[string]any{"message_id": "message-private"},
	})

	if len(fb.workspaceCalls) != 0 || len(fb.scopeCalls) != 0 || fb.broadcastCalled != 0 {
		t.Fatalf("private event leaked to a broad scope: workspace=%d scope=%d broadcast=%d", len(fb.workspaceCalls), len(fb.scopeCalls), fb.broadcastCalled)
	}
	if len(fb.userCalls) != 1 || fb.userCalls[0].userID != "user-owner" {
		t.Fatalf("private event user calls = %+v", fb.userCalls)
	}
	if len(fb.userCalls[0].exclude) != 0 {
		t.Fatalf("private delivery must reach the active workspace, got exclusions %+v", fb.userCalls[0].exclude)
	}
}
