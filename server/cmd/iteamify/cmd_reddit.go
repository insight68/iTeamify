package main

import (
	"fmt"
	"io"
	"net/url"
	"os"
	"strconv"

	"github.com/iteamify-ai/iteamify/server/internal/cli"
	"github.com/spf13/cobra"
)

var redditCmd = &cobra.Command{Use: "reddit", Short: "Read public Reddit discussions and prepare replies for human approval"}

func init() {
	connections := &cobra.Command{Use: "connections", Short: "List this workspace's Reddit accounts", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		return redditRequest(cmd, "GET", "/api/reddit/connections", nil)
	}}
	drafts := &cobra.Command{Use: "drafts", Short: "List reply drafts and delivery receipts", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		return redditRequest(cmd, "GET", "/api/reddit/drafts", nil)
	}}
	search := &cobra.Command{Use: "search", Short: "Read recent public posts or search one community", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		q := redditReadQuery(cmd)
		sub, _ := cmd.Flags().GetString("sub")
		query, _ := cmd.Flags().GetString("query")
		after, _ := cmd.Flags().GetString("after")
		q.Set("subreddit", sub)
		q.Set("query", query)
		q.Set("after", after)
		return redditRequest(cmd, "GET", "/api/reddit/search?"+q.Encode(), nil)
	}}
	search.Flags().String("sub", "", "Community name without r/")
	search.Flags().String("query", "", "Search terms (empty reads new posts)")
	search.Flags().String("after", "", "Next cursor from a previous response")
	_ = search.MarkFlagRequired("sub")
	thread := &cobra.Command{Use: "thread <t3_post_or_t1_comment>", Short: "Read a bounded discussion, including context for a target comment", Args: cobra.ExactArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		q := redditReadQuery(cmd)
		q.Set("fullname", args[0])
		return redditRequest(cmd, "GET", "/api/reddit/thread?"+q.Encode(), nil)
	}}
	for _, cmd := range []*cobra.Command{search, thread} {
		cmd.Flags().String("connection", "", "Workspace Reddit connection ID")
		cmd.Flags().Int("limit", 25, "Maximum items (search: 50; thread: 100)")
		_ = cmd.MarkFlagRequired("connection")
	}
	draft := &cobra.Command{Use: "draft <t3_post_or_t1_comment>", Short: "Create a reply draft; this command NEVER publishes", Args: cobra.ExactArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		conn, _ := cmd.Flags().GetString("connection")
		version, _ := cmd.Flags().GetString("content-version")
		path, _ := cmd.Flags().GetString("body-file")
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		body, err := io.ReadAll(io.LimitReader(file, 38001))
		if err != nil {
			return err
		}
		if len(body) > 38000 {
			return fmt.Errorf("reply body exceeds limit")
		}
		return redditRequest(cmd, "POST", "/api/reddit/drafts", map[string]any{"connection_id": conn, "target_fullname": args[0], "target_version": version, "body": string(body)})
	}}
	draft.Flags().String("connection", "", "Workspace Reddit connection ID")
	draft.Flags().String("content-version", "", "Target content_version from a fresh read")
	draft.Flags().String("body-file", "", "UTF-8 file containing the exact reply text")
	for _, flag := range []string{"connection", "content-version", "body-file"} {
		_ = draft.MarkFlagRequired(flag)
	}
	redditCmd.AddCommand(connections, search, thread, draft, drafts)
}
func redditReadQuery(cmd *cobra.Command) url.Values {
	conn, _ := cmd.Flags().GetString("connection")
	limit, _ := cmd.Flags().GetInt("limit")
	return url.Values{"connection_id": {conn}, "limit": {strconv.Itoa(limit)}}
}
func redditRequest(cmd *cobra.Command, method, path string, body any) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := cli.APIContext(cmd.Context())
	defer cancel()
	var result any
	if method == "POST" {
		err = client.PostJSON(ctx, path, body, &result)
	} else {
		err = client.GetJSON(ctx, path, &result)
	}
	if err != nil {
		return err
	}
	return cli.PrintJSON(cmd.OutOrStdout(), result)
}
