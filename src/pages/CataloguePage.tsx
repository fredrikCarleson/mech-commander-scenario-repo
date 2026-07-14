import { useEffect, useState } from 'react';
import { fetchScenarios } from '../api/client.ts';
import { ScenarioCard } from '../components/ScenarioCard.tsx';
import { DIFFICULTIES, SORT_OPTIONS } from '../../shared/constants.ts';
import type { ScenarioMetadata } from '../../shared/schemas/metadata.ts';

export function CataloguePage() {
  const [items, setItems] = useState<ScenarioMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [maxTonnage, setMaxTonnage] = useState('');
  const [tags, setTags] = useState('');
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]>('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchScenarios({
          page,
          search: search || undefined,
          difficulty: difficulty || undefined,
          maxTonnage: maxTonnage ? Number(maxTonnage) : undefined,
          tags: tags || undefined,
          sort,
        });
        if (!cancelled) {
          setItems(response.items);
          setTotalPages(response.totalPages);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load scenarios.');
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
  }, [page, search, difficulty, maxTonnage, tags, sort]);

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Scenario catalogue</h2>
          <p>Browse validated community scenario packages.</p>
        </div>
      </div>

      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
        }}
      >
        <label>
          Search
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Title, author, tags"
          />
        </label>
        <label>
          Difficulty
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
            <option value="">Any</option>
            {DIFFICULTIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Max tonnage
          <input
            type="number"
            min={1}
            value={maxTonnage}
            onChange={(event) => setMaxTonnage(event.target.value)}
            placeholder="e.g. 4800"
          />
        </label>
        <label>
          Tags
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="urban,night"
          />
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as (typeof SORT_OPTIONS)[number])}
          >
            {SORT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>

      {loading && <p className="status">Loading scenarios…</p>}
      {error && <p className="status error">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="status">No scenarios match your filters.</p>
      )}

      <div className="scenario-grid">
        {items.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
