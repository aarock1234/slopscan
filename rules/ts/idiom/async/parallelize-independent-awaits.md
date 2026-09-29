---
severity: minor
detect: judge
falsePositives:
  - >-
    awaits where a later call uses the result of an earlier one, or where order
    matters for side effects such as writes
  - >-
    operations against a resource that must not see concurrent calls, such as a
    single database transaction or a rate-limited API
  - a sequence deliberately kept serial with a comment explaining why
jev:
  threshold: 0.52
---

## Why

Awaiting independent calls one after another makes the total latency the sum of the parts when it could be the slowest one. `Promise.all` runs them together and still gives typed results in order, and `Promise.allSettled` does the same when each result should be handled on its own. Serial awaits are right when one call feeds the next or when the resource cannot take concurrent calls; otherwise they are a slow habit.

## Message

independent awaits run one after another; run them together with `Promise.all`

## Bad

```ts
// BAD: three round trips in sequence that share no data
async function loadProfile(userId: string): Promise<Profile> {
	const user = await getUser(userId);
	const posts = await getPosts(userId);
	const followers = await getFollowers(userId);

	return { user, posts, followers };
}
```

## Good

```ts
async function loadProfile(userId: string): Promise<Profile> {
	const [user, posts, followers] = await Promise.all([getUser(userId), getPosts(userId), getFollowers(userId)]);

	return { user, posts, followers };
}
```

```ts
async function moveFunds(from: string, to: string, amount: number): Promise<void> {
	await debit(from, amount);
	await credit(to, amount);
}
```
