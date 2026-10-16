// Package siteconfig generates private deployment files for OpenAgent.
package siteconfig

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

const (
	CurrentSchemaVersion          = 5
	DefaultConfigPath             = "/etc/iteamify/config.yaml"
	DefaultCredentialsDir         = "/etc/iteamify/credentials"
	DefaultOutputDir              = "/etc/iteamify/generated"
	ManagedDaemonTokenCredential  = "managed-daemon-service-token"
	OpenAgentSecretKeyCredential  = "openagent-secret-key"
	ManagedBackendEnvironmentFile = "openagent-backend.env"
	ManagedDaemonEnvironmentFile  = "openagent-daemon.env"
	MetadataFile                  = "openagent.meta.json"
)

var (
	safeNamePattern        = regexp.MustCompile(`^[a-z][a-z0-9-]{0,62}$`)
	credentialValuePattern = regexp.MustCompile(`^[A-Za-z0-9._:/+=-]+$`)
)

type Config struct {
	Version   int             `yaml:"version" json:"version"`
	OpenAgent OpenAgentConfig `yaml:"openagent" json:"openagent"`
}
type OpenAgentConfig struct {
	Enabled  bool   `yaml:"enabled" json:"enabled"`
	DaemonID string `yaml:"daemon_id,omitempty" json:"daemon_id,omitempty"`
}
type ResolvedConfig struct {
	Version          int    `json:"version"`
	OpenAgentEnabled bool   `json:"openagent_enabled"`
	ManagedDaemonID  string `json:"managed_daemon_id,omitempty"`
}
type Artifacts struct {
	EnvironmentFiles map[string][]byte
	Metadata         []byte
	Resolved         ResolvedConfig
}

func (c Config) Validate() error {
	if c.Version != CurrentSchemaVersion {
		return fmt.Errorf("version must be %d (got %d)", CurrentSchemaVersion, c.Version)
	}
	if !c.OpenAgent.Enabled {
		return nil
	}
	id, err := uuid.Parse(strings.TrimSpace(c.OpenAgent.DaemonID))
	if err != nil || id == uuid.Nil {
		return errors.New("openagent.daemon_id must be a non-zero UUID")
	}

	return nil
}
func (c Config) Resolve() (ResolvedConfig, error) {
	if err := c.Validate(); err != nil {
		return ResolvedConfig{}, err
	}
	return ResolvedConfig{Version: c.Version, OpenAgentEnabled: c.OpenAgent.Enabled, ManagedDaemonID: strings.TrimSpace(c.OpenAgent.DaemonID)}, nil
}
func Compile(cfg Config, credentialsDir string) (Artifacts, error) {
	resolved, err := cfg.Resolve()
	if err != nil {
		return Artifacts{}, err
	}
	values := map[string]string{}
	if resolved.OpenAgentEnabled {
		info, err := os.Lstat(credentialsDir)
		if err != nil {
			return Artifacts{}, err
		}
		if !info.IsDir() || info.Mode().Perm()&0077 != 0 {
			return Artifacts{}, errors.New("credentials directory must be private")
		}
		for _, name := range []string{ManagedDaemonTokenCredential, OpenAgentSecretKeyCredential} {
			value, err := readCredential(credentialsDir, name)
			if err != nil {
				return Artifacts{}, err
			}
			if !validCredentialValue(value) || value == "" {
				return Artifacts{}, fmt.Errorf("credential %q must be a non-empty safe value", name)
			}
			if name == ManagedDaemonTokenCredential && len(value) < 32 {
				return Artifacts{}, errors.New("daemon service token must contain at least 32 characters")
			}
			if name == OpenAgentSecretKeyCredential {
				decoded, err := base64.StdEncoding.DecodeString(value)
				if err != nil || len(decoded) != 32 {
					return Artifacts{}, fmt.Errorf("credential %q must encode a 32-byte key", name)
				}
			}
			values[name] = value
		}
		if values[ManagedDaemonTokenCredential] == values[OpenAgentSecretKeyCredential] {
			return Artifacts{}, errors.New("daemon and provider credentials must be independent")
		}
	}
	backend := []environmentValue{{Key: "ITEAMIFY_OPENAGENT_ENABLED", Value: strconv.FormatBool(resolved.OpenAgentEnabled)}}
	daemon := []environmentValue{{Key: "ITEAMIFY_OPENAGENT_ENABLED", Value: strconv.FormatBool(resolved.OpenAgentEnabled)}}
	if resolved.OpenAgentEnabled {
		identity := []environmentValue{{Key: "ITEAMIFY_MANAGED_DAEMON_ID", Value: resolved.ManagedDaemonID}, {Key: "ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN", Value: values[ManagedDaemonTokenCredential]}}
		backend = append(backend, identity...)
		daemon = append(daemon, identity...)
		backend = append(backend, environmentValue{Key: "ITEAMIFY_OPENAGENT_SECRET_KEY", Value: values[OpenAgentSecretKeyCredential]})
	}
	metadata, err := json.MarshalIndent(resolved, "", "  ")
	if err != nil {
		return Artifacts{}, err
	}
	return Artifacts{Resolved: resolved, Metadata: append(metadata, '\n'), EnvironmentFiles: map[string][]byte{ManagedBackendEnvironmentFile: renderEnvironment(backend), ManagedDaemonEnvironmentFile: renderEnvironment(daemon)}}, nil
}

type environmentValue struct{ Key, Value string }

func Load(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read site config %s: %w", path, err)
	}
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	var cfg Config
	if err := decoder.Decode(&cfg); err != nil {
		return Config{}, fmt.Errorf("decode site config %s: %w", path, err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err == nil {
		return Config{}, fmt.Errorf("decode site config %s: multiple YAML documents are not allowed", path)
	} else if !errors.Is(err, io.EOF) {
		return Config{}, fmt.Errorf("decode site config %s: %w", path, err)
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, fmt.Errorf("validate site config %s: %w", path, err)
	}
	return cfg, nil
}

func renderEnvironment(values []environmentValue) []byte {
	var builder strings.Builder
	builder.WriteString("# Generated by iteamify-config. Do not edit.\n")
	for _, value := range values {
		builder.WriteString(value.Key)
		builder.WriteByte('=')
		builder.WriteString(value.Value)
		builder.WriteByte('\n')
	}
	return []byte(builder.String())
}

func readCredential(credentialsDir, name string) (string, error) {
	if !validSafeName(name) {
		return "", fmt.Errorf("credential name %q is invalid", name)
	}
	path := filepath.Join(credentialsDir, name)
	info, err := os.Lstat(path)
	if err != nil {
		return "", fmt.Errorf("read credential %q: %w", name, err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("credential %q must be a regular file, not a symlink", name)
	}
	if info.Mode().Perm()&0o077 != 0 {
		return "", fmt.Errorf("credential %q permissions must not grant group or other access", name)
	}
	if info.Size() > 64*1024 {
		return "", fmt.Errorf("credential %q exceeds 64 KiB", name)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read credential %q: %w", name, err)
	}
	value := strings.TrimSuffix(strings.TrimSuffix(string(data), "\n"), "\r")
	if value == "" || strings.ContainsAny(value, "\r\n") {
		return "", fmt.Errorf("credential %q must contain one non-empty line", name)
	}
	return value, nil
}

func validCredentialValue(value string) bool {
	return value != "" && credentialValuePattern.MatchString(value)
}

func validSafeName(value string) bool {
	return safeNamePattern.MatchString(strings.TrimSpace(value))
}

func valueOrDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func isInternalCredential(name string) bool {
	return name == ManagedDaemonTokenCredential || name == OpenAgentSecretKeyCredential
}
