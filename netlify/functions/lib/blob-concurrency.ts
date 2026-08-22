export interface VersionedValue<T> {
  value: T;
  etag: string;
}

export type WriteCondition =
  { onlyIfNew: true; onlyIfMatch?: never } | { onlyIfMatch: string; onlyIfNew?: never };

export interface ConditionalWriteResult {
  modified: boolean;
  etag?: string;
}

export function conflictUnlessModified(result: ConditionalWriteResult, message: string): void {
  if (!result.modified) {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = 409;
    throw error;
  }
}
