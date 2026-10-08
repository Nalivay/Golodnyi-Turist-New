// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// src/utils/voiceOrderParser.ts
var RUSSIAN_NUMBER_WORDS = {
  "\u043D\u043E\u043B\u044C": 0,
  "\u043D\u0443\u043B\u044C": 0,
  "\u043E\u0434\u0438\u043D": 1,
  "\u043E\u0434\u043D\u0430": 1,
  "\u043E\u0434\u043D\u043E": 1,
  "\u043E\u0434\u043D\u0443": 1,
  "\u0434\u0432\u0430": 2,
  "\u0434\u0432\u0435": 2,
  "\u0442\u0440\u0438": 3,
  "\u0447\u0435\u0442\u044B\u0440\u0435": 4,
  "\u043F\u044F\u0442\u044C": 5,
  "\u0448\u0435\u0441\u0442\u044C": 6,
  "\u0441\u0435\u043C\u044C": 7,
  "\u0432\u043E\u0441\u0435\u043C\u044C": 8,
  "\u0434\u0435\u0432\u044F\u0442\u044C": 9,
  "\u0434\u0435\u0441\u044F\u0442\u044C": 10,
  "\u043E\u0434\u0438\u043D\u043D\u0430\u0434\u0446\u0430\u0442\u044C": 11,
  "\u0434\u0432\u0435\u043D\u0430\u0434\u0446\u0430\u0442\u044C": 12,
  "\u0442\u0440\u0438\u043D\u0430\u0434\u0446\u0430\u0442\u044C": 13,
  "\u0447\u0435\u0442\u044B\u0440\u043D\u0430\u0434\u0446\u0430\u0442\u044C": 14,
  "\u043F\u044F\u0442\u043D\u0430\u0434\u0446\u0430\u0442\u044C": 15,
  "\u0448\u0435\u0441\u0442\u043D\u0430\u0434\u0446\u0430\u0442\u044C": 16,
  "\u0441\u0435\u043C\u043D\u0430\u0434\u0446\u0430\u0442\u044C": 17,
  "\u0432\u043E\u0441\u0435\u043C\u043D\u0430\u0434\u0446\u0430\u0442\u044C": 18,
  "\u0434\u0435\u0432\u044F\u0442\u043D\u0430\u0434\u0446\u0430\u0442\u044C": 19,
  "\u0434\u0432\u0430\u0434\u0446\u0430\u0442\u044C": 20,
  "\u0442\u0440\u0438\u0434\u0446\u0430\u0442\u044C": 30,
  "\u0441\u043E\u0440\u043E\u043A": 40,
  "\u043F\u044F\u0442\u044C\u0434\u0435\u0441\u044F\u0442": 50,
  "\u0448\u0435\u0441\u0442\u044C\u0434\u0435\u0441\u044F\u0442": 60,
  "\u0441\u0435\u043C\u044C\u0434\u0435\u0441\u044F\u0442": 70,
  "\u0432\u043E\u0441\u0435\u043C\u044C\u0434\u0435\u0441\u044F\u0442": 80,
  "\u0434\u0435\u0432\u044F\u043D\u043E\u0441\u0442\u043E": 90,
  "\u0441\u0442\u043E": 100,
  "\u0434\u0432\u0435\u0441\u0442\u0438": 200,
  "\u0442\u0440\u0438\u0441\u0442\u0430": 300,
  "\u0447\u0435\u0442\u044B\u0440\u0435\u0441\u0442\u0430": 400,
  "\u043F\u044F\u0442\u044C\u0441\u043E\u0442": 500
};
function normalizeRu(str) {
  return str.toLowerCase().replace(/ё/g, "\u0435").trim();
}
function extractRussianQuantity(text, defaultUnit) {
  const lower = text.toLowerCase().trim();
  if (/пол[\s-]?кило(?:грамм[а-я]*)?/i.test(lower)) {
    const clean = lower.replace(/пол[\s-]?кило(?:грамм[а-я]*)?/gi, "").trim();
    return { quantity: 0.5, unit: "\u043A\u0433", cleanText: clean };
  }
  if (/ноль[\s,.]+(?:пять|целых\s+пять\s+десятых|точка\s+пять)/i.test(lower)) {
    const clean = lower.replace(/ноль[\s,.]+(?:пять|целых\s+пять\s+десятых|точка\s+пять)/gi, "").trim();
    return { quantity: 0.5, unit: "\u043A\u0433", cleanText: clean };
  }
  if (/полтор[аы](?:[\s-]*(?:кило(?:грамм[а-я]*)?|штуки?|пачки?|упаковки?))?/i.test(lower)) {
    const clean = lower.replace(/полтор[аы]/gi, "").trim();
    return { quantity: 1.5, unit: defaultUnit || "\u043A\u0433", cleanText: clean };
  }
  const withHalfMatch = lower.match(/(?:(\d+)|(один|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять))\s+с\s+половиной(?:\s*(?:кило(?:грамм[а-я]*)?|кг|пач[а-я]*|упаков[а-я]*|штук[а-я]*|шт|литр[а-я]*|л))?/i);
  if (withHalfMatch) {
    const whole = withHalfMatch[1] ? parseFloat(withHalfMatch[1]) : RUSSIAN_NUMBER_WORDS[withHalfMatch[2]?.toLowerCase()] || 0;
    const clean = lower.replace(withHalfMatch[0], "").trim();
    return { quantity: whole + 0.5, unit: defaultUnit || "\u043A\u0433", cleanText: clean };
  }
  if (/(?:500|пятьсот)\s*(?:грамм[а-я]*|г\b)/i.test(lower)) {
    const clean = lower.replace(/(?:500|пятьсот)\s*(?:грамм[а-я]*|г\b)/gi, "").trim();
    return { quantity: 0.5, unit: "\u043A\u0433", cleanText: clean };
  }
  if (/(?:250|двести\s+пятьдесят)\s*(?:грамм[а-я]*|г\b)|четверть\s+кило(?:грамм[а-я]*)?/i.test(lower)) {
    const clean = lower.replace(/(?:250|двести\s+пятьдесят)\s*(?:грамм[а-я]*|г\b)|четверть\s+кило(?:грамм[а-я]*)?/gi, "").trim();
    return { quantity: 0.25, unit: "\u043A\u0433", cleanText: clean };
  }
  const digitRegex = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(кг|килограмм[а-я]*|кило|пач[а-я]*|упаков[а-я]*|шт[а-я]*|штук[а-я]*|бутыл[а-я]*|бут|банок|банк[а-я]*|литр[а-я]*|л\b)?/i;
  const digitMatch = lower.match(digitRegex);
  if (digitMatch) {
    const num = parseFloat(digitMatch[1].replace(",", "."));
    if (!isNaN(num) && num > 0) {
      const rawUnit = digitMatch[2]?.toLowerCase();
      let matchedUnit = defaultUnit;
      if (rawUnit) {
        if (rawUnit.startsWith("\u043A\u0433") || rawUnit.startsWith("\u043A\u0438\u043B\u043E")) matchedUnit = "\u043A\u0433";
        else if (rawUnit.startsWith("\u043F\u0430\u0447") || rawUnit.startsWith("\u0443\u043F\u0430\u043A\u043E\u0432")) matchedUnit = "\u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0430";
        else if (rawUnit.startsWith("\u0448\u0442")) matchedUnit = "\u0448\u0442";
        else if (rawUnit.startsWith("\u0431\u0443\u0442\u044B\u043B") || rawUnit === "\u0431\u0443\u0442") matchedUnit = "\u0431\u0443\u0442\u044B\u043B\u043A\u0430";
        else if (rawUnit.startsWith("\u0431\u0430\u043D\u043A")) matchedUnit = "\u0431\u0430\u043D\u043A\u0430";
        else if (rawUnit.startsWith("\u043B\u0438\u0442\u0440") || rawUnit === "\u043B") matchedUnit = "\u043B";
      }
      const clean = lower.replace(digitMatch[0], "").trim();
      return { quantity: num, unit: matchedUnit, cleanText: clean };
    }
  }
  const wordTokens = lower.split(/\s+/);
  for (let i = 0; i < wordTokens.length; i++) {
    const token = wordTokens[i];
    if (RUSSIAN_NUMBER_WORDS[token] !== void 0) {
      let num = RUSSIAN_NUMBER_WORDS[token];
      if (i + 1 < wordTokens.length && RUSSIAN_NUMBER_WORDS[wordTokens[i + 1]] !== void 0 && num >= 20 && RUSSIAN_NUMBER_WORDS[wordTokens[i + 1]] < 10) {
        num += RUSSIAN_NUMBER_WORDS[wordTokens[i + 1]];
        i++;
      }
      let matchedUnit = defaultUnit;
      if (i + 1 < wordTokens.length) {
        const nextWord = wordTokens[i + 1];
        if (nextWord.startsWith("\u043A\u0438\u043B\u043E") || nextWord === "\u043A\u0433") {
          matchedUnit = "\u043A\u0433";
        } else if (nextWord.startsWith("\u043F\u0430\u0447") || nextWord.startsWith("\u0443\u043F\u0430\u043A\u043E\u0432")) {
          matchedUnit = "\u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0430";
        } else if (nextWord.startsWith("\u0448\u0442\u0443\u043A") || nextWord === "\u0448\u0442") {
          matchedUnit = "\u0448\u0442";
        } else if (nextWord.startsWith("\u043B\u0438\u0442\u0440") || nextWord === "\u043B") {
          matchedUnit = "\u043B";
        } else if (nextWord.startsWith("\u0431\u0443\u0442\u044B\u043B")) {
          matchedUnit = "\u0431\u0443\u0442\u044B\u043B\u043A\u0430";
        } else if (nextWord.startsWith("\u0431\u0430\u043D\u043A")) {
          matchedUnit = "\u0431\u0430\u043D\u043A\u0430";
        }
      }
      const clean = lower.replace(new RegExp(`(?:^|\\s)${token}(?:\\s|$)`, "gi"), " ").replace(/(?:^|\s)(?:кило(?:грамм[а-я]*)?|кг|пач[а-я]*|упаков[а-я]*|штук[а-я]*|шт|литр[а-я]*|л|бутыл[а-я]*|банк[а-я]*)(?:\s|$)/gi, " ").trim();
      return { quantity: num, unit: matchedUnit, cleanText: clean };
    }
  }
  return null;
}
function cleanSearchText(text) {
  return text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").replace(/(?:^|\s)(?:давай|пожалуйста|возьми|добавь|плюс|запиши|надо|нужно|еще|ещё|мне|нам|сделай|поставь|открой|перейдем|перейдём|в|на)(?:\s|$)/gi, " ").replace(/(?:^|\s)(?:кило(?:грамм[а-я]*)?|кг|пач[а-я]*|упаков[а-я]*|штук[а-я]*|шт|литр[а-я]*|л|бутыл[а-я]*|банк[а-я]*|грамм[а-я]*|г)(?:\s|$)/gi, " ").replace(/\s+/g, " ").trim();
}
function checkNavigationCommand(text) {
  const lower = text.toLowerCase().trim();
  const isNav = /отдел|перейд|откро|покажи|давай|переключ/i.test(lower) || /^(?:овощи|мясо|бакалея|бар|хозка|хоз-ка|хозтовары|молочка|молочные|хлеб|прочее|все|всё)$/i.test(lower);
  if (!isNav && !/овощной|мясной|бакалейный|барный|молочный|хлебный/i.test(lower)) {
    return null;
  }
  if (/овощ|зелен|фрукт/i.test(lower)) {
    return {
      type: "navigation",
      department: "vegetables",
      spokenResponse: "\u041E\u0442\u043A\u0440\u044B\u043B \u043E\u0442\u0434\u0435\u043B \u041E\u0432\u043E\u0449\u0438."
    };
  }
  if (/мяс|рыб|птиц|колбас/i.test(lower)) {
    return {
      type: "navigation",
      department: "meat",
      spokenResponse: "\u041E\u0442\u043A\u0440\u044B\u043B \u043E\u0442\u0434\u0435\u043B \u041C\u044F\u0441\u043E."
    };
  }
  if (/бакале/i.test(lower)) {
    return {
      type: "navigation",
      department: "grocery",
      spokenResponse: "\u041E\u0442\u043A\u0440\u044B\u043B \u043E\u0442\u0434\u0435\u043B \u0411\u0430\u043A\u0430\u043B\u0435\u044F."
    };
  }
  if (/(?:^|\s)бар(?:\s|$)|напит/i.test(lower)) {
    return {
      type: "navigation",
      department: "bar",
      spokenResponse: "\u041E\u0442\u043A\u0440\u044B\u043B \u043E\u0442\u0434\u0435\u043B \u0411\u0430\u0440."
    };
  }
  if (/хоз|расходник|хим|салфет|пакет|мыло/i.test(lower)) {
    return {
      type: "navigation",
      department: "consumables",
      spokenResponse: "\u041E\u0442\u043A\u0440\u044B\u043B \u043E\u0442\u0434\u0435\u043B \u0425\u043E\u0437-\u043A\u0430."
    };
  }
  if (/молоч/i.test(lower)) {
    return {
      type: "navigation",
      department: "dairy",
      spokenResponse: "\u041E\u0442\u043A\u0440\u044B\u043B \u043E\u0442\u0434\u0435\u043B \u041C\u043E\u043B\u043E\u0447\u043D\u044B\u0435."
    };
  }
  if (/хлеб/i.test(lower)) {
    return {
      type: "navigation",
      department: "bread",
      spokenResponse: "\u041E\u0442\u043A\u0440\u044B\u043B \u043E\u0442\u0434\u0435\u043B \u0425\u043B\u0435\u0431."
    };
  }
  if (/проч/i.test(lower)) {
    return {
      type: "navigation",
      department: "other",
      spokenResponse: "\u041E\u0442\u043A\u0440\u044B\u043B \u043E\u0442\u0434\u0435\u043B \u041F\u0440\u043E\u0447\u0435\u0435."
    };
  }
  if (/(?:^|\s)вс[её](?:\s|$)|все товары/i.test(lower)) {
    return {
      type: "navigation",
      department: "all",
      spokenResponse: "\u041E\u0442\u043A\u0440\u044B\u043B \u0432\u0441\u0435 \u0442\u043E\u0432\u0430\u0440\u044B."
    };
  }
  return null;
}
function getRussianStem(word) {
  let w = normalizeRu(word);
  w = w.replace(/(?:ок|ек|ов|ев|ей|ам|ами|ах|ом|ем|ой|ею|ую|юю|ыми|ими|ых|их|ого|его|ому|ему)$/, "");
  w = w.replace(/[аяоеуюыиэьъ]$/, "");
  return w.length >= 3 ? w : normalizeRu(word);
}
function findMatchingProduct(productQuery, catalog) {
  const query = normalizeRu(productQuery);
  if (!query) return null;
  let bestProduct = null;
  let highestScore = 0;
  for (const p of catalog) {
    const name = normalizeRu(p.name);
    const aliases = (p.aliases || []).map((a) => normalizeRu(a));
    if (name === query || aliases.includes(query)) {
      return { product: p, score: 100 };
    }
    if (name.includes(query) || query.includes(name)) {
      const score = 85 + Math.min(name.length, query.length) / Math.max(name.length, query.length) * 10;
      if (score > highestScore) {
        highestScore = score;
        bestProduct = p;
      }
    }
    for (const alias of aliases) {
      if (alias.includes(query) || query.includes(alias)) {
        const score = 80;
        if (score > highestScore) {
          highestScore = score;
          bestProduct = p;
        }
      }
    }
    const words = query.split(/\s+/).filter((w) => w.length >= 3);
    for (const w of words) {
      const stem = getRussianStem(w);
      if (name.includes(stem) || getRussianStem(name).includes(stem)) {
        const score = 75;
        if (score > highestScore) {
          highestScore = score;
          bestProduct = p;
        }
      }
      for (const a of aliases) {
        if (a.includes(stem) || getRussianStem(a).includes(stem)) {
          const score = 70;
          if (score > highestScore) {
            highestScore = score;
            bestProduct = p;
          }
        }
      }
    }
  }
  return bestProduct && highestScore >= 60 ? { product: bestProduct, score: highestScore } : null;
}
function parseVoiceTranscriptLocally(transcript, catalog, activeCategory, pendingClarification) {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return {
      type: "unknown_command",
      spokenResponse: "\u042F \u0432\u0430\u0441 \u043D\u0435 \u0443\u0441\u043B\u044B\u0448\u0430\u043B. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435."
    };
  }
  const navResult = checkNavigationCommand(trimmed);
  if (navResult) {
    return navResult;
  }
  if (pendingClarification && pendingClarification.productId) {
    const targetProduct = catalog.find((p) => p.id === pendingClarification.productId);
    if (targetProduct) {
      const qtyRes = extractRussianQuantity(trimmed, targetProduct.defaultUnit);
      if (qtyRes && qtyRes.quantity > 0) {
        const unit = qtyRes.unit || targetProduct.defaultUnit || "\u043A\u0433";
        const formattedQty = String(qtyRes.quantity).replace(".", ",");
        return {
          type: "add_item",
          productId: targetProduct.id,
          productName: targetProduct.name,
          quantity: qtyRes.quantity,
          unit,
          spokenResponse: `\u041F\u0440\u0438\u043D\u044F\u0442\u043E. ${targetProduct.name} \u2014 ${formattedQty} ${unit}.`
        };
      }
    }
  }
  const qtyResult = extractRussianQuantity(trimmed);
  const remainingText = qtyResult ? qtyResult.cleanText : trimmed;
  const cleanedSearch = cleanSearchText(remainingText);
  if (!cleanedSearch && qtyResult) {
    return {
      type: "clarification",
      spokenResponse: "\u041A\u0430\u043A\u043E\u0439 \u0442\u043E\u0432\u0430\u0440 \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u0435 " + qtyResult.quantity + "?",
      clarificationQuestion: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435, \u043A\u0430\u043A\u043E\u0439 \u0442\u043E\u0432\u0430\u0440 \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C"
    };
  }
  const match = findMatchingProduct(cleanedSearch, catalog);
  if (match) {
    const product = match.product;
    const unit = qtyResult && qtyResult.unit || product.defaultUnit || "\u043A\u0433";
    if (qtyResult && qtyResult.quantity > 0) {
      const formattedQty = String(qtyResult.quantity).replace(".", ",");
      return {
        type: "add_item",
        productId: product.id,
        productName: product.name,
        quantity: qtyResult.quantity,
        unit,
        spokenResponse: `\u041F\u0440\u0438\u043D\u044F\u0442\u043E. ${product.name} \u2014 ${formattedQty} ${unit}.`
      };
    }
    let question = `\u0421\u043A\u043E\u043B\u044C\u043A\u043E ${product.defaultUnit === "\u043A\u0433" ? "\u043A\u0438\u043B\u043E\u0433\u0440\u0430\u043C\u043C\u043E\u0432" : product.defaultUnit === "\u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0430" ? "\u0443\u043F\u0430\u043A\u043E\u0432\u043E\u043A" : "\u0448\u0442\u0443\u043A"} \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C?`;
    if (product.name.toLowerCase().endsWith("\u044B") || product.name.toLowerCase().endsWith("\u0438")) {
      question = `\u0421\u043A\u043E\u043B\u044C\u043A\u043E ${product.name.toLowerCase()} \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C?`;
    } else {
      question = `\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \xAB${product.name}\xBB?`;
    }
    return {
      type: "clarification",
      productId: product.id,
      productName: product.name,
      unit: product.defaultUnit,
      clarificationQuestion: question,
      spokenResponse: question
    };
  }
  const cleanCandidate = cleanSearchText(remainingText);
  const suggestedName = cleanCandidate ? cleanCandidate.charAt(0).toUpperCase() + cleanCandidate.slice(1) : "\u041D\u043E\u0432\u044B\u0439 \u0442\u043E\u0432\u0430\u0440";
  return {
    type: "unknown_product",
    suggestedNewProductName: suggestedName,
    spokenResponse: "\u0422\u0430\u043A\u043E\u0433\u043E \u0442\u043E\u0432\u0430\u0440\u0430 \u043D\u0435\u0442 \u0432 \u0441\u043F\u0438\u0441\u043A\u0435. \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0442\u043E\u0432\u0430\u0440?"
  };
}

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
app.use(express.json({ limit: "10mb" }));
var PORT = 3e3;
var apiKey = process.env.GEMINI_API_KEY;
var ai = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
} else {
  console.warn("GEMINI_API_KEY is not set in environment.");
}
app.post("/api/voice-order-parse", async (req, res) => {
  const { transcript, catalog, activeCategory, currentOrder, pendingClarification } = req.body;
  if (!transcript || typeof transcript !== "string") {
    res.status(400).json({ error: "Transcript is required" });
    return;
  }
  if (ai) {
    try {
      const catalogSummary = (catalog || []).slice(0, 300).map((p) => ({
        id: p.id,
        name: p.name,
        cat: p.category,
        unit: p.defaultUnit || "\u043A\u0433",
        aliases: (p.aliases || []).slice(0, 5)
      }));
      const systemInstruction = `\u0422\u044B \u2014 \u0440\u0443\u0441\u0441\u043A\u043E\u044F\u0437\u044B\u0447\u043D\u044B\u0439 \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0439 \u043F\u043E\u043C\u043E\u0449\u043D\u0438\u043A \u0434\u043B\u044F \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0437\u0430\u044F\u0432\u043A\u0438 \u043D\u0430 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u044B \u0432 \u0440\u0435\u0441\u0442\u043E\u0440\u0430\u043D\u0435.

\u041F\u0420\u0410\u0412\u0418\u041B\u0410 \u0418 \u041E\u0413\u0420\u0410\u041D\u0418\u0427\u0415\u041D\u0418\u042F (\u0421\u0422\u0420\u041E\u0416\u0410\u0419\u0428\u0415 \u0421\u041E\u0411\u041B\u042E\u0414\u0410\u0419):
1. \u0415\u0434\u0438\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0445 \u0442\u043E\u0432\u0430\u0440\u043E\u0432 \u2014 \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0439 catalog.
2. \u0415\u0421\u041B\u0418 \u041D\u0410\u0417\u0412\u0410\u041D\u041D\u041E\u0413\u041E \u0422\u041E\u0412\u0410\u0420\u0410 \u041D\u0415\u0422 \u0412 \u0421\u0423\u0429\u0415\u0421\u0422\u0412\u0423\u042E\u0429\u0415\u041C \u041A\u0410\u0422\u0410\u041B\u041E\u0413\u0415:
   \u041D\u0418 \u0412 \u041A\u041E\u0415\u041C \u0421\u041B\u0423\u0427\u0410\u0415 \u043D\u0435 \u043F\u0440\u0438\u0434\u0443\u043C\u044B\u0432\u0430\u0439, \u043D\u0435 \u043F\u043E\u0434\u043C\u0435\u043D\u044F\u0439 \u0438 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u0432\u0430\u0439 \u043F\u043E\u0445\u043E\u0436\u0438\u0439 \u0442\u043E\u0432\u0430\u0440!
   \u0412\u0435\u0440\u043D\u0438:
   "type": "unknown_product",
   "spokenResponse": "\u0422\u0430\u043A\u043E\u0433\u043E \u0442\u043E\u0432\u0430\u0440\u0430 \u043D\u0435\u0442 \u0432 \u0441\u043F\u0438\u0441\u043A\u0435. \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0442\u043E\u0432\u0430\u0440?",
   "suggestedNewProductName": \u043D\u043E\u0440\u043C\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\u043D\u043E\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u0430 \u0441 \u0437\u0430\u0433\u043B\u0430\u0432\u043D\u043E\u0439 \u0431\u0443\u043A\u0432\u044B (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 "\u041C\u0430\u043D\u0433\u043E").
3. \u0415\u0421\u041B\u0418 \u042D\u0422\u041E \u041A\u041E\u041C\u0410\u041D\u0414\u0410 \u041D\u0410\u0412\u0418\u0413\u0410\u0426\u0418\u0418 \u041F\u041E \u041E\u0422\u0414\u0415\u041B\u0410\u041C:
   \u041F\u0440\u0438\u043C\u0435\u0440\u044B: "\u041E\u0442\u043A\u0440\u043E\u0439 \u043E\u0432\u043E\u0449\u043D\u043E\u0439 \u043E\u0442\u0434\u0435\u043B", "\u0422\u0435\u043F\u0435\u0440\u044C \u0434\u0430\u0432\u0430\u0439 \u043C\u044F\u0441\u043D\u043E\u0435", "\u041F\u0435\u0440\u0435\u0439\u0434\u0451\u043C \u0432 \u0431\u0430\u043A\u0430\u043B\u0435\u044E", "\u0411\u0430\u0440", "\u0425\u043E\u0437\u0442\u043E\u0432\u0430\u0440\u044B".
   \u0412\u0435\u0440\u043D\u0438:
   "type": "navigation",
   "department": \u043E\u0434\u043D\u043E \u0438\u0437 ["vegetables", "meat", "grocery", "bar", "consumables", "other", "dairy", "bread", "all"],
   "spokenResponse": "\u041E\u0442\u043A\u0440\u044B\u043B \u043E\u0442\u0434\u0435\u043B [\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435]" (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: "\u041E\u0442\u043A\u0440\u044B\u043B \u043E\u0442\u0434\u0435\u043B \u041E\u0432\u043E\u0449\u0438.").
4. \u0415\u0421\u041B\u0418 \u0422\u041E\u0412\u0410\u0420 \u041D\u0410\u0417\u0412\u0410\u041D, \u041D\u041E \u041A\u041E\u041B\u0418\u0427\u0415\u0421\u0422\u0412\u041E \u0418\u041B\u0418 \u0415\u0414\u0418\u041D\u0418\u0426\u0410 \u0418\u0417\u041C\u0415\u0420\u0415\u041D\u0418\u042F \u041D\u0415\u041F\u041E\u041D\u042F\u0422\u041D\u042B:
   \u041D\u0415 \u0423\u0413\u0410\u0414\u042B\u0412\u0410\u0419! \u0417\u0430\u0434\u0430\u0439 \u0443\u0442\u043E\u0447\u043D\u044F\u044E\u0449\u0438\u0439 \u0432\u043E\u043F\u0440\u043E\u0441.
   \u0412\u0435\u0440\u043D\u0438:
   "type": "clarification",
   "productId": id \u043D\u0430\u0439\u0434\u0435\u043D\u043D\u043E\u0433\u043E \u0442\u043E\u0432\u0430\u0440\u0430,
   "productName": \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u0430,
   "clarificationQuestion": \u0443\u0442\u043E\u0447\u043D\u044F\u044E\u0449\u0438\u0439 \u0432\u043E\u043F\u0440\u043E\u0441 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u043A\u0438\u043B\u043E\u0433\u0440\u0430\u043C\u043C\u043E\u0432 \u043A\u0430\u0440\u0442\u043E\u0444\u0435\u043B\u044F \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C?"),
   "spokenResponse": \u0442\u043E\u0442 \u0436\u0435 \u0432\u043E\u043F\u0440\u043E\u0441.
5. \u0415\u0421\u041B\u0418 \u041F\u041E\u0417\u0418\u0426\u0418\u042F \u0418 \u041A\u041E\u041B\u0418\u0427\u0415\u0421\u0422\u0412\u041E \u041F\u041E\u041D\u042F\u0422\u041D\u042B:
   \u041F\u0440\u0438\u043C\u0435\u0440\u044B:
   - "\u041F\u043E\u043C\u0438\u0434\u043E\u0440\u044B \u043F\u043E\u043B\u043A\u0438\u043B\u043E" -> quantity: 0.5, unit: "\u043A\u0433"
   - "\u041E\u0433\u0443\u0440\u0446\u044B \u043D\u043E\u043B\u044C \u043F\u044F\u0442\u044C \u043A\u0438\u043B\u043E\u0433\u0440\u0430\u043C\u043C\u0430" -> quantity: 0.5, unit: "\u043A\u0433"
   - "\u041A\u0430\u0440\u0442\u043E\u0448\u043A\u0438 \u0434\u0430\u0432\u0430\u0439 \u043F\u044F\u0442\u044C \u043A\u0438\u043B\u043E" -> quantity: 5, unit: "\u043A\u0433"
   - "\u0414\u0432\u0435 \u043F\u0430\u0447\u043A\u0438 \u0441\u0430\u043B\u0444\u0435\u0442\u043E\u043A" -> quantity: 2, unit: "\u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0430"
   \u0412\u0435\u0440\u043D\u0438:
   "type": "add_item",
   "productId": id \u0442\u043E\u0432\u0430\u0440\u0430 \u0438\u0437 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430,
   "productName": \u0442\u043E\u0447\u043D\u043E\u0435 \u0438\u043C\u044F \u0442\u043E\u0432\u0430\u0440\u0430 \u0438\u0437 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430,
   "quantity": \u0447\u0438\u0441\u043B\u043E\u0432\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 (number),
   "unit": \u0435\u0434\u0438\u043D\u0438\u0446\u0430 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F \u0442\u043E\u0432\u0430\u0440\u0430,
   "spokenResponse": "\u041F\u0440\u0438\u043D\u044F\u0442\u043E. [\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435] \u2014 [\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E] [\u0435\u0434]." (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: "\u041F\u0440\u0438\u043D\u044F\u0442\u043E. \u041F\u043E\u043C\u0438\u0434\u043E\u0440\u044B \u2014 0,5 \u043A\u0433.")
6. \u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0439 \u0441\u0442\u0440\u043E\u0433\u043E \u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0439 JSON.`;
      const prompt = `\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u0442\u043E\u0432\u0430\u0440\u043E\u0432:
${JSON.stringify(catalogSummary)}

\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u043E\u0442\u0434\u0435\u043B: ${activeCategory || "\u0432\u0441\u0435"}
\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0435 \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u0435: ${JSON.stringify(pendingClarification || null)}
\u0421\u043A\u0430\u0437\u0430\u043D\u043D\u0430\u044F \u0444\u0440\u0430\u0437\u0430 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F: "${transcript}"

\u041E\u0442\u0432\u0435\u0442\u044C \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 JSON:
{
  "type": "add_item" | "navigation" | "unknown_product" | "clarification" | "unknown_command",
  "productId": string | null,
  "productName": string | null,
  "quantity": number | null,
  "unit": string | null,
  "department": string | null,
  "suggestedNewProductName": string | null,
  "clarificationQuestion": string | null,
  "spokenResponse": string
}`;
      const callWithTimeout = (promise, ms = 3500) => {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Gemini request timeout")), ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
      };
      let response;
      try {
        response = await callWithTimeout(
          ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              temperature: 0.1
            }
          }),
          3500
        );
      } catch (firstErr) {
        console.warn("gemini-3.8-flash error/timeout, trying fallback model gemini-3.1-flash-lite:", firstErr?.message);
        response = await callWithTimeout(
          ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              temperature: 0.1
            }
          }),
          3500
        );
      }
      const responseText = response.text || "{}";
      const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsedData = JSON.parse(cleaned);
      res.json(parsedData);
      return;
    } catch (geminiErr) {
      console.warn("Gemini API call failed, falling back to local voice parser:", geminiErr);
    }
  }
  const localResult = parseVoiceTranscriptLocally(
    transcript,
    catalog || [],
    activeCategory,
    pendingClarification
  );
  res.json(localResult);
});
async function startServer() {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
