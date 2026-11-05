---
title: Sauron Image Generation
aliases:
  - Sauron Image Generation
tags:
  - telegram
  - media
status: active
updated: 2026-11-04
---

# Sauron Image Generation

> Sources: commit 1fbe994, 2026-07-08
> Raw: [repo-audit-jul-2026-changes](../../raw/project-system/2026-11-04-repo-audit-jul-2026-changes.md)

## Overview

"EOS — Eye of Sauron": each signal can be posted to Telegram with an AI-generated image where Sauron is always the character and the scene interprets the signal's quote.

## Flow

1. `trendingScanner.ts` passes the quote along with the signal.
2. `telegram.ts::generateSauronImage(symbol, direction, score, quote)` runs `scripts/generate-sauron.py`.
3. Image cached at `/tmp/eos-sauron/sauron-<symbol>-<ts>.jpg`, sent with `sendPhotoWithCaption`.
4. Missing script or failure → logged, signal still goes out (returns `null`).

## Requirements

- `OPENAI_API_KEY` (DALL-E), `httpx` in ML requirements, `scripts/` copied in the bot Dockerfile.

## See Also

- [[EOS Trade Vision System Baseline]]
