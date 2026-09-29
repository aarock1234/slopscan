---
severity: major
detect: judge
falsePositives:
  - >-
    parsing and validating the request, and mapping a service result or error to
    a status code, which is the handler's job
  - a single guard clause such as checking authentication before delegating
  - 'a small script, example, or prototype with no service layer at all'
  - 'middleware, which operates on the request itself rather than on domain state'
jev:
  threshold: 0.51
---

## Why

Business rules written inside an HTTP handler can only be reached through HTTP, so they cannot be reused by a CLI, a queue consumer, or a scheduled job, and they can only be tested by spinning up requests. The handler grows with every rule until nobody can see the request handling for the logic. Keep the handler to parsing input, calling one service function, and mapping the result to a response; the rules live in the service where they can be called from anywhere. Expensive work is the worst case: several model or network calls made inside the request, before a durable ID exists, are lost on a restart and give the caller nothing to poll, so the handler should mint the ID and start the workflow that does the work.

## Message

business logic or expensive work inside an http handler; move it to a service or workflow the handler calls

## Bad

```ts
router.post('/checkout', async (req, res) => {
	const cart = await carts.find(req.session.cartId);
	// BAD: pricing, stock, and persistence rules live in the route
	let total = 0;
	for (const line of cart.lines) {
		const product = await products.find(line.productId);
		if (product.stock < line.quantity) {
			return res.status(409).json({ error: 'out of stock' });
		}
		total += product.price * line.quantity;
	}
	if (cart.coupon) {
		total = total * (1 - cart.coupon.percent / 100);
	}
	const order = await orders.insert({ cartId: cart.id, total });
	res.status(201).json(order);
});
```

```go
func (h *Handler) Checkout(w http.ResponseWriter, r *http.Request) {
	cart, err := h.carts.Find(r.Context(), sessionCartID(r))
	if err != nil {
		http.Error(w, "cart not found", http.StatusNotFound)
		return
	}
	// BAD: pricing, stock, and persistence rules live in the handler
	var total int
	for _, line := range cart.Lines {
		product, err := h.products.Find(r.Context(), line.ProductID)
		if err != nil || product.Stock < line.Quantity {
			http.Error(w, "out of stock", http.StatusConflict)
			return
		}
		total += product.Price * line.Quantity
	}
	if cart.Coupon != nil {
		total = total * (100 - cart.Coupon.Percent) / 100
	}
	order, err := h.orders.Insert(r.Context(), Order{CartID: cart.ID, Total: total})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, order)
}
```

## Good

```ts
router.post('/checkout', async (req, res) => {
	const result = await checkout.run({ cartId: req.session.cartId });

	if (!result.ok) {
		return res.status(statusFor(result.error)).json({ error: result.error.message });
	}

	res.status(201).json(result.order);
});
```

```go
func (h *Handler) Checkout(w http.ResponseWriter, r *http.Request) {
	order, err := h.checkout.Run(r.Context(), checkout.Input{CartID: sessionCartID(r)})
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, order)
}
```
