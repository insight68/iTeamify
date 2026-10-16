package service

import (
	"reflect"
	"testing"
)

func projectionFixture() BusinessReleaseView {
	return BusinessReleaseView{
		ID: "release-7", Version: 7, PublishedAt: "2026-08-07T00:00:00Z",
		Content: BusinessContent{
			BusinessName: "Northstar Company", BrandName: "Northstar", WebsiteURL: "https://northstar.example", Summary: "Growth design studio",
			Positioning: "Design for service businesses", Differentiators: []string{"Fast research"},
			Principles: []string{"Evidence first"}, Exclusions: []string{"No speculative guarantees"},
			Offers: []BusinessOffer{
				{ID: "offer-web", Name: "Website redesign", Summary: "A conversion-ready website"},
				{ID: "offer-seo", Name: "SEO advisory", Summary: "Search strategy"},
			},
			Audiences: []BusinessAudience{{
				ID: "audience-agency", Name: "Growing agencies", Industries: []string{"Design"},
				BuyerPersonas: []BusinessPersona{
					{ID: "persona-founder", Name: "Founder", Titles: []string{"CEO"}},
					{ID: "persona-growth", Name: "Growth lead", Titles: []string{"Head of Growth"}},
				},
			}},
			Proof:   []BusinessProof{{ID: "proof-1", Title: "Case study", Summary: "2x conversion", SourceURL: "https://northstar.example/case"}},
			Sources: []BusinessSource{{ID: "source-1", Title: "Official site", URL: "https://northstar.example"}},
		},
	}
}

func TestProjectCompanyContextScopesAndFilters(t *testing.T) {
	projection, err := ProjectCompanyContext(projectionFixture(), CompanyContextQuery{
		Scopes: []string{"identity", "offers", "boundaries"}, OfferIDs: []string{"offer-web"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if projection.CompanyRelease.ID != "release-7" || projection.CompanyRelease.Version != 7 {
		t.Fatalf("unexpected release: %#v", projection.CompanyRelease)
	}
	if got := projection.Content["company_name"]; got != "Northstar Company" {
		t.Fatalf("company_name = %#v", got)
	}
	if got := projection.Content["brand_name"]; got != "Northstar" {
		t.Fatalf("brand_name = %#v", got)
	}
	offers, ok := projection.Content["offers"].([]BusinessOffer)
	if !ok || len(offers) != 1 || offers[0].ID != "offer-web" {
		t.Fatalf("offers = %#v", projection.Content["offers"])
	}
	if _, leaked := projection.Content["audiences"]; leaked {
		t.Fatal("unrequested audiences leaked into projection")
	}
	if projection.ContentHash == "" {
		t.Fatal("content hash is empty")
	}
	wantOmitted := []string{"positioning", "audiences", "personas", "proof", "sources"}
	if !reflect.DeepEqual(projection.OmittedScopes, wantOmitted) {
		t.Fatalf("omitted scopes = %#v, want %#v", projection.OmittedScopes, wantOmitted)
	}
}

func TestProjectCompanyContextSeparatesAudienceAndPersonaScopes(t *testing.T) {
	audiencesOnly, err := ProjectCompanyContext(projectionFixture(), CompanyContextQuery{Scopes: []string{"audiences"}})
	if err != nil {
		t.Fatal(err)
	}
	audiences := audiencesOnly.Content["audiences"].([]BusinessAudience)
	if len(audiences) != 1 || len(audiences[0].BuyerPersonas) != 0 {
		t.Fatalf("audiences scope leaked personas: %#v", audiences)
	}

	personasOnly, err := ProjectCompanyContext(projectionFixture(), CompanyContextQuery{
		Scopes: []string{"personas"}, PersonaIDs: []string{"persona-growth"},
	})
	if err != nil {
		t.Fatal(err)
	}
	groups := personasOnly.Content["personas"].([]CompanyAudiencePersonas)
	if len(groups) != 1 || len(groups[0].Personas) != 1 || groups[0].Personas[0].ID != "persona-growth" {
		t.Fatalf("personas = %#v", groups)
	}
}

func TestProjectCompanyContextValidatesAndTruncates(t *testing.T) {
	for _, query := range []CompanyContextQuery{
		{},
		{Scopes: []string{"draft"}},
		{Scopes: []string{"offers"}, MaxItems: 101},
	} {
		if _, err := ProjectCompanyContext(projectionFixture(), query); err != ErrCompanyContextInvalid {
			t.Fatalf("query %#v error = %v, want ErrCompanyContextInvalid", query, err)
		}
	}

	projection, err := ProjectCompanyContext(projectionFixture(), CompanyContextQuery{Scopes: []string{"offers"}, MaxItems: 1})
	if err != nil {
		t.Fatal(err)
	}
	if !projection.Truncated || len(projection.Content["offers"].([]BusinessOffer)) != 1 {
		t.Fatalf("projection was not truncated: %#v", projection)
	}
}

func TestProjectPublishedCompanyContextCachesExactReleaseQuery(t *testing.T) {
	service := NewBusinessService(nil, nil)
	query := CompanyContextQuery{Scopes: []string{"offers"}, OfferIDs: []string{"offer-web"}}
	first, hit, err := service.ProjectPublishedCompanyContext(projectionFixture(), query)
	if err != nil {
		t.Fatal(err)
	}
	if hit {
		t.Fatal("first projection unexpectedly reported a cache hit")
	}
	second, hit, err := service.ProjectPublishedCompanyContext(projectionFixture(), query)
	if err != nil {
		t.Fatal(err)
	}
	if !hit || !reflect.DeepEqual(first, second) {
		t.Fatalf("second projection did not reuse an equivalent cached value: hit=%v first=%#v second=%#v", hit, first, second)
	}
	_, hit, err = service.ProjectPublishedCompanyContext(projectionFixture(), CompanyContextQuery{Scopes: []string{"identity"}})
	if err != nil {
		t.Fatal(err)
	}
	if hit {
		t.Fatal("different scope query incorrectly hit the projection cache")
	}
}
