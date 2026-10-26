export interface FunnelStepSummary {
  step: string;
  uniqueInstalls: number;
  eventCount: number;
  dropoffInstalls: number;
  conversionFromPrevious: number;
  conversionFromStart: number;
}

export interface CombatRoundsLossSummary {
  median: number | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  sampleCount: number;
  missingCount: number;
  totalLosses: number;
  unknownCount: number;
  rounds?: number[];
}

export interface TelemetryBreakdownGroup {
  uniqueInstalls: number;
  totalEvents: number;
  missionWins: number;
  missionLosses: number;
  countsPerEvent: Record<string, number | undefined>;
}

export interface TelemetryBreakdowns {
  byEdition: Record<string, TelemetryBreakdownGroup>;
  byBuild: Record<string, TelemetryBreakdownGroup>;
}

export interface TelemetryRetentionReturn {
  day: number;
  eligibleInstalls: number;
  returnedInstalls: number;
  rate: number | null;
}

export interface TelemetryRetentionSummary {
  schemaVersion: number;
  cohortInstalls: number;
  returns: TelemetryRetentionReturn[];
  definition: string;
}

export interface TelemetrySummaryData {
  retention: TelemetryRetentionSummary;
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  totalEvents: number;
  uniqueInstalls: number;
  countsPerEvent: Record<string, number>;
  funnel: FunnelStepSummary[];
  combatRoundsBeforeMissionLoss: CombatRoundsLossSummary;
  breakdown: TelemetryBreakdowns;
  breakdowns?: TelemetryBreakdowns;
}
