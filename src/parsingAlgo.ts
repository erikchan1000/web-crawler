import sanitizeHtml from "sanitize-html";

export const sanitize = (html: string) => {
  return sanitizeHtml(html, {
    allowedTags: [
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
    ],
    nonBooleanAttributes: ["*"],
    allowedAttributes: {
      "*": ["id", "href", "name", "target", "data-*"],
    },
    allowedClasses: {},
    transformTags: {
      div: (tagName, attribs) => {
        if (!attribs["data-options"]) {
          return { tagName: "", attribs: {} }; // Remove the div entirely
        }
        return { tagName, attribs }; // Keep the div if it has data-options
      },
      "*": (tagName, attribs) => {
        delete attribs.style; // Remove the style attribute
        return { tagName, attribs };
      },
    },
  });
};
