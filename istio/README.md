# Istio – Practical Learning Path

9 hands-on lessons covering every major Istio concept, each with a runnable
YAML example and a matching animated visualization in `rabbitmq-tutorials.jsx`
(lessons 17–25 in the 🔷 Istio group).

---

## Prerequisites

```bash
# 1. A Kubernetes cluster (kind is easiest for local)
kind create cluster --name istio-demo

# 2. Install Istio CLI
curl -L https://istio.io/downloadIstio | sh -
export PATH=$PWD/istio-*/bin:$PATH

# 3. Install Istio with demo profile (includes all features for learning)
istioctl install --set profile=demo -y

# 4. Verify installation
istioctl verify-install
kubectl get pods -n istio-system   # All pods should be Running

# 5. Install observability addons (needed for lesson 09)
cd istio/09_observability && bash addons-install.sh
```

---

## Lesson Map

| # | Folder | Concept | Key Resources |
|---|--------|---------|---------------|
| 17 | `01_architecture/` | Sidecar Injection & Architecture | Namespace label, Deployment |
| 18 | `02_traffic_routing/` | VirtualService & DestinationRule | VirtualService, DestinationRule |
| 19 | `03_canary/` | Canary Deployments | Weighted VirtualService |
| 20 | `04_fault_injection/` | Fault Injection | Delay & Abort faults |
| 21 | `05_circuit_breaking/` | Circuit Breaking | Outlier Detection |
| 22 | `06_gateway/` | Ingress Gateway | Gateway, VirtualService |
| 23 | `07_mtls/` | mTLS & PeerAuthentication | PeerAuthentication |
| 24 | `08_authorization/` | Authorization Policy | AuthorizationPolicy |
| 25 | `09_observability/` | Observability | Telemetry, Kiali, Jaeger |

---

## Lesson 01 – Architecture & Sidecar Injection

```bash
cd 01_architecture/

# Create namespace with injection label
kubectl apply -f namespace.yaml

# Deploy frontend + backend (watch for 2/2 READY — app + envoy)
kubectl apply -f deployment.yaml
kubectl get pods -n istio-demo -w

# Confirm sidecar was injected
kubectl describe pod -n istio-demo -l app=frontend | grep -A5 "istio-proxy"

# Watch Envoy intercept live traffic
kubectl exec -n istio-demo -it $(kubectl get pod -n istio-demo -l app=frontend -o name | head -1) \
  -c istio-proxy -- pilot-agent request GET stats | grep -E "cx_active|rq_active"
```

**Key insight**: The app container code is identical with and without Istio. The
`istio-injection=enabled` namespace label is the only change needed.

---

## Lesson 02 – Traffic Routing (VirtualService + DestinationRule)

```bash
cd 02_traffic_routing/

# Always apply DestinationRule before VirtualService
kubectl apply -f destination-rule.yaml
kubectl apply -f virtual-service.yaml

# Test default route → v1
kubectl exec -n istio-demo -it $(kubectl get pod -n istio-demo -l app=frontend -o name | head -1) \
  -- curl http://backend:9090

# Test header-based route → v2
kubectl exec -n istio-demo -it $(kubectl get pod -n istio-demo -l app=frontend -o name | head -1) \
  -- curl -H "x-version: v2" http://backend:9090

# Inspect Envoy's route table
istioctl proxy-config routes $(kubectl get pod -n istio-demo -l app=frontend -o name | head -1) \
  -n istio-demo
```

**Key insight**: VirtualService is the routing brain; DestinationRule defines the
subsets (named pod groups) and per-subset policies. Both are required.

---

## Lesson 03 – Canary Deployments

```bash
cd 03_canary/

# Deploy v2 alongside v1
kubectl apply -f v2-deployment.yaml
kubectl get pods -n istio-demo -l app=backend

# Apply canary split (90% v1 / 10% v2)
kubectl apply -f canary-virtual-service.yaml

# Send 20 requests — ~2 should say "backend-v2"
kubectl exec -n istio-demo -it $(kubectl get pod -n istio-demo -l app=frontend -o name | head -1) \
  -- sh -c 'for i in $(seq 1 20); do curl -s http://backend:9090 | grep NAME; done'

# Advance canary: edit weight in canary-virtual-service.yaml → kubectl apply
# Rollback: set v1=100, v2=0 → kubectl apply (takes effect in <1s)
```

**Key insight**: Traffic weights are independent of replica counts. You control
exactly what percentage of users see each version regardless of pod counts.

---

## Lesson 04 – Fault Injection

```bash
cd 04_fault_injection/

kubectl apply -f fault-virtual-service.yaml

# Test delay fault (should see ~5s response time)
kubectl exec -n istio-demo -it $(kubectl get pod -n istio-demo -l app=frontend -o name | head -1) \
  -- curl -H "x-test-fault: delay" -w "\nTime: %{time_total}s\n" http://backend:9090

# Remove fault injection
kubectl delete -f fault-virtual-service.yaml

# Normal request resumes immediately
kubectl exec -n istio-demo -it $(kubectl get pod -n istio-demo -l app=frontend -o name | head -1) \
  -- curl -w "\nTime: %{time_total}s\n" http://backend:9090
```

**Key insight**: Faults are scoped to a specific header (`x-test-fault`), so only
test traffic is affected. Production requests bypass the fault block entirely.

---

## Lesson 05 – Circuit Breaking

```bash
cd 05_circuit_breaking/

kubectl apply -f circuit-breaker-dr.yaml

# Install fortio for load testing
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/httpbin/httpbin.yaml -n istio-demo

# Trigger connection pool limits with concurrent requests
kubectl exec -n istio-demo -it $(kubectl get pod -n istio-demo -l app=httpbin -o name | head -1) \
  -- fortio load -c 20 -qps 0 -n 200 http://backend.istio-demo:9090

# Observe 503s (circuit breaker tripping) in the output
# Check ejection stats in Envoy
kubectl exec -n istio-demo $(kubectl get pod -n istio-demo -l app=backend -o name | head -1) \
  -c istio-proxy -- pilot-agent request GET stats | grep "ejection"
```

**Key insight**: Circuit breaking happens at the Envoy layer — the application
never sees the failing pods. Fast-failing prevents thread/connection pool exhaustion.

---

## Lesson 06 – Ingress Gateway

```bash
cd 06_gateway/

# Create self-signed TLS cert
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /tmp/tls.key -out /tmp/tls.crt \
  -subj "/CN=myapp.example.com/O=demo"
kubectl create secret tls myapp-tls-secret \
  --key /tmp/tls.key --cert /tmp/tls.crt -n istio-system

# Apply Gateway + VirtualService
kubectl apply -f gateway.yaml
kubectl apply -f gateway-virtual-service.yaml

# Port-forward for local testing
kubectl port-forward svc/istio-ingressgateway -n istio-system 8080:80 8443:443 &

# Test HTTPS (self-signed, skip verify)
curl -k https://localhost:8443 -H "Host: myapp.example.com"

# Confirm HTTP redirects to HTTPS
curl -v http://localhost:8080 -H "Host: myapp.example.com" 2>&1 | grep "Location:"
```

**Key insight**: The Gateway CRD configures *what* traffic enters. The
VirtualService bound to the Gateway controls *where* it goes. They are
separate objects deliberately — one Gateway can serve many VirtualServices.

---

## Lesson 07 – mTLS

```bash
cd 07_mtls/

# Start with PERMISSIVE (safe migration start)
kubectl apply -f peer-authentication.yaml
istioctl authn tls-check \
  $(kubectl get pod -n istio-demo -l app=frontend -o name | head -1).istio-demo \
  backend.istio-demo.svc.cluster.local

# Switch to STRICT: edit mode: PERMISSIVE → STRICT
# kubectl apply -f peer-authentication.yaml

# Verify plaintext is blocked in STRICT mode (run from a non-sidecar pod)
kubectl run plain --image=curlimages/curl:8.5.0 -n default --restart=Never \
  -- curl --max-time 3 http://backend.istio-demo:9090
kubectl logs plain -n default
# Expected: curl: (28) Operation timed out  OR  SSL routines error

# View cert issued to a sidecar
istioctl proxy-config secret \
  $(kubectl get pod -n istio-demo -l app=frontend -o name | head -1) -n istio-demo
```

**Key insight**: mTLS works transparently — app code never calls TLS APIs.
Envoy handles cert exchange using SPIFFE identities issued by Istiod's built-in CA.

---

## Lesson 08 – Authorization Policy

```bash
cd 08_authorization/

# Apply zero-trust baseline + allow rules
kubectl apply -f authz-policy.yaml

# Authorized call: frontend → backend (should succeed)
kubectl exec -n istio-demo -it $(kubectl get pod -n istio-demo -l app=frontend -o name | head -1) \
  -- curl http://backend:9090

# Unauthorized call: ad-hoc pod → backend (should get 403)
kubectl run attacker --image=curlimages/curl:8.5.0 -n istio-demo --restart=Never \
  -- sh -c 'curl http://backend:9090; sleep 3600'
kubectl logs attacker -n istio-demo
# Expected: RBAC: access denied

# Check active policies
kubectl get authorizationpolicies -n istio-demo
istioctl analyze -n istio-demo   # Catches misconfigurations
```

**Key insight**: AuthorizationPolicy uses SPIFFE identities from mTLS certs —
not IP addresses, which can be spoofed. This is true zero-trust identity-based access control.

---

## Lesson 09 – Observability

```bash
cd 09_observability/

# Install addons (if not done already)
bash addons-install.sh

# Apply telemetry config (100% trace sampling for learning)
kubectl apply -f telemetry.yaml

# Generate traffic
kubectl exec -n istio-demo $(kubectl get pod -n istio-demo -l app=frontend -o name | head -1) \
  -- sh -c 'for i in $(seq 1 50); do curl -s http://backend:9090 > /dev/null; done'

# Open dashboards
istioctl dashboard kiali      # Service graph with real-time traffic
istioctl dashboard jaeger     # Distributed traces
istioctl dashboard grafana    # Metrics dashboards (Istio Service Dashboard)
istioctl dashboard prometheus # Raw metrics browser

# Key Prometheus queries
# Error rate:
#   sum(rate(istio_requests_total{response_code=~"5..",namespace="istio-demo"}[5m]))
#   / sum(rate(istio_requests_total{namespace="istio-demo"}[5m])) * 100
#
# P99 latency:
#   histogram_quantile(0.99, sum(rate(
#     istio_request_duration_milliseconds_bucket{namespace="istio-demo"}[5m]
#   )) by (le))
```

**Key insight**: Zero lines of application code change needed. Istio's Envoy
sidecars emit all metrics, traces, and access logs automatically for every
service — including services you didn't write.

---

## Core Concepts Summary

| Concept | Resource | apiVersion |
|---------|----------|------------|
| Sidecar injection | Namespace label | `v1` |
| Traffic routing | VirtualService | `networking.istio.io/v1beta1` |
| Subset policies | DestinationRule | `networking.istio.io/v1beta1` |
| External traffic | Gateway | `networking.istio.io/v1beta1` |
| mTLS enforcement | PeerAuthentication | `security.istio.io/v1beta1` |
| Service-to-service RBAC | AuthorizationPolicy | `security.istio.io/v1beta1` |
| Metrics/traces config | Telemetry | `telemetry.istio.io/v1alpha1` |

---

## Useful Commands

```bash
# Validate all Istio configs in a namespace
istioctl analyze -n istio-demo

# Check what Envoy sees for a pod
istioctl proxy-config all <pod-name> -n istio-demo

# Verify mTLS handshake status
istioctl authn tls-check <pod>.<namespace> <service>.<namespace>.svc.cluster.local

# View Envoy access logs (fault injection evidence)
kubectl logs <pod> -n istio-demo -c istio-proxy -f

# Check Istio version
istioctl version

# Uninstall Istio
istioctl uninstall --purge -y
kubectl delete namespace istio-system
```

---

## Project Structure

```
istio/
├── 01_architecture/
│   ├── namespace.yaml          # Namespace with istio-injection=enabled
│   └── deployment.yaml         # frontend + backend Deployments + Services
├── 02_traffic_routing/
│   ├── destination-rule.yaml   # Subsets v1/v2 + traffic policies
│   └── virtual-service.yaml    # Header-based + default routing
├── 03_canary/
│   ├── v2-deployment.yaml      # Backend v2 Deployment
│   └── canary-virtual-service.yaml  # 90/10 weighted split
├── 04_fault_injection/
│   └── fault-virtual-service.yaml   # Delay + abort faults (header-scoped)
├── 05_circuit_breaking/
│   └── circuit-breaker-dr.yaml      # Outlier detection + connection pool limits
├── 06_gateway/
│   ├── gateway.yaml                 # HTTP→HTTPS redirect + TLS termination
│   └── gateway-virtual-service.yaml # External → internal routing
├── 07_mtls/
│   └── peer-authentication.yaml     # PERMISSIVE → STRICT migration
├── 08_authorization/
│   └── authz-policy.yaml            # Deny-all + selective ALLOW
└── 09_observability/
    ├── addons-install.sh            # Installs Prometheus/Grafana/Jaeger/Kiali
    └── telemetry.yaml               # Trace sampling + access logging config
```
