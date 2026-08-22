import type { SupportTicket, SupportVotes } from '../../../shared/schemas/support.ts';
import type { ConditionalWriteResult, VersionedValue, WriteCondition } from './blob-concurrency.ts';

export interface SupportBlobStore {
  getTicket(id: string): Promise<SupportTicket | null>;
  getTicketVersioned(id: string): Promise<VersionedValue<SupportTicket> | null>;
  setTicket(ticket: SupportTicket, condition?: WriteCondition): Promise<ConditionalWriteResult>;
  listTicketKeys(): Promise<string[]>;
  getVotesVersioned(id: string): Promise<VersionedValue<SupportVotes> | null>;
  setVotes(
    id: string,
    votes: SupportVotes,
    condition?: WriteCondition,
  ): Promise<ConditionalWriteResult>;
}
