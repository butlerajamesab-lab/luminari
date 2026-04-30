import { useMemo } from "react";
import { usePlainLanguage } from "@/contexts/PlainLanguageContext";

/**
 * Legal/forensic term → plain language mapping.
 * Only rewrites descriptions, findings, and signal text.
 * Quotes and claims stay verbatim — those are evidentiary.
 */
const REPLACEMENTS: [RegExp, string][] = [
  // Legal terms
  [/\bdeposition\b/gi, "sworn testimony"],
  [/\bdeposed\b/gi, "gave sworn testimony"],
  [/\baffidavit\b/gi, "sworn written statement"],
  [/\baffiant\b/gi, "person who made the sworn statement"],
  [/\bsubpoena(?:ed)?\b/gi, "court order to appear or produce documents"],
  [/\binterrogator(?:y|ies)\b/gi, "written questions under oath"],
  [/\bpetitioner\b/gi, "person who filed the case"],
  [/\brespondent\b/gi, "person responding to the case"],
  [/\bplaintiff\b/gi, "person bringing the lawsuit"],
  [/\bdefendant\b/gi, "person being sued"],
  [/\bpro se\b/gi, "representing themselves without a lawyer"],
  [/\bin camera\b/gi, "in private (not in open court)"],
  [/\bex parte\b/gi, "one-sided (without the other party present)"],
  [/\bstipulat(?:ion|ed)\b/gi, "agreed-upon fact"],
  [/\bpreponderance of (?:the )?evidence\b/gi, "more likely than not"],
  [/\bbeyond a reasonable doubt\b/gi, "almost certainly true"],
  [/\bprobable cause\b/gi, "reasonable grounds to believe"],
  [/\bprima facie\b/gi, "on its face / at first glance"],
  [/\bres judicata\b/gi, "already decided by a court"],
  [/\bhabeas corpus\b/gi, "right to challenge detention"],
  [/\bamicus curiae\b/gi, "friend of the court (outside advisor)"],
  [/\bsua sponte\b/gi, "on the court's own initiative"],
  [/\bvoir dire\b/gi, "jury selection questioning"],
  [/\bmotion to compel\b/gi, "request to force compliance"],
  [/\bmotion to dismiss\b/gi, "request to drop the case"],
  [/\bmotion for summary judgment\b/gi, "request to decide without trial"],
  [/\binjunction\b/gi, "court order to do or stop doing something"],
  [/\bpreliminary injunction\b/gi, "temporary court order pending trial"],
  [/\btemporary restraining order\b/gi, "emergency short-term court order"],
  [/\bseal(?:ed)?\b/gi, "kept confidential by court order"],
  [/\bredact(?:ed|ion)?\b/gi, "blacked out / removed from view"],
  [/\bpursuant to\b/gi, "according to"],
  [/\bwherein\b/gi, "in which"],
  [/\bhereinafter\b/gi, "from here on called"],
  [/\bnotwithstanding\b/gi, "despite"],
  [/\binasmuch as\b/gi, "because"],
  [/\binter alia\b/gi, "among other things"],
  [/\bsupra\b/gi, "mentioned above"],
  [/\binfra\b/gi, "mentioned below"],

  // Forensic / evidentiary terms
  [/\bcorroborat(?:es?|ing|ed|ion)\b/gi, "supports / confirms"],
  [/\bcontradicts?\b/gi, "conflicts with"],
  [/\bimpeach(?:es?|ing|ed|ment)?\b/gi, "challenges the credibility of"],
  [/\bprobative\b/gi, "tending to prove something"],
  [/\bexculpatory\b/gi, "tending to clear someone of blame"],
  [/\binculpatory\b/gi, "tending to show guilt"],
  [/\bmitigating\b/gi, "reducing the seriousness of"],
  [/\baggravating\b/gi, "increasing the seriousness of"],
  [/\bpreponderance\b/gi, "greater weight of evidence"],
  [/\btestimony\b/gi, "statements given under oath"],
  [/\balleg(?:es?|ation|ed|ing)\b/gi, "claims / stated (not yet proven)"],
];

/**
 * Apply plain language rewrites to a text string.
 * This is a presentation-layer transformation only.
 */
function toPlainText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Hook that returns a transform function.
 * When plain language mode is OFF, returns text unchanged.
 * When ON, applies the legal→plain mapping.
 * 
 * Usage:
 *   const plainify = usePlainText();
 *   <p>{plainify(finding.description)}</p>
 * 
 * DO NOT use on quotes or claims — those must stay verbatim.
 */
export function usePlainText() {
  const { enabled } = usePlainLanguage();

  return useMemo(() => {
    if (!enabled) return (text: string) => text;
    return toPlainText;
  }, [enabled]);
}
