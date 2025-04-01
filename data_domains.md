## **The end of data domains**

One aspect of the ARC-AGI saga that I think has gone underdiscussed is how big of a deal it is that o3 was able to generalize completely out of domain to solve ARC tasks. We now have convincing evidence that reasoning models can few-shot adapt to any data domain not seen during training, provided with sufficient compute. This means that data domains don’t really exist anymore \- it’s just a matter of how much compute you’re comfortable spending to venture into them.

A complaint [I’ve heard made](https://nonint.com/2024/12/22/beating-arc-the-hard-way/) about ARC as a benchmark for LLMs is that what ARC asks you to do is not really a language task \- it’s more of a visual processing task that LLMs happen to be able to bumble their way through sometimes. This complaint is entirely reasonable, and some of the early marketing copy around ARC (*“the average 5-year-old can solve this task but LLMs can’t\!”*) didn’t help.

But the weirdness of the measured task is precisely what’s impressive about reasoning models being able to bumble their way through to a \~75% success rate. ARC is useful as a benchmark for language models because it’s both completely out-of-domain and not amenable to reward hacking.

I’m excited about the implications of this because a lot of useful tasks involve data that is somewhat OOD for language models, but less OOD than ARC. Suppose you have object tracking data in the form of *(x, y, z)* coordinates over time, encoded in JSON. It probably wouldn’t be reasonable to expect a traditional language model to be able to draw inferences about the spatial patterns in this data over time, since these models aren’t natively trained to do so. But a model capable of solving ARC tasks at a decent clip could probably draw some useful inferences, provided with a few examples of what to look for.

Of course, considering it cost thousands of dollars to solve individual ARC tasks with o3, this isn’t likely to be a cost-effective strategy for doing random pattern-matching tasks anytime soon. But it’d still be cheaper than training a dedicated domain-specific model, which probably wouldn’t even work without tons of labeled data anyway. And of course the cost of intelligence in these models is falling logarithmically, with no signs of stopping yet.

All this points to a near future in which it often makes sense to throw random textual-ish data into reasoning models and trust them to figure it out. You could imagine this working with:

- Biological data  
- 3D modeling/CAD data  
- Human computer use workflows  
- Physics data

...and many others, I’m sure. Indeed, it doesn’t sound that far-fetched that you could paste experimental data into a reasoning model and ask it to develop a theory that explains the data. As long as you have a textual representation of real-world data and a few ground truth labels to work from, text is poised to eat all.