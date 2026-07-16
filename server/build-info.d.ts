export function readBuildIdFile(filePath: string): string | null
export function buildIdFromGit(cwd: string): string | null
export function resolveBuildId(options?: {fileCandidates?: string[]; gitCwd?: string}): string
