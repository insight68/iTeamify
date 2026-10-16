package handler

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5/pgtype"
)

// histMsg builds a chat row with a deterministic ID so history selection can
// be asserted without a database.
func histMsg(id byte, role, content string) db.ChatMessage {
	var u pgtype.UUID
	u.Bytes[15] = id
	u.Valid = true
	return db.ChatMessage{ID: u, Role: role, Content: content}
}

func rolesAndContents(turns []ChatHistoryMessage) []string {
	out := make([]string, 0, len(turns))
	for _, turn := range turns {
		out = append(out, turn.Role+"="+turn.Content)
	}
	return out
}

func TestManagedChatHistoryReplaysTurnsBeforeTheInputBatch(t *testing.T) {
	t.Parallel()

	timeline := []db.ChatMessage{
		histMsg(1, "user", "帮我看看 Acme 这个线索"),
		histMsg(2, "assistant", "Acme 目前处于初步接触阶段"),
		histMsg(3, "user", "预算大概多少"),
		histMsg(4, "assistant", "记录里是 20 万"),
		histMsg(5, "user", "那给我更新一下"),
	}
	batch := timeline[4:] // only message 5 is this run's input

	got, truncated := managedChatHistory(timeline, batch)
	if truncated {
		t.Fatalf("truncated = true, want false: %v", rolesAndContents(got))
	}
	want := []string{
		"user=帮我看看 Acme 这个线索",
		"assistant=Acme 目前处于初步接触阶段",
		"user=预算大概多少",
		"assistant=记录里是 20 万",
	}
	if diff := rolesAndContents(got); !sameChatStrings(diff, want) {
		t.Fatalf("history = %v, want %v", diff, want)
	}
}

func TestManagedChatHistoryExcludesEveryMessageInTheInputBatch(t *testing.T) {
	t.Parallel()

	// A debounced burst: two user messages sealed into one run. Neither may
	// appear as history, because both are delivered as the current message.
	timeline := []db.ChatMessage{
		histMsg(1, "user", "先看上海"),
		histMsg(2, "assistant", "上海今天晴"),
		histMsg(3, "user", "还有青岛"),
		histMsg(4, "user", "再看下深圳"),
	}
	got, truncated := managedChatHistory(timeline, timeline[2:])
	if truncated {
		t.Fatalf("truncated = true, want false")
	}
	if diff := rolesAndContents(got); !sameChatStrings(diff, []string{"user=先看上海", "assistant=上海今天晴"}) {
		t.Fatalf("history = %v, want only the turns before the batch", diff)
	}
}

func TestManagedChatHistoryEmptyCases(t *testing.T) {
	t.Parallel()

	timeline := []db.ChatMessage{
		histMsg(1, "user", "hello"),
		histMsg(2, "assistant", "hi"),
	}

	tests := []struct {
		name    string
		tl      []db.ChatMessage
		batch   []db.ChatMessage
		wantLen int
	}{
		{"no timeline", nil, timeline[:1], 0},
		{"no batch (proactive intro)", timeline, nil, 0},
		{"first message of the session", timeline, timeline[:1], 0},
		{"batch message missing from timeline", timeline, []db.ChatMessage{histMsg(9, "user", "stray")}, 0},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, truncated := managedChatHistory(tt.tl, tt.batch)
			if len(got) != tt.wantLen || truncated {
				t.Fatalf("managedChatHistory() = %v, truncated=%v; want len=%d, truncated=false",
					rolesAndContents(got), truncated, tt.wantLen)
			}
		})
	}
}

func TestManagedChatHistoryDropsNonConversationalRows(t *testing.T) {
	t.Parallel()

	timeline := []db.ChatMessage{
		histMsg(1, "user", "真实提问"),
		histMsg(2, "system", "内部事件"),
		histMsg(3, "assistant", "   "),
		histMsg(4, "assistant", "真实回答"),
		histMsg(5, "user", "当前问题"),
	}
	got, truncated := managedChatHistory(timeline, timeline[4:])
	if truncated {
		t.Fatalf("truncated = true, want false: %v", rolesAndContents(got))
	}
	if diff := rolesAndContents(got); !sameChatStrings(diff, []string{"user=真实提问", "assistant=真实回答"}) {
		t.Fatalf("history = %v, want only the two conversational rows", diff)
	}
}

func TestManagedChatHistoryCapsMessageCountAndKeepsNewest(t *testing.T) {
	t.Parallel()

	timeline := make([]db.ChatMessage, 0, 31)
	for i := 1; i <= 30; i++ {
		timeline = append(timeline, histMsg(byte(i), "user", fmt.Sprintf("turn-%02d", i)))
	}
	timeline = append(timeline, histMsg(31, "user", "current"))

	got, truncated := managedChatHistory(timeline, timeline[30:])
	if !truncated {
		t.Fatalf("truncated = false, want true when %d prior turns exceed the cap", len(timeline)-1)
	}
	if len(got) != managedChatHistoryMaxMessages {
		t.Fatalf("len(history) = %d, want %d", len(got), managedChatHistoryMaxMessages)
	}
	// The newest prior turn must survive and the oldest must not: the budget
	// spends on what is closest to the question being asked.
	newestPrior := timeline[len(timeline)-2]
	if got[len(got)-1].Content != newestPrior.Content {
		t.Fatalf("last replayed turn = %q, want the newest prior turn %q", got[len(got)-1].Content, newestPrior.Content)
	}
	if got[0].Content == timeline[0].Content {
		t.Fatalf("oldest turn %q was replayed despite the cap", timeline[0].Content)
	}
}

func TestManagedChatHistoryHonoursTheRuneBudget(t *testing.T) {
	t.Parallel()

	// 20 turns of 500 runes = 10000, well over the 6000 budget. Every turn is
	// below the per-turn cap so the total budget is what stops the walk.
	timeline := make([]db.ChatMessage, 0, 21)
	for i := 1; i <= 20; i++ {
		timeline = append(timeline, histMsg(byte(i), "user", strings.Repeat("字", 500)))
	}
	timeline = append(timeline, histMsg(21, "user", "current"))

	got, truncated := managedChatHistory(timeline, timeline[20:])
	if !truncated {
		t.Fatalf("truncated = false, want true")
	}
	total := 0
	for _, turn := range got {
		total += len([]rune(turn.Content))
	}
	if total > managedChatHistoryMaxRunes {
		t.Fatalf("replayed %d runes, want <= %d", total, managedChatHistoryMaxRunes)
	}
	if len(got) != managedChatHistoryMaxRunes/500 {
		t.Fatalf("len(history) = %d, want %d (budget spread over equal turns)",
			len(got), managedChatHistoryMaxRunes/500)
	}
}

func TestManagedChatHistoryTruncatesAnOversizedTurn(t *testing.T) {
	t.Parallel()

	timeline := []db.ChatMessage{
		histMsg(1, "user", strings.Repeat("长", managedChatHistoryMaxTurnRunes+700)),
		histMsg(2, "user", "current"),
	}
	got, _ := managedChatHistory(timeline, timeline[1:])
	if len(got) != 1 {
		t.Fatalf("len(history) = %d, want 1", len(got))
	}
	if !strings.HasSuffix(got[0].Content, "[...truncated]") {
		t.Fatalf("oversized turn was not marked as truncated: %q", got[0].Content)
	}
	if runes := len([]rune(got[0].Content)); runes > managedChatHistoryMaxTurnRunes+len([]rune(" [...truncated]")) {
		t.Fatalf("truncated turn is %d runes, want <= %d", runes, managedChatHistoryMaxTurnRunes)
	}
}

func TestChatTurnsBeforeMatchesOnIDNotOffset(t *testing.T) {
	t.Parallel()

	timeline := []db.ChatMessage{
		histMsg(1, "user", "a"),
		histMsg(2, "assistant", "b"),
		histMsg(3, "user", "c"),
	}
	// A batch slice drawn from a different query result must still anchor.
	prior := chatTurnsBefore(timeline, []db.ChatMessage{histMsg(3, "user", "c")})
	if len(prior) != 2 {
		t.Fatalf("prior = %d rows, want 2", len(prior))
	}
	if id := prior[len(prior)-1].ID.Bytes[15]; id != 2 {
		t.Fatalf("prior ends at row %d, want row 2", id)
	}
}

// TestChatHistoryMessageWireFormat pins the JSON keys against the daemon-side
// mirror (daemon.ChatHistoryMessageData). The two structs live in packages that
// cannot import each other, so nothing but this assertion stops a rename on one
// side from silently dropping the replay on the wire.
func TestChatHistoryMessageWireFormat(t *testing.T) {
	t.Parallel()

	raw, err := json.Marshal(ChatHistoryMessage{Role: "user", Content: "hi"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if got := string(raw); got != `{"role":"user","content":"hi"}` {
		t.Fatalf("wire format = %s, want {\"role\":\"user\",\"content\":\"hi\"}", got)
	}
}

func sameChatStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
