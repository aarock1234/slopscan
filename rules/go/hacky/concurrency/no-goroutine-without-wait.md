---
severity: major
detect: judge
falsePositives:
  - >-
    a long-lived background loop started from main or a Start method that has a
    matching Stop
  - a goroutine that reports through a channel the caller reads
  - >-
    a goroutine whose cancellation and join are owned elsewhere and documented,
    such as a worker counted by a WaitGroup or errgroup that Stop or shutdown
    waits on, even when it logs its own errors
guide:
  - go.concurrency
  - go.errgroup
  - go.worker-pool
jev:
  threshold: 0.5
---

## Why

A bare `go f()` in a request path has no one waiting for it, so its errors vanish, its panics take the process down, and the function returns before the work is done. Bound the goroutines with an `errgroup` or a `sync.WaitGroup`, propagate the first error, and let the context cancel the rest. Logging errors inside the goroutine does not make it fire-and-forget by design: every goroutine still needs someone who starts it, something that ends it, and someone who waits for it, and cancellation alone is a request to stop, not a join.

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
