import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { downloadScenario, deleteScenario, fetchScenario, submitRating } from '../api/client.ts';
import { getClientId } from '../lib/client-id.ts';
import type { ScenarioMetadata } from '../../shared/schemas/metadata.ts';

export function DetailPage() {
  const { id } = useParams();
  const [scenario, setScenario] = useState<ScenarioMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(4);
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchScenario(id!);
        if (!cancelled) {
          setScenario(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Scenario not found.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return <p className="status error">Missing scenario ID.</p>;
  }

  if (loading) {
    return <p className="status">Loading scenario…</p>;
  }

  if (error || !scenario) {
    return (
      <section className="panel">
        <p className="status error">{error ?? 'Scenario not found.'}</p>
        <Link to="/">Back to catalogue</Link>
      </section>
    );
  }

  const compatible =
    scenario.compatibility.gameVersionSupported && scenario.compatibility.scenarioFormatSupported;

  return (
    <section className="panel detail">
      <p>
        <Link to="/">← Back to catalogue</Link>
      </p>
      <header className="detail__header">
        <div>
          <p className="app-eyebrow">{scenario.difficulty}</p>
          <h2>{scenario.title}</h2>
          <p className="detail__author">by {scenario.authorDisplayName}</p>
        </div>
        <div className="detail__rating">
          <strong>★ {scenario.averageRating.toFixed(1)}</strong>
          <span>{scenario.ratingCount} ratings</span>
        </div>
      </header>

      <p className="detail__description">{scenario.description}</p>

      <dl className="detail-grid">
        <div>
          <dt>Game version</dt>
          <dd className={compatible ? 'ok' : 'warn'}>{scenario.gameVersion}</dd>
        </div>
        <div>
          <dt>Scenario format</dt>
          <dd>{scenario.scenarioFormatVersion}</dd>
        </div>
        <div>
          <dt>Recommended tonnage</dt>
          <dd>{scenario.recommendedTonnage.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Maximum tonnage</dt>
          <dd>{scenario.maximumTonnage.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Estimated play time</dt>
          <dd>{scenario.estimatedPlayTimeMinutes} minutes</dd>
        </div>
        <div>
          <dt>Map size</dt>
          <dd>
            {scenario.mapDimensions.width} × {scenario.mapDimensions.height}
          </dd>
        </div>
        <div>
          <dt>Downloads</dt>
          <dd>{scenario.downloadCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Package size</dt>
          <dd>{(scenario.packageFileSize / 1024).toFixed(1)} KiB</dd>
        </div>
        <div>
          <dt>Checksum (SHA-256)</dt>
          <dd className="mono">{scenario.checksumSha256}</dd>
        </div>
      </dl>

      {scenario.compatibility.warnings.length > 0 && (
        <div className="callout warn">
          <h3>Compatibility notes</h3>
          <ul>
            {scenario.compatibility.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {scenario.tags.length > 0 && (
        <ul className="tag-list">
          {scenario.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}

      <div className="detail__actions">
        <button
          type="button"
          onClick={async () => {
            const blob = await downloadScenario(scenario.id);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${scenario.title.replace(/\s+/g, '_')}.zip`;
            anchor.click();
            URL.revokeObjectURL(url);
            setScenario({ ...scenario, downloadCount: scenario.downloadCount + 1 });
          }}
        >
          Download package
        </button>

        <form
          className="rating-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await submitRating(scenario.id, {
              rating,
              clientId: getClientId(),
            });
            setScenario({
              ...scenario,
              averageRating: result.averageRating,
              ratingCount: result.ratingCount,
            });
            setRatingMessage(`Your rating of ${result.yourRating} was recorded.`);
          }}
        >
          <label>
            Rate this scenario
            <input
              type="range"
              min={1}
              max={5}
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
            />
          </label>
          <span>{rating} / 5</span>
          <button type="submit">Submit rating</button>
        </form>

        <button
          type="button"
          className="danger"
          disabled={deleting}
          onClick={async () => {
            if (
              !window.confirm(
                `Permanently delete "${scenario.title}" from the community repository? This cannot be undone.`,
              )
            ) {
              return;
            }
            setDeleting(true);
            try {
              await deleteScenario(scenario.id);
              window.location.href = '/';
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Delete failed.');
              setDeleting(false);
            }
          }}
        >
          {deleting ? 'Deleting…' : 'Delete scenario'}
        </button>
      </div>
      {ratingMessage && <p className="status">{ratingMessage}</p>}
    </section>
  );
}
