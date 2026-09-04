import type { PhotoPerson } from "@the-way-here/shared";

export interface PhotoLocalDraft {
  revision: number;
  photoId: string;
  people: PhotoPerson[];
  peopleDirty: boolean;
  story: string;
  storyDirty: boolean;
  photoDrafts?: Record<string, PhotoPerson[]>;
}
export function photoDraftKey(knowledgeBaseId: string, memoryId: string) {
  return `the-way-here:photo-draft:${encodeURIComponent(knowledgeBaseId)}:${encodeURIComponent(memoryId)}`;
}
export function parsePhotoDraft(raw: string | null): PhotoLocalDraft | undefined {
  try {
    if (!raw || raw.length > 256_000) return undefined;
    const value = JSON.parse(raw);
    if (!Number.isInteger(value.revision) || typeof value.photoId !== "string" || typeof value.story !== "string" || value.story.length > 60_000
      || typeof value.peopleDirty !== "boolean" || typeof value.storyDirty !== "boolean" || !Array.isArray(value.people) || value.people.length > 40) return undefined;
    const ids = new Set<string>();
    for (const person of value.people) {
      const b = person?.box;
      if (!person || typeof person.id !== "string" || ids.has(person.id) || typeof person.name !== "string" || typeof person.useAsAvatar !== "boolean"
        || person.pageId !== undefined && typeof person.pageId !== "string"
        || !b || ![b.x, b.y, b.width, b.height].every((n) => typeof n === "number" && Number.isFinite(n))
        || b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 || b.x + b.width > 1.00001 || b.y + b.height > 1.00001) return undefined;
      ids.add(person.id);
    }
    if (value.photoDrafts !== undefined) {
      if (!value.photoDrafts || typeof value.photoDrafts !== "object" || Array.isArray(value.photoDrafts) || Object.keys(value.photoDrafts).length > 10) return undefined;
      for (const [photoId, people] of Object.entries(value.photoDrafts)) {
        if (!parsePhotoDraft(JSON.stringify({ revision: value.revision, photoId, people, peopleDirty: true, story: "", storyDirty: false }))) return undefined;
      }
    }
    return value;
  } catch { return undefined; }
}
