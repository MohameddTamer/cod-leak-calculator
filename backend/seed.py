#!/usr/bin/env python3
# Demo seed. Store names, people and numbers are invented on purpose.
import os, secrets, sqlite3, sys
sys.path.insert(0, os.path.dirname(__file__))
from app import hash_pw, DB

if os.path.exists(DB):
    os.remove(DB)
conn = sqlite3.connect(DB)
conn.executescript("""
CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, salt TEXT, pw_hash TEXT, role TEXT);
CREATE TABLE stores (id INTEGER PRIMARY KEY, name TEXT UNIQUE, currency TEXT DEFAULT 'EGP');
CREATE TABLE scenarios (id INTEGER PRIMARY KEY, store_id INTEGER NOT NULL REFERENCES stores(id),
    name TEXT, orders_per_month REAL, failure_rate_pct REAL, shipping_one_way REAL, packaging_cost REAL,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(store_id, name));
""")
salt = secrets.token_bytes(16)
conn.execute("INSERT INTO users VALUES (1, 'owner', ?, ?, 'owner')", (salt.hex(), hash_pw("demo1234", salt)))
salt2 = secrets.token_bytes(16)
conn.execute("INSERT INTO users VALUES (2, 'analyst', ?, ?, 'analyst')", (salt2.hex(), hash_pw("demo1234", salt2)))
stores = [("Nile Linen Co.", "EGP"), ("Desert Rose Beauty", "EGP"), ("Sahara Home Goods", "EGP")]
conn.executemany("INSERT INTO stores (name, currency) VALUES (?,?)", stores)
rows = [
    (1, "October as it happened", 1000, 25, 65, 15),
    (1, "If confirmation calls land", 1000, 18, 65, 15),
    (1, "Black Friday volume, same rate", 2600, 25, 65, 15),
    (2, "Launch month", 420, 31, 55, 12),
    (2, "After address checks", 420, 22, 55, 12),
    (3, "Steady month", 1500, 19, 70, 18),
    (3, "New courier trial", 1500, 27, 60, 18),
]
conn.executemany(
    "INSERT INTO scenarios (store_id, name, orders_per_month, failure_rate_pct, shipping_one_way, packaging_cost) VALUES (?,?,?,?,?,?)",
    rows)
conn.commit(); conn.close()
print("Seeded", DB, "with", len(stores), "stores and", len(rows), "scenarios")
