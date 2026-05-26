import { RouteStub } from '@/components/route-stub';

export default function GroupsPage() {
  return (
    <RouteStub
      eyebrow="Demographic group differences"
      title="Who experiences what, differently?"
      description="Grouped-bar comparisons by gender, age, education, race, political ideology tertile, and platform-user status. Browse outcomes by group across waves with 95% confidence intervals."
      comingNext={[
        'Grouped bar chart with error bars per group × wave',
        'Group-by selector across 29 grouping variables',
        'Lazy-load gating on group_comparisons.json (6.7 MB)',
        'Suppression handling for low-n cells',
      ]}
    />
  );
}
