# WildStat project guidance

## Visual QA ownership

- The user performs visual testing and subjective art/layout review.

## Verification preferences

- After pushing a requested release, do not wait for hosted builds to go live; the user will report deployment issues. Relevant pre-push checks still apply.

## File manageability

- Keep the 1,000-line browser-facing facade guard: it limits agent context/token usage and keeps the composition layer manageable. Prefer extracting focused modules over compressing formatting or deleting useful comments to meet it.

Before asking the user clarifying questions, you should complete the work that is already authorized from context and necessary to make the proposed action concrete and reviewable. The user should be approving a concrete, reviewable result. For example, before deploying a change, writing to an external application, merging a PR or publishing a site, do all the required work first so that user approval is the final step. You don't need user permission for reversible tasks, read-only actions, reviews or fixes, or anything for which authorization is provided earlier in the session or strongly implied from the task instruction.

Do not introduce unsolicited warnings, disclaimers, approval flows, or safety/compliance checklists due to hypothetical risk.
