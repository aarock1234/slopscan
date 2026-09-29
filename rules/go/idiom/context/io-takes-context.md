---
severity: minor
detect: judge
falsePositives:
  - 'pure computation with no network, disk, or database access'
  - >-
    a method satisfying an interface that has no context, such as http.Handler
    where r.Context() is used inside
  - test helpers
jev:
  threshold: 0.5
---

## Why

A function that talks to the network, a database, or another process without a `context.Context` cannot be cancelled or bounded by a deadline, so a hung dependency hangs every caller and the request that started it. Take `ctx` as the first parameter and pass it through to the call that does the I/O.

## Message

function does I/O without a context; take ctx and pass it to the call

## Bad

```go
// BAD: a network call with no way to cancel or bound it
func (c *Client) Fetch(id string) (*Item, error) {
	resp, err := c.http.Get(c.baseURL + "/items/" + id)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	return decode(resp.Body)
}
```

## Good

```go
func (c *Client) Fetch(ctx context.Context, id string) (*Item, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/items/"+id, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	return decode(resp.Body)
}
```
