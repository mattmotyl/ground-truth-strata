import { RouteStub } from '@/components/route-stub';

export default function CorrelationsPage() {
  return (
    <RouteStub
      eyebrow="Correlations"
      title="What goes with what?"
      description="Pairwise Spearman correlations across the variable battery, computed per wave. Pick two variables, see ρ with confidence interval, n, and an epistemic caveat for small samples or small effect sizes."
      comingNext={[
        'Variable-pair picker over the full battery (~300 inputs)',
        'Per-wave scatter with regression line and confidence band',
        'Weighted/unweighted toggle for ρ',
        'Lazy-load gating on correlations.json (8.3 MB)',
      ]}
    />
  );
}
