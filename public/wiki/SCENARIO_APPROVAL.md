# Community Review

Every custom **scenario** and **campaign** submitted to the Meridian Strike community repository is checked twice before players can see it: automated validation, then a human review.

Pending items are not in the public catalogue, detail pages, latest download, thumbnails, or revision download URLs.

Public wiki: `https://meridian-strike-wiki.netlify.app/wiki/SCENARIO_APPROVAL`

---

## Phase 1: Automated validation

Create, import, export, fork, and playtest locally from **Custom Scenarios** or **Campaign Workshop**, even while signed out. Sign in only to submit, update, check private status, or withdraw.

The game validates the complete package before it talks to the network. The server repeats every check and never trusts the client.

1. **Completeness** — scenario or campaign, embedded missions, maps, dialogue, media, identities, and progression links.
2. **Map bounds** — units, deploy zones, and extraction zones exist on the painted map.
3. **Versions** — supported game and format versions only.
4. **Safety** — 4,000,000 compressed bytes, 20 MiB expanded, safe paths, 1 MiB images, no community video, no official campaign ID collisions.

If Phase 1 passes, the item is **pending**. It is still private.

---

## Phase 2: Human review

An administrator opens `https://meridian-strike-wiki.netlify.app/admin` and inspects the pending revision.

Repeated guideline violations can result in a ban from community publishing.

### Content

Zero tolerance in titles, descriptions, briefings, and radio chatter for hate speech, NSFW or sexually explicit themes, or real-world political/religious propaganda.

### Licensing

You must own or have rights to the thumbnail and other images.

### Playability

Admins may reject unplayable deploys, softlocks, spam, blank tests, or clones of official campaigns with no meaningful change.

---

## Verdicts

| Result               | What players see                                                                        |
| -------------------- | --------------------------------------------------------------------------------------- |
| **Approved**         | That exact revision becomes public.                                                     |
| **Revision pending** | The new revision stays private. The last approved revision stays public.                |
| **Rejected**         | The owner status shows the moderator's reason. The last approved revision stays public. |
| **Withdrawn**        | The listing leaves the catalogue. Local installs keep working.                          |

Approval always names a revision. A later author upload cannot silently replace the bytes an admin already reviewed.
