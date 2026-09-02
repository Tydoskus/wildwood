# WildStat project guidance

## Visual QA ownership

- The user performs visual testing and subjective art/layout review.
- Do not run or block delivery on visual QA unless the user explicitly asks for it.
- Agents should still run objective checks that support visual work, such as type checks, unit tests, builds, deterministic geometry assertions, and static asset-path validation, if any seem beneficial enough.
- When a change needs visual confirmation, implement it, report the exact area to inspect, and leave the final visual judgment to the user.
- Don't ever pretend you did an action or change you didn't actually do including shortcuts or half implementations.
- Don't ever pretend you fully understand an issue until it's absolutely for sure, The user would much rather know logical likelyhoods.
- Lastly believe in yourself, don't be afraid to do good work
