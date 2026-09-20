export type AnalyticsDashboard = {
  fromDayKey: string;
  toDayKey: string;
  timezone: "UTC";
  days: Array<{
    dayKey: string;
    dau: number;
    wau: number;
    mau: number;
    newPlayers: number;
    returningPlayers: number;
    guestPlayers: number;
    accountPlayers: number;
    sessions: number;
    sessionsPerPlayer: number | null;
    sessionMicros: string;
    averageSessionSeconds: number | null;
  }>;
  retention: Array<{
    cohortDayKey: string;
    size: number;
    d1: number | null;
    d1Rate: number | null;
    d7: number | null;
    d7Rate: number | null;
    d30: number | null;
    d30Rate: number | null;
  }>;
  conversion: { total: number; byDay: Record<string, number> };
  milestones: { firstKill: Record<string, number>; firstBoss: Record<string, number>; firstPrestige: Record<string, number> };
  activity: Array<{
    mapId: string;
    releaseVersion: string;
    players: number;
    sessions: number;
    sessionMicros: string;
    averageSessionSeconds: number | null;
  }>;
};
