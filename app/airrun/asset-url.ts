/** Root hosting and GitHub project Pages share the same native asset files. */
export function assetUrl(path: string, base = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/') {
    if (base === '/' || !/^\/(?:models|audio|dispatch)\//.test(path)) return path;
    return base.replace(/\/?$/, '/') + path.slice(1);
}
