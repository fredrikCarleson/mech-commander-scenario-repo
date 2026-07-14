import { GoogleOAuthProvider, GoogleLogin, googleLogout } from '@react-oauth/google';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  approveScenario,
  deleteScenarioAdmin,
  fetchAdminScenarioThumbnail,
  fetchPendingScenarios,
  rejectScenario,
  setAdminToken,
  verifyAdminSession,
} from '../api/admin-client.ts';
import type { ScenarioMetadata } from '../../shared/schemas/metadata.ts';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

type PendingCard = ScenarioMetadata & {
  thumbnailUrl?: string;
};

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
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const pending = await fetchPendingScenarios();
    const cards: PendingCard[] = await Promise.all(
      pending.map(async (item) => ({
        ...item,
        thumbnailUrl: (await fetchAdminScenarioThumbnail(item.id)) ?? undefined,
      })),
    );
    setItems(cards);
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
    };
  }, [items]);

  async function handleApprove(id: string) {
    setBusyId(id);
    setMessage(null);
    try {
      await approveScenario(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setMessage('Scenario approved and published to the catalogue.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Approve failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string, title: string) {
    if (!window.confirm(`Reject "${title}"? It will be archived and hidden from review.`)) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    try {
      await rejectScenario(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setMessage('Scenario rejected.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Reject failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Permanently delete "${title}"? This cannot be undone.`)) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    try {
      await deleteScenarioAdmin(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setMessage('Scenario deleted.');
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
            <p>Sign in with your Google account to approve community scenario uploads.</p>
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
          <p>{items.length} scenario{items.length === 1 ? '' : 's'} awaiting approval.</p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            googleLogout();
            setAdminToken(null);
            setSignedIn(false);
            setItems([]);
          }}
        >
          Sign out
        </button>
      </div>

      {message && <p className="status">{message}</p>}

      {items.length === 0 ? (
        <div className="callout">
          <p>No scenarios are waiting for review.</p>
          <p>
            <Link to="/">Back to catalogue</Link>
          </p>
        </div>
      ) : (
        <div className="admin-queue">
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
                    onClick={() => void handleApprove(item.id)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busyId === item.id}
                    onClick={() => void handleReject(item.id, item.title)}
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
    </section>
  );
}
