# Approved login UI preview

Open `/Grapes/login-preview.html` in the Vite web build, or `login-preview.html` relative to the packaged Android web assets. This dedicated page reproduces the approved `Grapes_Login_Black_Approved_UI.zip` HTML and styling. The normal `index.html` startup, existing Google Drive sign-in, and E-book Drive scopes are unchanged.

The preview only shows informational messages. Its form prevents submission and never reads, saves, verifies, or sends credential values. Password visibility is local to the input. The page is not linked from the app and does not create a logged-in session. Do not use it as an authentication entry point until a separately reviewed integration is complete.

Focused verification: `node tests/login-preview.browser.mjs`. The test checks 320, 360, 390, 412, and 1440 px layouts, approved colors, keyboard focus, labels, visibility state, and absence of external requests or storage writes.
