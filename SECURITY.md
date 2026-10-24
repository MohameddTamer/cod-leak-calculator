# Security — COD Leak Calculator

Local demo posture, stated plainly. This version runs on one machine for one
store's numbers; it is not hardened for the public internet.

- Passwords are stored as PBKDF2 hashes with a per-user salt. The demo
  accounts (owner / demo1234, analyst / demo1234) are printed in the README
  on purpose and must be changed before real store figures go in.
- Every route except login sits behind a bearer token, and scenarios are
  scoped per store, so one store's saved numbers are never another's.
- All SQL is parameterised. Scenario math is computed on the server from the
  four stored inputs; the client cannot invent a monthly loss.
- CSV import validates its header and reports duplicates and malformed rows
  by name instead of merging them quietly. Backup export requires a token.

Not done, on purpose, for a local demo: no TLS, no rate limiting on login,
tokens live in server memory and die with the process. Put it behind a real
proxy and a real secret before it leaves the building.
