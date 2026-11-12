---
description: Save a Claude Code conversation as a clean, verbatim Markdown transcript, with only the prompts and replies and none of the tool calls or system output. Works on the current conversation directly (no /export needed), on a past session by ID, or on a raw `/export` dump (a .txt beginning with the ▐▛███ banner, named like `2026-10-22-002808-<slug>.txt`). Invoke for "/export-to-markdown", "save this conversation as markdown", "convert this Claude Code dump".
---

# /export-to-markdown [dump.txt | session ID] [title]

The converter is `conversations/export_to_markdown.py`. It keeps the user's prompts and Claude's prose replies word for word, plus any answers given through AskUserQuestion. It drops everything else: tool calls and their output, collapsed tool summaries ("Read 2 files (ctrl+o to expand)"), status lines ("✻ Churned for 7m 38s"), recaps, built-in slash commands such as /model and /export, and system-injected messages (skill bodies, subagent hand-backs, task notifications). A slash command for one of our skills (such as `/writeup ...`) counts as something the user said, so it is kept. Consecutive replies within a turn, such as "I'll read the paper first" before the tool calls and the answer after them, are joined into one Assistant section. Each paragraph and list item comes out as a single line, in document style, with no wrapping at the terminal width.

This is a verbatim transcript. Don't summarize it or tidy the prose; for a summary, use /save-conversation instead.

## Which conversation

- **This conversation (the default, and the common case).** Jasper does not need to run /export first. Claude can't run built-in commands like /export anyway, and doesn't need to: Claude Code writes every session to a log at `~/.claude/projects/<project>/<session ID>.jsonl`, and the script reads the running session's log, found through `$CLAUDE_CODE_SESSION_ID`. That log holds the original markdown, so the output is lossless. The script leaves out the final prompt (the request to convert) and the reply in progress. If that final prompt also asked for other work that belongs in the record, do the work first and pass `--keep-last`.
- **A past session.** Pass `--session <ID>`. To find an ID, run `python3 conversations/parse_transcripts.py` and look it up in `conversations/claude-code-transcripts/INDEX.md`. Logs only cover this machine, and Claude Code prunes them after about 30 days.
- **An `/export` dump** that Jasper hands over, for example from another machine or from a session whose log is gone. Pass the `.txt` path. See "Dumps" below.

## Steps

1. Choose a short descriptive title, such as the conversation's main claim or question. A title taken from the first prompt line is usually bad, and so is a dump's filename slug, which often comes from a `/model` caveat. Without `--title`, the script uses the session's auto-generated title when there is a log.
2. Run it from the repo root, with one of:
   ```
   python3 conversations/export_to_markdown.py --title "<title>"                    # this conversation
   python3 conversations/export_to_markdown.py --session <ID> --title "<title>"
   python3 conversations/export_to_markdown.py <dump.txt> --title "<title>"
   ```
   The output is `<YYYY-MM-DD>-<title-slug>.md`, written next to the dump, or in `conversations/` when there is no dump. Pass `-o <path>` if Jasper wants it somewhere else.
3. Read the line it prints. `source: jsonl <path>` means the output came from a session log and is lossless. `source: txt` means it was reconstructed from a dump (see the limits below). Tell Jasper which one happened.
4. Open the output and compare it with the source in a few places, especially tables, code and any long list. If something is off, fix the script rather than hand-editing the output, and keep it working on the older dumps (listed below).
5. Leave any `.txt` dump in place unless Jasper says to delete it.

## Dumps

For a dump, the script first looks for the session's log. It searches `~/.claude/projects/**/*.jsonl` for a human prompt matching the dump's first prompt, follows the active branch of that log (the branch the user saw, ignoring rewound forks and crossing compactions), and cuts it to the span of prompts the dump covers. Use `--source txt` to skip the log, and `--jsonl <path>` to name a log yourself.

When there is no log, the script undoes the terminal render of the `.txt`. It joins lines the terminal soft-wrapped (a line was wrapped only if the next word wouldn't have fit), keeps the line breaks the user actually typed, rebuilds numbered and bulleted lists, re-assembles pipe tables whose rows wrapped, and turns `▎` quote bars back into `>`. The terminal render has already removed inline markdown, so bold, italics, inline-code backticks, heading markers and code fences cannot be recovered. Headings come out as plain one-line paragraphs. Indented code gets its fence back on a best guess; unindented code stays as plain lines. On the October 2026 dump, where the log still exists, this reconstruction matched the log word for word and line for line, apart from the lost bold and backticks.

Formats it has been tested on:

- v2.0.61 (`conversations/src/2025-12-08-...txt`): `>` prompts with unindented continuation lines, `●` replies, raw pipe tables mangled by wrapping.
- v2.1.63 (`fer/experiments/2026-03-01-...txt`): `❯` prompts padded to the terminal width, with backslash-Enter newlines.
- v2.1.170 (`conversations/2026-06-09-...txt`): wraps replies one column early.
- v2.1.306 (`conversations/2026-10-22-...txt`): list continuation lines indented under the item text.

When a new Claude Code version changes the render, add a case to the script and re-run all four dumps with `--source txt` to check that nothing regressed.
