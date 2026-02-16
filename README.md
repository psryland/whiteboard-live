# Whiteboard Live

A Draw.io-style infinite canvas whiteboard/diagramming tool for Microsoft Teams, built with React + TypeScript + custom SVG canvas engine.

Features: shapes, connectors (straight/smooth/ortho), freehand drawing, text, laser pointer, z-ordering, snap-to-grid, export (SVG/PNG), and **live collaboration** via Azure Web PubSub.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or v20
- [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli) (for infrastructure deployment)
- [VS Code](https://code.visualstudio.com/) with the [Microsoft 365 Agents Toolkit](https://marketplace.visualstudio.com/items?itemName=TeamsDevApp.ms-teams-vscode-extension) extension (for sideloading into Teams)
- A [Microsoft 365 developer tenant](https://developer.microsoft.com/microsoft-365/dev-program) with sideloading enabled (Teams integration only)

## Quick Start

```powershell
# Install dependencies
npm install

# Start dev server
npm run dev
```

The app runs at `https://localhost:53000`. You can open it directly in a browser to use the whiteboard standalone (without Teams).

## Build

```powershell
# Type-check + production build
npm run build

# Preview production build locally
npm run preview
```

## Azure Infrastructure

The app runs on two Azure services:

| Resource | Service | SKU | Purpose |
|----------|---------|-----|---------|
| Static Web App | Microsoft.Web/staticSites | Free | Hosts the React SPA + serverless API |
| Web PubSub | Microsoft.SignalRService/webPubSub | Free_F1 | Real-time collaboration WebSocket relay |

### Architecture

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│   Browser    │────▶│  Azure Static Web App │────▶│  /api/negotiate  │
│  (React SPA) │     │   (SPA + API)         │     │  (Azure Function)│
└──────┬───────┘     └──────────────────────┘     └────────┬─────────┘
       │                                                    │
       │  WebSocket (json.webpubsub.azure.v1)              │ Token
       │                                                    │
       ▼                                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Azure Web PubSub                             │
│  Hub: whiteboard    Groups: per-room    Protocol: JSON subproto  │
└──────────────────────────────────────────────────────────────────┘
```

### Deploy Infrastructure (Bicep)

Infrastructure is defined as code in `infra/main.bicep`. To deploy from scratch:

```powershell
# Login to Azure
az login

# Option 1: Use the deployment script (recommended)
./infra/deploy.ps1 -ResourceGroup rg-whiteboard-live -Location australiaeast

# Option 2: Deploy manually with Azure CLI
az group create --name rg-whiteboard-live --location australiaeast
az deployment group create \
  --resource-group rg-whiteboard-live \
  --template-file infra/main.bicep \
  --parameters app_name=whiteboard-live location=australiaeast

# Preview changes without deploying
./infra/deploy.ps1 -WhatIf
```

The Bicep template automatically:
- Creates the Static Web App and Web PubSub resources
- Configures the `whiteboard` hub on Web PubSub
- Wires the `WEBPUBSUB_CONNECTION_STRING` app setting into the SWA
- Outputs the deployment token and hostnames

### Deploy the App

After infrastructure is provisioned:

```powershell
npm run build
npx @azure/static-web-apps-cli deploy ./dist \
  --api-location api \
  --api-language node --api-version 18 \
  --deployment-token "<token-from-bicep-output>" \
  --env production
```

### Infrastructure Files

```
infra/
├── main.bicep              # Resource definitions (SWA + Web PubSub)
├── main.bicepparam.json    # Default parameter values
└── deploy.ps1              # Deployment script with provider registration
```

## Live Collaboration

Click **🔗 Share** in the toolbar to start a live session. Share the generated link — collaborators auto-join and see each other's cursors and edits in real time.

- Cursors broadcast at ~20fps
- All shape/connector/freehand operations sync instantly
- Late joiners receive full canvas state from the host
- Sessions use room-scoped WebSocket groups for isolation

## Sideload into Teams

### 1. Enable sideloading in your tenant

Go to [Teams Admin Center](https://admin.teams.microsoft.com/) → **Teams apps** → **Setup policies** → **Global** → toggle **Upload custom apps** to On.

### 2. Package the app

Zip the contents of `appPackage/` (manifest.json + icons):

```powershell
Compress-Archive -Path appPackage\* -DestinationPath appPackage\build\app.zip -Force
```

Before zipping, replace the `${{...}}` placeholders in `manifest.json` with actual values (or use Teams Toolkit to do this automatically).

### 3. Upload to Teams

- Open Teams → **Apps** → **Manage your apps** → **Upload an app** → **Upload a custom app**
- Select the `.zip` file
- The whiteboard tab will appear in your sidebar

### 4. Add to a meeting/call

- In a Teams meeting, click **+** (Add an app) → find **Whiteboard Live** → add it
- The whiteboard opens as a tab or side panel

## Share with Team Members

**For your team (sideloading):**
1. Share the `.zip` package with team members
2. Each person uploads it via **Manage your apps** → **Upload a custom app**

**For your organisation (admin-managed):**
1. Go to [Teams Admin Center](https://admin.teams.microsoft.com/) → **Teams apps** → **Manage apps** → **Upload new app**
2. Upload the `.zip` — it appears under "Built for your org" in the Teams app store
3. Set the app to **Allowed** so everyone can install it

## Project Structure

```
├── appPackage/              # Teams manifest + icons
│   ├── manifest.json
│   ├── color.png
│   └── outline.png
├── api/                     # Azure Functions (serverless API)
│   ├── negotiate/           # WebSocket token negotiation endpoint
│   │   ├── index.js
│   │   └── function.json
│   ├── host.json
│   └── package.json
├── infra/                   # Infrastructure-as-code (Bicep)
│   ├── main.bicep
│   ├── main.bicepparam.json
│   └── deploy.ps1
├── src/
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Teams SDK init + theme detection
│   └── canvas/
│       ├── Canvas.tsx       # Main canvas — interaction logic + state
│       ├── types.ts         # Shape, Connector, Collab type definitions
│       ├── helpers.ts       # Geometry, snapping, port calculations
│       ├── undo.ts          # Snapshot-based undo/redo
│       ├── Toolbar.tsx      # Tool buttons + dropdowns
│       ├── ShapeRenderer.tsx
│       ├── ConnectorRenderer.tsx
│       ├── BoardPanel.tsx   # Board management + export
│       ├── PropertiesPanel.tsx
│       ├── Collaboration.ts # WebSocket session management
│       └── RemoteCursors.tsx
├── index.html
├── vite.config.ts
├── staticwebapp.config.json # SWA routing configuration
└── tsconfig.json
```

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Select tool | `V` or `Esc` |
| Pan (hand) | `H` or middle-mouse drag |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` |
| Delete | `Delete` |
| Duplicate | `Ctrl+D` |
| Copy / Paste | `Ctrl+C` / `Ctrl+V` |
| Select all | `Ctrl+A` |
| Zoom | Mouse wheel |
