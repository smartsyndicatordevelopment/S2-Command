export default function StatCard({ label, value, sub, accent }) {
  const accentMap = {
    purple: 'text-purple',
    green: 'text-green',
    yellow: 'text-yellow',
    red: 'text-red',
    white: 'text-white',
  };
  const valueColor = accentMap[accent] || 'text-white';

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">{label}</p>
      <p className={`font-mono text-3xl font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-2">{sub}</p>}
    </div>
  );
}
