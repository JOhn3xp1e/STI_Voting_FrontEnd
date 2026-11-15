/** A party list from `/api/admin/partylists`. */
export interface Partylist {
  /** e.g. `PL-00001` */
  id: string;
  name: string;
  electionId: string;
  /** The party's motto (the API's required `description`). */
  motto: string;
  platform: string | null;
  /** Hex colour like `#1E40AF`, or `null` when none was picked. */
  color: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  createdAt: string;
}

/** Fields of a create / update request. Images go alongside as files; see `PartylistImages`. */
export interface PartylistInput {
  name: string;
  electionId: string;
  motto: string;
  platform: string | null;
  color: string | null;
}

/** Newly picked images. Leaving one out keeps the current image on update. */
export interface PartylistImages {
  logo?: File | null;
  banner?: File | null;
}
