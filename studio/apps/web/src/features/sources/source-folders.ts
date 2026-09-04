import type { SourceFolderSummary } from "@the-way-here/shared";
import { useApi } from "../../api";

const sourceFoldersEndpoint = "/api/sources/folders";

export function useSourceFolders(revision = 0) {
  return useApi<SourceFolderSummary[]>(sourceFoldersEndpoint, revision);
}

export function sourceFolderOptions(folders: SourceFolderSummary[] | undefined, currentFolder = ""): string[] {
  return [...new Set([...(folders || []).map((folder) => folder.path), currentFolder].filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}
