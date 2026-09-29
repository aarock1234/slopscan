---
name: slop-rules
description: Coding rules for TypeScript and Go that slopscan enforces. Use when writing, editing, or reviewing .ts, .tsx, or .go code. Each rule links to its full explanation with good and bad examples.
---

# Slop rules

Code is slop when it is hacky, non-idiomatic, or hard to change later, regardless of who wrote it. Each rule below
names a one-line message; the linked file holds the reasoning and examples. Read a rule file when a message is not
self-explanatory.

## Idiom: write the language the way it is written

| rule | lang | severity | check | message |
| --- | --- | --- | --- | --- |
| [any.idiom.no-section-banners](rules/any/idiom/comments/no-section-banners.md) | any | minor | syntax | banner comments signal a file doing too much; split it instead of decorating it |
| [go.idiom.accept-interfaces-return-concrete](rules/go/idiom/interfaces/accept-interfaces-return-concrete.md) | go | minor | judgment | accept interfaces and return concrete types |
| [go.idiom.acronyms-consistent-case](rules/go/idiom/naming/acronyms-consistent-case.md) | go | minor | syntax | acronyms keep one case in identifiers: userID, HTTPClient, parseURL |
| [go.idiom.blank-line-before-return](rules/go/idiom/formatting/blank-line-before-return.md) | go | info | judgment | return has a blank line before it unless it is the only statement in the block |
| [go.idiom.capitalized-error-message](rules/go/idiom/errors/capitalized-error-message.md) | go | minor | syntax | error strings are lowercase fragments so they read well when wrapped |
| [go.idiom.check-error-immediately](rules/go/idiom/errors/check-error-immediately.md) | go | minor | judgment | check the error on the line after the call that returned it |
| [go.idiom.consistent-receiver-kind-per-type](rules/go/idiom/receivers/consistent-receiver-kind-per-type.md) | go | minor | judgment | type mixes pointer and value receivers; use one kind for every method |
| [go.idiom.constructor-named-new](rules/go/idiom/constructors/constructor-named-new.md) | go | minor | judgment | constructor repeats the package name, as in service.NewService; name it New |
| [go.idiom.context-is-first-param](rules/go/idiom/context/context-is-first-param.md) | go | minor | syntax | context.Context is the first parameter |
| [go.idiom.defer-close-explicit-discard](rules/go/idiom/errors/defer-close-explicit-discard.md) | go | minor | syntax | bare defer Close ignores its error silently; discard it with _ = or check it |
| [go.idiom.doc-comment-on-exported](rules/go/idiom/comments/doc-comment-on-exported.md) | go | minor | syntax | exported declaration has no doc comment |
| [go.idiom.doc-comment-starts-with-name](rules/go/idiom/comments/doc-comment-starts-with-name.md) | go | info | judgment | doc comment does not start with the name it documents |
| [go.idiom.error-is-last-return-value](rules/go/idiom/errors/error-is-last-return-value.md) | go | minor | syntax | error is the last return value |
| [go.idiom.import-order-groups](rules/go/idiom/imports/import-order-groups.md) | go | minor | judgment | imports are grouped stdlib, external, internal, side-effect with a blank line between groups |
| [go.idiom.interface-er-suffix](rules/go/idiom/naming/interface-er-suffix.md) | go | info | judgment | single-method interface is named for its action with an er suffix |
| [go.idiom.io-takes-context](rules/go/idiom/context/io-takes-context.md) | go | minor | judgment | function talks to the network, a database, or a subprocess without a context; take ctx and pass it to the call |
| [go.idiom.lowercase-log-messages](rules/go/idiom/logging/lowercase-log-messages.md) | go | minor | syntax | log messages are lowercase fragments |
| [go.idiom.main-delegates-to-run](rules/go/idiom/structure/main-delegates-to-run.md) | go | minor | judgment | main does the wiring itself; move it into run() error so defers run on every exit |
| [go.idiom.multiline-struct-literals](rules/go/idiom/formatting/multiline-struct-literals.md) | go | info | syntax | struct literal with several fields goes one field per line |
| [go.idiom.mutex-over-channels-for-state](rules/go/idiom/concurrency/mutex-over-channels-for-state.md) | go | minor | judgment | channel used as a lock around plain state; use a sync.Mutex next to the field |
| [go.idiom.new-expr-for-pointer-fields](rules/go/idiom/structs/new-expr-for-pointer-fields.md) | go | info | judgment | temporary declared only to take its address; use new(expr) |
| [go.idiom.no-log-and-return](rules/go/idiom/errors/no-log-and-return.md) | go | minor | judgment | error is logged and returned; handle it or propagate it, not both |
| [go.idiom.no-package-name-stutter](rules/go/idiom/naming/no-package-name-stutter.md) | go | minor | judgment | exported name repeats the package name; let the package carry the context |
| [go.idiom.no-this-receiver](rules/go/idiom/receivers/no-this-receiver.md) | go | minor | syntax | receiver named this/self; use a short abbreviation of the type |
| [go.idiom.package-name-single-lowercase-word](rules/go/idiom/naming/package-name-single-lowercase-word.md) | go | minor | syntax | package names are one short lowercase word |
| [go.idiom.pointer-vs-value-receiver-choice](rules/go/idiom/receivers/pointer-vs-value-receiver-choice.md) | go | minor | judgment | receiver kind does not fit the method: mutation or a large struct needs a pointer receiver |
| [go.idiom.prefer-iter-seq](rules/go/idiom/iterators/prefer-iter-seq.md) | go | minor | judgment | channel or callback generator; return an iter.Seq so callers can range and break |
| [go.idiom.short-receiver-names](rules/go/idiom/receivers/short-receiver-names.md) | go | minor | syntax | receiver name longer than two letters; use a short abbreviation of the type |
| [go.idiom.side-effect-imports-own-group](rules/go/idiom/imports/side-effect-imports-own-group.md) | go | minor | syntax | side-effect imports go in their own group after the internal imports |
| [go.idiom.use-slog](rules/go/idiom/logging/use-slog.md) | go | minor | syntax | unstructured log call; use log/slog with a level and key-value attributes |
| [ts.idiom.always-brace-if](rules/ts/idiom/control-flow/always-brace-if.md) | ts | minor | syntax | braceless `if` body; wrap it in a block |
| [ts.idiom.arrow-for-callbacks](rules/ts/idiom/functions/arrow-for-callbacks.md) | ts | minor | syntax | `function` expression as a callback; use an arrow function |
| [ts.idiom.as-const-for-literal-config](rules/ts/idiom/constants/as-const-for-literal-config.md) | ts | minor | syntax | literal const object without `as const`; its values widen to `string` |
| [ts.idiom.boolean-name-question-prefix](rules/ts/idiom/naming/boolean-name-question-prefix.md) | ts | minor | judgment | boolean name does not read as a question; prefix with is, has, should, or can |
| [ts.idiom.const-by-default](rules/ts/idiom/variables/const-by-default.md) | ts | minor | judgment | `let` is never reassigned; declare it with `const` |
| [ts.idiom.descriptive-identifier-quality](rules/ts/idiom/naming/descriptive-identifier-quality.md) | ts | minor | judgment | identifier does not describe what it holds or does; use a descriptive name |
| [ts.idiom.doc-comment-above-declaration](rules/ts/idiom/comments/doc-comment-above-declaration.md) | ts | info | judgment | declaration documented in a trailing comment; put the comment on the line above |
| [ts.idiom.error-message-lowercase](rules/ts/idiom/errors/error-message-lowercase.md) | ts | minor | syntax | error message starts with a capital letter; write it as a lowercase fragment |
| [ts.idiom.export-type-for-types](rules/ts/idiom/imports/export-type-for-types.md) | ts | minor | judgment | re-export is a type; use `export type` |
| [ts.idiom.function-declaration-for-top-level](rules/ts/idiom/functions/function-declaration-for-top-level.md) | ts | minor | syntax | top-level arrow function; use a `function` declaration |
| [ts.idiom.guard-clauses-early-return](rules/ts/idiom/control-flow/guard-clauses-early-return.md) | ts | minor | judgment | nested conditionals wrap the happy path; check preconditions first and return early |
| [ts.idiom.import-order](rules/ts/idiom/imports/import-order.md) | ts | minor | syntax | imports out of order; external packages, then `@/` modules, then relative paths |
| [ts.idiom.import-type-for-types](rules/ts/idiom/imports/import-type-for-types.md) | ts | minor | judgment | import is only used as a type; use `import type` |
| [ts.idiom.inline-export-at-declaration](rules/ts/idiom/exports/inline-export-at-declaration.md) | ts | minor | syntax | export list detached from its declarations; export at the declaration site |
| [ts.idiom.interface-extends-over-intersection](rules/ts/idiom/types/interface-extends-over-intersection.md) | ts | info | judgment | object shape extended with an intersection; use `interface extends` |
| [ts.idiom.log-at-boundary-not-every-layer](rules/ts/idiom/errors/log-at-boundary-not-every-layer.md) | ts | minor | judgment | catch logs and rethrows in an inner layer; let it propagate and log once at the boundary |
| [ts.idiom.multiline-object-literals](rules/ts/idiom/formatting/multiline-object-literals.md) | ts | info | syntax | object with several properties on one line; put one property per line |
| [ts.idiom.no-default-export](rules/ts/idiom/exports/no-default-export.md) | ts | minor | syntax | default export has no name of its own; use a named export |
| [ts.idiom.no-enum](rules/ts/idiom/constants/no-enum.md) | ts | minor | syntax | enum is a runtime construct; use a const object with `as const` and a derived union |
| [ts.idiom.no-nested-ternary](rules/ts/idiom/control-flow/no-nested-ternary.md) | ts | minor | syntax | nested ternary; use an if chain, a switch, or a lookup |
| [ts.idiom.no-promise-chains](rules/ts/idiom/async/no-promise-chains.md) | ts | minor | syntax | promise chain; use async/await |
| [ts.idiom.no-var](rules/ts/idiom/variables/no-var.md) | ts | minor | syntax | `var` is function-scoped and hoisted; use `const` or `let` |
| [ts.idiom.null-vs-undefined-convention](rules/ts/idiom/types/null-vs-undefined-convention.md) | ts | info | judgment | null and undefined used interchangeably; undefined for absence, null for a deliberate empty value |
| [ts.idiom.parallelize-independent-awaits](rules/ts/idiom/async/parallelize-independent-awaits.md) | ts | minor | judgment | independent awaits run one after another; run them together with `Promise.all` |
| [ts.idiom.prefer-type-over-interface](rules/ts/idiom/types/prefer-type-over-interface.md) | ts | minor | syntax | plain data shape declared as `interface`; use `type` |
| [ts.idiom.satisfies-over-annotation](rules/ts/idiom/types/satisfies-over-annotation.md) | ts | minor | syntax | object literal annotated with `Record` loses its keys; use `satisfies` |
| [ts.idiom.screaming-snake-module-constants](rules/ts/idiom/naming/screaming-snake-module-constants.md) | ts | minor | syntax | module-level literal constant is camelCase; use SCREAMING_SNAKE_CASE |
| [ts.idiom.side-effect-imports-last](rules/ts/idiom/imports/side-effect-imports-last.md) | ts | minor | syntax | side-effect import belongs after all named imports |
| [ts.idiom.structured-logging-lowercase](rules/ts/idiom/logging/structured-logging-lowercase.md) | ts | minor | syntax | log message starts with a capital letter; write it as a lowercase fragment |
| [ts.idiom.template-literals-over-concat](rules/ts/idiom/strings/template-literals-over-concat.md) | ts | minor | syntax | string built with `+`; use a template literal |
| [ts.idiom.type-predicates-for-narrowing](rules/ts/idiom/types/type-predicates-for-narrowing.md) | ts | minor | judgment | type check returns a plain boolean; declare a type predicate so callers narrow without casting |

## Hacky: shortcuts that work today and bite later

| rule | lang | severity | check | message |
| --- | --- | --- | --- | --- |
| [any.hacky.comment-restates-code](rules/any/hacky/comments/comment-restates-code.md) | any | minor | judgment | comment restates the code; say why or delete it |
| [any.hacky.copy-paste-block](rules/any/hacky/duplication/copy-paste-block.md) | any | minor | judgment | copy-pasted block differs in one identifier; extract a function or loop over the values |
| [any.hacky.debug-print](rules/any/hacky/debugging/debug-print.md) | any | minor | syntax | debug print in library code; use the structured logger or remove it |
| [any.hacky.hardcoded-url](rules/any/hacky/config/hardcoded-url.md) | any | minor | syntax | hardcoded url in logic; read the base url from config and build the path on it |
| [any.hacky.magic-number](rules/any/hacky/constants/magic-number.md) | any | minor | judgment | magic number in logic; name it as a constant that says what it means |
| [any.hacky.meaning-from-prose](rules/any/hacky/semantics/meaning-from-prose.md) | any | major | judgment | meaning recovered from a label, an id's spelling, or generated prose; carry it as a field on the record |
| [any.hacky.parallel-arrays](rules/any/hacky/data/parallel-arrays.md) | any | minor | judgment | related data kept in parallel arrays related by index; carry it as one array of records |
| [any.hacky.regex-over-natural-language](rules/any/hacky/semantics/regex-over-natural-language.md) | any | major | judgment | hand-built grammar decides what free text means; decide the fact in code and validate output structurally |
| [any.hacky.shipped-todo-comment](rules/any/hacky/comments/shipped-todo-comment.md) | any | minor | syntax | todo marker shipped in code; do the work or link the tracking issue |
| [any.hacky.sleep-based-sync](rules/any/hacky/concurrency/sleep-based-sync.md) | any | major | syntax | fixed sleep used as synchronization; wait on a promise, channel, or readiness signal instead |
| [any.hacky.stringly-typed-enum](rules/any/hacky/types/stringly-typed-enum.md) | any | minor | judgment | string literals used as an enum; declare the set once as typed constants |
| [go.hacky.check-close-error-on-writable](rules/go/hacky/errors/check-close-error-on-writable.md) | go | critical | judgment | close error on a written resource is discarded; a failed close can mean lost data |
| [go.hacky.custom-error-type-errors-as](rules/go/hacky/errors/custom-error-type-errors-as.md) | go | minor | syntax | type assertion on err misses wrapped errors; use errors.AsType or errors.As |
| [go.hacky.ignored-error-blank](rules/go/hacky/errors/ignored-error-blank.md) | go | major | syntax | returned error discarded with the blank identifier; check it or comment why it cannot matter |
| [go.hacky.json-into-struct-not-map](rules/go/hacky/types/json-into-struct-not-map.md) | go | major | judgment | json decoded into a map; declare a struct with tags so fields are checked at compile time |
| [go.hacky.never-pass-nil-context](rules/go/hacky/context/never-pass-nil-context.md) | go | major | syntax | nil passed as a context; use context.Background() or context.TODO() |
| [go.hacky.no-any](rules/go/hacky/types/no-any.md) | go | major | syntax | any erases the type; use a concrete type, a type parameter, or a small interface |
| [go.hacky.no-context-in-struct](rules/go/hacky/context/no-context-in-struct.md) | go | major | syntax | context stored in a struct outlives the request it belongs to; pass ctx per call |
| [go.hacky.no-goroutine-without-wait](rules/go/hacky/concurrency/no-goroutine-without-wait.md) | go | major | judgment | goroutine started with nothing waiting for it or collecting its error |
| [go.hacky.no-map-any-any](rules/go/hacky/types/no-map-any-any.md) | go | major | syntax | map[any]any is fully untyped; give the map concrete key and value types |
| [go.hacky.no-map-string-any](rules/go/hacky/type-safety/no-map-string-any.md) | go | major | syntax | map[string]any defers every field to runtime; decode into a struct |
| [go.hacky.os-exit-only-in-main](rules/go/hacky/structure/os-exit-only-in-main.md) | go | major | syntax | os.Exit outside main skips every defer; return an error and exit from main |
| [go.hacky.package-level-mutable-var](rules/go/hacky/state/package-level-mutable-var.md) | go | minor | syntax | package-level mutable collection is shared global state; own it in a struct and pass it in |
| [go.hacky.panic-only-unrecoverable](rules/go/hacky/errors/panic-only-unrecoverable.md) | go | major | syntax | panic in library code; return an error and let the caller decide |
| [go.hacky.sentinel-errors-with-errors-is](rules/go/hacky/errors/sentinel-errors-with-errors-is.md) | go | minor | syntax | error compared with == misses wrapped errors; use errors.Is |
| [go.hacky.wrap-errors-with-w](rules/go/hacky/errors/wrap-errors-with-w.md) | go | major | syntax | fmt.Errorf with %v drops the error chain; wrap with %w |
| [ts.hacky.catch-param-typed-unknown](rules/ts/hacky/errors/catch-param-typed-unknown.md) | ts | major | syntax | catch parameter treated as `Error` without a check; keep it `unknown` and narrow with `instanceof` |
| [ts.hacky.custom-error-class-instanceof](rules/ts/hacky/errors/custom-error-class-instanceof.md) | ts | minor | syntax | branching on error message text; throw a custom error class and check `instanceof` |
| [ts.hacky.empty-catch](rules/ts/hacky/errors/empty-catch.md) | ts | critical | syntax | empty catch swallows the error; handle it, rethrow with context, or let it propagate |
| [ts.hacky.env-read-outside-config](rules/ts/hacky/config/env-read-outside-config.md) | ts | minor | syntax | environment read outside the config module; validate env once and pass typed config |
| [ts.hacky.exported-let](rules/ts/hacky/state/exported-let.md) | ts | minor | syntax | exported let is global mutable state; expose functions over the state or export a const |
| [ts.hacky.log-and-swallow](rules/ts/hacky/errors/log-and-swallow.md) | ts | major | syntax | catch only logs and continues; rethrow with context or return an explicit failure |
| [ts.hacky.no-double-assertion](rules/ts/hacky/type-safety/no-double-assertion.md) | ts | major | syntax | double assertion through `unknown` bypasses all checking; validate or narrow instead |
| [ts.hacky.no-explicit-any](rules/ts/hacky/type-safety/no-explicit-any.md) | ts | major | syntax | `any` disables type checking; use a real type, a generic, or `unknown` |
| [ts.hacky.no-floating-promises](rules/ts/hacky/async/no-floating-promises.md) | ts | major | judgment | promise is neither awaited nor returned; its rejection is lost |
| [ts.hacky.no-non-null-assertion](rules/ts/hacky/type-safety/no-non-null-assertion.md) | ts | major | syntax | non-null assertion trades a compile-time check for a runtime crash; narrow or throw |
| [ts.hacky.no-unchecked-type-assertion](rules/ts/hacky/type-safety/no-unchecked-type-assertion.md) | ts | major | judgment | type assertion on unvalidated data; validate with a schema or a type guard instead |
| [ts.hacky.nullish-coalescing-over-or](rules/ts/hacky/operators/nullish-coalescing-over-or.md) | ts | minor | syntax | `||` with a default replaces 0, empty string, and false; use `??` |
| [ts.hacky.throw-typed-error-with-context](rules/ts/hacky/errors/throw-typed-error-with-context.md) | ts | minor | syntax | bare `Error` with a fixed message; throw a typed error that carries context |
| [ts.hacky.validate-parsed-json](rules/ts/hacky/type-safety/validate-parsed-json.md) | ts | major | syntax | `JSON.parse` result cast to a type without validation; parse it through a schema |

## Future-proof: keep the next change small

| rule | lang | severity | check | message |
| --- | --- | --- | --- | --- |
| [any.futureproof.boolean-positional-param](rules/any/futureproof/params/boolean-positional-param.md) | any | minor | syntax | boolean positional parameter; use an options object or two functions |
| [any.futureproof.dead-export](rules/any/futureproof/exports/dead-export.md) | any | minor | judgment | exported symbol is referenced nowhere; delete it or make it private |
| [any.futureproof.fallback-hides-persistence-failure](rules/any/futureproof/errors/fallback-hides-persistence-failure.md) | any | major | judgment | one catch covers computing and persisting, so a storage error selects a different result; separate the two |
| [any.futureproof.framework-type-in-domain](rules/any/futureproof/layering/framework-type-in-domain.md) | any | major | judgment | server request or response type in a domain signature; take plain input and return a plain result |
| [any.futureproof.logic-in-handler](rules/any/futureproof/layering/logic-in-handler.md) | any | major | judgment | business logic or expensive work inside an http handler; move it to a service or workflow the handler calls |
| [any.futureproof.pass-through-wrapper](rules/any/futureproof/abstraction/pass-through-wrapper.md) | any | minor | judgment | pass-through wrapper forwards its arguments unchanged; call the target directly |
| [any.futureproof.positional-config-args](rules/any/futureproof/params/positional-config-args.md) | any | minor | syntax | constructor takes 4+ positional arguments; take an options object or config struct |
| [any.futureproof.single-caller-helper](rules/any/futureproof/abstraction/single-caller-helper.md) | any | minor | judgment | single-use helper adds indirection without removing duplication |
| [any.futureproof.single-impl-interface](rules/any/futureproof/abstraction/single-impl-interface.md) | any | minor | judgment | interface has a single implementation and no test double; use the concrete type until a second one exists |
| [any.futureproof.test-asserts-implementation](rules/any/futureproof/testing/test-asserts-implementation.md) | any | minor | judgment | test asserts on internals; assert on observable behavior instead |
| [any.futureproof.wide-function](rules/any/futureproof/structure/wide-function.md) | any | minor | syntax | function is too wide: more than 5 parameters or over 60 lines; group parameters into a struct and split the body |
| [go.futureproof.compile-time-impl-assertion](rules/go/futureproof/interfaces/compile-time-impl-assertion.md) | go | info | judgment | type meant to satisfy an interface is not checked; add var _ Iface = (*T)(nil) |
| [go.futureproof.define-interfaces-at-consumer](rules/go/futureproof/interfaces/define-interfaces-at-consumer.md) | go | minor | judgment | interface declared beside its implementation; define it where it is consumed |
| [go.futureproof.generics-over-any](rules/go/futureproof/types/generics-over-any.md) | go | minor | judgment | interface plus assertions where a type parameter would keep the caller's type |
| [go.futureproof.keep-interfaces-small](rules/go/futureproof/interfaces/keep-interfaces-small.md) | go | minor | syntax | interface with five or more methods; split it and compose smaller interfaces |
| [go.futureproof.no-utils-helpers-common-package](rules/go/futureproof/naming/no-utils-helpers-common-package.md) | go | minor | syntax | package named as a grab-bag; name it after the concept it owns |
| [go.futureproof.string-enums-when-serialized](rules/go/futureproof/constants/string-enums-when-serialized.md) | go | minor | judgment | iota enum is serialized as a bare integer; back it with a string |
| [go.futureproof.typed-constants-for-enums](rules/go/futureproof/constants/typed-constants-for-enums.md) | go | minor | judgment | related constants form an enum but have no named type; declare one |
| [go.futureproof.zero-value-usable](rules/go/futureproof/structs/zero-value-usable.md) | go | minor | judgment | zero value panics on first use; make the type usable without a constructor |
| [ts.futureproof.colocate-zod-schemas](rules/ts/futureproof/structure/colocate-zod-schemas.md) | ts | info | judgment | schema lives away from the code that uses it; colocate it with its consumer |
| [ts.futureproof.composition-over-abstract-base](rules/ts/futureproof/classes/composition-over-abstract-base.md) | ts | minor | judgment | abstract base class used for code sharing; prefer a shared function or injected dependency |
| [ts.futureproof.duplicated-type-shape](rules/ts/futureproof/types/duplicated-type-shape.md) | ts | major | judgment | type or schema restates a shape that is already defined; derive it from the one definition |
| [ts.futureproof.enum-values-from-const-object](rules/ts/futureproof/zod/enum-values-from-const-object.md) | ts | minor | syntax | `z.enum` with inline string literals; derive the values from a const object |
| [ts.futureproof.exhaustive-switch-never-check](rules/ts/futureproof/types/exhaustive-switch-never-check.md) | ts | minor | judgment | switch over a union without a `never` check; new variants will fall through silently |
| [ts.futureproof.explicit-return-type-on-exports](rules/ts/futureproof/functions/explicit-return-type-on-exports.md) | ts | minor | syntax | exported function has no return type; declare it so the contract cannot drift |
| [ts.futureproof.illegal-states-representable](rules/ts/futureproof/types/illegal-states-representable.md) | ts | major | judgment | legal combinations of fields or outcomes live in a comment or a boolean; model them as a discriminated union |
| [ts.futureproof.no-z-native-enum](rules/ts/futureproof/zod/no-z-native-enum.md) | ts | minor | syntax | `z.nativeEnum` is deprecated; use `z.enum` over the values of a const object |
| [ts.futureproof.prompt-in-code](rules/ts/futureproof/prompts/prompt-in-code.md) | ts | minor | judgment | model instructions authored as string constants; put them in a prompt file loaded with validated placeholders |
| [ts.futureproof.readonly-for-immutable-data](rules/ts/futureproof/types/readonly-for-immutable-data.md) | ts | info | judgment | data that is never mutated is typed as mutable; mark it `readonly` |
| [ts.futureproof.schema-first-infer-type](rules/ts/futureproof/zod/schema-first-infer-type.md) | ts | minor | judgment | hand-written type duplicates a schema; derive it with `z.infer` |
