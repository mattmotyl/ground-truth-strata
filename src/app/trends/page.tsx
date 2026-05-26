import { FindingPlatformUsage } from '@/components/charts/finding-platform-usage';

export default function TrendsPage() {
  // For v0.1.0 the /trends route defaults to Finding 1 — "Who uses what?".
  // The full variable picker that lets the user chart any analyzable
  // variable across waves is part of a later milestone; until then this
  // route returns the first starter finding.
  return <FindingPlatformUsage />;
}
