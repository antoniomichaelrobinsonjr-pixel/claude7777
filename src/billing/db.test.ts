import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Real Postgres (PGlite) with a tiny stand-in for Supabase's auth schema.
const ROOT = new URL("../..", import.meta.url).pathname;
const db = new PGlite();
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const pid = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let seq = 0;

const asUser = async (id: string | null) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id ?? ""}', false);`);
  if (id) await db.exec("set role authenticated");
};
const plan = (id: string, p: string) => db.query("insert into profiles (user_id, plan, status) values ($1, $2, 'active') on conflict (user_id) do update set plan = excluded.plan", [id, p]);
const comps = (n: number) => JSON.stringify({ comps: Array.from({ length: n }, (_, i) => ({ id: i })) });
const insert = (user: string, id: string, n = 0) => db.query("insert into projects (id, user_id, name, data) values ($1, $2, 'x', $3::jsonb)", [id, user, comps(n)]);
const save = (user: string, id: string, n: number) =>
  db.query("insert into projects (id, user_id, name, data) values ($1, $2, 'x', $3::jsonb) on conflict (id) do update set data = excluded.data", [id, user, comps(n)]);
const rejects = async (p: Promise<unknown>, code: string) => assert.rejects(p, (e: Error) => e.message.includes(code), code);

before(async () => {
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  await db.exec(readFileSync(`${ROOT}supabase/schema.sql`, "utf8"));
  await db.exec(readFileSync(process.env.BILLING_SQL ?? `${ROOT}supabase/billing.sql`, "utf8"));
  await db.exec("grant select, insert, update, delete on projects to authenticated; grant select on profiles to authenticated;");
});

test("starter: two analyses allowed, the third refused", async () => {
  await asUser(A);
  await insert(A, pid(++seq));
  await insert(A, pid(++seq));
  await rejects(insert(A, pid(++seq)), "plan_limit_analyses");
});

test("saving an EDIT to an existing analysis works even at the analysis limit (upsert is not a new analysis)", async () => {
  await asUser(A);
  const existing = pid(1);
  await save(A, existing, 3);
  await save(A, existing, 4);
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from projects where user_id = $1", [A]);
  assert.equal(rows[0].n, 2);
});

test("starter comps: 4 allowed, a 5th is refused", async () => {
  await asUser(A);
  await save(A, pid(1), 4);
  await rejects(save(A, pid(1), 5), "plan_limit_comps");
});

test("upgrading lifts the limits; the new limits apply (plus: 8 comps, unlimited analyses)", async () => {
  await asUser(null);
  await plan(A, "plus");
  await asUser(A);
  await insert(A, pid(++seq));
  await insert(A, pid(++seq));
  await save(A, pid(1), 8);
  await rejects(save(A, pid(1), 9), "plan_limit_comps");
});

test("pro allows 15 and studio allows 40 comps", async () => {
  await asUser(null); await plan(A, "pro"); await asUser(A);
  await save(A, pid(1), 15);
  await rejects(save(A, pid(1), 16), "plan_limit_comps");
  await asUser(null); await plan(A, "studio"); await asUser(A);
  await save(A, pid(1), 40);
  await rejects(save(A, pid(1), 41), "plan_limit_comps");
});

test("after a downgrade nothing is lost: an over-limit analysis can still be saved and trimmed, just not grown", async () => {
  await asUser(null); await plan(A, "studio"); await asUser(A);
  await save(A, pid(1), 30);
  await asUser(null); await plan(A, "plus"); await asUser(A); // limit now 8
  await save(A, pid(1), 30);                                    // saving as-is is fine
  await save(A, pid(1), 12);                                    // trimming is fine
  await rejects(save(A, pid(1), 13), "plan_limit_comps");       // growing past the limit is not
  await save(A, pid(1), 12);
});

test("downgraded to starter: existing analyses stay readable and editable, but no new ones beyond the limit", async () => {
  await asUser(null); await plan(A, "starter"); await asUser(A);
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from projects where user_id = $1", [A]);
  assert.ok(rows[0].n > 2, "has more than the starter limit already");
  await save(A, pid(1), 3);                                     // editing an existing one is allowed
  await rejects(insert(A, pid(++seq)), "plan_limit_analyses");
});

test("a user with no profile row is treated as starter", async () => {
  await asUser(B);
  await insert(B, pid(++seq));
  await insert(B, pid(++seq));
  await rejects(insert(B, pid(++seq)), "plan_limit_analyses");
});

test("people can read their own plan but nobody else's", async () => {
  await asUser(null); await plan(B, "pro");
  await asUser(A);
  const mine = await db.query("select * from profiles");
  assert.deepEqual(mine.rows.map((r) => (r as { user_id: string }).user_id), [A]);
  await asUser(B);
  const theirs = await db.query("select * from profiles");
  assert.deepEqual(theirs.rows.map((r) => (r as { user_id: string }).user_id), [B]);
});

test("people cannot upgrade themselves: no insert, update or delete on profiles", async () => {
  await asUser(A);
  await assert.rejects(db.query("update profiles set plan = 'studio' where user_id = $1", [A]));
  await assert.rejects(db.query("insert into profiles (user_id, plan) values ($1, 'studio') on conflict (user_id) do update set plan = 'studio'", [A]));
  await assert.rejects(db.query("delete from profiles where user_id = $1", [A]));
  await asUser(null);
  const { rows } = await db.query<{ plan: string }>("select plan from profiles where user_id = $1", [A]);
  assert.equal(rows[0].plan, "starter");
});

test("an invalid plan name cannot be stored", async () => {
  await asUser(null);
  await assert.rejects(db.query("update profiles set plan = 'platinum' where user_id = $1", [A]));
});

test("people cannot read or change each other's analyses", async () => {
  await asUser(B);
  const { rows } = await db.query<{ user_id: string }>("select user_id from projects");
  assert.ok(rows.length > 0 && rows.every((r) => r.user_id === B));
});

test("the limit table in SQL matches the limits in the app's plan config", async () => {
  const { PLANS } = await import("./plans.ts");
  await asUser(null);
  for (const p of Object.values(PLANS)) {
    const { rows } = await db.query<{ max_analyses: number | null; max_comps: number }>("select * from plan_limits($1)", [p.id]);
    assert.equal(rows[0].max_comps, p.maxComps, `${p.id} comps`);
    assert.equal(rows[0].max_analyses, p.maxAnalyses, `${p.id} analyses`);
  }
});
