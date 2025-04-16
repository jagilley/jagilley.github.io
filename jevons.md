## **Why Jevons’ Paradox won’t save your SWE job**

Several weeks ago, [I wrote a blog post](https://jagilley.github.io/faang-blog.html) arguing that my old FAANG job was going to be obsolete by the end of 2025, as a result of rapid progress in the breadth of AI capabilities.

The most common counterargument \[not ad hominem\] I heard went something like this: *in the past, when new dev tools have been created, the resulting developer increase in productivity actually increased the overall demand for software engineers, because more software could be created at a better price. AI is just another dev tool, therefore it will increase the demand for software engineers.*

This is a restatement of Jevons’ Paradox: if the demand for a good is constrained primarily by its price, then a decrease in the price of that good will increase overall demand for that good dramatically. This is often true of industrial inputs: cheaper coal fed the Industrial Revolution, and total coal burned soared.

However, I don’t think the analogy holds. In order for AI dev tools to be a complementary good to your labor, you must sit at least partially upstream or downstream of their capabilities \- and being downstream of their capabilities today does *not* mean you’ll be downstream of their capabilities tomorrow. Unless your labor is extremely differentiated, AI dev tools are more likely to be a direct substitute to it than a complement.

### Is demand for software engineering still elastic?

Historically, the market for software development has behaved as though it were highly price‑elastic: \[In economics parlance, the price elasticity of demand refers to the change in consumption with respect to the change in price. A good is *price elastic* if the price of a good halving leads to the amount consumed more than doubling.\]

1. **Backlogs**: many orgs have backlogs of desired features and new software projects they can't pursue due to budget and talent constraints. A significant drop in the effective cost of development could unlock lots of this latent demand.  
2. **New Applications**: cheaper development makes it viable to create software for niches, industries, or types of problems previously uneconomical. I.E., hyper-customization, more sophisticated internal tools for smaller companies, accelerating scientific research, etc. This creates entirely new areas of demand.  
3. **Increased Complexity**: as anyone who has vibe coded a codebase knows, the complexity gradually grows until it sometimes becomes too complex for AI dev agents to handle, and human intervention is required.  
4. **Build vs buy**: cheap ad hoc software development will probably lead companies to build bespoke solutions rather than buying less flexible off-the-shelf software or engaging in manual processes.

I buy all of these arguments, frankly, and I’m sure that reduction in effective software development costs will expand the market for software considerably. However:

1. **Mature categories are near saturation:** (CRUD apps, brochure‑ware sites, commodity mobile apps)  
2. **Baumol-Bowen cost disease** means that even in an era of infinite free software, non-software bottlenecks will simply grow to consume a larger chunk of overall costs, reducing the ability of total software demand to increase further, [as Tyler Cowen has pointed out](https://marginalrevolution.com/marginalrevolution/2025/02/why-i-think-ai-take-off-is-relatively-slow.html)  
3. There are clearly **diminishing marginal returns** to additional features in existing apps like e.g. Microsoft Teams or what have you. There do exist SOME fundamental limits for demand to software  
4. It’s about the **rate of change** anyway. AI capabilities are advancing much faster than the demand for new software engineers can expand. If one AI-assisted engineer is 10x more productive than a 2020-era engineer \[which is debatable now, but that multiplier is going up at a very nontrivial, consistent rate\], demand for new software needs to also increase by 10x in order to maintain employment levels

Additionally \- these arguments concern whether demand for *overall software development capability* is elastic. Historically, this quantity is functionally the same as demand for software engineer employment. However, I don’t think this is likely to continue to be the case.

### Intelligence as industrial commodity

I would define the crux of the job of software engineering \[or engineering more broadly, but I can’t speak in as much detail about other fields\] as being the intelligence glue that allows management to specify product directions and not worry about the implementation. Yes, there are orgs in which product direction can be more engineering-driven, but I would argue that those orgs are just having their engineers also take on some of the job of product managers \[which is all well and good but it’s a separate role.\]

Sidebar: as a rule of thumb, the core capabilities of any job are probably approximately the skills that are tested for when you get hired. SWE interview processes filter based on rote symbolic intelligence (i.e., Leetcode) and general-purpose system design experience. Both of these things are sub-categories of being intelligence glue.

In the past, the advent of e.g., assembly → programming languages, low-level programming languages → higher-level programming languages essentially just pushed the level of abstraction up a notch. Software engineers were still needed as intelligence glue to piece everything together \- they just operated at a higher level of the stack. The overall gain in productivity from working at a higher level was nowhere near enough to make a dent in demand for engineering capability; thus, Jevons’ Paradox applied and still more engineers were hired.

Meet: Intelligence Glue as a Service, also known as AI in 6 months from now. Capabilities? Now:

- It can already solve competitive programming problems better than you (a.k.a. the core symbolic intelligence loop we select for with Leetcode-style interviews)  
- It intuitively knows vastly more information than you  
- [It can probably do core AI research better than you](https://pub.sakana.ai/ai-scientist-v2/paper/) (unless you’re really cracked at it)  
- It works for \~0.1% of the wages you do

In 6-12 months:

- It will be able to hold more information in working memory than you  
- It will be able to use a computer at least as effectively as you to augment its own context when necessary  
- It will probably be able to architect novel systems better than you

I envision the “intelligence glue” part of SWE jobs as being squeezed into higher and higher corners of abstraction, until one day it becomes indistinguishable from the inputs to production upstream of engineering implementation (i.e., ideation, strategy, and marketing.)

Instead of coal use, I’d point to a different historical parallel. As recently as 1900, as much as two-thirds of the world’s population was in the business of farming. In the 1930s-1950s, the Haber-Bosch process and other industrial farming techniques improved food output per farmer by a factor of perhaps 20x. Demand for food, however, is fundamentally inelastic: every human only needs to eat so much of it. As a result, all those people who previously trudged away farming were able to get other jobs. Today, farming is extremely mechanized and represents about 2% of employment in the developed world, a number which may itself be propped up by subsidies.

This is a wonderful thing for the world economy, and the cost of a whole bunch of important products that rely on software as an industrial input will almost certainly go way down. But I wouldn’t advise staying in the business of subsistence farming while your neighbor gets ready to put his combine harvester to use.

Objection: [https://x.com/aquariusacquah/status/1906492160880345404](https://x.com/aquariusacquah/status/1906492160880345404) *“Software is just like food production if every wheat bushel could be used infinite times at zero marginal cost and if caloric demand wasnt inelastic and if humans today ate 100,000x more corn than they did 100 years ago and it took $1M to create each magic infinity bushel and”*

The problem is that software engineering employment is correlated not with the returns to running software repeatedly at low marginal cost but with the creation, customization, and deployment of new software. The returns on **running** software go to equity holders; the wage premium commanded by those who write software is purely a function of the scarcity of people (or machines) capable of doing so. What you’re really creating as a software engineer is git diffs, not code itself.

The fact of the matter is, humans were NOT EVOLUTIONARILY DESIGNED to do symbolic reasoning, and we happen to have invented a machine that is more or less designed to do just that.

There are lots of things that AI models seem poised to suck at for the foreseeable future\! For every math/science/coding benchmark that gets smashed, models remain bad at creative writing and most everything else that involves qualitative emulation. RL’ing a model to death won’t make it any better at exploring wide latent spaces in which the space of valid outputs is equally as broad as the space of valid inputs.

But yeah, you should probably graduate from seeing yourself as a gatekeeper of a critical industrial process.