---
severity: minor
detect: judge
falsePositives:
  - 'a package that constructs several types, where NewX disambiguates'
  - >-
    a type whose name is not the package's name, such as registrar.NewNamecheap
    or storage.NewPostgres, where New would not say which one
  - package main
  - >-
    a constructor for a secondary type when New is already taken by the primary
    one
jev:
  threshold: 0.49
---

## Why

The package name already says what is being built, so `service.NewService(...)` says it twice while `service.New(...)` reads cleanly. The problem is the stutter: a constructor whose type name repeats the package name. Name that constructor `New`. Keep `NewX` when X is not the package's name, because then `New` would not say which type comes back.

## Message

constructor repeats the package name, as in service.NewService; name it New

## Bad

```go
package service

// BAD: service.NewService repeats the package name
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}
```

## Good

```go
package service

func New(repo Repository) *Service {
	return &Service{repo: repo}
}
```

```go
package registrar

// Namecheap is one registrar among several the package can build, so New would not say which
func NewNamecheap(config NamecheapConfig) (*Namecheap, error) {
	if config.APIKey == "" {
		return nil, errors.New("namecheap: api key is required")
	}

	return &Namecheap{config: config}, nil
}
```
