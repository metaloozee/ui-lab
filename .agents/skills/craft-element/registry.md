# The registry

Fluid Functionalism supplies parts this lab can install and own. Docs and live demos are at `https://www.fluidfunctionalism.com/docs/<name>`.

## Installing

```bash
vp dlx shadcn@latest add @fluid/base/<name>   # When a Base UI flavor exists
vp dlx shadcn@latest add @fluid/<name>        # Single-source items
```

1. Check what's already in `src/components/ui`, `src/components`, `src/hooks`, and `src/lib`. An install pulls in its dependencies, which can collide with our edited copies.
2. Install without `--overwrite`, because our copies carry edits. If the CLI stops to ask about a file, compare it and decide file by file.
3. Rename its tokens to the roles in `src/index.css`. `vp check` lists every stock name left.
4. Read the installed source before composing with it, since its comments hold the reasons.

Upstream changes are at `https://www.fluidfunctionalism.com/changelog.md`. To compare a file with upstream, read `https://www.fluidfunctionalism.com/r/base/<name>.json`. A difference is often our own edit, so show it to the owner before replacing anything.

## What's available

Names with a Base UI flavor install as `@fluid/base/<name>`. Those marked `*` are single-source.

| Need               | Items                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Actions and status | `button`, `badge`\*, `banner`\*, `tooltip`                                                                        |
| Text input         | `input-group`\*, `input-copy`, `input-message`                                                                    |
| Choosing           | `select`, `combobox`, `dropdown`, `checkbox-group`, `radio-group`, `switch`, `slider`, `tabs`                     |
| Dates and color    | `calendar`, `date-picker`, `color-picker`                                                                         |
| Finding            | `command-menu`                                                                                                    |
| Showing data       | `table`\*, `card`\*, `carousel-dots`\*, `file-thumbnail`\*                                                        |
| Structure          | `accordion`, `dialog`, `sidebar`, `mobile-drawer`, `scroll-area`                                                  |
| Stepped questions  | `ask-user-questions`                                                                                              |
| Chat and AI        | `chat-message`\*, `thinking-indicator`\*, `thinking-steps`, `queued-stack`                                        |
| Whole blocks       | `sidebar-app`, `dialog-sidebar`                                                                                   |
| Systems and hooks  | `use-fluid-hover`\*, `springs`\*, `reveal`\*, `size-context`\*, `elevated`\*, `typography`\*, `use-merge-split`\* |

A registry part that would become the element's own subject is rewritten against the system, rather than installed and restyled.
