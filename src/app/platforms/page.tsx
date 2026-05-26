import { RouteStub } from '@/components/route-stub';

export default function PlatformsPage() {
  return (
    <RouteStub
      eyebrow="Platform comparison"
      title="Which platforms differ — and how?"
      description="Ranked horizontal-bar comparisons across the 23 platforms in the panel. Compare usage rates, negative-experience rates, useful-content rates, time-per-day, and conditional impact/topic breakdowns."
      comingNext={[
        'Ranked bar charts for all 7 platform-level metrics',
        'Stacked political-composition bar (liberal / moderate / conservative)',
        'Conditional heatmaps from conditional_breakdowns.json',
        'Per-wave selection and platform filter (default n ≥ 200)',
      ]}
    />
  );
}
