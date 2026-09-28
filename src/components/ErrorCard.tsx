import './ErrorCard.css';

export interface ErrorCardProps {
  pieceId: string;
  /** Full loader/validation message; for validation errors it names the section and part. */
  message: string;
  /** JSON path of the offending value, when the loader knows it. */
  path?: string | null;
}

/** Library card shown in place of a piece that failed to load or validate. */
export default function ErrorCard({ pieceId, message, path = null }: ErrorCardProps) {
  return (
    <article className="error-card">
      <h2 className="error-card-title">Could not load “{pieceId}”</h2>
      <pre className="error-card-message">{message}</pre>
      {path !== null ? (
        <p className="error-card-path">
          at <code>{path}</code>
        </p>
      ) : null}
    </article>
  );
}
