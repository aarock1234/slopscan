---
name: slop-rules
description: Coding rules for TypeScript and Go that slopscan enforces. Use when writing, editing, or reviewing .ts, .tsx, or .go code. Each rule links to its full explanation with good and bad examples.
---

# Slop rules

Code is slop when it is hacky, non-idiomatic, or hard to change later, regardless of who wrote it. Each rule below
names a one-line message; the linked file holds the reasoning and examples. Read a rule file when a message is not
self-explanatory.

## Idiom: write the language the way it is written

| rule | lang | severity | check | guide | message |
| --- | --- | --- | --- | --- | --- |
| [any.idiom.no-section-banners](rules/any/idiom/comments/no-section-banners.md) | any | minor | syntax | `ts.comments` | banner comments signal a file doing too much; split it instead of decorating it |
| [go.idiom.accept-interfaces-return-concrete](rules/go/idiom/interfaces/accept-interfaces-return-concrete.md) | go | minor | judgment | `go.consumer-interfaces` | accept interfaces and return concrete types |
| [go.idiom.acronyms-consistent-case](rules/go/idiom/naming/acronyms-consistent-case.md) | go | minor | syntax | `go.naming` | acronyms keep one case in identifiers: userID, HTTPClient, parseURL |
| [go.idiom.blank-line-before-return](rules/go/idiom/formatting/blank-line-before-return.md) | go | info | judgment | `go.spacing` | return has a blank line before it unless it is the only statement in the block |
| [go.idiom.capitalized-error-message](rules/go/idiom/errors/capitalized-error-message.md) | go | minor | syntax | `go.error-propagation` | error strings are lowercase fragments without trailing punctuation so they read well when wrapped |
| [go.idiom.check-error-immediately](rules/go/idiom/errors/check-error-immediately.md) | go | minor | judgment | `go.error-propagation` | check the error on the line after the call that returned it |
| [go.idiom.consistent-receiver-kind-per-type](rules/go/idiom/receivers/consistent-receiver-kind-per-type.md) | go | minor | judgment | `go.receivers` | type mixes pointer and value receivers; use one kind for every method |
| [go.idiom.constructor-named-new](rules/go/idiom/constructors/constructor-named-new.md) | go | minor | judgment | `go.constructors` | constructor repeats the package name, as in service.NewService; name it New |
| [go.idiom.context-is-first-param](rules/go/idiom/context/context-is-first-param.md) | go | minor | syntax | `go.context` | context.Context is the first parameter |
| [go.idiom.defer-close-explicit-discard](rules/go/idiom/errors/defer-close-explicit-discard.md) | go | minor | syntax | `go.close-errors` | bare defer Close ignores its error silently; discard it with _ = or check it |
| [go.idiom.doc-comment-on-exported](rules/go/idiom/comments/doc-comment-on-exported.md) | go | minor | syntax | `go.doc-comments` | exported declaration has no doc comment |
| [go.idiom.doc-comment-starts-with-name](rules/go/idiom/comments/doc-comment-starts-with-name.md) | go | info | judgment | `go.doc-comments` | doc comment does not start with the name it documents |
| [go.idiom.error-is-last-return-value](rules/go/idiom/errors/error-is-last-return-value.md) | go | minor | syntax | `go.error-propagation` | error is the last return value |
| [go.idiom.import-order-groups](rules/go/idiom/imports/import-order-groups.md) | go | minor | judgment | `go.import-order` | imports are grouped stdlib, external, internal, side-effect with a blank line between groups |
| [go.idiom.interface-er-suffix](rules/go/idiom/naming/interface-er-suffix.md) | go | info | judgment | `go.naming` | single-method interface is named for its action with an er suffix |
| [go.idiom.io-takes-context](rules/go/idiom/context/io-takes-context.md) | go | minor | judgment | `go.context` | function talks to the network, a database, or a subprocess without a context; take ctx and pass it to the call |
| [go.idiom.lowercase-log-messages](rules/go/idiom/logging/lowercase-log-messages.md) | go | minor | syntax | `go.logging` | log messages are lowercase fragments |
| [go.idiom.main-delegates-to-run](rules/go/idiom/structure/main-delegates-to-run.md) | go | minor | judgment | `go.dependency-wiring` `go.shutdown` | main does the wiring itself; move it into run() error so defers run on every exit |
| [go.idiom.multiline-struct-literals](rules/go/idiom/formatting/multiline-struct-literals.md) | go | info | syntax | `go.struct-literals` | struct literal with several fields goes one field per line |
| [go.idiom.mutex-over-channels-for-state](rules/go/idiom/concurrency/mutex-over-channels-for-state.md) | go | minor | judgment | `go.concurrency` | channel used as a lock around plain state; use a sync.Mutex next to the field |
| [go.idiom.new-expr-for-pointer-fields](rules/go/idiom/structs/new-expr-for-pointer-fields.md) | go | info | judgment | `go.optional-fields` | temporary declared only to take its address; use new(expr) |
| [go.idiom.no-log-and-return](rules/go/idiom/errors/no-log-and-return.md) | go | minor | judgment | `go.error-propagation` | error is logged and returned; handle it or propagate it, not both |
| [go.idiom.no-package-name-stutter](rules/go/idiom/naming/no-package-name-stutter.md) | go | minor | judgment | `go.package-names` | exported name repeats the package name; let the package carry the context |
| [go.idiom.no-this-receiver](rules/go/idiom/receivers/no-this-receiver.md) | go | minor | syntax | `go.receiver-names` | receiver named this/self; use a short abbreviation of the type |
| [go.idiom.package-name-single-lowercase-word](rules/go/idiom/naming/package-name-single-lowercase-word.md) | go | minor | syntax | `go.naming` `go.package-names` | package names are one short lowercase word |
| [go.idiom.pointer-vs-value-receiver-choice](rules/go/idiom/receivers/pointer-vs-value-receiver-choice.md) | go | minor | judgment | `go.receivers` | receiver kind does not fit the method: mutation, a large struct, or a sync primitive needs a pointer receiver |
| [go.idiom.prefer-iter-seq](rules/go/idiom/iterators/prefer-iter-seq.md) | go | minor | judgment | `go.iterators` | channel or callback generator; return an iter.Seq so callers can range and break |
| [go.idiom.short-receiver-names](rules/go/idiom/receivers/short-receiver-names.md) | go | minor | syntax | `go.receiver-names` | receiver name longer than two letters; use a short abbreviation of the type |
| [go.idiom.side-effect-imports-own-group](rules/go/idiom/imports/side-effect-imports-own-group.md) | go | minor | syntax | `go.import-order` | side-effect imports go in their own group after the internal imports |
| [go.idiom.use-slog](rules/go/idiom/logging/use-slog.md) | go | minor | syntax | `go.logging` | unstructured log call; use log/slog with a level and key-value attributes |
| [ts.idiom.always-brace-if](rules/ts/idiom/control-flow/always-brace-if.md) | ts | minor | syntax | `ts.guard-clauses` | braceless `if` body; wrap it in a block |
| [ts.idiom.arrow-for-callbacks](rules/ts/idiom/functions/arrow-for-callbacks.md) | ts | minor | syntax | `ts.function-declarations` | `function` expression as a callback; use an arrow function |
| [ts.idiom.as-const-for-literal-config](rules/ts/idiom/constants/as-const-for-literal-config.md) | ts | minor | syntax | `ts.constants` `ts.readonly` | literal const object without `as const`; its values widen to `string` |
| [ts.idiom.boolean-name-question-prefix](rules/ts/idiom/naming/boolean-name-question-prefix.md) | ts | minor | judgment | `ts.naming` | boolean name does not read as a question; prefix with is, has, should, or can |
| [ts.idiom.const-by-default](rules/ts/idiom/variables/const-by-default.md) | ts | minor | judgment | `ts.variables` | `let` is never reassigned; declare it with `const` |
| [ts.idiom.descriptive-identifier-quality](rules/ts/idiom/naming/descriptive-identifier-quality.md) | ts | minor | judgment | `ts.readability-and-abstraction-decisions` | identifier does not describe what it holds or does; use a descriptive name |
| [ts.idiom.doc-comment-above-declaration](rules/ts/idiom/comments/doc-comment-above-declaration.md) | ts | info | judgment | `ts.comments` | declaration documented in a trailing comment; put the comment on the line above |
| [ts.idiom.error-message-lowercase](rules/ts/idiom/errors/error-message-lowercase.md) | ts | minor | syntax | `ts.error-propagation` | error message starts with a capital letter; write it as a lowercase fragment |
| [ts.idiom.export-type-for-types](rules/ts/idiom/imports/export-type-for-types.md) | ts | minor | judgment | `ts.exports` | re-export is a type; use `export type` |
| [ts.idiom.function-declaration-for-top-level](rules/ts/idiom/functions/function-declaration-for-top-level.md) | ts | minor | syntax | `ts.function-declarations` | top-level arrow function; use a `function` declaration |
| [ts.idiom.guard-clauses-early-return](rules/ts/idiom/control-flow/guard-clauses-early-return.md) | ts | minor | judgment | `ts.guard-clauses` | nested conditionals wrap the happy path; check preconditions first and return early |
| [ts.idiom.import-order](rules/ts/idiom/imports/import-order.md) | ts | minor | syntax | `ts.import-order` | imports out of order; `node:` builtins, then external packages, then `@/` modules, then relative paths |
| [ts.idiom.import-type-for-types](rules/ts/idiom/imports/import-type-for-types.md) | ts | minor | judgment | `ts.import-order` | import is only used as a type; use `import type` |
| [ts.idiom.inline-export-at-declaration](rules/ts/idiom/exports/inline-export-at-declaration.md) | ts | minor | syntax | `ts.exports` | export list detached from its declarations; export at the declaration site |
| [ts.idiom.interface-extends-over-intersection](rules/ts/idiom/types/interface-extends-over-intersection.md) | ts | info | judgment | `ts.interface-or-type` | multi-level object hierarchy built from intersections; use `interface extends` |
| [ts.idiom.log-at-boundary-not-every-layer](rules/ts/idiom/errors/log-at-boundary-not-every-layer.md) | ts | minor | judgment | `ts.error-propagation` | catch logs and rethrows in an inner layer; let it propagate and log once at the boundary |
| [ts.idiom.multiline-object-literals](rules/ts/idiom/formatting/multiline-object-literals.md) | ts | info | syntax | `ts.object-literals` | object with several properties on one line; put one property per line |
| [ts.idiom.no-default-export](rules/ts/idiom/exports/no-default-export.md) | ts | minor | syntax | `ts.exports` | default export has no name of its own; use a named export |
| [ts.idiom.no-enum](rules/ts/idiom/constants/no-enum.md) | ts | minor | syntax | `ts.constants` | enum is a runtime construct; use a const object with `as const` and a derived union |
| [ts.idiom.no-nested-ternary](rules/ts/idiom/control-flow/no-nested-ternary.md) | ts | minor | syntax | `ts.ternaries` | nested ternary; use an if chain, a switch, or a lookup |
| [ts.idiom.no-promise-chains](rules/ts/idiom/async/no-promise-chains.md) | ts | minor | syntax | `ts.async-await` | promise chain; use async/await |
| [ts.idiom.no-var](rules/ts/idiom/variables/no-var.md) | ts | minor | syntax | `ts.variables` | `var` is function-scoped and hoisted; use `const` or `let` |
| [ts.idiom.null-vs-undefined-convention](rules/ts/idiom/types/null-vs-undefined-convention.md) | ts | info | judgment | `ts.absence` | null and undefined used interchangeably; undefined for absence, null for a deliberate empty value |
| [ts.idiom.parallelize-independent-awaits](rules/ts/idiom/async/parallelize-independent-awaits.md) | ts | minor | judgment | `ts.parallel-operations` | independent awaits run one after another; run them together with `Promise.all` |
| [ts.idiom.prefer-type-over-interface](rules/ts/idiom/types/prefer-type-over-interface.md) | ts | minor | syntax | `ts.interface-or-type` | plain data shape declared as `interface`; use `type` |
| [ts.idiom.satisfies-over-annotation](rules/ts/idiom/types/satisfies-over-annotation.md) | ts | minor | syntax | `ts.satisfies` | object literal annotated with `Record` loses its keys; use `satisfies` |
| [ts.idiom.screaming-snake-module-constants](rules/ts/idiom/naming/screaming-snake-module-constants.md) | ts | minor | syntax | `ts.naming` | exported literal constant is camelCase; use SCREAMING_SNAKE_CASE |
| [ts.idiom.side-effect-imports-last](rules/ts/idiom/imports/side-effect-imports-last.md) | ts | minor | syntax | `ts.import-order` | side-effect import belongs after all named imports, or carries a comment saying why it must run first |
| [ts.idiom.structured-logging-lowercase](rules/ts/idiom/logging/structured-logging-lowercase.md) | ts | minor | syntax | `ts.logging` | log message starts with a capital letter; write it as a lowercase fragment |
| [ts.idiom.template-literals-over-concat](rules/ts/idiom/strings/template-literals-over-concat.md) | ts | minor | syntax | `ts.template-literals` | string built with `+`; use a template literal |
| [ts.idiom.type-predicates-for-narrowing](rules/ts/idiom/types/type-predicates-for-narrowing.md) | ts | minor | judgment | `ts.type-guards` | type check returns a plain boolean; declare a type predicate so callers narrow without casting |

## Hacky: shortcuts that work today and bite later

| rule | lang | severity | check | guide | message |
| --- | --- | --- | --- | --- | --- |
| [any.hacky.comment-restates-code](rules/any/hacky/comments/comment-restates-code.md) | any | minor | judgment | `go.doc-comments` `ts.comments` | comment restates the code; say why or delete it |
| [any.hacky.copy-paste-block](rules/any/hacky/duplication/copy-paste-block.md) | any | minor | judgment | `go.function-boundaries` `ts.readability-and-abstraction-decisions` | copy-pasted block differs in one identifier; extract a function or loop over the values |
| [any.hacky.debug-print](rules/any/hacky/debugging/debug-print.md) | any | minor | syntax | `go.logging` `ts.logging` `ts.options` | debug print in library code; use the structured logger or remove it |
| [any.hacky.hardcoded-url](rules/any/hacky/config/hardcoded-url.md) | any | minor | syntax | `go.http-usage` | hardcoded url in logic; read the base url from config and build the path on it |
| [any.hacky.magic-number](rules/any/hacky/constants/magic-number.md) | any | minor | judgment |  | magic number in logic; name it as a constant that says what it means |
| [any.hacky.meaning-from-prose](rules/any/hacky/semantics/meaning-from-prose.md) | any | major | judgment | `ts.meaning-as-data` | meaning recovered from a label, an id's spelling, or generated prose; carry it as a field on the record |
| [any.hacky.parallel-arrays](rules/any/hacky/data/parallel-arrays.md) | any | minor | judgment | `ts.related-data` | related data kept in parallel arrays related by index; carry it as one array of records |
| [any.hacky.regex-over-natural-language](rules/any/hacky/semantics/regex-over-natural-language.md) | any | major | judgment | `ts.facts-and-prose` | hand-built grammar decides what free text means; decide the fact in code and validate output structurally |
| [any.hacky.shipped-todo-comment](rules/any/hacky/comments/shipped-todo-comment.md) | any | minor | syntax |  | todo marker shipped in code; do the work or link the tracking issue |
| [any.hacky.sleep-based-sync](rules/any/hacky/concurrency/sleep-based-sync.md) | any | major | syntax | `go.concurrency` `go.retry-contracts` `ts.cancellation-and-deadlines` `ts.retry-safety-and-budgets` | fixed sleep used as synchronization; wait on a promise, channel, or readiness signal, or use a cancellable timer for backoff |
| [any.hacky.stringly-typed-enum](rules/any/hacky/types/stringly-typed-enum.md) | any | minor | judgment | `go.constants` `ts.constants` | string literals used as an enum; declare the set once as typed constants |
| [go.hacky.check-close-error-on-writable](rules/go/hacky/errors/check-close-error-on-writable.md) | go | critical | judgment | `go.close-errors` `go.persistence-contracts` | close error on a written resource is discarded; a failed close can mean lost data |
| [go.hacky.custom-error-type-errors-as](rules/go/hacky/errors/custom-error-type-errors-as.md) | go | minor | syntax | `go.error-types` | type assertion on err misses wrapped errors; use errors.AsType or errors.As |
| [go.hacky.ignored-error-blank](rules/go/hacky/errors/ignored-error-blank.md) | go | major | syntax | `go.close-errors` `go.error-propagation` | returned error discarded with the blank identifier; check it or comment why it cannot matter |
| [go.hacky.json-into-struct-not-map](rules/go/hacky/types/json-into-struct-not-map.md) | go | major | judgment | `go.json-boundaries` | json decoded into a map; declare a struct with tags so fields are checked at compile time |
| [go.hacky.never-pass-nil-context](rules/go/hacky/context/never-pass-nil-context.md) | go | major | syntax | `go.context` | nil passed as a context; use context.Background() or context.TODO() |
| [go.hacky.no-any](rules/go/hacky/types/no-any.md) | go | major | syntax | `go.typed-values` | any erases the type; use a concrete type, a type parameter, or a small interface |
| [go.hacky.no-context-in-struct](rules/go/hacky/context/no-context-in-struct.md) | go | major | syntax | `go.context` | context stored in a struct outlives the request it belongs to; pass ctx per call |
| [go.hacky.no-goroutine-without-wait](rules/go/hacky/concurrency/no-goroutine-without-wait.md) | go | major | judgment | `go.concurrency` `go.errgroup` `go.worker-pool` | goroutine started with nothing waiting for it or collecting its error |
| [go.hacky.no-map-any-any](rules/go/hacky/types/no-map-any-any.md) | go | major | syntax | `go.type-preferences` | map[any]any is fully untyped; give the map concrete key and value types |
| [go.hacky.no-map-string-any](rules/go/hacky/type-safety/no-map-string-any.md) | go | minor | syntax | `go.json-boundaries` `go.type-preferences` | map[string]any defers every field to runtime; decode into a struct unless the shape is truly dynamic |
| [go.hacky.os-exit-only-in-main](rules/go/hacky/structure/os-exit-only-in-main.md) | go | major | syntax | `go.dependency-wiring` `go.shutdown` | os.Exit outside main skips every defer; return an error and exit from main |
| [go.hacky.package-level-mutable-var](rules/go/hacky/state/package-level-mutable-var.md) | go | minor | syntax |  | package-level mutable collection is shared global state; own it in a struct and pass it in |
| [go.hacky.panic-only-unrecoverable](rules/go/hacky/errors/panic-only-unrecoverable.md) | go | major | syntax | `go.panic` | panic in library code; return an error and let the caller decide |
| [go.hacky.sentinel-errors-with-errors-is](rules/go/hacky/errors/sentinel-errors-with-errors-is.md) | go | minor | syntax | `go.sentinel-errors` | error compared with == misses wrapped errors; use errors.Is |
| [go.hacky.wrap-errors-with-w](rules/go/hacky/errors/wrap-errors-with-w.md) | go | minor | syntax | `go.error-propagation` | fmt.Errorf with %v drops the error chain; wrap with %w unless hiding the cause is deliberate |
| [ts.hacky.catch-param-typed-unknown](rules/ts/hacky/errors/catch-param-typed-unknown.md) | ts | major | syntax | `ts.error-propagation` `ts.result-pattern` | catch parameter treated as `Error` without a check; keep it `unknown` and narrow with `instanceof` |
| [ts.hacky.custom-error-class-instanceof](rules/ts/hacky/errors/custom-error-class-instanceof.md) | ts | minor | syntax | `ts.error-classes` | branching on error message text; throw a custom error class and check `instanceof` |
| [ts.hacky.empty-catch](rules/ts/hacky/errors/empty-catch.md) | ts | critical | syntax | `ts.error-propagation` | empty catch swallows the error; handle it, rethrow with context, or let it propagate |
| [ts.hacky.env-read-outside-config](rules/ts/hacky/config/env-read-outside-config.md) | ts | minor | syntax | `ts.boundary-and-domain-contracts` `ts.project-structure` | environment read outside the config module; validate env once and pass typed config |
| [ts.hacky.exported-let](rules/ts/hacky/state/exported-let.md) | ts | minor | syntax |  | exported let is global mutable state; expose functions over the state or export a const |
| [ts.hacky.log-and-swallow](rules/ts/hacky/errors/log-and-swallow.md) | ts | major | syntax | `ts.error-propagation` | catch only logs and continues; rethrow with context or return an explicit failure |
| [ts.hacky.no-double-assertion](rules/ts/hacky/type-safety/no-double-assertion.md) | ts | major | syntax | `ts.boundary-and-domain-contracts` `ts.typed-values` | double assertion through `unknown` bypasses all checking; validate or narrow instead |
| [ts.hacky.no-explicit-any](rules/ts/hacky/type-safety/no-explicit-any.md) | ts | major | syntax | `ts.json-boundaries` `ts.type-preferences` `ts.typed-values` | `any` disables type checking; use a real type, a generic, or `unknown` |
| [ts.hacky.no-floating-promises](rules/ts/hacky/async/no-floating-promises.md) | ts | major | judgment | `ts.async-await` | promise is neither awaited nor returned; its rejection is lost |
| [ts.hacky.no-non-null-assertion](rules/ts/hacky/type-safety/no-non-null-assertion.md) | ts | major | syntax | `ts.indexed-access` `ts.non-null-assertions` | non-null assertion trades a compile-time check for a runtime crash; narrow or throw |
| [ts.hacky.no-unchecked-type-assertion](rules/ts/hacky/type-safety/no-unchecked-type-assertion.md) | ts | major | judgment | `ts.boundary-and-domain-contracts` `ts.branded-types` `ts.type-guards` | type assertion on unvalidated data; validate with a schema or a type guard instead |
| [ts.hacky.nullish-coalescing-over-or](rules/ts/hacky/operators/nullish-coalescing-over-or.md) | ts | minor | syntax | `ts.absence` `ts.options` | `||` with a default replaces 0, empty string, and false; use `??` |
| [ts.hacky.throw-typed-error-with-context](rules/ts/hacky/errors/throw-typed-error-with-context.md) | ts | minor | judgment | `ts.error-classes` `ts.error-propagation` | error crosses a boundary or callers branch on it; throw a typed error that carries context |
| [ts.hacky.validate-parsed-json](rules/ts/hacky/type-safety/validate-parsed-json.md) | ts | major | syntax | `ts.boundary-and-domain-contracts` `ts.json-boundaries` | `JSON.parse` result cast to a type without validation; parse it through a schema |

## Future-proof: keep the next change small

| rule | lang | severity | check | guide | message |
| --- | --- | --- | --- | --- | --- |
| [any.futureproof.boolean-positional-param](rules/any/futureproof/params/boolean-positional-param.md) | any | minor | syntax | `go.function-boundaries` `ts.options` `ts.readability-and-abstraction-decisions` | boolean positional parameter; use an options object or two functions |
| [any.futureproof.dead-export](rules/any/futureproof/exports/dead-export.md) | any | minor | judgment | `ts.smallest-model` | exported symbol is referenced nowhere; delete it or make it private |
| [any.futureproof.fallback-hides-persistence-failure](rules/any/futureproof/errors/fallback-hides-persistence-failure.md) | any | critical | judgment | `go.context` `go.persistence-contracts` `go.transactions` `ts.responsibilities` `ts.retry-safety-and-budgets` | one catch covers computing and persisting, so a storage error selects a different result; separate the two |
| [any.futureproof.framework-type-in-domain](rules/any/futureproof/layering/framework-type-in-domain.md) | any | major | judgment | `go.function-boundaries` `go.layers` `ts.layers` | server request or response type in a domain signature; take plain input and return a plain result |
| [any.futureproof.logic-in-handler](rules/any/futureproof/layering/logic-in-handler.md) | any | major | judgment | `go.function-boundaries` `go.layers` `ts.durable-work` `ts.layers` | business logic or expensive work inside an http handler; move it to a service or workflow the handler calls |
| [any.futureproof.pass-through-wrapper](rules/any/futureproof/abstraction/pass-through-wrapper.md) | any | minor | judgment | `go.function-boundaries` `go.layers` `ts.readability-and-abstraction-decisions` | pass-through wrapper forwards its arguments unchanged; call the target directly |
| [any.futureproof.positional-config-args](rules/any/futureproof/params/positional-config-args.md) | any | minor | syntax | `go.function-boundaries` `go.functional-options` `ts.options` `ts.readability-and-abstraction-decisions` | constructor takes 4+ positional arguments; take an options object or config struct |
| [any.futureproof.single-caller-helper](rules/any/futureproof/abstraction/single-caller-helper.md) | any | minor | judgment | `go.function-boundaries` `ts.readability-and-abstraction-decisions` | single-use helper adds indirection without removing duplication |
| [any.futureproof.single-impl-interface](rules/any/futureproof/abstraction/single-impl-interface.md) | any | minor | judgment | `go.consumer-interfaces` `go.function-boundaries` `ts.abstract-classes` `ts.readability-and-abstraction-decisions` | interface has a single implementation and no test double; use the concrete type until a second one exists |
| [any.futureproof.test-asserts-implementation](rules/any/futureproof/testing/test-asserts-implementation.md) | any | minor | judgment |  | test asserts on internals; assert on observable behavior instead |
| [any.futureproof.wide-function](rules/any/futureproof/structure/wide-function.md) | any | minor | syntax | `go.function-boundaries` `ts.philosophy` `ts.readability-and-abstraction-decisions` | function takes more than 5 parameters; group them into an options object or struct |
| [go.futureproof.compile-time-impl-assertion](rules/go/futureproof/interfaces/compile-time-impl-assertion.md) | go | info | judgment | `go.interface-assertions` | type meant to satisfy an interface is not checked; add var _ Iface = (*T)(nil) |
| [go.futureproof.define-interfaces-at-consumer](rules/go/futureproof/interfaces/define-interfaces-at-consumer.md) | go | minor | judgment | `go.consumer-interfaces` `go.layers` | interface declared beside its implementation; define it where it is consumed |
| [go.futureproof.generics-over-any](rules/go/futureproof/types/generics-over-any.md) | go | minor | judgment | `go.typed-values` | interface plus assertions where a type parameter would keep the caller's type |
| [go.futureproof.keep-interfaces-small](rules/go/futureproof/interfaces/keep-interfaces-small.md) | go | minor | syntax | `go.consumer-interfaces` `go.interface-composition` `go.philosophy` | interface with five or more methods; split it and compose smaller interfaces |
| [go.futureproof.no-utils-helpers-common-package](rules/go/futureproof/naming/no-utils-helpers-common-package.md) | go | minor | syntax | `go.package-names` | package named as a grab-bag; name it after the concept it owns |
| [go.futureproof.string-enums-when-serialized](rules/go/futureproof/constants/string-enums-when-serialized.md) | go | minor | judgment | `go.constants` | iota enum is serialized as a bare integer; back it with a string |
| [go.futureproof.typed-constants-for-enums](rules/go/futureproof/constants/typed-constants-for-enums.md) | go | minor | judgment | `go.constants` | related constants form an enum but have no named type; declare one |
| [go.futureproof.zero-value-usable](rules/go/futureproof/structs/zero-value-usable.md) | go | minor | judgment | `go.zero-values` | zero value panics on first use; make the type usable without a constructor |
| [ts.futureproof.colocate-zod-schemas](rules/ts/futureproof/structure/colocate-zod-schemas.md) | ts | info | judgment | `ts.project-structure` | schema lives away from the code that uses it; colocate it with its consumer |
| [ts.futureproof.composition-over-abstract-base](rules/ts/futureproof/classes/composition-over-abstract-base.md) | ts | minor | judgment | `ts.abstract-classes` | abstract base class used for code sharing; prefer a shared function or injected dependency |
| [ts.futureproof.duplicated-type-shape](rules/ts/futureproof/types/duplicated-type-shape.md) | ts | major | judgment | `ts.boundary-and-domain-contracts` `ts.one-definition` `ts.schema-first` | type or schema restates a shape that is already defined; derive it from the one definition |
| [ts.futureproof.enum-values-from-const-object](rules/ts/futureproof/zod/enum-values-from-const-object.md) | ts | minor | syntax | `ts.zod-enums` | `z.enum` repeats the values of a const object in this file; pass the const object to `z.enum` |
| [ts.futureproof.exhaustive-switch-never-check](rules/ts/futureproof/types/exhaustive-switch-never-check.md) | ts | minor | judgment | `ts.exhaustive-switch` | switch over a union without a `never` check; new variants will fall through silently |
| [ts.futureproof.explicit-return-type-on-exports](rules/ts/futureproof/functions/explicit-return-type-on-exports.md) | ts | minor | syntax | `ts.return-types` | exported function has no return type; declare it so the contract cannot drift |
| [ts.futureproof.illegal-states-representable](rules/ts/futureproof/types/illegal-states-representable.md) | ts | major | judgment | `ts.legal-states` | legal combinations of fields or outcomes live in a comment or a boolean; model them as a discriminated union |
| [ts.futureproof.no-z-native-enum](rules/ts/futureproof/zod/no-z-native-enum.md) | ts | minor | syntax | `ts.zod` `ts.zod-enums` | `z.nativeEnum` is deprecated; use `z.enum` over the values of a const object |
| [ts.futureproof.prompt-in-code](rules/ts/futureproof/prompts/prompt-in-code.md) | ts | minor | judgment | `ts.prompt-files` | model instructions authored as string constants; put them in a prompt file loaded with validated placeholders |
| [ts.futureproof.readonly-for-immutable-data](rules/ts/futureproof/types/readonly-for-immutable-data.md) | ts | info | judgment | `ts.readonly` | data that is never mutated is typed as mutable; mark it `readonly` |
| [ts.futureproof.schema-first-infer-type](rules/ts/futureproof/zod/schema-first-infer-type.md) | ts | minor | judgment | `ts.one-definition` `ts.schema-first` `ts.zod` | hand-written type duplicates a schema; derive it with `z.infer` |
