import type { EvidenceChunk } from "../types";
import type {
  EvidenceProvider,
  EvidenceProviderSearchOptions,
} from "./evidenceProvider";

type PubMedSearchResponse = {
  esearchresult?: {
    idlist?: string[];
  };
};

type PubMedArticle = {
  MedlineCitation?: {
    PMID?: string | { "#text"?: string };
    Article?: {
      ArticleTitle?: string | { "#text"?: string };
      Abstract?: {
        AbstractText?: Array<
          | string
          | {
              "#text"?: string;
              Label?: string;
            }
        >;
      };
      Journal?: {
        Title?: string;
      };
    };
  };
};

type PubMedFetchResponse = {
  PubmedArticleSet?: {
    PubmedArticle?: PubMedArticle[];
  };
};

const NCBI_EUTILS_BASE =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function textValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "#text" in value &&
    typeof value["#text"] === "string"
  ) {
    return value["#text"];
  }

  return "";
}

function parseAbstract(
  abstractText:
    | Array<string | { "#text"?: string; Label?: string }>
    | undefined,
): string {
  if (!abstractText?.length) {
    return "";
  }

  return abstractText
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      const text = part["#text"] ?? "";
      const label = part.Label;

      return label ? `${label}: ${text}` : text;
    })
    .filter(Boolean)
    .join(" ");
}

function normalizeArticle(article: PubMedArticle): EvidenceChunk | null {
  const citation = article.MedlineCitation;
  const articleData = citation?.Article;

  const pmid = textValue(citation?.PMID);
  const title = textValue(articleData?.ArticleTitle);
  const abstract = parseAbstract(articleData?.Abstract?.AbstractText);
  const journal = articleData?.Journal?.Title ?? "";

  if (!pmid || !title) {
    return null;
  }

  const content = abstract || title;

  return {
    id: `pubmed:${pmid}`,
    sourceType: "EXTERNAL_EVIDENCE",
    title,
    content,
    locator: `PMID:${pmid}`,
    url: `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`,
    metadata: {
      provider: "NCBI PubMed",
      pmid,
      journal,
    },
  };
}

export class PubMedProvider implements EvidenceProvider {
  readonly name = "NCBI PubMed";

  constructor(
    private readonly options: EvidenceProviderSearchOptions = {},
  ) {}

  async search(query: string, limit = 5): Promise<EvidenceChunk[]> {
    const safeLimit = Math.min(
      20,
      Math.max(1, Math.floor(limit)),
    );

    const timeoutMs = this.options.timeoutMs ?? 15_000;

    const searchParams = new URLSearchParams({
      db: "pubmed",
      term: query,
      retmode: "json",
      retmax: String(safeLimit),
      sort: "relevance",
      tool: "lifesci_nexus",
      email: "REPLACE_WITH_PROJECT_CONTACT_EMAIL",
    });

    const searchResponse = await fetch(
      `${NCBI_EUTILS_BASE}/esearch.fcgi?${searchParams.toString()}`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );

    if (!searchResponse.ok) {
      throw new Error(
        `NCBI PubMed search failed with HTTP ${searchResponse.status}.`,
      );
    }

    const searchData =
      (await searchResponse.json()) as PubMedSearchResponse;

    const ids = searchData.esearchresult?.idlist ?? [];

    if (ids.length === 0) {
      return [];
    }

    const fetchParams = new URLSearchParams({
      db: "pubmed",
      id: ids.join(","),
      retmode: "xml",
      rettype: "abstract",
      tool: "lifesci_nexus",
      email: "REPLACE_WITH_PROJECT_CONTACT_EMAIL",
    });

    const fetchResponse = await fetch(
      `${NCBI_EUTILS_BASE}/efetch.fcgi?${fetchParams.toString()}`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );

    if (!fetchResponse.ok) {
      throw new Error(
        `NCBI PubMed fetch failed with HTTP ${fetchResponse.status}.`,
      );
    }

    /*
     * This provider deliberately keeps the network boundary isolated.
     * The XML-to-object parser can be replaced with a dedicated XML parser
     * dependency in the next implementation step without changing the
     * EvidenceProvider contract.
     */
    const xml = await fetchResponse.text();

    return parsePubMedXmlFallback(xml);
  }
}

/**
 * Minimal PubMed XML extraction used to avoid adding an XML dependency in
 * this first provider slice. It extracts PMID, ArticleTitle and AbstractText
 * from the EFetch response and normalizes them into EvidenceChunk objects.
 */
function parsePubMedXmlFallback(xml: string): EvidenceChunk[] {
  const articles = xml.match(
    /<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g,
  );

  if (!articles) {
    return [];
  }

  return articles
    .map((articleXml): EvidenceChunk | null => {
      const pmid = extractXmlText(articleXml, "PMID");
      const title = extractXmlText(articleXml, "ArticleTitle");
      const abstractParts = [
        ...articleXml.matchAll(
          /<AbstractText(?:\s+Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/g,
        ),
      ];

      const abstract = abstractParts
        .map((match) => {
          const label = decodeXml(match[1] ?? "");
          const text = decodeXml(stripXmlTags(match[2] ?? ""));

          return label ? `${label}: ${text}` : text;
        })
        .filter(Boolean)
        .join(" ");

      if (!pmid || !title) {
        return null;
      }

      return {
        id: `pubmed:${pmid}`,
        sourceType: "EXTERNAL_EVIDENCE",
        title,
        content: abstract || title,
        locator: `PMID:${pmid}`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`,
        metadata: {
          provider: "NCBI PubMed",
          pmid,
        },
      } satisfies EvidenceChunk;
    })
    .filter((chunk): chunk is EvidenceChunk => chunk !== null);
}

function extractXmlText(xml: string, tagName: string): string {
  const match = xml.match(
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`),
  );

  return decodeXml(stripXmlTags(match?.[1] ?? ""));
}

function stripXmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const pubMedProvider = new PubMedProvider();
