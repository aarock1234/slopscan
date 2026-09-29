---
severity: minor
detect: ast
ast:
  rule:
    kind: call_expression
    has:
      field: function
      regex: ^(log|fmt)\.Print(f|ln)?$
ignore:
  - '**/main.go'
  - '**/cmd/**'
  - '**/*_test.go'
guide:
  - go.logging
---

## Why

`log.Printf` and `fmt.Println` produce unstructured text with no level and no fields, so nothing downstream can filter by severity or query by key. `log/slog` gives a level, a message, and typed attributes for the same line of code. Command entry points that print output for a user are exempt.

## Message

unstructured log call; use log/slog with a level and key-value attributes

## Bad

```go
func (s *Service) Process(id string) {
	// BAD: no level, no fields
	log.Printf("processing item %s", id)
}
```

```go
func (s *Service) Process(id string) {
	// BAD: output that is really a log line
	fmt.Println("processing", id)
}
```

## Good

```go
func (s *Service) Process(id string) {
	slog.Info("processing item", "id", id)
}
```
