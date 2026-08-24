# Finding your cloud API key

FirstRecall connects to provider APIs, which are separate from consumer chat
subscriptions such as Claude Pro or ChatGPT Plus. API usage may require separate
billing or credits from the provider.

After you create a key, return to **Settings → FirstRecall → AI model**, choose the
provider, paste the key into its API key field, and select **Save key**. FirstRecall
stores cloud keys in Obsidian Secret Storage on this device.

## Anthropic

1. Open the [Claude Console API keys page](https://platform.claude.com/settings/keys)
   and sign in or create a Console account.
2. Select the workspace FirstRecall should use, then choose **Create key**.
3. Name the key, choose an expiration, and copy it into the **Anthropic API key**
   field in FirstRecall.

Anthropic documents key creation and rotation in its
[authentication guide](https://platform.claude.com/docs/en/manage-claude/authentication).

## OpenAI

1. Open the [OpenAI API key dashboard](https://platform.openai.com/api-keys) and
   sign in to the API Platform.
2. Select the appropriate project, then choose **Create new secret key**.
3. Name the key, copy it when shown, and paste it into the **OpenAI API key** field
   in FirstRecall.

An OpenAI API key and API billing are separate from a ChatGPT subscription. See the
[OpenAI developer quickstart](https://platform.openai.com/docs/quickstart) for the
current account setup flow.

## Google

1. Open the [Google AI Studio API keys page](https://aistudio.google.com/app/apikey)
   and sign in.
2. Copy the key AI Studio created for you, or choose **Create API key** and select a
   Google Cloud project.
3. Paste the key into the **Google API key** field in FirstRecall.

Google's [Gemini API key guide](https://ai.google.dev/gemini-api/docs/api-key)
explains project access, key restrictions, and billing.

## xAI

1. Open the [xAI Console](https://console.x.ai/) and sign in.
2. Choose the correct team, open **API Keys** in the sidebar, and select
   **Create API Key**.
3. Grant the models and endpoints you want FirstRecall to use, then copy the key
   into the **xAI API key** field in FirstRecall.

See xAI's [API key security guide](https://docs.x.ai/console/faq/security) for key
management and rotation.

## OpenRouter

1. Open [OpenRouter API keys](https://openrouter.ai/settings/keys) and sign in.
2. Select **Create Key**, give the key a recognizable name, and optionally set a
   credit limit.
3. Copy the key into the **OpenRouter API key** field in FirstRecall.

Use a regular inference API key, not a Management API key. Management keys cannot
make model requests.

## Groq

1. Open the [Groq API keys page](https://console.groq.com/keys) and sign in.
2. Select the project FirstRecall should use, then choose **Create API Key**.
3. Name and copy the key, then paste it into the **Groq API key** field in
   FirstRecall.

Groq API keys are project-specific. The [Groq quickstart](https://console.groq.com/docs/quickstart)
links to the current key-creation flow.

## Mistral

1. Open [Mistral API keys](https://console.mistral.ai/api-keys/) and sign in to
   Mistral Studio.
2. Choose **Create new key**, add a name and expiration date, and create the key.
3. Copy it immediately and paste it into the **Mistral API key** field in
   FirstRecall.

See Mistral's [key setup guide](https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key)
for the current Studio account flow.

## DeepSeek

1. Open [DeepSeek API keys](https://platform.deepseek.com/api_keys) and sign in to
   the API Platform.
2. Choose **Create new API key**, name it, and copy the generated key.
3. Paste it into the **DeepSeek API key** field in FirstRecall.

If requests fail for insufficient balance, add API credits in the DeepSeek
Platform. The consumer DeepSeek chat service does not supply API credits.

## DeepInfra

1. Open the [DeepInfra API keys dashboard](https://deepinfra.com/dash/api_keys) and
   sign in.
2. Create a new API key and copy the token.
3. Paste it into the **DeepInfra API token** field in FirstRecall.

DeepInfra calls the credential an access token in some screens. Its
[official quickstart](https://docs.deepinfra.com/quickstart) uses the same token for
API authentication.

## Together

1. Open the [current Together AI project's API keys](https://api.together.ai/settings/projects/~current/api-keys)
   and sign in.
2. Select **Create key**, give it a name, and optionally set an expiration date.
3. Copy the key immediately and paste it into the **Together AI API key** field in
   FirstRecall.

Together AI keys are scoped to a project and are only shown once. See the
[Together AI authentication guide](https://docs.together.ai/docs/api-keys-authentication)
for details.

## Fireworks

1. Open [Fireworks API keys](https://app.fireworks.ai/api-keys) and sign in.
2. Select **Create API Key** and create a key for your account.
3. Copy it and paste it into the **Fireworks AI API key** field in FirstRecall.

Fireworks documents this flow in its
[onboarding guide](https://docs.fireworks.ai/getting-started/onboarding).

## Keep your keys safe

- Treat every API key like a password. Do not put it in a note, screenshot, chat,
  public repository, or support message.
- Create a separate key for FirstRecall when the provider supports multiple keys.
  That makes usage easier to identify and the key easier to revoke.
- If a key is exposed, revoke or rotate it in the provider console, then replace it
  in FirstRecall.
- Review the provider's billing, usage limits, and data policies before sending
  notes to its models.
