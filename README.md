# Ground Truth Strata

**Explore what Americans actually experience with social media and technology —
wave by wave, variable by variable.**

Strata is an open, interactive data explorer built on a two-year longitudinal
panel survey of U.S. adults' experiences with social media and digital technology.
It is part of the [Ground Truth with Matt Motyl](https://mattmotyl.com) project,
which follows the evidence on how technology shapes people, institutions, and society.

🔍 **[Launch Strata →](https://strata.mattmotyl.com)**

---

## What Strata Does

Strata lets researchers, policymakers, lawyers, journalists, and curious people
explore findings from a six-wave longitudinal survey of U.S. adults conducted
between 2023 and 2025. Rather than waiting for published reports, visitors can:

- Compare psychological and demographic groups on their technology experiences
- Explore correlations between wellbeing, platform use, and online experiences
- Track trends across six survey waves
- Download charts and summary tables for use in research, litigation, or reporting

Strata is designed to support data literacy and open inquiry. Every visualization
includes plain-English summaries, methodological notes, and suggested citations.

---

## The Data

The underlying data come from the **Understanding America Study (UAS)**, a
probability-based internet panel maintained by the University of Southern
California's Center for Economic and Social Research. The UAS is one of the
most methodologically rigorous survey panels in the United States.

The survey was co-designed and led by Matt Motyl, Nate Fast, Juliana Schroeder,
and Ravi Iyer. Data collection covered six waves between 2023 and 2025, with
more than 1,600 respondents per wave. Variables include platform use and frequency,
positive and negative online, experiences, wellbeing, loneliness, depression,
anxiety, personality traits, political attitudes, beliefs about social media,
attitudes toward technology regulation, among others.

**The raw data are not available for direct download here.** Researchers
interested in the full dataset can request access through the
[Understanding America Study](https://uasdata.usc.edu).

---

## A Note on Architecture

Strata is built on a **pre-computed JSON pipeline** rather than a live query
server. All analyses — correlations, group comparisons, wave trends — are
computed in R locally and output as static JSON files that the web app reads
directly.

We made this choice deliberately: it keeps hosting costs at zero, ensures the
tool remains free and accessible indefinitely, and eliminates server-side
compute dependencies. The tradeoff is that Strata cannot currently support
fully user-defined analyses that I have not already generated the JSON file
for and uploaded or user-uploaded datasets. We see those as future directions
worth pursuing if demand and resources allow.

If you're a researcher or developer interested in extending Strata's
capabilities, see [Contributing](#contributing).

---

## Built With

- **R** — data cleaning, preprocessing, and pre-computation pipeline (`/r`)
- **Next.js / React** — web application
- **Vercel** — deployment and hosting
- **MIT License** — code is free to fork, extend, and adapt. Citation is appreciated.

---

## Repository Structure

```
ground-truth-strata/
├── r/                  # R scripts: cleaning, preprocessing, JSON output
│   ├── clean/          # Variable-specific cleaning functions
│   ├── precompute/     # Correlation, comparison, and trend pipelines
│   └── output/         # Generated JSON (also copied to /public/data)
├── public/
│   └── data/           # Pre-computed JSON files served by the app
├── src/                # Next.js application
│   ├── components/     # React components
│   └── pages/          # App pages and routing
├── citation.cff        # Machine-readable citation metadata
└── README.md
```

---

## Local Development

> Requirements: Node.js 18+, R 4.x, tidyverse, jsonlite

**1. Clone the repo**

```bash
git clone https://github.com/mattmotyl/ground-truth-strata.git
cd ground-truth-strata
```

**2. Install Node dependencies**

```bash
npm install
```

**3. Run the preprocessing pipeline**

Open R and run the scripts in `/r/precompute/` in order. Output JSON files
will be written to `/public/data/`. You will need the cleaned UAS data files
locally — see [The Data](#the-data) for access information.

**4. Run the development server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Citation

If you use Strata or its outputs in research, litigation, reporting, or any
other work, please cite it as follows.

**APA**

> Motyl, M. (2026). *Ground Truth Strata* (Version 0.1.0) [Software].
> https://strata.mattmotyl.com

**BibTeX**

```bibtex
@software{motyl2026strata,
  author  = {Motyl, Matt},
  title   = {Ground Truth Strata},
  year    = {2026},
  version = {0.1.0},
  url     = {https://strata.mattmotyl.com}
}
```

GitHub also generates citation exports automatically from the `citation.cff`
file in this repository — look for the **Cite this repository** button on the
repo homepage.

---

## Contributing

Strata is open source and we welcome contributions — whether that means
extending the R preprocessing pipeline to cover new variables, improving the
UI, adding new analysis types, or adapting the tool for a different dataset.

To get started, open an issue describing what you have in mind. Pull requests
are welcome.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

The UAS survey data underlying Strata are subject to separate terms set by the
Understanding America Study. This license covers the Strata codebase only.

---

## About Ground Truth

Strata is part of **Ground Truth with Matt Motyl** — a research, communication,
and tools project that follows the evidence on how technology shapes people,
institutions, and society.

*Following the evidence. Making it matter.*

[mattmotyl.com](https://mattmotyl.com) ·
[Substack](https://mattmotyl.substack.com) ·
[YouTube](https://youtube.com/@GroundTruthMatt) ·
[Duco Experts](https://app.ducoexperts.com/users/matt-motyl)