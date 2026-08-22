import { randomUUID } from 'node:crypto';
import { SUPPORT_TICKET_PREFIX } from '../../../shared/blob-keys.ts';
import { MAX_PAGE_SIZE, SUPPORT_TICKET_SCHEMA_VERSION } from '../../../shared/constants.ts';
import {
  createSupportTicketBodySchema,
  PUBLIC_SUPPORT_STATUS_SET,
  supportListQuerySchema,
  updateSupportStatusBodySchema,
  updateSupportTicketBodySchema,
  type PublicSupportTicket,
  type SupportListQuery,
  type SupportListResponse,
  type SupportTicket,
  type SupportVoteResponse,
} from '../../../shared/schemas/support.ts';
import type { AuthenticatedCreator } from './auth.ts';
import { isAdminSubject } from './auth.ts';
import type { SupportBlobStore } from './support-blob-store.ts';
import { ServiceError } from './scenario-service.ts';

const CAS_RETRIES = 4;

function ticketIdFromKey(key: string): string | null {
  if (!key.startsWith(SUPPORT_TICKET_PREFIX) || !key.endsWith('.json')) return null;
  return key.slice(SUPPORT_TICKET_PREFIX.length, -'.json'.length) || null;
}

function optionalGameVersion(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toPublicTicket(
  ticket: SupportTicket,
  viewer: AuthenticatedCreator | null,
  hasVoted?: boolean,
): PublicSupportTicket {
  const isOwner = viewer?.sub === ticket.reporterSub;
  const isAdmin = viewer ? isAdminSubject(viewer.sub) : false;
  return {
    id: ticket.id,
    type: ticket.type,
    severity: ticket.severity,
    status: ticket.status,
    title: ticket.title,
    description: ticket.description,
    repro: ticket.repro,
    ...(ticket.gameVersion ? { gameVersion: ticket.gameVersion } : {}),
    voteCount: ticket.voteCount,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    ...(viewer ? { isYours: isOwner, hasVoted: hasVoted ?? false } : {}),
    ...(isOwner || isAdmin ? { reporterEmail: ticket.reporterEmail } : {}),
  };
}

function canSeeTicket(ticket: SupportTicket, viewer: AuthenticatedCreator | null): boolean {
  if (ticket.status !== 'hidden') return true;
  return Boolean(viewer && isAdminSubject(viewer.sub));
}

function matchesStatus(ticket: SupportTicket, status: SupportListQuery['status']): boolean {
  if (status === 'all') return PUBLIC_SUPPORT_STATUS_SET.has(ticket.status);
  return ticket.status === status;
}

function sortTickets(items: SupportTicket[], sort: SupportListQuery['sort']): SupportTicket[] {
  return [...items].sort((a, b) => {
    if (sort === 'newest') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return (
      b.voteCount - a.voteCount || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });
}

async function loadAllTickets(store: SupportBlobStore): Promise<SupportTicket[]> {
  const keys = await store.listTicketKeys();
  const items: SupportTicket[] = [];
  for (const key of keys) {
    const id = ticketIdFromKey(key);
    if (!id) continue;
    const ticket = await store.getTicket(id);
    if (ticket) items.push(ticket);
  }
  return items;
}

export class SupportService {
  constructor(private readonly store: SupportBlobStore) {}

  async listTickets(
    rawQuery: Record<string, string | undefined>,
    viewer: AuthenticatedCreator | null,
  ): Promise<SupportListResponse> {
    const parsed = supportListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ServiceError(
        400,
        'Invalid query parameters.',
        parsed.error.issues.map((issue) => issue.message),
      );
    }
    const query = parsed.data;
    const isAdmin = viewer ? isAdminSubject(viewer.sub) : false;
    if (query.status === 'hidden' && !isAdmin) {
      return {
        items: [],
        page: query.page,
        limit: Math.min(query.limit, MAX_PAGE_SIZE),
        total: 0,
        totalPages: 0,
      };
    }

    const limit = Math.min(query.limit, MAX_PAGE_SIZE);
    let filtered = (await loadAllTickets(this.store)).filter((ticket) =>
      canSeeTicket(ticket, viewer),
    );
    if (query.status === 'all') {
      filtered = filtered.filter((ticket) =>
        isAdmin ? true : PUBLIC_SUPPORT_STATUS_SET.has(ticket.status),
      );
    } else {
      filtered = filtered.filter((ticket) => matchesStatus(ticket, query.status));
    }
    if (query.type) filtered = filtered.filter((ticket) => ticket.type === query.type);
    if (query.severity) filtered = filtered.filter((ticket) => ticket.severity === query.severity);
    if (query.search) {
      const needle = query.search.toLowerCase();
      filtered = filtered.filter((ticket) => ticket.title.toLowerCase().includes(needle));
    }

    const sorted = sortTickets(filtered, query.sort);
    const total = sorted.length;
    const start = (query.page - 1) * limit;
    const pageItems = sorted.slice(start, start + limit);
    const items = await Promise.all(
      pageItems.map(async (ticket) =>
        toPublicTicket(
          ticket,
          viewer,
          viewer ? await this.hasVoted(ticket.id, viewer.sub) : undefined,
        ),
      ),
    );
    return {
      items,
      page: query.page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async getTicket(
    id: string,
    viewer: AuthenticatedCreator | null,
  ): Promise<PublicSupportTicket | null> {
    const ticket = await this.store.getTicket(id);
    if (!ticket || !canSeeTicket(ticket, viewer)) return null;
    return toPublicTicket(ticket, viewer, viewer ? await this.hasVoted(id, viewer.sub) : undefined);
  }

  async createTicket(body: unknown, creator: AuthenticatedCreator): Promise<PublicSupportTicket> {
    const parsed = createSupportTicketBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ServiceError(
        400,
        'Invalid support ticket.',
        parsed.error.issues.map((issue) => issue.message),
      );
    }
    const now = new Date().toISOString();
    const ticket: SupportTicket = {
      schemaVersion: SUPPORT_TICKET_SCHEMA_VERSION,
      id: randomUUID(),
      type: parsed.data.type,
      severity: parsed.data.severity,
      status: 'open',
      title: parsed.data.title,
      description: parsed.data.description,
      repro: parsed.data.repro,
      ...(optionalGameVersion(parsed.data.gameVersion)
        ? { gameVersion: optionalGameVersion(parsed.data.gameVersion) }
        : {}),
      reporterSub: creator.sub,
      reporterEmail: creator.email,
      voteCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.store.setTicket(ticket, { onlyIfNew: true });
    if (!created.modified)
      throw new ServiceError(409, 'Support ticket could not be created. Retry.');
    await this.store.setVotes(ticket.id, { voters: [] }, { onlyIfNew: true });
    return toPublicTicket(ticket, creator, false);
  }

  async updateTicket(
    id: string,
    body: unknown,
    creator: AuthenticatedCreator,
  ): Promise<PublicSupportTicket> {
    const parsed = updateSupportTicketBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ServiceError(
        400,
        'Invalid support ticket.',
        parsed.error.issues.map((issue) => issue.message),
      );
    }
    for (let attempt = 0; attempt < CAS_RETRIES; attempt += 1) {
      const current = await this.store.getTicketVersioned(id);
      if (!current) throw new ServiceError(404, 'Support ticket not found.');
      if (current.value.reporterSub !== creator.sub) {
        throw new ServiceError(403, 'Only the reporter can edit this ticket.');
      }
      if (current.value.status !== 'open') {
        throw new ServiceError(409, 'Only open tickets can be edited.');
      }
      const updated: SupportTicket = {
        ...current.value,
        type: parsed.data.type,
        severity: parsed.data.severity,
        title: parsed.data.title,
        description: parsed.data.description,
        repro: parsed.data.repro,
        gameVersion: optionalGameVersion(parsed.data.gameVersion),
        updatedAt: new Date().toISOString(),
      };
      if (!updated.gameVersion) delete updated.gameVersion;
      const write = await this.store.setTicket(updated, { onlyIfMatch: current.etag });
      if (!write.modified) continue;
      return toPublicTicket(updated, creator, await this.hasVoted(id, creator.sub));
    }
    throw new ServiceError(409, 'Support ticket changed concurrently. Retry.');
  }

  async updateStatus(
    id: string,
    body: unknown,
    admin: AuthenticatedCreator,
  ): Promise<PublicSupportTicket> {
    const parsed = updateSupportStatusBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ServiceError(
        400,
        'Invalid status update.',
        parsed.error.issues.map((issue) => issue.message),
      );
    }
    if (!isAdminSubject(admin.sub)) {
      throw new ServiceError(403, 'You are not authorized to perform this action.');
    }
    for (let attempt = 0; attempt < CAS_RETRIES; attempt += 1) {
      const current = await this.store.getTicketVersioned(id);
      if (!current) throw new ServiceError(404, 'Support ticket not found.');
      const updated: SupportTicket = {
        ...current.value,
        status: parsed.data.status,
        updatedAt: new Date().toISOString(),
      };
      const write = await this.store.setTicket(updated, { onlyIfMatch: current.etag });
      if (!write.modified) continue;
      return toPublicTicket(updated, admin, await this.hasVoted(id, admin.sub));
    }
    throw new ServiceError(409, 'Support ticket changed concurrently. Retry.');
  }

  async toggleVote(id: string, creator: AuthenticatedCreator): Promise<SupportVoteResponse> {
    for (let attempt = 0; attempt < CAS_RETRIES; attempt += 1) {
      const ticket = await this.store.getTicket(id);
      if (!ticket || !canSeeTicket(ticket, creator)) {
        throw new ServiceError(404, 'Support ticket not found.');
      }
      if (ticket.status !== 'open') {
        throw new ServiceError(409, 'Votes are only accepted on open tickets.');
      }

      const currentVotes = await this.store.getVotesVersioned(id);
      const voters = currentVotes?.value.voters ?? [];
      const hasVoted = voters.includes(creator.sub);
      const nextVoters = hasVoted
        ? voters.filter((sub) => sub !== creator.sub)
        : [...voters, creator.sub];
      const voteWrite = await this.store.setVotes(
        id,
        { voters: nextVoters },
        currentVotes ? { onlyIfMatch: currentVotes.etag } : { onlyIfNew: true },
      );
      if (!voteWrite.modified) continue;

      const voteCount = nextVoters.length;
      for (let ticketAttempt = 0; ticketAttempt < CAS_RETRIES; ticketAttempt += 1) {
        const currentTicket = await this.store.getTicketVersioned(id);
        if (!currentTicket) throw new ServiceError(404, 'Support ticket not found.');
        const updated: SupportTicket = {
          ...currentTicket.value,
          voteCount,
          updatedAt: new Date().toISOString(),
        };
        const ticketWrite = await this.store.setTicket(updated, {
          onlyIfMatch: currentTicket.etag,
        });
        if (ticketWrite.modified) {
          return { id, voteCount, hasVoted: !hasVoted };
        }
      }
      return { id, voteCount, hasVoted: !hasVoted };
    }
    throw new ServiceError(409, 'Vote changed concurrently. Retry.');
  }

  private async hasVoted(id: string, sub: string): Promise<boolean> {
    const votes = await this.store.getVotesVersioned(id);
    return Boolean(votes?.value.voters.includes(sub));
  }
}
