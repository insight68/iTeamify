package agent

import "testing"

func TestDiscoveryChildEnvDropsDaemonAndExplicitiTeamifyCredentials(t *testing.T) {
	env := discoveryChildEnv(
		[]string{"PATH=/usr/bin", "ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN=machine-secret", "ITEAMIFY_SERVER_URL=https://daemon.example"},
		[]string{"SAFE=value", "ITEAMIFY_TOKEN=must-drop"},
	)
	foundSafe := false
	for _, entry := range env {
		switch entry {
		case "SAFE=value":
			foundSafe = true
		case "ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN=machine-secret", "ITEAMIFY_SERVER_URL=https://daemon.example", "ITEAMIFY_TOKEN=must-drop":
			t.Fatalf("daemon credential leaked to discovery child: %q", entry)
		}
	}
	if !foundSafe {
		t.Fatal("non-iTeamify provider discovery env was dropped")
	}
}
