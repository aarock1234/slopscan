---
severity: minor
detect: ast
# a lookup table nothing writes to is a constant Go cannot spell; the finding stands only when something writes
confirm: writeCount
ast:
    rule:
        kind: var_spec
        has:
            field: name
            pattern: $SYMBOL
        inside:
            kind: var_declaration
            stopBy: end
        not:
            inside:
                any:
                    - kind: function_declaration
                    - kind: method_declaration
                    - kind: func_literal
                stopBy: end
        any:
            - has:
                  kind: map_type
            - has:
                  kind: slice_type
            - has:
                  kind: expression_list
                  has:
                      kind: composite_literal
                      has:
                          any:
                              - kind: map_type
                              - kind: slice_type
            - has:
                  kind: expression_list
                  has:
                      kind: call_expression
                      regex: '^make\('
ignore:
    - '**/*_test.go'
---

## Why

A package-level map or slice is shared by every goroutine and every test in the process, with no owner to guard it. Concurrent writes race, tests leak state into each other, and nothing in a function signature says the function depends on it. Put the collection in a struct with its own mutex, construct it explicitly, and pass it to what needs it.

A table that nothing writes to after its declaration, such as a list of header names, is a constant that Go has no syntax for. It is only reported when the repository assigns to it, indexes into it on the left of an assignment, appends to it, or hands it to `delete`, `clear`, `copy`, or a sort.

## Message

package-level mutable collection is shared global state; own it in a struct and pass it in

## Bad

```go
package cache

// BAD: every goroutine writes to the same unguarded map
var entries = map[string][]byte{}

func Put(key string, value []byte) {
	entries[key] = value
}
```

```go
package registry

// BAD: appended to from init functions across the package, in no defined order
var handlers []Handler

func Register(h Handler) {
	handlers = append(handlers, h)
}
```

## Good

```go
package cache

type Cache struct {
	mu      sync.RWMutex
	entries map[string][]byte
}

func New() *Cache {
	return &Cache{entries: make(map[string][]byte)}
}

func (c *Cache) Put(key string, value []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries[key] = value
}
```

```go
package registry

var ErrDuplicate = errors.New("handler already registered")

const defaultCapacity = 16
```
