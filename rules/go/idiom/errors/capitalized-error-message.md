---
severity: minor
detect: ast
ast:
  rule:
    any:
      - pattern:
          context: 'func f() { errors.New($MSG) }'
          selector: call_expression
      - pattern:
          context: 'func f() { fmt.Errorf($MSG, $$$ARGS) }'
          selector: call_expression
  constraints:
    MSG:
      regex: '^"[A-Z][a-z ]|[.!?]"$'
guide:
  - go.error-propagation
---

## Why

Error messages get wrapped: `reading config: opening file: permission denied`. A capitalized fragment in the middle of that chain reads wrong, and trailing punctuation doubles up. Error strings are lowercase fragments without a final period. A leading initialism such as `HTTP` or `TLS` is exempt because it has no lowercase spelling; a proper noun such as `PostgreSQL` is also allowed by the guide but cannot be told apart from an ordinary capitalized word, so a hit on one is fine to leave.

## Message

error strings are lowercase fragments without trailing punctuation so they read well when wrapped

## Bad

```go
func load(path string) error {
	// BAD: capitalized message
	return errors.New("Config file is missing")
}
```

```go
func load(path string) error {
	// BAD: capitalized wrapped message
	return fmt.Errorf("Reading %s: %w", path, err)
}
```

```go
func load(path string) error {
	// BAD: trailing period doubles up when wrapped
	return fmt.Errorf("reading %s failed.", path)
}
```

## Good

```go
func load(path string) error {
	return fmt.Errorf("reading %s: %w", path, err)
}
```

```go
var ErrMissingConfig = errors.New("config file is missing")
```

```go
func check(code int) error {
	return fmt.Errorf("HTTP status %d", code)
}
```
