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
      inside:
        kind: method_definition
        has:
          field: name
          regex: ^constructor$
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
  go:
    utils:
      param:
        kind: parameter_declaration
    rule:
      kind: parameter_list
      not:
        follows:
          kind: parameter_list
      inside:
        kind: function_declaration
        has:
          field: name
          regex: '^(New|Must)[A-Z]?'
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
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/*_test.go'
guide:
  - go.function-boundaries
  - go.functional-options
  - ts.options
  - ts.readability-and-abstraction-decisions
---

## Why

A constructor with four positional arguments is called as `new Server('0.0.0.0', 8080, true, 30)`, which no reader can decode and no caller can extend without breaking every other caller. Constructors grow more often than any other signature, because every new dependency and setting lands there. Take one options object or config struct with named, defaultable fields, or use functional options in Go.

## Message

constructor takes 4+ positional arguments; take an options object or config struct

## Bad

```ts
export class Server {
	// BAD: new Server('0.0.0.0', 8080, true, 30) is unreadable and cannot grow
	constructor(host: string, port: number, tls: boolean, timeoutSeconds: number) {
		this.address = `${host}:${port}`;
		this.tls = tls;
		this.timeoutSeconds = timeoutSeconds;
	}
}
```

```go
// BAD: NewServer("0.0.0.0", 8080, true, 30*time.Second) is unreadable and cannot grow
func NewServer(host string, port int, tls bool, timeout time.Duration) *Server {
	return &Server{addr: fmt.Sprintf("%s:%d", host, port), tls: tls, timeout: timeout}
}
```

## Good

```ts
type ServerOptions = {
	host: string;
	port: number;
	tls?: boolean;
	timeoutSeconds?: number;
};

export class Server {
	constructor(options: ServerOptions) {
		this.address = `${options.host}:${options.port}`;
		this.tls = options.tls ?? false;
		this.timeoutSeconds = options.timeoutSeconds ?? 30;
	}
}
```

```go
type Config struct {
	Host    string
	Port    int
	TLS     bool
	Timeout time.Duration
}

func NewServer(cfg Config) *Server {
	return &Server{addr: fmt.Sprintf("%s:%d", cfg.Host, cfg.Port), tls: cfg.TLS, timeout: cfg.Timeout}
}
```

```go
type Option func(*Server)

func WithTimeout(d time.Duration) Option {
	return func(s *Server) { s.timeout = d }
}

func NewServer(addr string, opts ...Option) *Server {
	s := &Server{addr: addr, timeout: 30 * time.Second}
	for _, opt := range opts {
		opt(s)
	}

	return s
}
```
