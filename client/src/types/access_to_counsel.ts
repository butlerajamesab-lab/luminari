export type counsel_access_level =
  | "none"
  | "limited"
  | "specialized"
  | "unknown";

export type counsel_access_profile = {
  has_counsel: boolean;
  access_level: counsel_access_level;
  notes: string;
};
