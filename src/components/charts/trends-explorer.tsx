'use client';

import { useEffect, useState } from 'react';
import {
  loadContextualEvents,
  loadMeta,
  loadQuestionTexts,
  loadTrends,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type {
  ContextualEventsJson,
  MetaJson,
  TrendRow,
} from '@/lib/strata-types';
import {
  TRENDS_CATEGORIES,
  getTrendsCategory,
} from '@/lib/trends-categories';
import { stripConstructPrefix } from '@/lib/trends-adapters';
import { FindingPlatformUsage } from './finding-platform-usage';
import {
  PairedAttitudeTrend,
  PlatformMetricTrend,
  RespondentTrend,
} from './trends-variable-trend';
import { WellbeingPlatformTrend } from './trends-wellbeing-trend';
import { TrendsCategoryPicker } from './trends-category-picker';

// /trends orchestrator (T3-B7 redesign). Two-step category → question
// picker; F01 platform-usage is the default landing view. Each renderer
// owns its own platform/wave/zoom state (see ROADMAP for the
// cross-category persistence follow-up).
export function TrendsExplorer() {
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [trends, setTrends] = useState<TrendRow[] | null>(null);
  const [questionTexts, setQuestionTexts] =
    useState<QuestionTextsJson | null>(null);
  const [events, setEvents] = useState<ContextualEventsJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [categoryId, setCategoryId] = useState<string>('platform');
  const [questionKey, setQuestionKey] = useState<string>('usage');

  useEffect(() => {
    Promise.all([
      loadMeta(),
      loadTrends(),
      loadQuestionTexts(),
      loadContextualEvents(),
    ])
      .then(([m, t, qt, ev]) => {
        setMeta(m);
        setTrends(t);
        setQuestionTexts(qt);
        setEvents(ev);
      })
      .catch(setError);
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load trends data: {error.message}</p>
      </div>
    );
  }
  if (!meta || !trends) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading trends data…
      </div>
    );
  }

  // Resolve picker labels: explicit config label, else strip the domain
  // prefix from the variable's meta construct (the category header
  // supplies the domain context, so it isn't repeated per radio).
  const constructBy = new Map(
    meta.variables.map((v) => [v.variable_name, v.construct]),
  );
  const questionLabels: Record<string, string> = {};
  for (const cat of TRENDS_CATEGORIES) {
    for (const q of cat.questions) {
      questionLabels[q.key] =
        q.label ??
        (q.variable
          ? stripConstructPrefix(constructBy.get(q.variable))
          : (q.title ?? q.key));
    }
  }

  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    const first = getTrendsCategory(id).questions[0];
    if (first) setQuestionKey(first.key);
  };

  const category = getTrendsCategory(categoryId);
  const question =
    category.questions.find((q) => q.key === questionKey) ??
    category.questions[0];

  let body: React.ReactNode = null;
  switch (question.kind) {
    case 'f01':
      body = <FindingPlatformUsage />;
      break;
    case 'platformMetric':
      body = (
        <PlatformMetricTrend
          key={question.key}
          meta={meta}
          questionTexts={questionTexts}
          events={events}
          metric={question.metric!}
          surveyVar={question.surveyVar!}
          title={question.title!}
          filenameBase={question.filenameBase}
        />
      );
      break;
    case 'wellbeing':
      body = (
        <WellbeingPlatformTrend
          key={question.key}
          meta={meta}
          questionTexts={questionTexts}
          events={events}
          outcome={question.outcome!}
          bucket={question.bucket ?? null}
          title={question.title!}
          subtitle={question.subtitle}
          filenameBase={question.filenameBase}
        />
      );
      break;
    case 'attitudeSingle':
      body = (
        <RespondentTrend
          key={question.key}
          meta={meta}
          trends={trends}
          questionTexts={questionTexts}
          events={events}
          variableName={question.variable!}
          filenameBase={question.filenameBase}
          axisAnchors={question.axisAnchors}
        />
      );
      break;
    case 'attitudePaired':
      body = (
        <PairedAttitudeTrend
          key={question.key}
          meta={meta}
          trends={trends}
          questionTexts={questionTexts}
          events={events}
          pair={question.pair!}
          pairLabels={question.pairLabels!}
          title={question.title!}
          subtitle={question.pairSubtitle}
          filenameBase={question.filenameBase}
          axisAnchors={question.axisAnchors}
        />
      );
      break;
  }

  return (
    <div>
      <TrendsCategoryPicker
        categories={TRENDS_CATEGORIES}
        activeCategory={categoryId}
        activeQuestion={questionKey}
        questionLabels={questionLabels}
        onCategoryChange={handleCategoryChange}
        onQuestionChange={setQuestionKey}
      />
      {body}
    </div>
  );
}
