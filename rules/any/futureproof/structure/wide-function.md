---
severity: minor
detect: ast
ast:
  ts:
    utils:
      param:
        any:
          - kind: required_parameter
          - kind: optional_parameter
    rule:
      kind: formal_parameters
      has:
        matches: param
        follows:
          matches: param
          stopBy: end
          follows:
            matches: param
            stopBy: end
            follows:
              matches: param
              stopBy: end
              follows:
                matches: param
                stopBy: end
                follows:
                  matches: param
                  stopBy: end
  go:
    utils:
      param:
        kind: parameter_declaration
    rule:
      kind: parameter_list
      not:
        follows:
          kind: parameter_list
      has:
        matches: param
        follows:
          matches: param
          stopBy: end
          follows:
            matches: param
            stopBy: end
            follows:
              matches: param
              stopBy: end
              follows:
                matches: param
                stopBy: end
                follows:
                  matches: param
                  stopBy: end
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/*_test.go'
guide:
  - go.function-boundaries
  - ts.philosophy
  - ts.readability-and-abstraction-decisions
---

## Why

A function with six or more parameters is doing several jobs, and each new requirement adds another positional argument that is easy to swap and impossible to read at the call site. Group related parameters into a typed options object or struct so every value is named where it is passed and optional ones can be omitted. Length alone is not the signal: extract a function when its name explains a step or establishes a useful boundary, not to satisfy a line count.

## Message

function takes more than 5 parameters; group them into an options object or struct

## Bad

```ts
// BAD: six positional arguments nobody can order from memory
export function createInvoice(
	customerId: string,
	items: LineItem[],
	currency: string,
	dueDate: Date,
	notes: string,
	sendEmail: boolean
): Invoice {
	return build(customerId, items, currency, dueDate, notes, sendEmail);
}
```

```go
// BAD: six positional arguments nobody can order from memory
func CreateInvoice(customerID string, items []LineItem, currency string, dueDate time.Time, notes string, sendEmail bool) Invoice {
	return build(customerID, items, currency, dueDate, notes, sendEmail)
}
```

## Good

```ts
type CreateInvoiceInput = {
	customerId: string;
	items: LineItem[];
	currency: string;
	dueDate: Date;
	notes?: string;
	sendEmail?: boolean;
};

export function createInvoice(input: CreateInvoiceInput): Invoice {
	return build(input);
}
```

```go
type CreateInvoiceInput struct {
	CustomerID string
	Items      []LineItem
	Currency   string
	DueDate    time.Time
	Notes      string
	SendEmail  bool
}

func CreateInvoice(in CreateInvoiceInput) Invoice {
	return build(in)
}
```
