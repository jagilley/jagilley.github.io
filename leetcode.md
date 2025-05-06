## **Leetcode is dead, and junior devs killed him**

We’ve all had *the experience* — and if you haven’t, you may have missed it.

Early this year I was on the other side of CoderPad, interviewing candidates for a mid-level ML Engineer role. The candidate \- let’s call them Sam \- was still finishing their CS degree but had interned at two FAANGcos already and interviewed fluently. First question:

*“Given a stream of integers, design a data structure that… ”*

After some hemming and hawing, Sam grokked the question and churned out two dozen lines of Python. All tests passing. I would have asked the follow-up question about time and space complexity but Sam’s solution was *O(log n)* time out of the box.

Naturally, this was a little suspicious, but Sam responded fluently to further interrogation, including a more difficult follow-up question. I didn’t really have a reason not to mark them as a **Strong Yes** other than vibes.

So Sam moved on to the next technical round. A week later, my friend who conducted the next interview told me that Sam had failed it *and* been placed on an internal blacklist.

*“Yeah man, they shared their screen and messed up by sharing the entire thing rather than just the browser with CoderPad. Sure enough, open next to their browser was* \[insert well-known AI cheating tool\], *recording everything I said and suggesting responses.”*

---

Leetcode-style interviews have survived as long as they have because the false negatives are undetectable, even after hiring. For every true positive we catch by some odd circumstance, we have *no idea* how many more competent cheaters slip through the cracks. Let’s face it \- if Sam hadn’t slipped up, they probably would have been hired, and because so much of engineering is async and remote, they might not ever have been caught. They were playing by 2025 rules while I was proctoring a 2015 test.

### RIP merit-based hiring

Most hiring loops still cling to the fiction that cranking through three medium‑hard Leetcodes in forty‑five minutes is a proxy for future performance. This fiction persists because there is no *evidence* to suggest otherwise. When bigcos run analyses of how interview performance correlates with job performance, there’s a decent R^2\!

But when the tooling can nail those prompts faster than any human, the loop no longer measures merit—it measures:

1. Prompt hygiene (how well you cajole the LLM mid-interview), or  
2. Deontological guilt (how much you fear cheating)

Neither is an attribute I care about in an engineer. And yet, without a ready replacement, companies retreat to ritual: add another interviewer, add another round, add a “human‑in‑the‑loop plagiarism check.” All pain, no extra signal against sufficiently advanced cheaters.

## ***“Any sufficiently advanced cheater is indistinguishable from a Strong Yes.”***

I think the two metrics that AI cheating tooling ends up measuring point to the future of technical interviewing. On one hand, we are still selecting for people who can walk the walk and talk the talk \- and have some social proof of those abilities. On the other, we’re creating a system in which incentivizing candidates not to cheat \- because their friend referred them to the opening, for instance \- becomes an essential part of the interview process. Congrats, we’ve re-invented Wall Street-style nepo baby interviews but for San Jose.

It’s especially bad because the “vibes” that you can use to suss out if someone is cheating have lots of biases built into them. There are lots of great engineers who are not native English speakers, for instance. What if an interviewer mis-interprets a candidate’s communication style for cheating signals? What if an interviewer has subconscious biases that view women or non-binary candidates as more likely to need to cheat? When every stranger’s CoderPad looks equally flawless, you pick the stranger who isn’t a stranger. Meritocracy ends not with a bang, but an HR‑compliant shrug.

I don’t see how the current system doesn’t eat itself alive over the next few years. As Gergely from the Pragmatic Engineer has noted, FAANGcos and comparables are unlikely to adjust their interview processes for now since they have data showing that it works. Cheaters who slip through the cracks and get hired aren’t likely to change this data on short-to-medium timescales.

### A sliver of daylight

If the interview room is turning into a speakeasy for well‑connected insiders, the only counter‑move is to drag proof of competence out into the daylight—places where AI proxies and back‑channel favors can’t fake a paper trail.

1. **Public, timestamped artifacts**: Shipping code in the open (or publishing reproducible research notebooks, design docs, RFCs—anything with a git hash) is still hard to spoof. LLM‑generated PRs leave tells: no commit history, no follow‑up fixes, no back‑and‑forth with maintainers. Sustained participation in a messy, opinionated community is a signal even Wall‑Street‑style nepotism struggles to ignore.  
2. **Live pair sessions on your turf**: Fifteen minutes inside a real repo, screenshare on, “let’s refactor this gnarly function together.” Copilots can whisper, but they can’t drive the conversation when the spec shifts mid‑sentence. The trick is that candidates propose the repo—they can’t claim surprise, and interviewers watch the genuine engineering muscle memory kick in (or not).  
3. **Reputation graphs that aren’t resume‑gated**: Think Stack Overflow badges, Discord mod logs, Indie‑hacker revenue screenshots—any network where strangers earn trust by doing visible work. These graphs are permissionless; you don’t need a Stanford roommate to get in, just receipts. They’re clunky today, but every hiring manager I know is already lurking.  
4. **Small‑stakes collaborations before big offers**: Contract‑to‑hire and OSS bounties feel old‑school, yet they turn the incentives upside‑down: candidates want to be seen doing the work in public because it’s the fastest path to an inside track. Practical? Not for every role. But if the alternative is “hire the friend of a friend,” a weekend spike on a real feature is cheap due diligence.

None of this restores the tidy meritocracy we thought Leetcode guaranteed, and none of it is painless. But it scales better than referrals, and it rewards curiosity, visible execution, and the humility to work in the open, all of which will remain valuable traits for engineers to have.