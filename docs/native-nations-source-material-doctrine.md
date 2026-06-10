# Native Nations Source Material Doctrine

This doctrine governs Recognition Atlas, Recognition Gideon, RTR, Native Nations Hub, tribal cards, and all tribe-specific source-packet layers.

## Core rule

Source material stops being source material when it is summarized, compressed, paraphrased, or detached from citation.

No cutting corners is permitted in the Native Nations layer.

## Display rule

A tribal card or layer may display only:

1. exact tribal-authored wording with citation,
2. exact tribe-affiliated wording with citation and source posture,
3. structured extraction from a cited source where the field value preserves the source wording as far as the field allows,
4. clearly labeled external-source material with citation,
5. clearly separated Luminari / Lighthouse analysis.

## Forbidden

The following are not acceptable as displayed record content:

- placeholders,
- generic summaries standing in for source material,
- uncited descriptions,
- invented phrasing,
- paraphrased tribal voice,
- compressed ally calls,
- count-only substitutes where full entries exist,
- route cards that replace the actual record.

## Required field posture

Every displayed field must preserve or expose:

- value,
- source_posture,
- citation_url or source URL,
- authorship when available,
- review status.

## Source posture meanings

`verbatim_tribal_source` means the wording is exact and must not be changed.

`structured_extraction_from_tribal_source` means the data is extracted from tribal source material. Preserve the wording wherever the source gives wording.

`tribe_affiliated_source` means the material comes from a tribe-affiliated source and must be labeled as such.

`external_source` means the material is external and must not be presented as tribal voice.

`lighthouse_analysis` means Luminari / Lighthouse analysis. It must be separated from tribal records and must not speak for a tribe.

## Recognition Atlas architecture

`/recognition-atlas` is a presentation and routing hub. It must not carry tribe-specific record depth.

`/recognition-atlas/:tribe_id` is the tribal card page and may carry tribe-specific record depth.

`/recognition-atlas/:tribe_id/:layer_slug` is the deep source-packet page and must render the full available source-packet fields for that layer.

## Luminari commitment

The framework is the vessel. They are the author.

`luminari_commitment: we_are_the_vessel_they_are_the_author`
