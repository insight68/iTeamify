package main

import (
	"testing"

	"github.com/iteamify-ai/iteamify/server/internal/events"
	"github.com/iteamify-ai/iteamify/server/pkg/protocol"
)

func TestDirectEventsOnlyReachRecipientIncludingActiveWorkspace(t *testing.T) {
	for _, kind := range []string{protocol.EventDirectMessage, protocol.EventDirectRead, protocol.EventChatMessage, protocol.EventChatDone, protocol.EventChatSessionUpdated} {
		for _, recipient := range []string{"recipient", ""} {
			bus := events.New()
			b := &fakeBroadcaster{}
			registerListeners(bus, b)
			bus.Publish(events.Event{Type: kind, WorkspaceID: "ws", RecipientUserID: recipient, Payload: map[string]string{"content": "private"}})
			if len(b.workspaceCalls) != 0 || len(b.scopeCalls) != 0 || b.broadcastCalled != 0 {
				t.Fatal("private event leaked to another scope")
			}
			if recipient == "" {
				if len(b.userCalls) != 0 {
					t.Fatal("missing recipient was sent")
				}
			} else if len(b.userCalls) != 1 || b.userCalls[0].userID != recipient || len(b.userCalls[0].exclude) != 0 {
				t.Fatal("recipient's current workspace connection excluded")
			}
		}
	}
}

func TestChatTaskEventsFailClosedWithoutRecipient(t *testing.T) {
	for _, recipient := range []string{"owner", ""} {
		bus := events.New()
		b := &fakeBroadcaster{}
		registerListeners(bus, b)
		bus.Publish(events.Event{Type: protocol.EventTaskMessage, WorkspaceID: "ws", ChatSessionID: "chat", RecipientUserID: recipient, Payload: map[string]string{"content": "private"}})
		if len(b.workspaceCalls) > 0 || b.broadcastCalled > 0 {
			t.Fatal("chat task leaked")
		}
		want := 0
		if recipient != "" {
			want = 1
		}
		if len(b.userCalls) != want {
			t.Fatal("incorrect delivery")
		}
	}
}
