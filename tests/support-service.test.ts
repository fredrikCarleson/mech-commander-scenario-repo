import { describe, expect, it } from 'vitest';
import { InMemorySupportBlobStore } from '../netlify/functions/lib/netlify-support-blob-store.ts';
import { SupportService } from '../netlify/functions/lib/support-service.ts';
import { ServiceError } from '../netlify/functions/lib/scenario-service.ts';

const CREATOR = { sub: 'google-sub-creator', email: 'creator@example.com' };
const OTHER = { sub: 'google-sub-other', email: 'other@example.com' };
const ADMIN = { sub: 'google-sub-admin', email: 'admin@example.com' };

const payload = {
  type: 'bug' as const,
  severity: 'high' as const,
  title: 'Save files will not load',
  description: 'Career save fails to open after the last patch.',
  repro: 'Launch the game, continue career, observe the load error.',
  gameVersion: '1.1.0',
};

function service() {
  process.env.ADMIN_GOOGLE_SUBS = ADMIN.sub;
  return new SupportService(new InMemorySupportBlobStore());
}

describe('support service', () => {
  it('creates open tickets, hides email from other players, and allows the reporter to edit', async () => {
    const support = service();
    const created = await support.createTicket(payload, CREATOR);
    expect(created).toMatchObject({
      status: 'open',
      reporterEmail: CREATOR.email,
      isYours: true,
      hasVoted: false,
      voteCount: 0,
    });

    const anonymous = await support.getTicket(created.id, null);
    expect(anonymous?.reporterEmail).toBeUndefined();
    expect(anonymous).not.toHaveProperty('reporterSub');

    const otherView = await support.getTicket(created.id, OTHER);
    expect(otherView?.reporterEmail).toBeUndefined();
    expect(otherView?.isYours).toBe(false);

    const edited = await support.updateTicket(
      created.id,
      { ...payload, title: 'Career save files will not load' },
      CREATOR,
    );
    expect(edited.title).toBe('Career save files will not load');

    await expect(
      support.updateTicket(created.id, { ...payload, title: 'Not my ticket to edit here' }, OTHER),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('counts one vote per Google subject and freezes votes after close', async () => {
    const support = service();
    const created = await support.createTicket(payload, CREATOR);

    await expect(support.toggleVote(created.id, CREATOR)).resolves.toMatchObject({
      voteCount: 1,
      hasVoted: true,
    });
    await expect(support.toggleVote(created.id, CREATOR)).resolves.toMatchObject({
      voteCount: 0,
      hasVoted: false,
    });
    await support.toggleVote(created.id, OTHER);
    const listed = await support.listTickets({ sort: 'votes' }, CREATOR);
    expect(listed.items[0]).toMatchObject({ voteCount: 1, hasVoted: false });

    await support.updateStatus(created.id, { status: 'closed' }, ADMIN);
    await expect(support.toggleVote(created.id, OTHER)).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      support.updateTicket(created.id, { ...payload, title: 'Still trying to edit this' }, CREATOR),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('lets administrators set status and keeps hidden tickets off the public list', async () => {
    const support = service();
    const created = await support.createTicket(payload, CREATOR);

    await expect(
      support.updateStatus(created.id, { status: 'not_doing' }, CREATOR),
    ).rejects.toMatchObject({ statusCode: 403 });

    const hidden = await support.updateStatus(created.id, { status: 'hidden' }, ADMIN);
    expect(hidden.status).toBe('hidden');
    expect(hidden.reporterEmail).toBe(CREATOR.email);

    expect(await support.getTicket(created.id, null)).toBeNull();
    expect(await support.getTicket(created.id, OTHER)).toBeNull();
    expect(await support.getTicket(created.id, ADMIN)).toMatchObject({ status: 'hidden' });

    const publicList = await support.listTickets({ status: 'all' }, null);
    expect(publicList.total).toBe(0);
    const adminHidden = await support.listTickets({ status: 'hidden' }, ADMIN);
    expect(adminHidden.total).toBe(1);
    const playerHidden = await support.listTickets({ status: 'hidden' }, OTHER);
    expect(playerHidden.total).toBe(0);
  });

  it('rejects invalid create payloads', async () => {
    const support = service();
    await expect(support.createTicket({ title: 'x' }, CREATOR)).rejects.toBeInstanceOf(
      ServiceError,
    );
  });
});
