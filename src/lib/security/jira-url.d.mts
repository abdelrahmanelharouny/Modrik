export declare function validateJiraBaseUrl(raw: string, env?: NodeJS.ProcessEnv): URL;
export declare function buildJiraUrl(baseUrl: string, apiPath: string, env?: NodeJS.ProcessEnv): string;
export declare function jiraFetchOptions<T extends RequestInit>(options?: T): T & { redirect: "manual" };
