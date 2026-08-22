import { getStore } from '@netlify/blobs';
import {
  SUPPORT_TICKET_PREFIX,
  supportTicketKey,
  supportVotesKey,
} from '../../../shared/blob-keys.ts';
import {
  supportTicketSchema,
  supportVotesSchema,
  type SupportTicket,
  type SupportVotes,
} from '../../../shared/schemas/support.ts';
import type { WriteCondition } from './blob-concurrency.ts';
import { resolveCommunityEnvironment } from './community-environment.ts';
import type { SupportBlobStore } from './support-blob-store.ts';

function blobEtag(etag: string | undefined, key: string): string {
  if (etag) return etag;
  // The local Netlify Blobs sandbox often omits ETags. Production Blobs include them.
  return `sandbox:${key}`;
}

export function createNetlifySupportBlobStore(): SupportBlobStore {
  const store = getStore({
    name: resolveCommunityEnvironment().blobStore,
    consistency: 'strong',
  });

  async function getJsonVersioned<T>(key: string, parse: (input: unknown) => T) {
    const result = await store.getWithMetadata(key, { type: 'text' });
    return result
      ? { value: parse(JSON.parse(result.data)), etag: blobEtag(result.etag, key) }
      : null;
  }

  async function setJson(key: string, value: unknown, condition?: WriteCondition) {
    const options: Record<string, unknown> = {
      metadata: { contentType: 'application/json' },
    };
    if (condition?.onlyIfNew) options.onlyIfNew = true;
    if (condition?.onlyIfMatch && !condition.onlyIfMatch.startsWith('sandbox:')) {
      options.onlyIfMatch = condition.onlyIfMatch;
    }
    return store.set(key, JSON.stringify(value), options);
  }

  return {
    async getTicket(id) {
      return (await this.getTicketVersioned(id))?.value ?? null;
    },
    getTicketVersioned(id) {
      return getJsonVersioned(supportTicketKey(id), supportTicketSchema.parse);
    },
    setTicket(ticket, condition) {
      return setJson(supportTicketKey(ticket.id), ticket, condition);
    },
    async listTicketKeys() {
      const { blobs } = await store.list({ prefix: SUPPORT_TICKET_PREFIX });
      return blobs.map((blob) => blob.key);
    },
    getVotesVersioned(id) {
      return getJsonVersioned(supportVotesKey(id), supportVotesSchema.parse);
    },
    setVotes(id, votes, condition) {
      return setJson(supportVotesKey(id), votes, condition);
    },
  };
}

interface MemoryEntry<T> {
  value: T;
  etag: string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemorySupportBlobStore implements SupportBlobStore {
  private sequence = 0;
  private tickets = new Map<string, MemoryEntry<SupportTicket>>();
  private votes = new Map<string, MemoryEntry<SupportVotes>>();

  private write<T>(
    map: Map<string, MemoryEntry<T>>,
    key: string,
    value: T,
    condition?: WriteCondition,
  ) {
    const current = map.get(key);
    if (condition?.onlyIfNew && current) return { modified: false };
    if (condition?.onlyIfMatch && current?.etag !== condition.onlyIfMatch) {
      return { modified: false };
    }
    const etag = `memory-${++this.sequence}`;
    map.set(key, { value: clone(value), etag });
    return { modified: true, etag };
  }

  async getTicket(id: string) {
    return (await this.getTicketVersioned(id))?.value ?? null;
  }

  async getTicketVersioned(id: string) {
    const entry = this.tickets.get(id);
    return entry ? clone(entry) : null;
  }

  async setTicket(ticket: SupportTicket, condition?: WriteCondition) {
    return this.write(this.tickets, ticket.id, ticket, condition);
  }

  async listTicketKeys() {
    return [...this.tickets.keys()].map((id) => supportTicketKey(id));
  }

  async getVotesVersioned(id: string) {
    const entry = this.votes.get(id);
    return entry ? clone(entry) : null;
  }

  async setVotes(id: string, votes: SupportVotes, condition?: WriteCondition) {
    return this.write(this.votes, id, votes, condition);
  }
}
