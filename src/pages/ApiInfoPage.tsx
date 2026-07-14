import {
  SUPPORTED_GAME_VERSIONS,
  SUPPORTED_MANIFEST_SCHEMA_VERSIONS,
  SUPPORTED_SCENARIO_FORMAT_VERSIONS,
} from '../../shared/constants.ts';
import { metadataKey, packageKey, ratingsKey, thumbnailKey } from '../../shared/blob-keys.ts';

export function ApiInfoPage() {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>API & compatibility</h2>
          <p>Versioned HTTP API for the Mech Commander client and community tools.</p>
        </div>
      </div>

      <div className="callout">
        <h3>Base URL</h3>
        <p className="mono">/api/v1</p>
      </div>

      <h3>Endpoints</h3>
      <ul className="api-list">
        <li>
          <code>GET /scenarios</code> — paginated catalogue with search, difficulty, maxTonnage,
          tags, and sort (`newest`, `rating`, `downloads`).
        </li>
        <li>
          <code>GET /scenarios/:id</code> — scenario metadata.
        </li>
        <li>
          <code>GET /scenarios/:id/download</code> — ZIP package download (increments download
          count).
        </li>
        <li>
          <code>POST /scenarios</code> — upload raw ZIP (`Content-Type: application/zip`).
        </li>
        <li>
          <code>POST /scenarios/:id/ratings</code> — JSON body{' '}
          <code>{'{ "rating": 1-5, "clientId": "uuid" }'}</code>. Replaces prior rating from the
          same client ID.
        </li>
      </ul>

      <h3>Supported versions</h3>
      <dl className="detail-grid compact">
        <div>
          <dt>Manifest schema</dt>
          <dd>{SUPPORTED_MANIFEST_SCHEMA_VERSIONS.join(', ')}</dd>
        </div>
        <div>
          <dt>Game versions</dt>
          <dd>{SUPPORTED_GAME_VERSIONS.join(', ')}</dd>
        </div>
        <div>
          <dt>Scenario format</dt>
          <dd>{SUPPORTED_SCENARIO_FORMAT_VERSIONS.join(', ')}</dd>
        </div>
      </dl>

      <h3>Netlify Blob keys</h3>
      <ul className="api-list">
        <li>
          <code>{metadataKey('{scenarioId}')}</code> — metadata JSON record
        </li>
        <li>
          <code>{packageKey('{scenarioId}')}</code> — immutable package bytes
        </li>
        <li>
          <code>{thumbnailKey('{scenarioId}')}</code> — extracted WebP thumbnail
        </li>
        <li>
          <code>{ratingsKey('{scenarioId}')}</code> — per-client ratings array
        </li>
      </ul>

      <h3>Package requirements</h3>
      <p>Root-level files only: manifest.json, scenario.json, map.json, thumbnail.webp.</p>
      <p>
        Server validation enforces size limits, path traversal protection, schema versions, and
        checksum generation. Client-side validation is advisory only.
      </p>
    </section>
  );
}
