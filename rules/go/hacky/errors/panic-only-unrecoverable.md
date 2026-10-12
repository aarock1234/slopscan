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
        # re-raising a recovered panic, as net/http asks middleware to do with http.ErrAbortHandler
        - inside:
            stopBy: end
            any:
              - kind: func_literal
              - kind: function_declaration
              - kind: method_declaration
            has:
              stopBy: end
              kind: call_expression
              has:
                field: function
                regex: ^recover$
ignore:
  - '**/*_test.go'
guide:
  - go.panic
---

## Why

A panic in library code turns an operational failure such as a missing row or a bad input into a process crash that the caller cannot handle. Panics belong to genuinely unrecoverable situations: violated internal invariants, `Must` helpers that document the contract in their name, impossible states after exhaustive handling, and re-raising a panic that `recover` caught but must not swallow, such as `http.ErrAbortHandler`. Configuration, network, and storage failures return an error from a constructor or `run`, including failures that used to hide inside `init`; an `init` panic is only right when process-wide setup is deliberately unavoidable, so `init` is not exempt here. A fixed program literal such as `regexp.MustCompile` at package level makes the invariant visible; input-dependent patterns use `regexp.Compile` and return its error.

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
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			v := recover()
			if v == nil {
				return
			}

			// net/http relies on this panic to abort the response
			if err, ok := v.(error); ok && errors.Is(err, http.ErrAbortHandler) {
				panic(v)
			}

			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		}()

		next.ServeHTTP(w, r)
	})
}
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
