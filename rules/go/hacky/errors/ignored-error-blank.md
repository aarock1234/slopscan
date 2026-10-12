---
severity: major
detect: ast
# the matcher cannot see whether the blank holds an error, so what it finds is checked before it counts
verify: true
falsePositives:
  - 'a blank that holds something other than an error, such as the found flag from `strings.Cut`'
  - 'a discard with a comment on or above the call saying why the error cannot matter'
  - 'best-effort cleanup on a path that already returns its error'
  - >-
    a discarded `http.ResponseWriter.Write` error, which arrives after the
    status is sent and leaves the handler nothing to do
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
                # calls whose last result is a bool, not an error
                regex: (\.Close|\.Load|\.LoadOrStore)$|^fmt\.Fprint|^os\.LookupEnv$|^(strings|bytes)\.Cut(Prefix|Suffix)?$
    not:
      any:
        # a comment directly above, between statements or opening the block, says why the error cannot matter
        - follows:
            kind: comment
        - nthChild: 1
          inside:
            kind: statement_list
            follows:
              kind: comment
        # best-effort cleanup on a path that already returns its error
        - inside:
            kind: if_statement
            stopBy: end
            has:
              field: condition
              regex: '\b\w*[eE]rr\w* != nil\b'
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
func init() {
	// an unset or invalid LOG_LEVEL keeps the info level; config loading reports it later
	_ = level.UnmarshalText([]byte(os.Getenv("LOG_LEVEL")))
}
```

```go
func replace(path string, data []byte) (err error) {
	tmp := path + ".tmp"
	defer func() {
		if err != nil {
			_ = os.Remove(tmp)
		}
	}()

	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("writing %s: %w", tmp, err)
	}

	return os.Rename(tmp, path)
}
```

```go
func splitPair(line string) (string, string) {
	name, value, _ := strings.Cut(line, "=")

	return name, value
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
