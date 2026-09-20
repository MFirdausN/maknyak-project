import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { openAIConfigSchema } from "@maknyak/config";
import type { BriefResult, GenerateBriefInput } from "./brief.types";
import { z } from "zod";

const briefResultSchema = z.object({
  summary: z.string().min(1),
  targetUsers: z.array(z.string().min(1)).min(1),
  goals: z.array(z.string().min(1)).min(1),
  inScope: z.array(z.string().min(1)).min(1),
  outOfScope: z.array(z.string().min(1)),
  risks: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  nextSteps: z.array(z.string().min(1)).min(1),
});

const briefJsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    targetUsers: { type: "array", items: { type: "string" } },
    goals: { type: "array", items: { type: "string" } },
    inScope: { type: "array", items: { type: "string" } },
    outOfScope: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    acceptanceCriteria: { type: "array", items: { type: "string" } },
    nextSteps: { type: "array", items: { type: "string" } },
  },
  required: [
    "summary",
    "targetUsers",
    "goals",
    "inScope",
    "outOfScope",
    "risks",
    "acceptanceCriteria",
    "nextSteps",
  ],
  additionalProperties: false,
} as const;

export interface BriefProvider {
  generate(
    input: GenerateBriefInput,
    prompt: string,
    onChunk?: (chunk: string) => void,
  ): Promise<ProviderResult>;
}

export interface ProviderResult {
  result: BriefResult;
  usage: { inputTokens: number; outputTokens: number; costMicrousd: number };
}

@Injectable()
export class ProviderRegistry {
  provider(name: string, providerModel: string): BriefProvider {
    if (name === "deterministic") return new DeterministicProvider();
    if (name === "ollama") return new OllamaProvider(providerModel);
    if (name === "openai") {
      const config = openAIConfigSchema.safeParse(process.env);
      if (!config.success)
        throw new ServiceUnavailableException(
          "OpenAI provider is not configured",
        );
      return new OpenAIProvider(providerModel, config.data);
    }
    throw new ServiceUnavailableException(`AI provider ${name} is unavailable`);
  }
}

interface OpenAIProviderConfig {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_TIMEOUT_MS: number;
  OPENAI_MAX_OUTPUT_TOKENS: number;
  OPENAI_INPUT_PRICE_MICROUSD_PER_MILLION: number;
  OPENAI_OUTPUT_PRICE_MICROUSD_PER_MILLION: number;
}

interface OpenAIResponse {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class OpenAIProvider implements BriefProvider {
  constructor(
    private readonly model: string,
    private readonly config: OpenAIProviderConfig,
  ) {}

  async generate(
    input: GenerateBriefInput,
    prompt: string,
    onChunk?: (chunk: string) => void,
  ): Promise<ProviderResult> {
    const response = await fetch(`${this.config.OPENAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        store: false,
        max_output_tokens: this.config.OPENAI_MAX_OUTPUT_TOKENS,
        input: [
          { role: "developer", content: prompt },
          {
            role: "user",
            content: `Title: ${input.title}\nIdea: ${input.idea}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "maknyak_project_brief",
            strict: true,
            schema: briefJsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(this.config.OPENAI_TIMEOUT_MS),
    });
    if (!response.ok)
      throw new ServiceUnavailableException(
        `OpenAI request failed with status ${response.status}`,
      );
    const payload = (await response.json()) as OpenAIResponse;
    const content = payload.output
      ?.find((item) => item.type === "message")
      ?.content?.find((item) => item.type === "output_text")?.text;
    if (!content)
      throw new ServiceUnavailableException(
        "OpenAI returned no structured output",
      );
    const parsed = briefResultSchema.safeParse(safeJson(content));
    if (!parsed.success)
      throw new ServiceUnavailableException(
        "OpenAI structured output failed validation",
      );
    const result = parsed.data;
    onChunk?.(content);
    const inputTokens =
      payload.usage?.input_tokens ??
      estimateTokens(`${prompt}\n${input.title}\n${input.idea}`);
    const outputTokens =
      payload.usage?.output_tokens ?? estimateTokens(content);
    return {
      result,
      usage: {
        inputTokens,
        outputTokens,
        costMicrousd: Math.ceil(
          (inputTokens * this.config.OPENAI_INPUT_PRICE_MICROUSD_PER_MILLION +
            outputTokens *
              this.config.OPENAI_OUTPUT_PRICE_MICROUSD_PER_MILLION) /
            1_000_000,
        ),
      },
    };
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export class DeterministicProvider implements BriefProvider {
  async generate(
    input: GenerateBriefInput,
    _prompt: string,
    onChunk?: (chunk: string) => void,
  ): Promise<ProviderResult> {
    const result: BriefResult = {
      summary: `${input.title}: ${input.idea.slice(0, 240)}`,
      targetUsers: ["Tim kecil yang perlu memvalidasi dan menjalankan ide"],
      goals: [
        "Mengubah ide menjadi ruang lingkup yang dapat dieksekusi",
        "Memvalidasi hasil bersama pengguna awal",
      ],
      inScope: [
        "Alur utama pengguna",
        "Metrik keberhasilan",
        "Umpan balik terstruktur",
      ],
      outOfScope: [
        "Otomasi penuh tanpa persetujuan",
        "Skala enterprise pada iterasi pertama",
      ],
      risks: [
        "Masalah pengguna belum tervalidasi",
        "Ruang lingkup berkembang terlalu cepat",
      ],
      acceptanceCriteria: [
        "Pengguna dapat menyelesaikan alur utama",
        "Outcome dapat diukur dan ditinjau",
      ],
      nextSteps: [
        "Wawancarai tiga calon pengguna",
        "Bangun prototipe alur utama",
        "Ukur waktu dan kualitas hasil",
      ],
    };
    const encoded = JSON.stringify(result);
    for (let index = 0; index < encoded.length; index += 48) {
      onChunk?.(encoded.slice(index, index + 48));
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
    return {
      result,
      usage: {
        inputTokens: estimateTokens(
          `${input.title}\n${input.idea}\n${_prompt}`,
        ),
        outputTokens: estimateTokens(encoded),
        costMicrousd: 0,
      },
    };
  }
}

class OllamaProvider implements BriefProvider {
  constructor(private readonly model: string) {}

  async generate(
    input: GenerateBriefInput,
    prompt: string,
    onChunk?: (chunk: string) => void,
  ): Promise<ProviderResult> {
    const response = await fetch(
      `${process.env.OLLAMA_URL ?? "http://ollama:11434"}/api/chat`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          messages: [
            { role: "system", content: prompt },
            {
              role: "user",
              content: `Title: ${input.title}\nIdea: ${input.idea}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (!response.ok)
      throw new ServiceUnavailableException(
        `Ollama returned ${response.status}`,
      );
    const payload = (await response.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const content = payload.message?.content;
    if (!content)
      throw new ServiceUnavailableException("Ollama returned no content");
    onChunk?.(content);
    return {
      result: briefResultSchema.parse(JSON.parse(content)),
      usage: {
        inputTokens:
          payload.prompt_eval_count ??
          estimateTokens(`${prompt}\n${input.title}\n${input.idea}`),
        outputTokens: payload.eval_count ?? estimateTokens(content),
        costMicrousd: 0,
      },
    };
  }
}

export function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}
