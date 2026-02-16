# Whiteboard Live — Copilot Instructions

## Build & Run

```powershell
npm install          # install dependencies
npm run dev          # start Vite dev server on port 53000
npm run build        # type-check (tsc) + production build to dist/
npm run preview      # preview production build locally
npm run lint         # eslint on src/
```

## Architecture

This is a **Microsoft Teams tab app** that embeds a [tldraw](https://tldraw.dev/) infinite canvas as a whiteboard/diagramming tool.

### Stack
- **React 18 + TypeScript** — UI framework
- **tldraw v4** — infinite canvas engine (shapes, arrows, text, pan/zoom, undo/redo)
- **Vite** — bundler and dev server (port 53000)
- **Fluent UI v9** (`@fluentui/react-components`) — Teams-native UI chrome
- **Teams JS SDK v2** (`@microsoft/teams-js`) — Teams context, theming, auth

### Key files
- `src/App.tsx` — entry point; initialises Teams SDK, detects theme (dark/light/high-contrast), wraps everything in FluentProvider
- `src/components/Whiteboard.tsx` — tldraw canvas wrapper with local persistence via `persistenceKey`
- `appPackage/manifest.json` — Teams app manifest (v1.25 schema); uses `${{VAR}}` placeholders resolved from `env/` files

### How Teams integration works
1. `App.tsx` calls `app.initialize()` from Teams JS SDK
2. If running inside Teams, it reads the theme from context and listens for theme changes
3. If running standalone (outside Teams), it falls back to system dark/light preference
4. The tldraw canvas fills the entire viewport and persists state to browser localStorage

### Persistence model (planned)
- Solo whiteboards → user's **OneDrive** (`/Apps/TeamsWhiteboard/`)
- Shared whiteboards → team's **SharePoint** document library
- Real-time collaboration via `@tldraw/sync` with live cursors and user names
- Auto-save on debounced store changes via Microsoft Graph API

## Conventions

- **Naming**: `snake_case` for variables and fields, `PascalCase` for components/classes/methods
- **Indentation**: tabs
- **CSS**: component-specific `.css` files in `src/styles/`, imported directly by components
- **Teams manifest**: placeholders use `${{VAR_NAME}}` syntax, resolved from `env/.env.local` or `env/.env.dev`
- **tldraw customisation**: override via `components` prop (for UI) and `onMount` callback (for editor API). See [tldraw docs](https://tldraw.dev/docs) for the component/override system.

## Planned features (not yet implemented)

These are in the roadmap but not yet built — context for future sessions:

- **Shape palette sidebar** — drag-and-drop shapes from a categorised panel
- **Connection port indicators** — blue dots on shape edges for snapping arrows
- **Double-click to create** — canvas double-click inserts a labelled rectangle
- **Quick-connect** — Shift+click two shapes to auto-arrow between them
- **Right-click pan** — right-mouse-drag pans the canvas
- **Freehand annotation layer** — pen strokes on an overlay, independently erasable
- **Colour picker** — inline border/fill/text colour changes on selected elements
- **Azure AD SSO + Graph API** — file storage in OneDrive/SharePoint
- **File browser** — list/create/open/rename/delete whiteboards
- **@tldraw/sync** — real-time collaboration with live cursors during calls
