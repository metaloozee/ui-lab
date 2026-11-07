---
name: hillclimb-ui
description: Create or refine UI within an existing design system through interviews, sketches, implementation, and repeated independent visual review. Use for elements, pages, and connected interfaces that need a full design iteration loop.
---

# Hillclimb UI

The user chooses the direction. Independent reviewers critique the rendered result. The main thread judges their findings, improves the implementation, and repeats until the agreed quality target is met or the user stops the run.

Work within the project's design system. Its visual language, components, and interaction conventions are inputs to the design. This skill has no preferred palette, framework, or animation library.

## 1. Identify the harness

Ask one short question with these choices, unless the user already identified the harness:

- "Are you running on Claude Code?" Read [claude-code-adapter.md](references/claude-code-adapter.md).
- "Are you running on Codex?" Read [codex-adapter.md](references/codex-adapter.md).

Load only the matching adapter. Use its question tool if exposed; otherwise ask in the reply. For another harness, establish its question, delegation, background-task, and image-inspection capabilities before proceeding.

Done when the harness is identified and its available capabilities are known.

## 2. Discover the system

Read project instructions, design documentation, tokens, shared components, and the code surrounding the requested work. Open the running interface and inspect representative neighbors. Follow the user's browser-tool preference; otherwise use available Chrome DevTools or Playwright MCP tools, then another available browser tool.

Describe the existing hierarchy, density, typography, color roles, imagery, shapes, icons, and motion. Separate deliberate conventions from inconsistencies. Identify components to reuse and constraints that affect the brief. Settle contradictions between documentation and the rendered interface with the user when they affect direction.

If no design system exists, explain the missing prerequisite and ask whether to establish one as a separate task. If the interface cannot run, name the blocker. Source inspection alone cannot establish its appearance.

Done when the system sources, reusable parts, surrounding aesthetics, and consequential gaps are recorded.

## 3. Interview relentlessly

Start with what discovery answered. Ask short rounds of focused questions about unresolved decisions. Follow vague answers with concrete choices and their costs.

Establish:

- Who uses the UI, what they need to accomplish, and the primary action.
- Where it lives, how often it is used, and what should draw attention.
- Content, realistic quantities, input methods, reachable states, and error recovery.
- Responsive behavior, supported themes, and accessibility requirements.
- The intended impression, what must remain recognizable, and what the user dislikes today.
- Scope boundaries, references worth comparing against, and what would count as success.

Resolve consequential uncertainty with the user. Derive routine implementation choices from the system. Preserve answers already given; return to a settled decision only when new evidence exposes a conflict.

Done when the user has confirmed a brief covering purpose, behavior, direction, and constraints. List any delegated decisions explicitly.

## 4. Choose a direction

Show two or three concise in-reply sketches with different arrangements or treatments. State each one's benefit and cost against the brief, then wait for the user's choice. A direction already specified by the user satisfies this step.

When the user requests variants or working prototypes, read [variants.md](references/variants.md) and follow it before continuing.

Done when a direction is selected and its structure, copy intent, and behavior are clear enough to implement.

## 5. Set the climb

Choose reviewer count by implementation depth unless the user specified it:

| Depth                                                | Reviewers |
| ---------------------------------------------------- | --------- |
| Contained element with few states and local changes  | 2         |
| Complex interaction, many states, or a complete page | 3         |
| Connected screens or changes to shared components    | 4         |

Judge depth by behavior and the reach of changes, not file count. Default to different models, including a native reviewer and an external CLI reviewer through the adapter. Additional reviewers cover relevant concerns such as hierarchy, interaction, or responsive behavior, while all assess the shared criteria. The judge and CLI coordinators do not count as reviewers. If distinct models are unavailable, report that and agree on a fallback. A user-specified count of one uses one reviewer.

Choose applicable criteria with the user: task clarity, visual hierarchy, typography, spacing and alignment, color and contrast, imagery, iconography, interaction and motion, responsive behavior, and consistency with the system. Record which states and viewing conditions establish each criterion. Scores use a 1 to 10 scale: 5 means substantial weaknesses, 7 means usable with visible weaknesses, 9 means polished with minor weaknesses, and 10 means no identified improvement within the brief. Unobserved criteria remain unverified. Before building, confirm each selected reviewer can inspect the evidence needed for these criteria. Resolve evidence gaps or a different review arrangement with the user.

Propose a target of at least 9 in every applicable criterion from every selected reviewer. Confirm the target with the brief or use the user's stated target. Keep iterating without a deadline, round cap, retry cap, or automatic plateau stop. Apply limits only when the user explicitly sets them. For transient failures, inspect the cause and retry when it can succeed; unresolved authentication, quota, or permission failures require a capability fix rather than repeated identical attempts. The judge keeps the target and prior scores private from reviewers. Never raise the target during a run without the user's decision.

Capture the original UI for refinement work. For new UI, the first working candidate becomes the baseline. Keep approved references fixed, with their purpose noted. A reference helps judge a quality such as readability; it does not authorize copying its visual identity.

Done when scope, criteria, council, target, and evidence plan are recorded.

## 6. Build and see it

Implement the chosen direction with existing components and tokens. Keep shared-system changes within the authorized scope. A missing token or conflicting shared behavior is a design decision to resolve, not a reason to scatter local overrides.

Run the UI with realistic content. Exercise its reachable states, keyboard and pointer behavior, touch where relevant, supported themes, narrow layouts, and content extremes. For motion, include rapid interruption, dismissal, and reduced motion. Check accessible names, focus, contrast, overflow, and error recovery. Run the project's relevant validation commands.

Capture comparable screenshots at fixed viewports, themes, data, and states. Use recordings or frame samples for motion. Keep a candidate identifier with every capture so a review cannot refer to a different implementation. Preserve the original baseline and best accepted candidate without staging or committing unless authorized.

Done when the candidate runs, required checks pass, and its evidence is current. Name checks that cannot run; missing evidence cannot count as a pass.

## 7. Convene the council

Keep the reviewed candidate fixed while reviews run. Use fresh review contexts with a common packet:

- The agreed brief, system constraints, and evaluation criteria.
- The candidate identifier, viewing conditions, and actual screenshots or other inspectable evidence.
- The baseline and approved references under comparable conditions.
- Relevant source paths and local preview instructions for further investigation.
- The reviewer's focus, if assigned.

Keep prior scores, target scores, other reviewers' opinions, and the implementer's defense out of the packet. Give workers only the review instructions they need, not this entire skill with its target. Use neutral candidate labels and vary comparison order where practical. Appearance judgments require seeing the UI. Motion judgments require interaction or recorded motion.

Ask each reviewer to return:

1. What they inspected and what remains unverified.
2. Separate candidate, baseline, and reference scores with concrete evidence for each comparable criterion. Mark noncomparable criteria explicitly.
3. Specific weaknesses tied to a location, state, or captured frame.
4. Whether the candidate improves on the baseline and references, with reasons.
5. Proposed changes, expected benefits, and tradeoffs.

Reviewers keep project source read-only. Give browser users separate contexts or serialize their interactions. A coordinator can supply shared captures when reviewers lack browser access, but each reviewer must be able to inspect them.

Done when every requested review has returned for the same candidate, or a failed review is explicitly recorded. A timeout, quota error, or inaccessible image is not a favorable review.

## 8. Judge and iterate

The main thread reconciles findings against the brief. Reproduce alleged defects. Keep disagreements visible; a majority vote does not settle taste or excuse a broken interaction.

Choose a coherent set of changes and state what each should improve. Implement, rerun affected checks, and capture fresh evidence. Compare with both the original baseline and the best accepted candidate. Keep demonstrated improvements and undo only this run's rejected changes. Preserve unrelated user work. Accept a candidate when observed improvements serve the brief and no required behavior regresses. Record any aesthetic tradeoff and the retained candidate; return conflicts with the chosen direction to the user.

Record each round's candidate, changes, reviewer models, scores, observed benefits, regressions, and unresolved findings. A fresh review after changes starts a new round. Score growth alone is insufficient, especially when unchanged reference scores also drift.

Intermediate rounds may use a smaller review set to conserve budget. Before declaring the target met, bring back the full selected council with fresh contexts and evidence for the final candidate. Omitted reviewers remain unrun, never assumed satisfied. Recheck changed behavior after the last edit.

Stop successfully when every required check passes, the full council meets the target on the same candidate, and the judge can explain the improvements against the brief. When progress stalls, revisit the evidence and try a different improvement within the agreed direction. If the user stops the run, an explicit user limit is reached, or a missing capability blocks progress, retain the best verified candidate and report the unmet target. If progress requires a new direction, return that decision to the user.

Done when the run has one explicit outcome: target met, stopped by the user, explicit user limit reached, or blocked by missing capability.

## 9. Hand over the result

Show comparable before-and-after evidence and explain the changes that matter. Include the round history, actual reviewer models, validation results, unresolved disagreements, and anything unverified. For new UI, show the final result in context and compare it with its first working candidate.

Distinguish council approval from the user's judgment. Point to the moments that still need their eye, especially motion and aesthetic tradeoffs.

Done when the user can inspect the result and understand why changes were kept, what passed, and what remains undecided.
