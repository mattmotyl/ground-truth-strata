// T2-5: surfaces a verbatim survey question — or, for derived
// measures, a hand-curated description — above each chart. Resolution
// order:
//   1. strata-composites.COMPOSITE_VARIABLES (derived measures with no
//      single question, e.g., time_per_day_minutes)
//   2. public/data/question-texts.json (generated from
//      docs/data-dictionary.csv)
//   3. meta.json `construct` as a last-resort fallback
// Anything unresolved renders as `[insert actual question text here
// for <var>]` so the gap is visible to reviewers.

import { lookupComposite } from './strata-composites';
import type { MetaJson } from './strata-types';
import type {
  QuestionTextEntry,
  QuestionTextsJson,
} from './strata-data';

export type SurveyKind = 'question' | 'composite' | 'construct' | 'missing';

export interface SurveyQuestionInfo {
  variableName: string;
  cleanVariableName: string | null;
  questionText: string | null;
  construct: string | null;
  isPlatformIndexed: boolean;
  kind: SurveyKind;
}

export function surveyQuestionFor(
  variableName: string,
  questionTexts: QuestionTextsJson | null,
  meta?: MetaJson,
): SurveyQuestionInfo | null {
  // 1. Composite registry — derived variables get a hand-curated
  //    description (no single survey item to cite).
  const composite = lookupComposite(variableName);
  if (composite) {
    return {
      variableName,
      cleanVariableName: composite.cleanVariableName ?? null,
      questionText: composite.description,
      construct: composite.description,
      isPlatformIndexed: composite.isPlatformIndexed,
      kind: 'composite',
    };
  }

  // 2. CSV-extracted verbatim question text.
  const entry: QuestionTextEntry | undefined =
    questionTexts?.variables[variableName];
  // 3. Meta.json fallback (for variables in meta but not the
  //    dictionary CSV, e.g., construct labels only).
  const metaVar = meta?.variables.find(
    (v) => v.variable_name === variableName,
  );
  if (!entry && !metaVar) {
    return {
      variableName,
      cleanVariableName: null,
      questionText: null,
      construct: null,
      isPlatformIndexed: false,
      kind: 'missing',
    };
  }
  const hasQuestion =
    !!entry?.question_text && entry.question_text.trim().length > 0;
  return {
    variableName,
    cleanVariableName:
      entry?.clean_variable_name ?? metaVar?.clean_variable_name ?? null,
    questionText: hasQuestion ? entry!.question_text : null,
    construct: entry?.construct ?? metaVar?.construct ?? null,
    isPlatformIndexed:
      entry?.is_platform_indexed ??
      metaVar?.is_platform_indexed ??
      metaVar?.dict_is_platform_indexed ??
      false,
    kind: hasQuestion ? 'question' : 'construct',
  };
}

// Renders the info as a single header string suitable for the bold
// chart title. Composite descriptions render verbatim. Verbatim
// question text renders verbatim. A construct-only fallback shows
// the construct label but flagged so reviewers see the gap. A
// fully-missing variable shows the `[insert ...]` placeholder.
export function formatSurveyQuestion(
  info: SurveyQuestionInfo | null,
): string {
  if (!info) return '';
  if (info.kind === 'composite' && info.questionText) {
    return info.questionText;
  }
  if (info.kind === 'question' && info.questionText) {
    return info.questionText;
  }
  if (info.kind === 'construct' && info.construct) {
    return `[insert actual question text here for ${info.variableName}${
      info.cleanVariableName ? ` (${info.cleanVariableName})` : ''
    } — construct: ${info.construct}]`;
  }
  return `[insert actual question text here for ${info.variableName}${
    info.cleanVariableName ? ` (${info.cleanVariableName})` : ''
  }]`;
}
