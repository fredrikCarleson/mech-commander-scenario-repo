import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import type { CampaignMetadata } from '../../shared/schemas/campaign.ts';
import { downloadCampaign, fetchCampaign, submitCampaignRating } from '../api/client.ts';
import { getClientId } from '../lib/client-id.ts';

export function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<CampaignMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [rating, setRating] = useState(4);
  const [ratingMessage, setRatingMessage] = useState<string>();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void fetchCampaign(id)
      .then((value) => {
        if (!cancelled) setCampaign(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Campaign not found.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return <p className="status error">Missing campaign ID.</p>;
  if (loading) return <p className="status">Loading campaign...</p>;
  if (error || !campaign) {
    return (
      <section className="panel">
        <Helmet>
          <title>Campaign Not Found | Meridian Strike</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <p className="status error">{error ?? 'Campaign not found.'}</p>
        <Link to="/campaigns">Back to campaigns</Link>
      </section>
    );
  }

  const compatible =
    campaign.compatibility.gameVersionSupported && campaign.compatibility.campaignFormatSupported;

  return (
    <section className="panel detail">
      <Helmet>
        <title>{campaign.title} | Meridian Strike Campaigns</title>
        <meta name="description" content={campaign.tagline} />
      </Helmet>
      <p>
        <Link to="/campaigns">Back to campaign catalogue</Link>
      </p>
      <header className="detail__header">
        <div>
          <p className="app-eyebrow">{campaign.difficulty}</p>
          <h2>{campaign.title}</h2>
          <p className="detail__author">by {campaign.authorDisplayName}</p>
        </div>
        <div className="detail__rating">
          <strong>{campaign.averageRating.toFixed(1)} / 5</strong>
          <span>{campaign.ratingCount} ratings</span>
        </div>
      </header>

      <p className="detail__description">{campaign.tagline}</p>
      <dl className="detail-grid">
        <div>
          <dt>Stable campaign ID</dt>
          <dd className="mono">{campaign.stableCampaignId}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{campaign.publishedRevision ?? campaign.revision}</dd>
        </div>
        <div>
          <dt>Missions</dt>
          <dd>{campaign.missionCount}</dd>
        </div>
        <div>
          <dt>Estimated play time</dt>
          <dd>{campaign.estimatedPlayTimeMinutes} minutes</dd>
        </div>
        <div>
          <dt>Game version</dt>
          <dd className={compatible ? 'ok' : 'warn'}>{campaign.gameVersion}</dd>
        </div>
        <div>
          <dt>Campaign format</dt>
          <dd>{campaign.campaignFormatVersion}</dd>
        </div>
        <div>
          <dt>Downloads</dt>
          <dd>{campaign.downloadCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Package size</dt>
          <dd>{(campaign.packageFileSize / 1024).toFixed(1)} KiB</dd>
        </div>
        <div>
          <dt>Checksum (SHA-256)</dt>
          <dd className="mono">{campaign.checksumSha256}</dd>
        </div>
      </dl>

      {campaign.compatibility.warnings.length > 0 && (
        <div className="callout warn">
          <h3>Compatibility notes</h3>
          <ul>
            {campaign.compatibility.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {campaign.tags.length > 0 && (
        <ul className="tag-list">
          {campaign.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}

      <div className="detail__actions">
        <button
          type="button"
          onClick={async () => {
            const blob = await downloadCampaign(campaign.id);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${campaign.title.replace(/\s+/g, '_')}.zip`;
            anchor.click();
            URL.revokeObjectURL(url);
            setCampaign({ ...campaign, downloadCount: campaign.downloadCount + 1 });
          }}
        >
          Download package
        </button>
        <form
          className="rating-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await submitCampaignRating(campaign.id, {
              rating,
              clientId: getClientId(),
            });
            setCampaign({
              ...campaign,
              averageRating: result.averageRating,
              ratingCount: result.ratingCount,
            });
            setRatingMessage(`Your rating of ${result.yourRating} was recorded.`);
          }}
        >
          <label>
            Rate this campaign
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
      </div>
      {ratingMessage && <p className="status">{ratingMessage}</p>}
    </section>
  );
}
