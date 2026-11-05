---
title: Obsidian Wiki Style Profile
aliases:
  - Obsidian Wiki Style Profile
tags:
  - wiki
  - obsidian
  - knowledge-management
status: active
updated: 2026-11-04
---

# Obsidian Wiki Style Profile

> Sources: kepano/obsidian-skills, 2026-05-14
> Raw: [obsidian-knowledge-tuning](../../raw/project-system/2026-05-14-obsidian-knowledge-tuning.md)

## Overview

This profile defines how this project's LLM Wiki should be authored for better Obsidian compatibility while preserving Karpathy LLM Wiki ingest discipline.

> [!note]
> Ingest discipline remains unchanged: every meaningful update should keep `raw/` as source evidence and `wiki/` as compiled knowledge.

## Authoring Rules

- Use frontmatter properties in wiki notes (`title`, `aliases`, `tags`, `status`, `updated`).
- Prefer wikilinks for internal references:
  - same folder: `[[Note Name]]`
  - specific heading: `[[Note Name#Heading]]`
- Keep external links as normal markdown links.
- Keep file names stable and concept-oriented (kebab-case).
- Obsidian resolves `[[...]]` by file name or alias, so every note declares its `title` in `aliases` — this keeps `[[Title Case]]` links working with kebab-case files.

## Vault Navigation Pattern

- Baseline architecture note anchors system context.
- Skills registry note tracks globally available skills.
- This profile note defines editorial style for future wiki growth.

## See Also

- [[EOS Trade Vision System Baseline]]
- [[Global Skills Registry]]
