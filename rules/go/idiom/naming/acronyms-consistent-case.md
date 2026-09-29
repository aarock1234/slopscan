---
severity: minor
detect: ast
ast:
  rule:
    any:
      - kind: identifier
        any:
          - inside:
              kind: var_spec
          - inside:
              kind: const_spec
          - inside:
              kind: parameter_declaration
          - inside:
              kind: function_declaration
              field: name
          - inside:
              kind: expression_list
              inside:
                kind: short_var_declaration
                field: left
      - kind: field_identifier
        any:
          - inside:
              kind: field_declaration
          - inside:
              kind: method_declaration
              field: name
          - inside:
              kind: method_elem
      - kind: type_identifier
        inside:
          kind: type_spec
          field: name
    regex: >-
      (Id|Http|Https|Url|Uri|Json|Api|Sql|Uuid|Xml|Html|Grpc|Tls|Tcp|Udp|Ip|Db|Cpu|Ttl)([A-Z]|$)
guide:
  - go.naming
---

## Why

Go keeps acronyms in one case: `userID`, `HTTPClient`, `parseURL`. Mixed-case forms like `userId` and `HttpClient` are the naming of other languages and stand out immediately in a Go codebase, and a mix of both spellings means the reader has to guess which one a given identifier uses. A leading acronym on an unexported name is lowercase as a whole (`httpClient`), which this rule does not flag.

## Message

acronyms keep one case in identifiers: userID, HTTPClient, parseURL

## Bad

```go
type Client struct {
	// BAD: acronym in mixed case
	userId string
}
```

```go
// BAD: acronym in mixed case
func parseUrl(raw string) (*url.URL, error) {
	return url.Parse(raw)
}
```

```go
func (c *Client) fetch() error {
	// BAD: acronym in mixed case
	responseJson, err := c.read()
	if err != nil {
		return err
	}

	return c.store(responseJson)
}
```

## Good

```go
type Client struct {
	userID     string
	httpClient *http.Client
}

func parseURL(raw string) (*url.URL, error) {
	return url.Parse(raw)
}
```

```go
func (c *Client) fetch() error {
	responseJSON, err := c.read()
	if err != nil {
		return err
	}

	return c.store(responseJSON)
}
```
