import {
  recognition_gideon_axes,
  route_to_recognition_profiles as anchor_route_to_recognition_profiles,
} from "@/data/route_to_recognition_profiles";
import { muwekma_route_to_recognition_profile } from "@/data/muwekma_route_to_recognition_profile";

export { recognition_gideon_axes };

export const route_to_recognition_profiles = [
  ...anchor_route_to_recognition_profiles,
  muwekma_route_to_recognition_profile,
];
