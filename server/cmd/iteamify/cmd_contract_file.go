package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/internal/cli"
	"github.com/spf13/cobra"
)

func init() {
	parent := &cobra.Command{Use: "contract-file", Short: "Read private contract review files in the current task"}
	download := &cobra.Command{Use: "download <file-id>", Short: "Download a private file to a local path", Args: cobra.ExactArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		if _, err := uuid.Parse(args[0]); err != nil {
			return fmt.Errorf("file-id must be a UUID")
		}
		client, err := newAPIClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), cli.AtLeastAPITimeout(60*time.Second))
		defer cancel()
		data, err := client.DownloadFile(ctx, "/api/contract-review-files/"+args[0]+"/download")
		if err != nil {
			return err
		}
		out, _ := cmd.Flags().GetString("output")
		file, err := os.OpenFile(out, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			return err
		}
		_, writeErr := file.Write(data)
		closeErr := file.Close()
		if writeErr != nil {
			return writeErr
		}
		if closeErr != nil {
			return closeErr
		}
		abs, err := filepath.Abs(out)
		if err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), abs)
		return nil
	}}
	download.Flags().String("output", "", "Local output path (must not already exist)")
	_ = download.MarkFlagRequired("output")
	parent.AddCommand(download)
	rootCmd.AddCommand(parent)
}
