#!/usr/bin/env bash
# Lesson 09 – Observability: Install Prometheus, Grafana, Jaeger, Kiali
# Run: bash addons-install.sh
# Requires: Istio installed, kubectl configured
set -euo pipefail

ISTIO_VERSION="1.20"
ADDONS_BASE="https://raw.githubusercontent.com/istio/istio/release-${ISTIO_VERSION}/samples/addons"

echo "==> Installing observability addons (Istio ${ISTIO_VERSION})..."

# Install in order — Prometheus must come before Kiali
kubectl apply -f "${ADDONS_BASE}/prometheus.yaml"
kubectl apply -f "${ADDONS_BASE}/grafana.yaml"
kubectl apply -f "${ADDONS_BASE}/jaeger.yaml"

# Kiali depends on Prometheus being ready
kubectl rollout status deployment/prometheus -n istio-system --timeout=90s
kubectl apply -f "${ADDONS_BASE}/kiali.yaml"

echo ""
echo "==> Waiting for all addons to become ready..."
kubectl rollout status deployment/prometheus  -n istio-system --timeout=90s
kubectl rollout status deployment/grafana     -n istio-system --timeout=90s
kubectl rollout status deployment/jaeger      -n istio-system --timeout=90s
kubectl rollout status deployment/kiali       -n istio-system --timeout=120s

echo ""
echo "==> All addons ready! Open dashboards:"
echo "  Kiali:      istioctl dashboard kiali"
echo "  Jaeger:     istioctl dashboard jaeger"
echo "  Grafana:    istioctl dashboard grafana"
echo "  Prometheus: istioctl dashboard prometheus"
echo ""
echo "==> Or port-forward manually:"
echo "  kubectl port-forward svc/kiali      -n istio-system 20001:20001"
echo "  kubectl port-forward svc/tracing    -n istio-system 16686:80"
echo "  kubectl port-forward svc/grafana    -n istio-system 3000:3000"
echo "  kubectl port-forward svc/prometheus -n istio-system 9090:9090"
