export declare function scanSources(files?: string[]): { sources: Map<string, string[]>; problems: string[] };
export declare function placeholders(text: string): string[];
export declare function checkCatalog(sources: Map<string, string[]>, catalog: Readonly<Record<string, string>>): { missing: string[]; unused: string[]; mismatched: string[] };
