"""Real PostgreSQL integration tests, only on loopback and a NEW disposable DB.

Requires psycopg[binary] 3.2+. Never reads .env, DATABASE_URL, Supabase keys or
remote connection settings. Each run creates its own facta_shared_test_* DB.
"""
import argparse
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import re
import time
import uuid

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261024160000_shared_goals.sql"
BOOTSTRAP = """
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
"""

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--host", default="127.0.0.1", choices=["127.0.0.1", "::1", "localhost"])
    p.add_argument("--port", type=int, required=True)
    p.add_argument("--user", default="postgres")
    p.add_argument("--keep", action="store_true", help="retain only this run's disposable database")
    p.add_argument("--output", type=Path)
    p.add_argument("--only", choices=["invitation-budget", "profile-budget"],
                   help="run one focused real-SQL review regression in a fresh database")
    args = p.parse_args()
    base = dict(host=args.host, port=args.port, user=args.user, connect_timeout=5,
                password=os.environ.get("FACTA_TEST_PG_PASSWORD", ""), autocommit=True)
    db = "facta_shared_test_" + uuid.uuid4().hex[:16]
    admin = psycopg.connect(dbname="postgres", **base)
    admin.execute(sql.SQL("create database {}").format(sql.Identifier(db)))
    report = {"database": db, "host": args.host, "port": args.port,
              "auth": "local auth.uid/roles scaffold; no HTTP/JWT verification", "concurrency": []}
    try:
        with psycopg.connect(dbname=db, **base) as c:
            report["server"] = c.execute("select version()").fetchone()[0]
            c.execute(BOOTSTRAP)
            if args.only:
                migration = re.sub(r"^(?:begin|commit);[ \t]*\n?", "", MIGRATION.read_text(encoding="utf-8"), flags=re.M)
                source = (ROOT / "supabase/tests/shared_goals.assertions.sql").read_text(encoding="utf-8")
                helpers = source.split("-- 1. Sunday draft", 1)[0]
                block = source.split("-- BEGIN " + args.only + " regression", 1)[1].split("-- END " + args.only + " regression", 1)[0]
                script = "begin;\n" + migration + helpers + block + "\nset constraints all immediate;\nselect 'shared_goals: all SQL assertions passed (focused " + args.only + ")';\nrollback;"
            else:
                script = (ROOT / "supabase/tests/shared_goals.sql").read_text(encoding="utf-8")
            cursor = c.execute(script)
            marker = None
            while True:
                if cursor.description:
                    for row in cursor.fetchall():
                        if len(row) == 1 and isinstance(row[0], str) and row[0].startswith("shared_goals: all SQL assertions passed"):
                            marker = row[0]
                if not cursor.nextset():
                    break
            if marker is None:
                raise AssertionError("Standalone SQL suite did not finish")
            report["sql"] = marker
            if not args.only:
                c.execute(MIGRATION.read_text(encoding="utf-8"))
                report["concurrency"] = concurrency(base, db, c)
                report["coexistence"] = coexistence(c)
                report["history_query"] = history_query(c)
        report["ok"] = True
        print(json.dumps(report, indent=2))
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    except Exception:
        print("FAILED; disposable database retained:", db)
        args.keep = True
        raise
    finally:
        if not args.keep:
            # Never a user-provided name or DROP CASCADE; this freshly-created,
            # random database is the only destructive target this runner knows.
            admin.execute(sql.SQL("drop database {}").format(sql.Identifier(db)))
        admin.close()

def concurrency(base, db, owner):
    """Two real sessions; assert the second is waiting on a PostgreSQL lock.

    The fixture owner holds the first group lock only to choose the race order;
    BOTH mutation commands run under authenticated with separate actor claims.
    No command, constraint, receipt or result is replaced by a mock.
    """
    def uid(n):
        return uuid.UUID(f"bbbbbbbb-0000-4000-8000-{n:012d}")

    # Owner-only fixture in this run's disposable database. A row update can
    # advance time while a real authenticated session waits on a group lock.
    owner.execute("create table facta_private.sg_test_clock(at timestamptz not null)")
    owner.execute("insert into facta_private.sg_test_clock values('2026-10-14 09:00+03')")
    for name in ["sg_now", "sg_read_now"]:
        owner.execute(sql.SQL("create or replace function facta_private.{}() returns timestamptz language sql volatile security definer set search_path='' as 'select at from facta_private.sg_test_clock'").format(sql.Identifier(name)))

    def clock(value):
        owner.execute("update facta_private.sg_test_clock set at=%s", (dt.datetime.fromisoformat(value),))

    def authenticate(c, n):
        c.execute("select set_config('request.jwt.claim.sub',%s,false)", (str(uid(n)),))
        c.execute("set role authenticated")

    def command(n, operation, payload, cid=None):
        with psycopg.connect(dbname=db, **base) as c:
            authenticate(c, n)
            return c.execute("select public.facta_shared_command(%s,%s,%s)",
                             (cid or uuid.uuid4(), operation, Jsonb(payload))).fetchone()[0]

    def expect(outcome, code):
        assert outcome.get("code") == code, (outcome.get("code"), code)

    def group(label, people=2):
        clock("2026-10-14 10:00:00+03")
        r = command(1, "create_draft", dict(name=label, template="gym", schedule_kind="n",
                    time_zone="Asia/Riyadh", round_weekday=1, target=2))
        expect(r, "draft_created")
        gid = r["group_id"]
        expect(command(1, "publish", dict(group_id=gid, expected_revision=1, first_round_date="2026-10-19")), "published")
        invitation = command(1, "issue_link", dict(group_id=gid))
        expect(invitation, "invite_issued")
        for n in range(2, people + 1):
            expect(command(n, "join", dict(token=invitation["token"], target=2)), "joined")
        clock("2026-10-19 12:00:00+03")
        return gid, invitation

    def checkin(gid, n=1, completed=True, base_revision=0):
        member = owner.execute("select id from public.shared_memberships where group_id=%s and user_id=%s and left_at is null", (gid, uid(n))).fetchone()[0]
        return dict(group_id=gid, membership_id=str(member), date="2026-10-19",
                    captured_at="2026-10-19 11:00:00+03", completed=completed, base_revision=base_revision)

    reports = []

    def race(label, gid, a, b, expected_a, expected_b, same_id=False, advance_to=None, transfer_after_first=None):
        cid = uuid.uuid4()
        one = psycopg.connect(dbname=db, **{**base, "autocommit": False}, application_name="facta_shared_race_first")
        second_name = "facta_shared_race_" + uuid.uuid4().hex[:12]
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = None
        try:
            if gid is not None:
                one.execute("select id from public.shared_groups where id=%s for update", (gid,))
            authenticate(one, a[0])
            first = one.execute("select public.facta_shared_command(%s,%s,%s)", (cid, a[1], Jsonb(a[2]))).fetchone()[0]
            expect(first, expected_a)
            if transfer_after_first is not None:
                transfer = one.execute("select public.facta_shared_command(%s,'transfer_owner',%s)",
                    (uuid.uuid4(), Jsonb(dict(group_id=gid, user_id=str(uid(transfer_after_first)))))).fetchone()[0]
                expect(transfer, "owner_transferred")

            def second():
                with psycopg.connect(dbname=db, **{**base, "autocommit": False}, application_name=second_name) as c:
                    authenticate(c, b[0])
                    result = c.execute("select public.facta_shared_command(%s,%s,%s)",
                                       (cid if same_id else uuid.uuid4(), b[1], Jsonb(b[2]))).fetchone()[0]
                    c.commit()
                    return result

            future = executor.submit(second)
            deadline = time.monotonic() + 8
            blocked = None
            while time.monotonic() < deadline:
                blocked = owner.execute("select wait_event from pg_stat_activity where application_name=%s and wait_event_type='Lock'", (second_name,)).fetchone()
                if blocked:
                    break
                if future.done():
                    raise AssertionError("Second session did not wait: " + label)
                time.sleep(0.02)
            assert blocked, "No PostgreSQL lock wait observed: " + label
            if advance_to:
                clock(advance_to)
            one.commit()
            result = future.result(timeout=10)
            expect(result, expected_b)
            reports.append(dict(test=label, first=first["code"], second=result["code"],
                                observed_lock=blocked[0], independent_sessions=True))
            return first, result
        finally:
            one.rollback()
            one.close()
            executor.shutdown(wait=True)

    clock("2026-10-14 09:00:00+03")
    for n in range(1, 14):
        owner.execute("insert into auth.users(id) values(%s)", (uid(n),))
        expect(command(n, "set_profile", dict(handle=f"concurrent_{n}", display_name=f"Concurrent {n}")), "profile_saved")

    gid, invite = group("last seat", 7)
    race("last seat: two joins", gid, (8, "join", dict(token=invite["token"], target=2)),
         (9, "join", dict(token=invite["token"], target=2)), "joined", "full")
    assert owner.execute("select count(*) from public.shared_memberships where group_id=%s and left_at is null", (gid,)).fetchone()[0] == 8

    gid, _ = group("same command")
    body = checkin(gid)
    first, second = race("same command: timeout retry", gid, (1, "set_checkin", body),
                         (1, "set_checkin", body), "checked", "checked", same_id=True)
    assert first == second
    assert owner.execute("select count(*) from public.shared_checkins where group_id=%s", (gid,)).fetchone()[0] == 1

    gid, _ = group("same command changed body")
    race("same UUID with changed body", gid, (1, "set_checkin", checkin(gid)),
         (1, "set_checkin", checkin(gid, completed=False)), "checked", "command_mismatch", same_id=True)
    assert owner.execute("select completed,revision from public.shared_checkins where group_id=%s", (gid,)).fetchone() == (True, 1)

    gid, _ = group("opposing states")
    race("opposite stale states", gid, (1, "set_checkin", checkin(gid)),
         (1, "set_checkin", checkin(gid, completed=False)), "checked", "conflict")
    assert owner.execute("select completed,revision from public.shared_checkins where group_id=%s", (gid,)).fetchone() == (True, 1)

    gid, invite = group("join then revoke")
    race("join before revoke", gid, (3, "join", dict(token=invite["token"], target=2)),
         (1, "revoke_invite", dict(invite_id=invite["invite_id"])), "joined", "revoked")
    gid, invite = group("revoke then join")
    race("revoke before join", gid, (1, "revoke_invite", dict(invite_id=invite["invite_id"])),
         (3, "join", dict(token=invite["token"], target=2)), "revoked", "invalid_invite")
    gid, invite = group("rotate then join")
    first, _ = race("rotate before old-token join", gid, (1, "rotate_invite", dict(invite_id=invite["invite_id"])),
                    (3, "join", dict(token=invite["token"], target=2)), "invite_rotated", "invalid_invite")
    expect(command(3, "join", dict(token=first["token"], target=2)), "joined")

    for archive_first in [False, True]:
        gid, _ = group("archive ordering")
        archive = (1, "archive", dict(group_id=gid))
        tick = (2, "set_checkin", checkin(gid, 2))
        if archive_first:
            race("archive before check-in", gid, archive, tick, "archived", "archived")
        else:
            race("check-in before archive", gid, tick, archive, "checked", "archived")
        count = owner.execute("select count(*) from public.shared_checkins where group_id=%s", (gid,)).fetchone()[0]
        assert count == (0 if archive_first else 1)

    for leave_first in [False, True]:
        gid, _ = group("leave ordering")
        leave = (2, "leave", dict(group_id=gid))
        tick = (2, "set_checkin", checkin(gid, 2))
        if leave_first:
            race("leave before own check-in", gid, leave, tick, "left", "forbidden")
        else:
            race("own check-in before leave", gid, tick, leave, "checked", "left")

    gid, _ = group("target serialization")
    race("two next-round target edits", gid, (2, "set_target", dict(group_id=gid, target=3)),
         (2, "set_target", dict(group_id=gid, target=5)), "target_scheduled", "target_scheduled")
    assert owner.execute("select target from public.shared_targets t join public.shared_memberships m on m.id=t.membership_id where m.group_id=%s and m.user_id=%s and effective_round='2026-10-26'", (gid, uid(2))).fetchone()[0] == 5

    gid, _ = group("ownership transfer ordering")
    race("transfer before new-owner leave", gid, (1, "transfer_owner", dict(group_id=gid, user_id=str(uid(2)))),
         (2, "leave", dict(group_id=gid)), "owner_transferred", "owner_transfer_required")
    gid, _ = group("ownership leave ordering")
    race("member leave before transfer", gid, (2, "leave", dict(group_id=gid)),
         (1, "transfer_owner", dict(group_id=gid, user_id=str(uid(2)))), "left", "owner_transfer_required")
    gid, invite = group("leave then next-round join")
    race("leave before next-round join", gid, (2, "leave", dict(group_id=gid)),
         (3, "join", dict(token=invite["token"], target=2)), "left", "joined")
    assert owner.execute("select not is_active and end_reason='paused' from public.shared_goal_rounds where group_id=%s", (gid,)).fetchone()[0]
    assert owner.execute("select eligible_round='2026-10-26' from public.shared_memberships where group_id=%s and user_id=%s", (gid, uid(3))).fetchone()[0]

    gid, invite = group("join then transfer")
    race("join before ownership transfer", gid, (3, "join", dict(token=invite["token"], target=2)),
         (1, "transfer_owner", dict(group_id=gid, user_id=str(uid(2)))), "joined", "owner_transferred")

    gid, _ = group("wait across boundary")
    clock("2026-10-25 23:59:59.999999+03")
    body = checkin(gid, 2)
    body.update(date="2026-10-26", captured_at="2026-10-26 00:00:00+03")
    race("lock wait crosses round boundary", gid, (1, "set_target", dict(group_id=gid, target=3)),
         (2, "set_checkin", body), "target_scheduled", "checked", advance_to="2026-10-26 00:00:00+03")
    assert owner.execute("select checkin_date='2026-10-26' from public.shared_checkins where group_id=%s", (gid,)).fetchone()[0]
    # Last group allowance: old owner rotates and transfers in one transaction;
    # new owner's queued issuance must see the group's exhausted shared budget.
    gid, invite = group("shared invite budget across transfer")
    clock("2026-10-19 13:00:00+03")
    for _ in range(19):
        expect(command(1, "rotate_invite", dict(invite_id=invite["invite_id"])), "invite_rotated")
    _, denied = race("last group slot survives concurrent transfer", gid,
         (1, "rotate_invite", dict(invite_id=invite["invite_id"])),
         (2, "issue_link", dict(group_id=gid)), "invite_rotated", "rate_limited", transfer_after_first=2)
    assert denied.get("scope") == "group_invites"

    clock("2026-12-12 10:00:00+03")
    for number in [14, 15, 16, 17]:
        owner.execute("insert into auth.users(id) values(%s)", (uid(number),))
    taken = dict(handle="concurrent_1", display_name="Setup")
    for _ in range(9):
        expect(command(14, "set_profile", taken), "handle_taken")
    _, denied = race("last profile availability slot", None,
         (14, "set_profile", taken), (14, "set_profile", taken), "handle_taken", "rate_limited")
    assert denied.get("scope") == "profile_setup"
    # A fresh connection/new UUID cannot escape committed failures.
    expect(command(14, "set_profile", dict(handle="fresh_14", display_name="Setup")), "rate_limited")

    claim = dict(handle="contended_handle", display_name="Winner")
    race("two accounts claim one free handle", None,
         (15, "set_profile", claim), (16, "set_profile", claim), "profile_saved", "handle_taken")
    for _ in range(9):
        expect(command(16, "set_profile", claim), "handle_taken")
    expect(command(16, "set_profile", dict(handle="fresh_16", display_name="Setup")), "rate_limited")

    for _ in range(8):
        expect(command(17, "set_profile", taken), "handle_taken")
    race("concurrent taken-handle receipt retry", None,
         (17, "set_profile", taken), (17, "set_profile", taken), "handle_taken", "handle_taken", same_id=True)
    expect(command(17, "set_profile", taken), "handle_taken")
    expect(command(17, "set_profile", dict(handle="fresh_17", display_name="Setup")), "rate_limited")
    clock("2026-12-12 10:01:00+03")
    expect(command(14, "set_profile", dict(handle="fresh_14", display_name="Setup")), "profile_saved")
    assert len(reports) == 21
    return reports

def coexistence(c):
    """Apply personal schemas only here, after the fresh standalone suite."""
    for filename in ["20261016120000_goals_events.sql", "20261022140000_notes_diary.sql"]:
        c.execute((ROOT / "supabase/migrations" / filename).read_text(encoding="utf-8"))
    actor = "bbbbbbbb-0000-4000-8000-000000000001"
    c.execute("insert into public.goals(user_id,title,category,date) values(%s,'Preserve goal','must-do','2026-10-24')", (actor,))
    c.execute("insert into public.events(user_id,title,date,start_time,end_time,end_date) values(%s,'Preserve event','2026-10-24','10:00','11:00','2026-10-25')", (actor,))
    c.execute("insert into public.notes(user_id,title,body) values(%s,'Preserve note','[]')", (actor,))
    c.execute("insert into public.diary_entries(user_id,date,one_line,mood) values(%s,'2026-10-24','Preserve diary',3)", (actor,))
    personal = ["goals", "events", "notes", "diary_entries"]
    def rows(table):
        return c.execute(sql.SQL("select jsonb_agg(to_jsonb(t) order by id) from public.{} t").format(sql.Identifier(table))).fetchone()[0]
    before = {table: rows(table) for table in personal}
    guard = c.execute("select pg_get_functiondef('public.facta_sync_guard()'::regprocedure)").fetchone()[0]
    c.execute(MIGRATION.read_text(encoding="utf-8"))
    assert all(rows(table) == before[table] for table in personal)
    assert guard == c.execute("select pg_get_functiondef('public.facta_sync_guard()'::regprocedure)").fetchone()[0]
    return dict(personal_rows_preserved=4, personal_sync_guard_unchanged=True, shared_rerun_with_personal_schema=True)

def history_query(c):
    """Inspect a real authenticated history query over a six-year group."""
    actor = "bbbbbbbb-0000-4000-8000-000000000001"
    # Administrative historical facts are fixtures, not a backdating RPC.
    with c.transaction():
        gid = c.execute("""insert into public.shared_groups(owner_id,name,template,schedule_kind,time_zone,round_weekday,first_round_date,published_at,created_at,updated_at)
            values(%s,'Long history fixture','custom','every','UTC',1,'2020-01-06','2020-01-01','2020-01-01','2020-01-01') returning id""", (actor,)).fetchone()[0]
        for number in [1, 2]:
            c.execute("""insert into public.shared_memberships(group_id,user_id,joined_at,eligible_round,created_at,updated_at)
                values(%s,%s,'2020-01-01','2020-01-06','2020-01-01','2020-01-01')""", (gid, f"bbbbbbbb-0000-4000-8000-{number:012d}"))
    c.execute("select set_config('request.jwt.claim.sub',%s,false)", (actor,))
    c.execute("set role authenticated")
    try:
        plan = c.execute("explain(analyze,buffers,format json) select * from public.shared_goal_round_scores where group_id=%s and round_start between '2026-09-01' and '2026-10-31'", (gid,)).fetchone()[0][0]
    finally:
        c.execute("reset role")
    indexes = set()
    def walk(node):
        if "Index Name" in node:
            indexes.add(node["Index Name"])
        for child in node.get("Plans", []):
            walk(child)
    walk(plan["Plan"])
    assert plan["Plan"]["Actual Rows"] > 0
    return dict(years=6, rows=plan["Plan"]["Actual Rows"], planning_ms=plan["Planning Time"],
                execution_ms=plan["Execution Time"], indexes=sorted(indexes), load_test=False)

if __name__ == "__main__":
    main()
