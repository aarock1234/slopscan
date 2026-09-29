---
severity: minor
detect: judge
falsePositives:
  - 'a package that constructs several types, where NewX disambiguates'
  - package main
  - >-
    a constructor for a secondary type when New is already taken by the primary
    one
jev:
  threshold: 0.49
---

## Why

The package name already says what is being built, so `service.NewService(...)` says it twice while `service.New(...)` reads cleanly. Name the constructor of a package's primary type `New`; reserve `NewX` for secondary types that need to be told apart.

## Message

constructor for the package's primary type is named New, not NewX

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
