export const DEVELOPER_IDENTITY = "c200a2bd4fd89d5cc59811729734b7f92d6bf328eda8fc64963fa5f7760dcb13";

export function isDeveloperIdentity(identity?: string | null) {
  return identity?.replace(/^0x/i, "").toLowerCase() === DEVELOPER_IDENTITY;
}

export const DEVELOPER_BADGE = "[DEV]";
