import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  SUPPORT_DESCRIPTION_MAX,
  SUPPORT_DESCRIPTION_MIN,
  SUPPORT_GAME_VERSION_MAX,
  SUPPORT_LIST_STATUS_FILTERS,
  SUPPORT_PUBLIC_STATUSES,
  SUPPORT_REPRO_MAX,
  SUPPORT_REPRO_MIN,
  SUPPORT_SEVERITIES,
  SUPPORT_SORT_OPTIONS,
  SUPPORT_STATUSES,
  SUPPORT_TICKET_SCHEMA_VERSION,
  SUPPORT_TITLE_MAX,
  SUPPORT_TITLE_MIN,
  SUPPORT_TYPES,
} from '../constants.ts';

const trimmedText = (min: number, max: number) => z.string().trim().min(min).max(max);

export const supportTicketSchema = z.object({
  schemaVersion: z.literal(SUPPORT_TICKET_SCHEMA_VERSION),
  id: z.string().uuid(),
  type: z.enum(SUPPORT_TYPES),
  severity: z.enum(SUPPORT_SEVERITIES),
  status: z.enum(SUPPORT_STATUSES),
  title: trimmedText(SUPPORT_TITLE_MIN, SUPPORT_TITLE_MAX),
  description: trimmedText(SUPPORT_DESCRIPTION_MIN, SUPPORT_DESCRIPTION_MAX),
  repro: trimmedText(SUPPORT_REPRO_MIN, SUPPORT_REPRO_MAX),
  gameVersion: z.string().trim().max(SUPPORT_GAME_VERSION_MAX).optional(),
  reporterSub: z.string().min(1),
  reporterEmail: z.string().email(),
  voteCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SupportTicket = z.infer<typeof supportTicketSchema>;

export const supportVotesSchema = z.object({
  voters: z.array(z.string().min(1)),
});

export type SupportVotes = z.infer<typeof supportVotesSchema>;

export const createSupportTicketBodySchema = z.object({
  type: z.enum(SUPPORT_TYPES),
  severity: z.enum(SUPPORT_SEVERITIES),
  title: trimmedText(SUPPORT_TITLE_MIN, SUPPORT_TITLE_MAX),
  description: trimmedText(SUPPORT_DESCRIPTION_MIN, SUPPORT_DESCRIPTION_MAX),
  repro: trimmedText(SUPPORT_REPRO_MIN, SUPPORT_REPRO_MAX),
  gameVersion: z
    .string()
    .trim()
    .max(SUPPORT_GAME_VERSION_MAX)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type CreateSupportTicketBody = z.infer<typeof createSupportTicketBodySchema>;

export const updateSupportTicketBodySchema = createSupportTicketBodySchema;

export type UpdateSupportTicketBody = z.infer<typeof updateSupportTicketBodySchema>;

export const updateSupportStatusBodySchema = z.object({
  status: z.enum(SUPPORT_STATUSES),
});

export type UpdateSupportStatusBody = z.infer<typeof updateSupportStatusBodySchema>;

export const publicSupportTicketSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(SUPPORT_TYPES),
  severity: z.enum(SUPPORT_SEVERITIES),
  status: z.enum(SUPPORT_STATUSES),
  title: z.string(),
  description: z.string(),
  repro: z.string(),
  gameVersion: z.string().optional(),
  voteCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  isYours: z.boolean().optional(),
  hasVoted: z.boolean().optional(),
  reporterEmail: z.string().email().optional(),
});

export type PublicSupportTicket = z.infer<typeof publicSupportTicketSchema>;

export const supportListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().optional(),
  type: z.enum(SUPPORT_TYPES).optional(),
  severity: z.enum(SUPPORT_SEVERITIES).optional(),
  status: z.enum(SUPPORT_LIST_STATUS_FILTERS).default('open'),
  sort: z.enum(SUPPORT_SORT_OPTIONS).default('votes'),
});

export type SupportListQuery = z.infer<typeof supportListQuerySchema>;

export const supportListResponseSchema = z.object({
  items: z.array(publicSupportTicketSchema),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type SupportListResponse = z.infer<typeof supportListResponseSchema>;

export const supportVoteResponseSchema = z.object({
  id: z.string().uuid(),
  voteCount: z.number().int().nonnegative(),
  hasVoted: z.boolean(),
});

export type SupportVoteResponse = z.infer<typeof supportVoteResponseSchema>;

export const PUBLIC_SUPPORT_STATUS_SET = new Set<string>(SUPPORT_PUBLIC_STATUSES);
