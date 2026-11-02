import { tables, type DbConnection } from "../../module_bindings";
import { DEFEAT_COOLDOWN, DEFEAT_REAUTH, freshAuthentication } from "../../../shared/defeat-session";
import { inspectSpacetimeIdToken } from "../security/oidc-id-token";
import { subscribeTables } from "./table-watch";

/** The server enforces admission. This subscription promptly ends the UI session. */
export function watchDefeatSession(connection: DbConnection, token: string | null,
  isCurrent: () => boolean, reject: (message: string) => void) {
  let authTime: number | undefined;
  try { if (token) authTime = inspectSpacetimeIdToken(token, { allowExpired: true }).auth_time; } catch {}
  const apply = (row: { revokedAtMicros: bigint; blockedUntilMicros: bigint; requireSignIn: boolean }) => {
    if (!isCurrent()) return;
    if (row.requireSignIn && !freshAuthentication(authTime, row.revokedAtMicros)) reject(DEFEAT_REAUTH);
    else if (Number(row.blockedUntilMicros / 1000n) > Date.now())
      reject(`${DEFEAT_COOLDOWN}:${row.blockedUntilMicros / 1000n}`);
  };
  connection.db.myDefeatSessionRestriction.onInsert((_ctx, row) => apply(row));
  connection.db.myDefeatSessionRestriction.onUpdate((_ctx, _old, row) => apply(row));
  subscribeTables(connection, "defeat session", isCurrent, [tables.myDefeatSessionRestriction], () => {
    for (const row of connection.db.myDefeatSessionRestriction.iter()) apply(row);
  });
}
