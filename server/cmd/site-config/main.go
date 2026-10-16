// iteamify-config manages the versioned, root-owned configuration used by
// iTeamify's production services. It is intentionally separate from the
// end-user `iteamify config` command and ~/.iteamify/config.json.
package main

import (
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/iteamify-ai/iteamify/server/internal/siteconfig"
	"github.com/spf13/cobra"
)

var version = "dev"

type options struct {
	configPath     string
	credentialsDir string
	outputDir      string
}

func main() {
	root := newRootCommand()
	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func newRootCommand() *cobra.Command {
	var opts options
	root := &cobra.Command{
		Use:           "iteamify-config",
		Short:         "Compile iTeamify's versioned production configuration",
		SilenceUsage:  true,
		SilenceErrors: true,
		Version:       version,
	}
	root.PersistentFlags().StringVar(&opts.configPath, "config", siteconfig.DefaultConfigPath, "Path to the non-secret site YAML")
	root.PersistentFlags().StringVar(&opts.credentialsDir, "credentials-dir", siteconfig.DefaultCredentialsDir, "Root-only credential directory")
	root.PersistentFlags().StringVar(&opts.outputDir, "output-dir", siteconfig.DefaultOutputDir, "Generated systemd EnvironmentFile directory")
	root.AddCommand(newInitCommand(&opts))
	root.AddCommand(newSecretCommand(&opts))

	root.AddCommand(newValidateCommand(&opts))
	root.AddCommand(newCompileCommand(&opts))
	root.AddCommand(newDiffCommand(&opts))
	return root
}

func newInitCommand(opts *options) *cobra.Command {
	return &cobra.Command{Use: "init", Short: "Create managed workspace configuration and internal credentials", Args: cobra.NoArgs, RunE: func(_ *cobra.Command, _ []string) error {
		return siteconfig.Initialize(siteconfig.InitializeOptions{ConfigPath: opts.configPath, CredentialsDir: opts.credentialsDir})
	}}
}

func newSecretCommand(opts *options) *cobra.Command {
	secret := &cobra.Command{Use: "secret", Short: "Manage root-only site credentials"}
	var fromFile string
	var force bool
	set := &cobra.Command{
		Use:   "set <credential-name>",
		Short: "Store an operator-managed credential without printing its value",
		Args:  cobra.ExactArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			var input io.Reader = os.Stdin
			if strings.TrimSpace(fromFile) != "" {
				file, err := os.Open(fromFile)
				if err != nil {
					return fmt.Errorf("open credential source: %w", err)
				}
				defer file.Close()
				input = file
			}
			if err := siteconfig.SetCredential(opts.credentialsDir, args[0], input, force); err != nil {
				return err
			}
			fmt.Fprintf(os.Stdout, "Stored credential %q in %s.\n", args[0], opts.credentialsDir)
			return nil
		},
	}
	set.Flags().StringVar(&fromFile, "from-file", "", "Read the credential from a file instead of stdin")
	set.Flags().BoolVar(&force, "force", false, "Replace an existing provider credential")
	secret.AddCommand(set)
	return secret
}

func newValidateCommand(opts *options) *cobra.Command {
	return &cobra.Command{
		Use:   "validate",
		Short: "Validate the YAML, credential permissions, and derived service configs",
		Args:  cobra.NoArgs,
		RunE: func(_ *cobra.Command, _ []string) error {
			artifacts, err := loadAndCompile(*opts)
			if err != nil {
				return err
			}
			printResolved("Configuration is valid", artifacts.Resolved)
			return nil
		},
	}
}

func newCompileCommand(opts *options) *cobra.Command {
	return &cobra.Command{
		Use:   "compile",
		Short: "Atomically generate the production systemd environment overlays",
		Args:  cobra.NoArgs,
		RunE: func(_ *cobra.Command, _ []string) error {
			artifacts, err := loadAndCompile(*opts)
			if err != nil {
				return err
			}
			if err := siteconfig.WriteArtifacts(opts.outputDir, artifacts); err != nil {
				return err
			}
			printResolved("Configuration compiled", artifacts.Resolved)
			fmt.Fprintf(os.Stdout, "Output: %s\n", opts.outputDir)
			return nil
		},
	}
}

func newDiffCommand(opts *options) *cobra.Command {
	return &cobra.Command{
		Use:   "diff",
		Short: "Show whether generated files would change without exposing secrets",
		Args:  cobra.NoArgs,
		RunE: func(_ *cobra.Command, _ []string) error {
			artifacts, err := loadAndCompile(*opts)
			if err != nil {
				return err
			}
			statuses, err := siteconfig.CompareArtifacts(opts.outputDir, artifacts)
			if err != nil {
				return err
			}
			for _, status := range statuses {
				fmt.Fprintf(os.Stdout, "%-10s %s\n", status.Status, status.Name)
			}
			return nil
		},
	}
}

func loadAndCompile(opts options) (siteconfig.Artifacts, error) {
	cfg, err := siteconfig.Load(opts.configPath)
	if err != nil {
		return siteconfig.Artifacts{}, err
	}
	return siteconfig.Compile(cfg, opts.credentialsDir)
}

func printResolved(prefix string, resolved siteconfig.ResolvedConfig) {
	fmt.Fprintf(os.Stdout, "%s: schema=v%d openagent=%t\n", prefix, resolved.Version, resolved.OpenAgentEnabled)
}
