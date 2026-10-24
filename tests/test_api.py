#!/usr/bin/env python3
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error

ROOT = os.path.join(os.path.dirname(__file__), "..")
PORT = "8096"
BASE = f"http://127.0.0.1:{PORT}"
RESULTS = []

def check(name, cond):
    RESULTS.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)

def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            try:
                return r.status, json.loads(raw or b"{}")
            except json.JSONDecodeError:
                return r.status, {"raw": raw.decode("utf-8", "replace")}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return e.code, {"raw": raw.decode("utf-8", "replace")}

def main():
    tmp = tempfile.mkdtemp(prefix="codleak-")
    env = dict(os.environ, COD_LEAK_PORT=PORT, COD_LEAK_DB=os.path.join(tmp, "test.db"),
               COD_LEAK_LOG=os.path.join(tmp, "app.log"))
    subprocess.run([sys.executable, "seed.py"], cwd=os.path.join(ROOT, "backend"), check=True, env=env)
    srv = subprocess.Popen([sys.executable, "app.py"], cwd=os.path.join(ROOT, "backend"), env=env)
    try:
        time.sleep(1.2)
        code, _ = call("GET", "/api/stores")
        check("no token is refused with 401", code == 401)
        code, _ = call("GET", "/api/stores", token="made-up-token")
        check("a forged token is refused with 401", code == 401)
        code, _ = call("POST", "/api/login", {"username": "owner", "password": "wrong"})
        check("a wrong password is refused with 401", code == 401)
        code, body = call("POST", "/api/login", {"username": "owner", "password": "demo1234"})
        check("the demo login returns a token", code == 200 and bool(body.get("token")))
        tok = body["token"]

        code, body = call("GET", "/api/stores", token=tok)
        check("seeded fictional stores are listed", code == 200 and len(body["stores"]) == 3)
        store_id = [s for s in body["stores"] if s["name"] == "Nile Linen Co."][0]["id"]

        code, body = call("GET", f"/api/scenarios?store_id={store_id}", token=tok)
        check("seeded scenarios arrive with computed losses", code == 200 and len(body["scenarios"]) == 3
              and body["scenarios"][0]["monthly_loss"] > 0)
        first = [s for s in body["scenarios"] if s["name"] == "October as it happened"][0]
        check("the maths matches the original calculator", first["failed_orders"] == 250.0
              and first["cost_per_failed"] == 145.0 and first["monthly_loss"] == 36250.0
              and first["yearly_loss"] == 435000.0 and first["saving_if_rate_drops_5pts"] == 7250.0)

        payload = {"store_id": store_id, "name": "Test scenario", "orders_per_month": 500,
                   "failure_rate_pct": 20, "shipping_one_way": 50, "packaging_cost": 10}
        code, body = call("POST", "/api/scenarios", payload, tok)
        check("creating a scenario returns its id", code == 201 and body.get("id"))
        new_id = body["id"]
        code, _ = call("POST", "/api/scenarios", payload, tok)
        check("the same scenario name twice in one store is a 409", code == 409)
        code, body = call("POST", "/api/scenarios", {**payload, "name": "Bad rate", "failure_rate_pct": 140}, tok)
        check("a failure rate over 100 is refused", code == 400)
        code, body = call("POST", "/api/scenarios", {**payload, "name": "Ghost store", "store_id": 9999}, tok)
        check("a scenario for a missing store is a 404", code == 404)

        code, body = call("PUT", f"/api/scenarios/{new_id}", {**payload, "failure_rate_pct": 10}, tok)
        check("updating a scenario works", code == 200)
        code, body = call("GET", f"/api/scenarios?store_id={store_id}&q=Test", token=tok)
        check("the update changes the computed loss", code == 200 and body["scenarios"][0]["monthly_loss"] == 5500.0)

        code, body = call("GET", f"/api/compare?store_id={store_id}", token=tok)
        check("comparison returns scenarios sorted by monthly loss", code == 200 and len(body["comparison"]) >= 3
              and body["comparison"][0]["monthly_loss"] >= body["comparison"][-1]["monthly_loss"])

        csv_text = ("name,orders_per_month,failure_rate_pct,shipping_one_way,packaging_cost\n"
                    "Imported one,300,20,50,10\n"
                    "Imported one,300,20,50,10\n"
                    "October as it happened,100,10,50,10\n"
                    "Broken row,abc,20,50,10\n")
        code, body = call("POST", "/api/import", {"store_id": store_id, "csv": csv_text}, tok)
        reasons = " ".join(r["reason"] for r in body.get("rejected", []))
        check("import accepts the one good row", code == 200 and body["imported"] == 1)
        check("import rejects a duplicate inside the file", "duplicate name inside the file" in reasons)
        check("import rejects a name the store already has", "already has a scenario" in reasons)
        check("import rejects a malformed numeric row with its row number",
              any(r["row"] == 5 for r in body["rejected"]))
        code, body = call("POST", "/api/import", {"store_id": store_id, "csv": "wrong,header\n1,2\n"}, tok)
        check("import with a wrong header is refused", code == 400)

        code, body = call("GET", "/api/history", token=tok)
        check("history lists recent scenarios with their store", code == 200 and len(body["history"]) >= 5
              and "store_name" in body["history"][0])
        code, body = call("GET", "/api/backup", token=tok)
        check("backup carries stores and scenarios", code == 200 and len(body["stores"]) == 3 and len(body["scenarios"]) >= 5)
        check("backup never leaks password hashes", "pw_hash" not in json.dumps(body) and "salt" not in json.dumps(body))

        code, _ = call("DELETE", f"/api/scenarios/{new_id}", token=tok)
        check("deleting a scenario works", code == 200)
        code, _ = call("DELETE", f"/api/scenarios/{new_id}", token=tok)
        check("deleting it twice is a 404", code == 404)

        with urllib.request.urlopen(BASE + "/") as r:
            page = r.read().decode()
        check("the frontend is served with the calculator and compare chart code",
              r.status == 200 and "failedCount" in page and "svgCompare" in page and "printView" in page)
        check("the app log file was written", os.path.exists(env["COD_LEAK_LOG"])
              and "login" in open(env["COD_LEAK_LOG"], encoding="utf-8").read())
    finally:
        srv.terminate()
    passed = sum(1 for _, ok in RESULTS if ok)
    print(f"\n{passed}/{len(RESULTS)} checks passed")
    return 0 if passed == len(RESULTS) else 1

if __name__ == "__main__":
    raise SystemExit(main())
