/**
 * Word lists for the local filter (src/lib/moderation-core.ts). Kept small and deliberate: a word
 * that also has an innocent meaning – a surname, a place, a religion, an everyday word in another
 * language – is "review" (a moderator looks), never "block".
 *
 *  match "word": the whole word only        ("ass" must not catch "Assam" or "class")
 *  match "stem": a word starting with it     ("fuck" catches "fucking")
 *  match "part": anywhere inside a word      (for Telugu, Kannada and Tamil, which join words)
 *
 * Latin entries are compared after folding (src/lib/moderation-core.ts: lower case, look-alike
 * letters, leetspeak, stretched letters), so write them plain, in their usual spelling.
 */
export type Entry = { term: string; match: "word" | "stem" | "part"; severity: "block" | "review" };

export const WORDS: Entry[] = [
  // English
  { term: "fuck", match: "stem", severity: "block" },
  { term: "motherfucker", match: "part", severity: "block" },
  { term: "fuk", match: "word", severity: "block" },
  { term: "shit", match: "word", severity: "block" },
  { term: "shitty", match: "word", severity: "block" },
  { term: "bullshit", match: "word", severity: "block" },
  { term: "bitch", match: "stem", severity: "block" },
  { term: "bastard", match: "stem", severity: "block" },
  { term: "asshole", match: "stem", severity: "block" },
  { term: "cunt", match: "stem", severity: "block" },
  { term: "whore", match: "stem", severity: "block" },
  { term: "slut", match: "stem", severity: "block" },
  { term: "nigger", match: "stem", severity: "block" },
  { term: "nigga", match: "word", severity: "block" },
  { term: "retard", match: "stem", severity: "review" },
  { term: "dick", match: "word", severity: "review" },
  { term: "pussy", match: "word", severity: "review" },
  { term: "ass", match: "word", severity: "review" },

  // Telugu, typed in English letters
  { term: "lanja", match: "stem", severity: "block" },
  { term: "lanjakoduka", match: "part", severity: "block" },
  { term: "dengu", match: "word", severity: "block" },
  { term: "dengey", match: "word", severity: "block" },
  { term: "dengutha", match: "stem", severity: "block" },
  { term: "modda", match: "word", severity: "review" },
  { term: "puku", match: "word", severity: "review" },
  { term: "gudda", match: "word", severity: "review" },
  // Telugu script
  { term: "లంజ", match: "part", severity: "block" },
  { term: "దెంగు", match: "part", severity: "block" },
  { term: "దెంగ", match: "part", severity: "review" },
  { term: "మొడ్డ", match: "part", severity: "block" },
  { term: "పూకు", match: "word", severity: "block" },
  { term: "గుద్ద", match: "word", severity: "review" },

  // Kannada, typed in English letters
  { term: "bolimaga", match: "part", severity: "block" },
  { term: "boli maga", match: "part", severity: "block" },
  { term: "sule", match: "word", severity: "review" },
  { term: "tunne", match: "word", severity: "review" },
  { term: "bevarsi", match: "word", severity: "review" },
  // Kannada script
  { term: "ಸೂಳೆ", match: "part", severity: "block" },
  { term: "ಬೋಳಿಮಗ", match: "part", severity: "block" },
  { term: "ಬೋಳಿ ಮಗ", match: "part", severity: "block" },
  { term: "ತುಣ್ಣೆ", match: "part", severity: "block" },
  { term: "ತಿಕ", match: "word", severity: "review" },

  // Tamil, typed in English letters
  { term: "thevidiya", match: "stem", severity: "block" },
  { term: "punda", match: "stem", severity: "block" },
  { term: "koothi", match: "word", severity: "review" },
  { term: "oombu", match: "stem", severity: "review" },
  { term: "otha", match: "word", severity: "review" },
  // Tamil script
  { term: "தேவடியா", match: "part", severity: "block" },
  { term: "புண்ட", match: "part", severity: "block" },
  { term: "ஊம்பு", match: "part", severity: "block" },
  { term: "கூதி", match: "part", severity: "block" },
  { term: "ஓத்த", match: "word", severity: "review" },
  { term: "சுன்னி", match: "word", severity: "review" },
];
