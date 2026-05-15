export default function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <p className="text-red text-sm">{message || 'Failed to load data'}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-muted hover:text-white border border-border rounded px-3 py-1.5 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
