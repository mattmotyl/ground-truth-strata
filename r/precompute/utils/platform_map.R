# UAS platform-code lookups.
#
# Two parallel named character vectors, both keyed by the same UAS
# platform ID (as a string, "1" through "23"):
#
#   platform_slug  — snake_case codes used as backend column-name
#                    segments. Consumed by rename_variables() and
#                    process_text_data() to build column names like
#                    `uses_facebook_w1`, `habit_auto_twitter_x_w4`,
#                    `mcxn_dating_apps_w3`. Safe for use as JSON keys,
#                    bare-name dplyr selection, and Phase 3 precompute
#                    file names.
#
#   platform_label — original human-readable display labels. Preserve
#                    exactly as the survey presented them (e.g.,
#                    "X (Twitter)", "Dating Apps", "Something else").
#                    Use this at display time in the Next.js UI,
#                    report tables, plots — anywhere the user sees
#                    the platform name.
#
# Adding a new platform: add an entry in BOTH vectors with the same
# numeric key. Both vectors must stay in lockstep.
#
# Ordering: double-digit keys are listed before single-digit keys.
# This ordering is a defensive carry-over from older consumers that
# did `gsub("(\\d+)", platform_map[\\1], ...)` style replacements (so
# "12" wouldn't get rewritten as "Pinterest" then "1" -> "Facebook"
# eating the leading 1). The current callers use anchored regex with
# explicit underscore separators so the ordering is no longer load-
# bearing, but keeping it minimizes the diff for review.

platform_slug <- c(
  "10" = "mastodon",
  "11" = "linkedin",
  "12" = "pinterest",
  "13" = "dating_apps",
  "14" = "facetime",
  "15" = "text_messaging",
  "16" = "online_gaming",
  "17" = "twitch",
  "18" = "nextdoor",
  "19" = "discord",
  "20" = "something_else",
  "21" = "none",
  "22" = "threads",
  "23" = "bluesky",
  "1"  = "facebook",
  "2"  = "twitter_x",
  "3"  = "instagram",
  "4"  = "tiktok",
  "5"  = "snapchat",
  "6"  = "youtube",
  "7"  = "reddit",
  "8"  = "whatsapp",
  "9"  = "email"
)

platform_label <- c(
  "10" = "Mastodon",
  "11" = "LinkedIn",
  "12" = "Pinterest",
  "13" = "Dating Apps",
  "14" = "Facetime",
  "15" = "Text Messaging",
  "16" = "Online Gaming",
  "17" = "Twitch",
  "18" = "Nextdoor",
  "19" = "Discord",
  "20" = "Something else",
  "21" = "None",
  "22" = "Threads",
  "23" = "Bluesky",
  "1"  = "Facebook",
  "2"  = "X (Twitter)",
  "3"  = "Instagram",
  "4"  = "TikTok",
  "5"  = "Snapchat",
  "6"  = "YouTube",
  "7"  = "Reddit",
  "8"  = "WhatsApp",
  "9"  = "Email"
)

# Sanity check: keys must match exactly. Fail loud at source-time if
# someone adds/removes a key in one vector and forgets the other.
stopifnot(identical(sort(names(platform_slug)), sort(names(platform_label))))
