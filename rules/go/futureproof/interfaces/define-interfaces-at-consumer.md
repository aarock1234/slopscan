---
severity: minor
detect: judge
falsePositives:
    - an interface a package exports for plugin authors to implement, where the package is the consumer
    - a widely shared interface in the style of io.Reader
    - a package that both defines and consumes the interface
---

## Why

An interface declared next to its implementation is shaped by what the implementation offers, not by what a caller needs, so it grows with the implementation and every consumer depends on the implementing package to use it. The tell is a file where the interface and the type that satisfies it sit together and the type's methods mirror the interface. Declare the interface in the package that calls it, with only the methods that package uses; the implementing package exports a concrete type and satisfies the interface implicitly.

## Message

interface declared beside its implementation; define it where it is consumed

## Bad

```go
package postgres

// BAD: the implementation dictates the interface, so every consumer imports postgres
type Repository interface {
	Get(ctx context.Context, id string) (*Item, error)
	Save(ctx context.Context, item *Item) error
}

type Repo struct {
	db *sql.DB
}

func (r *Repo) Get(ctx context.Context, id string) (*Item, error) {
	return scanItem(r.db.QueryRowContext(ctx, selectItem, id))
}

func (r *Repo) Save(ctx context.Context, item *Item) error {
	_, err := r.db.ExecContext(ctx, upsertItem, item.ID, item.Name)

	return err
}
```

```go
package mailer

// BAD: the interface lists every method the sender has, and it lives with the sender
type Sender interface {
	Send(ctx context.Context, msg Message) error
	SendBatch(ctx context.Context, msgs []Message) error
	Close() error
}

type SMTPSender struct {
	client *smtp.Client
}

func (s *SMTPSender) Send(ctx context.Context, msg Message) error { return s.client.Send(msg) }

func (s *SMTPSender) SendBatch(ctx context.Context, msgs []Message) error { return s.client.SendAll(msgs) }

func (s *SMTPSender) Close() error { return s.client.Close() }
```

## Good

```go
package service

// Repository is what Service needs from storage; postgres.Repo satisfies it without importing this package.
type Repository interface {
	Get(ctx context.Context, id string) (*Item, error)
}

type Service struct {
	repo Repository
}

func (s *Service) Rename(ctx context.Context, id string, name string) error {
	item, err := s.repo.Get(ctx, id)
	if err != nil {
		return fmt.Errorf("loading item %s: %w", id, err)
	}

	item.Name = name

	return nil
}
```

```go
package signup

// Notifier is the one method signup calls; mailer.SMTPSender provides it.
type Notifier interface {
	Send(ctx context.Context, msg Message) error
}

func Welcome(ctx context.Context, notifier Notifier, user User) error {
	return notifier.Send(ctx, welcomeMessage(user))
}
```
