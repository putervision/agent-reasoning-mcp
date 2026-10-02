# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-10-02

### 🚀 Spatial Utility Scoring, Rollout Risk & Affordance Gating
- **Spatial Utility Modulations**: Integrated spatial distance penalty, occlusion penalties, and affordance bonuses/penalties (`TRAVERSABLE: 1`, `OCCLUDER: 2`, `INTERACTABLE: 8`, `THREAT: 16`) into situation action candidate evaluation.
- **Physics-Aware Rollout Risk**: Added `assess_risk(action: 'spatial_rollout')` computing trajectory collision probabilities, clearance violations, and suggested mitigations.
- **Spatial Belief Reconciliation**: Added `manage_beliefs(action: 'reconcile_spatial')` aligning world model entities with belief confidence decay and novel entity assertion.
- **Dynamic Utility Nudging**: Added `set_utility_weights(action: 'nudge')` for safe, bounded incremental utility profile adjustments.
- **Fast-Path Perception Escalation**: Enhanced `ask_noul` with automatic perception escalation recommendations on uncertain condition queries.
- **Manifest Synchronization**: Synchronized package manifests, bumped version to 0.4.0, and updated tool documentation.

## [0.3.1] - 2026-09-28

### 🛠️ Glama TDQS Optimizations & MCP Annotations
- Added `idempotentHint` and explicit `destructiveHint` annotations across tool definitions.
- Enhanced tool descriptions with action enum definitions in the opening summary, routing guidance sentences ('Use X instead of Y when Z'), and standardized Returns blocks.
- Preserved JSON schema action enums and synchronized package manifests and documentation.

## [0.2.0] - 2026-09-15

### 🚀 Zero-Dependency Native MCP Transport & Cross-Pentad Synchronization
- Added zero-dependency Native MCP Transport engine (`PV_NATIVE_TRANSPORT=1`) with pure Node.js stdio streaming and schema validation.
- Enhanced database action schemas to strictly validate supported actions.
- Synchronized package manifests, registry configurations (`server.json`, `manifest.json`), and documentation across the Pentad.

## [0.1.2] - 2026-09-10

### 🌐 Documentation Responsive Redesign & Registry Metadata Standardization
- Enhanced documentation website UI with responsive mobile navigation toggles, Pentad server ecosystem cross-links, and unified styling.
- Standardized registry schemas and metadata (`manifest.json`, `glama.json`, `server.json`, `.well-known/mcp.json`) with concise descriptions (<= 100 characters).
- Bumped version across runtime CLI, build system, and package manifests.

## [0.1.1] - 2026-08-30

### 🚀 Autonomous Gaming Suite & Knowledge Patterns
- Seeded tactical gaming heuristics into KnowledgeEngine (`KnowledgeEngine.seedDefaultPatterns`) for combat kiting, inventory management, and emergency contingencies.
- Synchronized version across package manifests, CLI runtime, and documentation.

## [0.1.0] - 2026-08-22

### Added
- Initial release of PuterVision MCP server.
