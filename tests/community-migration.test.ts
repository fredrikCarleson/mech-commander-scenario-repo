import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
// @ts-ignore The executable migration module is intentionally plain Node ESM.
import { applyMigrationPlan, planCommunityMigration } from '../scripts/community-migration.mjs';

async function fixture(): Promise<any> {
  return JSON.parse(
    await readFile(new URL('./fixtures/migration-v1.json', import.meta.url), 'utf8'),
  );
}

describe('legacy community migration planner', () => {
  it('is dry-run, owner-safe, byte-preserving, and idempotent', async () => {
    const source = await fixture();
    const before = structuredClone(source);
    const plan = planCommunityMigration(source);

    expect(plan.dryRun).toBe(true);
    expect(source).toEqual(before);
    expect(plan.records).toHaveLength(4);
    expect(plan.records.every((record: { ownerless: boolean }) => record.ownerless)).toBe(true);
    expect(plan.records.map((record: { disposition: string }) => record.disposition)).toEqual([
      'approved',
      'pending',
      'legacy-rejected',
      'approved',
    ]);
    expect(
      plan.writes['ownership/scenarios/11111111-1111-4111-8111-111111111111.json'],
    ).toBeUndefined();
    expect(
      plan.writes['revisions/scenarios/11111111-1111-4111-8111-111111111111/1/package.zip'],
    ).toEqual(source.blobs['pkg/11111111-1111-4111-8111-111111111111.zip']);
    expect(
      plan.writes['submissions/scenarios/22222222-2222-4222-8222-222222222222.json'],
    ).toBeDefined();
    expect(
      plan.writes['revisions/scenarios/22222222-2222-4222-8222-222222222222/1/package.zip'],
    ).toEqual(source.blobs['pkg/22222222-2222-4222-8222-222222222222.zip']);
    const rejected = JSON.parse(
      plan.writes['submissions/scenarios/33333333-3333-4333-8333-333333333333.json'].value,
    );
    expect(rejected.rejection).toMatchObject({
      moderatorSub: 'legacy-ownerless-migration',
    });
    expect(
      plan.writes['revisions/scenarios/44444444-4444-4444-8444-444444444444/1/package.zip'],
    ).toBeUndefined();

    const migrated = applyMigrationPlan(source, plan);
    const rerun = planCommunityMigration(migrated);
    expect(rerun.proposedWriteCount).toBe(0);
    expect(migrated.blobs['pkg/11111111-1111-4111-8111-111111111111.zip']).toEqual(
      source.blobs['pkg/11111111-1111-4111-8111-111111111111.zip'],
    );
    expect(migrated.blobs['ratings/11111111-1111-4111-8111-111111111111.json']).toEqual(
      source.blobs['ratings/11111111-1111-4111-8111-111111111111.json'],
    );
  });

  it('fails closed rather than inventing missing approved assets', async () => {
    const source = await fixture();
    delete source.blobs['thumb/11111111-1111-4111-8111-111111111111.webp'];
    expect(() => planCommunityMigration(source)).toThrow(/cannot be migrated/i);
  });

  it('fails closed on checksum mismatch and conflicting partial migration bytes', async () => {
    const mismatched = await fixture();
    mismatched.blobs['pkg/11111111-1111-4111-8111-111111111111.zip'].value = 'AAAA';
    expect(() => planCommunityMigration(mismatched)).toThrow(/checksum/i);

    const conflicting = await fixture();
    conflicting.blobs[
      'revisions/scenarios/44444444-4444-4444-8444-444444444444/1/package.zip'
    ].value = 'AAAA';
    expect(() => planCommunityMigration(conflicting)).toThrow(/conflicting/i);
  });
});
