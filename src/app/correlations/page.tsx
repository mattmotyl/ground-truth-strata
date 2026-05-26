import { FindingUsageWellbeing } from '@/components/charts/finding-usage-wellbeing';

export default function CorrelationsPage() {
  // For v0.1.0 the /correlations route shows Finding 08 — Does using
  // social media more mean feeling worse? — as the default view.
  // Future milestones will add a finding-selector tab bar (mirroring
  // /platforms) when more correlation findings ship.
  return <FindingUsageWellbeing />;
}
