export function metadataKey(scenarioId: string): string {
  return `meta/${scenarioId}.json`;
}

export function packageKey(scenarioId: string): string {
  return `pkg/${scenarioId}.zip`;
}

export function ratingsKey(scenarioId: string): string {
  return `ratings/${scenarioId}.json`;
}

export function thumbnailKey(scenarioId: string): string {
  return `thumb/${scenarioId}.webp`;
}

export const METADATA_PREFIX = 'meta/';

export function scenarioOwnershipKey(scenarioId: string): string {
  return `ownership/scenarios/${scenarioId}.json`;
}

export function scenarioSubmissionKey(scenarioId: string): string {
  return `submissions/scenarios/${scenarioId}.json`;
}

export const SCENARIO_SUBMISSION_PREFIX = 'submissions/scenarios/';

export function scenarioRevisionPackageKey(scenarioId: string, revision: number): string {
  return `revisions/scenarios/${scenarioId}/${revision}/package.zip`;
}

export function scenarioRevisionThumbnailKey(scenarioId: string, revision: number): string {
  return `revisions/scenarios/${scenarioId}/${revision}/thumbnail.webp`;
}

export function scenarioReleaseKey(scenarioId: string, revision: number): string {
  return `revisions/scenarios/${scenarioId}/${revision}/release.json`;
}

export function scenarioDeletionKey(scenarioId: string): string {
  return `deletions/scenarios/${scenarioId}.json`;
}

export function campaignMetadataKey(id: string): string {
  return `campaigns/meta/${id}.json`;
}
export const CAMPAIGN_METADATA_PREFIX = 'campaigns/meta/';
export function campaignPackageKey(id: string): string {
  return `campaigns/pkg/${id}.zip`;
}
export function campaignThumbnailKey(id: string): string {
  return `campaigns/thumb/${id}.webp`;
}
export function campaignRatingsKey(id: string): string {
  return `campaigns/ratings/${id}.json`;
}
export function campaignOwnershipKey(id: string): string {
  return `ownership/campaigns/${id}.json`;
}
export function campaignSubmissionKey(id: string): string {
  return `submissions/campaigns/${id}.json`;
}
export const CAMPAIGN_SUBMISSION_PREFIX = 'submissions/campaigns/';
export function campaignRevisionPackageKey(id: string, revision: number): string {
  return `revisions/campaigns/${id}/${revision}/package.zip`;
}
export function campaignRevisionThumbnailKey(id: string, revision: number): string {
  return `revisions/campaigns/${id}/${revision}/thumbnail.webp`;
}

export function campaignReleaseKey(id: string, revision: number): string {
  return `revisions/campaigns/${id}/${revision}/release.json`;
}

export function campaignStableIdClaimKey(stableCampaignId: string): string {
  return `claims/campaign-ids/${encodeURIComponent(stableCampaignId)}.json`;
}

export function campaignDeletionKey(id: string): string {
  return `deletions/campaigns/${id}.json`;
}

export function supportTicketKey(id: string): string {
  return `support/tickets/${id}.json`;
}

export const SUPPORT_TICKET_PREFIX = 'support/tickets/';

export function supportVotesKey(id: string): string {
  return `support/votes/${id}.json`;
}
