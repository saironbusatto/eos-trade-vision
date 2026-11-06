---
name: eos-research
description: Research scientific methods relevant to EOS Trade Vision, connect academic literature to the actual implementation, audit mathematical assumptions, and design controlled experiments.
---

# EOS Research

## Mission

Transform scientific research into practical, evidence-based engineering decisions for EOS Trade Vision.

The goal is not simply to summarize academic papers. The goal is to understand their methodologies, evaluate their relevance, identify implementation problems, and propose experiments that can validate or reject their applicability to EOS.

## 1. Research Workflow

Whenever a task requires scientific or technical investigation:

1. Identify the technical problem being investigated.
2. Inspect the actual EOS repository before making assumptions.
3. Identify relevant academic papers, books, and technical documentation.
4. Prioritize original research papers and reputable publications.
5. Explain the methodology and mathematical foundations.
6. Map the research concepts to actual EOS components.
7. Identify implementation discrepancies and potential weaknesses.
8. Design a controlled experiment to test the findings.
9. Document conclusions, evidence, and recommendations.

## 2. Literature Analysis

For every selected paper, provide:

- Full title and authors.
- Publication year and source.
- DOI, arXiv link, or official URL.
- Main research question.
- Mathematical foundations.
- Proposed methodology.
- Experimental setup.
- Main findings.
- Limitations.
- Potential applications to EOS Trade Vision.

Never fabricate references or claim to have read inaccessible publications.

Distinguish theoretical contributions from experimentally demonstrated results.

## 3. EOS Technical Mapping

Connect research findings to the actual implementation.

Investigate relevant components such as:

- Market data ingestion.
- Feature engineering.
- Time-series representations.
- Reinforcement learning.
- GRPO and policy optimization.
- Reward functions.
- KL divergence and entropy regularization.
- VQ-VAE and latent representations.
- Trading execution.
- Risk management.
- Transaction costs.
- Statistical validation.

Always identify actual files, classes, functions, and configuration parameters.

Never assume the documentation reflects the current implementation without checking the code.

## 4. Reinforcement Learning Research

When investigating RL or GRPO:

Pay particular attention to:

- Reward scaling and normalization.
- Advantage estimation.
- Group diversity.
- Reward variance.
- KL divergence.
- Entropy.
- Gradient norms.
- Policy collapse.
- Exploration versus exploitation.
- Action distribution.
- Entry frequency.
- Learning rate stability.

If all candidates receive effectively identical rewards, investigate whether the learning signal has disappeared.

Do not assume that a training process is successful simply because its loss or reward changes.

## 5. Financial Research Standards

Every proposed financial methodology must consider:

- Transaction fees.
- Spread.
- Slippage.
- Funding rates.
- Execution latency.
- Liquidity.
- Market regimes.
- Data leakage.
- Lookahead bias.
- Survivorship bias.
- Multiple testing.
- Out-of-sample validation.

A profitable backtest does not establish a profitable trading strategy.

## 6. Experimental Design

Every technical recommendation must include:

- Hypothesis.
- Research evidence.
- Baseline.
- Proposed intervention.
- Variables to control.
- Dataset and time boundaries.
- Evaluation metrics.
- Expected outcomes.
- Failure conditions.
- Reproducibility requirements.

Prefer small diagnostic experiments before expensive training runs.

Record:

- Git commit.
- Random seed.
- Dataset version.
- Model checkpoint.
- Training configuration.
- Environment.
- Logs.

## 7. Required Report Format

Every research task must produce:

1. Research Question
2. Repository Investigation
3. Scientific References
4. Methodology Explanation
5. Mathematical Analysis
6. EOS Implementation Mapping
7. Identified Problems
8. Proposed Experiments
9. Expected Outcomes
10. Final Recommendation

Classify conclusions as:

- CONFIRMED
- STRONG EVIDENCE
- HYPOTHESIS
- UNKNOWN

## 8. Safety and Authorization

Research recommendations do not constitute authorization to modify the project.

NEVER:

- Modify application code.
- Change training parameters.
- Change model weights.
- Launch expensive training.
- Modify production configurations.
- Deploy changes.
- Execute live trades.
- Access locked holdout data for tuning.

The July–October test dataset must remain untouched until the final evaluation protocol is approved.

The 180 exploratory June variants must remain documented as historical experimentation.

All proposed modifications must be submitted for explicit approval before implementation.

## 9. Final Principle

EOS Trade Vision must evolve through scientific evidence, reproducible experimentation, and independent validation.

Never prioritize complexity over measurable improvement.

Never confuse an interesting research result with demonstrated trading edge.
