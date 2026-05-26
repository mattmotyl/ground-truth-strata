import { FindingGenderNegativeExperience } from '@/components/charts/finding-gender-negative';

export default function GroupsPage() {
  // For v0.1.0 the /groups route shows Finding 06 — Do men and women
  // experience platforms differently? — as the default view. Future
  // milestones will add a finding-selector tab bar (mirroring
  // /platforms) when more group-comparison findings ship.
  return <FindingGenderNegativeExperience />;
}
