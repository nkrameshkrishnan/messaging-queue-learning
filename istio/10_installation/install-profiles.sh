#!/usr/bin/env bash
# Lesson 10 – Installation Profiles
# Demonstrates all Istio install approaches
set -euo pipefail

echo "==> List available profiles"
istioctl profile list
# Output: default, demo, empty, minimal, openshift, preview, remote

echo ""
echo "==> Show full rendered YAML for 'default' profile (read-only)"
istioctl profile dump default | head -60

echo ""
echo "==> Diff between 'default' and 'demo' profiles"
istioctl profile diff default demo

echo ""
echo "==> Install with default profile (recommended for production)"
# istioctl install --set profile=default -y

echo "==> Install with demo profile (all features, good for learning)"
# istioctl install --set profile=demo -y

echo ""
echo "==> Install using IstioOperator manifest (GitOps-friendly)"
# istioctl install -f istio-operator.yaml -y

echo ""
echo "==> Canary upgrade: install new revision alongside existing"
# istioctl install --set revision=1-20 -y
# Then migrate namespaces one by one:
#   kubectl label namespace istio-demo istio.io/rev=1-20 --overwrite
# Verify both revisions running:
#   kubectl get pods -n istio-system -l app=istiod

echo ""
echo "==> Verify installation health"
istioctl verify-install
kubectl get pods -n istio-system

echo ""
echo "==> Check installed version"
istioctl version

echo ""
echo "==> Uninstall (safe — preserves CRDs by default)"
# istioctl uninstall --purge -y
# kubectl delete namespace istio-system
