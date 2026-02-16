# Whiteboard Live

A Draw.io-style infinite canvas whiteboard extension for Microsoft Teams, built with [tldraw](https://tldraw.dev/) + React + TypeScript.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or v20
- [VS Code](https://code.visualstudio.com/) with the [Microsoft 365 Agents Toolkit](https://marketplace.visualstudio.com/items?itemName=TeamsDevApp.ms-teams-vscode-extension) extension (for sideloading)
- A [Microsoft 365 developer tenant](https://developer.microsoft.com/microsoft-365/dev-program) with sideloading enabled

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

- In a Teams meeting, click **+** (Add an app) → find **Whiteboard** → add it
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
├── appPackage/          # Teams manifest + icons
│   ├── manifest.json
│   ├── color.png
│   └── outline.png
├── env/                 # Environment variables
│   ├── .env.local
│   └── .env.dev
├── src/
│   ├── main.tsx         # React entry point
│   ├── App.tsx          # Teams SDK init + theme detection
│   ├── components/
│   │   └── Whiteboard.tsx   # tldraw canvas wrapper
│   └── styles/
│       └── whiteboard.css
├── index.html
├── vite.config.ts
└── tsconfig.json
```

## Keyboard Shortcuts

These are tldraw's built-in shortcuts:

| Action | Shortcut |
|--------|----------|
| Select tool | `V` |
| Hand (pan) tool | `H` |
| Rectangle | `R` |
| Ellipse | `O` |
| Arrow | `A` |
| Line | `L` |
| Text | `T` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Shift+Z` |
| Zoom in | `Ctrl+=` |
| Zoom out | `Ctrl+-` |
| Fit all | `Shift+1` |
| Delete | `Delete` / `Backspace` |
