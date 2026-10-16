package migrations

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"testing"
)

var migrationPrefixPattern = regexp.MustCompile(`^(\d+)_`)

var (
	foreignKeyPattern                = regexp.MustCompile(`(?is)\bFOREIGN\s+KEY\b|\bREFERENCES\s+(?:"?[a-z_])`)
	createIndexPattern               = regexp.MustCompile(`(?is)\bCREATE\s+(?:UNIQUE\s+)?INDEX\b`)
	standaloneConcurrentIndexPattern = regexp.MustCompile(
		`(?is)^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b.*;\s*$`,
	)
	standaloneConcurrentIndexRollbackPattern = regexp.MustCompile(
		`(?is)^\s*(?:CREATE\s+(?:UNIQUE\s+)?INDEX|DROP\s+INDEX)\s+CONCURRENTLY\b.*;\s*$`,
	)
)

func TestMigrationFilesHaveMatchingDirections(t *testing.T) {
	files := migrationFilesForLint(t, "*.sql")

	directionsByStem := make(map[string]map[string]bool)
	for _, file := range files {
		stem, direction, ok := splitMigrationFilename(filepath.Base(file))
		if !ok {
			continue
		}
		if directionsByStem[stem] == nil {
			directionsByStem[stem] = make(map[string]bool)
		}
		directionsByStem[stem][direction] = true
	}

	for stem, directions := range directionsByStem {
		if !directions["up"] || !directions["down"] {
			t.Errorf("migration %s must have both .up.sql and .down.sql files", stem)
		}
	}
}

func TestMigrationNumericPrefixesStayUnique(t *testing.T) {
	stemsByPrefix := migrationStemsByPrefix(t)

	for prefix, stems := range stemsByPrefix {
		sort.Strings(stems)

		if len(stems) > 1 {
			t.Errorf("migration prefix %s is reused by %v; use the next unique prefix instead", prefix, stems)
		}
	}
}

func TestMigrationsDoNotAddDatabaseForeignKeys(t *testing.T) {
	files := migrationFilesForLint(t, "*.sql")
	for _, file := range files {
		contents := migrationSQLForLint(t, file)
		if foreignKeyPattern.MatchString(contents) {
			t.Errorf("migration %s adds a database foreign key; relationships and cleanup must stay in the application layer", filepath.Base(file))
		}
	}
}

func TestIndexMigrationsAreStandaloneAndConcurrent(t *testing.T) {
	upFiles := migrationFilesForLint(t, "*.up.sql")
	for _, upFile := range upFiles {
		upSQL := migrationSQLForLint(t, upFile)
		if !createIndexPattern.MatchString(upSQL) {
			continue
		}
		if !standaloneConcurrentIndexPattern.MatchString(upSQL) {
			t.Errorf("index migration %s must contain exactly one CREATE [UNIQUE] INDEX CONCURRENTLY statement", filepath.Base(upFile))
		}

		downFile := strings.TrimSuffix(upFile, ".up.sql") + ".down.sql"
		downSQL := migrationSQLForLint(t, downFile)
		if !standaloneConcurrentIndexRollbackPattern.MatchString(downSQL) {
			t.Errorf("index rollback %s must contain exactly one CREATE/DROP INDEX CONCURRENTLY statement", filepath.Base(downFile))
		}
	}
}

func TestConstraintMigrationsUseExistingIndexes(t *testing.T) {
	// PRIMARY KEY and UNIQUE constraints also build indexes unless USING INDEX
	// attaches an index that was already created concurrently.
	constraintIndex := regexp.MustCompile(`(?i)\bPRIMARY\s+KEY\b|\bUNIQUE\b`)
	usingIndex := regexp.MustCompile(`(?i)^\s+USING\s+INDEX\b`)
	for _, file := range migrationFilesForLint(t, "*.up.sql") {
		sql := migrationSQLForLint(t, file)
		if standaloneConcurrentIndexPattern.MatchString(sql) {
			continue
		}
		for _, match := range constraintIndex.FindAllStringIndex(sql, -1) {
			if !usingIndex.MatchString(sql[match[1]:]) {
				t.Errorf("migration %s builds an implicit constraint index; create it concurrently first, then attach it with USING INDEX", filepath.Base(file))
			}
		}
	}
}

func TestStripSQLCommentsAndStringsKeepsOnlyExecutablePolicyText(t *testing.T) {
	input := `
		-- REFERENCES workspace(id); CREATE INDEX fake;
		/* FOREIGN KEY (workspace_id) REFERENCES workspace(id); */
		COMMENT ON TABLE example IS 'FOREIGN KEY REFERENCES CREATE INDEX;';
		ALTER TABLE example ADD FOREIGN KEY (workspace_id) REFERENCES workspace(id);
	`
	got := stripSQLCommentsAndStrings(input)
	if strings.Count(strings.ToUpper(got), "FOREIGN KEY") != 1 {
		t.Fatalf("stripped SQL retained non-executable FOREIGN KEY text: %q", got)
	}
	if strings.Count(strings.ToUpper(got), "REFERENCES") != 1 {
		t.Fatalf("stripped SQL retained non-executable REFERENCES text: %q", got)
	}
	if strings.Contains(strings.ToUpper(got), "CREATE INDEX") {
		t.Fatalf("stripped SQL retained non-executable CREATE INDEX text: %q", got)
	}
}

func migrationSQLForLint(t *testing.T, file string) string {
	t.Helper()
	contents, err := os.ReadFile(file)
	if err != nil {
		t.Fatalf("read migration %s: %v", filepath.Base(file), err)
	}
	return stripSQLCommentsAndStrings(string(contents))
}

// stripSQLCommentsAndStrings removes text that must not be interpreted as
// executable DDL by the lightweight migration policy checks. It deliberately
// preserves dollar-quoted function bodies because dynamically-created schema
// objects must follow the same rules as top-level SQL.
func stripSQLCommentsAndStrings(sql string) string {
	const (
		sqlNormal = iota
		sqlLineComment
		sqlBlockComment
		sqlSingleQuoted
	)

	result := []byte(sql)
	state := sqlNormal
	blockDepth := 0
	for i := 0; i < len(result); i++ {
		switch state {
		case sqlNormal:
			switch {
			case result[i] == '-' && i+1 < len(result) && result[i+1] == '-':
				result[i], result[i+1] = ' ', ' '
				i++
				state = sqlLineComment
			case result[i] == '/' && i+1 < len(result) && result[i+1] == '*':
				result[i], result[i+1] = ' ', ' '
				i++
				blockDepth = 1
				state = sqlBlockComment
			case result[i] == '\'':
				result[i] = ' '
				state = sqlSingleQuoted
			}
		case sqlLineComment:
			if result[i] == '\n' {
				state = sqlNormal
			} else {
				result[i] = ' '
			}
		case sqlBlockComment:
			switch {
			case result[i] == '/' && i+1 < len(result) && result[i+1] == '*':
				result[i], result[i+1] = ' ', ' '
				i++
				blockDepth++
			case result[i] == '*' && i+1 < len(result) && result[i+1] == '/':
				result[i], result[i+1] = ' ', ' '
				i++
				blockDepth--
				if blockDepth == 0 {
					state = sqlNormal
				}
			default:
				if result[i] != '\n' {
					result[i] = ' '
				}
			}
		case sqlSingleQuoted:
			if result[i] == '\'' {
				result[i] = ' '
				if i+1 < len(result) && result[i+1] == '\'' {
					result[i+1] = ' '
					i++
				} else {
					state = sqlNormal
				}
			} else if result[i] != '\n' {
				result[i] = ' '
			}
		}
	}
	return string(result)
}

func migrationStemsByPrefix(t *testing.T) map[string][]string {
	t.Helper()

	files := migrationFilesForLint(t, "*.up.sql")
	stemsByPrefix := make(map[string][]string)
	for _, file := range files {
		stem := strings.TrimSuffix(filepath.Base(file), ".up.sql")
		match := migrationPrefixPattern.FindStringSubmatch(stem)
		if match == nil {
			t.Fatalf("migration %s does not start with a numeric prefix followed by underscore", stem)
		}
		stemsByPrefix[match[1]] = append(stemsByPrefix[match[1]], stem)
	}
	return stemsByPrefix
}

func migrationFilesForLint(t *testing.T, pattern string) []string {
	t.Helper()

	dir := realMigrationsDir(t)
	files, err := filepath.Glob(filepath.Join(dir, pattern))
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatalf("no migration files matched %s in %s", pattern, dir)
	}
	sort.Strings(files)
	return files
}

func realMigrationsDir(t *testing.T) string {
	t.Helper()

	_, self, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve migration lint test path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(self), "..", "..", "migrations"))
}

func splitMigrationFilename(name string) (stem, direction string, ok bool) {
	for _, candidateDirection := range []string{"up", "down"} {
		suffix := fmt.Sprintf(".%s.sql", candidateDirection)
		if strings.HasSuffix(name, suffix) {
			return strings.TrimSuffix(name, suffix), candidateDirection, true
		}
	}
	return "", "", false
}
