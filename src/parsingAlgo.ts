import * as cheerio from "cheerio";
import { AnyNode, Element } from "domhandler";

interface Option {
  id: string;
  label: string;
}

export interface TableProps {
  [key: string]: {
    id?: string;
    options?: {
      1: string[];
      2: string[];
    };
  };
}

function isElement(node: AnyNode): node is Element {
  return "tagName" in node && "attribs" in node;
}

function decodeHTML(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export const sanitize = (html: string): [string, TableProps] => {
  const cleanedHtml = html;
  const $ = cheerio.load(cleanedHtml);
  const tables: TableProps = {};

  // Remove unwanted elements
  $("script, style, meta, comment").remove();

  const allowedTags = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "p",
    "a",
    "ul",
    "ol",
    "nl",
    "li",
    "b",
    "i",
    "strong",
    "em",
    "hr",
    "table",
    "thead",
    "caption",
    "tbody",
    "tr",
    "th",
    "td",
    "div",
    "html",
    "body",
  ];

  const allowedAttributes = ["id", "href", "name", "target", /^data-/];

  // Sanitize HTML
  $("*").each((_, node) => {
    if (!isElement(node)) return;

    const tagName = node.tagName.toLowerCase();
    if (!allowedTags.includes(tagName)) {
      $(node).remove();
      return;
    }

    const attribs = node.attribs || {};
    Object.keys(attribs).forEach((attr) => {
      const isAllowedAttr = allowedAttributes.some((allowed) =>
        typeof allowed === "string" ? allowed === attr : allowed.test(attr),
      );
      if (!isAllowedAttr) {
        $(node).removeAttr(attr);
      }
    });

    $(node).removeAttr("style");
  });

  // Process divs with IDs
  $("div[id]:not([id='root'])").each((_, node) => {
    if (!isElement(node)) return;

    const id = node.attribs.id;
    const optionsMap: { [key: string]: string[] } = {
      1: [],
      2: [],
    };

    // Find all descendant elements that contain options
    const dataOptions = $(node).find("[data-options]");

    for (let i = 0; i < 2; i++) {
      const option = dataOptions[i];
      const decodedOptions = decodeHTML($(option).attr("data-options") || "");
      console.log("Decoded Options: ", decodedOptions);
      JSON.parse(decodedOptions || "[]").forEach((option: Option) => {
        optionsMap[i + 1].push(option.label);
      });
    }
    console.log("Id: ", id);
    tables[id] = optionsMap ?? {};
  });

  return [$.html(), tables];
};
