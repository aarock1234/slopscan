---
severity: minor
detect: ast
ast:
  rule:
    kind: binary_expression
    regex: (==|!=)
    has:
      any:
        - kind: identifier
        - kind: selector_expression
      regex: '(^|\.)Err[A-Z]\w*$'
guide:
  - go.sentinel-errors
---

## Why

Comparing an error with `==` only matches the exact value, so it works until someone wraps the error with `%w` one layer down, and then the branch silently stops firing. `errors.Is` walks the chain and keeps working as the code around it grows.

## Message

error compared with == misses wrapped errors; use errors.Is

## Bad

```go
func status(err error) int {
	// BAD: equality misses the sentinel once it has been wrapped
	if err == ErrNotFound {
		return http.StatusNotFound
	}

	return http.StatusInternalServerError
}
```

```go
func retry(err error) bool {
	// BAD: equality misses the sentinel once it has been wrapped
	return err != store.ErrConflict
}
```

## Good

```go
func status(err error) int {
	if errors.Is(err, ErrNotFound) {
		return http.StatusNotFound
	}

	return http.StatusInternalServerError
}
```

```go
func load() error {
	if err := read(); err != nil {
		return err
	}

	return nil
}
```
