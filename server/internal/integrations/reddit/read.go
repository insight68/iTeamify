package reddit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var subPattern = regexp.MustCompile(`^[A-Za-z0-9_]{2,21}$`)
var thingPattern = regexp.MustCompile(`^t[13]_[a-z0-9]+$`)

type Content struct {
	Fullname   string  `json:"fullname"`
	Parent     string  `json:"parent_fullname"`
	Post       string  `json:"post_fullname"`
	Subreddit  string  `json:"subreddit"`
	Title      string  `json:"title"`
	Body       string  `json:"body"`
	Author     string  `json:"author"`
	Score      int     `json:"score"`
	Permalink  string  `json:"permalink"`
	CreatedUTC float64 `json:"created_utc"`
	Depth      int     `json:"depth"`
	CanReply   bool    `json:"can_reply"`
	Version    string  `json:"content_version"`
}
type Page struct {
	Items      []Content `json:"items"`
	NextCursor string    `json:"next_cursor"`
	Partial    bool      `json:"partial"`
	FetchedAt  time.Time `json:"fetched_at"`
}
type contentThing struct {
	Kind string      `json:"kind"`
	Data contentData `json:"data"`
}
type contentData struct {
	Name       string          `json:"name"`
	ParentID   string          `json:"parent_id"`
	LinkID     string          `json:"link_id"`
	Subreddit  string          `json:"subreddit"`
	Title      string          `json:"title"`
	Selftext   string          `json:"selftext"`
	Body       string          `json:"body"`
	Author     string          `json:"author"`
	Score      int             `json:"score"`
	Permalink  string          `json:"permalink"`
	CreatedUTC float64         `json:"created_utc"`
	Over18     bool            `json:"over_18"`
	Quarantine bool            `json:"quarantine"`
	Locked     bool            `json:"locked"`
	Archived   bool            `json:"archived"`
	Removed    string          `json:"removed_by_category"`
	Replies    json.RawMessage `json:"replies"`
	Depth      int             `json:"depth"`
}
type contentListing struct {
	Data struct {
		Children []contentThing `json:"children"`
		After    string         `json:"after"`
	} `json:"data"`
}

func normalizeContent(t contentThing) (Content, bool) {
	d := t.Data
	if (t.Kind != "t1" && t.Kind != "t3") || !thingPattern.MatchString(d.Name) || d.Over18 || d.Quarantine || d.Removed != "" || d.Body == "[removed]" || d.Body == "[deleted]" || d.Selftext == "[removed]" || d.Selftext == "[deleted]" {
		return Content{}, false
	}
	c := Content{Fullname: d.Name, Parent: d.ParentID, Post: d.LinkID, Subreddit: strings.ToLower(d.Subreddit), Title: d.Title, Body: d.Body, Author: d.Author, Score: d.Score, CreatedUTC: d.CreatedUTC, Depth: d.Depth, CanReply: !d.Locked && !d.Archived}
	if t.Kind == "t3" {
		c.Body = d.Selftext
		c.Post = d.Name
	}
	if c.Author == "[deleted]" {
		c.Author = ""
	}
	if strings.HasPrefix(d.Permalink, "/r/") {
		c.Permalink = "https://www.reddit.com" + d.Permalink
	}
	// Only user content and identity participate; scores cannot invalidate approval.
	b, _ := json.Marshal([]string{c.Fullname, c.Parent, c.Post, c.Subreddit, c.Title, c.Body, c.Author})
	sum := sha256.Sum256(b)
	c.Version = hex.EncodeToString(sum[:])
	return c, true
}
func publicSub(ctx context.Context, c *oauthClient, sub string) error {
	if !subPattern.MatchString(sub) {
		return ErrInvalid
	}
	var about struct {
		Data struct {
			Type       string `json:"subreddit_type"`
			Over18     bool   `json:"over18"`
			Quarantine bool   `json:"quarantine"`
		} `json:"data"`
	}
	if err := readJSON(ctx, c, "/r/"+sub+"/about?raw_json=1", &about); err != nil {
		return err
	}
	if about.Data.Type != "public" || about.Data.Over18 || about.Data.Quarantine {
		return ErrUnavailable
	}
	return nil
}
func readThing(ctx context.Context, c *oauthClient, id string) (Content, error) {
	if !thingPattern.MatchString(id) {
		return Content{}, ErrInvalid
	}
	var listing contentListing
	if err := readJSON(ctx, c, "/api/info?raw_json=1&id="+id, &listing); err != nil {
		return Content{}, err
	}
	for _, t := range listing.Data.Children {
		if t.Data.Name == id {
			if t.Data.Body == "[deleted]" || t.Data.Body == "[removed]" || t.Data.Selftext == "[deleted]" || t.Data.Selftext == "[removed]" || t.Data.Removed != "" {
				return Content{}, ErrContentRemoved
			}
			if item, ok := normalizeContent(t); ok {
				return item, nil
			}
		}
	}
	return Content{}, ErrUnavailable
}
func publicTarget(ctx context.Context, c *oauthClient, id string) (Content, error) {
	item, err := readThing(ctx, c, id)
	if err != nil {
		return item, err
	}
	if err = publicSub(ctx, c, item.Subreddit); err != nil {
		return Content{}, err
	}
	if item.Post != item.Fullname {
		post, e := readThing(ctx, c, item.Post)
		if e != nil {
			return Content{}, e
		}
		if post.Subreddit != item.Subreddit {
			return Content{}, ErrUnavailable
		}
		item.CanReply = item.CanReply && post.CanReply
	}
	return item, nil
}
func (s *WorkspaceService) Search(ctx context.Context, ws, id, sub, query, after string, limit int) (Page, error) {
	page := Page{Items: []Content{}, FetchedAt: time.Now().UTC()}
	sub = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(sub), "r/"))
	if len(query) > 300 || limit < 1 || limit > 50 || (after != "" && !strings.HasPrefix(after, "t3_")) || len(after) > 40 {
		return page, ErrInvalid
	}
	c, _, err := s.client(ctx, ws, id, false)
	if err != nil {
		return page, err
	}
	if err = publicSub(ctx, c, sub); err != nil {
		return page, err
	}
	q := url.Values{"limit": {strconv.Itoa(limit)}, "raw_json": {"1"}}
	path := "/r/" + sub + "/new"
	if query != "" {
		path = "/r/" + sub + "/search"
		q.Set("q", query)
		q.Set("restrict_sr", "1")
		q.Set("sort", "new")
	}
	if after != "" {
		q.Set("after", after)
	}
	var listing contentListing
	if err = readJSON(ctx, c, path+"?"+q.Encode(), &listing); err != nil {
		return page, err
	}
	for _, t := range listing.Data.Children {
		if item, ok := normalizeContent(t); ok && item.Subreddit == sub {
			page.Items = append(page.Items, item)
		}
	}
	page.NextCursor = listing.Data.After
	page.Partial = page.NextCursor != ""
	return page, nil
}
func (s *WorkspaceService) Thread(ctx context.Context, ws, id, target string, limit int) (Page, error) {
	page := Page{Items: []Content{}, FetchedAt: time.Now().UTC()}
	if limit < 1 || limit > 100 {
		return page, ErrInvalid
	}
	c, _, err := s.client(ctx, ws, id, false)
	if err != nil {
		return page, err
	}
	item, err := publicTarget(ctx, c, target)
	if err != nil {
		return page, err
	}
	q := url.Values{"raw_json": {"1"}, "limit": {strconv.Itoa(limit)}, "depth": {"8"}, "sort": {"new"}}
	if strings.HasPrefix(target, "t1_") {
		q.Set("comment", strings.TrimPrefix(target, "t1_"))
		q.Set("context", "8")
	}
	var listings []contentListing
	if err = readJSON(ctx, c, "/comments/"+strings.TrimPrefix(item.Post, "t3_")+"?"+q.Encode(), &listings); err != nil {
		return page, err
	}
	if len(listings) != 2 {
		return page, ErrUnavailable
	}
	var walk func([]contentThing, int)
	walk = func(ts []contentThing, depth int) {
		if depth > 8 {
			page.Partial = true
			return
		}
		for _, t := range ts {
			if t.Kind == "more" {
				page.Partial = true
				continue
			}
			if len(page.Items) >= limit+1 {
				page.Partial = true
				return
			}
			v, ok := normalizeContent(t)
			if ok && v.Subreddit == item.Subreddit && v.Post == item.Post {
				v.Depth = depth
				v.CanReply = v.CanReply && item.CanReply
				page.Items = append(page.Items, v)
			}
			if len(t.Data.Replies) > 0 && t.Data.Replies[0] == '{' {
				var replies contentListing
				if json.Unmarshal(t.Data.Replies, &replies) == nil {
					walk(replies.Data.Children, depth+1)
				}
			}
		}
	}
	walk(listings[0].Data.Children, 0)
	walk(listings[1].Data.Children, 0)
	found := false
	for _, v := range page.Items {
		if v.Fullname == item.Fullname {
			found = true
		}
	}
	if !found {
		page.Partial = true
		if len(page.Items) >= limit+1 {
			page.Items[len(page.Items)-1] = item
		} else {
			page.Items = append(page.Items, item)
		}
	}
	return page, nil
}
