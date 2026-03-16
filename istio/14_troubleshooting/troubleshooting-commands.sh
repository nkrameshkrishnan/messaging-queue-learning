#!/usr/bin/env bash
# Lesson 14 – Istio Troubleshooting
# Five-step diagnostic workflow: analyze → status → config → logs → admin
set -euo pipefail

NS="istio-demo"
POD=$(kubectl get pod -n $NS -l app=frontend -o name | head -1)

echo "════════════════════════════════════════════"
echo "STEP 1: istioctl analyze — catch config mistakes"
echo "════════════════════════════════════════════"
istioctl analyze -n $NS
# Common findings:
#   Warning: No matching WorkloadEntry found for VirtualService host
#   Warning: DestinationRule is defined but no pods match the selector
#   Error: Referenced ServiceAccount does not exist

echo ""
echo "════════════════════════════════════════════"
echo "STEP 2: proxy-status — check Envoy sync state"
echo "════════════════════════════════════════════"
istioctl proxy-status
# Columns: NAME | CDS | LDS | EDS | RDS | ISTIOD | VERSION
# SYNCED   = Envoy has latest config from Istiod
# STALE    = Envoy hasn't received latest (network issue, overloaded Istiod)
# NOT SENT = Istiod hasn't pushed yet

echo ""
echo "════════════════════════════════════════════"
echo "STEP 3: proxy-config — inspect Envoy's view"
echo "════════════════════════════════════════════"

# Clusters (upstream services Envoy knows)
echo "--- Clusters ---"
istioctl proxy-config clusters $POD -n $NS | head -20

# Listeners (ports Envoy is listening on)
echo "--- Listeners ---"
istioctl proxy-config listeners $POD -n $NS | head -20

# Routes (HTTP routing table)
echo "--- Routes ---"
istioctl proxy-config routes $POD -n $NS | head -20

# Endpoints (healthy pod IPs for each cluster)
echo "--- Endpoints for backend ---"
istioctl proxy-config endpoints $POD -n $NS | grep backend

# Full dump (all xDS config for deep inspection)
# istioctl proxy-config all $POD -n $NS -o json > envoy-dump.json

echo ""
echo "════════════════════════════════════════════"
echo "STEP 4: Access logs — see every request"
echo "════════════════════════════════════════════"
# View sidecar access logs (requires accessLogFile in meshConfig)
kubectl logs $POD -n $NS -c istio-proxy --tail=20
# Format: [timestamp] "METHOD /path HTTP/1.1" STATUS BYTES DURATION "UPSTREAM"
# Look for: response_code=503 (circuit open), 403 (authz denied), 0 (TCP disconnect)

echo ""
echo "════════════════════════════════════════════"
echo "STEP 5: Envoy Admin API (port 15000)"
echo "════════════════════════════════════════════"
# Port-forward the admin port of a specific sidecar
kubectl port-forward $POD -n $NS 15000:15000 &
PFPID=$!
sleep 2

echo "--- Config dump (full xDS state) ---"
curl -s http://localhost:15000/config_dump | python3 -m json.tool | head -40

echo "--- Stats (counters for every listener/cluster/filter) ---"
curl -s http://localhost:15000/stats | grep "http.inbound_0.0.0.0_9090" | head -10

echo "--- Ready check ---"
curl -s http://localhost:15000/ready

echo "--- Clusters health ---"
curl -s http://localhost:15000/clusters | grep "backend" | head -10

kill $PFPID 2>/dev/null || true

echo ""
echo "════════════════════════════════════════════"
echo "BONUS: mTLS check between two services"
echo "════════════════════════════════════════════"
istioctl authn tls-check \
  $(kubectl get pod -n $NS -l app=frontend -o jsonpath='{.items[0].metadata.name}').$NS \
  backend.$NS.svc.cluster.local
# STATUS column: OK=mTLS handshake succeeds, CONFLICT=mode mismatch

echo ""
echo "════════════════════════════════════════════"
echo "Quick cheat-sheet:"
echo "  istioctl analyze -n NAMESPACE              # Validate all configs"
echo "  istioctl proxy-status                       # Envoy sync health"
echo "  istioctl proxy-config routes POD -n NS      # HTTP routing table"
echo "  istioctl proxy-config clusters POD -n NS    # Upstream services"
echo "  kubectl logs POD -c istio-proxy             # Access logs"
echo "  kubectl port-forward POD 15000:15000        # Envoy admin UI"
echo "════════════════════════════════════════════"
