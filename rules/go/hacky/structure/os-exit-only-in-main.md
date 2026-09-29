---
severity: major
detect: ast
ast:
  rule:
    kind: call_expression
    has:
      field: function
      regex: ^(os\.Exit|log\.Fatal(f|ln)?)$
    not:
      inside:
        kind: function_declaration
        stopBy: end
        has:
          field: name
          regex: ^main$
ignore:
  - '**/*_test.go'
guide:
  - go.dependency-wiring
  - go.shutdown
---

## Why

`os.Exit` and the `log.Fatal` family end the process on the spot, skipping every deferred close and flush up the stack and making the function impossible to reuse or test. Return an error instead and let `main` be the one place that decides to exit.

## Message

os.Exit outside main skips every defer; return an error and exit from main

## Bad

```go
func run() error {
	cfg, err := loadConfig()
	if err != nil {
		// BAD: exits from a library-style function, skipping every defer up the stack
		log.Fatalf("loading config: %v", err)
	}

	return serve(cfg)
}
```

## Good

```go
func run() error {
	cfg, err := loadConfig()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	return serve(cfg)
}

func main() {
	if err := run(); err != nil {
		slog.Error("fatal error", "error", err)
		os.Exit(1)
	}
}
```
