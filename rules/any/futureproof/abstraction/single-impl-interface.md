---
severity: minor
detect: judge
confirm: implCount
falsePositives:
  - >-
    a port at an architecture boundary whose second implementation is a fake or
    mock in tests
  - >-
    a small consumer-side interface in Go, one or two methods declared next to
    the code that uses them, which narrows a dependency rather than mirroring it
  - >-
    an interface that is part of a published library's contract, where
    implementations live outside this repository
  - >-
    an interface with several implementations, or one whose second
    implementation arrives in the same change
jev:
  threshold: 0.63
---

## Why

An interface with one implementation and no test double is a copy of a type's method list that has to be edited every time the type changes, and it forces readers through an extra jump to find the code that runs. It does not decouple anything, because nothing else plugs in. Use the concrete type until a second implementation or a test fake exists; extracting an interface then is a mechanical change.

## Message

interface has a single implementation and no test double; use the concrete type until a second one exists

## Bad

```ts
// BAD: the interface mirrors the only class that implements it
export interface UserRepository {
	findById(id: string): Promise<User | undefined>;
	insert(input: CreateUserInput): Promise<User>;
	delete(id: string): Promise<void>;
}

export class PostgresUserRepository implements UserRepository {
	async findById(id: string): Promise<User | undefined> {
		return this.db.selectOne(usersTable, { id });
	}

	async insert(input: CreateUserInput): Promise<User> {
		return this.db.insert(usersTable, input);
	}

	async delete(id: string): Promise<void> {
		await this.db.delete(usersTable, { id });
	}
}
```

```go
// BAD: the interface mirrors the whole method set of the only type that satisfies it
type UserStore interface {
	FindByID(ctx context.Context, id string) (User, error)
	Insert(ctx context.Context, in CreateUserInput) (User, error)
	Delete(ctx context.Context, id string) error
}

var _ UserStore = (*PostgresUserStore)(nil)

type PostgresUserStore struct {
	db *sql.DB
}
```

## Good

```ts
export class PostgresUserRepository {
	async findById(id: string): Promise<User | undefined> {
		return this.db.selectOne(usersTable, { id });
	}

	async insert(input: CreateUserInput): Promise<User> {
		return this.db.insert(usersTable, input);
	}
}
```

```go
// UserFinder is the one method the notifier needs; any store that can find users satisfies it.
type UserFinder interface {
	FindByID(ctx context.Context, id string) (User, error)
}

type Notifier struct {
	users UserFinder
}
```
