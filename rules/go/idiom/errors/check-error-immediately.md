---
severity: minor
detect: judge
falsePositives:
  - 'the inline form `if err := f(); err != nil`'
  - an error deliberately collected and checked after a loop or a Wait
  - a second call that does not depend on the first result
jev:
  threshold: 0.5
guide:
  - go.error-propagation
---

## Why

An error is checked on the line after the call that produced it. Anything that runs in between operates on a value that may be the zero value, and the reader has to hold the pending error in their head while following unrelated work. The immediate `if err != nil` keeps the happy path and the failure path next to each other.

## Message

check the error on the line after the call that returned it

## Bad

```go
func load(ctx context.Context, id string) (Item, error) {
	item, err := repo.Get(ctx, id)
	// BAD: works on item before err is checked
	item.Normalize()
	if err != nil {
		return Item{}, fmt.Errorf("get item %s: %w", id, err)
	}

	return item, nil
}
```

## Good

```go
func load(ctx context.Context, id string) (Item, error) {
	item, err := repo.Get(ctx, id)
	if err != nil {
		return Item{}, fmt.Errorf("get item %s: %w", id, err)
	}
	item.Normalize()

	return item, nil
}
```
