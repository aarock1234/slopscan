---
severity: minor
detect: judge
falsePositives:
  - a string literal compared in exactly one place
  - >-
    a value from an external protocol or wire format compared once at the
    boundary where it is parsed into a typed value
  - >-
    discriminant literals of a union or sum type that already declares the
    allowed values, such as `if (event.kind === 'created')` where `kind` is
    typed as a union of literals
  - >-
    map keys, header names, and env variable names, which are identifiers rather
    than a closed set of states
jev:
  threshold: 0.5
guide:
  - go.constants
  - ts.constants
---

## Why

Comparing the same handful of string literals in several places means the set of valid values lives nowhere: a typo in one comparison is a silent false branch, and adding a value means finding every switch by hand. Declare the set once as a const object with a derived union type in TypeScript, or a named string type with typed constants in Go, and let the compiler enforce exhaustiveness and spelling.

## Message

string literals used as an enum; declare the set once as typed constants

## Bad

```ts
export function canShip(order: Order): boolean {
	// BAD: the valid statuses exist only as scattered literals, and a typo compiles
	return order.status === 'paid' || order.status === 'packed';
}

export function label(order: Order): string {
	// BAD: same set, spelled again, with 'shiped' waiting to happen
	if (order.status === 'shipped') {
		return 'On its way';
	}

	return order.status === 'paid' ? 'Preparing' : 'Pending';
}
```

```go
func CanShip(o Order) bool {
	// BAD: the valid statuses exist only as scattered literals
	return o.Status == "paid" || o.Status == "packed"
}

func Label(o Order) string {
	// BAD: same set, spelled again by hand
	switch o.Status {
	case "shipped":
		return "On its way"
	case "paid":
		return "Preparing"
	default:
		return "Pending"
	}
}
```

## Good

```ts
export const OrderStatus = {
	PENDING: 'pending',
	PAID: 'paid',
	PACKED: 'packed',
	SHIPPED: 'shipped',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export function canShip(order: Order): boolean {
	return order.status === OrderStatus.PAID || order.status === OrderStatus.PACKED;
}
```

```go
type Status string

const (
	StatusPending Status = "pending"
	StatusPaid    Status = "paid"
	StatusPacked  Status = "packed"
	StatusShipped Status = "shipped"
)

func CanShip(o Order) bool {
	return o.Status == StatusPaid || o.Status == StatusPacked
}
```
