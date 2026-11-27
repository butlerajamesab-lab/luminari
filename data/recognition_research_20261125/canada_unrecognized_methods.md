# Canada: Indigenous nations and communities without federal recognition. Methods

Dataset: `canada_unrecognized.csv` (27 rows). Retrieved 2026-11-25. This feeds the Recognition Atlas. The atlas principle is "we are the vessel, they are the author". Each record holds only:
- the community's own name and website, where found;
- recognition status taken from official records;
- citations to court decisions and commission records.

The dataset makes no legitimacy judgments. It does not record third-party objections or characterize identity.

## Counts

| federal_status | n |
|---|---|
| non_status_organized | 16 |
| no_band_status_seeking | 7 |
| declared_extinct | 1 |
| metis_seeking_recognition | 1 |
| other | 1 |
| unknown | 1 |

- **By province:** ON 15, AB 3, BC 3 (1 transboundary with the US), SK 2, NL 2, NB 1 (transboundary with the US), and 1 BC/AB.
- **Own website found:** 16 of 27.
- **Rows citing a court or commission document:** 13.
  - 12 rows have the `court_or_decision_documents` field filled in.
  - The Chacachas court decision is also cited in its notes.

## Exclusion check: ISC recognized-band list

**List used:** the ISC First Nation open-data layer (`Premiere_Nation_First_Nation` MapServer layer 0), queried for all BAND_NUMBER and BAND_NAME values on 2026-11-25.
- Query URL: https://geo.sac-isc.gc.ca/geomatics/rest/services/Donnees_Ouvertes-Open_Data/Premiere_Nation_First_Nation/MapServer/0
- ISC describes this dataset as the official source for First Nations locations.
- The query returned 638 bands.
- The First Nation Profiles web search (fnp-ppn.aadnc-aandc.gc.ca) could not be queried directly because it is a form-driven page.

**Check performed:** every name in the dataset was checked against those 638 names, and no row matches a listed band.

**Excluded because they are already recognized:**
- Qalipu Mi'kmaq First Nation (34)
- Miawpukek (47)
- Algonquins of Pikwakanagan (163)
- Lubicon Lake Band (453)
- Peerless Trout (478)
- Missanabie Cree (223)
- Teme Augama Anishinabek (222)
- Ochapowace (363)
- James Smith (370)
- Wolastoqiyik Wahsipekuk (54)

## Sources, in priority order

1. **Government of Canada:**
   - ISC open data and ISC briefing-note titles on open.canada.ca: ROS11435 (Beaverhouse), and ROS12111 (Peskotomuhkati, Skutik and Nagagamisis band creation).
   - CIRNAC news releases: NunatuKavut MOU 2019, Chacachas MOU 2024, Peskotomuhkati 2022.
   - CIRNAC "Negotiations in progress" table list (modified 2026-10-05) and the CIRNAC Algonquins of Ontario (AOO) negotiations page.
   - Grants and contributions disclosures (Kawartha Nishnawbe, Kelly Lake Cree Nation).
   - A Canada Energy Regulator filing (Michel First Nation).
   - ISC "Band Recognition under the Indian Act: What We Heard Report" (Feb 2026). It reports that 33 groups were invited to the New Bands/Band Amalgamations policy refresh. It names none of them.
2. **Courts:**
   - SCC: Desautel 2021 SCC 17; Lovelace 2000 SCC 37; Lameman 2008 SCC 14; dockets 38325 and 41644.
   - Federal Court: 2020 FC 129 (Chacachas); 2024 FC 896 (NunatuKavut MOU).
   - BC courts, via SCC docket summaries.
3. **Provincial governments:**
   - Ontario Algonquin land claim page.
   - BC First Nations A-Z Listing (consultation), which records Tsetsaut/Skii km Lax Ha as "INAC: None".
4. **Community websites:** used for self-names and self-descriptions only.
5. **Discovery only:**
   - Wikipedia and news outlets (CBC, APTN, CTV, Global, Western Standard), used for discovery.
   - Where a news item is the only record of a specific fact, it is cited and the notes say so.

## Court decisions applied to specific rows

- **Sinixt:** R v Desautel, 2021 SCC 17.
- **Ardoch, Kawartha Nishnawbe, Poplar Point Ojibway and Beaverhouse:** Lovelace v Ontario, 2000 SCC 37.
- **Papaschase:** Canada (AG) v Lameman, 2008 SCC 14.
- **Chacachas:** Watson/Bear v Canada, 2020 FC 129.
- **NunatuKavut:** Innu Nation v Canada, 2024 FC 896. Recorded only for the court's statement on recognition status.
- **Hwlitsum:** 2017 BCSC 475, 2018 BCCA 276, and SCC leave denied in 2019.
- **Tsetsaut/Skii km Lax Ha:** 2024 BCSC 1432, 2024 BCCA 406, SCC 41644 (reserved), and 2026 BCSC 1042 (reported only).
- **Michel and Stoney Knoll:** Indian Claims Commission inquiries (commission records, not courts).

### Decisions not attached to a row

- **Daniels v Canada, 2016 SCC 12:** a general ruling that Métis and non-status Indians are "Indians" under s. 91(24). It is not specific to any community, so it is not attached to a row.
- **Qalipu enrolment litigation** (e.g., Howse v Canada, 2015 FC 1063, and later Wells matters): this concerns individual enrolment in a recognized band (Qalipu), so no row was created for it.

## Status coding choices

- **Algonquins of Ontario (AOO) communities (9 rows):** coded `non_status_organized`, with the provincial field noting the tripartite negotiations. The 2016 Agreement-in-Principle is not a treaty in force.
- **NunatuKavut:** coded `no_band_status_seeking`, because the community seeks federal recognition of rights. It is an Inuit collective, not a band.
- **Beaverhouse:** coded `other`. This is the borderline row. Canada accepted a claim in 2022 that recognized Beaverhouse as a section 35 rights-bearing collectivity, but Indian Act band status was still in process as of the ISC briefing notes of March and October 2025. It is not in the ISC list.
- **Poplar Point Ojibway:** coded `unknown`. The only official record found dates from 2000.

## What could not be verified

- **Shabot Obaadjiwan:**
  - The own site (sofn.band) could not be fetched.
  - The self-name is taken from the AOO list.
- **Bonnechere:**
  - The self-name could not be confirmed, because bafn.ca reproduces AOO content.
  - The name is taken from the AOO/Ontario list.
- **No own website located for:** Whitney and Area, Antoine Nation, Kawartha Nishnawbe, Poplar Point, Beaverhouse, Nagagamisis, Michel, Hwlitsum, Chacachas, Stoney Knoll and Tsetsaut.
- **Michel ICC report and Peter Chapman ICC report:** the Library and Archives Canada web archive was rate-limited. The Michel ICC report is cited by URL but was not read.
- **Young Chipeewayan ICC inquiry:** no official-host URL was found.
- **Nagagamisis First Nation:** known only from an ISC briefing-note title. The self-name and location were not confirmed.
- **Aseniwuche Winewak Nation's 1974 Alberta agreements:** described from AWN's own site. No Alberta government page was located.
- **Tsetsaut 2026 BCSC 1042:** the judgment text was not retrieved. Only the news report was read.

### Leads not included, for lack of an official or primary record

- **Peter Chapman Band (SK):** seeking re-establishment separately from James Smith Cree Nation (CBC, 2025). The article could not be fetched.
- **Kichesipirini Algonquin First Nation (ON).**
- **Kelly Lake First Nation and Kelly Lake Métis Settlement Society (BC):** separate from Kelly Lake Cree Nation, which is included.
- **Bonnechere Métis Association and Be-Wab-Bon Métis and Non-Status Indian Association:** named in Lovelace (2000). Their current self-description is unverified.
- **Self-identified Métis communities in Quebec and Nova Scotia:** for example, the Communauté métisse du Domaine-du-Roy et de la Seigneurie de Mingan (Corneau, 2018 QCCA 1172, leave refused). These were not reviewed systematically, and none was confirmed to describe itself as seeking recognition, so none was included.

### Other limits

- **ISC list date:** the list reflects the open-data layer on the retrieval date. Band creations completed after the layer's last refresh would not appear.
- **Provincial registries not reviewed:** no provincial registry other than Ontario's and BC's was reviewed systematically. Quebec, the Atlantic provinces, the Prairies and the territories may have further non-band collectives.
