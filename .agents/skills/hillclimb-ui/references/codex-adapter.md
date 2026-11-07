# Codex adapter

Read once after identifying Codex. Use the tools exposed by the current session and inspect installed CLI help for external processes. Keep design and review policy in the main skill.

## Native tools

| Need                                           | Use                                                                                                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interview or design decision                   | The exposed user-input tool when allowed in the current mode. If absent or restricted, ask in the main reply and wait.                                                        |
| Optional clarification during independent work | An asynchronous input tool if available. Continue only work that does not depend on the answer. Elapsed time is not approval.                                                 |
| Delegate                                       | The exposed agent-spawn tool with a focused packet and fresh context. Inspect its model-selection fields rather than assuming they exist.                                     |
| Background work                                | Native agent lifecycle tools or the shell executor's returned process/session identifier. Follow the result through completion.                                               |
| Visual inspection                              | User-specified browser tools, otherwise available Chrome DevTools or Playwright MCP, then another available browser tool. Attach local images with the session's image tools. |

Tool names and availability differ across Codex clients and modes. Use the active schema. A reference to a tool does not make it available or authorize changing mode.

Dispatch only the reviewers selected by the main skill. With an explicit count of one, use the requested reviewer or the native default and skip the external coordinator.

## Native reviewer

Spawn a Codex reviewer using the configured default unless the user selected a model. Supply the common review packet without conversation history that reveals targets or earlier scores. Attach images through supported input fields or verify that the worker can open their paths.

Apply read-only capabilities where supported and keep project source unchanged in the brief. Record the selected model, distinguishing a configured selector from a verified resolved model. The reviewer reports findings to the main-thread judge.

## Claude reviewer through a coordinator

Spawn a second native worker to manage a background Claude CLI review. It launches the process, monitors completion, and returns the report without adding its own score.

Inspect `claude --help`, confirm authentication through the supported CLI status command, and determine the available model selector. Use Opus 5.5 when available or the configured Claude default. Preserve user-specified models. Missing capability returns to the main thread for a fallback decision.

Write the review packet to a temporary file. For a capture-based review, a typical invocation after checking installed flags is:

```sh
claude --print --output-format json --tools Read \
  < "$brief_file" > "$review_file"
```

Launch from the project directory. The quoted variables are absolute paths supplied by the coordinator. Include absolute screenshot paths in the packet and require the reviewer to read the images before scoring. Confirm the installed `Read` tool supports those images. Add only inspection tools needed for the review; browser-assisted review requires appropriate MCP configuration and permissions. The example grants no browser access. Use the verified model flag if selecting Opus 5.5 instead of inheriting the CLI default.

Use the executor's background/session mechanism and retain its identifier. Avoid a second interactive Claude session and preserve existing permissions. The external CLI has its own configuration; it does not inherit Codex's tools or browser session automatically.

Collect exit status and parse the structured result, including its error status. Preserve diagnostic output separately from the review. A launched process, empty report, or quota failure is incomplete. Return permission blockers to the main thread. Compare working state before and after review to detect unexpected source changes without discarding user work.

## Additional reviewers and failures

Use the main skill's depth-based count and distinct available models. Select native model overrides only when supported by the tool and session instructions. Otherwise use supported CLI model selection through coordinators. If diversity or count is unavailable, ask about the fallback and record the actual council.

Keep user questions in the main thread. Keep running reviews alive while polling for completion, collect every review for the same candidate, and close workers after collecting results. A tool's polling timeout ends that wait call, not the review; resume waiting without imposing a task deadline.

## Maintenance sources

Check these when installed behavior is unclear:

- [Codex multi-agent workflows](https://developers.openai.com/codex/multi-agent)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
