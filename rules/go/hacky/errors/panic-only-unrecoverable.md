---
severity: major
detect: ast
ast:
  rule:
    kind: call_expression
    has:
      field: function
      regex: ^panic$
    not:
      any:
        - inside:
            kind: function_declaration
            stopBy: end
            has:
              field: name
              regex: ^(main|Must\w*)$
        - inside:
            kind: default_case
            stopBy: end
ignore:
  - '**/*_test.go'
guide:
  - go.panic
---

## Why

A panic in library code turns an operational failure such as a missing row or a bad input into a process crash that the caller cannot handle. Panics belong to genuinely unrecoverable situations: violated internal invariants, `Must` helpers that document the contract in their name, and impossible states after exhaustive handling. Configuration, network, and storage failures return an error from a constructor or `run`, including failures that used to hide inside `init`; an `init` panic is only right when process-wide setup is deliberately unavoidable, so `init` is not exempt here. A fixed program literal such as `regexp.MustCompile` at package level makes the invariant visible; input-dependent patterns use `regexp.Compile` and return its error.

## Message

panic in library code; return an error and let the caller decide

## Bad

```go
func (s *Store) Get(id string) *Item {
	item, ok := s.items[id]
	if !ok {
		// BAD: a missing row is an operational error, not a violated invariant
		panic("item not found")
	}

	return item
}
```

```go
func init() {
	if err := setupTransport(); err != nil {
		// BAD: fallible setup belongs in a constructor or run, not behind an init panic
		panic(fmt.Sprintf("transport initialization failed: %v", err))
	}
}
```

## Good

```go
func (s *Store) Get(id string) (*Item, error) {
	item, ok := s.items[id]
	if !ok {
		return nil, fmt.Errorf("item %s: %w", id, ErrNotFound)
	}

	return item, nil
}
```

```go
var itemIDPattern = regexp.MustCompile(`^[a-z0-9]{16}$`)
```

```go
func label(status Status) string {
	switch status {
	case StatusActive, StatusPending:
		return string(status)
	default:
		panic(fmt.Sprintf("unhandled status: %v", status))
	}
}
```
