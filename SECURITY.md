# Security — COD Leak Calculator

Static app posture, stated plainly. This version has no server, no
accounts and no database, so there is nothing to log into and nothing
to leak to another user. Everything a store owner types stays in their
own browser.

- Saved scenarios live in the browser's localStorage under one key.
  Clearing the browser's site data wipes them, and no copy exists
  anywhere else unless the owner downloads the backup JSON.
- Scenario and store names come from the owner, so they are escaped
  before they reach the page. A name can never become markup.
- CSV import validates its header and reports duplicates and malformed
  rows by name instead of merging them quietly.
- The page loads two Google Fonts stylesheets at view time, like the
  previous version did. With no network, the page still works and falls
  back to system fonts.

Not done, on purpose, for a local tool: there is no sync, no sharing
and no access control, because there is no second user to protect
anything from. Anyone with the device and the browser profile can open
the saved scenarios, so this is a single-owner tool, not a shared one.
