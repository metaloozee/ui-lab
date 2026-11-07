# Claude Code adapter

Read once after identifying Claude Code. Current tool schemas and installed CLI help take precedence over examples here. Keep design and review policy in the main skill.

## Native tools

| Need                         | Use                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interview or design decision | `AskUserQuestion` when exposed. Otherwise ask in the main reply and wait. Noninteractive workers return questions to the parent.                                      |
| Delegate                     | The exposed `Agent` tool with a supported agent type and model. Give reviewers a fresh brief rather than a fork containing scores or targets.                         |
| Background work              | The session's background agent or shell-task mechanism. Follow its returned task identifier through completion.                                                       |
| Progress                     | `TodoWrite` if exposed, otherwise a concise phase list in the main thread.                                                                                            |
| Visual inspection            | User-specified browser tools, otherwise available Chrome DevTools or Playwright MCP, then another available browser tool. Confirm what each worker actually inherits. |

Use only fields supported by the active schema. Background defaults, model aliases, resume behavior, and MCP access can vary between versions. Avoid guessing them from another harness's field names.

Dispatch only the reviewers selected by the main skill. With an explicit count of one, use the requested reviewer or the native default and skip the external coordinator.

## Native reviewer

Honor a user-selected model first. Otherwise spawn a Claude reviewer on Opus 5.5 when available, or the configured harness default. Resolve the accepted selector from the session; the `opus` alias alone does not prove a particular version. Record the resolved model when exposed, otherwise record the selector and uncertainty.

Use a worker with the image and inspection capabilities the review needs. Restrict edits through available permissions and explicitly keep project source read-only. An Explore worker fits only if its actual capabilities satisfy the review. A read-only instruction alone is not filesystem enforcement.

Return findings to the main thread. The reviewer does not interview the user, edit the candidate, or choose the final direction.

## Codex reviewer through a coordinator

Spawn a separate Claude worker to manage a background `codex` CLI review. Its task is launch, wait, check, and return. The Codex process supplies the independent review; the coordinator supplies no extra vote.

Inspect `codex exec --help`, confirm authentication through the supported CLI status command, and resolve any requested model. Preserve the configured Codex model when none was specified. Missing authentication or executable returns to the main thread for a fallback decision.

Write the review packet to a temporary file with a file tool. Pass it through stdin and attach captured images. A typical invocation, after checking the installed flags, is:

```sh
codex exec --sandbox read-only --cd "$project_dir" \
  --image "$candidate_image" \
  --output-last-message "$review_file" - < "$brief_file"
```

The quoted variables are absolute paths supplied by the coordinator. Include baseline and reference images with the syntax accepted by the installed version. Use `--model` only for a resolved selection. Execute through the background-task facility and retain its identifier. Keep existing approval boundaries; never add bypass flags to make an unattended review finish.

The child CLI has its own configuration and MCP availability. Confirm image access and supply all necessary context explicitly. It does not automatically inherit the parent's browser session. If it cannot operate the preview, provide captured evidence and mark interaction-only criteria unverified.

Collect exit status, the final report, and relevant errors. An empty file or still-running task is incomplete. If blocked on permission, return the exact action to the main thread. Check for unexpected source changes against the pre-review working state and report them without discarding user work.

## Additional reviewers and failures

Use the main skill's depth-based count. Choose distinct available models for additional reviewers, with relevant focus areas. Confirm availability before dispatch. If diversity or count cannot be met, ask about the reduced council rather than silently substituting.

Keep questions and permissions in the main thread. Keep running reviews alive while polling for completion, report failed reviewers separately, and close completed workers after collecting results. A tool's polling timeout ends that wait call, not the review; resume waiting without imposing a task deadline.

## Maintenance sources

Check these when installed behavior is unclear:

- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Codex noninteractive mode](https://developers.openai.com/codex/noninteractive)
