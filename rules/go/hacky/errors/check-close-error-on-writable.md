---
severity: critical
detect: judge
falsePositives:
  - >-
    read-only resources such as response bodies, files opened with os.Open, and
    listeners
  - >-
    a writer whose API completes the write in a checked Flush or Sync and has no
    Close of its own, such as bufio.Writer; an os.File or compressor Close is
    still checked even after a checked Sync or Flush
  - >-
    a bare deferred tx.Rollback() with database/sql, where Commit is inspected
    and rollback after a successful commit is a documented no-op
  - >-
    a pgx tx.Rollback whose error is checked and joined into the result except
    for pgx.ErrTxClosed after a successful Commit
guide:
  - go.close-errors
  - go.persistence-contracts
jev:
  threshold: 0.5
---

## Why

On a written file, a buffered writer, or a transaction, Close is where the last bytes are flushed and the commit happens. Discarding that error turns a full disk or a broken connection into a function that reports success while the data was lost. Check the close error on anything that was written to and fold it into the returned error with `errors.Join`, so a write failure and a close failure are both preserved rather than one hiding the other.

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
