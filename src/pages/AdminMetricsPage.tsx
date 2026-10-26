import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import type { TelemetrySummaryData } from '../../shared/telemetry-types.ts';

const STORAGE_KEY = 'telemetry_admin_key';

const FUNNEL_STEP_LABELS: Record<string, string> = {
  title_shown: '1. Title Screen',
  tutorial_step: '2. Tutorial Step',
  deploy: '3. Mission Deploy',
  mission_win: '4. Mission Win',
  hq_visit: '5. HQ Visit',
};

export function AdminMetricsPage() {
  const [adminKey, setAdminKey] = useState<string>(() => {
    return sessionStorage.getItem(STORAGE_KEY) || '';
  });
  const [inputKey, setInputKey] = useState('');
  const [days, setDays] = useState<number>(7);
  const [edition, setEdition] = useState<'all' | 'full' | 'demo'>('all');
  const [includeLegacy, setIncludeLegacy] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TelemetrySummaryData | null>(null);

  const handleKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputKey.trim();
    if (!trimmed) return;
    sessionStorage.setItem(STORAGE_KEY, trimmed);
    setAdminKey(trimmed);
    setInputKey('');
    setError(null);
  };

  const handleClearKey = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setAdminKey('');
    setData(null);
    setError(null);
  };

  const fetchData = useCallback(
    async (key: string, periodDays: number, ed: 'all' | 'full' | 'demo', legacy: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('days', String(periodDays));
        if (ed !== 'all') {
          params.set('edition', ed);
        }
        if (legacy) {
          params.set('includeLegacy', '1');
        }

        const endpoint = `/.netlify/functions/telemetry-summary?${params.toString()}`;
        const response = await fetch(endpoint, {
          headers: {
            'X-Admin-Key': key,
          },
        });

        if (response.status === 401) {
          setError('Unauthorized. The provided TELEMETRY_ADMIN_KEY is incorrect.');
          setLoading(false);
          return;
        }

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${response.status} ${response.statusText}`);
        }

        const json = (await response.json()) as TelemetrySummaryData;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch telemetry summary.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (adminKey) {
      void fetchData(adminKey, days, edition, includeLegacy);
    }
  }, [adminKey, days, edition, includeLegacy, fetchData]);

  if (!adminKey) {
    return (
      <section className="panel admin-panel">
        <Helmet>
          <title>Telemetry Metrics | Meridian Strike Admin</title>
          <meta name="robots" content="noindex" />
        </Helmet>

        <div className="admin-nav-tabs">
          <Link to="/admin" className="admin-nav-tab">
            Review Queue
          </Link>
          <Link to="/admin/metrics" className="admin-nav-tab active">
            Telemetry & Metrics
          </Link>
        </div>

        <div className="panel__header">
          <div>
            <h2>Telemetry Analytics & Metrics</h2>
            <p>
              Enter your secret <code>TELEMETRY_ADMIN_KEY</code> to view anonymous gameplay funnel,
              onboarding drop-off, and mature retention metrics.
            </p>
          </div>
        </div>

        <form onSubmit={handleKeySubmit} className="admin-auth-form">
          <label htmlFor="telemetry-key-input">
            <strong>Telemetry Admin Key</strong>
          </label>
          <div className="admin-auth-row">
            <input
              id="telemetry-key-input"
              type="password"
              placeholder="Paste TELEMETRY_ADMIN_KEY…"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              className="admin-input-key"
              autoFocus
            />
            <button type="submit" disabled={!inputKey.trim()}>
              Unlock Dashboard
            </button>
          </div>
          <p className="helper-text">
            The key is kept in your browser’s <code>sessionStorage</code> for this session only. It
            is never stored in URL parameters or frontend bundles.
          </p>
        </form>

        {error && <p className="status error">{error}</p>}
      </section>
    );
  }

  const firstStepCount = data?.funnel?.[0]?.uniqueInstalls || 0;
  const wins = data?.countsPerEvent?.mission_win || 0;
  const losses = data?.countsPerEvent?.mission_loss || 0;
  const totalBattles = wins + losses;
  const winRate = totalBattles > 0 ? ((wins / totalBattles) * 100).toFixed(1) : 'N/A';

  const tutComplete = data?.countsPerEvent?.tutorial_complete || 0;
  const tutSkip = data?.countsPerEvent?.tutorial_skip || 0;
  const tutTotal = tutComplete + tutSkip;
  const tutCompleteRate = tutTotal > 0 ? ((tutComplete / tutTotal) * 100).toFixed(1) : 'N/A';

  const day1Return = data?.retention?.returns?.find((r) => r.day === 1);
  const day7Return = data?.retention?.returns?.find((r) => r.day === 7);

  const breakdowns = data?.breakdown || data?.breakdowns;

  return (
    <section className="panel admin-panel metrics-dashboard">
      <Helmet>
        <title>Telemetry Dashboard | Meridian Strike Admin</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="admin-nav-tabs">
        <Link to="/admin" className="admin-nav-tab">
          Review Queue
        </Link>
        <Link to="/admin/metrics" className="admin-nav-tab active">
          Telemetry & Metrics
        </Link>
      </div>

      <div className="panel__header metrics-header">
        <div>
          <h2>Gameplay Telemetry & Funnel Dashboard</h2>
          <p>
            Anonymous player retention and progression telemetry from the Meridian Strike game
            client.
          </p>
        </div>
        <div className="metrics-header-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => void fetchData(adminKey, days, edition, includeLegacy)}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button type="button" className="secondary" onClick={handleClearKey}>
            Lock / Change Key
          </button>
        </div>
      </div>

      {/* Control bar: Days, Edition, Legacy */}
      <div className="metrics-controls">
        <div className="control-group">
          <span className="control-label">Period:</span>
          <div className="button-group">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                className={days === d ? 'active' : 'secondary'}
                onClick={() => setDays(d)}
              >
                {d} Days
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <span className="control-label">Edition:</span>
          <div className="button-group">
            {(['all', 'full', 'demo'] as const).map((ed) => (
              <button
                key={ed}
                type="button"
                className={edition === ed ? 'active' : 'secondary'}
                onClick={() => setEdition(ed)}
              >
                {ed.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeLegacy}
              onChange={(e) => setIncludeLegacy(e.target.checked)}
            />
            <span>Include legacy / unclassified events</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="callout error-callout">
          <p className="status error">{error}</p>
          <button type="button" className="secondary" onClick={handleClearKey}>
            Re-enter Admin Key
          </button>
        </div>
      )}

      {loading && !data && <p className="status">Loading metrics telemetry…</p>}

      {data && (
        <div className="metrics-content">
          {/* Top KPI Cards */}
          <div className="metrics-kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Unique Installs</span>
              <span className="kpi-value">{data.uniqueInstalls.toLocaleString()}</span>
              <span className="kpi-sub">{data.totalEvents.toLocaleString()} events recorded</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Day-1 Return</span>
              <span className="kpi-value">
                {day1Return?.rate != null ? `${(day1Return.rate * 100).toFixed(1)}%` : 'N/A'}
              </span>
              <span className="kpi-sub">
                {day1Return
                  ? `${day1Return.returnedInstalls} of ${day1Return.eligibleInstalls} installs returned`
                  : 'Awaiting mature cohort'}
              </span>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Day-7 Return</span>
              <span className="kpi-value">
                {day7Return?.rate != null ? `${(day7Return.rate * 100).toFixed(1)}%` : 'N/A'}
              </span>
              <span className="kpi-sub">
                {day7Return
                  ? `${day7Return.returnedInstalls} of ${day7Return.eligibleInstalls} installs returned`
                  : 'Awaiting mature cohort'}
              </span>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Battle Win Rate</span>
              <span className="kpi-value">{winRate}%</span>
              <span className="kpi-sub">
                {wins.toLocaleString()} Wins / {losses.toLocaleString()} Losses
              </span>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Tutorial Completion</span>
              <span className="kpi-value">{tutCompleteRate}%</span>
              <span className="kpi-sub">
                {tutComplete.toLocaleString()} completed, {tutSkip.toLocaleString()} skipped
              </span>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Rounds Before Loss</span>
              <span className="kpi-value">
                {data.combatRoundsBeforeMissionLoss.median ?? 'N/A'}
              </span>
              <span className="kpi-sub">
                Median (Mean: {data.combatRoundsBeforeMissionLoss.mean ?? 'N/A'} rds,{' '}
                {data.combatRoundsBeforeMissionLoss.sampleCount} samples)
              </span>
            </div>
          </div>

          {/* Funnel Section */}
          <div className="metrics-section">
            <div className="section-header">
              <h3>Onboarding &amp; Gameplay Cohort Funnel</h3>
              <p className="section-desc">
                Strict cohort tracking: each step only includes installations that completed the
                previous step. Conversion is never &gt; 100%.
              </p>
            </div>

            <div className="funnel-container">
              {data.funnel.map((step, idx) => {
                const percentOfStart =
                  firstStepCount > 0 ? (step.uniqueInstalls / firstStepCount) * 100 : 0;
                const conversionPrevPercent = (step.conversionFromPrevious * 100).toFixed(1);
                const label = FUNNEL_STEP_LABELS[step.step] || step.step;

                return (
                  <div key={step.step} className="funnel-row">
                    <div className="funnel-row__meta">
                      <div className="funnel-step-name">
                        <strong>{label}</strong>
                        <span className="funnel-event-name mono">{step.step}</span>
                      </div>
                      <div className="funnel-step-stats">
                        <span className="funnel-installs">
                          <strong>{step.uniqueInstalls.toLocaleString()}</strong> installs
                        </span>
                        {idx > 0 && (
                          <span className="funnel-conv">{conversionPrevPercent}% of prev</span>
                        )}
                        {idx > 0 && step.dropoffInstalls > 0 && (
                          <span className="funnel-dropoff">
                            -{step.dropoffInstalls.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="funnel-bar-track">
                      <div
                        className="funnel-bar-fill"
                        style={{ width: `${Math.max(percentOfStart, 2)}%` }}
                      >
                        <span className="funnel-bar-label">{percentOfStart.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Combat Rounds Detailed Card */}
          <div className="metrics-section">
            <div className="section-header">
              <h3>Combat Rounds Before Mission Loss</h3>
              <p className="section-desc">
                How many combat rounds players survive before defeat. Unrecorded losses are reported
                separately as missing counts and excluded from statistical calculations.
              </p>
            </div>

            <div className="combat-rounds-grid">
              <div className="stat-box">
                <span className="stat-label">Median Rounds</span>
                <span className="stat-val">
                  {data.combatRoundsBeforeMissionLoss.median ?? 'N/A'}
                </span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Mean (Average)</span>
                <span className="stat-val">{data.combatRoundsBeforeMissionLoss.mean ?? 'N/A'}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Min Rounds</span>
                <span className="stat-val">{data.combatRoundsBeforeMissionLoss.min ?? 'N/A'}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Max Rounds</span>
                <span className="stat-val">{data.combatRoundsBeforeMissionLoss.max ?? 'N/A'}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Recorded Samples</span>
                <span className="stat-val">{data.combatRoundsBeforeMissionLoss.sampleCount}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Missing Round Data</span>
                <span className="stat-val warn-text">
                  {data.combatRoundsBeforeMissionLoss.missingCount}
                </span>
              </div>
            </div>
          </div>

          {/* Breakdowns: Edition & Build */}
          {breakdowns && (
            <div className="metrics-section">
              <div className="section-header">
                <h3>Version &amp; Edition Breakdown</h3>
                <p className="section-desc">
                  Compare performance and adoption across game editions (Full vs Demo) and client
                  builds.
                </p>
              </div>

              <div className="breakdowns-grid">
                {/* By Edition */}
                <div className="breakdown-card">
                  <h4>Edition Performance</h4>
                  <table className="breakdown-table">
                    <thead>
                      <tr>
                        <th>Edition</th>
                        <th>Installs</th>
                        <th>Events</th>
                        <th>Wins</th>
                        <th>Losses</th>
                        <th>Win Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(breakdowns.byEdition).map(([key, group]) => {
                        const total = group.missionWins + group.missionLosses;
                        const rate =
                          total > 0 ? ((group.missionWins / total) * 100).toFixed(1) + '%' : 'N/A';
                        return (
                          <tr key={key}>
                            <td>
                              <span className="edition-badge">{key.toUpperCase()}</span>
                            </td>
                            <td>{group.uniqueInstalls.toLocaleString()}</td>
                            <td>{group.totalEvents.toLocaleString()}</td>
                            <td>{group.missionWins}</td>
                            <td>{group.missionLosses}</td>
                            <td>{rate}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* By Build */}
                <div className="breakdown-card">
                  <h4>Build Adoption</h4>
                  <table className="breakdown-table">
                    <thead>
                      <tr>
                        <th>Build</th>
                        <th>Installs</th>
                        <th>Events</th>
                        <th>Wins</th>
                        <th>Losses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(breakdowns.byBuild).map(([key, group]) => (
                        <tr key={key}>
                          <td className="mono">{key}</td>
                          <td>{group.uniqueInstalls.toLocaleString()}</td>
                          <td>{group.totalEvents.toLocaleString()}</td>
                          <td>{group.missionWins}</td>
                          <td>{group.missionLosses}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
