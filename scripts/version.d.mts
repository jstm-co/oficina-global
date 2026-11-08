export declare function prefijoFecha(fecha?: Date): string;
export declare function versionPublicada(versiones: string[], fecha?: Date): string;
export declare function versionLocal(opciones: { fecha?: Date; sha: string; dirty?: boolean }): string;
export declare function archivosQuePublican(rutas: string[]): string[];
export declare function versionEnTag(cwd?: string): string | null;
export declare function versionDeBuild(opciones?: { env?: NodeJS.ProcessEnv; fecha?: Date; cwd?: string }): { version: string; sha: string; dirty: boolean };
