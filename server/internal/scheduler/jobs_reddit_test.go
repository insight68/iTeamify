package scheduler

import "testing"

func TestRedditJobsValidate(t *testing.T) {
	for _, job := range []JobSpec{RedditReplyJob(nil), RedditRetentionJob(nil)} {
		if err := job.validate(); err != nil {
			t.Fatalf("%s: %v", job.Name, err)
		}
		if job.MaxAttempts != 1 || job.AllowStaleReentry {
			t.Fatalf("unexpected automatic replay: %s", job.Name)
		}
	}
}
