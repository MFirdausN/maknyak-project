import { Injectable, ServiceUnavailableException } from "@nestjs/common";
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

export interface BriefProvider {
  generate(
    input: GenerateBriefInput,
    prompt: string,
    onChunk?: (chunk: string) => void,
  ): Promise<BriefResult>;
}

@Injectable()
export class ProviderRegistry {
  provider(name: string, providerModel: string): BriefProvider {
    if (name === "deterministic") return new DeterministicProvider();
    if (name === "ollama") return new OllamaProvider(providerModel);
    throw new ServiceUnavailableException(`AI provider ${name} is unavailable`);
  }
}

export class DeterministicProvider implements BriefProvider {
  async generate(
    input: GenerateBriefInput,
    _prompt: string,
    onChunk?: (chunk: string) => void,
  ): Promise<BriefResult> {
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
    return result;
  }
}

class OllamaProvider implements BriefProvider {
  constructor(private readonly model: string) {}

  async generate(
    input: GenerateBriefInput,
    prompt: string,
    onChunk?: (chunk: string) => void,
  ): Promise<BriefResult> {
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
    };
    const content = payload.message?.content;
    if (!content)
      throw new ServiceUnavailableException("Ollama returned no content");
    onChunk?.(content);
    return briefResultSchema.parse(JSON.parse(content));
  }
}
