export interface HttpResult { status: number; body: Record<string, unknown> }
const fail = (status: number, error: string): HttpResult => ({ status, body: { error } });

export interface DeleteAccountDeps {
  /** The signed-in person, verified by the server; null when nobody is. */
  user: { id: string } | null;
  loadProfile(userId: string): Promise<{ stripe_subscription_id: string | null } | null>;
  /** Cancel a web subscription right away. Resolve "already_gone" if Stripe no longer has it; throw for anything else. */
  cancelSubscription(subscriptionId: string): Promise<"cancelled" | "already_gone">;
  /** Delete the sign-in and, through the database's cascade rules, their analyses and plan record. */
  deleteUser(userId: string): Promise<void>;
}

/**
 * Delete someone's account. The order matters: a web subscription is cancelled first, and if that fails nothing is deleted,
 * so a person is never left paying for an account that no longer exists. Calling it again after a partial failure is safe.
 */
export async function processDeleteAccount(d: DeleteAccountDeps): Promise<HttpResult> {
  if (!d.user) return fail(401, "sign_in_required");
  const profile = await d.loadProfile(d.user.id);
  if (profile?.stripe_subscription_id) {
    try { await d.cancelSubscription(profile.stripe_subscription_id); } catch { return fail(502, "cancel_failed"); }
  }
  try { await d.deleteUser(d.user.id); } catch { return fail(500, "delete_failed"); }
  return { status: 200, body: { ok: true } };
}
