import { RouteStub } from '@/components/route-stub';

export default function PlatformsPage() {
  return (
    <RouteStub
      eyebrow="Platforms · Per-platform report card"
      title="Platform deep dives are coming soon"
      description="This page will become a per-platform report card — usage over time, who uses each platform, experiences, wellbeing, and habit measures, all in one place. Cross-platform comparison charts have moved to the Compare page."
      comingNext={[
        'Usage over time for a single platform',
        'Demographic breakdown of each platform’s users',
        'Experience rates (negative, bad-for-world, connection, useful)',
        'Wellbeing of each platform’s users',
        'Platform habit and attitude measures (Waves 4–6)',
      ]}
      ctaHref="/compare"
      ctaLabel="Go to Compare →"
    />
  );
}
