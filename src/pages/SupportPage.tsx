import { GoogleLogin, GoogleOAuthProvider, googleLogout } from '@react-oauth/google';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  SUPPORT_SEVERITIES,
  SUPPORT_SEVERITY_LABELS,
  SUPPORT_SORT_OPTIONS,
  SUPPORT_STATUS_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_TYPE_LABELS,
  SUPPORT_TYPES,
  type SupportSeverity,
  type SupportSortOption,
  type SupportStatus,
  type SupportType,
} from '../../shared/constants.ts';
import type { CreateSupportTicketBody, PublicSupportTicket } from '../../shared/schemas/support.ts';
import {
  createSupportTicket,
  fetchSupportTickets,
  updateSupportTicket,
  updateSupportTicketStatus,
  voteSupportTicket,
} from '../api/support-client.ts';
import {
  createCreatorSession,
  createOAuthNonce,
  fetchCreatorSession,
  getCreatorToken,
  setCreatorToken,
  type CreatorSession,
} from '../api/session-client.ts';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

const emptyForm: CreateSupportTicketBody = {
  type: 'bug',
  severity: 'medium',
  title: '',
  description: '',
  repro: '',
  gameVersion: '',
};

export function SupportPage() {
  if (!googleClientId) {
    return (
      <section className="panel">
        <h2>Support</h2>
        <p className="status error">
          Google sign-in is not configured. Set <code>VITE_GOOGLE_CLIENT_ID</code> for this site.
        </p>
      </section>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <SupportPanel />
    </GoogleOAuthProvider>
  );
}

function SupportPanel() {
  const [nonce] = useState(() => createOAuthNonce());
  const [session, setSession] = useState<CreatorSession | null>(null);
  const [items, setItems] = useState<PublicSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | SupportType>('');
  const [severity, setSeverity] = useState<'' | SupportSeverity>('');
  const [status, setStatus] = useState<SupportStatus | 'all'>('open');
  const [sort, setSort] = useState<SupportSortOption>('votes');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateSupportTicketBody>(emptyForm);
  const [busy, setBusy] = useState(false);

  const signedIn = Boolean(session);
  const statusFilters = useMemo(
    () =>
      session?.isAdmin
        ? [...SUPPORT_STATUSES, 'all' as const]
        : (['open', 'closed', 'not_doing', 'all'] as const),
    [session?.isAdmin],
  );

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchSupportTickets({
        page,
        search: search || undefined,
        type: type || undefined,
        severity: severity || undefined,
        status,
        sort,
      });
      setItems(response.items);
      setTotalPages(response.totalPages);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load support tickets.');
    } finally {
      setLoading(false);
    }
  }, [page, search, type, severity, status, sort]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!getCreatorToken()) return;
      try {
        const current = await fetchCreatorSession();
        if (!cancelled) setSession(current);
      } catch {
        if (!cancelled) {
          setCreatorToken(null);
          setSession(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const created = await createSupportTicket({
        ...form,
        gameVersion: form.gameVersion?.trim() ? form.gameVersion.trim() : undefined,
      });
      setForm(emptyForm);
      setStatus('open');
      setPage(1);
      setMessage('Ticket submitted.');
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      await loadTickets();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not submit ticket.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVote(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await voteSupportTicket(id);
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, voteCount: result.voteCount, hasVoted: result.hasVoted }
            : item,
        ),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not record vote.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(id: string, next: SupportStatus) {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await updateSupportTicketStatus(id, next);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, ...updated } : item)),
      );
      if (status !== 'all' && updated.status !== status) {
        await loadTickets();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update status.');
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit(id: string, body: CreateSupportTicketBody) {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await updateSupportTicket(id, {
        ...body,
        gameVersion: body.gameVersion?.trim() ? body.gameVersion.trim() : undefined,
      });
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, ...updated } : item)),
      );
      setMessage('Ticket updated.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update ticket.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <Helmet>
        <title>Support | Meridian Strike</title>
        <meta
          name="description"
          content="Report Meridian Strike bugs or request features. Sign in with Google to add a ticket or vote."
        />
      </Helmet>
      <div className="panel__header">
        <div>
          <h2>Support</h2>
          <p>
            Public bug and request tracker. Sign in with Google to add a ticket or vote. Open this
            page in a normal browser, not the Steam overlay.
          </p>
        </div>
        {signedIn ? (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              googleLogout();
              setCreatorToken(null);
              setSession(null);
            }}
          >
            Sign out
          </button>
        ) : (
          <GoogleLogin
            nonce={nonce}
            onSuccess={(response) => {
              if (!response.credential) {
                setMessage('Google sign-in did not return a credential.');
                return;
              }
              void createCreatorSession(response.credential, nonce)
                .then((current) => {
                  setSession(current);
                  setMessage(null);
                  void loadTickets();
                })
                .catch((err: unknown) => {
                  setMessage(err instanceof Error ? err.message : 'Sign-in failed.');
                });
            }}
            onError={() => setMessage('Google sign-in failed.')}
            useOneTap={false}
          />
        )}
      </div>

      <p className="callout">
        Reports are public except your email. Email is stored so we can contact you and is visible
        only to you and administrators.
      </p>

      {signedIn && session && (
        <form className="support-form" onSubmit={(event) => void handleCreate(event)}>
          <h3>New ticket</h3>
          <label>
            Email
            <input value={session.email} readOnly />
          </label>
          <div className="support-form__row">
            <label>
              Type
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({ ...current, type: event.target.value as SupportType }))
                }
              >
                {SUPPORT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {SUPPORT_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Severity
              <select
                value={form.severity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    severity: event.target.value as SupportSeverity,
                  }))
                }
              >
                {SUPPORT_SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {SUPPORT_SEVERITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Game version
              <input
                value={form.gameVersion ?? ''}
                onChange={(event) =>
                  setForm((current) => ({ ...current, gameVersion: event.target.value }))
                }
                placeholder="optional"
                maxLength={32}
              />
            </label>
          </div>
          <label>
            Short description
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              required
              minLength={8}
              maxLength={100}
            />
          </label>
          <label>
            Details
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              required
              minLength={8}
              maxLength={500}
              rows={3}
            />
          </label>
          <label>
            Error / how to reproduce
            <textarea
              value={form.repro}
              onChange={(event) =>
                setForm((current) => ({ ...current, repro: event.target.value }))
              }
              required
              minLength={8}
              maxLength={4000}
              rows={5}
            />
          </label>
          <button type="submit" disabled={busy}>
            Submit ticket
          </button>
        </form>
      )}

      {!signedIn && (
        <p className="status">Sign in with Google to add a ticket or vote on an existing one.</p>
      )}

      {message && <p className="status">{message}</p>}
      {error && <p className="status error">{error}</p>}

      <div className="filters">
        <label>
          Search title
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Type
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as '' | SupportType);
              setPage(1);
            }}
          >
            <option value="">Any</option>
            {SUPPORT_TYPES.map((value) => (
              <option key={value} value={value}>
                {SUPPORT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Severity
          <select
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value as '' | SupportSeverity);
              setPage(1);
            }}
          >
            <option value="">Any</option>
            {SUPPORT_SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {SUPPORT_SEVERITY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as SupportStatus | 'all');
              setPage(1);
            }}
          >
            {statusFilters.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'All' : SUPPORT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SupportSortOption);
              setPage(1);
            }}
          >
            {SUPPORT_SORT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value === 'votes' ? 'Most votes' : 'Newest'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="status">Loading tickets…</p>
      ) : items.length === 0 ? (
        <p className="status">No tickets match these filters.</p>
      ) : (
        <ul className="support-list">
          {items.map((item) => (
            <SupportTicketCard
              key={item.id}
              ticket={item}
              expanded={expandedId === item.id}
              signedIn={signedIn}
              isAdmin={Boolean(session?.isAdmin)}
              busy={busy}
              onToggle={() => setExpandedId((current) => (current === item.id ? null : item.id))}
              onVote={() => void handleVote(item.id)}
              onStatus={(next) => void handleStatus(item.id, next)}
              onEdit={(body) => void handleEdit(item.id, body)}
            />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {totalPages} ({total})
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

function SupportTicketCard({
  ticket,
  expanded,
  signedIn,
  isAdmin,
  busy,
  onToggle,
  onVote,
  onStatus,
  onEdit,
}: {
  ticket: PublicSupportTicket;
  expanded: boolean;
  signedIn: boolean;
  isAdmin: boolean;
  busy: boolean;
  onToggle: () => void;
  onVote: () => void;
  onStatus: (status: SupportStatus) => void;
  onEdit: (body: CreateSupportTicketBody) => void;
}) {
  const [edit, setEdit] = useState<CreateSupportTicketBody>({
    type: ticket.type,
    severity: ticket.severity,
    title: ticket.title,
    description: ticket.description,
    repro: ticket.repro,
    gameVersion: ticket.gameVersion ?? '',
  });

  useEffect(() => {
    setEdit({
      type: ticket.type,
      severity: ticket.severity,
      title: ticket.title,
      description: ticket.description,
      repro: ticket.repro,
      gameVersion: ticket.gameVersion ?? '',
    });
  }, [ticket]);

  const canEdit = ticket.isYours && ticket.status === 'open';

  return (
    <li className="support-card">
      <header className="support-card__header">
        <button type="button" className="support-card__title" onClick={onToggle}>
          {ticket.title}
        </button>
        <div className="support-card__actions">
          <span className="support-card__votes">{ticket.voteCount} votes</span>
          {signedIn && ticket.status === 'open' && (
            <button type="button" className="secondary" disabled={busy} onClick={onVote}>
              {ticket.hasVoted ? 'Voted' : 'Vote'}
            </button>
          )}
        </div>
      </header>
      <p className="support-card__meta">
        {SUPPORT_TYPE_LABELS[ticket.type]} · {SUPPORT_SEVERITY_LABELS[ticket.severity]} ·{' '}
        {SUPPORT_STATUS_LABELS[ticket.status]}
        {ticket.gameVersion ? ` · ${ticket.gameVersion}` : ''}
        {ticket.reporterEmail ? ` · ${ticket.reporterEmail}` : ''}
      </p>
      {expanded && (
        <div className="support-card__body">
          {canEdit ? (
            <form
              className="support-form support-form--compact"
              onSubmit={(event) => {
                event.preventDefault();
                onEdit(edit);
              }}
            >
              <label>
                Short description
                <input
                  value={edit.title}
                  onChange={(event) =>
                    setEdit((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                  minLength={8}
                  maxLength={100}
                />
              </label>
              <label>
                Details
                <textarea
                  value={edit.description}
                  onChange={(event) =>
                    setEdit((current) => ({ ...current, description: event.target.value }))
                  }
                  required
                  minLength={8}
                  maxLength={500}
                  rows={3}
                />
              </label>
              <label>
                Error / how to reproduce
                <textarea
                  value={edit.repro}
                  onChange={(event) =>
                    setEdit((current) => ({ ...current, repro: event.target.value }))
                  }
                  required
                  minLength={8}
                  maxLength={4000}
                  rows={5}
                />
              </label>
              <button type="submit" disabled={busy}>
                Save changes
              </button>
            </form>
          ) : (
            <>
              <p className="support-card__text">{ticket.description}</p>
              <pre className="support-card__repro">{ticket.repro}</pre>
            </>
          )}
          {isAdmin && (
            <label>
              Status
              <select
                value={ticket.status}
                disabled={busy}
                onChange={(event) => onStatus(event.target.value as SupportStatus)}
              >
                {SUPPORT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {SUPPORT_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </li>
  );
}
