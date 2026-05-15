export default function Spinner({ label = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-6 h-6 rounded-full border-2 border-purple border-t-transparent animate-spin" />
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
