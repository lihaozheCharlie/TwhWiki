# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Best-fit user

- Primary: a reflective individual who has accumulated diaries, conversations, notes, or AI chats and wants somewhere private to keep talking without having to explain their whole history again.
- Secondary: an open-source adopter with an existing Markdown/Obsidian Vault who values local ownership, traceable understanding, and control over what an Agent may change.
- Validation gap: this best-fit segment is inferred from the current product and one deep usage context; it has not yet been validated across multiple external users or Vault structures.

## Product Purpose

The Way Here is a long-term personal companion that remembers where the user came from and becomes more understanding through continued conversation. The recurring loop is: say what happened, talk until the missing context becomes clearer, retain a traceable understanding, and return later without starting over. Success is not more pages viewed or more knowledge generated; it is more honest expression, fewer repeated explanations, more useful corrections, and more moments where the user can describe what is happening in their own words.

## Positioning

**Core promise:** “有什么，都可以聊聊。我会记得你的来路，也会坦白哪些地方还不懂你。你先说，我们再一起把生活慢慢理清。”

Unlike a generic AI chat that forgets context or a note system that waits to be managed, The Way Here keeps original words, accumulated understanding, unanswered questions, and conversation in one local, traceable relationship. It does not claim to understand the user at first contact; it becomes more useful as the user talks, corrects it, and lets relevant history accumulate.

The friend framing is an experience promise, not a claim of consciousness, emotional reciprocity, therapy, or replacement for human relationships. The Agent must stay honest about uncertainty, preserve provenance, and require explicit authority before changing durable knowledge.

## Operating Context

- The user runs the service locally and returns when something happens that they want to say out loud, during a difficult decision, when a familiar pattern repeats, or when they simply do not want to start the story from the beginning again.
- The product reads an existing Vault with separate Knowledge Sources and My Knowledge layers.
- The import path accepts local Markdown, TXT, folders, and supported payment statements; future connectors must never appear as working actions before they exist.
- Reading, searching, following knowledge links, inspecting sources, and asking Codex are core recurring workflows.
- Editing constructed knowledge may happen in the web UI or an external IDE. Original source notes remain read-only after import.

## Capabilities and Constraints

- Preserve all current constructed pages, original notes, build Skills, links, and Codex workflows; the GUI adapts to them instead of renaming private files or hard-coding this Vault.
- Local-first service bound to `127.0.0.1`; no account system and no public-network assumptions.
- React web client with a Fastify server and Markdown as the durable data format.
- Current delivery scope is desktop web. Mobile and tablet adaptation, touch-specific interaction, narrow-screen navigation, and mobile visual QA are out of scope until separately prioritized; feature work must not add them incidentally.
- Full reading must always remain available. Summaries are navigation aids, never replacements for source or synthesis pages.
- A completed person-perspective reread of a letter remains in the current knowledge base's Agent conversation history and is also retained as a durable letter version. The original letter is never overwritten; the reading surface defaults to the latest completed version and offers a provenance-labelled history switcher only when at least two versions exist.
- Codex actions must keep query, authorized update, and health-check permissions distinct and expose progress and approval states.
- All Agent interactions use one bottom-right contextual drawer. It carries the current page context and keeps new questions, current-knowledge-base conversation history, and full thread detail in the same surface; closing it returns focus to the control that opened it.
- The standalone Workbench / co-creation page is no longer part of the product. Legacy `/workbench` URLs redirect to home instead of opening a parallel Agent surface.

## Brand Commitments

- Product name: “The Way Here”. It describes both the path that brought the user here and the traceable path from a judgment back to its evidence.
- Relationship: a long-term friend who remembers, asks, and accepts correction—not an omniscient analyst, therapist, judge, or life manager.
- Voice: calm, direct, specific, conversational, non-judgmental, and comfortable saying “I don't know yet”. Prefer “说说看 / 一起聊聊 / 还不懂 / 可以纠正我” over “导入材料 / 处理任务 / 构建画像” on everyday surfaces.
- Trust: never hide the difference between original records, current understanding, and new inference. Friendliness cannot weaken permission, provenance, or privacy boundaries.

## Product Layers

1. **At This Moment / 此刻** — the conversational home. It states the relationship promise, then directly asks one traceable question the user may care about or want to clarify. A compact Life Records entry for diaries, conversations, and bills provides the other starting path, followed only by a one-line index into Existing Understanding. Current-stage summaries, recent materials, quotes, and knowledge previews belong to their secondary pages rather than the home.
2. **Worth Talking About / 值得聊聊** — one selected question at a time, grown from what is understood and what is still missing. The full rotating pool stays behind a quiet disclosure instead of becoming a task list, dashboard, diagnosis, or wall of choices.
3. **Life Records / 生活记录** — the user's original words and evidence. Local files, folders, and supported statements remain readable in full and never become disposable input after processing.
4. **Existing Understanding / 已有理解** — current themes, stages, patterns, relationships, letters, quotes, and their evidence paths. Every item can be revisited, supplemented, or corrected.
5. **Contextual Companion** — one Agent drawer across the product. Read mode listens and helps clarify; write mode retains an explicitly authorized update; validation mode checks system health. Conversation history stays within the selected personal space.
6. **Build Settings / 构建设置** — an opt-in expert surface inside Existing Understanding. Technical construction language belongs here, not in the everyday emotional entry points.

## Evidence on Hand

- Anonymous end-to-end evidence: `../../../vault/demo/sources/` and `../../../vault/demo/wiki/`.
- Current-state and conversation-prompt evidence: `../../../vault/demo/wiki/11 状态追踪/状态追踪总览.md` and `../../../vault/demo/wiki/11 状态追踪/值得聊聊.md`.
- Longitudinal structures: life stages, events and decisions, personal lines, recurring cycles, real-life systems, relationship roles, thinking models, letters, and quotes under `../../../vault/demo/wiki/`.
- Existing functional implementation and server APIs under `apps/web/`, `apps/server/`, and `packages/life-views/`.
- No user research across multiple external Vaults yet; portability beyond the current adapter remains an explicit validation gap.

## Product Principles

1. Ask one concrete, evidence-aware question instead of confronting the user with a blank input or a wall of choices; keep bringing in Life Records visibly available as another path.
2. Evidence before interpretation; interpretation before advice.
3. Understanding grows through conversation and correction; never present a cold-start inference as intimacy.
4. Growth is increased choice and clearer judgment, not a score or streak.
5. Summaries must lead somewhere: into full evidence, a related pattern, or a useful conversation.
6. Progressive disclosure over truncation: reduce initial load without hiding the complete knowledge.
7. Local ownership and reversible edits outrank convenience.

## Accessibility & Inclusion

- Keyboard navigation, visible focus, semantic headings, readable Chinese typography, sufficient contrast, and reduced-motion support are baseline requirements for the desktop experience.
- The interface must not rely on color alone to distinguish evidence state, attention state, or confirmation status.
