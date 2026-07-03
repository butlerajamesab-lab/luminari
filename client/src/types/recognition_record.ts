export type record_origin = "tribe_authored" | "administrative_profile";

export type recognition_record = {
  record_origin: record_origin;
  tribe_id: string;
  display_name: string;
  state_id: string;
};
