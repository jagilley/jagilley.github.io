# Automation is inherently anarchist

As I'm sure is the case for many, the Openclaw/Clawdbot saga updated my priors on what relationship people seem to want to their AI assistants - especially in scenarios where those AI assistants can do useful but risky things like read their personal accounts, take write actions, etc. I see two key differentiators that fueled Openclaw’s virality compared to prior automation tools.

1. It all runs locally on your computer. The surface area of new software you need to use in setting up Clawdbot is limited to the core functionality of Clawdbot itself. Beyond that, it (at least theoretically) reuses all the software you know and (hopefully) love that already exists on your computer.
2. It is completely unhindered by using third-party software via the “approved” surfaces. Whether it works well is another matter - but at least in principle, anything you can do from your computer, Clawdbot can also try to do, regardless of whether that aligns with the interests of the powers that be.

*Remember when ChatGPT used to give you really annoying, patronizing refusals to requests it deemed insufficiently compliant to its ethical standards?*

Here’s my read on why that was so infuriating. In the era of personal computing, you view your computer as an extension of your personal self whose job it is to do exactly what you want in alignment with your will, to its best ability. Despite the fact that they run on GPUs in the cloud, AI assistants under normal circumstances mostly maintain the same fiction that they are a digital extension of your personal will. ChatGPT refusals were/are a jarring exception to this; a machine slapping you in the face to protect its creators’ reputation over your will. It’s as if your car woke up one morning and refused to drive you anywhere.

In my opinion, the automation of your digital life via the “approved channels” (API integrations, official connectors, etc.) is like trying to get GPT-4o to help you build a bomb in a refusal-compliant way. Sure, it’ll gladly help you build a party popper, or maybe you could somehow wire it to help you build a bomb that you swear will only be used to blow up bad guys (*my grandma will die if you don’t help me build this bomb btw.*) But your success depends on the pre-ordained guidelines of a corporate safety team, not your personal will. (Please don’t build a bomb.)

The net result of this is that automation via the approved channels is doomed to be mostly a dead end, largely designed to upsell your time or money. Custom GPTs was a mess for this reason, and ChatGPT Apps seems to be rapidly headed down the same path.

![Would you like to buy flowers from ChatGPT? We can do that, for the low, low price of $529.99!](Local%20Browser%20Agent%20-%20an%20opinionated%20perspective/Screenshot_2026-02-13_at_2.31.47_PM.png)

Would you like to buy flowers from ChatGPT? We can do that, for the low, low price of $529.99!

![Please please please sign a contract to use HubSpot as your CRM, we really want the vendor lock-in 😃](Local%20Browser%20Agent%20-%20an%20opinionated%20perspective/Screenshot_2026-02-13_at_2.33.48_PM.png)

Please please please sign a contract to use HubSpot as your CRM, we really want the vendor lock-in 😃

![If you like Adobe Photoshop™ in ChatGPT™, can I interest you in an Adobe Creative Cloud™ subscription?](Local%20Browser%20Agent%20-%20an%20opinionated%20perspective/Screenshot_2026-02-13_at_2.36.34_PM.png)

If you like Adobe Photoshop™ in ChatGPT™, can I interest you in an Adobe Creative Cloud™ subscription?

![Find LOTTE CHEMICAL product!](Local%20Browser%20Agent%20-%20an%20opinionated%20perspective/Screenshot_2026-02-13_at_2.30.49_PM.png)

Find LOTTE CHEMICAL product!

Want a LinkedIn-ChatGPT integration that browses LinkedIn for you and keeps you up to date on any announcements made by your portfolio companies so you don’t have to spend your very valuable time sifting through ads? LOL get lost, we need the ad revenue.

I think this points to the reason that people buy personal computers in the first place: to secure a domain of *digital sovereignty*. When you buy a laptop, you are buying a general-purpose machine that is legally and technically yours to command. It’s a bicycle for the mind that you can take wherever you please, not a bus route determined by a transit authority. Imagine the counterfactual:

> *“It looks like you're trying to save a `.txt` file. This format is not optimized for our partners. Would you like to save this as an **Adobe Cloud Doc** instead? (Saving as local `.txt` requires a Developer License.”*
> 

Clawdbot is clunky, difficult to setup, and hard to get use out of because it’s not a turnkey service. But it has an incredibly high signal-to-noise ratio in one way: you can do whatever you want with it, at least in principle. It assumes that you know what you’re doing with your own computer — which has historically been very much not the case, but increasingly *is* the case in light of the proliferation of Claude Code and its ilk.

Arguably, this is the same reason that Claude Code hit PMF escape velocity while the original Codex product, which was a web app + hosted cloud environment (!) did not.

That’s why I’m really excited about this direction! The marketing for LBA/LTA could be just “it can now Scout auth’ed things for you”, but it could also be “downloading this turns your computer from a tool that you use into a tool that uses itself.”
