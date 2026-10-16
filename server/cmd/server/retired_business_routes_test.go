package main

import (
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/iteamify-ai/iteamify/server/internal/analytics"
	"github.com/iteamify-ai/iteamify/server/internal/events"
	"github.com/iteamify-ai/iteamify/server/internal/realtime"
)

func TestRetiredBusinessRoutesAreAbsent(t *testing.T) {
	router := NewRouter(testPool, realtime.NewHub(), events.New(), analytics.NoopClient{}, nil)
	retired := []string{"/api/leads", "/api/crm", "/api/customer-pool", "/api/customer-requests", "/api/public/opportunities", "/api/public/experts", "/api/public/conversations", "/api/internal/public-sales", "/api/quotes", "/api/chat/leads", "/api/chat/quotes", "/api/data-tables", "/api/platform/customer-pool", "/api/platform/opportunities"}
	active := map[string]bool{"/api/issues/": false, "/api/company/": false, "/api/resources/catalog": false}
	err := chi.Walk(router, func(method, path string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		for _, prefix := range retired {
			if path == prefix || strings.HasPrefix(path, prefix+"/") {
				t.Errorf("retired route registered: %s %s", method, path)
			}
		}
		if _, ok := active[path]; ok {
			active[path] = true
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for path, found := range active {
		if !found {
			t.Errorf("active route missing: %s", path)
		}
	}
}
