import type { ScenarioMetadata } from '../../shared/schemas/metadata.ts';
import type { CampaignMetadata } from '../../shared/schemas/campaign.ts';

const API_BASE = '/api/v1';
const ADMIN_TOKEN_KEY = 'scenario-repo-admin-token';

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (!token) {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } else {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  }
  window.dispatchEvent(new Event('auth-change'));
}

function adminHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) {
    throw new Error('Admin sign-in required.');
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function handleJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : response.statusText;
    throw new Error(message);
  }
  return data as T;
}

export async function fetchPendingScenarios(): Promise<ScenarioMetadata[]> {
  const response = await fetch(`${API_BASE}/admin/scenarios`, {
    headers: adminHeaders(),
  });
  const data = await handleJson<{ items: ScenarioMetadata[] }>(response);
  return data.items;
}

export async function fetchPendingCampaigns(): Promise<CampaignMetadata[]> {
  const response = await fetch(`${API_BASE}/admin/campaigns`, { headers: adminHeaders() });
  const data = await handleJson<{ items: CampaignMetadata[] }>(response);
  return data.items;
}

export function adminScenarioThumbnailUrl(id: string): string {
  return `${API_BASE}/admin/scenarios/${id}/thumbnail`;
}

export async function fetchAdminScenarioThumbnail(id: string): Promise<string | null> {
  const response = await fetch(adminScenarioThumbnailUrl(id), {
    headers: adminHeaders(),
  });
  if (!response.ok) {
    return null;
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function fetchAdminCampaignThumbnail(id: string): Promise<string | null> {
  const response = await fetch(`${API_BASE}/admin/campaigns/${id}/thumbnail`, {
    headers: adminHeaders(),
  });
  if (!response.ok) return null;
  return URL.createObjectURL(await response.blob());
}

function moderationHeaders(): HeadersInit {
  return { ...adminHeaders(), 'Content-Type': 'application/json' };
}

export async function approveScenario(id: string, revision: number): Promise<ScenarioMetadata> {
  const response = await fetch(`${API_BASE}/admin/scenarios/${id}/approve`, {
    method: 'POST',
    headers: moderationHeaders(),
    body: JSON.stringify({ revision }),
  });
  const data = await handleJson<{ metadata: ScenarioMetadata }>(response);
  return data.metadata;
}

export async function rejectScenario(
  id: string,
  revision: number,
  reason: string,
): Promise<ScenarioMetadata> {
  const response = await fetch(`${API_BASE}/admin/scenarios/${id}/reject`, {
    method: 'POST',
    headers: moderationHeaders(),
    body: JSON.stringify({ revision, reason }),
  });
  const data = await handleJson<{ metadata: ScenarioMetadata }>(response);
  return data.metadata;
}

export async function approveCampaign(id: string, revision: number): Promise<CampaignMetadata> {
  const response = await fetch(`${API_BASE}/admin/campaigns/${id}/approve`, {
    method: 'POST',
    headers: moderationHeaders(),
    body: JSON.stringify({ revision }),
  });
  return (await handleJson<{ metadata: CampaignMetadata }>(response)).metadata;
}

export async function rejectCampaign(
  id: string,
  revision: number,
  reason: string,
): Promise<CampaignMetadata> {
  const response = await fetch(`${API_BASE}/admin/campaigns/${id}/reject`, {
    method: 'POST',
    headers: moderationHeaders(),
    body: JSON.stringify({ revision, reason }),
  });
  return (await handleJson<{ metadata: CampaignMetadata }>(response)).metadata;
}

export async function deleteCampaignAdmin(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/campaigns/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  await handleJson<{ id: string; deleted: boolean }>(response);
}

export async function deleteScenarioAdmin(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/scenarios/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  await handleJson<{ id: string; deleted: boolean }>(response);
}

export async function verifyAdminSession(): Promise<boolean> {
  const token = getAdminToken();
  if (!token) {
    return false;
  }

  try {
    await fetchPendingScenarios();
    return true;
  } catch {
    setAdminToken(null);
    return false;
  }
}
