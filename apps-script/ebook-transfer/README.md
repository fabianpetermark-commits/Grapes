# E-book broker deployment

The Pages app and this Apps Script web app are deployed separately. A successful
Pages build does not update the broker. Deploy this broker before publishing a
frontend that requests `embed=1`; older broker versions reject iframe embedding.

## One-time authentication

The workflow requires a repository Actions secret named `CLASPRC_JSON`. Its value
is the complete clasp authentication JSON from the account that owns the Apps
Script project. It contains credentials: never commit it or paste it into an
issue, pull request, or chat.

1. On your own computer, run `npx @google/clasp login` and sign in with the project
   owner's account. Complete Google's consent yourself.
2. Enable the Google Apps Script API in the account's Apps Script settings if it
   is disabled.
3. Save the resulting `$HOME/.clasprc.json` contents as the repository Actions
   secret `CLASPRC_JSON` in GitHub Settings → Secrets and variables → Actions.
4. Run **Deploy Grapes ebook Apps Script**. Verify that source upload, version
   creation, and deployment update all succeed. An existing deployment ID alone
   does not prove the new version is live.

The workflow targets the project and existing deployment configured in
`.github/workflows/deploy-ebook-apps-script.yml`. Preserve the deployment's
existing access settings. Authentication cannot be repaired by changing source
code or substituting a public OAuth client ID for the missing secret.

## Manual release

The owner can instead copy `Code.gs` into that project's Apps Script editor,
save, then use **Deploy → Manage deployments → Edit → New version → Deploy**.
Updating the existing deployment preserves reader links. This updates the web
app, but does not configure future GitHub deployments.

## Release checks

- Run `npm run test:ebook` and `npm run build` from the repository root.
- Request a book code and a reader-pairing code from Grapes. Each code must appear
  inside the current page, without opening a new tab. Check an error response too.
- Refresh a connected Grapes tab: its unexpired Drive session should survive.
  Once the token expires, reconnect from a user click; the remembered account is
  supplied as Google's `login_hint`, but Google can still require interaction.
- Access tokens are stored only for their remaining lifetime in sessionStorage.
  Closing the tab is not a permanent offline Google login. No refresh token or
  broader Drive permission is requested by the frontend.

The reader's persistent device token is separate from the browser's Drive token.
