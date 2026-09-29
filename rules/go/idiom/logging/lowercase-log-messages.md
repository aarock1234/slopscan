---
severity: minor
detect: ast
ast:
  rule:
    kind: call_expression
    any:
      - all:
          - has:
              field: function
              regex: \.(Debug|Info|Warn|Error)$
          - has:
              field: arguments
              has:
                kind: interpreted_string_literal
                nthChild: 1
                regex: '^"[A-Z][a-z]'
      - all:
          - has:
              field: function
              regex: \.(Debug|Info|Warn|Error)Context$
          - has:
              field: arguments
              has:
                kind: interpreted_string_literal
                nthChild: 2
                regex: '^"[A-Z][a-z]'
ignore:
  - '**/*_test.go'
guide:
  - go.logging
---

## Why

Log messages are lowercase fragments, like error strings, so they read uniformly in a stream and can be grepped without guessing the case. A message that starts with a proper noun such as PostgreSQL will be flagged too; keep the noun and accept the finding, or lead with a lowercase word.

## Message

log messages are lowercase fragments

## Bad

```go
func (s *Server) Start(port int) {
	// BAD: capitalized log message
	slog.Info("Starting server", "port", port)
}
```

```go
func (s *Service) Save(ctx context.Context, item Item) error {
	if err := s.repo.Save(ctx, item); err != nil {
		// BAD: capitalized log message
		s.logger.ErrorContext(ctx, "Failed to save item", "error", err)

		return err
	}

	return nil
}
```

## Good

```go
func (s *Server) Start(port int) {
	slog.Info("starting server", "port", port)
}
```

```go
func (s *Service) Save(ctx context.Context, item Item) error {
	if err := s.repo.Save(ctx, item); err != nil {
		s.logger.ErrorContext(ctx, "saving item", "error", err)

		return err
	}

	return nil
}
```
