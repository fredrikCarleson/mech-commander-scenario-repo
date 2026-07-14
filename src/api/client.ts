import type {
  ScenarioListResponse,
  SubmitRatingBody,
  SubmitRatingResponse,
  UploadResponse,
} from '../../shared/schemas/api.ts';
import type { ScenarioMetadata } from '../../shared/schemas/metadata.ts';

const API_BASE = '/api/v1';

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

export async function fetchScenarios(
  params: Record<string, string | number | undefined>,
): Promise<ScenarioListResponse> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  }

  const response = await fetch(`${API_BASE}/scenarios?${searchParams.toString()}`);
  return handleJson<ScenarioListResponse>(response);
}

export async function fetchScenario(id: string): Promise<ScenarioMetadata> {
  const response = await fetch(`${API_BASE}/scenarios/${id}`);
  return handleJson<ScenarioMetadata>(response);
}

export async function downloadScenario(id: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/scenarios/${id}/download`);
  if (!response.ok) {
    throw new Error('Download failed.');
  }
  return response.blob();
}

export async function uploadScenario(file: File): Promise<UploadResponse> {
  const response = await fetch(`${API_BASE}/scenarios`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
    },
    body: file,
  });
  return handleJson<UploadResponse>(response);
}

export function scenarioThumbnailUrl(id: string): string {
  return `${API_BASE}/scenarios/${id}/thumbnail`;
}

export async function submitRating(
  id: string,
  body: SubmitRatingBody,
): Promise<SubmitRatingResponse> {
  const response = await fetch(`${API_BASE}/scenarios/${id}/ratings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return handleJson<SubmitRatingResponse>(response);
}

export async function deleteScenario(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/scenarios/${id}`, {
    method: 'DELETE',
  });
  await handleJson<{ id: string; deleted: boolean }>(response);
}
