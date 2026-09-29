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
falsePositives:
  - >-
    an HTTP client reading the response to a request it made, such as a function
    taking *http.Response or fetch's Response to decode a payload; the rule is
    about a server's request and response types reaching a service
  - 'a package whose purpose is one protocol, such as an RDAP or WHOIS client'
jev:
  threshold: 0.46
guide:
  - go.function-boundaries
  - go.layers
  - ts.layers
---

## Why

A service function that takes the server framework's incoming request or outgoing response type can only be called by that framework: not from a job, a CLI, another transport, or a unit test without a fake request. It also pulls every HTTP concern, from headers to status codes, into the layer that should only know the domain. Give the service plain typed inputs and return plain typed results; the handler translates at the edge.

## Message

server request or response type in a domain signature; take plain input and return a plain result

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

```go
// a client decoding the response to its own request is protocol code, not a service driven by a server
func parseResponse(resp *http.Response) (*Record, error) {
	defer func() { _ = resp.Body.Close() }()

	var record Record
	if err := json.NewDecoder(resp.Body).Decode(&record); err != nil {
		return nil, fmt.Errorf("decoding rdap response: %w", err)
	}

	return &record, nil
}
```
