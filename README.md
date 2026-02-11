# Aitri ⚒️ — The AI Craftsman

> “Named after Eitri, the legendary smith who forged impossible artifacts — with an A for Artificial Intelligence.”

## What is Aitri?
Aitri is a **spec-driven SDLC CLI** designed to help humans and AI agents collaborate safely:
- **Humans decide and approve**
- **Aitri generates structure and artifacts**
- **AI agents (Codex / Claude / OpenCode) execute tasks using Aitri as a workflow guardrail**

## Spec-Driven Development (SDD)
Aitri follows a strict flow:

1) **Draft** a spec from an idea  
2) **Approve** the spec with gates (quality + completeness)  
3) **Discover**: generate SDLC artifacts from the approved spec (discovery doc, backlog, tests)  
4) (Next) **Build**: implement with AI assistance, always behind approvals

This ensures you don’t “generate code first and hope it fits later”.
You **lock the intent** in a spec, then generate work from it.

## Quick Start
Inside any project:

```bash
aitri init
aitri draft
aitri approve
aitri discover
