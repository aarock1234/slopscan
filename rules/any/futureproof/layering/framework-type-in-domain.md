---
severity: major
detect: judge
ignore:
  - '**/handlers/**'
  - '**/handler/**'
  - '**/api/**'
  - '**/routes/**'
  - '**/router/**'
  - '**/controllers/**'
  - '**/middleware/**'
  - '**/transport/**'
  - '**/http/**'
  - '**/*.handler.ts'
  - '**/*.controller.ts'
  - '**/*.route.ts'
  - '**/main.go'
  - '**/cmd/**'
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/*_test.go'
jev:
  threshold: 0.49
---

## Why

A service function that takes the framework's request or response type can only be called by that framework: not from a job, a CLI, another transport, or a unit test without a fake request. It also pulls every HTTP concern, from headers to status codes, into the layer that should only know the domain. Give the service plain typed inputs and return plain typed results; the handler translates at the edge.

## Message

http framework type in a domain signature; take plain input and return a plain result

## Bad

```ts
export class OrderService {
	// BAD: the service can only be driven by express
	async create(req: Request, res: Response): Promise<void> {
		const input = createOrderSchema.parse(req.body);
		const order = await this.repo.insert(input);
		res.status(201).json(order);
	}
}
```

```go
// BAD: the service can only be driven by net/http
func (s *OrderService) Create(w http.ResponseWriter, r *http.Request) {
	var in CreateOrderInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	order, err := s.repo.Insert(r.Context(), in)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, order)
}
```

## Good

```ts
export class OrderService {
	async create(input: CreateOrderInput): Promise<Order> {
		return this.repo.insert(input);
	}
}
```

```go
func (s *OrderService) Create(ctx context.Context, in CreateOrderInput) (Order, error) {
	order, err := s.repo.Insert(ctx, in)
	if err != nil {
		return Order{}, fmt.Errorf("inserting order: %w", err)
	}

	return order, nil
}
```
