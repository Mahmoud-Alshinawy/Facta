"""Disposable loopback SQL bridge for browser integration, NOT Supabase Auth/PostgREST.

Only creates/drops its own random database. No .env, app keys or remote DSN.
Bearer fixture.<uuid> selects a synthetic actor; JWT signatures are NOT tested.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[1]
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
THIRD = "88888888-8888-4888-8888-888888888888"
NEW_USER = "99999999-9999-4999-8999-999999999999"
SEATS = [str(uuid.UUID(int=100 + n)) for n in range(5)]
ACTORS = [OWNER, OTHER, THIRD, NEW_USER, *SEATS]
NOW = "2026-10-20T09:00:00Z"

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--postgres-port", type=int, required=True)
    p.add_argument("--postgres-user", default="postgres")
    args = p.parse_args()
    base = dict(host="127.0.0.1", port=args.postgres_port, user=args.postgres_user,
                password=os.environ.get("FACTA_TEST_PG_PASSWORD", ""), autocommit=True, connect_timeout=5)
    dbname = "facta_shared_client_" + uuid.uuid4().hex[:16]
    admin = psycopg.connect(dbname="postgres", **base)
    admin.execute(sql.SQL("create database {}").format(sql.Identifier(dbname)))

    def connect(actor=None):
        c = psycopg.connect(dbname=dbname, **base)
        if actor is not None:
            if actor not in ACTORS:
                c.close()
                raise ValueError("Unknown disposable actor")
            c.execute("select set_config('request.jwt.claim.sub',%s,false)", (actor,))
            c.execute("set role authenticated")
        return c

    def command(actor, operation, payload, command_id=None):
        with connect(actor) as c:
            return c.execute("select public.facta_shared_command(%s,%s,%s)",
                (command_id or uuid.uuid4(), operation, Jsonb(payload))).fetchone()[0]

    def clock(value):
        with connect() as c:
            c.execute("update facta_private.shared_client_clock set at=%s::timestamptz", (value,))

    server = None
    try:
        with connect() as c:
            c.execute("""do $$ begin
              if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
              if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
            end $$;
            create schema auth;
            create table auth.users(id uuid primary key);
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            grant usage on schema auth to anon,authenticated;
            grant execute on function auth.uid() to anon,authenticated;""")
            for file in ["20261016120000_goals_events.sql", "20261022140000_notes_diary.sql", "20261024160000_shared_goals.sql"]:
                c.execute((ROOT / "supabase/migrations" / file).read_text(encoding="utf-8"))
            # Supabase public-schema default grants, explicit in this scaffold.
            c.execute("grant select,insert,update,delete on public.goals,public.events to authenticated")
            c.execute("create table facta_private.shared_client_clock(at timestamptz not null)")
            c.execute("insert into facta_private.shared_client_clock values('2026-10-14 09:00Z')")
            for name in ["sg_now", "sg_read_now"]:
                c.execute(sql.SQL("create or replace function facta_private.{}() returns timestamptz language sql volatile security definer set search_path='' as 'select at from facta_private.shared_client_clock'").format(sql.Identifier(name)))
            for actor in ACTORS:
                c.execute("insert into auth.users(id) values(%s)", (actor,))
        for n, actor in enumerate([OWNER, OTHER, THIRD]):
            assert command(actor, "set_profile", dict(handle=f"client_{n}", display_name=f"Client {n}"))["ok"]
        for n, actor in enumerate(SEATS):
            assert command(actor, "set_profile", dict(handle=f"seat_{n}", display_name=f"Seat {n}"))["ok"]

        def group(owner, member, name):
            draft = command(owner, "create_draft", dict(name=name, template="gym", schedule_kind="n", time_zone="Asia/Riyadh", round_weekday=1, target=2))
            assert draft["ok"]
            gid = draft["group_id"]
            assert command(owner, "publish", dict(group_id=gid, expected_revision=1, first_round_date="2026-10-19"))["ok"]
            link = command(owner, "issue_link", dict(group_id=gid))
            assert command(member, "join", dict(token=link["token"], target=2))["ok"]
            return gid

        group_id = group(OWNER, OTHER, "Client integration")
        other_group = group(OTHER, THIRD, "Other account")
        clock(NOW)
        state = dict(missing=False, drop_command=False, malformed=False, hold_command=False, hold_snapshot=False)
        metrics = dict(commands=[], snapshots=[], previews=[], personal_writes=0, held=False)
        lock = threading.Lock()
        released = threading.Event()
        released.set()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass  # Never log bearer tokens, URLs or request bodies.

            def send(self, status, value):
                try:
                    body = json.dumps(value, separators=(",", ":")).encode()
                    self.send_response(status)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError):
                    pass

            def do_OPTIONS(self):
                self.send_response(204)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
                self.send_header("Access-Control-Allow-Headers", self.headers.get("Access-Control-Request-Headers", "authorization,apikey,content-type,prefer,x-client-info"))
                self.end_headers()

            def actor(self):
                token = self.headers.get("Authorization", "").removeprefix("Bearer fixture.")
                if token not in ACTORS:
                    raise ValueError("Unknown disposable actor")
                return token

            def do_GET(self):
                path = urlparse(self.path)
                if path.path == "/test/config":
                    return self.send(200, dict(owner=OWNER, other=OTHER, third=THIRD, newUser=NEW_USER, seats=SEATS, groupId=group_id, otherGroupId=other_group, now=NOW))
                if path.path == "/test/metrics":
                    with lock:
                        return self.send(200, json.loads(json.dumps(metrics)))
                try:
                    table = path.path.removeprefix("/rest/v1/")
                    if table not in ["goals", "events", "notes", "diary_entries"]:
                        return self.send(404, {})
                    query = parse_qs(path.query)
                    where, params = [], []
                    if "user_id" in query:
                        where.append(sql.SQL("user_id=%s"))
                        params.append(str(uuid.UUID(query["user_id"][0].removeprefix("eq."))))
                    if "id" in query:
                        ids = query["id"][0].removeprefix("in.(").removesuffix(")")
                        where.append(sql.SQL("id=any(%s::uuid[])"))
                        params.append([str(uuid.UUID(v.strip('"'))) for v in ids.split(",")])
                    statement = sql.SQL("select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select * from public.{} {} order by id limit %s offset %s) t").format(
                        sql.Identifier(table), sql.SQL("where ") + sql.SQL(" and ").join(where) if where else sql.SQL(""))
                    params += [min(int(query.get("limit", [1000])[0]), 1000), int(query.get("offset", [0])[0])]
                    with connect(self.actor()) as c:
                        return self.send(200, c.execute(statement, params).fetchone()[0])
                except psycopg.Error as e:
                    self.send(400, dict(code=e.sqlstate, message="Disposable SQL request failed"))
                except Exception:
                    self.send(400, dict(code="FIXTURE", message="Invalid fixture request"))

            def do_POST(self):
                try:
                    raw = self.rfile.read(int(self.headers.get("Content-Length", "0"))).decode()
                    body = json.loads(raw or "{}")
                    path = urlparse(self.path).path
                    if path == "/test/control":
                        action = body["action"]
                        if action in state:
                            with lock:
                                state[action] = bool(body.get("value", True))
                        elif action == "release":
                            released.set()
                        elif action == "clock":
                            clock(body["now"])
                        elif action == "command":
                            return self.send(200, command(body["actor"], body["operation"], body["payload"]))
                        elif action == "stop":
                            released.set()
                            threading.Thread(target=server.shutdown, daemon=True).start()
                        else:
                            raise ValueError()
                        return self.send(200, dict(ok=True))
                    actor = self.actor()
                    name = path.removeprefix("/rest/v1/rpc/")
                    shared = name.startswith("facta_shared_")
                    with lock:
                        missing = shared and state["missing"]
                        malformed = name == "facta_shared_snapshot" and state["malformed"]
                        if malformed:
                            state["malformed"] = False
                        hold_key = "hold_command" if name == "facta_shared_command" else "hold_snapshot" if name == "facta_shared_snapshot" else None
                        hold = bool(hold_key and state[hold_key])
                        if hold:
                            state[hold_key] = False
                            metrics["held"] = True
                            released.clear()
                    if missing:
                        return self.send(404, dict(code="PGRST202", message="Shared fixture unavailable"))
                    if malformed:
                        return self.send(200, {"groups": []})
                    with connect(actor) as c:
                        if name == "facta_shared_snapshot":
                            result = c.execute("select public.facta_shared_snapshot(%s,%s)", (body["history_from"], body["history_until"])).fetchone()[0]
                            with lock:
                                metrics["snapshots"].append(actor)
                        elif name == "facta_shared_command":
                            result = c.execute("select public.facta_shared_command(%s,%s,%s)", (body["command_id"], body["operation"], Jsonb(body["payload"]))).fetchone()[0]
                            # Only check-in envelopes enter captured evidence, never links.
                            with lock:
                                metrics["commands"].append(dict(actor=actor, commandId=body["command_id"], operation=body["operation"], body=raw if body["operation"] == "set_checkin" else None, code=result["code"]))
                        elif name == "facta_shared_preview":
                            result = c.execute("select public.facta_shared_preview(%s)", (body["token"],)).fetchone()[0]
                            with lock:
                                metrics["previews"].append(actor)
                        elif name == "facta_shared_pending_invites":
                            result = c.execute("select public.facta_shared_pending_invites()").fetchone()[0]
                        elif name == "facta_write_diary":
                            rows = c.execute("select to_jsonb(t) from public.facta_write_diary(%s) t", (Jsonb(body["entry"]),)).fetchall()
                            result = [r[0] for r in rows]
                            with lock:
                                metrics["personal_writes"] += len(rows)
                        else:
                            table = path.removeprefix("/rest/v1/")
                            if table not in ["goals", "events", "notes"]:
                                return self.send(404, {})
                            rows = body if isinstance(body, list) else [body]
                            result = []
                            allowed = {r[0] for r in c.execute("select column_name from information_schema.columns where table_schema='public' and table_name=%s", (table,))}
                            with c.transaction():
                                for row in rows:
                                    if not row or not set(row).issubset(allowed):
                                        raise ValueError()
                                    columns = list(row)
                                    values = [Jsonb(v) if table == "notes" and k == "body" else v for k, v in row.items()]
                                    statement = sql.SQL("insert into public.{} ({}) values ({}) on conflict(id) do update set {} returning to_jsonb({})").format(
                                        sql.Identifier(table), sql.SQL(",").join(map(sql.Identifier, columns)), sql.SQL(",").join(sql.Placeholder() for _ in columns),
                                        sql.SQL(",").join(sql.SQL("{}=excluded.{}").format(sql.Identifier(k), sql.Identifier(k)) for k in columns if k != "id"), sql.Identifier(table))
                                    result.extend(r[0] for r in c.execute(statement, values).fetchall())
                            with lock:
                                metrics["personal_writes"] += len(result)
                    if hold:
                        released.wait(15)
                        with lock:
                            metrics["held"] = False
                    with lock:
                        drop = name == "facta_shared_command" and state["drop_command"]
                        if drop:
                            state["drop_command"] = False
                    if drop:
                        self.connection.shutdown(socket.SHUT_RDWR)
                        self.connection.close()
                        return
                    self.send(200, result)
                except psycopg.Error as e:
                    self.send(400, dict(code=e.sqlstate, message="Disposable SQL request failed"))
                except Exception:
                    self.send(400, dict(code="FIXTURE", message="Invalid fixture request"))

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        print(json.dumps(dict(url=f"http://127.0.0.1:{server.server_port}", database=dbname, auth="fixture claims only; no JWT verification")), flush=True)
        server.serve_forever()
    finally:
        if server:
            server.server_close()
        admin.execute(sql.SQL("drop database {}").format(sql.Identifier(dbname)))
        admin.close()

if __name__ == "__main__":
    main()
