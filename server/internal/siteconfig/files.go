package siteconfig

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"

	"encoding/hex"

	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// ArtifactStatus describes whether a compile would change a generated file.
type ArtifactStatus struct {
	Name   string
	Status string
}

// WriteArtifacts atomically installs generated environment files with mode
// 0600 and non-secret metadata with mode 0644.
func WriteArtifacts(outputDir string, artifacts Artifacts) error {
	if err := os.MkdirAll(outputDir, 0o750); err != nil {
		return fmt.Errorf("create generated config directory: %w", err)
	}
	if err := os.Chmod(outputDir, 0o750); err != nil {
		return fmt.Errorf("secure generated config directory: %w", err)
	}
	names := make([]string, 0, len(artifacts.EnvironmentFiles))
	for name := range artifacts.EnvironmentFiles {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if err := atomicWrite(filepath.Join(outputDir, name), artifacts.EnvironmentFiles[name], 0o600); err != nil {
			return err
		}
	}
	if err := atomicWrite(filepath.Join(outputDir, MetadataFile), artifacts.Metadata, 0o644); err != nil {
		return err
	}
	return nil
}

// CompareArtifacts reports changes without disclosing any generated content.
func CompareArtifacts(outputDir string, artifacts Artifacts) ([]ArtifactStatus, error) {
	expected := make(map[string][]byte, len(artifacts.EnvironmentFiles)+1)
	for name, data := range artifacts.EnvironmentFiles {
		expected[name] = data
	}
	expected[MetadataFile] = artifacts.Metadata
	names := make([]string, 0, len(expected))
	for name := range expected {
		names = append(names, name)
	}
	sort.Strings(names)
	statuses := make([]ArtifactStatus, 0, len(names))
	for _, name := range names {
		actual, err := os.ReadFile(filepath.Join(outputDir, name))
		status := "unchanged"
		if err != nil {
			if !os.IsNotExist(err) {
				return nil, fmt.Errorf("read generated artifact %s: %w", name, err)
			}
			status = "missing"
		} else if !bytes.Equal(actual, expected[name]) {
			status = "changed"
		}
		statuses = append(statuses, ArtifactStatus{Name: name, Status: status})
	}
	return statuses, nil
}

func atomicWrite(path string, data []byte, mode os.FileMode) error {
	temp, err := os.CreateTemp(filepath.Dir(path), ".iteamify-config-*")
	if err != nil {
		return fmt.Errorf("create temporary file for %s: %w", path, err)
	}
	tempPath := temp.Name()
	cleanup := func() {
		_ = temp.Close()
		_ = os.Remove(tempPath)
	}
	if err := temp.Chmod(mode); err != nil {
		cleanup()
		return fmt.Errorf("set permissions for %s: %w", path, err)
	}
	if _, err := temp.Write(data); err != nil {
		cleanup()
		return fmt.Errorf("write %s: %w", path, err)
	}
	if err := temp.Sync(); err != nil {
		cleanup()
		return fmt.Errorf("sync %s: %w", path, err)
	}
	if err := temp.Close(); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("close %s: %w", path, err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("install %s: %w", path, err)
	}
	return nil
}

type InitializeOptions struct {
	ConfigPath     string
	CredentialsDir string
}

func Initialize(options InitializeOptions) error {
	cfg := Config{Version: CurrentSchemaVersion, OpenAgent: OpenAgentConfig{Enabled: false}}
	configPath := valueOrDefault(options.ConfigPath, DefaultConfigPath)
	credentialsDir := valueOrDefault(options.CredentialsDir, DefaultCredentialsDir)
	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(credentialsDir, 0700); err != nil {
		return err
	}
	if err := os.Chmod(credentialsDir, 0700); err != nil {
		return err
	}
	data, err := yamlForConfig(cfg)
	if err != nil {
		return err
	}
	if err := exclusiveWrite(configPath, data, 0644); err != nil {
		return err
	}
	for _, name := range []string{ManagedDaemonTokenCredential, OpenAgentSecretKeyCredential} {
		if _, err := os.Lstat(filepath.Join(credentialsDir, name)); err == nil {
			continue
		} else if !os.IsNotExist(err) {
			return err
		}
		secret, err := randomHexCredential()
		if err != nil {
			return err
		}

		if name == OpenAgentSecretKeyCredential {
			raw, err := hex.DecodeString(secret)
			if err != nil {
				return err
			}
			secret = base64.StdEncoding.EncodeToString(raw)
		}
		if err := exclusiveWrite(filepath.Join(credentialsDir, name), []byte(secret+"\n"), 0600); err != nil {
			return err
		}
	}
	return nil
}
func SetCredential(credentialsDir, name string, input io.Reader, force bool) error {
	if !validSafeName(name) {
		return fmt.Errorf("credential name %q is invalid", name)
	}

	limited := io.LimitReader(input, 64*1024+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return fmt.Errorf("read credential input: %w", err)
	}
	if len(data) > 64*1024 {
		return fmt.Errorf("credential exceeds 64 KiB")
	}
	value := strings.TrimSuffix(strings.TrimSuffix(string(data), "\n"), "\r")
	if !validCredentialValue(value) {
		return fmt.Errorf("credential must be one non-empty line containing only safe environment characters")
	}
	if err := os.MkdirAll(credentialsDir, 0o700); err != nil {
		return fmt.Errorf("create credentials directory: %w", err)
	}
	if err := os.Chmod(credentialsDir, 0o700); err != nil {
		return fmt.Errorf("secure credentials directory: %w", err)
	}
	path := filepath.Join(credentialsDir, name)
	if !force {
		return exclusiveWrite(path, []byte(value+"\n"), 0o600)
	}
	return atomicWrite(path, []byte(value+"\n"), 0o600)
}

func yamlForConfig(cfg Config) ([]byte, error) {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return nil, fmt.Errorf("encode site config: %w", err)
	}
	return append([]byte("# iTeamify site configuration. Secrets live in the credentials directory.\n"), data...), nil
}

func randomHexCredential() (string, error) {
	data := make([]byte, 32)
	if _, err := rand.Read(data); err != nil {
		return "", fmt.Errorf("generate credential: %w", err)
	}
	return hex.EncodeToString(data), nil
}

func exclusiveWrite(path string, data []byte, mode os.FileMode) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return fmt.Errorf("create %s: %w", path, err)
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return fmt.Errorf("write %s: %w", path, err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("sync %s: %w", path, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close %s: %w", path, err)
	}
	return nil
}
