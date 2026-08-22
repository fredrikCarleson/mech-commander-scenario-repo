import { Link } from 'react-router-dom';

/** Stable destination for old upload bookmarks; publishing moved into the desktop game. */
export function UploadPage() {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Community publishing has moved</h2>
          <p>
            Create, validate, import, export, fork, and playtest content locally in the full
            Meridian Strike desktop game. Sign in there only when you are ready to submit a scenario
            or campaign for moderation.
          </p>
        </div>
      </div>
      <div className="callout">
        <p>
          Existing catalogue, detail, thumbnail, download, and rating links continue to work without
          signing in. This page no longer sends anonymous uploads.
        </p>
        <p>
          <Link to="/catalogue">Browse scenarios</Link> or{' '}
          <Link to="/campaigns">browse campaigns</Link>.
        </p>
      </div>
    </section>
  );
}
