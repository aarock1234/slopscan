---
severity: minor
detect: judge
falsePositives:
  - >-
    a channel that moves work between goroutines rather than iterating a
    collection
  - an API that must stay compatible with Go older than 1.23
  - >-
    a callback that needs to return an error per element (iter.Seq2 with an
    error value)
jev:
  threshold: 0.5
---

## Why

A generator built on a channel and a goroutine leaks the goroutine when the caller stops early, costs a context switch per element, and forces the caller into a manual `for range ch` with no way to break cleanly. `iter.Seq[T]` expresses the same sequence as a plain function, works with `for range`, and stops when the loop body does.

## Message

channel or callback generator; return an iter.Seq so callers can range and break

## Bad

```go
// BAD: leaks the goroutine when the caller stops early
func (s *Store) Items() <-chan Item {
	ch := make(chan Item)
	go func() {
		defer close(ch)
		for _, item := range s.items {
			ch <- item
		}
	}()

	return ch
}
```

## Good

```go
func (s *Store) Items() iter.Seq[Item] {
	return func(yield func(Item) bool) {
		for _, item := range s.items {
			if !yield(item) {
				return
			}
		}
	}
}
```
