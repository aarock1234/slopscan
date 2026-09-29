---
severity: minor
detect: judge
falsePositives:
  - a main of a few lines with no resources to release
  - example or generated programs
  - a main that only parses flags and calls one function
jev:
  threshold: 0.47
---

## Why

`os.Exit` and `log.Fatal` skip deferred calls, so a `main` that opens resources and exits on error leaks every one of them on the failure path. Move the body into `run() error`, let defers run on every exit, and keep `main` to calling `run`, logging the error, and exiting.

## Message

main does the wiring itself; move it into run() error so defers run on every exit

## Bad

```go
func main() {
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := serve(db); err != nil {
		// BAD: exits from the middle of the wiring, skipping the deferred close
		log.Fatal(err)
	}
}
```

## Good

```go
func main() {
	if err := run(); err != nil {
		slog.Error("fatal error", "error", err)
		os.Exit(1)
	}
}

func run() error {
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() { _ = db.Close() }()

	return serve(db)
}
```
