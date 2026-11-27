# US non-federally-recognized tribes: methods

Dataset: `us_unrecognized.csv`. It has 351 records and was compiled on 2026-11-25. The build script is `build.py` and the raw OFA transcription is `ofa_2013_raw.txt`, both in the same folder.

## Principle
The dataset records only official recognition status, the community's own name and the community's own website. It assesses no legitimacy, records no disputes and summarises no history. Where I could not confirm a field, I left it empty.

## Exclusion check
I checked the data against the current federally recognized list: *Indian Entities Recognized by and Eligible To Receive Services*, 91 FR 4102-4106 (2026-01-30), https://www.govinfo.gov/content/pkg/FR-2026-01-30/html/2026-01899.htm.
- That list adds the Lumbee Tribe of North Carolina (P.L. 119-60, Dec 2025).
- It includes Little Shell, Pamunkey, the six Virginia tribes recognized in 2018 (including Chickahominy Eastern Division), Tejon, Shinnecock, Mashpee and others.
- I dropped all of these. I also dropped three petitioners that match listed entities:
  - #234 Rappahannock Indian Tribe, Inc.
  - #241 Chickahominy Indians, Eastern Division
  - #114 Canoncito Band of Navajos, which is part of the Navajo Nation.

## Sources used (primary or official)
- **Petitioner list (base):** BIA OFA *List of Petitioners by State*, as of 2013-11-12. It covers letters of intent filed before the 2015 rule.
- **Current status pages:** BIA OFA *Petitions in Process*, *Resolved* and *Re-petition* pages. I also used each petitioner's own OFA page for Federal Register (FR) citations.
- **State recognition:**
  - Alabama Indian Affairs Commission tribes list (2026)
  - Louisiana Governor's Office of Indian Affairs list
  - South Carolina Commission for Minority Affairs (advance.sc.gov) entity list
  - North Carolina G.S. Chapter 71A and the NC Commission of Indian Affairs
  - Virginia Secretary of the Commonwealth list and Virginia Division of Legislative Services (DLS)
  - Maryland Manual (executive orders of 2012 and 2017)
  - Vermont: 1 V.S.A. chapter 23
  - Georgia: O.C.G.A. 44-12-300
  - Delaware: 29 Del. C. 106 and 107
  - Connecticut: C.G.S. 47-59a
  - New Jersey Commission on American Indian Affairs and the NJ Attorney General 2019 release
  - New York Indian Law section 2
  - Massachusetts Executive Orders 126 and 637
  - Michigan Department of Civil Rights tribal directory (2017, "State Historic Tribes")
  - Texas legislative resolutions (SR 438 of 2009; HCR 171 and SCR 61 of 2019)
- **Termination:** P.L. 85-671 (72 Stat. 619) and CRS report R48888 (2026).
- **Websites:** taken from official lists where printed (AL, LA, NC, VA, MI, the California Native American Heritage Commission (NAHC) atlas), plus a few searches for prominent petitioners.
- **Discovery only:** Wikipedia pages on state-recognized and unrecognized tribes. No record cites Wikipedia.

## Counts by federal_status (351 total)
| federal_status | n |
|---|---|
| ofa_letter_of_intent | 252 |
| ofa_final_determination_negative | 31 |
| ofa_petition_active | 16 |
| ofa_withdrawn_or_inactive | 12 |
| ofa_determination_reversed (positive final determination later reversed: Eastern Pequot x2, Schaghticoke Tribal Nation, Chinook) | 4 |
| ofa_proposed_finding_negative (United Houma Nation, Biloxi-Chitimacha Confederation of Muskogees (BCCM), Pointe-au-Chien, Meherrin) | 4 |
| no_federal_petition_on_record (not on the 2013 OFA list or the current OFA pages) | 21 |
| unknown (name resembles an OFA petitioner; link not confirmed) | 9 |
| federal_terminated_not_restored | 2 |

- 65 records carry state recognition across 13 states: SC 13, LA 11, AL 8, NC 6, CT 5, VA 4, VT 4, GA 3, MD 3, NJ 3, DE 2, MA 2, NY 1.
- 9 records carry other recognition: Texas resolutions, Michigan "State Historic Tribe" directory entries, and Maryland Commission constituents.
- 41 records have an own-website URL.

## Coding rules
- **Status precedence:** active OFA status comes first, then the latest decision, then letter of intent. For example, the Affiliated Ute Citizens are coded active even though they were terminated.
- **"LOI" in the notes** means letter of intent and quotes the 2013 OFA list.
- **Joined rows:** I merged records only where the names were essentially identical, or where an official page gives the other name. Examples: #140/#411, #139/#406, #239/#401, #157/#408, #158/#403 and #138 Adai Caddo.
  - Sappony / #095 is an editorial name match and is flagged in its notes.
- **Similar names kept separate:** where a state-list name only resembles a petitioner's name, the rows stay separate and the notes give the similar name.
- **Federal decision documents** include FR receipt notices as well as findings and determinations. Dates come from the FR URLs or the BIA pages.

## Not verified / gaps
1. **Petitioners after 2013:** the 2013 list is the last complete OFA roster. Letters of intent filed after 2013, and groups that dropped out after the 2015 rule, are not on any current BIA page. The BIA OFA petitioner map layer (biamaps.geoplatform.gov, which includes a website field) blocks automated access.
2. **Proposed-finding citations missing** for #056 United Houma Nation (1994 regulations; no FR citation on the BIA page) and for the Phase I positive findings for #032, #401 and #403.
3. **Recognition years:** state recognition years are blank for AL, LA, SC, CT and NY because the official pages give none. The NC years are the session-law years of the statutes.
4. **Not included:**
   - Ohio's 1980 resolution for the United Remnant Band (secondary sources only).
   - Clatsop-Nehalem, Colfax-Todds Valley and other terminated rancheria communities: Cache Creek, Indian Ranch, Mark West, Ruffeys, Strawberry Valley and El Dorado. I could not tie the community's own name to a primary record in the time available.
   - SC "special interest organizations."
5. **Category 4 (groups with only a website and government):** I largely did not cover this category. The Wikipedia index lists roughly 200 or more further names, mostly in AR, CA, FL, GA, IN, KY and MD. Each needs its own primary-source check before it can be added.
6. **California:** the state has no recognition process. The NAHC tribal atlas lists non-federal California tribes, but its index could not be fetched.
7. **Websites:** 310 records have no website. Websites printed on the Louisiana list with malformed links are reproduced as printed.
8. **County or municipal recognition:** I found none in official sources.
