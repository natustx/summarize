export type OpenAiClientConfig = {
  apiKey: string;
  baseURL?: string;
  useChatCompletions: boolean;
  isOpenRouter: boolean;
  extraHeaders?: Record<string, string>;
};
