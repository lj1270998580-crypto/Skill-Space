/// <reference types="vite/client" />

import type { SkillSpaceApi } from "../shared/types";

declare global {
  interface Window {
    skillSpace: SkillSpaceApi;
  }
}
