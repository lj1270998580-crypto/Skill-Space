export type SkillReferenceCandidate = {
  id: string;
  name: string;
  tags?: string[];
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isSkillReferenced(corpus: string, skill: SkillReferenceCandidate): boolean {
  const haystack = corpus.toLowerCase();
  const needles = [skill.id, skill.name, ...(skill.tags ?? [])]
    .map((item) => item.toLowerCase().trim())
    .filter((item) => item.length > 2);
  return needles.some((needle) => new RegExp(`(^|[^a-z0-9_-])${escapeRegex(needle)}([^a-z0-9_-]|$)`, "i").test(haystack));
}

export function referencedSkillIds(
  corpus: string,
  candidates: SkillReferenceCandidate[],
  sourceSkillId: string,
  sourceSkillRoot?: string,
  rootById?: Map<string, string>
): string[] {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.id === sourceSkillId) {
      continue;
    }
    if (sourceSkillRoot && rootById?.get(candidate.id) === sourceSkillRoot) {
      continue;
    }
    if (isSkillReferenced(corpus, candidate)) {
      seen.add(candidate.id);
    }
  }
  return [...seen];
}
