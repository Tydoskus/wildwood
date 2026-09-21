import { table, t, SenderError } from "spacetimedb/server";
import type { ModuleReducerCtx } from "./index";

/** Authenticated requests awaiting the full database and auth-provider erasure workflow. */
export const accountDeletionRequest = table({ name: "account_deletion_request", public: false }, {
  identity: t.identity().primaryKey(), requestedAt: t.timestamp(), status: t.string(),
});
export function queueAccountDeletion(ctx: ModuleReducerCtx, confirmation: string) {
  if (confirmation !== "DELETE") throw new SenderError("Confirm account deletion first.");
  if (!ctx.db.playerProgress.identity.find(ctx.sender)) throw new SenderError("Connect to your character first.");
  if (ctx.db.accountDeletionRequest.identity.find(ctx.sender)) return;
  ctx.db.accountDeletionRequest.insert({ identity: ctx.sender, requestedAt: ctx.timestamp, status: "pending" });
}
