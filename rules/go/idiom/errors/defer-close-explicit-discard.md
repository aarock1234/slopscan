---
severity: minor
detect: ast
ast:
  rule:
    kind: defer_statement
    has:
      kind: call_expression
      has:
        field: function
        regex: \.Close$
guide:
  - go.close-errors
---

## Why

A bare `defer f.Close()` drops the returned error without saying so, which is also what `errcheck` flags. For read-only resources the error is not actionable, so discard it explicitly with `_ =` to record that decision; for anything that was written to, check the error and fold it into the function's result, because a failed close can mean the data never reached disk and logging it alone would still let the caller report success.

## Message

bare defer Close ignores its error silently; discard it with _ = or check it

## Bad

```go
func fetch(url string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	// BAD: close error dropped without saying so
	defer resp.Body.Close()

	return nil
}
```

## Good

```go
func fetch(url string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	return nil
}
```

```go
func write(path string, data []byte) (err error) {
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("creating %s: %w", path, err)
	}
	defer func() {
		if closeErr := f.Close(); closeErr != nil {
			err = errors.Join(err, fmt.Errorf("closing %s: %w", path, closeErr))
		}
	}()

	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("writing %s: %w", path, err)
	}

	return nil
}
```
