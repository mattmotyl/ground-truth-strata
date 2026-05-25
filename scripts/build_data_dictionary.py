"""Build docs/data-dictionary.json and docs/data-dictionary.csv from a single
source of truth, so they cannot drift.

Run with:  python scripts/build_data_dictionary.py
Outputs:   docs/data-dictionary.json  (canonical)
           docs/data-dictionary.csv   (Excel-friendly mirror)

Inputs are hand-curated from the 6 PDF survey flows (UAS514–UAS519). The
PDFs are the authoritative source — see the Phase 0 handoff for context.
This script is reproducible: running it twice produces identical files.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Reusable response-option scales
# ---------------------------------------------------------------------------

# Standard 7-point Likert (Strongly disagree … Strongly agree)
LIKERT_7_STANDARD = {
    "1": "Strongly disagree",
    "2": "Disagree",
    "3": "Somewhat disagree",
    "4": "Neither agree nor disagree",
    "5": "Somewhat agree",
    "6": "Agree",
    "7": "Strongly agree",
}

# Standard 5-point Likert (Strongly disagree … Strongly agree) used by sc001, ex002, ex006
LIKERT_5_STANDARD = {
    "1": "Strongly disagree",
    "2": "Disagree",
    "3": "Neither agree nor disagree",
    "4": "Agree",
    "5": "Strongly agree",
}

# 5-point support/oppose (ex005)
LIKERT_5_SUPPORT_OPPOSE = {
    "1": "Strongly oppose",
    "2": "Somewhat oppose",
    "3": "Neither support nor oppose",
    "4": "Somewhat support",
    "5": "Strongly support",
}

# 5-point oppose/support variant used in ex006 in W6 (Strongly disagree / Somewhat disagree / Neither / Somewhat agree / Strongly agree)
LIKERT_5_AGREE_5LEVEL = {
    "1": "Strongly disagree",
    "2": "Somewhat disagree",
    "3": "Neither agree nor disagree",
    "4": "Somewhat agree",
    "5": "Strongly agree",
}

# 6-point Likert with NO neutral midpoint (te001)
LIKERT_6_NOMID = {
    "1": "Strongly disagree",
    "2": "Disagree",
    "3": "Somewhat disagree",
    "4": "Somewhat agree",
    "5": "Agree",
    "6": "Strongly agree",
}

# 6-point usage-frequency scale (us002, us020)
USE_FREQUENCY_6 = {
    "1": "Multiple times per day",
    "2": "About once a day",
    "3": "A few times per week",
    "4": "About once a week",
    "5": "Less than once a week",
    "6": "Did not use",
}

# Trust 5-point (ins001)
TRUST_5 = {
    "1": "None",
    "2": "Very little",
    "3": "Some",
    "4": "Quite a lot",
    "5": "A great deal",
}

# DASS 4-point (ds001)
DASS_4 = {
    "1": "Never",
    "2": "Sometimes",
    "3": "Often",
    "4": "Almost always",
}

# UCLA loneliness 3-point (ex003)
LONELINESS_3 = {
    "1": "Hardly ever",
    "2": "Some of the time",
    "3": "Often",
}

# Concerned/Excited bipolar 5-point with no-opinion code (AI_concerned, AI_excited)
CONCERNED_5_NOOP = {
    "1": "Very concerned",
    "2": "Somewhat concerned",
    "3": "Not very concerned",
    "4": "Not at all concerned",
    "5": "No opinion",
}
EXCITED_5_NOOP = {
    "1": "Very excited",
    "2": "Somewhat excited",
    "3": "Not very excited",
    "4": "Not at all excited",
    "5": "No opinion",
}

# AI effect bipolar 5-point with no-opinion (ai_effect_a-g)
AI_EFFECT_5_NOOP = {
    "1": "Very concerned",
    "2": "Somewhat concerned",
    "3": "Equally concerned and excited",
    "4": "Somewhat excited",
    "5": "Very excited",
    "6": "No opinion",
}

# Mixed reality global excitement/concern 5-point (q_ai13, q_ai14) — note: no no-opinion
XR_EXCITEMENT_5 = {
    "1": "Not at all excited",
    "2": "Not very excited",
    "3": "Somewhat excited",
    "4": "Very excited",
    "5": "Extremely excited",
}
XR_CONCERN_5 = {
    "1": "Not at all concerned",
    "2": "Not very concerned",
    "3": "Somewhat concerned",
    "4": "Very concerned",
    "5": "Extremely concerned",
}

# Per-use-case usefulness/harmfulness 5-point (q_ai11_*, q_ai13_*)
USEFUL_5 = {
    "1": "Not at all useful",
    "2": "Not very useful",
    "3": "Somewhat useful",
    "4": "Very useful",
    "5": "Extremely useful",
}
HARMFUL_5 = {
    "1": "Not at all harmful",
    "2": "Not very harmful",
    "3": "Somewhat harmful",
    "4": "Very harmful",
    "5": "Extremely harmful",
}

# Yes/No
YN = {"1": "Yes", "2": "No"}

# Frequency 4-point (ex001)
FREQ_4_ALWAYS = {
    "1": "Always or almost always",
    "2": "Frequently",
    "3": "Some of the time",
    "4": "Rarely or never",
}

# Survey interest 5-point
SURVEY_INTEREST_5 = {
    "1": "Very interesting",
    "2": "Interesting",
    "3": "Neither interesting nor uninteresting",
    "4": "Uninteresting",
    "5": "Very uninteresting",
}

# Tech regulation 5-point (ex004a)
REG_5 = {
    "1": "Much less than they are now",
    "2": "A little less than they are now",
    "3": "The same as they are now",
    "4": "A little more than they are now",
    "5": "Much more than they are now",
}

# Tech regulation 3-point (ex004b, ex004c)
REG_3 = {
    "1": "More",
    "2": "Less",
    "3": "Keep doing what they are now",
}

# ---------------------------------------------------------------------------
# Platform-list constants
# ---------------------------------------------------------------------------

PLATFORMS_W6 = {
    "1": "Facebook", "2": "Twitter/X", "3": "Instagram", "4": "TikTok",
    "5": "Snapchat", "6": "YouTube", "7": "Reddit", "8": "WhatsApp",
    "9": "Email", "10": "Mastodon", "11": "LinkedIn", "12": "Pinterest",
    "13": "Dating Apps", "14": "FaceTime", "15": "Text Messaging",
    "16": "Online Gaming", "17": "Twitch", "18": "Nextdoor", "19": "Discord",
    "22": "Threads", "23": "Bluesky",
}

# us001 response options — full set across waves (includes service "other" and "none")
US001_OPTIONS = {
    "1": "Facebook", "2": "Twitter/X (Twitter in W1)", "3": "Instagram",
    "4": "TikTok", "5": "Snapchat", "6": "YouTube", "7": "Reddit",
    "8": "WhatsApp", "9": "Email", "10": "Mastodon", "11": "LinkedIn",
    "12": "Pinterest", "13": "Dating Apps", "14": "FaceTime",
    "15": "Text Messaging", "16": "Online Gaming", "17": "Twitch",
    "18": "Nextdoor", "19": "Discord",
    "20": "Some other communications service",
    "21": "None of these services",
    "22": "Threads (added W2)",
    "23": "Bluesky (added W6)",
}

PLATFORM_CODES_W1   = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]
PLATFORM_CODES_W25  = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,22]
PLATFORM_CODES_W6   = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,22,23]

SOCIAL_GATE_W1 = [1,2,3,4,5,11,12,18]
SOCIAL_GATE_W2PLUS = [1,2,3,4,5,11,12,18,22]
SOCIAL_GATE_W6 = [1,2,3,4,5,11,12,18,22,23]

# Reference period wording in question text
REF_PERIOD_NOTE = "Reference period is 'past 28 days' in W1; reworded to 'past 4 weeks' in W2-W6."

# us001 change note
US001_CHANGE_NOTE = (
    "W1: 'past 28 days', code 2 labeled 'Twitter', platforms 1-19 + 20/21. "
    "W2-W5: 'past 4 weeks', code 2 relabeled 'Twitter / X', Threads added at code 22 (kept 20/21 for other/none). "
    "W6: Bluesky added at code 23."
)

# us001 wording variants per wave (for documenting which question text was actually asked)
US001_WORDING_BY_WAVE = {
    "1": "In the past 28 days, which of the following online services have you used? Check the box next to all that apply.",
    "2-6": "In the past 4 weeks, which of the following online services have you used? Check the box next to all that apply.",
}

# 50-state + DC + Puerto Rico
STATERESIDE_OPTIONS = {
    "1": "Alaska", "2": "Alabama", "3": "Arizona", "4": "Arkansas",
    "5": "California", "6": "Colorado", "7": "Connecticut", "8": "Delaware",
    "9": "Florida", "10": "Georgia", "11": "Hawaii", "12": "Idaho",
    "13": "Illinois", "14": "Indiana", "15": "Iowa", "16": "Kansas",
    "17": "Kentucky", "18": "Louisiana", "19": "Maine", "20": "Maryland",
    "21": "Massachusetts", "22": "Michigan", "23": "Minnesota",
    "24": "Mississippi", "25": "Missouri", "26": "Montana", "27": "Nebraska",
    "28": "Nevada", "29": "New Hampshire", "30": "New Jersey",
    "31": "New Mexico", "32": "New York", "33": "North Carolina",
    "34": "North Dakota", "35": "Ohio", "36": "Oklahoma", "37": "Oregon",
    "38": "Pennsylvania", "39": "Rhode Island", "40": "South Carolina",
    "41": "South Dakota", "42": "Tennessee", "43": "Texas", "44": "Utah",
    "45": "Vermont", "46": "Virginia", "47": "Washington",
    "48": "West Virginia", "49": "Wisconsin", "50": "Wyoming",
    "51": "Washington DC", "52": "Puerto Rico",
}

# ---------------------------------------------------------------------------
# Helper to construct one variable record with sane defaults
# ---------------------------------------------------------------------------

ALL_WAVES = [1, 2, 3, 4, 5, 6]

def var(
    variable_name: str,
    construct: str,
    domain: str,
    question_text: str,
    response_type: str,
    *,
    response_options: dict | None = None,
    out_of_range_codes: list | None = None,
    is_reverse_coded: bool = False,
    waves_present: list = ALL_WAVES,
    is_platform_indexed: bool = False,
    platform_codes_applicable: Any = None,
    wording_changed_across_waves: Any = False,
    coding_changed_across_waves: Any = False,
    change_notes: str | None = None,
    clean_variable_name: str = "",
    notes: str | None = None,
) -> dict:
    return {
        "variable_name": variable_name,
        "construct": construct,
        "domain": domain,
        "question_text": question_text,
        "response_type": response_type,
        "response_options": response_options,
        "out_of_range_codes": out_of_range_codes,
        "is_reverse_coded": is_reverse_coded,
        "waves_present": list(waves_present),
        "is_platform_indexed": is_platform_indexed,
        "platform_codes_applicable": platform_codes_applicable,
        "wording_changed_across_waves": wording_changed_across_waves,
        "coding_changed_across_waves": coding_changed_across_waves,
        "change_notes": change_notes,
        "clean_variable_name": clean_variable_name,
        "notes": notes,
    }


# ---------------------------------------------------------------------------
# Variable definitions — grouped by domain
# ---------------------------------------------------------------------------

variables: list[dict] = []

# === PLATFORM_USE — us001 family (per-platform indexed loop variables) =====

variables.append(var(
    "us001", "Platforms Used (multiselect)",
    "PLATFORM_USE",
    "[In the past 28 days/4 weeks], which of the following online services have you used? Check the box next to all that apply.",
    "MULTISELECT",
    response_options=US001_OPTIONS,
    wording_changed_across_waves=True,
    coding_changed_across_waves=True,
    change_notes=US001_CHANGE_NOTE,
    clean_variable_name="platforms_used",
    notes=(
        "Codes 20/21 are 'other' and 'none of these services' (not platforms). "
        "Loop-indexed sub-variables (us002, us003, us004, us005, us006, us007, us008, us009, "
        "us010, us011, us012, us013, us016, us017, us018a-g, us019_hours, us019_minutes, us025, "
        "us026) are asked only for codes selected in us001 (excluding 20 and 21). Free-text "
        "follow-up `us001_other` captured when code 20 is selected. asksocial gate set TRUE if "
        "any 'social' platform is reported (W1: codes 1,2,3,4,5,11,12,18; W2-W5: + 22; W6: + 22,23)."
    ),
))

variables.append(var(
    "us001_other", "Platforms Used — Other (free text)",
    "PLATFORM_USE",
    "Which online communications services that were not listed have you used [in the past 28 days/4 weeks]?",
    "STRING_OPEN",
    wording_changed_across_waves=True,
    change_notes=REF_PERIOD_NOTE,
    clean_variable_name="platforms_used_other",
    notes="Conditional on code 20 selected in us001. Open text; PII-redaction instruction in question.",
))

variables.append(var(
    "us002", "Platform Use Frequency",
    "PLATFORM_USE",
    "Please indicate how often you have used [platform] [in the past 28 days/4 weeks].",
    "LIKERT_6",
    response_options=USE_FREQUENCY_6,
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    wording_changed_across_waves=True,
    change_notes=REF_PERIOD_NOTE,
    clean_variable_name="platform_use_frequency",
    notes=(
        "Indexed by platform code. Asked once per platform reported in us001. "
        "Code 6 ('Did not use [platform]') is functionally a non-use sentinel; consider treating "
        "as NA when computing frequency means. Daily users (codes 1 or 2) trigger us019_hours/_minutes "
        "in W4-W6."
    ),
))

variables.append(var(
    "us003", "Negative Personal Experience on Platform",
    "PLATFORM_USE",
    "[In the past 28 days/4 weeks/Since the last time you answered on], have you personally witnessed or experienced something that affected you negatively on [platform]?",
    "BINARY_YESNO",
    response_options=YN,
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    wording_changed_across_waves=True,
    change_notes=REF_PERIOD_NOTE + " From W2 onward, includes 'Since the last time you answered on' carryover wording.",
    clean_variable_name="neg_exp_personal",
    notes="Gates us004/us005/us006 follow-ups. Capped at first 8 platforms via exp_cnt.",
))

variables.append(var(
    "us004", "Impact of Negative Personal Experience (multiselect)",
    "PLATFORM_USE",
    "What was the impact of your negative experience(s) with [platform]? Check the box next to all that apply.",
    "MULTISELECT",
    response_options={
        "1": "Made me less likely to express myself online",
        "2": "Negatively impacted my psychological well-being",
        "3": "Reduced my trust in other people",
        "4": "Reduced my trust in societal institutions",
        "5": "Made me angry",
        "6": "Worried me",
        "7": "Felt unsafe",
        "8": "Felt attacked",
        "9": "Did not affect me a great deal",
        "10": "Annoyed me",
        "11": "Other, please specify",
    },
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="neg_exp_personal_impact",
    notes=(
        "Only asked when us003=Yes. Capped at first 8 platforms (exp_cnt). Free-text follow-up "
        "`us004_other` when code 11 selected."
    ),
))

variables.append(var(
    "us004_other", "Impact of Negative Personal Experience — Other (free text)",
    "PLATFORM_USE",
    "Free-text follow-up to us004 when 'Other' is selected.",
    "STRING_OPEN",
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="neg_exp_personal_impact_other",
))

variables.append(var(
    "us005", "Negative Personal Experience Topics (multiselect)",
    "PLATFORM_USE",
    "Did your experience(s) on [platform] relate to any of these topics? Check the box next to all that apply.",
    "MULTISELECT",
    response_options={
        "1": "Medical/health information", "2": "Politics", "3": "Crime",
        "4": "Local news", "5": "Personal finance", "6": "None of the above",
    },
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="neg_exp_personal_topics",
    notes="Only asked when us003=Yes. Capped at first 8 platforms (exp_cnt).",
))

variables.append(var(
    "us006", "Description of Negative Personal Experience",
    "PLATFORM_USE",
    "In a sentence or two, please describe one experience on [platform] that personally affected you negatively.",
    "STRING_OPEN",
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="neg_exp_personal_desc",
    notes="Only asked when us003=Yes. Capped at first 8 platforms (exp_cnt). PII-redaction instruction in question. Marked 'Optional:' from W3 onward.",
))

variables.append(var(
    "us007", "Bad-for-the-World Content Witnessed",
    "PLATFORM_USE",
    "[In the past 28 days/4 weeks/Since the last time you answered on], have you witnessed or experienced content that you would consider bad for the world on [platform] (examples could include content that is misleading, hateful, or unnecessarily divisive)?",
    "BINARY_YESNO",
    response_options=YN,
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    wording_changed_across_waves=True,
    change_notes=REF_PERIOD_NOTE,
    clean_variable_name="bad_world_witnessed",
    notes="Gates us008/us016/us009/us017. Capped at first 8 platforms (exp_cnt).",
))

variables.append(var(
    "us008", "Bad-for-the-World Impact (multiselect)",
    "PLATFORM_USE",
    "What negative impact do you feel your experience(s) with [platform] could have on the world? Check the box next to all that apply.",
    "MULTISELECT",
    response_options={
        "1": "Could increase political polarization",
        "2": "Could increase hate, fear, and/or anger between groups of people",
        "3": "Could increase the risk of violence",
        "4": "Could misinform or mislead people",
        "5": "Likely would not have much of an effect",
        "6": "Other, please specify",
    },
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="bad_world_impact",
    notes="Only asked when us007=Yes. Capped at first 8 platforms (exp_cnt). Code 2 triggers us009 follow-up. Free-text us008_other on code 6.",
))

variables.append(var(
    "us008_other", "Bad-for-the-World Impact — Other (free text)",
    "PLATFORM_USE",
    "Free-text follow-up to us008 when 'Other' is selected.",
    "STRING_OPEN",
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="bad_world_impact_other",
))

variables.append(var(
    "us009", "Bad-for-the-World Target Groups (free text)",
    "PLATFORM_USE",
    "In a few words, please describe which group(s) would be the likely target of this increase in fear, anger, divisiveness, or hate on [platform]?",
    "STRING_OPEN",
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="bad_world_targets_desc",
    notes="Only asked when us007=Yes AND us008 includes code 2. PII-redaction instruction.",
))

variables.append(var(
    "us016", "Bad-for-the-World Topics (multiselect)",
    "PLATFORM_USE",
    "Did your experience(s) on [platform] relate to any of these topics? Check the box next to all that apply.",
    "MULTISELECT",
    response_options={
        "1": "Medical/health information", "2": "Politics", "3": "Crime",
        "4": "Local news", "5": "Personal finance", "6": "None of the above",
    },
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="bad_world_topics",
    notes="Only asked when us007=Yes. Capped at first 8 platforms (exp_cnt).",
))

variables.append(var(
    "us017", "Description of Bad-for-the-World Experience (free text)",
    "PLATFORM_USE",
    "In a sentence or two, please describe one experience on [platform] with content that you would consider bad for the world.",
    "STRING_OPEN",
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="bad_world_desc",
    notes="Only asked when us007=Yes. Capped at first 8 platforms (exp_cnt). PII-redaction instruction. 'Optional:' from W3 onward.",
))

variables.append(var(
    "us010", "Meaningful Connection on Platform",
    "PLATFORM_USE",
    "[In the past 28 days/4 weeks/Since the last time you answered on], have you experienced a meaningful connection with others on [platform] (examples could include exchanging emotional support or bonding over shared experiences)?",
    "BINARY_YESNO",
    response_options=YN,
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    wording_changed_across_waves=True,
    change_notes=REF_PERIOD_NOTE,
    clean_variable_name="meaningful_connection",
    notes="Gates us011 (and us025 in W6).",
))

variables.append(var(
    "us011", "Description of Meaningful Connection (free text)",
    "PLATFORM_USE",
    "In a sentence or two, please describe one experience on [platform] where you meaningfully connected with others. Please include who you connected with.",
    "STRING_OPEN",
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="meaningful_connection_desc",
    notes="Only asked when us010=Yes. Capped at first 8 platforms (exp_cnt). PII-redaction instruction. 'Optional:' from W3 onward.",
))

variables.append(var(
    "us012", "Learned Something Useful on Platform",
    "PLATFORM_USE",
    "[In the past 28 days/4 weeks/Since the last time you answered on], have you learned something that was useful or that helped you understand something important on [platform]?",
    "BINARY_YESNO",
    response_options=YN,
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    wording_changed_across_waves=True,
    change_notes=REF_PERIOD_NOTE,
    clean_variable_name="learned_useful",
    notes="Gates us013 (and us026 in W6).",
))

variables.append(var(
    "us013", "Description of Useful Learning (free text)",
    "PLATFORM_USE",
    "In a sentence or two, please describe one experience on [platform] where you learned something useful or which helped you understand something important. Please include what you learned.",
    "STRING_OPEN",
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="learned_useful_desc",
    notes="Only asked when us012=Yes. Capped at first 8 platforms (exp_cnt). PII-redaction instruction. 'Optional:' from W3 onward.",
))

variables.append(var(
    "us014", "Refrained From Posting",
    "PLATFORM_USE",
    "[In the past 28 days], have you wanted to post something or make a comment on any online service and then refrained?",
    "BINARY_YESNO",
    response_options=YN,
    waves_present=[1],
    clean_variable_name="refrained_from_posting",
    notes="Wave 1 only — not asked in W2-W6.",
))

variables.append(var(
    "us015", "Reason for Refraining (free text)",
    "PLATFORM_USE",
    "In a sentence or two, please state why you refrained.",
    "STRING_OPEN",
    waves_present=[1],
    clean_variable_name="refrained_from_posting_reason",
    notes="Wave 1 only. Conditional on us014=Yes. PII-redaction instruction.",
))

# us018a-g — habit/attitude per-platform 7-point (W4-W6)
US018_ITEMS = [
    ("us018a", "that I do automatically",                              "habit_automatic"),
    ("us018b", "that I do without thinking",                           "habit_without_thinking"),
    ("us018c", "that has a positive effect on me",                     "habit_positive_effect"),
    ("us018d", "that has a negative effect on me",                     "habit_negative_effect"),
    ("us018e", "that I spend too much time using",                     "habit_too_much_time"),
    ("us018f", "that facilitates my learning and growth",              "habit_learning_growth"),
    ("us018g", "that strengthens and supports my relationships",       "habit_relationships"),
]
for vn, stem, clean in US018_ITEMS:
    variables.append(var(
        vn, f"Platform Habit/Attitude — {stem}",
        "PLATFORM_USE",
        f"Using [platform] is something ...{stem}",
        "LIKERT_7",
        response_options=LIKERT_7_STANDARD,
        waves_present=[4, 5, 6],
        is_platform_indexed=True,
        platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
        clean_variable_name=clean,
        notes="Introduced in W4. Asked once per platform reported in us001 (excluding codes 20/21).",
    ))

variables.append(var(
    "us019_hours", "Time Per Day on Platform — Hours",
    "PLATFORM_USE",
    "On average, how much time per day did you spend using [platform] over the past 4 weeks? (Hours portion.)",
    "RANGE_NUMERIC",
    waves_present=[4, 5, 6],
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="time_per_day_hours",
    notes="Integer 0-24. Asked only when us002 in {1,2} (daily or near-daily users). Pair with us019_minutes for total minutes.",
))
variables.append(var(
    "us019_minutes", "Time Per Day on Platform — Minutes",
    "PLATFORM_USE",
    "On average, how much time per day did you spend using [platform] over the past 4 weeks? (Minutes portion.)",
    "RANGE_NUMERIC",
    waves_present=[4, 5, 6],
    is_platform_indexed=True,
    platform_codes_applicable="ALL_PLATFORMS_BY_WAVE",
    clean_variable_name="time_per_day_minutes",
    notes="Integer 0-60. Same conditional as us019_hours.",
))

# In-person interactions (W5, W6)
variables.append(var(
    "us020", "In-Person Interaction Frequency",
    "PLATFORM_USE",
    "Please indicate how often you have had in-person interactions in the past 4 weeks.",
    "LIKERT_6",
    response_options={
        **USE_FREQUENCY_6,
        "6": "Did not have any in-person social interactions in the past 4 weeks",
    },
    waves_present=[5, 6],
    clean_variable_name="inperson_frequency",
    notes="Code 6 is a non-occurrence sentinel; treat as NA when averaging.",
))
variables.append(var(
    "us021", "In-Person Meaningful Connection",
    "PLATFORM_USE",
    "In the past 4 weeks, have you experienced a meaningful connection with others during your in-person interactions?",
    "BINARY_YESNO",
    response_options=YN,
    waves_present=[5, 6],
    clean_variable_name="inperson_meaningful_connection",
))
variables.append(var(
    "us022", "In-Person Learned Useful",
    "PLATFORM_USE",
    "In the past 4 weeks, have you learned something that was useful or that helped you understand something important during your in-person interactions?",
    "BINARY_YESNO",
    response_options=YN,
    waves_present=[5, 6],
    clean_variable_name="inperson_learned_useful",
))
variables.append(var(
    "us023", "In-Person Bad-for-the-World Experience",
    "PLATFORM_USE",
    "In the past 4 weeks, have you witnessed or experienced something that you would consider bad for the world during your in-person interactions?",
    "BINARY_YESNO",
    response_options=YN,
    waves_present=[5, 6],
    clean_variable_name="inperson_bad_world",
))
variables.append(var(
    "us024", "In-Person Negative Personal Experience",
    "PLATFORM_USE",
    "In the past 4 weeks, have you personally witnessed or experienced something that affected you negatively during your in-person interactions?",
    "BINARY_YESNO",
    response_options=YN,
    waves_present=[5, 6],
    clean_variable_name="inperson_neg_experience",
))

variables.append(var(
    "us025", "Meaningful Connection Topics (multiselect, platform-indexed)",
    "PLATFORM_USE",
    "Did your experience(s) on [platform] relate to any of these topics? (Asked after us010=Yes; topic codes for the meaningful-connection experience.) Check the box next to all that apply.",
    "MULTISELECT",
    response_options={
        "1": "Medical/health information", "2": "Politics", "3": "Crime",
        "4": "Local news", "5": "Personal finance", "6": "None of the above",
    },
    waves_present=[6],
    is_platform_indexed=True,
    platform_codes_applicable=PLATFORM_CODES_W6,
    clean_variable_name="meaningful_connection_topics",
    notes="W6 only. Asked after us010=Yes (sits between us010 and us011 in the W6 flow).",
))
variables.append(var(
    "us026", "Learned-Useful Topics (multiselect, platform-indexed)",
    "PLATFORM_USE",
    "Did your experience(s) on [platform] relate to any of these topics? (Asked after us012=Yes; topic codes for the useful-learning experience.) Check the box next to all that apply.",
    "MULTISELECT",
    response_options={
        "1": "Medical/health information", "2": "Politics", "3": "Crime",
        "4": "Local news", "5": "Personal finance", "6": "None of the above",
    },
    waves_present=[6],
    is_platform_indexed=True,
    platform_codes_applicable=PLATFORM_CODES_W6,
    clean_variable_name="learned_useful_topics",
    notes="W6 only. Asked after us012=Yes (sits between us012 and us013 in the W6 flow).",
))

# === gms — social media usage context (W6 only) =============================

variables.append(var(
    "gms001", "Social Media Context — Devices (multiselect)",
    "PLATFORM_USE",
    "I primarily used social media on the following devices (Select all that apply):",
    "MULTISELECT",
    response_options={
        "1": "Fitness-oriented wearable devices (e.g., Apple Watch, Galaxy Watch)",
        "2": "AI wearable devices (e.g., Humane AI Pin)",
        "3": "Smartphone (e.g., a smartphone that you own)",
        "4": "Tablet (e.g., a tablet that you own)",
        "5": "Laptop (e.g., a portable laptop that you own)",
        "6": "2-in-1 laptop/tablet (e.g., Microsoft Surface)",
        "7": "Desktop computer (e.g., a non-portable, stationary computer such as an iMac)",
        "8": "Virtual/Augmented Reality headset (e.g., AppleVR, Meta Quest)",
        "9": "Other device",
    },
    waves_present=[6],
    clean_variable_name="context_devices",
    notes="W6 only. Conditional on us001 != 21 (used at least one platform). Free-text follow-up `gms001_other` if code 9 selected.",
))
variables.append(var(
    "gms001_other", "Social Media Context — Devices Other (free text)",
    "PLATFORM_USE",
    "Please specify which other unlisted device you used social media on.",
    "STRING_OPEN",
    waves_present=[6],
    clean_variable_name="context_devices_other",
    notes="W6 only. Conditional on gms001 = 9.",
))
variables.append(var(
    "gms002", "Social Media Context — People (multiselect)",
    "PLATFORM_USE",
    "I primarily used social media around the following people (Select all that apply):",
    "MULTISELECT",
    response_options={
        "1": "Coworkers", "2": "Family", "3": "Friends", "4": "Roommates",
        "5": "Significant other", "6": "Strangers", "7": "No one, was alone",
        "8": "None of the above, other",
    },
    waves_present=[6],
    clean_variable_name="context_people",
    notes="W6 only. Conditional on us001 != 21.",
))
variables.append(var(
    "gms003", "Social Media Context — Locations (multiselect)",
    "PLATFORM_USE",
    "I primarily used social media in the following locations (Select all that apply):",
    "MULTISELECT",
    response_options={
        "1": "Bar, party", "2": "Cafe, restaurant", "3": "Friend's house",
        "4": "University campus", "5": "Fraternity, sorority house", "6": "Gym",
        "7": "Home", "8": "Library", "9": "Religious facility",
        "10": "Store, mall", "11": "Workplace (not your home office)",
        "12": "Vehicle", "13": "Outdoors, park, or in nature",
        "14": "None of the above, other",
    },
    waves_present=[6],
    clean_variable_name="context_locations",
    notes="W6 only. Conditional on us001 != 21.",
))
variables.append(var(
    "gms004", "Social Media Context — Offline Activities (multiselect)",
    "PLATFORM_USE",
    "I primarily used social media while also performing the following OFFLINE activities (Select all that apply):",
    "MULTISELECT",
    response_options={
        "1": "Working at a job", "2": "Commuting to work", "3": "Traveling",
        "4": "Doing household chores/running errands",
        "5": "Exercising/physical activity/sports",
        "6": "Socializing with others offline",
        "7": "Watching TV/movies", "8": "Reading", "9": "Listening to music",
        "10": "Creative activities (e.g., playing a musical instrument; painting)",
        "11": "Resting/Napping", "12": "Doing nothing",
        "13": "Eating/Drink",
    },
    waves_present=[6],
    clean_variable_name="context_offline_activities",
    notes="W6 only. Conditional on us001 != 21.",
))
variables.append(var(
    "gms005", "Social Media Context — Situations (multiselect)",
    "PLATFORM_USE",
    "I primarily used social media when I was in the following types of situations (Select all that apply):",
    "MULTISELECT",
    response_options={
        "1": "Work, tasks, duties",
        "2": "Intellectual, aesthetic, profound",
        "3": "Threat, criticism, accusation",
        "4": "Romance, sexuality, love",
        "5": "Positive, pleasant things, nice feelings",
        "6": "Negative, unpleasant things, bad feelings",
        "7": "Deceit, lies, dishonesty",
        "8": "Communication, interaction, social relationships",
    },
    waves_present=[6],
    clean_variable_name="context_situations",
    notes="W6 only. Conditional on us001 != 21.",
))

# === AI_ATTITUDES — general (AI_concerned, AI_excited, etc.) ===============

variables.append(var(
    "ai_concerned", "AI Concern (general)",
    "AI_ATTITUDES",
    "How concerned or not concerned are you about the increased use of artificial intelligence computer programs in daily life?",
    "LIKERT_5",
    response_options=CONCERNED_5_NOOP,
    out_of_range_codes=[5],
    waves_present=[1, 2, 3],
    clean_variable_name="ai_concern",
    notes="Raw CSV column name is `ai_concerned` (lowercase); PDF flow renders it as 'AI_concerned'. Code 5 ('No opinion') must be recoded to NA before averaging. NOT asked in W4-W6.",
))
variables.append(var(
    "ai_excited", "AI Excitement (general)",
    "AI_ATTITUDES",
    "How excited or not excited are you about the increased use of artificial intelligence computer programs in daily life?",
    "LIKERT_5",
    response_options=EXCITED_5_NOOP,
    out_of_range_codes=[5],
    waves_present=[1, 2, 3],
    clean_variable_name="ai_excitement",
    notes="Raw CSV column name is `ai_excited` (lowercase); PDF flow renders it as 'AI_excited'. Code 5 ('No opinion') -> NA. NOT asked in W4-W6.",
))

variables.append(var(
    "ai_used", "AI Services Used (multiselect)",
    "AI_ATTITUDES",
    "In the past 28 days, have you used any of the following AI services (e.g., ChatGPT, Stable Diffusion)?",
    "MULTISELECT",
    response_options={
        "1": "AI to generate text",
        "2": "AI to generate images",
        "3": "AI that provides advice",
        "4": "AI that helps you learn",
        "5": "None of the above",
    },
    waves_present=[1],
    clean_variable_name="ai_used_types",
    notes="W1 only. Replaced in W2-W3 by the q_ai1-q_ai7 battery with different categories. Free-text follow-up `ai_used_exp` if any of 1-4 selected.",
))
variables.append(var(
    "ai_used_exp", "AI Used — Experience Description",
    "AI_ATTITUDES",
    "In a sentence or two, please describe one experience where you used an AI service. What did you use it for, what were the results, and how did you feel about the experience?",
    "STRING_OPEN",
    waves_present=[1],
    clean_variable_name="ai_used_exp_desc",
    notes="W1 only. Conditional on ai_used selecting 1-4. PII-redaction instruction.",
))

AI_EFFECT_ITEMS = [
    ("ai_effect_a", "Education of Youth",        "the education of our youth",                                "ai_effect_youth_education"),
    ("ai_effect_b", "Family/Friend Relationships", "people's relationships with family and friends",          "ai_effect_family_friends"),
    ("ai_effect_c", "Psychological Well-Being",  "people's psychological well-being",                         "ai_effect_psych_wellbeing"),
    ("ai_effect_d", "Military",                  "the military",                                              "ai_effect_military"),
    ("ai_effect_e", "Health Care",               "health care",                                               "ai_effect_healthcare"),
    ("ai_effect_f", "Minorities/Vulnerable Groups","minorities and vulnerable groups",                        "ai_effect_minorities"),
    ("ai_effect_g", "Job Opportunities",         "job opportunities for people",                              "ai_effect_jobs"),
]
for vn, construct_short, qtail, clean in AI_EFFECT_ITEMS:
    variables.append(var(
        vn, f"AI Effect — {construct_short}",
        "AI_ATTITUDES",
        f"Do you feel more excited or more concerned about... The effects of artificial intelligence computer programs on {qtail}?",
        "LIKERT_5",
        response_options=AI_EFFECT_5_NOOP,
        out_of_range_codes=[6],
        waves_present=[1],
        clean_variable_name=clean,
        notes="W1 only. Bipolar 5-pt scale plus code 6 'No opinion' (recode to NA).",
    ))

variables.append(var(
    "ai_other_concerns", "AI/Tech — Other Concerns (free text)",
    "AI_ATTITUDES",
    "Do you have concerns about the increasing use of technology in daily life that were not asked about? Please describe them in a sentence or two.",
    "STRING_OPEN",
    waves_present=[1],
    clean_variable_name="ai_other_concerns_desc",
    notes="W1 only. PII-redaction instruction.",
))
variables.append(var(
    "ai_ideas", "AI/Tech — Ideas for Better Tech (free text)",
    "AI_ATTITUDES",
    "In a sentence or two, what ideas do you have for making technology better for you and/or for society?",
    "STRING_OPEN",
    waves_present=[1],
    clean_variable_name="ai_ideas_desc",
    notes="W1 only. PII-redaction instruction.",
))

# === q_ai battery (AI tool use & evaluation) — W2-W3 for q_ai1-6, W2-W6 for q_ai7 ===

QAI_TOOLS = [
    # (idx, label_short, parent_qtext, waves)
    (1, "Text/Code Generation (e.g., ChatGPT, Bard, Bing Chat)",
        "applications that use AI to generate human-like text or code, such as ChatGPT, Bard, or Bing Chat",
        [2, 3]),
    (2, "Image/Video Generation (e.g., Midjourney, DALL-E, Stable Diffusion)",
        "applications that use AI to generate images or video from a text description, such as Midjourney, DALL-E, or Stable Diffusion",
        [2, 3]),
    (3, "Search Engine (e.g., Google, Bing)",
        "a search engine, such as Google or Bing",
        [2, 3]),
    (4, "AI Self-Driving Cars/Trucks",
        "AI-assisted self-driving cars or trucks",
        [2, 3]),
    (5, "AI-Assisted Robots",
        "AI-assisted robots that can perform tasks like sorting, packing, moving objects, cleaning, or caretaking",
        [2, 3]),
    (6, "AI Organizational Decision Automation",
        "applications that use AI to automate organizational decision processes, such as job interviews, scheduling, or hiring/firing",
        [2, 3]),
    (7, "Mixed Reality / AR/VR Headset (e.g., Meta Oculus, Apple Vision Pro, Microsoft HoloLens)",
        "a headset that creates a mixed reality (AR/VR) experience (e.g. Meta's Oculus Quest, Apple's Vision Pro, Microsoft's HoloLens)",
        [2, 3, 4, 5, 6]),
]

QAI8A_OPTIONS_GENERAL = {
    "1": "Out of curiosity",
    "2": "For entertainment",
    "3": "For social connection",
    "4": "To learn something new about the world",
    "5": "For tasks at work",
    "6": "For school-related tasks",
    "7": "To generate additional income (other than your regular work)",
    "8": "To gather information or explore details about a specific health condition or treatment",
    "9": "To create content for social media",
    "10": "To assist in personal tasks, such as planning activities, trips, getting ideas for gifts, etc.",
    "11": "To improve communications (for instance, help in writing emails, letters, etc.)",
    "12": "As a tool for mental health, such as working through thoughts or emotions",
    "13": "To help with creative pursuits, like writing stories, scripts, music, etc.",
    "14": "Other, please specify",
}
QAI8A_OPTIONS_XR = {
    "1": "Gaming",
    "2": "Watching movies or TV",
    "3": "Social interactions/networking",
    "4": "To learn something new about the world",
    "5": "Remote meetings/collaboration",
    "6": "Virtual tourism and travel",
    "7": "Improving physical health",
    "8": "Improving mental health",
    "9": "Training and education simulations",
    "10": "Shopping",
    "11": "Sports and fitness",
    "12": "Computing",
    "13": "Other, please specify",
}

QAI11_GENERAL_SUFFIX_LABELS = "a..n map 1:1 to the 14 q_ai8a response options (a=Out of curiosity, b=Entertainment, c=Social connection, d=Learn about the world, e=Tasks at work, f=School tasks, g=Additional income, h=Health info, i=Social media content, j=Personal tasks, k=Communications, l=Mental health, m=Creative pursuits, n=Other)."
QAI11_XR_SUFFIX_LABELS = "a..m map 1:1 to the 13 q_ai8a_7 response options (a=Gaming, b=Movies/TV, c=Social interactions, d=Learn about world, e=Remote meetings, f=Virtual tourism, g=Physical health, h=Mental health, i=Training/education, j=Shopping, k=Sports/fitness, l=Computing, m=Other)."

for idx, label_short, qtail, waves in QAI_TOOLS:
    # q_aiN — used the tool YES/NO
    variables.append(var(
        f"q_ai{idx}", f"AI Tool Used — {label_short}",
        "AI_ATTITUDES",
        f"In the past 4 weeks, have you used {qtail}?",
        "BINARY_YESNO",
        response_options=YN,
        waves_present=waves,
        clean_variable_name=f"ai_tool_used_{idx}",
        notes=f"Gates q_ai8a_{idx} / q_ai10_{idx} / q_ai11_{idx} / q_ai12_{idx} / q_ai13_{idx}.",
    ))
    # q_ai8a_N — what for? (multiselect)
    qai8a_opts = QAI8A_OPTIONS_XR if idx == 7 else QAI8A_OPTIONS_GENERAL
    variables.append(var(
        f"q_ai8a_{idx}", f"AI Tool Purposes — {label_short} (multiselect)",
        "AI_ATTITUDES",
        f"You said earlier that you had used {qtail}. What did you use it for? Please select all that apply.",
        "MULTISELECT",
        response_options=qai8a_opts,
        waves_present=waves,
        clean_variable_name=f"ai_tool_purposes_{idx}",
        notes=(
            f"Conditional on q_ai{idx}=Yes. Free-text follow-up `q_ai8a_{idx}_other` if last code (XR=13, others=14) selected. "
            "Drives the per-use-case usefulness/harmfulness batteries q_ai11_{idx} and q_ai13_{idx}."
        ),
    ))
    # q_ai10_N — why useful (free text)
    variables.append(var(
        f"q_ai10_{idx}", f"AI Tool Usefulness — Why ({label_short}) (free text)",
        "AI_ATTITUDES",
        f"In a sentence or two, please describe why your experience(s) with {qtail} was or was not useful.",
        "STRING_OPEN",
        waves_present=waves,
        clean_variable_name=f"ai_tool_useful_desc_{idx}",
    ))
    # q_ai11_N — usefulness battery (sub-indexed by use case)
    suffix_doc = QAI11_XR_SUFFIX_LABELS if idx == 7 else QAI11_GENERAL_SUFFIX_LABELS
    n_subs = "a-m" if idx == 7 else "a-n"
    variables.append(var(
        f"q_ai11_{idx}", f"AI Tool Usefulness Rating — {label_short} (battery)",
        "AI_ATTITUDES",
        f"For each of the activities you selected, please rate how useful or not useful your use of {qtail} was to you.",
        "LIKERT_5",
        response_options=USEFUL_5,
        waves_present=waves,
        clean_variable_name=f"ai_tool_usefulness_{idx}",
        notes=(
            f"Battery of sub-items q_ai11_{idx}{n_subs} stored separately in the raw data. {suffix_doc} "
            f"Each sub-item is only asked when the corresponding q_ai8a_{idx} code is selected. "
            "Represented as a single dictionary row because the response scale and prompt are identical across sub-items."
        ),
    ))
    # q_ai12_N — why harmful (free text)
    variables.append(var(
        f"q_ai12_{idx}", f"AI Tool Harmfulness — Why ({label_short}) (free text)",
        "AI_ATTITUDES",
        f"In a sentence or two, please describe why your experience(s) with {qtail} was or was not harmful.",
        "STRING_OPEN",
        waves_present=waves,
        clean_variable_name=f"ai_tool_harmful_desc_{idx}",
    ))
    # q_ai13_N — harmfulness battery
    variables.append(var(
        f"q_ai13_{idx}", f"AI Tool Harmfulness Rating — {label_short} (battery)",
        "AI_ATTITUDES",
        f"For each of the activities you selected, please rate how harmful or not harmful your use of {qtail} was to you.",
        "LIKERT_5",
        response_options=HARMFUL_5,
        waves_present=waves,
        clean_variable_name=f"ai_tool_harmfulness_{idx}",
        notes=(
            f"Battery of sub-items q_ai13_{idx}{n_subs}. {suffix_doc} "
            f"Same conditional structure as q_ai11_{idx}."
        ),
    ))

# q_ai13 and q_ai14 (global mixed reality attitudes; W2-W6)
variables.append(var(
    "q_ai13", "AI/Mixed Reality Excitement (general)",
    "AI_ATTITUDES",
    "How excited or not excited are you about the increased use of mixed reality (AR/VR) experiences (e.g. Meta's Oculus, Apple's Vision Pro, Microsoft's HoloLens) in daily life?",
    "LIKERT_5",
    response_options=XR_EXCITEMENT_5,
    waves_present=[2, 3, 4, 5, 6],
    clean_variable_name="ai_xr_excitement",
    notes="Distinct from the q_ai13_N (battery) variables — this is a single global item, not a per-use-case battery. Naming collision in the raw data is unfortunate.",
))
variables.append(var(
    "q_ai14", "AI/Mixed Reality Concern (general)",
    "AI_ATTITUDES",
    "How concerned or not concerned are you about the increased use of mixed reality (AR/VR) experiences (e.g. Meta's Oculus, Apple's Vision Pro, Microsoft's HoloLens) in daily life?",
    "LIKERT_5",
    response_options=XR_CONCERN_5,
    waves_present=[2, 3, 4, 5, 6],
    clean_variable_name="ai_xr_concern",
))

# === SOCIAL_MEDIA_BELIEFS — sc001a-f (W1, W2 only) ==========================

SC001_ITEMS = [
    ("sc001a", "Using social media is a waste of time for me.",                         "sm_waste_of_time"),
    ("sc001b", "Using social media strengthens and supports my relationships.",        "sm_strengthens_relationships"),
    ("sc001c", "Using social media facilitates my learning and growth.",                "sm_learning_growth"),
    ("sc001d", "I'm good at managing the ways I use social media.",                     "sm_managing_well"),
    ("sc001e", "I'm in control of how I use social media.",                             "sm_in_control"),
    ("sc001f", "I find it hard to resist the pull of social media.",                    "sm_hard_to_resist"),
]
for vn, qtext, clean in SC001_ITEMS:
    variables.append(var(
        vn, f"Social Media Belief — {qtext.split('.')[0]}",
        "SOCIAL_MEDIA_BELIEFS",
        qtext,
        "LIKERT_5",
        response_options=LIKERT_5_STANDARD,
        waves_present=[1, 2],
        clean_variable_name=clean,
        notes=(
            "W1 and W2 only — NOT asked in W3-W6 (the gated 'asksocial' block was removed). "
            "Conditional on asksocial=1 (used at least one social platform). "
            "Handoff originally documented this as 'all waves' — confirm with Matt before relying on the absence in W3-W6."
        ),
    ))

# === ONLINE EXPERIENCE EXTRAS — ex001, ex002a-c (W2 only) ===================

variables.append(var(
    "ex001", "Wake to Check Social Media",
    "SOCIAL_MEDIA_BELIEFS",
    "I wake up at night to check my social media feed(s).",
    "LIKERT_4",
    response_options=FREQ_4_ALWAYS,
    waves_present=[2],
    clean_variable_name="sm_wake_to_check",
    notes="W2 only. Conditional on asksocial=1.",
))
EX002_ITEMS = [
    ("ex002a", "My family",                                  "sm_connected_family"),
    ("ex002b", "My friends",                                 "sm_connected_friends"),
    ("ex002c", "My neighbors and others in my community",    "sm_connected_neighbors"),
]
for vn, qtext, clean in EX002_ITEMS:
    variables.append(var(
        vn, f"Social Media Connectedness — {qtext}",
        "SOCIAL_MEDIA_BELIEFS",
        f"My use of social media has made me feel more connected to... {qtext}",
        "LIKERT_5",
        response_options=LIKERT_5_STANDARD,
        waves_present=[2],
        clean_variable_name=clean,
        notes="W2 only. Conditional on asksocial=1.",
    ))

# === WELLBEING — ls002a-l (mostly all waves; a/b/e/f possibly missing W5-W6) ===

LS002_ITEMS = [
    # (vn, question_text, clean_name, was_pdf_truncation_suspect, is_reverse_coded)
    ("ls002a", "I am satisfied with my physical health",                   "life_sat_physical",         True,  False),
    ("ls002b", "I am satisfied with my financial situation",               "life_sat_financial",        True,  False),
    ("ls002c", "I am satisfied with my social life",                       "life_sat_social",           False, False),
    ("ls002d", "I am satisfied with my mental health",                     "life_sat_mental",           False, False),
    ("ls002e", "I am satisfied with the amount of leisure time I have",    "life_sat_leisure",          True,  False),
    ("ls002f", "I am satisfied with my job or other daily activities",     "life_sat_job",              True,  False),
    ("ls002g", "I am satisfied with my family life",                       "life_sat_family",           False, False),
    ("ls002h", "I feel happy most of the time",                            "life_sat_happy",            False, False),
    ("ls002i", "I feel negative most of the time",                         "life_sat_negative_feeling", False, True),
    ("ls002j", "My life is going well",                                    "life_sat_going_well",       False, False),
    ("ls002k", "In most ways, my life is close to my ideal",               "life_sat_close_to_ideal",   False, False),
    ("ls002l", "I am satisfied with my life",                              "life_sat_overall",          False, False),
]
for vn, qtext, clean, was_pdf_truncation_suspect, reverse in LS002_ITEMS:
    waves_p = ALL_WAVES  # CONFIRMED via Phase 1 CSV verification — all 12 items in all 6 waves
    change_notes = None
    if was_pdf_truncation_suspect:
        change_notes = (
            "PDF truncation false alarm — Phase 1 CSV verification (2026-05-24) confirmed this "
            "column IS present in all 6 raw CSVs including W5 (uas518) and W6 (uas519). "
            "The empty elseif branch in those PDFs is a survey-flow rendering artifact, NOT a "
            "data absence. Safe to treat as waves_present=[1,2,3,4,5,6]."
        )
    construct_label = f"Life Satisfaction — {qtext.split(',')[0].replace('I am satisfied with my ', '').replace('I am satisfied with ', '').replace('I feel ', '').replace('My ', '').strip()}"
    notes = None
    if reverse:
        notes = "REVERSE-CODED relative to the rest of the ls002 battery — higher score = worse wellbeing. is_reverse_coded=true triggers automatic flipping in the precompute pipeline."
    variables.append(var(
        vn, construct_label,
        "WELLBEING",
        qtext + ".",
        "LIKERT_7",
        response_options=LIKERT_7_STANDARD,
        is_reverse_coded=reverse,
        waves_present=waves_p,
        change_notes=change_notes,
        clean_variable_name=clean,
        notes=notes,
    ))

# === LONELINESS — ex003a-c (W2, W5, W6) =====================================

EX003_ITEMS = [
    ("ex003a", "How often do you feel that you lack companionship: Hardly ever, some of the time, or often?", "Lack Companionship",  "loneliness_companionship"),
    ("ex003b", "How often do you feel left out?",                                                              "Left Out",            "loneliness_left_out"),
    ("ex003c", "How often do you feel isolated from others?",                                                  "Isolated",            "loneliness_isolated"),
]
for vn, qtext, label_short, clean in EX003_ITEMS:
    variables.append(var(
        vn, f"Loneliness — {label_short}",
        "LONELINESS",
        qtext,
        "LIKERT_3",
        response_options=LONELINESS_3,
        waves_present=[2, 5, 6],
        clean_variable_name=clean,
        notes="UCLA 3-item loneliness short form. Asked in W2, W5, W6.",
    ))

# === DEPRESSION_ANXIETY — ds001a-f (W1 only) ================================

DS001_ITEMS = [
    ("ds001a", "I felt down-hearted and blue.",                                          "Down-Hearted",      "depanx_downhearted"),
    ("ds001b", "I found it difficult to work up the initiative to do things.",           "Lacked Initiative", "depanx_initiative"),
    ("ds001c", "I felt scared without any good reason.",                                 "Scared",            "depanx_scared"),
    ("ds001d", "I was worried about situations in which I might panic and make a fool of myself.", "Panic Worry", "depanx_panic_worry"),
    ("ds001e", "I found it hard to wind down.",                                          "Hard to Wind Down", "depanx_wind_down"),
    ("ds001f", "I found myself getting agitated.",                                       "Agitated",          "depanx_agitated"),
]
for vn, qtext, label_short, clean in DS001_ITEMS:
    variables.append(var(
        vn, f"Depression/Anxiety — {label_short}",
        "DEPRESSION_ANXIETY",
        qtext,
        "LIKERT_4",
        response_options=DASS_4,
        waves_present=[1],
        clean_variable_name=clean,
        notes="W1 only. DASS-style short-form depression/anxiety scale; 'over the past week' reference frame.",
    ))

# === TECH_IDENTITY — te001a-e (W1 only) ====================================

TE001_ITEMS = [
    ("te001a", "Technology is an important part of my identity",                                  "Important Part",       "tech_identity_important"),
    ("te001b", "Using new technologies is an important part of who I am",                          "New Tech",             "tech_identity_new_tech"),
    ("te001c", "Being up to date with the newest technologies is a reflection of who I am",        "Up to Date",           "tech_identity_up_to_date"),
    ("te001d", "I am the type of person who has the most recent technologies",                     "Has Recent",           "tech_identity_has_recent"),
    ("te001e", "Being good with technology is an important part of my identity",                   "Good With Tech",       "tech_identity_good_with"),
]
for vn, qtext, label_short, clean in TE001_ITEMS:
    variables.append(var(
        vn, f"Tech Identity — {label_short}",
        "TECH_IDENTITY",
        qtext + ".",
        "LIKERT_6_NOMID",
        response_options=LIKERT_6_NOMID,
        waves_present=[1],
        clean_variable_name=clean,
        notes="W1 only. 6-point forced-choice Likert with NO neutral midpoint (unusual scale).",
    ))

# === TECH_REGULATION — ex004a-c (W5, W6) ===================================

variables.append(var(
    "ex004a", "Tech Regulation Level",
    "TECH_REGULATION",
    "How much should major technology companies be regulated by the government?",
    "LIKERT_5",
    response_options=REG_5,
    waves_present=[5, 6],
    clean_variable_name="regulation_tech_companies",
))
variables.append(var(
    "ex004b", "Tech Election-Integrity Effort",
    "TECH_REGULATION",
    "Do you think technology companies should do more, do less, or keep doing what they are now to protect the integrity of elections?",
    "LIKERT_3",
    response_options=REG_3,
    waves_present=[5, 6],
    clean_variable_name="regulation_elections",
    notes="LIKERT_3 with NO neutral midpoint (3 = status quo, not 'middle' on a more/less spectrum). Code-3 is ordered between 1 and 2 conceptually — recommend treating as categorical, not ordinal.",
))
variables.append(var(
    "ex004c", "Tech User-Protection Effort",
    "TECH_REGULATION",
    "Do you think technology companies should do more, do less, or keep doing what they are now to protect users from harmful experiences online?",
    "LIKERT_3",
    response_options=REG_3,
    waves_present=[5, 6],
    clean_variable_name="regulation_protect_users",
    notes="Same ordering caveat as ex004b.",
))

# === AI_ATTITUDES — ex005a-c, ex006a-d (W6 only AI governance) =============

EX005_ITEMS = [
    ("ex005a", "Government",     "Government",     "ai_role_government"),
    ("ex005b", "Corporations",   "Corporations",   "ai_role_corporations"),
    ("ex005c", "Universities",   "Universities",   "ai_role_universities"),
]
for vn, qtext, label_short, clean in EX005_ITEMS:
    variables.append(var(
        vn, f"AI Governance Role — {label_short}",
        "AI_ATTITUDES",
        f"How much do you oppose or support the following playing an important role in shaping and developing AI? — {qtext}",
        "LIKERT_5",
        response_options=LIKERT_5_SUPPORT_OPPOSE,
        waves_present=[6],
        clean_variable_name=clean,
        notes="W6 only. Block also includes ex006 (4 items) in the same section.",
    ))

EX006_ITEMS = [
    ("ex006a", "Companies should be free to do whatever they think is best with the data they collect",                                                                            "Free Data Use",       "ai_data_free_use",         False),
    ("ex006b", "Companies should be required to make anonymized user data available to independent researchers and auditors",                                                       "Independent Audit",   "ai_data_independent_audit", False),
    ("ex006c", "How much do you agree with the idea that society should invest in the development of new superintelligent AI systems that perform better than humans on almost any task?", "Superintelligent Invest", "ai_super_invest",       False),
    ("ex006d", "If companies do develop new superintelligent AI systems that perform better than humans on almost any task, it is critical that there be processes for all people / the general public to have input into the development and potential uses of such systems.", "Public Input on Super AI", "ai_super_public_input", False),
]
for vn, qtext, label_short, clean, reverse in EX006_ITEMS:
    variables.append(var(
        vn, f"AI Governance Belief — {label_short}",
        "AI_ATTITUDES",
        qtext,
        "LIKERT_5",
        response_options=LIKERT_5_AGREE_5LEVEL,
        is_reverse_coded=reverse,
        waves_present=[6],
        clean_variable_name=clean,
        notes="W6 only.",
    ))

# === INSTITUTIONAL_TRUST — ins001a-h (W1 only) ==============================

INS001_ITEMS = [
    ("ins001a", "The US government",                                  "US Government",         "trust_us_government"),
    ("ins001b", "Journalists",                                        "Journalists",           "trust_journalists"),
    ("ins001c", "Network Television news (e.g. ABC, NBC, CBS)",       "Network TV News",       "trust_network_tv_news"),
    ("ins001d", "The US presidency",                                  "US Presidency",         "trust_us_presidency"),
    ("ins001e", "The police",                                         "Police",                "trust_police"),
    ("ins001f", "The Centers for Disease Control and Prevention (CDC)", "CDC",                  "trust_cdc"),
    ("ins001g", "Social media companies",                             "Social Media Companies", "trust_social_media_companies"),
    ("ins001h", "Technology companies",                               "Tech Companies",        "trust_tech_companies"),
]
for vn, target, label_short, clean in INS001_ITEMS:
    variables.append(var(
        vn, f"Institutional Trust — {label_short}",
        "INSTITUTIONAL_TRUST",
        f"Please tell me how much confidence you, yourself, have in each of the following United States Institutions — a great deal, quite a lot, some, very little, or none? — {target}",
        "LIKERT_5",
        response_options=TRUST_5,
        waves_present=[1],
        clean_variable_name=clean,
        notes="W1 only.",
    ))

# === DEMOGRAPHICS ==========================================================

variables.append(var(
    "citizenus", "US Citizenship",
    "DEMOGRAPHICS",
    "Are you a citizen of the United States?",
    "BINARY_YESNO",
    response_options=YN,
    clean_variable_name="is_us_citizen",
    notes="Preload-supported; only asked when empty.",
))
variables.append(var(
    "statereside", "State of Residence",
    "DEMOGRAPHICS",
    "In what state are you currently residing?",
    "SINGLE_SELECT_CATEGORICAL",
    response_options=STATERESIDE_OPTIONS,
    clean_variable_name="state_of_residence",
    notes="Asked only when citizenus=1 and statereside empty (preload-supported).",
))

# --- Panel-level demographic preloads (NOT in the survey flow PDFs) ------
# These are tracker preloads carried by the UAS panel across all surveys.
# Matt's r/clean/utils/preprocessing/transform_data.R references them by these
# names. waves_present is "TBD" because the PDF flows don't show them — Phase 1
# audit must verify CSV column headers across all 6 waves.
_PRELOAD_DEMO_NOTE_BASE = (
    "PANEL PRELOAD — not in the survey flow PDFs (carried as tracker preload "
    "by UAS for every panel member; see getTrackerPreload() pattern in PDFs). "
    "Referenced in r/clean/utils/preprocessing/transform_data.R. "
    "waves_present marked 'TBD' pending Phase 1 audit verification of the raw CSV "
    "column headers. Response coding TBD — look up in UAS panel documentation."
)

variables.append(var(
    "gender", "Gender (panel preload)",
    "DEMOGRAPHICS",
    "Gender — value preloaded from the UAS panel tracker rather than asked in each wave.",
    "SINGLE_SELECT_CATEGORICAL",
    waves_present=[1, 2, 3, 4, 5, 6],
    wording_changed_across_waves="TBD",
    coding_changed_across_waves="TBD",
    change_notes="TBD — verify presence and coding in raw CSVs in Phase 1.",
    clean_variable_name="gender",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Cleaned via transform_gender().",
))

variables.append(var(
    "age", "Age (panel preload)",
    "DEMOGRAPHICS",
    "Age in years — preloaded from the UAS panel tracker.",
    "RANGE_NUMERIC",
    waves_present=[1, 2, 3, 4, 5, 6],
    wording_changed_across_waves="TBD",
    coding_changed_across_waves="TBD",
    change_notes="TBD — verify presence in raw CSVs in Phase 1.",
    clean_variable_name="age",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Cleaned via transform_age(); typically bucketed downstream.",
))

variables.append(var(
    "race", "Race (panel preload)",
    "DEMOGRAPHICS",
    "Race — preloaded from the UAS panel tracker. Combined with hisplatino during cleaning to produce a unified race/ethnicity category.",
    "SINGLE_SELECT_CATEGORICAL",
    waves_present=[1, 2, 3, 4, 5, 6],
    wording_changed_across_waves="TBD",
    coding_changed_across_waves="TBD",
    change_notes="TBD — verify presence and coding in raw CSVs in Phase 1.",
    clean_variable_name="race",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Combined with hisplatino via transform_race().",
))

variables.append(var(
    "hisplatino", "Hispanic/Latino Identity (panel preload)",
    "DEMOGRAPHICS",
    "Hispanic/Latino identity flag — preloaded from the UAS panel tracker. Combined with race during cleaning.",
    "BINARY_YESNO",
    waves_present=[1, 2, 3, 4, 5, 6],
    wording_changed_across_waves="TBD",
    coding_changed_across_waves="TBD",
    change_notes="TBD — verify presence and coding in raw CSVs in Phase 1.",
    clean_variable_name="hispanic_latino",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Combined with race via transform_race().",
))

variables.append(var(
    "education", "Education (panel preload)",
    "DEMOGRAPHICS",
    "Educational attainment — preloaded from the UAS panel tracker.",
    "SINGLE_SELECT_CATEGORICAL",
    waves_present=[1, 2, 3, 4, 5, 6],
    wording_changed_across_waves="TBD",
    coding_changed_across_waves="TBD",
    change_notes="TBD — verify presence and coding in raw CSVs in Phase 1.",
    clean_variable_name="education",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Cleaned via transform_edu() into edu_bucket.",
))

variables.append(var(
    "hhincome", "Household Income (panel preload)",
    "DEMOGRAPHICS",
    "Household income — preloaded from the UAS panel tracker.",
    "SINGLE_SELECT_CATEGORICAL",
    waves_present=[1, 2, 3, 4, 5, 6],
    wording_changed_across_waves="TBD",
    coding_changed_across_waves="TBD",
    change_notes="Phase 1 verified 2026-05-24: column present in all 6 raw CSVs. Response coding TBD — look up in UAS panel documentation.",
    clean_variable_name="hhincome",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Cleaned via transform_income() into income bucket.",
))

# Additional panel-preload demographics discovered during Phase 1 CSV-header verification
# (2026-05-24). All present in all 6 raw CSVs.

variables.append(var(
    "maritalstatus", "Marital Status (panel preload)",
    "DEMOGRAPHICS",
    "Marital status — preloaded from the UAS panel tracker.",
    "SINGLE_SELECT_CATEGORICAL",
    waves_present=[1, 2, 3, 4, 5, 6],
    wording_changed_across_waves="TBD",
    coding_changed_across_waves="TBD",
    change_notes="Phase 1 verified 2026-05-24: column present in all 6 raw CSVs.",
    clean_variable_name="marital_status",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Discovered during Phase 1 CSV-header audit; not referenced by transform_data.R yet.",
))

variables.append(var(
    "primary_respondent", "Primary Respondent Flag (panel meta)",
    "DEMOGRAPHICS",
    "Whether this respondent is the primary respondent for their household (per UAS panel metadata).",
    "BINARY_YESNO",
    waves_present=[1, 2, 3, 4, 5, 6],
    change_notes="Phase 1 verified 2026-05-24: column present in all 6 raw CSVs.",
    clean_variable_name="primary_respondent",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Discovered during Phase 1 CSV-header audit. Useful for household-level deduplication if needed.",
))

variables.append(var(
    "bornus", "Born in US (panel preload)",
    "DEMOGRAPHICS",
    "Whether respondent was born in the United States — preloaded from the UAS panel tracker.",
    "BINARY_YESNO",
    waves_present=[1, 2, 3, 4, 5, 6],
    change_notes="Phase 1 verified 2026-05-24: column present in all 6 raw CSVs.",
    clean_variable_name="is_born_us",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Discovered during Phase 1 CSV-header audit.",
))

variables.append(var(
    "stateborn", "State of Birth (panel preload)",
    "DEMOGRAPHICS",
    "State (or country) of birth — preloaded from the UAS panel tracker.",
    "SINGLE_SELECT_CATEGORICAL",
    waves_present=[1, 2, 3, 4, 5, 6],
    change_notes="Phase 1 verified 2026-05-24: column present in all 6 raw CSVs.",
    clean_variable_name="state_of_birth",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Discovered during Phase 1 CSV-header audit. Coding TBD — UAS panel may use a different state-code numbering than statereside.",
))

variables.append(var(
    "language", "Survey Language (panel meta)",
    "DEMOGRAPHICS",
    "Survey language preference recorded by the UAS panel tracker.",
    "SINGLE_SELECT_CATEGORICAL",
    waves_present=[1, 2, 3, 4, 5, 6],
    change_notes="Phase 1 verified 2026-05-24: column present in all 6 raw CSVs.",
    clean_variable_name="survey_language",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Discovered during Phase 1 CSV-header audit. Useful for sub-population analyses by language.",
))

variables.append(var(
    "dateofbirth_year", "Year of Birth (panel preload)",
    "DEMOGRAPHICS",
    "Year of birth — preloaded from the UAS panel tracker (more precise than the bucketed `age` field).",
    "RANGE_NUMERIC",
    waves_present=[1, 2, 3, 4, 5, 6],
    change_notes="Phase 1 verified 2026-05-24: column present in all 6 raw CSVs.",
    clean_variable_name="year_of_birth",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Use to derive exact age at time of each wave (subtract from wave_dates start year) for cohort analyses.",
))

variables.append(var(
    "agerange", "Age Range Bucket (panel preload)",
    "DEMOGRAPHICS",
    "Age range bucket — preloaded from the UAS panel tracker.",
    "SINGLE_SELECT_CATEGORICAL",
    waves_present=[1, 2, 3, 4, 5, 6],
    change_notes="Phase 1 verified 2026-05-24: column present in all 6 raw CSVs.",
    clean_variable_name="age_range",
    notes=_PRELOAD_DEMO_NOTE_BASE + " Bucket of `age` (which is a numeric/string). transform_age() in transform_functions.R uses `age` rather than this; flagged for Phase 2 review.",
))

# === POLITICAL =============================================================

_POLITICAL_DATA_GAP_NOTE = (
    "DATA-AVAILABILITY FINDING (Phase 1 verified 2026-05-24): this column is present in raw "
    "CSVs only for W1-W3. W4-W6 CSVs contain NEITHER the column nor its preload_* counterpart. "
    "Despite the PDF flows showing the question for every wave, the data was apparently never "
    "saved out for W4-W6. Implication: wave-over-wave political affiliation analyses must be "
    "restricted to W1-W3 or rely on cross-wave joins via uasid (the same panel member's "
    "earlier-wave party affiliation can carry forward as a static covariate)."
)

variables.append(var(
    "regis", "Voter Registration in Time",
    "POLITICAL",
    "Regardless of whether you voted in the November 8 2022 election, were you registered to vote using your current address (or by absentee) in time to cast a ballot in the election if you had chosen to do so?",
    "SINGLE_SELECT_CATEGORICAL",
    response_options={
        "1": "Yes, I was registered to vote in time for the election",
        "2": "I was not registered to vote in time for the election",
        "3": "Not sure",
    },
    waves_present=[1, 2, 3],
    change_notes=_POLITICAL_DATA_GAP_NOTE,
    clean_variable_name="voter_registered",
    notes="Preload-supported (preload_regis present in W1-W3). Conditional on citizenus=1 and statereside != 34 (North Dakota).",
))

variables.append(var(
    "partyreg", "Party Registration",
    "POLITICAL",
    "Are you registered as:",
    "SINGLE_SELECT_CATEGORICAL",
    response_options={
        "1": "Democrat", "2": "Republican",
        "3": "No political party (independent)",
        "4": "No political party (state does not allow registration by party)",
        "5": "Libertarian", "6": "Green party", "7": "Some other party",
    },
    waves_present=[1, 2, 3],
    change_notes=_POLITICAL_DATA_GAP_NOTE,
    clean_variable_name="party_registration",
    notes="Preload-supported (preload_partyreg present in W1-W3). Conditional on (statereside=34 OR (regis=1 AND statereside != 34)).",
))

variables.append(var(
    "party_affil", "Party Affiliation",
    "POLITICAL",
    "Regardless of if or how you are registered to vote, are you more closely aligned with...",
    "SINGLE_SELECT_CATEGORICAL",
    response_options={
        "1": "Democrats", "2": "Republicans",
        "3": "Independents (no political party)",
        "4": "Libertarians", "5": "Green party",
        "6": "Some other party", "7": "Not aligned with any political party",
    },
    waves_present=[1, 2, 3],
    change_notes=_POLITICAL_DATA_GAP_NOTE,
    clean_variable_name="party_affiliation",
    notes="Preload-supported (preload_party_affil present in W1-W3). Codes 3 and 7 gate lean_affil.",
))

variables.append(var(
    "lean_affil", "Party Lean (Independents/Unaligned)",
    "POLITICAL",
    "Generally speaking, do you lean more toward affiliating with Democrats or with Republicans?",
    "SINGLE_SELECT_CATEGORICAL",
    response_options={
        "1": "Lean toward Democrats",
        "2": "Lean toward Republicans",
        "3": "Do not lean toward either party",
    },
    waves_present=[1, 2, 3],
    change_notes=_POLITICAL_DATA_GAP_NOTE,
    clean_variable_name="party_lean",
    notes="Conditional on party_affil in {3, 7}. Preload-supported (preload_lean_affil present in W1-W3).",
))

variables.append(var(
    "rate_self", "Political Ideology — Self (0-100)",
    "POLITICAL",
    "On a scale from 0 to 100 where 0 is the most liberal and 100 is the most conservative, what number would you give to yourself?",
    "SCALE_0_100",
    clean_variable_name="political_ideology_self",
))

# SCIM thermometer + comfort pairs.
# Raw CSV column names are LOWERCASE (verified Phase 1 2026-05-24): scim_therm_con, etc.
# The _SLID / _BOX UI-tracking companion variables documented in the PDFs do NOT exist in
# any of the 6 raw CSVs — they were not saved out. Only scim_order_cons_lib and
# scim_order_rating_comfort (the display-order randomization controls) are stored.
SCIM_ITEMS = [
    ("scim_therm_con",  "Feeling Thermometer — Conservatives",
     "Please indicate how you feel toward conservatives using the scale below. 10 means that you feel very favorably or warm toward them, 0 that you feel very unfavorable or cold, and 5 is neutral.",
     "feeling_therm_conservatives"),
    ("scim_therm_lib",  "Feeling Thermometer — Liberals",
     "Please indicate how you feel toward liberals using the scale below. 10 means that you feel very favorably or warm toward them, 0 that you feel very unfavorable or cold, and 5 is neutral.",
     "feeling_therm_liberals"),
    ("scim_friends_con","Comfort Having Conservative Friends",
     "How comfortable are you having friends who are conservative? 10 means that you feel extremely comfortable, 0 means that you do not feel comfortable at all.",
     "comfort_conservative_friends"),
    ("scim_friends_lib","Comfort Having Liberal Friends",
     "How comfortable are you having friends who are liberal? 10 means that you feel extremely comfortable, 0 means that you do not feel comfortable at all.",
     "comfort_liberal_friends"),
]
for vn, construct_label, qtext, clean in SCIM_ITEMS:
    variables.append(var(
        vn, construct_label,
        "POLITICAL",
        qtext,
        "SCALE_0_10",
        clean_variable_name=clean,
        notes=(
            "Raw CSV column name is lowercase (e.g., `scim_therm_con`); PDF flow renders it as "
            "'SCIM_THERM_CON'. Slider+textbox input in the survey; the `*_SLID` / `*_BOX` UI-tracking "
            "companion variables documented in the PDFs are NOT stored in any of the 6 raw CSVs "
            "(Phase 1 verified 2026-05-24). Display order vs. paired CON/LIB item is randomized "
            "via scim_order_cons_lib and scim_order_rating_comfort (also in raw CSVs)."
        ),
    ))

variables.append(var(
    "vote2024", "2024 Presidential Preference",
    "POLITICAL",
    "Regardless of whether you voted in the presidential election in November, which of the two major party candidates did you prefer to have as the President of the United States for the next four years?",
    "SINGLE_SELECT_CATEGORICAL",
    response_options={
        "1": "Kamala Harris (Democrat)",
        "2": "Donald Trump (Republican)",
        "3": "No preference",
    },
    waves_present=[6],
    clean_variable_name="vote_2024_preference",
    notes="W6 only.",
))

# === SURVEY_QUALITY ========================================================

variables.append(var(
    "cs_001", "Survey Interest",
    "SURVEY_QUALITY",
    "Could you tell us how interesting or uninteresting you found the questions in this survey?",
    "LIKERT_5",
    response_options=SURVEY_INTEREST_5,
    clean_variable_name="survey_interest",
    notes="Raw CSV column name is `cs_001` (lowercase); PDF flow renders it as 'CS_001'.",
))
variables.append(var(
    "cs_003", "Survey Comments (free text)",
    "SURVEY_QUALITY",
    "Do you have any other comments on the survey? Please type these in the box below.",
    "STRING_OPEN",
    clean_variable_name="survey_comments",
    notes=(
        "Phase 1 verified 2026-05-24: this free-text column does NOT appear in the main uas51X.csv files. "
        "PII-sensitive free-text fields are stored separately in per-question scrubbed CSV files under "
        "data/text/uasNNN_<qnum> - c.csv (see r/clean/utils/preprocessing/process_text_data.R, which "
        "expects this layout). Out of scope for the Phase 3 numeric/categorical precompute, but useful "
        "for qualitative subsamples."
    ),
))


# ---------------------------------------------------------------------------
# Top-level wrapper
# ---------------------------------------------------------------------------

dictionary = {
    "_meta": {
        "status": "Phase 0 master dictionary — all 6 waves (UAS514–UAS519). Pending Matt's sign-off.",
        "note": (
            "Authoritative source: the 6 PDF survey flow documents. "
            "Generated by scripts/build_data_dictionary.py — re-run to regenerate. "
            "TRUNCATION FLAG: ls002a, ls002b, ls002e, ls002f have empty elseif branches in the "
            "W5 (UAS518) and W6 (UAS519) PDFs. Conservative read: waves_present=[1,2,3,4]. MUST "
            "be verified against actual raw CSV data before treating as missing in W5-W6."
        ),
        "generated_by": "scripts/build_data_dictionary.py",
        "generated_date": "2026-05-23",
        "sources": [
            "Survey for UAS514.pdf (W1)",
            "Survey for UAS515.pdf (W2)",
            "Survey for UAS516.pdf (W3)",
            "Survey for UAS517.pdf (W4)",
            "Survey for UAS518.pdf (W5)",
            "Survey for UAS519.pdf (W6)",
        ],
        "phase1_followups": [
            {
                "priority": "BLOCKER",
                "id": "wave-identifier-verification",
                "status": "VERIFIED 2026-05-24",
                "summary": (
                    "Confirmed via scripts/phase1_verify.R: wave_data.csv maps UAS file numbers "
                    "to wave numbers exactly as expected (514->1, 515->2, 516->3, 517->4, "
                    "518->5, 519->6). The internal `wave :=` variable embedded in the survey "
                    "flow PDF scripts IS unreliable (UAS516/UAS517/UAS518 mislabeled), but "
                    "transform_data.R correctly uses wave_data.csv as the source of truth. "
                    "No code change required."
                ),
            },
            {
                "priority": "BLOCKER",
                "id": "demographic-preload-csv-headers",
                "status": "VERIFIED + EXPANDED 2026-05-24",
                "summary": (
                    "Confirmed all 6 originally-stubbed demographic preloads (uasid, "
                    "final_weight, gender, age, race, hisplatino, education, hhincome) are "
                    "present in all 6 raw CSVs. Phase 1 also discovered 7 additional "
                    "panel-preload demographics that are present in all 6 CSVs but were NOT in "
                    "the original Phase 0 dictionary: maritalstatus, primary_respondent, "
                    "bornus, stateborn, language, dateofbirth_year, agerange. All 7 have been "
                    "added as STUB rows. Response coding for each still TBD — look up in UAS "
                    "panel documentation (UAS panel website) and populate response_options."
                ),
            },
            {
                "priority": "HIGH",
                "id": "scim-case-sensitivity",
                "status": "VERIFIED 2026-05-24",
                "summary": (
                    "Confirmed: raw CSV column headers are LOWERCASE (scim_therm_con, etc.) "
                    "across all 6 waves. Dictionary variable_name fields have been updated to "
                    "match (was UPPERCASE in Phase 0). Same case-mismatch fix applied to: "
                    "ai_concerned (was AI_concerned), ai_excited (was AI_excited), cs_001 (was "
                    "CS_001), cs_003 (was CS_003). Phase 1 also discovered: the *_SLID and "
                    "*_BOX UI-tracking companion variables documented in the PDFs do NOT exist "
                    "in any raw CSV — those inline notes have been removed/corrected."
                ),
            },
            {
                "priority": "HIGH",
                "id": "qai13-naming-collision",
                "status": "DOCUMENTED — applies during Phase 1 audit + Phase 3 precompute",
                "summary": (
                    "NAMING COLLISION LANDMINE: `q_ai13` is a SINGLE GLOBAL ITEM (5-pt "
                    "excitement about mixed reality, W2-W6) — it is completely distinct from "
                    "`q_ai13_1` through `q_ai13_7`, which are the per-AI-tool HARMFULNESS "
                    "RATING batteries. Cleaning code MUST handle them as separate variables "
                    "— do not regex-match `q_ai13` and accidentally pick up the q_ai13_N "
                    "batteries. Audit phase will flag any place existing cleaning code uses "
                    "pattern matching on `q_ai13.*` or similar."
                ),
            },
            {
                "priority": "HIGH",
                "id": "ls002-truncation-verification",
                "status": "VERIFIED — FALSE ALARM 2026-05-24",
                "summary": (
                    "Confirmed: ls002a, ls002b, ls002e, ls002f columns ARE present in all 6 "
                    "raw CSVs including W5 (uas518) and W6 (uas519). The empty elseif branches "
                    "in those PDFs are a rendering artifact, NOT a data absence. waves_present "
                    "for all 12 ls002 items reverted to [1,2,3,4,5,6]. change_notes updated to "
                    "document this resolution."
                ),
            },
            {
                "priority": "HIGH",
                "id": "political-vars-w4-w6-data-gap",
                "status": "DISCOVERED 2026-05-24 — REAL DATA LIMITATION",
                "summary": (
                    "regis, partyreg, party_affil, lean_affil columns are present in raw CSVs "
                    "for W1-W3 only — completely absent from W4, W5, W6 raw CSVs. Their "
                    "preload_* counterparts (preload_regis, preload_party_affil, etc.) also "
                    "stop after W3. transform_data.R's `if (all(c('preload_party_affil', "
                    "'preload_lean_affil') %in% colnames(data)))` correctly returns NA for "
                    "pol_incl_leaners in W4-W6 — this is not a code bug but a real data "
                    "limitation. Implication: wave-over-wave political affiliation analyses "
                    "must be restricted to W1-W3 or use cross-wave joins on uasid to carry "
                    "the earlier-wave value forward as a static covariate. waves_present for "
                    "these 4 variables updated to [1,2,3]. rate_self and scim_* are present "
                    "in all 6 waves (those are asked fresh in every wave, not preloaded)."
                ),
            },
            {
                "priority": "MEDIUM",
                "id": "raw-data-column-naming-convention",
                "status": "VERIFIED 2026-05-24 — patterns more varied than initially documented",
                "summary": (
                    "Phase 1 verified the raw CSV column-name conventions for platform- and "
                    "use-case-indexed batteries: us001 is exploded into us001s1..us001s23 "
                    "(one binary flag per platform/code in the multiselect). us002, us003, "
                    "us007, us010, us012 are exploded as `us00X_<platform_id>_` (note trailing "
                    "underscore). us004, us005, us008, us016 are double-exploded into "
                    "`us00X_<platform_id>_s<option>`. us018a-g exploded as us018a_1..us018a_23 "
                    "per platform. us019_hours/_minutes exploded similarly. us025/us026 (W6) "
                    "use both forms. q_ai8a_N multiselects exploded as q_ai8a_Ns1..q_ai8a_Ns14. "
                    "q_ai11_N and q_ai13_N batteries stored as q_ai11_Na..q_ai11_Nn. The "
                    "dictionary continues to represent these as single LOGICAL rows; Phase 3 "
                    "precompute must use this verified expansion pattern."
                ),
            },
            {
                "priority": "MEDIUM",
                "id": "weighting-variable",
                "status": "VERIFIED 2026-05-24 — present in all 6 raw CSVs",
                "summary": (
                    "Confirmed: final_weight column present in all 6 raw CSVs. uasid present "
                    "in all 6. Phase 3 precompute pipeline must use final_weight for weighted "
                    "estimates and uasid for cross-wave joins (especially relevant for "
                    "carrying W1-W3 political affiliation forward into W4-W6 analyses)."
                ),
            },
            {
                "priority": "MEDIUM",
                "id": "free-text-storage-location",
                "status": "DISCOVERED 2026-05-24",
                "summary": (
                    "cs_003, us015, us006, us009, us011, us013, us017, ai_used_exp, "
                    "ai_other_concerns, ai_ideas, q_ai10_N, q_ai12_N, and other free-text "
                    "fields documented in the dictionary do NOT appear in the main uas51X.csv "
                    "files. Per process_text_data.R they are stored in separately PII-scrubbed "
                    "per-question files under data/text/uasNNN_<qnum> - c.csv. These are "
                    "qualitative resources, out of scope for the numeric/categorical Phase 3 "
                    "precompute, but flagged in each row's `notes`."
                ),
            },
            {
                "priority": "MEDIUM",
                "id": "battery-expansion-pattern",
                "status": "DOCUMENTED — applies during Phase 3 precompute",
                "summary": (
                    "q_ai11_N and q_ai13_N rows in the dictionary represent USE-CASE-INDEXED "
                    "batteries (one row each) rather than the individual sub-items (a-n or "
                    "a-m). Phase 3 precompute code must expand each parent into its 14 (or 13 "
                    "for the XR variant q_ai*_7) sub-items at runtime, conditional on the "
                    "response set in the corresponding q_ai8a_N multiselect."
                ),
            },
        ],
    },
    "platforms": PLATFORMS_W6,
    "platforms_by_wave": {
        "1": PLATFORM_CODES_W1,
        "2": PLATFORM_CODES_W25,
        "3": PLATFORM_CODES_W25,
        "4": PLATFORM_CODES_W25,
        "5": PLATFORM_CODES_W25,
        "6": PLATFORM_CODES_W6,
    },
    "social_platforms_for_sc001_gate": {
        "1": SOCIAL_GATE_W1,
        "2": SOCIAL_GATE_W2PLUS,
        "_note": (
            "sc001 (and ex001/ex002 in W2) are gated on `asksocial=1`, which is set when the "
            "respondent reports using at least one platform in this list. sc001 was NOT asked in "
            "W3-W6 even though the asksocial gate is computed in those waves (for other purposes)."
        ),
    },
    "waves": {
        "1": "UAS514", "2": "UAS515", "3": "UAS516",
        "4": "UAS517", "5": "UAS518", "6": "UAS519",
    },
    "domains": [
        "PLATFORM_USE", "WELLBEING", "LONELINESS", "DEPRESSION_ANXIETY",
        "POLITICAL", "AI_ATTITUDES", "TECH_REGULATION", "DEMOGRAPHICS",
        "SOCIAL_MEDIA_BELIEFS", "TECH_IDENTITY", "INSTITUTIONAL_TRUST",
        "SURVEY_QUALITY",
    ],
    "response_types": [
        "BINARY_YESNO",
        "LIKERT_3",
        "LIKERT_4",
        "LIKERT_5",
        "LIKERT_6",
        "LIKERT_6_NOMID",
        "LIKERT_7",
        "SCALE_0_100",
        "SCALE_0_10",
        "MULTISELECT",
        "SINGLE_SELECT_CATEGORICAL",
        "RANGE_NUMERIC",
        "STRING_OPEN",
    ],
    "_response_type_glossary": {
        "BINARY_YESNO":                "2 codes: 1=Yes, 2=No.",
        "LIKERT_3":                    "3-point ordinal (e.g., Hardly ever / Some / Often).",
        "LIKERT_4":                    "4-point ordinal (e.g., DASS Never/Sometimes/Often/Almost always).",
        "LIKERT_5":                    "5-point ordinal (Strongly disagree...Strongly agree, or domain-specific variants — see response_options per row).",
        "LIKERT_6":                    "6-point ordinal with a non-use sentinel or domain-specific spacing (e.g., us002 frequency).",
        "LIKERT_6_NOMID":              "6-point forced-choice Likert with NO neutral midpoint (e.g., te001).",
        "LIKERT_7":                    "7-point ordinal (Strongly disagree...Strongly agree).",
        "SCALE_0_100":                 "Numeric slider 0-100 (e.g., political ideology).",
        "SCALE_0_10":                  "Numeric slider 0-10 (SCIM thermometer / friends-comfort items).",
        "MULTISELECT":                 "Check all that apply — response stored as a set of codes.",
        "SINGLE_SELECT_CATEGORICAL":   "Single-select from a categorical list (no ordering implied) — e.g., state, party affiliation.",
        "RANGE_NUMERIC":               "Bounded integer input (e.g., us019_hours 0-24, us019_minutes 0-60).",
        "STRING_OPEN":                 "Open-text response, typically PII-redacted by instruction.",
    },
    "variables": variables,
}

# ---------------------------------------------------------------------------
# Emit JSON and CSV
# ---------------------------------------------------------------------------

repo_root = Path(__file__).resolve().parent.parent
docs_dir = repo_root / "docs"
docs_dir.mkdir(exist_ok=True)

json_path = docs_dir / "data-dictionary.json"
csv_path = docs_dir / "data-dictionary.csv"

with json_path.open("w", encoding="utf-8") as f:
    json.dump(dictionary, f, indent=2, ensure_ascii=False)
    f.write("\n")

# CSV columns (16 total)
CSV_COLUMNS = [
    "variable_name", "construct", "domain", "question_text", "response_type",
    "response_options", "out_of_range_codes", "is_reverse_coded",
    "waves_present", "is_platform_indexed", "platform_codes_applicable",
    "wording_changed_across_waves", "coding_changed_across_waves",
    "change_notes", "clean_variable_name", "notes",
]

def csv_format_response_options(opts: dict | None) -> str:
    if not opts:
        return ""
    # Pipe-separated code|label pairs, matching the format used in the Wave 1 sample
    parts = []
    for code, label in opts.items():
        parts.append(str(code))
        parts.append(label)
    return "|".join(parts)

def csv_format_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, list):
        return ",".join(str(v) for v in value)
    return str(value)

with csv_path.open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, quoting=csv.QUOTE_ALL)
    writer.writeheader()
    for v in variables:
        row = {
            "variable_name":                  v["variable_name"],
            "construct":                      v["construct"],
            "domain":                         v["domain"],
            "question_text":                  v["question_text"],
            "response_type":                  v["response_type"],
            "response_options":               csv_format_response_options(v["response_options"]),
            "out_of_range_codes":             csv_format_value(v["out_of_range_codes"]),
            "is_reverse_coded":               csv_format_value(v["is_reverse_coded"]),
            "waves_present":                  csv_format_value(v["waves_present"]),
            "is_platform_indexed":            csv_format_value(v["is_platform_indexed"]),
            "platform_codes_applicable":      csv_format_value(v["platform_codes_applicable"]),
            "wording_changed_across_waves":   csv_format_value(v["wording_changed_across_waves"]),
            "coding_changed_across_waves":    csv_format_value(v["coding_changed_across_waves"]),
            "change_notes":                   csv_format_value(v["change_notes"]),
            "clean_variable_name":            v["clean_variable_name"],
            "notes":                          csv_format_value(v["notes"]),
        }
        writer.writerow(row)

# Internal consistency checks
names = [v["variable_name"] for v in variables]
dup = sorted({n for n in names if names.count(n) > 1})
if dup:
    raise SystemExit(f"FAIL: duplicate variable_name(s): {dup}")
clean_names = [v["clean_variable_name"] for v in variables if v["clean_variable_name"]]
clean_dup = sorted({n for n in clean_names if clean_names.count(n) > 1})
if clean_dup:
    raise SystemExit(f"FAIL: duplicate clean_variable_name(s): {clean_dup}")
for v in variables:
    for w in v["waves_present"]:
        if w not in (1, 2, 3, 4, 5, 6):
            raise SystemExit(f"FAIL: bad wave {w} in {v['variable_name']}")
    if v["response_type"] not in dictionary["response_types"]:
        raise SystemExit(f"FAIL: unknown response_type {v['response_type']!r} in {v['variable_name']}")
    if v["domain"] not in dictionary["domains"]:
        raise SystemExit(f"FAIL: unknown domain {v['domain']!r} in {v['variable_name']}")

print(f"OK — {len(variables)} variables; JSON {json_path}; CSV {csv_path}")
