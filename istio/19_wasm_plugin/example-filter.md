# WasmPlugin – Minimal Rust Filter Example

A minimal proxy-wasm filter in Rust that injects a custom response header.

## Project structure

```
my-filter/
├── Cargo.toml
├── src/
│   └── lib.rs
└── Dockerfile
```

## Cargo.toml

```toml
[package]
name = "my-filter"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
proxy-wasm = "0.2"
log = "0.4"
```

## src/lib.rs

```rust
use proxy_wasm::traits::*;
use proxy_wasm::types::*;

proxy_wasm::main! {{
    proxy_wasm::set_log_level(LogLevel::Trace);
    proxy_wasm::set_http_context(|context_id, _root_context_id| -> Box<dyn HttpContext> {
        Box::new(MyFilter { context_id })
    });
}}

struct MyFilter {
    context_id: u32,
}

impl Context for MyFilter {}

impl HttpContext for MyFilter {
    fn on_http_response_headers(&mut self, _num_headers: usize, _end_of_stream: bool) -> Action {
        // Inject a custom header on every response
        self.add_http_response_header("x-wasm-filter", "active");
        Action::Continue
    }
}
```

## Dockerfile

```dockerfile
FROM rust:1.75 AS builder
RUN rustup target add wasm32-wasi
WORKDIR /app
COPY . .
RUN cargo build --target wasm32-wasi --release

FROM scratch
COPY --from=builder /app/target/wasm32-wasi/release/my_filter.wasm /plugin.wasm
```

## Build & publish

```bash
docker buildx build --platform linux/amd64 -t ghcr.io/my-org/my-filter:v1 .
docker push ghcr.io/my-org/my-filter:v1
```

## Apply

```yaml
apiVersion: extensions.istio.io/v1alpha1
kind: WasmPlugin
metadata:
  name: my-filter
  namespace: istio-demo
spec:
  selector:
    matchLabels:
      app: backend
  url: oci://ghcr.io/my-org/my-filter:v1
  phase: STATS
```

## Verify

```bash
kubectl exec -n istio-demo <frontend-pod> -- curl -v http://backend:9090 2>&1 | grep x-wasm-filter
# Expected: < x-wasm-filter: active
```
