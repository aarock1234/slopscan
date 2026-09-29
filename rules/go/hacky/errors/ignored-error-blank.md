---
severity: major
detect: ast
ignore:
  - '**/*_test.go'
ast:
  rule:
    any:
      - kind: short_var_declaration
      - kind: assignment_statement
    has:
      field: left
      regex: '(^|,\s*)_$'
    all:
      - has:
          field: right
          has:
            kind: call_expression
            not:
              has:
                field: function
                regex: (\.Close|\.Load|\.LoadOrStore)$|^fmt\.Fprint|^os\.LookupEnv$
guide:
  - go.close-errors
  - go.error-propagation
---

## Why

Assigning a returned error to the blank identifier makes the failure disappear at compile time and at runtime: the file is not removed, the number is zero, and the program keeps going with the wrong state. This is the Go form of an empty catch. Check the error and handle or return it; if it truly cannot matter, say why in a comment on the call so the next reader does not have to guess.

## Message

returned error discarded with the blank identifier; check it or comment why it cannot matter

## Bad

```go
func cleanup(path string) {
	// BAD: a failed removal leaves the file behind and nobody knows
	_ = os.Remove(path)
}
```

```go
func parseLimit(raw string) int {
	// BAD: bad input silently becomes zero
	limit, _ := strconv.Atoi(raw)

	return limit
}
```

## Good

```go
func cleanup(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("removing %s: %w", path, err)
	}

	return nil
}
```

```go
func parseLimit(raw string) (int, error) {
	limit, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("parsing limit %q: %w", raw, err)
	}

	return limit, nil
}
```

```go
func readAll(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening %s: %w", path, err)
	}
	defer func() { _ = f.Close() }()

	return io.ReadAll(f)
}
```
