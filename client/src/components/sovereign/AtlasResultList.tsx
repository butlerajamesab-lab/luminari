type AtlasResultListProps = {
  title: string;
  values?: string[];
};

export default function AtlasResultList({ title, values }: AtlasResultListProps) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      {values && values.length > 0 ? (
        <div className="space-y-1">
          {values.map((value) => (
            <div key={value} className="break-all font-mono text-xs text-foreground">{value}</div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">—</div>
      )}
    </div>
  );
}
