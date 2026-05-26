import { RouteStub } from '@/components/route-stub';

export default function TrendsPage() {
  return (
    <RouteStub
      eyebrow="Trends over time"
      title="How is the social-media landscape changing?"
      description="A line-chart explorer over the six survey waves. Pick any analyzable variable from the data dictionary; chart it across waves with 95% confidence intervals, contextual event annotations, and a weighted/unweighted toggle."
      comingNext={[
        'Variable picker with domain filter + keyword search',
        'Multi-platform line chart for platform-indexed variables',
        'Vertical reference lines from contextual-events.json',
        'PNG/CSV download and per-chart citation',
      ]}
    />
  );
}
