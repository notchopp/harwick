# AI-Native Distillation Plan (Phase 8.3)

## Goal

Periodically distill our accumulated `training_corpus` into a smaller, cheaper, increasingly-Harwick-flavored model that lives on the homelab Mac Studio. Eventually it serves the mini tier of the judgment-tool registry at near-zero per-call cost.

## Hardware

Mac Studio (per the `project_homelab_agent_stack` memory). Capable of running Qwen / DeepSeek / GLM / Llama 3 70B-class models in 4-bit quantization for inference and LoRA fine-tuning.

## Pipeline

1. **Collection** (always running) — `training_signals` rows accumulate every judgment-tool emission.
2. **Labeling** (cron, hourly) — `runLabelerBatch()` joins outcomes and produces `training_corpus` rows in SFT and DPO shapes.
3. **Distillation cycle** (weekly initially, daily once volume warrants):
   - Pull `training_corpus` rows where `created_at > last_train_at`
   - Filter by tool: produce a per-tool checkpoint (briefEntity model, recommendRouting model, etc.) so each surface can be served by its specialist
   - Train: LoRA on a base model (Qwen 2.5 7B or DeepSeek 7B). Mix SFT + DPO 80/20.
   - Eval against held-out test set (5% of corpus held back). Track: confidence calibration, deterministic-rule agreement, blind A/B vs gpt-4o-mini.
   - Promote if eval gates pass; otherwise discard and log.
4. **Inference serving**:
   - Local: Ollama or LM Studio on Mac Studio. Routes via `HARWICK_JUDGMENT_MINI_MODEL=harwick-local-7b`.
   - Cloud fallback: gpt-4o-mini when the local model is offline or low confidence.
5. **Cost monitoring**: every emission still writes `training_signals` + cost row. Cloud-to-local migration tracked as % of emissions served locally.

## When to start training

Trigger when `training_corpus` has at least 10,000 labeled rows per tool. Brief tools accumulate fastest (every drawer open / queue load). Routing + reconciler tools accumulate slower (per-event basis).

## Eval gates for promotion

- Confidence calibration within ±0.05 of gpt-4o-mini on held-out set
- Deterministic-rule agreement: matches the rule-based decision ≥85% of cases where the rule would have applied (means the model learned the rule's intent)
- Blind A/B against gpt-4o-mini: 30 operator-facing surfaces shown to internal users with model identity hidden, model "wins" or "ties" ≥45% of the time

## Privacy

Training data stays workspace-scoped. The fine-tune is workspace-agnostic — only the corpus is scoped. We may also offer workspace-isolated tunes for enterprise customers who want a per-brokerage model.

## Meta constraint

Per the existing `data_flywheel_meta_constraint` memory, raw IG/FB content is excluded. The collector excludes signals where `source_channel` is `instagram_*` or `facebook_*`. Public-listing-chat / voice / SMS / operator-action sources remain in scope.

## File map

- `apps/web/src/features/judgment-tools/labeler.ts` — labeler worker
- `apps/web/src/app/api/cron/labeler/route.ts` — cron endpoint (POST/GET with CRON_SECRET)
- `homelab/distillation/` (future) — training scripts, eval harness, model promotion
- `harwick_briefs` + `training_signals` + `training_corpus` tables — the corpus pipeline
