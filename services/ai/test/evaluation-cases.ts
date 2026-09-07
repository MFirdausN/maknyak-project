export const evaluationCases = [
  {
    name: "validated onboarding planning problem",
    input: {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      title: "Onboarding Assistant",
      idea: "Help a small product team turn raw onboarding notes into a measurable execution plan.",
      modelId: "brief-local-v1",
    },
    minimumScore: 90,
    requiredTerms: ["Onboarding Assistant", "acceptanceCriteria"],
  },
  {
    name: "Indonesian customer research problem",
    input: {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      title: "Riset Pelanggan",
      idea: "Membantu tim produk merangkum catatan wawancara pelanggan menjadi rencana eksperimen yang terukur.",
      modelId: "brief-local-v1",
    },
    minimumScore: 90,
    requiredTerms: ["Riset Pelanggan", "nextSteps"],
  },
] as const;
