import { FindingGenderNegativeExperience } from '@/components/charts/finding-gender-negative';

// T2-4 (revised handoff): /groups uses us024 (in-person negative
// experience) as a proxy for the intended gender × platform experience
// analysis. The correct breakdown requires Phase 3 patch P3-B (per-
// platform experience rates by demographic group) — Matt's R work.
// Display a prominent banner so visitors understand the displayed
// data is a placeholder, not the final analysis.
export default function GroupsPage() {
  return (
    <>
      <section
        role="status"
        aria-live="polite"
        className="border-y border-mulberry/40 bg-mulberry/10"
      >
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full bg-mulberry shrink-0"
          />
          <p
            className="text-sm text-ink"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <span className="font-semibold text-plum">
              This analysis uses a proxy variable and is being updated.
            </span>{' '}
            The chart below summarises us024 (in-person negative
            experience by gender), which is the closest variable in the
            current precomputed JSON. The intended gender × platform
            experience cross is on the roadmap and will appear here
            once the underlying Phase 3 data patch lands. Check back
            soon.
          </p>
        </div>
      </section>
      <FindingGenderNegativeExperience />
    </>
  );
}
