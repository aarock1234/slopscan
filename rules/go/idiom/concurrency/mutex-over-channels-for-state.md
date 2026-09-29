---
severity: minor
detect: judge
falsePositives:
  - >-
    a channel that hands off ownership or coordinates goroutines, such as a work
    queue or cancellation
  - a semaphore channel that bounds concurrency rather than guarding a value
  - an actor loop that owns the state by design and is documented as such
jev:
  threshold: 0.5
guide:
  - go.concurrency
---

## Why

Guarding a plain value with a channel used as a lock, or with a goroutine that serializes closures, hides a mutex behind extra machinery that the reader has to decode before they can see it is just mutual exclusion. Channels are for moving data between goroutines; a `sync.Mutex` next to the field it protects says exactly what is guarded and is what the race detector and every Go reader expect.

## Message

channel used as a lock around plain state; use a sync.Mutex next to the field

## Bad

```go
type Cache struct {
	lock  chan struct{}
	items map[string]string
}

func (c *Cache) Set(key, value string) {
	// BAD: a one-slot channel standing in for a mutex
	c.lock <- struct{}{}
	c.items[key] = value
	<-c.lock
}
```

## Good

```go
type Cache struct {
	mu    sync.Mutex
	items map[string]string
}

func (c *Cache) Set(key, value string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = value
}
```
