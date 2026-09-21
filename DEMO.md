# Three-minute fictional-evidence demo

For the expanded evidence-to-scenario walkthrough, use
[ANALYTICAL_DEMO.md](ANALYTICAL_DEMO.md). This page retains the original short
library/map demonstration.

Start with a checked build, open the homepage, and keep a source editor ready at
`src/data/records.json`. All named records, findings and source material are
**fictional illustrations**, not evidence about real residents or services.
Point out the site's fictional-data banner before starting. Navigate using the
site's links so the journey follows its generated routes.

| Time | Action | Talking point |
| --- | --- | --- |
| 0:00–0:20 | Home: point to the fictional-data banner, then open the evidence library. | “This is a static prototype for finding and interpreting illustrative evidence.” |
| 0:20–0:55 | Search for `cooler`; choose **Healthy places**, **Research**, and **Older people** if demonstrating multiple filters. Open or identify **Illustrative: cooler walking routes to everyday services** (`cooler-walking-routes`). | “Search and filters narrow the published catalogue. The query describes a question, not a conclusion.” |
| 0:55–1:20 | Open the evidence map. Choose the **Healthy places × Research** cell and follow its library results; locate the same cooler-walking-routes record. | “The map counts records by theme and evidence type. Multi-theme records can appear in multiple cells: these counts are not additive totals or a quality ranking.” |
| 1:20–1:55 | Open the record. Show methods, sample/context, findings, limitations, and the **Mixed** strength judgement with its reason. | “The invented sample contains 32 older residents and six invented routes. Aligned observations do not establish health benefits or changes in journey frequency.” |
| 1:55–2:15 | Follow the record's source link and point out its illustrative labelling. Return to the record. | “This is a demo source for tracing the summary, not an actual publication. The original private JSON register is not a public source or an editing interface.” |
| 2:15–3:00 | In the editor, show the matching record in `src/data/records.json`, its summary, and `"releaseApproved": true`. Explain or demonstrate the rebuild process below. | “Publishing is a reviewed source change followed by a new static build and deployment. There is no live editing backend.” |

## Rehearse the publication change

Use `cooler-walking-routes` as the fixed walkthrough record. Add another clearly
illustrative sentence to its `useNotes` array, keeping existing wording and
classifications intact. Then run:

```sh
npm run check
npm run build
npm run test:unit
npm run test:e2e
```

Install the browser dependencies as described in [DEPLOYMENT.md](DEPLOYMENT.md)
before rehearsal. This demonstrates a normal content update while preserving the
baseline dataset used by the interaction tests.

For a Docker source deployment, publish the changed build with:

```sh
docker compose build web
docker compose up -d
```

The image build generates a fresh `dist/`; it does not upload the local `dist/`.
Use the prebuilt-image workflow in DEPLOYMENT.md when building away from the VM.
Refresh the record and show the new sentence in “Using the learning”. Approval is
enforced at build time, so neither a JSON edit nor a container restart alone
changes an existing image.

For a separate withdrawal rehearsal, set a public record's `releaseApproved` to
false, build and redeploy, then check that its old URL returns 404 and its counts
have disappeared. Dataset tests deliberately expect the baseline 18 public
records, so restore the flag and rebuild before running the standard checks.
A withdrawal does not erase copies a visitor previously downloaded.

Keep `unreleased-test-fixture` false; it exists to check that unreleased
material stays out of generated routes and browser assets. Do not move the raw
register into `public/` or import it into browser code.

For a strict three-minute presentation, show the source change and commands
without waiting for a build; prepare the rebuilt variant during rehearsal. Say
explicitly whether a change is merely being explained or has actually been
deployed. Keep the fictional labels intact when editing any sample content.
