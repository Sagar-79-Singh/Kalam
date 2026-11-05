# Kalam

A quiet, local-first desktop space for Sagar to think, write, and create. Powered **only by your own OmniRoute gateway**.

**Windows · macOS · Linux** — Wails v2.17.1, Go 1.26, React, Vite, and Tailwind. Uses your operating system’s webview; no bundled Chromium and no Electron.

## Download and open

You do not need to install developer tools or run terminal commands.

1. Open this repository’s **Releases** tab.
2. Choose a version and download the installer for your computer:
   - **Windows x64:** the `-installer.exe` file. The other `.exe`, when present, is the portable application. The installer can download the system WebView2 runtime if it is missing.
   - **macOS 12 Monterey or newer, Intel or Apple silicon:** the universal `.dmg`. Open it and drag the application into **Applications**.
   - **Debian 12+ / Ubuntu 22.04+ Linux x64:** the `.deb`. Open it in your software installer. GTK 3 and WebKitGTK 4.1 are required and declared as package dependencies.
3. Open the app, then configure **Settings → Connection**.

Installers are currently **not Developer-ID signed or notarized**. The macOS bundle receives a local ad-hoc integrity signature, not a developer identity. Windows SmartScreen or macOS Gatekeeper may ask you to confirm opening a downloaded application. Use the operating system’s normal “Open anyway” controls only after verifying that you downloaded it from this repository. No signing or notarization credentials are embedded in the project.

## Connect OmniRoute

Open **Settings → Connection** and enter:

- **Base URL**, for example `http://localhost:20128/v1/messages`. A gateway root, `/v1`, `/v1/messages`, or `/v1/chat/completions` is accepted, including a gateway-specific path prefix.
- **API key**, if required by your gateway.
- **Model ID**: use the exact ID configured in OmniRoute. There is no default model.

Choose **Refresh models** to discover IDs from the gateway’s `/v1/models` route. If discovery is unavailable, type a model ID manually. Choose **Save connection settings**. The composer also has a model picker and a refresh button; the last-used model is remembered.

**Detect from URL** selects the messages protocol for a `/messages` URL, otherwise chat completions. You can override it. Both streaming event formats are supported. Browser preview uses Fetch + ReadableStream; desktop streaming uses cancellable native events adapted into a ReadableStream, because the Windows Wails asset handler buffers HTTP responses until EOF. Both transports feed the same SSE parser. Structured-tag tool calling is the default; native function calling is available for compatible models.

A local URL refers to **the computer running the installed application**. The standalone browser preview cannot reach a gateway on a different computer just because that gateway uses `localhost`.

## What you can do

### Conversations

- Stream replies, stop a response, retry an inline error, regenerate, or edit an earlier user message.
- Branch from a message without losing the original conversation.
- Rename and delete chats, search titles and message content, and organize chats into projects.
- Attach images, PDFs, text, and code. Drag files into the composer, select several files, or paste a clipboard image. Remove attachments before sending.
- See character counts and an explicitly approximate token count.
- Scroll up without being pulled back while a reply streams; **Jump to latest** resumes following.
- Start an **incognito** chat. It is never written to SQLite or included in backups, and does not use or save memories. Starting another new chat discards its in-memory session. OmniRoute and any enabled external tools still receive requests.

### Artifacts — a workspace alongside your thoughts

HTML, React/JSX/TSX, SVG, Mermaid, and Markdown artifacts open in an overlay panel. Opening it does **not change the chat’s text width or reflow the conversation**. On smaller screens it becomes a full-screen sheet.

Use **Preview / Code**, switch versions, edit source and save a new version, copy, download, refresh, or expand to fullscreen. **New artifact / paste code** also works without an AI connection. The artifact library collects creations from saved chats.

Previews run in an iframe with `sandbox="allow-scripts"`, without same-origin access. A content security policy disables fetch connections, external resources, forms, and embedded parent access. React, the rendering runtime, and icons are supplied locally. React source should use inline styles or an embedded `<style>` element; it cannot import arbitrary packages or a utility CSS framework. Mermaid is rendered with strict security settings. The pinned Wails v2.17.1 runtime includes native IPC origin/frame guards, including the Linux child-frame security fix; do not downgrade this dependency for an app that renders untrusted artifact code.

The system prompt tells the model to create or update complete source using stable IDs:

```xml
<artifact id="a-stable-id" type="html" title="An idea made tangible">
<!doctype html>
<html><body><h1>Hello, Sagar.</h1></body></html>
</artifact>
```

Reuse the ID for an update. Types are `html`, `react`, `svg`, `mermaid`, and `markdown`. Control tags belong **outside** Markdown fences. The partial-tag parser withholds unfinished tags while streaming and does not execute examples inside code spans or fenced code blocks. An update creates one version per artifact block in a message, not one version per token.

### Connectors and skills

**Settings → Connectors** accepts a name, **Streamable HTTP MCP URL**, and optional authentication header/value. Save, then **Test connection** to initialize the server and discover its tools. Enable trusted servers globally, then use the composer’s plug button to enable or disable each one for a chat. Tool calls show expandable arguments, results, and inline errors; results return to the model before it continues. Legacy SSE-only servers and command/stdio servers are not supported.

Only connect servers you trust. Enabled tools may read or modify data on their server, and tool output is treated as data rather than system instructions. Stop interrupts active requests. A bounded tool loop prevents endless autonomous calls.

**Settings → Skills** lets you create, edit, toggle, delete, or import a `SKILL.md` file. Three sample skills are seeded once. The model sees only enabled skill names and descriptions; full instructions are loaded only when it asks for a matching skill.

### Personalization, memory, and projects

- Set your name, background, standing instructions, and response style in **Personalization**.
- **System Prompt Preview** shows the live assembled prompt for the active chat. **Last request (exact)** shows the prompt actually used for the most recent request in this session.
- Enable, review, edit, add, or delete memories. The model may request a save with `<memory>A useful fact</memory>` or its memory tool. A successful save shows **Memory saved**. Disable memory to exclude saved facts from prompts and prevent new saves.
- Each project has an emoji, description, instructions, reference files, and its own conversations. Deleting a project keeps its conversations as loose chats.
- Choose Normal, Concise, Explanatory, or Casual responses.

### Search, code, and voice

- Configure an optional JSON search endpoint in **Connection**, then toggle the globe per chat. Search results are added as context and displayed in a **Searched: …** card with source links and errors.
- Example self-hosted search endpoint: `http://localhost:8888/search?format=json&q={query}`. Enable JSON output on the search server. A generic `results` array containing `title`, `url`, and `content` or `snippet` is accepted. GET substitutes `{query}` or adds `q`; POST sends both `query` and `q`. An optional bearer token is configurable.
- JavaScript and Python fenced blocks have **Run** and **Stop** controls, separate stdout/stderr, and a ten-second execution limit. Code runs only when you click Run, in a worker rather than the interface thread. Do not run code you do not trust.
- Python loads **Pyodide 0.27.7 lazily from its CDN**, only on first use; it is not bundled. Initial runtime loading has a separate timeout. Stopping Python terminates its worker, so the next run initializes again. No automatic third-party Python package installation is performed.
- PDF text extraction runs on your device using a pinned, lazily loaded PDF reader. The first PDF needs network access to load that reader. Scanned PDFs require OCR beforehand. Extraction is limited to 100 pages / 250,000 characters; text files have the same character limit. Each attachment is limited to 15 MB.
- Dictation and read-aloud use the operating system webview’s **Web Speech API**. Mic and speaker controls are disabled when their APIs are unavailable. Voice support and permissions vary by operating system; unsupported voice APIs do not prevent normal chat.

### Appearance and exports

Light, dark, and system themes use a warm cream / charcoal palette. Switch conversation fonts between Inter/system sans, Georgia-style serif, mono, and a Verdana-based dyslexic-friendly option with wider spacing. Font size is adjustable.

The native window stays hidden until its HTML has loaded. On desktop, Go inserts only persisted appearance settings from SQLite into the HTML before the **blocking appearance script** runs and before React mounts. Credentials and personal instructions are never embedded in that HTML. The browser preview has an appearance-only startup cache. Chat data is never placed in localStorage.

The conversation menu exports **Markdown**, **JSON**, or **PDF**. PDF uses the operating system print dialog and a print stylesheet; choose the system’s PDF destination. Desktop text/code/JSON downloads use a native save dialog rather than relying on webview blob downloads.

**Data & privacy → Export backup** produces one versioned JSON file containing all saved chats, messages, artifact versions, settings, project files, skills, memories, and connectors. Restore validates its full schema, asks for confirmation, and replaces local data in one transaction.

**Keep backups private:** they include API keys and connector credentials. The local database and backups are not encrypted by this app. Use your operating system’s account and disk security. Incognito sessions are excluded; old exported files are not retroactively changed when you edit or delete local data.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| ⌘ / Ctrl N | New chat |
| ⌘ / Ctrl Shift N | New incognito chat |
| ⌘ / Ctrl K | Search chats |
| ⌘ / Ctrl B | Toggle sidebar |
| ⌘ / Ctrl Shift A | Toggle artifact panel |
| ⌘ / Ctrl , | Settings |
| Enter / Shift Enter | Send / new line |
| Esc | Close dialog, or stop generation outside a dialog |
| ? | Shortcut cheat sheet outside text inputs |

## Updates and releases — no local build required

Changes are saved in a working branch and pushed to this GitHub repository. A pull request keeps review separate from the release process. Git commits use **Sagar-79-Singh <s07909084193@gmail.com>** for both author and committer. Actions never commits source files.

To publish a version using only GitHub’s interface:

1. Review and merge the pull request into the release branch.
2. Open **Releases → Draft a new release**.
3. In **Choose a tag**, enter a version such as **v1.0.0**, select the intended commit/branch, and choose **Create new tag on publish**.
4. Publish the release. Creating the `v*` tag triggers **Desktop installers**.
5. Watch the **Actions** tab. After all three platform jobs pass, the `.exe`, `.dmg`, and `.deb` files are attached to that release. Download them from its **Assets** list.

For a test build without publishing a release, open **Actions → Desktop installers → Run workflow**. These installers appear under that run’s **Artifacts**, not in Releases. Pull requests also build installers. The Windows job silently installs its actual installer and checks the installed app through system WebView2: native before-EOF streaming, cancellation, MCP, skill loading, iframe isolation, SQLite history, and persisted-theme restart. The check uses Windows UI Automation against the unchanged release binary and inspects its isolated SQLite database. It does not download a browser, expose a debug port, weaken the runtime’s environment protections, or add test hooks to the app. **Checks** validates TypeScript, parser/prompt/backup/form tests, the production frontend, and Go persistence/gateway/native-transport tests.

The release workflow uses the requested `dAppServer/wails-build-action@v2.2` build implementation, sets a 4 GB Node heap budget, and builds Linux amd64, Windows amd64, and macOS universal. GitHub rejects a direct reference to v2.2 because it contains a retired artifact uploader, even with uploading disabled. A build-only compatibility script downloads its pinned manifest, updates that uploader and the Linux WebKitGTK 4.1 dependencies, fixes the Windows executable suffix, and skips the unused macOS signing-tool install for builds without signing credentials. Windows explicitly prepares NSIS; macOS verifies both CPU slices and its local integrity signature before packaging. The patched action exists only in the ignored CI workspace; the v2.2 Go, Node, Wails, and build steps are preserved. Linux runs in an Ubuntu 22.04 userspace on the current runner host to retain older glibc compatibility, and explicitly receives the WebKitGTK 4.1 build tag. Version tags are applied to build metadata without creating commits. Current upload/download actions handle installers, and a separate tag-only job attaches release assets. No automated commit or alternate Git identity is configured.

`.github/CODEOWNERS` assigns every file to the repository owner. GitHub branch rules must also require code-owner review if approvals are to be enforced; a CODEOWNERS file alone does not enable that rule.

## Engineering map

```text
.github/
  CODEOWNERS
  workflows/ci.yml                 TypeScript and Go checks
  workflows/release.yml            Three-platform installers and tag releases
main.go                           Native window and embedded frontend
app.go                            Narrow, Wails-bound persistence actions
storage.go                        SQLite schema, atomic chat writes, CRUD
backup.go                         Transactional restore
export.go                         User-confirmed native export save dialog
gateway.go                        Configured gateway, search, and MCP routing
transport.go                      Cancellable native byte-stream events
name.go                           Reads the one product-name constant for Go
storage_test.go, gateway_test.go, transport_test.go
go.mod, go.sum                    Pinned Go dependencies
wails.json                        Native bundle metadata and frontend commands
packaging/                        App icon and native metadata templates
scripts/
  sync-name.mjs                   Syncs product metadata from constants
  prepare-packaging.mjs           Copies bundle templates into generated build/
  prepare-build-action.mjs        Pinned action / current-runner compatibility
  package-linux.mjs               Builds the .deb installer
  package-macos.mjs               Verifies and packages the universal .dmg
  native-windows-smoke.mjs         Real installer and system-webview checks
  windows-ui-automation.ps1        CI-only Windows accessibility driver
frontend/
  package.json, package-lock.json
  index.html                      Go-backed blocking theme bootstrap
  vite.config.ts                  Standalone preview bridge; no web deployment
  tailwind.config.js, postcss.config.js, tsconfig.json
  public/icon.svg
  scripts/build-artifact-runtime.mjs
  src/
    constants.ts                  APP_NAME is the product-name source of truth
    types.ts                      Strict domain and native-bridge types
    main.tsx                      Root error boundary
    App.tsx                       App shell, shortcuts, overlays, and toasts
    styles.css                    Tailwind, theme tokens, markdown, and print
    store/app.ts                  Zustand sessions, settings, and save queues
    lib/
      db.ts                       All frontend persistence; Wails or IndexedDB
      omniroute.ts                The single AI send path and model discovery
      sse.ts                      Incremental SSE decoding
      api.ts                      Same-origin request/error handling
      native-stream.ts            Native byte packets → ReadableStream
      prompt.ts                   The sole system-prompt builder
      artifacts.ts                Streaming-safe control-tag parsing/versioning
      preview.ts                  Sandboxed document creation and transpilation
      artifact-runtime.tsx        Local React/Markdown preview renderer
      conversation.ts             Streaming, tools, branching/edit regeneration
      connectors.ts, tools.ts     MCP sessions and tool routing
      files.ts, search.ts         Attachment extraction and search context
      execution.ts, code-worker.js
      voice.ts, theme.ts, backup.ts, export.ts, defaults.ts, utils.ts
    components/
      Sidebar, Composer, ModelPicker, ChatHeader, ChatView, Welcome
      MessageBubble, CodeBlock, ToolCard, FileChips
      ArtifactPanel, ArtifactModal, ProjectModal, SearchModal
      SettingsModal, ShortcutsModal, ConfirmDialog, Modal, Brand, ui
      settings/
        ConnectionSettings, PersonalizationSettings, AppearanceSettings
        ConnectorSettings, SkillsSettings, MemorySettings, DataSettings
  tests/
    artifacts.test.ts, sse.test.ts, backup-prompt.test.ts
    omniroute.test.ts, native-stream.test.ts, fields.test.ts
```

All named source files are implemented, not code excerpts. Components are kept small; AI traffic cannot select a second provider. The browser-only persistence fallback is isolated in `db.ts`; the shipped app always uses Go and SQLite. Local data is stored under the operating system’s configuration directory in the application’s `data.sqlite` file.

The frontend package provides `dev`, `build`, `wails:dev`, and `wails:build` scripts for automated development and CI. They are not installation steps for end users. Build output, generated bindings, dependencies, local databases, and scratch test tools are excluded from Git.

To rename the product, change `APP_NAME` in `frontend/src/constants.ts` and the matching native name in `wails.json`; the metadata synchronization step updates the package name, window title HTML, native metadata, and README heading. Internal storage keys and the repository URL intentionally stay stable.

## Ownership

**Sagar-79-Singh <s07909084193@gmail.com>** · MIT license.
