import { Link } from 'react-router-dom';
import { scenarioThumbnailUrl } from '../api/client.ts';
import type { ScenarioMetadata } from '../../shared/schemas/metadata.ts';

interface ScenarioCardProps {
  scenario: ScenarioMetadata;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function ScenarioCard({ scenario }: ScenarioCardProps) {
  const compatible =
    scenario.compatibility.gameVersionSupported && scenario.compatibility.scenarioFormatSupported;

  return (
    <article className="scenario-card">
      <div className="scenario-card__thumb">
        <img src={scenarioThumbnailUrl(scenario.id)} alt="" loading="lazy" />
      </div>
      <div className="scenario-card__body">
        <h2>
          <Link to={`/scenarios/${scenario.id}`}>{scenario.title}</Link>
        </h2>
        <p className="scenario-card__meta">
          <span>{scenario.authorDisplayName}</span>
          <span>
            ★ {scenario.averageRating.toFixed(1)} ({scenario.ratingCount})
          </span>
        </p>
        <ul className="scenario-card__stats">
          <li>
            <span className="label">Difficulty</span>
            <span>{scenario.difficulty}</span>
          </li>
          <li>
            <span className="label">Max tonnage</span>
            <span>{scenario.maximumTonnage.toLocaleString()}</span>
          </li>
          <li>
            <span className="label">Duration</span>
            <span>{formatDuration(scenario.estimatedPlayTimeMinutes)}</span>
          </li>
          <li>
            <span className="label">Game</span>
            <span className={compatible ? 'ok' : 'warn'}>{scenario.gameVersion}</span>
          </li>
          <li>
            <span className="label">Downloads</span>
            <span>{scenario.downloadCount.toLocaleString()}</span>
          </li>
        </ul>
        {scenario.tags.length > 0 && (
          <ul className="tag-list">
            {scenario.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
