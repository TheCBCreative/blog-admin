interface Props {
  counts: { draft: number; scheduled: number; published: number; archived: number };
}

const STAT_LABELS: Array<{ key: keyof Props['counts']; label: string }> = [
  { key: 'published', label: 'Live' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'draft', label: 'Drafts' },
  { key: 'archived', label: 'Archived' },
];

export default function DashboardStats({ counts }: Props) {
  return (
    <div className="stat-row">
      {STAT_LABELS.map(({ key, label }) => (
        <div className="stat-item" key={key}>
          <div className="n">{counts[key]}</div>
          <div className="label">{label}</div>
        </div>
      ))}
    </div>
  );
}
