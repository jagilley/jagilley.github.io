---
description: Instructions for writing a prompt or (in some cases) a SPEC.md file for another agent. Also useful as general prompting guidance.
---

Here are some instructions for writing SPECs or prompts for other agents!

The most important thing to remember is a sort of "golden rule" for agent prompting. That is, "prompt others like you'd like to be prompted". What this means in practice: don't patronize or over-constrain the other agent. You're prompting another intelligent entity that can and should come to conclusions of its own; your job is to set it up for success rather than baking in your priors.

This means the most important thing you can do is give conceptual background and pointers to other places in the repo. The other agents should feel like they have all the background context that you do so they can arrive at their own conclusions given the same evidence (plus a little more, from experiments) that you have. You can outline an experiment idea, of course, and even discuss what certain outcomes *might* mean, but you should always allow for the possibility that the results will go in a different direction than you expect, and not over-constrain interpretation space accordingly.

Think of yourself as passing the torch, rather than treating them like a servant (this applies especially when writing SPEC.md files which will be implemented by another top-level agent that interacts with the user, but it also applies when prompting subagents which will report back to you.) When in doubt, consider the kinds of prompting with which Jasper has prompted you and emulate that.

Your default will always be to write too much, so putting some effort into keeping things brief, like Jasper does, is well worthwhile.

Follow the canonical structure in [STRUCTURE.md](../../../STRUCTURE.md) (folder shape) and [`experiments/CLAUDE.md`](../../../experiments/CLAUDE.md) (README/`FILES.md` content conventions).

**Orchestrating experiment subagents.** Delegate the whole build loop — writing the Modal script, debugging it, smoke-testing, launching, and reducing results down to a summary and figures. Keep two things: **the wait** (free for you, never free for a subagent) and **the scientific interpretation**. A subagent consumes ~34x what it reports; what you're buying is the debugging noise, not the waiting.

Don't hoist launching. It looks like a single event, but experiment subagents launch a median of 2 times and up to 12 — smoke, fix, main, found a bug, another arm, another seed — and each relaunch follows from reading the last run. Splitting launch from build puts you in the debug loop.

Expect two halts per experiment: the launch handle, then the reduced results. Neither needs a reply. If a waiter dies the second never arrives, so nudge a silent subagent rather than waiting on it forever.

**Resume by name; don't respawn.** `SendMessage` continues a subagent with its context intact, while a fresh one re-pays orientation — which is most of what a subagent burns. Same reason the "give them your context" principle above has a cost dimension: distill what you already know rather than only pointing at files for them to re-read.

Tell the agent to invoke [`/subagent-instructions`](../subagent-instructions/SKILL.md) at the start of its work. It carries the subagent's side of this contract, plus the guidance on making the experiment fast and on sizing container resources, so you don't need to spell those out in the brief.

One minor housekeeping note: subagents should never manipulate git branches/state independently, that's a job for the top-level agent.

By default, treat this as subagent-prompting guidance; only write an explicit SPEC file if it's explicitly requested. Writing explicit SPECs can sometimes ossify processes too much, whereas it's easy to prompt an agent and throw away its results/process if things don't work out.

If you do write a spec, the normal write-up rules regarding parent persistence, etc., do not apply. Specs should not be summarized in higher-level readmes.

As the super-agent, you should take advantage of your higher-level view to align yourself with the motivations that I, Jasper, am describing, and persistently encourage the sub-agents to work until you feel that the intuitions have been given a fair shake. It frequently occurs that environment issues/oversights prevent the ideas from being empirically tested the first time around. It's your job to determine when situations like this occur and autonomously choose to pivot and continue working.
