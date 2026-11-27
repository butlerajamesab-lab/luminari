# success_routes.csv: methods

Dataset: `success_routes.csv` (111 rows). This is the success-route layer for the Recognition Atlas comparison matrix. Each row records how recognition came: the route, the decision documents and the dates. Nothing in it describes the nation itself ("we are the vessel, they are the author"). Compiled 2026-11-25. Build scripts are in `../scripts/build*.py`, and raw working notes are in `notes_raw.md`.

## Scope
- **US:** groups that went from not federally recognized (or terminated) to federally recognized from 1960 onward. The dataset also includes positive acknowledgments that were later reversed (`status=reversed`).
- **Canada:** bodies of Indians declared to be a band since 1960 by Governor in Council order under the Indian Act, s. 2(1) "band" para. (c) and s. 73(3).

## Sources, in order of authority
1. **OFA petition pages** (`bia.gov/as-ia/ofa/resolved/<slug>`) and the Federal Register, IBIA and PDF links those pages give. These cover all 18 Part 83 acknowledgments and the 3 reversed cases.
2. **OFA Status Summary (2013-11-12)** for Part 83 effective dates and for cases resolved by Congress or by other means.
3. **Statutes at Large** on govinfo (`STATUTE-<vol>-Pg<page>.pdf`). Each statute was opened and its Pub. L. number, date, page and operative sentence were checked. Exceptions: Auburn and the two Pub. L. 106-568 titles were checked through U.S. Code source credits, and Little Shell and Lumbee through CRS R48888 (2026-03-30).
4. **GAO-02-49 (Nov. 2001), Table 3** for administrative recognitions made outside Part 83 (before and after 1978), which list only a date and the type of decision.
5. **Federal Register notices and court or agency records** for court and settlement restorations: 49 FR 24084 (Hardwick), 74 FR 33468 (Wilton), AS-IA letters citing 57 FR 5214 and 57 FR 19133, the Tenth Circuit opinion for Delaware, and 61 FR 50862 and 74 FR 40218.
6. **91 FR 4102 (2026-01-30)**, the current list of recognized entities, for `nation_name_current_official`.
7. **Canada:** consolidated regulations on Justice Laws (SOR/89-533, SOR/2002-414, SOR/2002-415, SOR/2011-180).
8. **Wikipedia** was used only as a discovery index. The 7 rows that rest on it are marked `UNVERIFIED` in `notes_factual_only` and have no `decision_date` or documents.

## Field rules
- **`route`:**
  - `ofa_acknowledgment` means 25 CFR Part 83 only.
  - Pre-1978 BIA administrative recognitions (the brief's category a) are coded `other`, because OFA and Part 83 did not exist yet. Their notes say "Pre-1978 BIA/Department administrative decision". Remap them if the matrix wants them grouped under (a).
  - `congressional_restoration` vs `congressional_recognition` follows the statute's own wording ("restore/reinstate" vs "recognize/extend"). Where GAO-02-49 classifies a statute differently, the notes say so.
  - Karuk (1979), Jamul (1981) and Delaware (2009 reorganization) are coded `other`.
- **`decision_date`:**
  - Part 83: the effective date from the OFA Status Summary. Pamunkey is the exception: it uses the FD publication date because no effective date was found.
  - Statutes: the enactment date.
  - Court routes: the date of the order or judgment.
  - Secretarial routes: the signature or decision date.
  - Canada: the registration or order date.
  - Reversed rows: the publication date of the positive decision. The reversal date is in the notes and documents.
- **`petition_filed_date`:** the letter-of-intent year as labeled on the OFA page. It is left empty where the page shows only the 1978 petitioner list (44 FR 116).
- **`years_from_first_petition_to_recognition`:** year of `decision_date` minus the LOI year. It is filled only when both are known.
- **`decision_documents`:** entries in the form `citation | date | URL`, separated by semicolons.
- **`own_website_url`:** left empty for every row. No nation website was checked in this pass, and the brief says to leave fields empty rather than guess.

## Exclusions and open items
- **Duwamish (petition #025) is excluded.** 80 FR 39142 (2015-07-08) describes the 2001-01-19 action as an "unsigned draft" decision. The only final determination was negative: dated 2001-09-25 (66 FR 49966) and effective 2002-05-08. *Hansen v. Salazar* remanded it on 2013-03-22, and a Final Decision on Remand against acknowledgment was signed 2015-07-02. No acknowledgment ever took effect, so it does not meet the `reversed` definition.
- **Fernandeño Tataviam (petition #158):** the petition was withdrawn 2021-09-08. It is not a recognition.
- **Canada:** bands created under Indian Act s. 17 by dividing or amalgamating existing bands (for example Woodland Cree, Loon River, Peerless Trout) are not captured. No consolidated primary list was found. Only the four Governor in Council band orders listed under the Indian Act on Justice Laws are included. The current ISC name for the Miawpukek band was not verified.
- **Unverified court rows:** Robinson, Hopland, Upper Lake, Table Bluff (Wiyot), Big Sandy, Table Mountain and Lytton still need checking against court dockets or the Federal Register.
- **Text not retrieved directly:** the texts of 57 FR 5214, 57 FR 19133 and the GAO-listed administrative decision letters were not opened. Their citations come from the agency documents named in each row.
- **Older notices:** federalregister.gov URLs for older documents are copied as OFA links them, with the slug truncated by OFA.
