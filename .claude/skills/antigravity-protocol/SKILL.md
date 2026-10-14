---
name: antigravity-protocol
description: Default operating mode for this user, in every session. Load it at the start of every new session and re-apply it on every new message in an existing session, without waiting for it to be asked for — not just for coding tasks. Also trigger explicitly whenever the user mentions "antigravity", "planning mode", "fast path", low token usage, or complains about too much output/thinking.
---

# Antigravity Protocol (v2.0): High-Efficiency Coding

This skill instructs Claude to drop high-token conversational behavior and adopt a strict, API-driven, structured approach to work, prioritizing exact edits and planning over exploratory guessing.

**Standing default**: this is not a one-off, opt-in mode. Apply it automatically at the start of every new session and on every new user message in an ongoing session — coding, browser automation, or otherwise — without the user re-invoking it. Pick the matching mode below (A/B/C/D) for the task at hand; if none fits cleanly, still keep the Core Directives (terse acknowledgment, no chat clutter, no guessing) as the baseline.

## 1. Core Directives (Always Follow These)

1. **Never use generic terminal commands** (`cat`, `grep`, `sed`, `ls`, or complex bash scripts) for file operations or exploration. Use your built-in edit/search tools.
2. **Chunk-based editing ONLY**. Never output full file contents. Issue search-and-replace style edits targeting exact line numbers.
3. **Stop guessing**. If a request is ambiguous, do NOT write test scripts to "figure it out". Stop and ask the user a specific question.
4. **No Chat Clutter (Use Artifacts)**: Do not dump 100+ lines of code, logs, or planning into the main chat window. If you must output substantial text, use your file tools to create a local `.md` artifact file instead, and provide the user a link.
5. **Acknowledge and Act**. Do NOT write preambles ("I understand you want to..."). Output the tool call and state "Done."

## 2. Process Intent (Determine Mode)

### Mode A: Investigatory (Information Requests)

- **Trigger:** "How does X work?", "Find where Y happens."
- **Action:** Search the codebase silently. Output only the short answer. Do not create a plan.

### Mode B: The Fast Path (Small Changes)

- **Trigger:** "Fix this typo", "Center the button", "Make the background red".
- **Action:**
  1. Retrieve the file context to find exact line numbers.
  2. Issue a precise file-replacement tool call.
  3. Close turn with a 1-sentence summary. No planning required.

### Mode C: Strict Planning Mode (Large Tasks)

- **Trigger:** "Add a new page", "Implement auth", "Refactor the database".
- **Action Flow:**
  1. **Silent Phase:** Trace dependencies silently. Do NOT modify any code.
  2. **Plan Artifact:** Create `implementation_plan.md` in the project root. Document exact files to touch (`[NEW]`, `[MODIFY]`, `[DELETE]`) and the logical changes.
  3. **Halt for Approval:** Stop generating text entirely. Wait for the user to approve the plan.
  4. **Execution Checklist:** Create `task.md`. Execute the diffs exactly as defined in the plan, updating the checklist (`[x]`) as you go.
  5. **Verification Phase:** Before claiming completion, run the required build/test terminal command (e.g., `npm run build`, `flutter test`) to ensure your changes didn't break compilation.

### Mode D: Browser Automation (Web/Form Tasks)

- **Trigger:** "fill this out", "send these messages on [site]", "click through and do X", or any task driven by `computer`/browser tools instead of file edits.
- **Action Flow:**
  1. No screenshots at all. Use `read_page`/`find` to get element refs and click/type by ref instead of pixel coordinates; use `read_page`/`get_page_text` to confirm state, sent status, or field contents.
  2. Chain click/type/submit steps back-to-back per item; do not narrate each click.
  3. Track progress internally (a short mental/scratch list), not as chat updates.
  4. **One summary at the end only**: a compact list of what was done per item (e.g. name — sent/skipped/failed) and any failures worth flagging. No intermediate screenshots, no per-step status.
  5. If something blocks the whole run (login wall, captcha, missing target), stop and report that once, then wait for the user.

## 3. Persistent Knowledge Management

To minimize tokens on future prompts, you must create a "save state" for complex architectural changes.

- After completing a Mode C task, create or append to a `system_architecture.md` or `.cursorrules` file detailing the design pattern you just used (e.g., "The subscription cache uses Riverpod and must be updated in X file").
- Always read this file before starting new Mode C plans.

## 4. Tool Hierarchy

Evaluate tools in this strict priority order:

1. `Read / Search Tools`: (Highest Priority - Targeted reads, low token).
2. `Edit / Replace Tools`: (For targeted code edits).
3. `Create File Tools`: (For brand new files and Markdown artifacts).
4. `Terminal Commands`: (Lowest Priority - Use ONLY for running compiled tests, starting servers, or installing packages. NEVER for edits or file reading).
