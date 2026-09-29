---
severity: critical
detect: judge
falsePositives:
  - >-
    read-only resources such as response bodies, files opened with os.Open, and
    listeners
  - a Close preceded by an explicit Sync or Flush whose error is checked
  - a deferred Rollback that is expected to fail after a successful Commit
jev:
  threshold: 0.51
---

## Why

On a written file, a buffered writer, or a transaction, Close is where the last bytes are flushed and the commit happens. Discarding that error turns a full disk or a broken connection into a function that reports success while the data was lost. Check the close error on anything that was written to and fold it into the returned error.

## Message

close error on a written resource is discarded; a failed close can mean lost data

## Bad

```go
func write(path string, data []byte) error {
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("creating %s: %w", path, err)
	}
	// BAD: a failed close on a written file means the data may never have been flushed
	defer func() { _ = f.Close() }()

	_, err = f.Write(data)

	return err
}
```

## Good

```go
func write(path string, data []byte) (err error) {
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("creating %s: %w", path, err)
	}
	defer func() {
		if closeErr := f.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("closing %s: %w", path, closeErr)
		}
	}()

	_, err = f.Write(data)

	return err
}
```
