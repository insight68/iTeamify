package main

import (
	"reflect"
	"testing"
)

func TestAllowedOriginsPrecedence(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", " https://one.example, https://two.example ")
	t.Setenv("FRONTEND_ORIGIN", "https://frontend.example")
	t.Setenv("ITEAMIFY_APP_URL", "https://app.example")

	want := []string{"https://one.example", "https://two.example"}
	if got := allowedOrigins(); !reflect.DeepEqual(got, want) {
		t.Fatalf("allowedOrigins() = %#v, want %#v", got, want)
	}
}

func TestAllowedOriginsFallsBackToFrontendOrigin(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "")
	t.Setenv("FRONTEND_ORIGIN", "https://frontend.example")
	t.Setenv("ITEAMIFY_APP_URL", "https://app.example")

	want := []string{"https://frontend.example"}
	if got := allowedOrigins(); !reflect.DeepEqual(got, want) {
		t.Fatalf("allowedOrigins() = %#v, want %#v", got, want)
	}
}

func TestAllowedOriginsFallsBackToAppURL(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "")
	t.Setenv("FRONTEND_ORIGIN", "")
	t.Setenv("ITEAMIFY_APP_URL", "https://app.example")

	want := []string{"https://app.example"}
	if got := allowedOrigins(); !reflect.DeepEqual(got, want) {
		t.Fatalf("allowedOrigins() = %#v, want %#v", got, want)
	}
}

func TestAllowedOriginsUsesDevelopmentDefaults(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "")
	t.Setenv("FRONTEND_ORIGIN", "")
	t.Setenv("ITEAMIFY_APP_URL", "")

	if got := allowedOrigins(); !reflect.DeepEqual(got, defaultOrigins) {
		t.Fatalf("allowedOrigins() = %#v, want %#v", got, defaultOrigins)
	}
}
