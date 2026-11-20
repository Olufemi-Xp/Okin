/**
 * Smart Word Prediction & Typo Suggestion Engine for Okin
 * - Fast, zero-lag client-side prefix matching for word completions.
 * - Levenshtein distance + curated typo map for spelling corrections.
 * - Respects case styling (lowercase, TitleCase, UPPERCASE).
 */

export interface SuggestionItem {
  word: string;
  type: "completion" | "correction";
  originalWord: string;
}

// Common misspellings and typos mapped to correct words
export const COMMON_TYPOS: Record<string, string> = {
  // Common conversational / chat typos
  teh: "the",
  taht: "that",
  thier: "their",
  thsi: "this",
  waht: "what",
  wich: "which",
  wiht: "with",
  yuo: "you",
  yuor: "your",
  recieve: "receive",
  recieved: "received",
  recieving: "receiving",
  seperate: "separate",
  seperated: "separated",
  definately: "definitely",
  definate: "definite",
  untill: "until",
  occured: "occurred",
  occuring: "occurring",
  beleive: "believe",
  beleived: "believed",
  wierd: "weird",
  alot: "a lot",
  accommodate: "accommodate",
  accomodate: "accommodate",
  acheive: "achieve",
  acheived: "achieved",
  accross: "across",
  agressive: "aggressive",
  apparant: "apparent",
  apparantly: "apparently",
  arguement: "argument",
  assasination: "assassination",
  basicly: "basically",
  becuase: "because",
  becoming: "becoming",
  beggining: "beginning",
  begining: "beginning",
  bizzare: "bizarre",
  buisness: "business",
  busines: "business",
  calender: "calendar",
  collegue: "colleague",
  collegate: "colleague",
  comming: "coming",
  completly: "completely",
  concious: "conscious",
  curiosity: "curiosity",
  definatelyy: "definitely",
  dilema: "dilemma",
  dissapear: "disappear",
  dissappoint: "disappoint",
  embarass: "embarrass",
  embarassed: "embarrassed",
  enviroment: "environment",
  existance: "existence",
  fascinating: "fascinating",
  finaly: "finally",
  flourescent: "fluorescent",
  foriegn: "foreign",
  fourty: "forty",
  freind: "friend",
  goverment: "government",
  gratefull: "grateful",
  garantee: "guarantee",
  garentee: "guarantee",
  guidence: "guidance",
  happend: "happened",
  harrass: "harass",
  heigth: "height",
  heirarchy: "hierarchy",
  humerous: "humorous",
  ignorant: "ignorant",
  immediatly: "immediately",
  incidently: "incidentally",
  independant: "independent",
  inteligence: "intelligence",
  interupt: "interrupt",
  irresistable: "irresistible",
  knowlege: "knowledge",
  liason: "liaison",
  libary: "library",
  lisence: "license",
  lightening: "lightning",
  maintainance: "maintenance",
  millenium: "millennium",
  mischevious: "mischievous",
  mispell: "misspell",
  neccessary: "necessary",
  necesary: "necessary",
  noticable: "noticeable",
  ocassion: "occasion",
  occassion: "occasion",
  occurrance: "occurrence",
  oppurtunity: "opportunity",
  outragous: "outrageous",
  paralell: "parallel",
  peice: "piece",
  persistant: "persistent",
  posession: "possession",
  possession: "possession",
  potatos: "potatoes",
  prefered: "preferred",
  preceeding: "preceding",
  priviledge: "privilege",
  probaly: "probably",
  procced: "proceed",
  pronounciation: "pronunciation",
  publically: "publicly",
  realy: "really",
  recomended: "recommended",
  reccomend: "recommend",
  refered: "referred",
  religous: "religious",
  rember: "remember",
  resistence: "resistance",
  rythm: "rhythm",
  ryhthm: "rhythm",
  secratary: "secretary",
  sence: "sense",
  sieze: "seize",
  similer: "similar",
  speach: "speech",
  succesful: "successful",
  supercede: "supersede",
  suprise: "surprise",
  tendancy: "tendency",
  therefor: "therefore",
  threshhold: "threshold",
  tommorow: "tomorrow",
  tommorrow: "tomorrow",
  tongue: "tongue",
  truely: "truly",
  twelth: "twelfth",
  tyrany: "tyranny",
  underate: "underrate",
  unforseen: "unforeseen",
  unfortunatly: "unfortunately",
  unneccessary: "unnecessary",
  untilll: "until",
  vaccum: "vacuum",
  vegatarian: "vegetarian",
  vehical: "vehicle",
  visable: "visible",
  weather: "weather",
  wether: "whether",
  wierdo: "weirdo",
  writting: "writing",
  yeild: "yield",
  // Game & AI prompt words
  chekers: "checkers",
  cheker: "checker",
  chek: "check",
  checkin: "checking",
  propmt: "prompt",
  promt: "prompt",
  functoin: "function",
  funtion: "function",
  algoritm: "algorithm",
  algorythm: "algorithm",
  pyton: "python",
  pyhton: "python",
  javascrip: "javascript",
  sumarize: "summarize",
  sumary: "summary",
  shedule: "schedule",
  schedul: "schedule",
  remidner: "reminder",
  remider: "reminder",
  direciton: "direction",
  direcitons: "directions",
  asistant: "assistant",
  assistnat: "assistant",
  mesage: "message",
  messsage: "message",
};

// Curated high-frequency English + tech/AI chat dictionary
export const DICTIONARY: string[] = [
  // Common conversation & actions
  "about", "above", "across", "action", "actually", "address", "after", "again", "against", "ahead",
  "almost", "already", "alright", "always", "among", "analyze", "analysis", "another", "answer",
  "anyone", "anything", "anyway", "anywhere", "appear", "application", "approach", "appropriate",
  "around", "article", "assistant", "attach", "attachment", "available", "average", "awesome",
  "beautiful", "because", "become", "before", "beginning", "behind", "believe", "benefit",
  "better", "between", "beyond", "billion", "browser", "building", "business", "button",
  "calculate", "calendar", "camera", "cancel", "cannot", "capable", "capital", "capture",
  "careful", "category", "central", "certain", "certainly", "challenge", "change", "chapter",
  "character", "chat", "check", "checker", "checkers", "checking", "checklist", "checkout",
  "choice", "choose", "circle", "clarify", "clean", "clear", "clearly", "client", "climate",
  "close", "coding", "collect", "collection", "column", "combine", "comfortable", "command",
  "comment", "common", "communicate", "community", "company", "compare", "complete", "completely",
  "complex", "component", "compose", "computer", "concept", "condition", "conference", "confirm",
  "connect", "connection", "consider", "consistent", "constant", "construct", "consult", "contact",
  "contain", "content", "continue", "continuous", "control", "conversation", "convert", "coordinate",
  "correct", "country", "course", "create", "creation", "creative", "credit", "criteria", "critical",
  "current", "currently", "custom", "customer", "damage", "database", "decision", "decrease",
  "default", "define", "definition", "degree", "delete", "deliver", "demand", "department",
  "describe", "description", "design", "detail", "detailed", "detect", "develop", "developer",
  "development", "device", "difference", "different", "difficult", "digital", "direct", "direction",
  "directions", "directory", "discover", "discuss", "discussion", "display", "distance", "document",
  "documentation", "download", "drawing", "during", "dynamic", "earlier", "easily", "economic",
  "economy", "education", "effective", "efficiency", "efficient", "effort", "either", "element",
  "eliminate", "email", "emerge", "emphasis", "enable", "encounter", "encourage", "energy",
  "engine", "engineer", "engineering", "enhance", "enough", "ensure", "entire", "environment",
  "equipment", "especially", "essential", "establish", "estimate", "evaluate", "evening",
  "everyone", "everything", "everywhere", "evidence", "exactly", "example", "excellent", "exchange",
  "execute", "execution", "exercise", "existing", "expand", "expect", "expensive", "experience",
  "experiment", "expert", "explain", "explanation", "explore", "export", "express", "extend",
  "extension", "external", "extra", "facility", "factor", "factory", "familiar", "family",
  "famous", "fantasy", "fantastic", "fastapi", "father", "feature", "federal", "feedback",
  "feeling", "female", "figure", "financial", "finish", "firefox", "flight", "floating",
  "florida", "focus", "follow", "following", "football", "forecast", "foreign", "forever",
  "forget", "format", "fortune", "forward", "framework", "freedom", "frequency", "friend",
  "friendly", "frontend", "function", "functional", "functionality", "fundamental", "further",
  "future", "galaxy", "gallery", "general", "generate", "generation", "generator", "generic",
  "genetic", "genuine", "geography", "geometry", "github", "glance", "global", "golden",
  "google", "governor", "government", "grammar", "grandfather", "graphic", "grateful",
  "greatest", "grocery", "ground", "growth", "guarantee", "guidance", "guide", "guideline",
  "habitat", "handle", "happen", "hardware", "harmony", "headline", "headquarters", "healthy",
  "hearing", "heaven", "height", "helpful", "heritage", "highlight", "highway", "historic",
  "history", "holiday", "honest", "horizontal", "hospital", "household", "however", "humorous",
  "hundred", "husband", "identity", "illustrate", "illustration", "imagine", "immediate",
  "immediately", "immense", "impact", "implement", "implementation", "important", "impossible",
  "impress", "impression", "improve", "improvement", "incident", "include", "including",
  "income", "increase", "incredible", "indeed", "independent", "indicate", "individual",
  "industry", "inform", "information", "initial", "initiative", "injury", "inline", "inner",
  "innocent", "innovate", "innovation", "innovative", "input", "inquire", "inside", "insight",
  "inspect", "inspiration", "inspire", "install", "instance", "instant", "instead", "institute",
  "institution", "instruction", "insurance", "integrate", "integration", "intelligence",
  "intelligent", "intend", "intention", "interface", "internal", "international", "internet",
  "interpret", "interval", "interview", "introduce", "introduction", "invest", "investigate",
  "investment", "investor", "invite", "involve", "isolated", "javascript", "journey", "judgment",
  "justice", "justify", "keyboard", "kitchen", "knowledge", "landscape", "language", "laptop",
  "launch", "lawyer", "leader", "leadership", "leading", "learning", "leather", "legacy",
  "legend", "length", "lesson", "letter", "level", "library", "license", "limited", "linear",
  "listener", "literature", "little", "living", "location", "logical", "machine", "magazine",
  "maintain", "maintenance", "manage", "management", "manager", "manual", "manufacturer",
  "market", "marriage", "material", "mathematics", "matter", "maximum", "meaning", "measure",
  "measurement", "mechanism", "medical", "medicine", "medium", "meeting", "member", "membership",
  "memory", "mention", "message", "method", "middle", "military", "million", "minimize",
  "minimum", "minister", "minute", "mirror", "mission", "mistake", "mobile", "moderate",
  "modern", "modify", "moment", "monitor", "monthly", "morning", "mortgage", "mostly",
  "mother", "motion", "motivate", "mountain", "movement", "multiple", "museum", "musical",
  "narrow", "nation", "national", "natural", "naturally", "nature", "navigate", "navigation",
  "nearly", "necessary", "negative", "negotiate", "neighbor", "neither", "nervous", "network",
  "neutral", "nevertheless", "newspaper", "normal", "normally", "northern", "notebook",
  "nothing", "notice", "noticeable", "notion", "novel", "nuclear", "number", "numerous",
  "object", "objective", "observe", "observer", "obtain", "obvious", "obviously", "occasion",
  "occasional", "occupation", "occupy", "occur", "office", "officer", "official", "offline",
  "okin", "ongoing", "online", "operate", "operating", "operation", "operator", "opinion",
  "opportunity", "oppose", "opposite", "option", "orange", "ordinary", "organizer", "origin",
  "original", "otherwise", "outcome", "outline", "outside", "overall", "overcome", "package",
  "painting", "paragraph", "parallel", "parent", "parliament", "participate", "particle",
  "particular", "particularly", "partner", "partnership", "passage", "passenger", "passion",
  "patient", "pattern", "payment", "peaceful", "peculiar", "penalty", "pending", "people",
  "percentage", "perfect", "perfectly", "perform", "performance", "perhaps", "period",
  "permanent", "permission", "permit", "personal", "personality", "perspective", "persuade",
  "phenomenon", "philosophy", "photograph", "phrase", "physical", "physics", "picture",
  "pipeline", "planet", "platform", "player", "pleasant", "pleasure", "plenty", "pocket",
  "poetry", "police", "policy", "political", "politics", "pollution", "popular", "population",
  "position", "positive", "possibility", "possible", "possibly", "potato", "potential",
  "poverty", "powder", "powerful", "practical", "practice", "precise", "predict", "preference",
  "premise", "premium", "preparation", "prepare", "presence", "present", "presentation",
  "preserve", "president", "press", "pressure", "prevent", "previous", "previously", "primary",
  "prime", "primitive", "principal", "principle", "priority", "prison", "privacy", "private",
  "probability", "probable", "probably", "problem", "procedure", "proceed", "process",
  "produce", "product", "production", "profession", "professional", "professor", "profile",
  "program", "programmer", "programming", "progress", "project", "promise", "promote",
  "prompt", "pronounce", "proof", "proper", "properly", "property", "proportion", "proposal",
  "propose", "prospect", "protect", "protection", "protein", "protest", "proud", "prove",
  "provide", "province", "psychology", "public", "publication", "publish", "publisher",
  "purchase", "purpose", "pursue", "puzzle", "python", "qualification", "quality", "quantity",
  "quarter", "question", "quickly", "radical", "railway", "random", "rapidly", "rarely",
  "reaction", "reader", "reading", "ready", "reality", "realize", "really", "reason",
  "reasonable", "recall", "receive", "recent", "recently", "recipe", "recognition", "recognize",
  "recommend", "recommendation", "record", "recover", "recovery", "reduce", "reduction",
  "reference", "reflect", "reflection", "reform", "refugee", "refuse", "regard", "regarding",
  "regardless", "region", "regional", "register", "regular", "regularly", "regulate",
  "regulation", "reinforce", "reject", "relate", "relation", "relationship", "relative",
  "relatively", "relax", "release", "relevant", "reliability", "reliable", "relief",
  "religion", "religious", "remain", "remarkable", "remember", "remind", "reminder", "remote",
  "remove", "render", "repeat", "replace", "reply", "report", "reporter", "represent",
  "representative", "reputation", "request", "require", "requirement", "research", "resemble",
  "reserve", "resident", "resist", "resistance", "resolve", "resource", "respect", "respond",
  "response", "responsibility", "responsible", "restaurant", "restore", "restrict", "restriction",
  "result", "retain", "retire", "reveal", "revenue", "reverse", "review", "revolution",
  "reward", "rhythm", "ridiculous", "routine", "running", "safety", "sample", "satisfaction",
  "satisfy", "scenario", "schedule", "scheme", "scholar", "scholarship", "science", "scientific",
  "scientist", "scratch", "screen", "script", "search", "season", "secondary", "secret",
  "secretary", "section", "sector", "secure", "security", "segment", "selection", "senate",
  "senator", "senior", "sentence", "separate", "sequence", "series", "serious", "seriously",
  "service", "session", "settle", "settlement", "several", "severe", "shadow", "shimmer",
  "shortly", "shoulder", "sidebar", "signal", "significant", "significantly", "silence",
  "silver", "similar", "similarity", "simple", "simply", "simulate", "simulation", "since",
  "single", "situation", "skill", "slight", "slightly", "smooth", "smoothly", "social",
  "society", "software", "solution", "somebody", "somehow", "someone", "something", "sometimes",
  "somewhat", "somewhere", "source", "southern", "spanish", "speaker", "special", "specialist",
  "specific", "specifically", "spectrum", "speech", "spending", "spiritual", "spokesman",
  "spread", "spring", "square", "stable", "standard", "statement", "station", "statistic",
  "status", "steady", "storage", "straight", "strange", "stranger", "strategic", "strategy",
  "stream", "street", "strength", "strengthen", "stress", "stretch", "strict", "strike",
  "string", "stroke", "strong", "strongly", "structure", "struggle", "student", "studio",
  "subject", "submit", "subsequent", "substance", "substantial", "succeed", "success",
  "successful", "successfully", "sudden", "suddenly", "suffer", "sufficient", "suggest",
  "suggestion", "suitable", "summarize", "summary", "summer", "summit", "support", "suppose",
  "supreme", "surface", "surgery", "surprise", "surround", "survey", "survival", "survive",
  "suspect", "suspend", "sustain", "symbol", "sympathy", "symptom", "system", "tactics",
  "target", "technical", "technique", "technology", "telephone", "telescope", "television",
  "temperature", "temporary", "tenant", "tendency", "terminal", "terrible", "territory",
  "texture", "thanks", "theater", "theme", "theory", "therapy", "therefore", "thinking",
  "thorough", "thoroughly", "though", "thought", "threat", "threaten", "threshold", "through",
  "throughout", "ticket", "timeline", "tissue", "together", "tomorrow", "tonight", "topic",
  "total", "totally", "towards", "tradition", "traditional", "traffic", "tragedy", "training",
  "transfer", "transform", "transformation", "transition", "translate", "translation",
  "transmission", "transport", "transportation", "travel", "treasury", "treatment", "tremendous",
  "triangle", "trigger", "tropical", "trouble", "typical", "typically", "ultimate", "ultimately",
  "unable", "unbelievable", "uncertain", "unclear", "uncomfortable", "unconscious", "undergo",
  "underlying", "understand", "understanding", "undertake", "unemployed", "unexpected",
  "unfortunate", "unfortunately", "uniform", "unique", "universal", "universe", "university",
  "unknown", "unless", "unlike", "unlikely", "unprecedented", "unusual", "update", "upgrade",
  "upload", "upright", "urgent", "useful", "utility", "vacation", "valuable", "variable",
  "variation", "variety", "various", "vehicle", "venture", "version", "vertical", "victory",
  "viewer", "village", "violate", "violation", "violence", "virtual", "virtually", "visible",
  "vision", "visual", "vital", "vocabulary", "volume", "voluntary", "volunteer", "vulnerable",
  "warning", "warrant", "wealthy", "weapon", "weather", "website", "weekend", "welcome",
  "welfare", "western", "whatever", "whenever", "whereas", "wherever", "whether", "whisper",
  "whoever", "widget", "willing", "window", "wisdom", "withdraw", "within", "without",
  "wonderful", "workflow", "workplace", "workshop", "worldwide", "worried", "writing", "yesterday"
];

// Deduplicate and lower-case
const UNIQUE_WORDS = Array.from(new Set(DICTIONARY.map((w) => w.toLowerCase())));

/**
 * Fast Levenshtein distance for typo correction
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      let val: number;
      if (a[i - 1] === b[j - 1]) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

/**
 * Restore original casing pattern (lower, TitleCase, UPPER)
 */
export function applyCase(original: string, target: string): string {
  if (!original || !target) return target;
  if (original === original.toUpperCase() && original.length > 1) {
    return target.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1).toLowerCase();
  }
  return target.toLowerCase();
}

/**
 * Extract active word and boundaries at the caret position
 */
export function getActiveWordAtCaret(
  text: string,
  caretPos: number
): { word: string; start: number; end: number } | null {
  if (!text || caretPos < 0) return null;

  // Word boundary characters (whitespace, quotes, brackets, punctuation)
  const isBoundary = (ch: string) => /[\s\n\r\t.,!?;:()[\]{}"'`<>=/\\|]/.test(ch);

  // If caret is preceded by a boundary, nothing active to complete
  if (caretPos > 0 && isBoundary(text[caretPos - 1])) {
    return null;
  }

  // Scan backwards to start of word
  let start = caretPos;
  while (start > 0 && !isBoundary(text[start - 1])) {
    start--;
  }

  // Scan forward to end of word
  let end = caretPos;
  while (end < text.length && !isBoundary(text[end])) {
    end++;
  }

  const word = text.slice(start, end).trim();
  // We only suggest for words with at least 2 characters
  if (word.length < 2) return null;

  // Don't suggest inside URLs or slash commands
  if (word.startsWith("/") || word.startsWith("http") || word.startsWith("www.")) {
    return null;
  }

  return { word, start, end };
}

/**
 * Get intelligent word suggestions and typo corrections for a given input word
 */
export function getWordSuggestions(
  rawWord: string,
  maxResults = 4
): SuggestionItem[] {
  if (!rawWord || rawWord.length < 2) return [];

  const lower = rawWord.toLowerCase();
  const suggestions: SuggestionItem[] = [];
  const seen = new Set<string>();

  // 1. Check direct typo dictionary first (high-confidence instant correction)
  if (COMMON_TYPOS[lower]) {
    const corrected = COMMON_TYPOS[lower];
    const cased = applyCase(rawWord, corrected);
    suggestions.push({
      word: cased,
      type: "correction",
      originalWord: rawWord,
    });
    seen.add(corrected.toLowerCase());
  }

  // 2. Prefix completion (starts with the typed characters)
  const completions = UNIQUE_WORDS.filter(
    (w) => w.startsWith(lower) && w !== lower
  );

  // Sort completions: exact length proximity first, then alphabetical
  completions.sort((a, b) => a.length - b.length || a.localeCompare(b));

  for (const comp of completions) {
    if (suggestions.length >= maxResults) break;
    if (!seen.has(comp)) {
      seen.add(comp);
      suggestions.push({
        word: applyCase(rawWord, comp),
        type: "completion",
        originalWord: rawWord,
      });
    }
  }

  // 3. Typo / Misspelling Detection via Levenshtein fuzzy matching
  // Only trigger typo search if no exact prefix match or if word length >= 3
  if (suggestions.length < maxResults && lower.length >= 3 && !UNIQUE_WORDS.includes(lower)) {
    const maxDist = lower.length <= 4 ? 1 : 2;
    const fuzzyCandidates: { word: string; dist: number }[] = [];

    for (const dictWord of UNIQUE_WORDS) {
      // Fast length filter: difference in lengths must be <= maxDist
      if (Math.abs(dictWord.length - lower.length) > maxDist) continue;
      // Skip if already in suggestions
      if (seen.has(dictWord)) continue;

      const dist = levenshteinDistance(lower, dictWord);
      if (dist > 0 && dist <= maxDist) {
        fuzzyCandidates.push({ word: dictWord, dist });
      }
    }

    fuzzyCandidates.sort((a, b) => a.dist - b.dist || a.word.length - b.word.length);

    for (const cand of fuzzyCandidates) {
      if (suggestions.length >= maxResults) break;
      if (!seen.has(cand.word)) {
        seen.add(cand.word);
        suggestions.push({
          word: applyCase(rawWord, cand.word),
          type: "correction",
          originalWord: rawWord,
        });
      }
    }
  }

  return suggestions;
}
