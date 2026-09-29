---
severity: minor
detect: judge
falsePositives:
  - >-
    a handler that logs and then writes a sanitized response instead of
    returning the error
  - >-
    a log line that adds details the caller cannot reconstruct (a debug dump of
    the request)
  - >-
    the error is returned from a top-level run function where nothing above will
    log it
  - >-
    a batch or worker loop that logs each item's failure and returns a distinct
    summary such as ctx.Err() or a failure count, as a documented policy
guide:
  - go.error-propagation
jev:
  threshold: 0.5
---

## Why

An error is either handled or propagated, never both. Logging it and then returning it means every layer up the stack logs the same failure again, and the operator reads three stack-less copies of one event. Wrap it with context and return it; the layer that finally handles it logs once.

## Message

error is logged and returned; handle it or propagate it, not both

## Bad

```go
func (s *Service) Get(ctx context.Context, id string) (*Item, error) {
	item, err := s.repo.Get(ctx, id)
	if err != nil {
		// BAD: the caller will log this again
		s.logger.Error("failed to get item", "error", err)

		return nil, fmt.Errorf("get item %s: %w", id, err)
	}

	return item, nil
}
```

## Good

```go
func (s *Service) Get(ctx context.Context, id string) (*Item, error) {
	item, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get item %s: %w", id, err)
	}

	return item, nil
}
```
