---
severity: major
detect: judge
falsePositives:
  - >-
    a long-lived background loop started from main or a Start method that has a
    matching Stop
  - a goroutine that reports through a channel the caller reads
  - >-
    fire-and-forget by design with the error handled and logged inside the
    goroutine
jev:
  threshold: 0.5
---

## Why

A bare `go f()` in a request path has no one waiting for it, so its errors vanish, its panics take the process down, and the function returns before the work is done. Bound the goroutines with an `errgroup` or a `sync.WaitGroup`, propagate the first error, and let the context cancel the rest.

## Message

goroutine started with nothing waiting for it or collecting its error

## Bad

```go
func (s *Service) ProcessAll(ctx context.Context, items []Item) error {
	for _, item := range items {
		// BAD: nothing waits for these goroutines or sees their errors
		go s.process(ctx, item)
	}

	return nil
}
```

## Good

```go
func (s *Service) ProcessAll(ctx context.Context, items []Item) error {
	g, ctx := errgroup.WithContext(ctx)
	for _, item := range items {
		g.Go(func() error {
			return s.process(ctx, item)
		})
	}

	return g.Wait()
}
```
