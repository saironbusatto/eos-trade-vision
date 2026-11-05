---
title: Global Skills Registry
aliases:
  - Global Skills Registry
tags:
  - skills
  - codex
  - obsidian
status: active
updated: 2026-11-04
---

# Global Skills Registry

> Sources: GitHub Repository kepano/obsidian-skills, 2026-05-14
> Raw: [global-skill-obsidian-skills-install](../../raw/project-system/2026-05-14-global-skill-obsidian-skills-install.md); [obsidian-knowledge-tuning](../../raw/project-system/2026-05-14-obsidian-knowledge-tuning.md)

## Overview

This article tracks globally installed skills. Originally under `/home/saironbusatto/.codex/skills` (Codex, previous machine); on the current machine they live in `~/.claude/skills` (Claude Code), and that should be available across projects, reducing per-project setup and keeping reusable workflows centralized.

## Installed Global Skills

- `karpathy-llm-wiki`
  - Purpose: maintain project knowledge through `raw/` + `wiki/` workflows.
- `obsidian-skills`
  - Source: `https://github.com/kepano/obsidian-skills`
  - Installed path: `/home/saironbusatto/.codex/skills/obsidian-skills`
  - Noted contents: `.claude-plugin/`, `skills/`, and repository docs.

## Current Machine (2026-11-04)

- `~/.claude/skills/karpathy-llm-wiki` — present.
- Obsidian skills installed individually: `obsidian-markdown`, `obsidian-bases`, `obsidian-cli`, `obsidian-clipper-template-creator`.
- `~/.codex/skills` path from the old machine does not apply here.

## Operational Guidance

- Treat global skills as shared infrastructure for all repositories.
- When installing or upgrading global skills, capture source URL, install method, and validation output in `raw/`.
- Keep this registry updated so future projects can quickly confirm available skill packs.

## See Also

- [[EOS Trade Vision System Baseline]]
- [[Obsidian Wiki Style Profile]]
