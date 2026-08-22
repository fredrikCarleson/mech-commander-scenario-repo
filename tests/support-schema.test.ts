import { describe, expect, it } from 'vitest';
import {
  createSupportTicketBodySchema,
  publicSupportTicketSchema,
  supportListQuerySchema,
  supportTicketSchema,
  updateSupportStatusBodySchema,
} from '../shared/schemas/support.ts';

const ticket = {
  schemaVersion: 1,
  id: '550e8400-e29b-41d4-a716-446655440000',
  type: 'bug',
  severity: 'high',
  status: 'open',
  title: 'Mechs fall through the map',
  description: 'A lance falls through the terrain after the second turn.',
  repro: 'Start Ember Reach, move two hexes, wait until turn 2.',
  reporterSub: 'google-sub-reporter',
  reporterEmail: 'player@example.com',
  voteCount: 0,
  createdAt: '2026-08-22T12:00:00.000Z',
  updatedAt: '2026-08-22T12:00:00.000Z',
};

describe('support schemas', () => {
  it('accepts a stored ticket and rejects a short title', () => {
    expect(supportTicketSchema.safeParse(ticket).success).toBe(true);
    expect(
      createSupportTicketBodySchema.safeParse({
        type: 'bug',
        severity: 'low',
        title: 'Too few',
        description: 'This description is long enough to pass.',
        repro: 'These reproduction steps are also long enough.',
      }).success,
    ).toBe(false);
  });

  it('defaults list filters to open tickets sorted by votes', () => {
    expect(supportListQuerySchema.parse({})).toMatchObject({
      page: 1,
      status: 'open',
      sort: 'votes',
    });
  });

  it('accepts admin statuses and strips reporter identity from the public shape', () => {
    expect(updateSupportStatusBodySchema.safeParse({ status: 'not_doing' }).success).toBe(true);
    expect(updateSupportStatusBodySchema.safeParse({ status: 'hidden' }).success).toBe(true);
    expect(updateSupportStatusBodySchema.safeParse({ status: 'open' }).success).toBe(true);
    const publicTicket = publicSupportTicketSchema.parse({
      id: ticket.id,
      type: ticket.type,
      severity: ticket.severity,
      status: ticket.status,
      title: ticket.title,
      description: ticket.description,
      repro: ticket.repro,
      voteCount: 0,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    });
    expect(publicTicket).not.toHaveProperty('reporterSub');
    expect(publicTicket.reporterEmail).toBeUndefined();
  });
});
