# SEO Audit & Implementation Plan: Meridian Strike

## 1. Current SEO Status
- **Architecture**: The application is a React Single-Page Application (SPA) built with Vite and deployed on Netlify.
- **Rendering**: All requests currently return the same `index.html` shell (`<div id="root"></div>`), relying heavily on client-side JS.
- **Metadata**: Meta descriptions, Open Graph, and Twitter tags are entirely missing from the base HTML.
- **Discoverability**: There is no `robots.txt` or `sitemap.xml`.

## 2. Critical Indexing Problems
- **Client-Side Rendering (CSR) Bottleneck**: Because wiki content is fetched dynamically from `/wiki/*.md` and rendered client-side, crawlers that don't execute JS (or timeout waiting for fetch requests) will only see a blank page. 
- **Soft 404s**: Netlify’s SPA fallback (`/* to /index.html 200`) causes nonexistent URLs to return a `200 OK` status, which can confuse search engines and dilute crawl budget.
- **Dynamic Meta Tags**: Even if JS executes, there is currently no routing mechanism (like `react-helmet`) to update the `<title>` or `<meta>` tags when navigating between wiki pages.

## 3. Branding and Trademark-Risk Findings
> [!WARNING]
> **CRITICAL LEGAL RISK:** The current base `index.html` hardcodes the title as `<title>Mech Commander Scenario Repository</title>`. 
- **Domain**: `mech-commander-scenario-repo.netlify.app` includes "Mech Commander".
- **Repository Name**: The Github repository uses "mech-commander-scenario-repo".
- **Action Required**: The title tag in `index.html` must be immediately changed to feature "Meridian Strike" exclusively. We strongly recommend migrating to a new domain and renaming the repository to remove all legacy references.

## 4. Page-by-Page Search-Intent Map

| Route / Page | Primary Search Intent | Related Keywords |
|--------------|-----------------------|------------------|
| **`/` (Home / Scenarios)** | turn-based mech strategy game | tactical mech game for PC, turn-based robot combat game |
| **`/wiki/HOW_TO_PLAY`** | hex-grid mech combat | tactical mech board game rules, hex-grid strategy |
| **`/wiki/CAREER_THEATERS`** | tactical mercenary campaign game | mercenary campaign management, persistent pilots |
| **`/wiki/MECHS_AND_CHASSIS`** | games with localized mech damage | persistent machine damage and repairs |
| **`/wiki/WEAPONS_AND_EQUIPMENT`** | strategy games with heat management | armor and heat mechanics in turn-based games |
| **`/wiki/PILOTS_AND_SKILLS`** | games with persistent pilots | pilot injuries, XP, and death in tactical games |

## 5. Recommended Titles and Descriptions

- **Homepage**: 
  - *Title*: `Meridian Strike | Turn-Based Tactical Mech Game`
  - *Desc*: `Command a mercenary company in Meridian Strike, a turn-based hex-grid mech combat game featuring localized damage, heat management, and persistent pilots.`
- **How to Play**:
  - *Title*: `How to Play | Meridian Strike Hex-Grid Strategy`
  - *Desc*: `Learn the rules of Meridian Strike. Master positioning, line of sight, and tactical mech combat on a digital hex-grid battlefield.`
- **Mechs & Chassis**:
  - *Title*: `Mechs & Chassis | Meridian Strike`
  - *Desc*: `Explore the roster of machines in Meridian Strike. Manage armor, internal structures, and repairs to keep your mercenary company operational.`

## 6. Content Gaps
- **Homepage Context**: The root `/` path loads directly into a scenario catalogue without introducing the game. We need a prominent introductory `<h1>` and a brief descriptive paragraph explaining what Meridian Strike is.
- **Headings**: Wiki pages are loaded as markdown, but the main app shell lacks structural semantics (e.g., `<main>`, `<nav>`).

## 7. Technical Changes
- **Meta Tag Management**: Install `react-helmet-async` to dynamically inject unique titles, descriptions, and canonical URLs for every route and wiki page.
- **Robots & Sitemap**: Automatically generate `sitemap.xml` containing the home page, upload page, and all wiki routes during the build process using a custom Vite plugin or build script. Create a standard `robots.txt` pointing to the sitemap.
- **Soft 404 Prevention**: Render a proper `<NotFound />` component that sets a specific meta tag (`<meta name="robots" content="noindex" />`) so crawlers know the fallback isn't a valid page.
- **Indexable HTML**: Netlify's built-in Prerendering feature should be enabled in the Netlify Dashboard to ensure the dynamically injected React-Helmet tags and fetched markdown are compiled to static HTML before serving to bots.

## 8. Structured Data Plan
- **Homepage (`/`)**: Implement `VideoGame` Schema.org JSON-LD (without fake reviews/ratings).
- **Wiki Pages**: Implement `BreadcrumbList` and `Article` for the guides.

## 9. Prioritized Actions

1. **Change `index.html` Title**: Overwrite `<title>` to remove "Mech Commander" (Critical).
2. **Install `react-helmet-async`**: Manage dynamic page titles and descriptions.
3. **Homepage Content**: Add introductory text and an `<h1>` to `CataloguePage.tsx`.
4. **Sitemap and Robots.txt**: Create a build script to generate `public/sitemap.xml` and add a static `public/robots.txt`.
5. **Structured Data**: Inject `VideoGame` and `BreadcrumbList` schema dynamically based on the route.
6. **Error Handling**: Build a 404 handler for invalid scenarios or wiki pages that sets `noindex`.

## 10. Validation Plan
1. Run `npm run build` and ensure `sitemap.xml` generates correctly.
2. Serve locally and inspect rendered `<head>` for accurate titles and descriptions.
3. Verify invalid routes do not masquerade as valid indexed pages.
