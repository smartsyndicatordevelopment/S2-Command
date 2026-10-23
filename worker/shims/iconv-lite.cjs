// A small stand-in for the iconv-lite package on Cloudflare. The real one ships a browser setting that removes a file
// it loads at start, which breaks the JSON body parser in Workers. Request bodies here only need the text encodings
// the platform already decodes (UTF-8 and the common single-byte ones), and TextDecoder does that.
"use strict";

function encodingExists(encoding) {
  try {
    new TextDecoder(encoding);
    return true;
  } catch {
    return false;
  }
}

function decode(buffer, encoding) {
  return new TextDecoder(encoding || "utf-8").decode(buffer);
}

function encode(text, encoding) {
  const label = String(encoding || "utf-8").toLowerCase();
  if (label === "utf-8" || label === "utf8") return Buffer.from(text, "utf8");
  throw new Error("Only UTF-8 can be encoded here.");
}

function getDecoder(encoding) {
  const decoder = new TextDecoder(encoding || "utf-8");
  return {
    write: (chunk) => decoder.decode(chunk, { stream: true }),
    end: () => decoder.decode() || undefined,
  };
}

module.exports = { encodingExists, decode, encode, getDecoder };
