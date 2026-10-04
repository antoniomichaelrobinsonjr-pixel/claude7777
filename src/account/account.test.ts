import { test } from "node:test";
import assert from "node:assert/strict";
import { processDeleteAccount, type DeleteAccountDeps } from "./http.ts";

function deps(o: Partial<DeleteAccountDeps> = {}) {
  const calls: string[] = [];
  const d: DeleteAccountDeps = {
    user: { id: "u1" },
    loadProfile: async () => ({ stripe_subscription_id: "sub_1" }),
    cancelSubscription: async (id) => { calls.push(`cancel:${id}`); return "cancelled"; },
    deleteUser: async (id) => { calls.push(`delete:${id}`); },
    ...o,
  };
  return { d, calls };
}

test("delete account: needs a signed-in person and touches nothing otherwise", async () => {
  const { d, calls } = deps({ user: null });
  assert.equal((await processDeleteAccount(d)).status, 401);
  assert.deepEqual(calls, []);
});

test("delete account: cancels the web subscription first, then deletes the user", async () => {
  const { d, calls } = deps();
  assert.deepEqual(await processDeleteAccount(d), { status: 200, body: { ok: true } });
  assert.deepEqual(calls, ["cancel:sub_1", "delete:u1"]);
});

test("delete account: no subscription (free or never billed) just deletes", async () => {
  for (const profile of [null, { stripe_subscription_id: null }]) {
    const { d, calls } = deps({ loadProfile: async () => profile });
    assert.equal((await processDeleteAccount(d)).status, 200);
    assert.deepEqual(calls, ["delete:u1"]);
  }
});

test("delete account: if cancelling fails, nothing is deleted, so nobody is left paying for a deleted account", async () => {
  const { d, calls } = deps({ cancelSubscription: async () => { throw new Error("stripe down"); } });
  const r = await processDeleteAccount(d);
  assert.equal(r.status, 502);
  assert.deepEqual(r.body, { error: "cancel_failed" });
  assert.deepEqual(calls, []);
});

test("delete account: a subscription Stripe no longer has does not block deletion", async () => {
  const { d, calls } = deps({ cancelSubscription: async () => "already_gone" });
  assert.equal((await processDeleteAccount(d)).status, 200);
  assert.deepEqual(calls, ["delete:u1"]);
});

test("delete account: a failed delete is reported, and running it again finishes the job", async () => {
  let n = 0;
  const { d } = deps({ deleteUser: async () => { if (n++ === 0) throw new Error("db"); } });
  assert.equal((await processDeleteAccount(d)).status, 500);
  assert.equal((await processDeleteAccount(d)).status, 200);
});
