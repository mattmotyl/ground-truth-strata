import { TrendsExplorer } from '@/components/charts/trends-explorer';

export default function TrendsPage() {
  // T3-B7: /trends now opens on Finding 1 ("Who uses what?") and offers a
  // variable picker that swaps in any analyzable variable over time —
  // platform-experience fan-outs (platform_rates.json) or respondent-
  // level series (trends.json). The orchestrator owns the selection.
  return <TrendsExplorer />;
}
