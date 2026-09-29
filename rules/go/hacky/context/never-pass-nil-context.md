---
severity: major
detect: ast
ast:
  rule:
    kind: call_expression
    all:
      - has:
          field: function
          regex: (^context\.With\w+|Context)$
      - has:
          field: arguments
          has:
            kind: nil
            nthChild: 1
guide:
  - go.context
---

## Why

A nil context compiles and then panics inside the first function that calls a method on it, often far from where the nil was passed. When there is no context to forward yet, use `context.Background()` at the top of the program or `context.TODO()` to mark a spot that still needs to be wired.

## Message

nil passed as a context; use context.Background() or context.TODO()

## Bad

```go
func fetch(url string) (*http.Response, error) {
	// BAD: nil context panics inside the request
	req, err := http.NewRequestWithContext(nil, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	return http.DefaultClient.Do(req)
}
```

```go
func timeout() (context.Context, context.CancelFunc) {
	// BAD: nil parent context
	return context.WithTimeout(nil, time.Second)
}
```

## Good

```go
func fetch(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	return http.DefaultClient.Do(req)
}
```

```go
func timeout() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), time.Second)
}
```
