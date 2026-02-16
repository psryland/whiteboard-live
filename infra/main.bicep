// ──────────────────────────────────────────────────────────────────
// Whiteboard Live — Azure Infrastructure (Bicep)
//
// Deploys:
//   1. Azure Static Web App (Free tier) — hosts the React SPA + API
//   2. Azure Web PubSub (Free tier) — real-time collaboration
//
// Usage:
//   az deployment group create \
//     --resource-group <rg-name> \
//     --template-file infra/main.bicep \
//     --parameters app_name=whiteboard-live location=australiaeast
// ──────────────────────────────────────────────────────────────────

targetScope = 'resourceGroup'

@description('Base name for all resources (e.g. whiteboard-live)')
param app_name string = 'whiteboard-live'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('SKU for Static Web App')
@allowed(['Free', 'Standard'])
param swa_sku string = 'Free'

@description('SKU for Web PubSub')
@allowed(['Free_F1', 'Standard_S1'])
param pubsub_sku string = 'Free_F1'

// ── Static Web App ──────────────────────────────────────────────

resource static_web_app 'Microsoft.Web/staticSites@2023-12-01' = {
	name: app_name
	location: location
	sku: {
		name: swa_sku
		tier: swa_sku
	}
	properties: {
		// No repo link — deployed via CLI with deployment token
		buildProperties: {
			apiLocation: 'api'
			appLocation: '/'
			outputLocation: 'dist'
		}
	}
}

// ── Web PubSub ──────────────────────────────────────────────────

resource web_pubsub 'Microsoft.SignalRService/webPubSub@2024-03-01' = {
	name: '${app_name}-pubsub'
	location: location
	sku: {
		name: pubsub_sku
		capacity: 1
	}
	properties: {}
}

// Web PubSub hub — defines the 'whiteboard' hub used by the app
resource pubsub_hub 'Microsoft.SignalRService/webPubSub/hubs@2024-03-01' = {
	parent: web_pubsub
	name: 'whiteboard'
	properties: {
		anonymousConnectPolicy: 'deny'
		eventHandlers: []
	}
}

// ── Wire PubSub connection string into SWA app settings ─────────

resource swa_app_settings 'Microsoft.Web/staticSites/config@2023-12-01' = {
	parent: static_web_app
	name: 'appsettings'
	properties: {
		WEBPUBSUB_CONNECTION_STRING: web_pubsub.listKeys().primaryConnectionString
	}
}

// ── Outputs ─────────────────────────────────────────────────────

@description('Static Web App default hostname')
output swa_hostname string = static_web_app.properties.defaultHostname

@description('Static Web App deployment token (use for CI/CD)')
output swa_deployment_token string = static_web_app.listSecrets().properties.apiKey

@description('Web PubSub hostname')
output pubsub_hostname string = web_pubsub.properties.hostName

@description('Web PubSub connection string')
@secure()
output pubsub_connection_string string = web_pubsub.listKeys().primaryConnectionString
