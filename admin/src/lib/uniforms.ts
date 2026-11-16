/*
 * STI daily-uniform presets for the photo editor. Each one has a reference
 * photo in `public/uniforms/` (cut out of the official uniform guide) and a
 * description the image model follows together with that photo.
 */

export type UniformProgramId = "it" | "hm" | "tourism" | "shs";
export type UniformCut = "pants" | "skirt";
export type UniformId = `${UniformProgramId}-${UniformCut}`;

/**
 * Cloudflare Workers AI image models that can put the uniform on (all FLUX.2,
 * multi-reference editing). They share one setup: WORKERS_AI_ACCOUNT_ID and
 * WORKERS_AI_API_TOKEN (see the uniform route).
 */
export type UniformModel = "flux-2-klein-4b" | "flux-2-klein-9b" | "flux-2-dev";

export const UNIFORM_MODELS: { id: UniformModel; workersAiId: string; label: string; detail: string }[] = [
  // In testing, klein 4B kept the face and background best, in about 4 s.
  { id: "flux-2-klein-4b", workersAiId: "@cf/black-forest-labs/flux-2-klein-4b", label: "Klein 4B", detail: "Fast · ~4 s" },
  { id: "flux-2-klein-9b", workersAiId: "@cf/black-forest-labs/flux-2-klein-9b", label: "Klein 9B", detail: "Fast · ~3 s" },
  { id: "flux-2-dev", workersAiId: "@cf/black-forest-labs/flux-2-dev", label: "Dev", detail: "Detailed · ~13 s" },
];

export const UNIFORM_MODELS_SETUP = "Add the WORKERS_AI_ACCOUNT_ID and WORKERS_AI_API_TOKEN secrets.";

/** FLUX.2 on Workers AI takes input images of at most 512 × 512. */
export const UNIFORM_INPUT_EDGE = 512;

export function isUniformModel(value: unknown): value is UniformModel {
  return UNIFORM_MODELS.some((m) => m.id === value);
}

export interface UniformProgram {
  id: UniformProgramId;
  /** Short name for the tile. */
  label: string;
  name: string;
}

export const UNIFORM_PROGRAMS: UniformProgram[] = [
  { id: "it", label: "IT & Eng", name: "IT & Engineering" },
  { id: "hm", label: "Hospitality", name: "Hospitality Management" },
  { id: "tourism", label: "Tourism", name: "Tourism Management" },
  { id: "shs", label: "SHS", name: "Senior High School" },
];

export const UNIFORM_CUTS: { id: UniformCut; label: string }[] = [
  { id: "pants", label: "Polo & pants" },
  { id: "skirt", label: "Blouse & skirt" },
];

const LANYARD = "a black-and-yellow STI lanyard with a school ID card";

/** What each uniform looks like, for the prompt. */
const DESCRIPTIONS: Record<UniformId, string> = {
  "it-pants": `a light gray short-sleeved polo shirt with a dark navy collar and dark navy rolled sleeve cuffs, a small dark pocket flap on the chest, ${LANYARD}, a black belt and dark charcoal trousers`,
  "it-skirt": `a light gray short-sleeved blouse with a dark navy collar and dark navy rolled sleeve cuffs, ${LANYARD} and a dark charcoal knee-length skirt`,
  "hm-pants": `a dark charcoal blazer worn open over a crisp white long-sleeved collared shirt, ${LANYARD}, a black belt and dark charcoal trousers`,
  "hm-skirt": `a fitted dark charcoal blazer over a crisp white collared blouse, ${LANYARD} and a dark charcoal knee-length skirt`,
  "tourism-pants": `a medium gray blazer with two thin yellow stripes on each sleeve cuff, a white collared polo shirt, a yellow necktie, a small tourism pin on the lapel, ${LANYARD} and medium gray trousers`,
  "tourism-skirt": `a fitted medium gray blazer with two thin yellow stripes on each sleeve cuff, a white collared blouse, a yellow scarf tied at the neck, a small tourism pin on the lapel, ${LANYARD}, a medium gray skirt and a small gray beret with a yellow band`,
  "shs-pants": `a white short-sleeved collared polo shirt under a light gray V-neck sweater vest with a small school crest, a dark blue necktie, a blue lanyard with a school ID card and dark navy blue trousers`,
  "shs-skirt": `a white short-sleeved collared blouse under a light gray V-neck sweater vest with a small school crest, a dark blue necktie, a blue lanyard with a school ID card and a dark navy blue pencil skirt`,
};

export function isUniformId(value: unknown): value is UniformId {
  return typeof value === "string" && value in DESCRIPTIONS;
}

export function uniformId(program: UniformProgramId, cut: UniformCut): UniformId {
  return `${program}-${cut}`;
}

/** Public path of the reference photo, e.g. `/uniforms/it-pants.jpg`. */
export function uniformReference(id: UniformId): string {
  return `/uniforms/${id}.jpg`;
}

export function uniformName(id: UniformId): string {
  const [program, cut] = id.split("-") as [UniformProgramId, UniformCut];
  const name = UNIFORM_PROGRAMS.find((p) => p.id === program)?.name ?? program;
  const cutLabel = UNIFORM_CUTS.find((c) => c.id === cut)?.label.toLowerCase() ?? cut;
  return `${name} · ${cutLabel}`;
}

/**
 * The edit instruction for FLUX.2: the candidate photo is `input_image_0`
 * ("image 0") and the uniform reference `input_image_1` ("image 1"). Built on
 * the server only, so the endpoint can't be used as a general image generator.
 */
export function uniformPrompt(id: UniformId): string {
  const [candidate, reference] = ["image 0", "image 1"];
  return [
    `Edit ${candidate}.`,
    `Replace only the clothing of the person in ${candidate} with the school uniform worn in ${reference}: ${DESCRIPTIONS[id]}.`,
    `Keep the face, facial features, skin tone, hairstyle, expression, head position, pose, body proportions, framing and background of ${candidate} exactly the same.`,
    `Do not use the face, hair or body of the person in ${reference}.`,
    `Photorealistic, natural fabric folds, lighting matching ${candidate}.`,
  ].join(" ");
}
