#!/usr/bin/env pwsh
# ──────────────────────────────────────────────────────────────────
# Whiteboard Live — Infrastructure Deployment Script
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Bicep CLI (bundled with Azure CLI 2.20+)
#   - Microsoft.SignalRService provider registered
#
# Usage:
#   ./infra/deploy.ps1                          # Deploy with defaults
#   ./infra/deploy.ps1 -ResourceGroup my-rg     # Custom resource group
#   ./infra/deploy.ps1 -WhatIf                  # Preview changes only
# ──────────────────────────────────────────────────────────────────

param(
	[string]$ResourceGroup = "rg-whiteboard-live",
	[string]$Location = "australiaeast",
	[string]$AppName = "whiteboard-live",
	[switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$script_dir = $PSScriptRoot

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Whiteboard Live — Infrastructure   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Ensure resource providers are registered ──────────────────

Write-Host "Checking resource providers..." -ForegroundColor Yellow
$providers = @("Microsoft.Web", "Microsoft.SignalRService")
foreach ($provider in $providers) {
	$state = az provider show --namespace $provider --query "registrationState" -o tsv 2>$null
	if ($state -ne "Registered") {
		Write-Host "  Registering $provider..." -ForegroundColor Gray
		az provider register --namespace $provider --wait | Out-Null
	} else {
		Write-Host "  $provider — already registered" -ForegroundColor Green
	}
}

# ── 2. Create resource group if needed ───────────────────────────

Write-Host ""
Write-Host "Resource group: $ResourceGroup ($Location)" -ForegroundColor Yellow
$rg_exists = az group exists --name $ResourceGroup 2>$null
if ($rg_exists -eq "false") {
	Write-Host "  Creating resource group..." -ForegroundColor Gray
	az group create --name $ResourceGroup --location $Location --output none
	Write-Host "  Created." -ForegroundColor Green
} else {
	Write-Host "  Already exists." -ForegroundColor Green
}

# ── 3. Deploy Bicep template ────────────────────────────────────

Write-Host ""
Write-Host "Deploying infrastructure..." -ForegroundColor Yellow

$deploy_args = @(
	"deployment", "group", "create",
	"--resource-group", $ResourceGroup,
	"--template-file", "$script_dir\main.bicep",
	"--parameters", "app_name=$AppName", "location=$Location",
	"--output", "json"
)

if ($WhatIf) {
	$deploy_args = @(
		"deployment", "group", "what-if",
		"--resource-group", $ResourceGroup,
		"--template-file", "$script_dir\main.bicep",
		"--parameters", "app_name=$AppName", "location=$Location"
	)
	Write-Host "  (What-If mode — no changes will be made)" -ForegroundColor Gray
}

$result = az @deploy_args 2>&1
if ($LASTEXITCODE -ne 0) {
	Write-Host "Deployment failed:" -ForegroundColor Red
	Write-Host $result
	exit 1
}

if ($WhatIf) {
	Write-Host $result
	exit 0
}

$deployment = $result | ConvertFrom-Json

# ── 4. Extract outputs ──────────────────────────────────────────

$swa_hostname = $deployment.properties.outputs.swa_hostname.value
$swa_token = $deployment.properties.outputs.swa_deployment_token.value
$pubsub_hostname = $deployment.properties.outputs.pubsub_hostname.value

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║        Deployment Complete!           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Static Web App:  https://$swa_hostname" -ForegroundColor White
Write-Host "  Web PubSub:      $pubsub_hostname" -ForegroundColor White
Write-Host ""
Write-Host "  Deployment Token:" -ForegroundColor Yellow
Write-Host "  $swa_token" -ForegroundColor Gray
Write-Host ""
Write-Host "To deploy the app:" -ForegroundColor Yellow
Write-Host "  npm run build" -ForegroundColor Gray
Write-Host "  npx @azure/static-web-apps-cli deploy ./dist --api-location api \" -ForegroundColor Gray
Write-Host "    --api-language node --api-version 18 \" -ForegroundColor Gray
Write-Host "    --deployment-token `"$swa_token`" --env production" -ForegroundColor Gray
