import { useEffect, useState } from 'react';
import { uploadScenario } from '../api/client.ts';
import {
  previewScenarioPackage,
  revokePreviewUrl,
  type PackagePreview,
} from '../lib/package-preview.ts';

export function UploadPage() {
  const [preview, setPreview] = useState<PackagePreview | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview?.thumbnailUrl) {
        revokePreviewUrl(preview.thumbnailUrl);
      }
    };
  }, [preview]);

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Upload scenario package</h2>
          <p>
            Submit a ZIP-compatible package containing manifest.json, scenario.json, map.json, and
            thumbnail.webp. Uploads are reviewed before they appear in the public catalogue.
          </p>
        </div>
      </div>

      <label className="upload-drop">
        <span>Select scenario package (.zip)</span>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }

            if (preview?.thumbnailUrl) {
              revokePreviewUrl(preview.thumbnailUrl);
            }

            const result = await previewScenarioPackage(file);
            if (!result.ok) {
              setPreview(null);
              setErrors(result.errors);
              setMessage(null);
              return;
            }

            setPreview(result);
            setErrors([]);
            setMessage(null);
          }}
        />
      </label>

      {errors.length > 0 && (
        <div className="callout error">
          <h3>Validation failed</h3>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <div className="upload-preview">
          <img src={preview.thumbnailUrl} alt="Scenario thumbnail preview" />
          <div>
            <h3>{preview.contents.manifest.title}</h3>
            <p>{preview.contents.manifest.description}</p>
            <dl className="detail-grid compact">
              <div>
                <dt>Author</dt>
                <dd>{preview.contents.manifest.author}</dd>
              </div>
              <div>
                <dt>Difficulty</dt>
                <dd>{preview.contents.manifest.difficulty}</dd>
              </div>
              <div>
                <dt>Max tonnage</dt>
                <dd>{preview.contents.manifest.maximumTonnage}</dd>
              </div>
              <div>
                <dt>Map</dt>
                <dd>
                  {preview.contents.map.width} × {preview.contents.map.height}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              disabled={uploading}
              onClick={async () => {
                setUploading(true);
                setMessage(null);
                try {
                  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
                  const file = input?.files?.[0];
                  if (!file) {
                    throw new Error('Package file missing.');
                  }
                  const response = await uploadScenario(file);
                  setMessage(
                    `Upload received (ID ${response.id}). Your scenario is pending review and will appear in the catalogue once approved.`,
                  );
                  setPreview(null);
                  if (input) {
                    input.value = '';
                  }
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : 'Upload failed.');
                } finally {
                  setUploading(false);
                }
              }}
            >
              {uploading ? 'Uploading…' : 'Upload validated package'}
            </button>
          </div>
        </div>
      )}

      {message && <p className="status">{message}</p>}
    </section>
  );
}
