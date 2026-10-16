package gmail

import (
	"encoding/base64"
	"html"
	"regexp"
	"strings"
	"unicode/utf8"
)

var (
	htmlTagPattern   = regexp.MustCompile(`(?s)<[^>]*>`)
	htmlSpacePattern = regexp.MustCompile(`[\t\r\n ]+`)
	htmlBreakPattern = regexp.MustCompile(`(?i)<(?:br\s*/?|/p|/div|/li|/tr)>`)
)

func headerValue(part messagePart, name string) string {
	for _, header := range part.Headers {
		if strings.EqualFold(header.Name, name) {
			return strings.TrimSpace(header.Value)
		}
	}
	return ""
}

func messageBody(part messagePart) string {
	plain, rich := collectBodies(part)
	if plain != "" {
		return truncateRunes(strings.TrimSpace(plain), maxStoredBodyRunes)
	}
	return truncateRunes(strings.TrimSpace(htmlToText(rich)), maxStoredBodyRunes)
}

func collectBodies(part messagePart) (plain string, rich string) {
	if part.Filename == "" && part.Body.Data != "" {
		decoded, err := base64.RawURLEncoding.DecodeString(part.Body.Data)
		if err == nil && utf8.Valid(decoded) {
			switch strings.ToLower(strings.TrimSpace(strings.Split(part.MimeType, ";")[0])) {
			case "text/plain":
				plain = string(decoded)
			case "text/html":
				rich = string(decoded)
			}
		}
	}
	for _, child := range part.Parts {
		childPlain, childRich := collectBodies(child)
		if childPlain != "" {
			if plain != "" {
				plain += "\n"
			}
			plain += childPlain
		}
		if childRich != "" {
			if rich != "" {
				rich += "\n"
			}
			rich += childRich
		}
	}
	return plain, rich
}

func htmlToText(value string) string {
	value = htmlBreakPattern.ReplaceAllString(value, "\n")
	value = htmlTagPattern.ReplaceAllString(value, " ")
	value = html.UnescapeString(value)
	value = strings.ReplaceAll(value, "\u00a0", " ")
	lines := strings.Split(value, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSpace(htmlSpacePattern.ReplaceAllString(line, " "))
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func truncateRunes(value string, maximum int) string {
	if utf8.RuneCountInString(value) <= maximum {
		return value
	}
	runes := []rune(value)
	return string(runes[:maximum])
}

func hasLabel(labels []string, target string) bool {
	for _, label := range labels {
		if strings.EqualFold(label, target) {
			return true
		}
	}
	return false
}
