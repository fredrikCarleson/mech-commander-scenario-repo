import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { campaignDownloadUrl, campaignThumbnailUrl, fetchCampaigns } from '../api/client.ts';
import { DIFFICULTIES, SORT_OPTIONS } from '../../shared/constants.ts';
import type { CampaignMetadata } from '../../shared/schemas/campaign.ts';

export function CampaignCataloguePage() {
  const [items, setItems] = useState<CampaignMetadata[]>([]);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchCampaigns({ search, difficulty, sort, limit: 50 })
      .then((result) => {
        if (!cancelled) setItems(result.items);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : 'Could not load campaigns.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, difficulty, sort]);

  return (
    <section className="panel">
      <Helmet>
        <title>Community Campaigns | Meridian Strike</title>
      </Helmet>
      <div className="panel__header">
        <div>
          <h2>Campaign catalogue</h2>
          <p>Approved, complete linear campaigns made by the community.</p>
        </div>
      </div>
      <form className="filters" onSubmit={(event) => event.preventDefault()}>
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
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as (typeof SORT_OPTIONS)[number])}
          >
            {SORT_OPTIONS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </form>
      {loading && <p className="status">Loading campaigns...</p>}
      {error && <p className="status error">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="status">No campaigns match your filters.</p>
      )}
      <div className="scenario-grid">
        {items.map((campaign) => (
          <article key={campaign.id} className="scenario-card campaign-card">
            <img src={campaignThumbnailUrl(campaign.id)} alt="" className="scenario-card__image" />
            <div className="scenario-card__body">
              <p className="app-eyebrow">
                {campaign.difficulty} - {campaign.missionCount} missions
              </p>
              <h3>{campaign.title}</h3>
              <p className="scenario-card__author">by {campaign.authorDisplayName}</p>
              <p>{campaign.tagline}</p>
              <div className="scenario-card__stats">
                <span>
                  <strong>{campaign.estimatedPlayTimeMinutes}</strong>
                  <span className="label">Minutes</span>
                </span>
                <span>
                  <strong>{campaign.averageRating.toFixed(1)}</strong>
                  <span className="label">Rating</span>
                </span>
                <span>
                  <strong>{campaign.downloadCount}</strong>
                  <span className="label">Downloads</span>
                </span>
              </div>
              <div className="detail__actions">
                <Link className="button" to={`/campaigns/${campaign.id}`}>
                  View details
                </Link>
                <a className="button" href={campaignDownloadUrl(campaign.id)}>
                  Download ZIP
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
