import { apiClient } from "@/services/api/client";
import type { Partylist, PartylistImages, PartylistInput } from "@/types/partylist.types";

/*
 * Party lists <-> ASP.NET Core Web API (SLVP-BE).
 * Routes are relative to NEXT_PUBLIC_API_URL; DTOs mirror SLVP-BE/stiVoteAppBE/Dtos/PartylistDtos.cs.
 */

const ROUTE = "admin/partylists";

/** PartylistResponse */
interface PartylistDto {
  id: string;
  name: string;
  electionId: string;
  /** Public URLs built by the API from the storage paths. */
  logoImageUrl?: string | null;
  bannerImageUrl?: string | null;
  description: string;
  platform?: string | null;
  color?: string | null;
  createdAt: string;
}

function toPartylist(dto: PartylistDto): Partylist {
  return {
    id: dto.id,
    name: dto.name,
    electionId: dto.electionId,
    motto: dto.description ?? "",
    platform: dto.platform ?? null,
    color: dto.color ?? null,
    logoUrl: dto.logoImageUrl ?? null,
    bannerUrl: dto.bannerImageUrl ?? null,
    createdAt: dto.createdAt,
  };
}

/**
 * Create / Update body. The endpoints bind `[FromForm]` fields plus optional `logoImage` and
 * `bannerImage` files, so this is sent as multipart/form-data (the browser sets the Content-Type).
 * Leaving out `platform` or `color` clears it; leaving out an image keeps the current one.
 */
function toFormData(input: PartylistInput, images: PartylistImages): FormData {
  const data = new FormData();
  data.append("name", input.name.trim());
  data.append("electionId", input.electionId);
  data.append("description", input.motto.trim());
  const platform = input.platform?.trim();
  if (platform) data.append("platform", platform);
  if (input.color) data.append("color", input.color);
  if (images.logo) data.append("logoImage", images.logo, images.logo.name);
  if (images.banner) data.append("bannerImage", images.banner, images.banner.name);
  return data;
}

interface RequestOptions {
  signal?: AbortSignal;
}

const partylistPath = (id: string) => `${ROUTE}/${encodeURIComponent(id)}`;

/** The party lists of one election. */
export async function fetchPartylists(electionId: string, { signal }: RequestOptions = {}): Promise<Partylist[]> {
  const dtos = await apiClient.get<PartylistDto[]>(`${ROUTE}/election/${encodeURIComponent(electionId)}`, { signal });
  return dtos.map(toPartylist);
}

/** Rejects with a 404 `ApiError` when there's no party list with this id. */
export async function fetchPartylist(id: string, { signal }: RequestOptions = {}): Promise<Partylist> {
  return toPartylist(await apiClient.get<PartylistDto>(partylistPath(id), { signal }));
}

/** The database assigns the id (PL-00007). */
export async function createPartylist(input: PartylistInput, images: PartylistImages = {}): Promise<Partylist> {
  return toPartylist(await apiClient.post<PartylistDto, FormData>(ROUTE, toFormData(input, images)));
}

export async function updatePartylist(id: string, input: PartylistInput, images: PartylistImages = {}): Promise<Partylist> {
  return toPartylist(await apiClient.put<PartylistDto, FormData>(partylistPath(id), toFormData(input, images)));
}

/** Its candidates stay in the election and become independent. */
export async function deletePartylist(id: string): Promise<void> {
  await apiClient.delete(partylistPath(id));
}
