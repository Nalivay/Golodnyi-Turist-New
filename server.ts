import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { parseVoiceTranscriptLocally } from './src/utils/voiceOrderParser.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = 3000;

// Initialize Gemini SDK on server side with required header
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
} else {
  console.warn('GEMINI_API_KEY is not set in environment.');
}

/**
 * Endpoint for voice order natural language parsing using Gemini with local fallback
 */
app.post('/api/voice-order-parse', async (req: Request, res: Response) => {
  const { transcript, catalog, activeCategory, currentOrder, pendingClarification } = req.body;

  if (!transcript || typeof transcript !== 'string') {
    res.status(400).json({ error: 'Transcript is required' });
    return;
  }

  // If Gemini is available, try calling it
  if (ai) {
    try {
      const catalogSummary = (catalog || []).slice(0, 300).map((p: any) => ({
        id: p.id,
        name: p.name,
        cat: p.category,
        unit: p.defaultUnit || 'кг',
        aliases: (p.aliases || []).slice(0, 5),
      }));

      const systemInstruction = `Ты — русскоязычный голосовой помощник для создания заявки на продукты в ресторане.

ПРАВИЛА И ОГРАНИЧЕНИЯ (СТРОЖАЙШЕ СОБЛЮДАЙ):
1. Единственный источник существующих товаров — предоставленный catalog.
2. ЕСЛИ НАЗВАННОГО ТОВАРА НЕТ В СУЩЕСТВУЮЩЕМ КАТАЛОГЕ:
   НИ В КОЕМ СЛУЧАЕ не придумывай, не подменяй и не создавай похожий товар!
   Верни:
   "type": "unknown_product",
   "spokenResponse": "Такого товара нет в списке. Добавить товар?",
   "suggestedNewProductName": нормализованное название товара с заглавной буквы (например "Манго").
3. ЕСЛИ ЭТО КОМАНДА НАВИГАЦИИ ПО ОТДЕЛАМ:
   Примеры: "Открой овощной отдел", "Теперь давай мясное", "Перейдём в бакалею", "Бар", "Хозтовары".
   Верни:
   "type": "navigation",
   "department": одно из ["vegetables", "meat", "grocery", "bar", "consumables", "other", "dairy", "bread", "all"],
   "spokenResponse": "Открыл отдел [Название]" (например: "Открыл отдел Овощи.").
4. ЕСЛИ ТОВАР НАЗВАН, НО КОЛИЧЕСТВО ИЛИ ЕДИНИЦА ИЗМЕРЕНИЯ НЕПОНЯТНЫ:
   НЕ УГАДЫВАЙ! Задай уточняющий вопрос.
   Верни:
   "type": "clarification",
   "productId": id найденного товара,
   "productName": название товара,
   "clarificationQuestion": уточняющий вопрос (например: "Сколько килограммов картофеля добавить?"),
   "spokenResponse": тот же вопрос.
5. ЕСЛИ ПОЗИЦИЯ И КОЛИЧЕСТВО ПОНЯТНЫ:
   Примеры:
   - "Помидоры полкило" -> quantity: 0.5, unit: "кг"
   - "Огурцы ноль пять килограмма" -> quantity: 0.5, unit: "кг"
   - "Картошки давай пять кило" -> quantity: 5, unit: "кг"
   - "Две пачки салфеток" -> quantity: 2, unit: "упаковка"
   Верни:
   "type": "add_item",
   "productId": id товара из каталога,
   "productName": точное имя товара из каталога,
   "quantity": числовое значение (number),
   "unit": единица измерения товара,
   "spokenResponse": "Принято. [Название] — [Количество] [ед]." (например: "Принято. Помидоры — 0,5 кг.")
6. Возвращай строго валидный JSON.`;

      const prompt = `Каталог товаров:
${JSON.stringify(catalogSummary)}

Текущий активный отдел: ${activeCategory || 'все'}
Предыдущее уточнение: ${JSON.stringify(pendingClarification || null)}
Сказанная фраза пользователя: "${transcript}"

Ответь в формате JSON:
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

      // Helper for Gemini call with timeout
      const callWithTimeout = (promise: Promise<any>, ms = 3500) => {
        let timeoutId: any;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Gemini request timeout')), ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
      };

      // Try gemini-3.8-flash first, fallback to gemini-3.1-flash-lite on spike/timeout/503
      let response: any;
      try {
        response = await callWithTimeout(
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
          3500
        );
      } catch (firstErr: any) {
        console.warn('gemini-3.8-flash error/timeout, trying fallback model gemini-3.1-flash-lite:', firstErr?.message);
        response = await callWithTimeout(
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
          3500
        );
      }

      const responseText = response.text || '{}';
      const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleaned);

      res.json(parsedData);
      return;
    } catch (geminiErr) {
      console.warn('Gemini API call failed, falling back to local voice parser:', geminiErr);
    }
  }

  // Reliable local parser fallback
  const localResult = parseVoiceTranscriptLocally(
    transcript,
    catalog || [],
    activeCategory,
    pendingClarification
  );
  res.json(localResult);
});

// Setup Vite dev middleware or static serving
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
