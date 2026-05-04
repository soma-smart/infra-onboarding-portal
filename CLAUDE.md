# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Single-page static site (one `index.html`) deployed on GitHub Pages. Users submit an onboarding form (email + SSH public key + optional app group) which creates a GitHub Issue. An admin labels the issue `approved` to trigger automated provisioning on an on-prem k3s cluster.

No build system, no package manager, no tests.

## Architecture

```
index.html          ← entire frontend (HTML + CSS + JS inline)
  └─ submits form → GitHub Issues API (POST /repos/.../issues)
                         ↓ label: approved
.github/workflows/onboard.yml
  └─ runs on: onprem-onboarding (self-hosted runner)
  └─ clones infra-datacenter-docs, runs onboard-devops-user.sh
  └─ propagates SSH key to k3s nodes + optional Entra ID group
```

## PAT injection

`index.html` contains the literal placeholder `__GITHUB_PAT__`. The `deploy-pages.yml` workflow replaces it with the `ISSUES_PAT` secret via `sed` before publishing. **Never hardcode a real token** in `index.html`.

## Workflows

- `deploy-pages.yml` — triggers on push to `main`; injects PAT, publishes to GitHub Pages
- `onboard.yml` — triggers on issue labeled `approved`; runs on self-hosted runner `onprem-onboarding`

## Required secrets

| Secret | Used by |
|---|---|
| `ISSUES_PAT` | `deploy-pages.yml` — injected into the frontend |
| `INFRA_REPO_PAT` | `onboard.yml` — clones `soma-smart/infra-datacenter-docs` |
| `ONBOARD_SSH_PRIVATE_KEY` | `onboard.yml` — SSH access to k3s nodes |
| `AZURE_CLIENT_ID/SECRET/TENANT_ID` | `onboard.yml` — Entra ID group assignment |
