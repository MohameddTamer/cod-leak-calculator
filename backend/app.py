#!/usr/bin/env python3
# COD leak calculator with saved scenarios. Stores keep their numbers instead of retyping them.
# One file API on purpose, sqlite underneath, nothing to install.
import csv, hashlib, hmac, io, json, logging, os, re, secrets, sqlite3, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

DB = os.environ.get("COD_LEAK_DB", os.path.join(os.path.dirname(__file__), "cod_leak.db"))
LOG_FILE = os.environ.get("COD_LEAK_LOG", os.path.join(os.path.dirname(__file__), "app.log"))
TOKEN_TTL = int(os.environ.get("COD_LEAK_TOKEN_TTL", str(8 * 3600)))
TOKENS = {}
logging.basicConfig(filename=LOG_FILE, level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cod_leak")


def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_pw(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000).hex()


def compute(s):
    orders = float(s["orders_per_month"])
    rate = float(s["failure_rate_pct"])
    per_failed = 2 * float(s["shipping_one_way"]) + float(s["packaging_cost"])
    failed = orders * rate / 100.0
    monthly = failed * per_failed
    # The saving from a five point drop cannot exceed the failures that exist.
    saving = orders * min(5.0, rate) / 100.0 * per_failed
    return {
        "failed_orders": round(failed, 1),
        "cost_per_failed": round(per_failed, 2),
        "monthly_loss": round(monthly, 2),
        "yearly_loss": round(monthly * 12, 2),
        "saving_if_rate_drops_5pts": round(saving, 2),
    }


def with_computed(row):
    out = dict(row)
    out.update(compute(out))
    return out


def validate_scenario(data):
    name = str(data.get("name", "")).strip()[:80]
    if not name:
        return None, "scenario name is required"
    try:
        orders = float(data.get("orders_per_month"))
        rate = float(data.get("failure_rate_pct"))
        ship = float(data.get("shipping_one_way"))
        pack = float(data.get("packaging_cost"))
    except (TypeError, ValueError):
        return None, "orders, failure rate, shipping and packaging must be numbers"
    if orders < 0 or ship < 0 or pack < 0:
        return None, "orders and costs cannot be negative"
    if not 0 <= rate <= 100:
        return None, "failure rate must be between 0 and 100"
    return {"name": name, "orders_per_month": orders, "failure_rate_pct": rate,
            "shipping_one_way": ship, "packaging_cost": pack}, None


SCENARIO_COLS = "name, orders_per_month, failure_rate_pct, shipping_one_way, packaging_cost"


class H(BaseHTTPRequestHandler):
    def _send(self, code, payload, content_type="application/json; charset=utf-8", extra=None):
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _auth(self):
        tok = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        s = TOKENS.get(tok)
        return s["user"] if s and s["expires"] > time.time() else None

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 200000:
            return None
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return None

    def do_POST(self):
        path = urlparse(self.path).path
        data = self._body()
        if data is None:
            return self._send(400, {"error": "bad body"})
        if path == "/api/login":
            user = str(data.get("username", ""))[:40]
            pw = str(data.get("password", ""))[:100]
            conn = db()
            row = conn.execute("SELECT * FROM users WHERE username=?", (user,)).fetchone()
            conn.close()
            if not row or not hmac.compare_digest(hash_pw(pw, bytes.fromhex(row["salt"])), row["pw_hash"]):
                log.warning("failed login for %s", user)
                return self._send(401, {"error": "wrong username or password"})
            tok = secrets.token_urlsafe(32)
            TOKENS[tok] = {"user": user, "expires": time.time() + TOKEN_TTL}
            log.info("login for %s", user)
            return self._send(200, {"token": tok, "user": user, "role": row["role"]})
        user = self._auth()
        if not user:
            return self._send(401, {"error": "login required"})
        conn = db()
        if path == "/api/stores":
            name = str(data.get("name", "")).strip()[:80]
            currency = str(data.get("currency", "EGP")).strip()[:8] or "EGP"
            if not name:
                conn.close()
                return self._send(400, {"error": "store name is required"})
            try:
                cur = conn.execute("INSERT INTO stores (name, currency) VALUES (?,?)", (name, currency))
                conn.commit()
            except sqlite3.IntegrityError:
                conn.close()
                return self._send(409, {"error": "a store with that name already exists"})
            new_id = cur.lastrowid
            conn.close()
            log.info("%s created store %s", user, name)
            return self._send(201, {"ok": True, "id": new_id})
        if path == "/api/scenarios":
            values, err = validate_scenario(data)
            try:
                store_id = int(data.get("store_id"))
            except (TypeError, ValueError):
                conn.close()
                return self._send(400, {"error": "store_id is required"})
            if err:
                conn.close()
                return self._send(400, {"error": err})
            if not conn.execute("SELECT id FROM stores WHERE id=?", (store_id,)).fetchone():
                conn.close()
                return self._send(404, {"error": "store not found"})
            try:
                cur = conn.execute(
                    f"INSERT INTO scenarios (store_id, {SCENARIO_COLS}) VALUES (?,?,?,?,?,?)",
                    (store_id, values["name"], values["orders_per_month"], values["failure_rate_pct"],
                     values["shipping_one_way"], values["packaging_cost"]))
                conn.commit()
            except sqlite3.IntegrityError:
                conn.close()
                return self._send(409, {"error": "this store already has a scenario with that name"})
            new_id = cur.lastrowid
            conn.close()
            log.info("%s saved scenario %s for store %s", user, values["name"], store_id)
            return self._send(201, {"ok": True, "id": new_id})
        if path == "/api/import":
            return self._import(conn, data, user)
        m = re.fullmatch(r"/api/scenarios/(\d+)", path)
        if m and self.command == "POST":
            conn.close()
            return self._send(405, {"error": "use PUT to update a scenario"})
        conn.close()
        return self._send(404, {"error": "not found"})

    def _import(self, conn, data, user):
        # The csv text arrives in the json body so the browser needs no multipart handling.
        try:
            store_id = int(data.get("store_id"))
        except (TypeError, ValueError):
            conn.close()
            return self._send(400, {"error": "store_id is required"})
        if not conn.execute("SELECT id FROM stores WHERE id=?", (store_id,)).fetchone():
            conn.close()
            return self._send(404, {"error": "store not found"})
        text = str(data.get("csv", ""))
        reader = csv.DictReader(io.StringIO(text))
        needed = ["name", "orders_per_month", "failure_rate_pct", "shipping_one_way", "packaging_cost"]
        if reader.fieldnames is None or any(c not in reader.fieldnames for c in needed):
            conn.close()
            return self._send(400, {"error": "csv header must be: " + ",".join(needed)})
        imported, rejected = 0, []
        seen_names = set()
        existing = {r["name"].lower() for r in conn.execute("SELECT name FROM scenarios WHERE store_id=?", (store_id,))}
        for lineno, raw in enumerate(reader, start=2):
            if None in raw or any(v is None for v in raw.values()):
                rejected.append({"row": lineno, "name": "", "reason": "wrong number of fields"})
                continue
            values, err = validate_scenario(raw)
            if err:
                rejected.append({"row": lineno, "name": str(raw.get("name", ""))[:80], "reason": err})
                continue
            key = values["name"].lower()
            if key in seen_names:
                rejected.append({"row": lineno, "name": values["name"], "reason": "duplicate name inside the file"})
                continue
            if key in existing:
                rejected.append({"row": lineno, "name": values["name"], "reason": "store already has a scenario with that name"})
                continue
            seen_names.add(key)
            conn.execute(f"INSERT INTO scenarios (store_id, {SCENARIO_COLS}) VALUES (?,?,?,?,?,?)",
                         (store_id, values["name"], values["orders_per_month"], values["failure_rate_pct"],
                          values["shipping_one_way"], values["packaging_cost"]))
            imported += 1
        conn.commit()
        conn.close()
        log.info("%s imported %s scenarios for store %s, %s rejected", user, imported, store_id, len(rejected))
        return self._send(200, {"imported": imported, "rejected": rejected})

    def do_PUT(self):
        path = urlparse(self.path).path
        if not self._auth():
            return self._send(401, {"error": "login required"})
        m = re.fullmatch(r"/api/scenarios/(\d+)", path)
        if not m:
            return self._send(404, {"error": "not found"})
        data = self._body()
        if data is None:
            return self._send(400, {"error": "bad body"})
        values, err = validate_scenario(data)
        if err:
            return self._send(400, {"error": err})
        conn = db()
        row = conn.execute("SELECT * FROM scenarios WHERE id=?", (int(m.group(1)),)).fetchone()
        if not row:
            conn.close()
            return self._send(404, {"error": "scenario not found"})
        try:
            conn.execute("UPDATE scenarios SET name=?, orders_per_month=?, failure_rate_pct=?, shipping_one_way=?, "
                         "packaging_cost=?, updated_at=datetime('now') WHERE id=?",
                         (values["name"], values["orders_per_month"], values["failure_rate_pct"],
                          values["shipping_one_way"], values["packaging_cost"], row["id"]))
            conn.commit()
        except sqlite3.IntegrityError:
            conn.close()
            return self._send(409, {"error": "this store already has a scenario with that name"})
        conn.close()
        log.info("scenario %s updated", m.group(1))
        return self._send(200, {"ok": True})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if not self._auth():
            return self._send(401, {"error": "login required"})
        m = re.fullmatch(r"/api/scenarios/(\d+)", path)
        if not m:
            return self._send(404, {"error": "not found"})
        conn = db()
        cur = conn.execute("DELETE FROM scenarios WHERE id=?", (int(m.group(1)),))
        conn.commit()
        gone = cur.rowcount
        conn.close()
        if not gone:
            return self._send(404, {"error": "scenario not found"})
        log.info("scenario %s deleted", m.group(1))
        return self._send(200, {"ok": True})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path in ("/", "/index.html"):
            fpath = os.path.join(os.path.dirname(__file__), "..", "frontend", "index.html")
            with open(fpath, "rb") as fh:
                body = fh.read()
            return self._send(200, body, "text/html; charset=utf-8")
        if path == "/api/health":
            return self._send(200, {"ok": True})
        if not path.startswith("/api/"):
            return self._send(404, {"error": "not found"})
        if not self._auth():
            return self._send(401, {"error": "login required"})
        q = parse_qs(parsed.query)
        conn = db()
        if path == "/api/stores":
            payload = {"stores": [dict(r) for r in conn.execute("SELECT * FROM stores ORDER BY name")]}
        elif path == "/api/scenarios":
            sql, args = "SELECT * FROM scenarios WHERE 1=1", []
            store_id = (q.get("store_id") or [""])[0]
            needle = (q.get("q") or [""])[0].strip()[:60]
            if store_id.isdigit():
                sql += " AND store_id=?"; args.append(int(store_id))
            if needle:
                sql += " AND name LIKE ?"; args.append(f"%{needle}%")
            sql += " ORDER BY updated_at DESC, id DESC LIMIT 300"
            payload = {"scenarios": [with_computed(r) for r in conn.execute(sql, args)]}
        elif path == "/api/history":
            rows = conn.execute(
                "SELECT s.*, st.name AS store_name FROM scenarios s JOIN stores st ON st.id = s.store_id "
                "ORDER BY s.updated_at DESC, s.id DESC LIMIT 20").fetchall()
            payload = {"history": [with_computed(r) for r in rows]}
        elif path == "/api/compare":
            raw_ids = (q.get("ids") or [""])[0]
            ids = [int(x) for x in raw_ids.split(",") if x.strip().isdigit()]
            if not ids:
                store_id = (q.get("store_id") or [""])[0]
                if store_id.isdigit():
                    ids = [r["id"] for r in conn.execute("SELECT id FROM scenarios WHERE store_id=?", (int(store_id),))]
            if not ids:
                conn.close()
                return self._send(400, {"error": "pass ids=1,2,3 or a store_id"})
            marks = ",".join("?" * len(ids))
            rows = [with_computed(r) for r in conn.execute(f"SELECT * FROM scenarios WHERE id IN ({marks})", ids)]
            rows.sort(key=lambda r: -r["monthly_loss"])
            payload = {"comparison": rows,
                       "worst_monthly_loss": rows[0]["monthly_loss"] if rows else 0,
                       "best_monthly_loss": rows[-1]["monthly_loss"] if rows else 0}
        elif path == "/api/backup":
            stores = [dict(r) for r in conn.execute("SELECT * FROM stores ORDER BY id")]
            scenarios = [dict(r) for r in conn.execute("SELECT * FROM scenarios ORDER BY id")]
            users = [dict(r) for r in conn.execute("SELECT id, username, role FROM users ORDER BY id")]
            payload = {"exported_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "stores": stores,
                       "scenarios": scenarios, "users": users}
            conn.close()
            log.info("backup exported")
            return self._send(200, payload, extra={"Content-Disposition": "attachment; filename=cod-leak-backup.json"})
        else:
            conn.close()
            return self._send(404, {"error": "not found"})
        conn.close()
        return self._send(200, payload)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("COD_LEAK_PORT", os.environ.get("PORT", "8084")))
    print(f"COD leak calculator on http://127.0.0.1:{port}")
    log.info("server started on port %s", port)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
