import type {
  CreateSupportTicketBody,
  PublicSupportTicket,
  SupportListResponse,
  SupportVoteResponse,
  UpdateSupportStatusBody,
  UpdateSupportTicketBody,
} from '../../shared/schemas/support.ts';
import type { SupportStatus } from '../../shared/constants.ts';
import { optionalAuthHeaders, requireAuthHeaders } from './session-client.ts';

const API_BASE = '/api/v1/support';

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

export async function fetchSupportTickets(
  params: Record<string, string | number | undefined>,
): Promise<SupportListResponse> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return handleJson(
    await fetch(`${API_BASE}${query ? `?${query}` : ''}`, { headers: optionalAuthHeaders() }),
  );
}

export async function createSupportTicket(
  body: CreateSupportTicketBody,
): Promise<PublicSupportTicket> {
  return handleJson(
    await fetch(API_BASE, {
      method: 'POST',
      headers: requireAuthHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function updateSupportTicket(
  id: string,
  body: UpdateSupportTicketBody,
): Promise<PublicSupportTicket> {
  return handleJson(
    await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: requireAuthHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function voteSupportTicket(id: string): Promise<SupportVoteResponse> {
  return handleJson(
    await fetch(`${API_BASE}/${id}/votes`, {
      method: 'POST',
      headers: requireAuthHeaders(),
    }),
  );
}

export async function updateSupportTicketStatus(
  id: string,
  status: SupportStatus,
): Promise<PublicSupportTicket> {
  const body: UpdateSupportStatusBody = { status };
  return handleJson(
    await fetch(`${API_BASE}/${id}/status`, {
      method: 'POST',
      headers: requireAuthHeaders(),
      body: JSON.stringify(body),
    }),
  );
}
