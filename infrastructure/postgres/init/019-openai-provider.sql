INSERT INTO ai.models (id, provider, provider_model, display_name)
VALUES ('brief-openai-luna-v1', 'openai', 'gpt-5.6-luna', 'OpenAI GPT-5.6 Luna')
ON CONFLICT (id) DO UPDATE SET
  provider = EXCLUDED.provider,
  provider_model = EXCLUDED.provider_model,
  display_name = EXCLUDED.display_name;
