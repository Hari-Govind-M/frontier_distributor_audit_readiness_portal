#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-frontier-distributor-readiness}"
APP_NAME="${APP_NAME:-swa-frontier-distributor-readiness-$RANDOM}"
LOCATION="${LOCATION:-eastus2}"
SKU="${SKU:-Free}"
APP_LOCATION="${APP_LOCATION:-src}"

echo "Creating resource group: $RESOURCE_GROUP in $LOCATION"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output table

echo "Creating Azure Static Web App: $APP_NAME"
az staticwebapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku "$SKU" \
  --output table

echo "Retrieving deployment token"
DEPLOYMENT_TOKEN="$(az staticwebapp secrets list --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query properties.apiKey -o tsv)"

if ! command -v swa >/dev/null 2>&1; then
  echo "Installing Azure Static Web Apps CLI"
  npm install -g @azure/static-web-apps-cli
fi

echo "Deploying $APP_LOCATION to Azure Static Web Apps"
swa deploy "$APP_LOCATION" \
  --deployment-token "$DEPLOYMENT_TOKEN" \
  --env production

HOSTNAME="$(az staticwebapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query defaultHostname -o tsv)"
echo
echo "Deployment complete."
echo "URL: https://$HOSTNAME"
