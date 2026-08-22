import { GoogleOAuthProvider, GoogleLogin, googleLogout } from '@react-oauth/google';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  approveCampaign,
  approveScenario,
  deleteCampaignAdmin,
  deleteScenarioAdmin,
  fetchAdminCampaignThumbnail,
  fetchAdminScenarioThumbnail,
  fetchPendingCampaigns,
  fetchPendingScenarios,
  rejectCampaign,
  rejectScenario,
  setAdminToken,
  verifyAdminSession,
} from '../api/admin-client.ts';
import type { ScenarioMetadata } from '../../shared/schemas/metadata.ts';
import type { CampaignMetadata } from '../../shared/schemas/campaign.ts';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

type PendingCard = ScenarioMetadata & {
  thumbnailUrl?: string;
};
type PendingCampaignCard = CampaignMetadata & { thumbnailUrl?: string };

export function AdminPage() {
  if (!googleClientId) {
    return (
      <section className="panel">
        <h2>Admin review</h2>
        <p className="status error">
          Google sign-in is not configured. Set <code>VITE_GOOGLE_CLIENT_ID</code> for this site.
        </p>
      </section>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AdminReviewPanel />
    </GoogleOAuthProvider>
  );
}

function AdminReviewPanel() {
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingCard[]>([]);
  const [campaigns, setCampaigns] = useState<PendingCampaignCard[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const [pending, pendingCampaigns] = await Promise.all([
      fetchPendingScenarios(),
      fetchPendingCampaigns(),
    ]);
    const cards: PendingCard[] = await Promise.all(
      pending.map(async (item) => ({
        ...item,
        thumbnailUrl: (await fetchAdminScenarioThumbnail(item.id)) ?? undefined,
      })),
    );
    setItems(cards);
    setCampaigns(
      await Promise.all(
        pendingCampaigns.map(async (item) => ({
          ...item,
          thumbnailUrl: (await fetchAdminCampaignThumbnail(item.id)) ?? undefined,
        })),
      ),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const ok = await verifyAdminSession();
      if (cancelled) {
        return;
      }
      setSignedIn(ok);
      if (ok) {
        try {
          await loadPending();
        } catch (err) {
          setMessage(err instanceof Error ? err.message : 'Failed to load pending scenarios.');
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPending]);

  useEffect(() => {
    return () => {
      for (const item of items) {
        if (item.thumbnailUrl) {
          URL.revokeObjectURL(item.thumbnailUrl);
        }
      }
      for (const campaign of campaigns) {
        if (campaign.thumbnailUrl) URL.revokeObjectURL(campaign.thumbnailUrl);
      }
    };
  }, [items, campaigns]);

  async function handleCampaignAction(
    action: 'approve' | 'reject' | 'delete',
    item: PendingCampaignCard,
  ) {
    let reason: string | null = null;
    if (action === 'reject') {
      reason = window.prompt(`Why is revision ${item.revision} of "${item.title}" rejected?`);
      if (!reason?.trim()) return;
    }
    if (
      action === 'delete' &&
      !window.confirm(
        `Administratively delete "${item.title}"? Public access will stop, while immutable release records remain retained for audit.`,
      )
    )
      return;
    setBusyId(item.id);
    setMessage(null);
    try {
      if (action === 'approve') await approveCampaign(item.id, item.revision);
      else if (action === 'reject') await rejectCampaign(item.id, item.revision, reason!);
      else await deleteCampaignAdmin(item.id);
      setCampaigns((current) => current.filter((campaign) => campaign.id !== item.id));
      setMessage(
        action === 'approve'
          ? 'Campaign revision approved and published.'
          : action === 'reject'
            ? 'Campaign revision rejected.'
            : 'Campaign administratively deleted; immutable release records were retained.',
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Campaign review action failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleApprove(item: PendingCard) {
    setBusyId(item.id);
    setMessage(null);
    try {
      await approveScenario(item.id, item.revision ?? 1);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setMessage('Scenario approved and published to the catalogue.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Approve failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(item: PendingCard) {
    const reason = window.prompt(
      `Why is revision ${item.revision ?? 1} of "${item.title}" rejected?`,
    );
    if (!reason?.trim()) return;
    setBusyId(item.id);
    setMessage(null);
    try {
      await rejectScenario(item.id, item.revision ?? 1, reason);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setMessage('Scenario rejected.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Reject failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (
      !window.confirm(`Administratively delete "${title}"? Immutable releases remain retained.`)
    ) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    try {
      await deleteScenarioAdmin(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setMessage('Scenario administratively deleted; immutable releases were retained.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="status">Loading admin panel…</p>;
  }

  if (!signedIn) {
    return (
      <section className="panel admin-panel">
        <div className="panel__header">
          <div>
            <h2>Admin review</h2>
            <p>Sign in with your Google account to review community scenarios and campaigns.</p>
          </div>
        </div>
        <div className="admin-signin">
          <GoogleLogin
            onSuccess={(response) => {
              if (!response.credential) {
                setMessage('Google sign-in did not return a credential.');
                return;
              }
              setAdminToken(response.credential);
              setSignedIn(true);
              setMessage(null);
              void loadPending().catch((err) => {
                setSignedIn(false);
                setAdminToken(null);
                setMessage(err instanceof Error ? err.message : 'Sign-in failed.');
              });
            }}
            onError={() => setMessage('Google sign-in failed.')}
            useOneTap={false}
          />
        </div>
        {message && <p className="status error">{message}</p>}
      </section>
    );
  }

  return (
    <section className="panel admin-panel">
      <div className="panel__header">
        <div>
          <h2>Pending review</h2>
          <p>
            {items.length} scenario{items.length === 1 ? '' : 's'} and {campaigns.length} campaign
            {campaigns.length === 1 ? '' : 's'} awaiting approval.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            googleLogout();
            setAdminToken(null);
            setSignedIn(false);
            setItems([]);
            setCampaigns([]);
          }}
        >
          Sign out
        </button>
      </div>

      {message && <p className="status">{message}</p>}

      {items.length === 0 && campaigns.length === 0 ? (
        <div className="callout">
          <p>No scenarios or campaigns are waiting for review.</p>
          <p>
            <Link to="/catalogue">Back to catalogue</Link>
          </p>
        </div>
      ) : (
        <>
          {campaigns.length > 0 && (
            <div className="admin-queue">
              <h3>Campaign revisions</h3>
              {campaigns.map((item) => (
                <article key={item.id} className="admin-card">
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" className="admin-card__thumb" />
                  ) : (
                    <div className="admin-card__thumb admin-card__thumb--empty">No preview</div>
                  )}
                  <div className="admin-card__body">
                    <p className="app-eyebrow">Campaign - {item.difficulty}</p>
                    <h3>{item.title}</h3>
                    <p className="admin-card__author">by {item.authorDisplayName}</p>
                    <p>{item.tagline}</p>
                    <dl className="detail-grid compact">
                      <div>
                        <dt>Revision</dt>
                        <dd>{item.revision}</dd>
                      </div>
                      <div>
                        <dt>Currently live</dt>
                        <dd>{item.publishedRevision ?? 'New'}</dd>
                      </div>
                      <div>
                        <dt>Missions</dt>
                        <dd>{item.missionCount}</dd>
                      </div>
                      <div>
                        <dt>Est. play time</dt>
                        <dd>{item.estimatedPlayTimeMinutes} min</dd>
                      </div>
                    </dl>
                    <div className="admin-card__actions">
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void handleCampaignAction('approve', item)}
                      >
                        Approve revision
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busyId === item.id}
                        onClick={() => void handleCampaignAction('reject', item)}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busyId === item.id}
                        onClick={() => void handleCampaignAction('delete', item)}
                      >
                        Delete all
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {items.length > 0 && (
            <div className="admin-queue">
              <h3>Scenarios</h3>
              {items.map((item) => (
                <article key={item.id} className="admin-card">
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" className="admin-card__thumb" />
                  ) : (
                    <div className="admin-card__thumb admin-card__thumb--empty">No preview</div>
                  )}
                  <div className="admin-card__body">
                    <p className="app-eyebrow">{item.difficulty}</p>
                    <h3>{item.title}</h3>
                    <p className="admin-card__author">by {item.authorDisplayName}</p>
                    <p>{item.description}</p>
                    <dl className="detail-grid compact">
                      <div>
                        <dt>Max tonnage</dt>
                        <dd>{item.maximumTonnage}</dd>
                      </div>
                      <div>
                        <dt>Map</dt>
                        <dd>
                          {item.mapDimensions.width} × {item.mapDimensions.height}
                        </dd>
                      </div>
                      <div>
                        <dt>Submitted</dt>
                        <dd>{new Date(item.updatedAt).toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Game version</dt>
                        <dd>{item.gameVersion}</dd>
                      </div>
                    </dl>
                    {item.compatibility.warnings.length > 0 && (
                      <ul className="admin-card__warnings">
                        {item.compatibility.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                    <div className="admin-card__actions">
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void handleApprove(item)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busyId === item.id}
                        onClick={() => void handleReject(item)}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busyId === item.id}
                        onClick={() => void handleDelete(item.id, item.title)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
