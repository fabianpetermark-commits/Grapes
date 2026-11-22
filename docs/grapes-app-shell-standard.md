# Grapes App Shell Standard

**Status:** approved product and implementation contract  
**Applies to:** Grapes ecosystem applications, beginning with E-Library  
**Branch:** `feature/ebook-android-app-20261122`  
**Purpose:** define one shared application header, navigation model, page hierarchy, and implementation contract. This is more than a visual reference: future Grapes apps should reuse the same shell and change only the app identity, feature routes, and page content.

## 1. Shared application identity

The shared header has exactly two zones:

- **Left:** official Grapes logo asset, the wordmark `Grapes`, and the current application name beneath it (for this app: `E-Library`).
- **Right:** one primary `Bejelentkezés` action. It invokes the app's existing authentication flow. It is not a Drive-status indicator.
- Do not add an ecosystem explainer, subtitle, breadcrumb, back arrow, or extra status text to the header.
- Keep the Grapes wordmark prominent and the app name visibly smaller.
- Use the official Grapes logo asset already maintained by the ecosystem. Do not redraw, approximate, or substitute an icon. The asset path must be supplied by the host app.

### Header markup contract

```html
<header class="grapes-app-header">
  <a class="grapes-brand" href="/" aria-label="Grapes – E-Library">
    <img class="grapes-brand__logo" src="HOST_PROVIDED_GRAPES_LOGO" alt="" />
    <span class="grapes-brand__names">
      <span class="grapes-brand__wordmark">Grapes</span>
      <span class="grapes-brand__app-name">E-Library</span>
    </span>
  </a>
  <button class="grapes-login" type="button" data-action="login">
    Bejelentkezés
  </button>
</header>
```

The `HOST_PROVIDED_GRAPES_LOGO` value is an integration input, not a literal asset path. Each app supplies the official shared asset.

### Header CSS contract

```css
:root {
  --grapes-page: #F7F5EE;
  --grapes-surface: #FFFFFF;
  --grapes-border: #E3DECF;
  --grapes-text: #2E2A24;
  --grapes-muted: #756F64;
  --grapes-primary: #6B8F4E;
  --grapes-primary-soft: #E8EEDC;
  --grapes-success: #88B97A;
  --grapes-copper: #A6734D;
}

.grapes-app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 76px;
  padding: 12px 16px;
  background: rgba(247, 245, 238, .96);
  border-bottom: 1px solid var(--grapes-border);
  backdrop-filter: blur(14px);
}

.grapes-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.grapes-brand__logo {
  display: block;
  width: 42px;
  height: 42px;
  object-fit: contain;
  flex: 0 0 42px;
}

.grapes-brand__names {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  line-height: 1.05;
}

.grapes-brand__wordmark {
  color: var(--grapes-text);
  font-size: 23px;
  font-weight: 780;
  letter-spacing: -.035em;
}

.grapes-brand__app-name {
  margin-top: 4px;
  color: var(--grapes-primary);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: .01em;
}

.grapes-login {
  min-height: 42px;
  padding: 0 16px;
  border: 0;
  border-radius: 14px;
  background: var(--grapes-primary);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}
```

## 2. Shared visual tokens and component rules

| Token | Value | Use |
|---|---|---|
| Page | `#F7F5EE` | app background |
| Surface | `#FFFFFF` | cards and panels |
| Border | `#E3DECF` | borders and dividers |
| Text | `#2E2A24` | primary text |
| Muted | `#756F64` | secondary text |
| Primary | `#6B8F4E` | primary actions and active state |
| Soft primary | `#E8EEDC` | active nav and selected surfaces |
| Success | `#88B97A` | positive status |
| Copper | `#A6734D` | rare secondary accent |

- Cards are white, with a fine warm border and restrained shadow.
- Icons and labels in compact action rows sit on one horizontal line.
- Touch targets remain comfortable; density must not make controls hard to tap.
- No neon, glow, dark navy surfaces, blue borders, or decorative gradients.
- The header is shared; each app may provide its own smaller app name and page content.

## 3. Main navigation contract

E-Library has exactly four top-level destinations:

1. `library` — Könyvtár
2. `share` — Megosztás
3. `reader` — Olvasó
4. `tools` — Eszközök

There is no separate Editor main-menu item.

The bottom navigation always displays these four destinations on mobile. Labels must stay on one line (including “Megosztás”). The active item uses the soft-primary surface and primary icon/text.

### Main navigation markup

```html
<nav class="grapes-bottom-nav" aria-label="Fő navigáció">
  <button type="button" data-route="library">Könyvtár</button>
  <button type="button" data-route="share">Megosztás</button>
  <button type="button" data-route="reader">Olvasó</button>
  <button type="button" data-route="tools">Eszközök</button>
</nav>
```

### Navigation CSS

```css
.grapes-bottom-nav {
  position: fixed;
  z-index: 30;
  inset: auto 0 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  padding: 8px 8px max(8px, env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, .97);
  border-top: 1px solid var(--grapes-border);
}

.grapes-bottom-nav button {
  min-width: 0;
  min-height: 54px;
  padding: 7px 2px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--grapes-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.grapes-bottom-nav button[aria-current="page"] {
  background: var(--grapes-primary-soft);
  color: var(--grapes-primary);
}
```

## 4. E-Library page hierarchy

```text
Grapes App Shell
├── Shared header
│   ├── Official Grapes logo
│   ├── Grapes wordmark
│   ├── App name: E-Library
│   └── Bejelentkezés action
├── Main navigation
│   ├── Könyvtár
│   │   ├── Book cover mosaic
│   │   │   ├── Tap cover -> book view / existing open-book flow
│   │   │   └── Floating pencil action -> selected book detail
│   │   ├── Upload
│   │   └── Refresh library
│   ├── Megosztás
│   │   ├── QR transfer
│   │   ├── Pairing code / broker
│   │   └── Download link
│   ├── Olvasó
│   │   └── Existing reader handoff / code entry
│   └── Eszközök
│       ├── Existing connection settings
│       └── Existing supported device/sync functions
└── Nested Library routes (Library remains active)
    └── Book detail / editing hub
        ├── Alapadatok
        ├── Borító és fájl
        ├── Tartalomjegyzék
        ├── Szöveg és betűkép
        ├── Keresés és csere
        ├── Szerkezeti műveletek
        └── Ellenőrzés
            Each item opens its own full-page subview.
```

## 5. Book mosaic and editing flow

- The Library is the only entry point for book editing.
- Every book cover has a small floating pencil button overlaid on the cover.
- Tapping the cover follows the existing open/view-book behavior.
- Tapping the pencil opens the selected book's detail/editing hub directly.
- The selected book's real cover, title, author, and file metadata are shown.
- The detail hub has no extra “Könyv adatlapja / EPUB · Szerkesztés / Módosítható” banner row.
- Editing categories are compact horizontal rows: icon, label, chevron all on one line.
- Selecting a category opens a full-page subview, not an expanded inline panel.
- No fabricated capabilities or sample book data are shipped as real library content.

## 6. Navigation and Android Back contract

**The app never renders its own back arrow or back button.** This applies to the header, book detail, and every nested editing page.

- Navigation between nested views is represented in the app's navigation stack/history.
- Android system Back button and Back gesture navigate to the previous view.
- From an editing subview, system Back returns to the book detail/editing hub.
- From the book detail/editing hub, system Back returns to the Library mosaic.
- The bottom navigation remains visible and highlights **Könyvtár** throughout book detail and all editing subviews.
- Switching to another top-level destination updates the active bottom-nav item.
- Do not create a custom in-app back affordance as a substitute for native Android navigation.

### Minimal browser-history navigation example

```js
const routeStack = [{ main: "library", page: "mosaic" }];

function currentRoute() {
  return routeStack[routeStack.length - 1];
}

function navigate(route) {
  routeStack.push(route);
  history.pushState(route, "");
  renderRoute(route);
}

function navigateMain(main) {
  routeStack.length = 0;
  const route = { main, page: "root" };
  routeStack.push(route);
  history.pushState(route, "");
  renderRoute(route);
}

window.addEventListener("popstate", (event) => {
  if (routeStack.length > 1) routeStack.pop();
  renderRoute(event.state || currentRoute());
});

// Pencil on a book cover:
function editBook(bookId) {
  navigate({ main: "library", page: "book-detail", bookId });
}

// Select an editing category:
function openBookEditor(bookId, section) {
  navigate({ main: "library", page: "book-editor", bookId, section });
}
```

Implementation note: the production router must initialize a valid history entry and handle WebView/native back integration without double-popping. The snippet defines the route contract; it is not a drop-in replacement for the existing app router.

## 7. Authentication contract

- The right-side header button is labelled **Bejelentkezés** when signed out.
- It calls the existing authentication entry point; it must not implement a second Google OAuth flow.
- After successful authentication, the button may change to the app's existing account state/menu.
- Drive connection status belongs inside the relevant Tools/connection settings view, not in the shared header.
- Never show a “connected” state unless the existing auth/Drive integration confirms it.

## 8. Functional integrity and non-goals

This standard is a shared shell and navigation contract. It does not authorize inventing or replacing business functionality.

- Preserve current Google Drive, EPUB editor, metadata, cover, TOC, search/replace, validation, QR, broker, and reader handoff implementations.
- Do not claim the handoff page is a full EPUB reader.
- Preserve the known Android WebView limitations for USB/File System Access sync.
- Preserve existing IDs, handlers, storage behavior, permissions, and data formats when integrating the shell.
- The official Grapes logo asset and the production authentication callback must be injected by each host app; neither is fabricated in this document.

## 9. Adoption checklist for every Grapes app

- [ ] Use the shared header markup and CSS contract.
- [ ] Supply the official Grapes logo asset.
- [ ] Display Grapes wordmark and smaller app name.
- [ ] Use the shared right-side authentication action.
- [ ] Define only the app's real top-level destinations.
- [ ] Keep nested pages under their parent destination.
- [ ] Keep active navigation state correct on nested pages.
- [ ] Use system Back/history; render no in-app back arrow.
- [ ] Preserve existing feature handlers and data behavior.
- [ ] Verify touch targets, safe areas, and one-line nav labels on Android.
