# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Primary: an individual who keeps a long-running Markdown/Obsidian knowledge base and wants to understand their current life, recurring patterns, relationships, choices, and growth without surrendering control of the source material.
- Secondary: open-source adopters who start the service locally against their own Vault and should not need to understand the repository layout before receiving value.

## Product Purpose

The Way Here turns personal records into an evidence-backed growth companion. It should help a user move through a recurring loop: bring in what happened, organize it into durable knowledge, notice what matters now, connect it to longer patterns and lived evidence, and return to life with a better question or next step. Success is not more pages viewed; it is less time spent managing files and more moments where the user can explain what is happening, why it may be recurring, and what they want to examine next.

## Positioning

Unlike a file browser, note graph, or generic AI chat, The Way Here gives raw personal material and constructed knowledge distinct places. It compiles the user's own records into traceable life structures and brings evidence, synthesis, and companion reflection together at the moment of inquiry. AI maintains and interprets the knowledge system, but every judgment remains linked to evidence and uncertainty is allowed to remain visible.

## Operating Context

- The user runs the service locally and returns after writing new diary entries, during a difficult decision, when a familiar pattern repeats, or when they want to revisit a person or stage of life.
- The product reads an existing Vault with separate Knowledge Sources and My Knowledge layers.
- The first import path accepts local Markdown, TXT, and folders. AI conversations and WeChat conversations are visible future connectors, not fake working actions.
- Reading, searching, following knowledge links, inspecting sources, and asking Codex are core recurring workflows.
- Editing constructed knowledge may happen in the web UI or an external IDE. Original source notes remain read-only after import.

## Capabilities and Constraints

- Preserve all current constructed pages, original notes, build Skills, links, and Codex workflows; the GUI adapts to them instead of renaming private files or hard-coding this Vault.
- Local-first service bound to `127.0.0.1`; no account system and no public-network assumptions.
- React web client with a Fastify server and Markdown as the durable data format.
- Current delivery scope is desktop web. Mobile and tablet adaptation, touch-specific interaction, narrow-screen navigation, and mobile visual QA are out of scope until separately prioritized; feature work must not add them incidentally.
- Full reading must always remain available. Summaries are navigation aids, never replacements for source or synthesis pages.
- Codex actions must keep query, authorized update, and health-check permissions distinct and expose progress and approval states.
- Compatibility routes may remain while the primary navigation and task flow change.

## Brand Commitments

- Product name: “The Way Here”. It describes both the path that brought the user here and the traceable path from a judgment back to its evidence.
- Voice: calm, direct, specific, non-judgmental, and comfortable saying “unknown”. Avoid performance-review language, motivational slogans, therapy claims, and gamified self-scoring.

## Product Layers

1. **Knowledge Sources** — two explicit sublayers. “Raw Import” is an inbox for unorganized Markdown, TXT, and local folders; “Organized Sources” contains already filed records such as diaries and uses a folder tree, file list, and full reading pane. AI and WeChat conversations remain staged connectors. Import count is not capped; a 100 MB batch guard protects the local service.
2. **My Knowledge** — all constructed outcomes: current state, patterns, life stages, relationships, decisions, models, letters, quotes, and their relationship map. Its stable secondary navigation remains visible under the active primary section.
3. **Advanced Build** — an opt-in control surface for expert users. Build Skills are grouped by the same knowledge system as My Knowledge: Understand Yourself, Review Life, People & World, and System & Quality. Users adjust one rule through guided goals instead of scanning an undifferentiated card wall.
4. **At This Moment / Co-create** — the outcome-oriented daily entry and the conversational way to understand, update, or validate the system.

## Evidence on Hand

- Real Wiki structure and product semantics: `../../../vault/personal/wiki/00 总入口/个人操作系统.md` and `../../../vault/personal/wiki/index.md`.
- Current-state evidence: `../../../vault/personal/wiki/11 状态追踪/状态追踪总览.md`.
- Longitudinal structures: life stages, events and decisions, personal lines, recurring cycles, real-life systems, relationship roles, thinking models, letters, and quotes under `../../../vault/personal/wiki/`.
- Existing functional implementation and server APIs under `apps/web/`, `apps/server/`, and `packages/life-views/`.
- No user research across multiple external Vaults yet; portability beyond the current adapter remains an explicit validation gap.

## Product Principles

1. Start from the user's question and source material, not the repository's directory tree.
2. Evidence before interpretation; interpretation before advice.
3. Growth is increased choice and clearer judgment, not a score or streak.
4. Summaries must lead somewhere: into full evidence, a related pattern, or a useful conversation.
5. Progressive disclosure over truncation: reduce initial load without hiding the complete knowledge.
6. Local ownership and reversible edits outrank convenience.

## Accessibility & Inclusion

- Keyboard navigation, visible focus, semantic headings, readable Chinese typography, sufficient contrast, and reduced-motion support are baseline requirements for the desktop experience.
- The interface must not rely on color alone to distinguish evidence state, attention state, or confirmation status.
