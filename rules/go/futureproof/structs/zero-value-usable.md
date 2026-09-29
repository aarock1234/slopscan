---
severity: minor
detect: judge
falsePositives:
  - >-
    a type that wraps an external resource (connection, file) and is always
    built by a constructor
  - >-
    a type whose constructor validates invariants that a zero value cannot
    satisfy
  - a type that is unexported and only constructed in one place
jev:
  threshold: 0.51
---

## Why

A struct whose zero value works can be declared as a field or a `var` and used immediately, the way `sync.Mutex` and `bytes.Buffer` are. When the zero value panics on first use, every caller has to remember the constructor, and forgetting it is a nil map write that only shows up at runtime. Initialize lazily inside the methods or make the zero state meaningful.

## Message

zero value panics on first use; make the type usable without a constructor

## Bad

```go
type Cache struct {
	mu    sync.Mutex
	items map[string]string
}

// BAD: the zero Cache panics here because items is nil
func (c *Cache) Set(key, value string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = value
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
	if c.items == nil {
		c.items = make(map[string]string)
	}
	c.items[key] = value
}
```
