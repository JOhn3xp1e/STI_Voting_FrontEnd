"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, SearchX } from "lucide-react";

import { useElectionsNav } from "@/components/elections/elections-nav";
import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { ImageDropzone } from "@/components/shared/image-dropzone";
import { PageError, PageLoading, Toast, useNotice } from "@/components/shared/page-feedback";
import { SectionCard, cardClassName } from "@/components/shared/section-card";
import { primaryButtonClassName, toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import {
  PARTY_SWATCHES,
  PLATFORM_MAX_LENGTH,
  mottoText,
  normalizeHex,
  partyColorFallbackClassName,
  partyColorStyle,
  partyInitial,
  partyListsHref,
  partylistToForm,
  validatePartylist,
  type PartylistErrors,
  type PartylistForm,
} from "@/lib/partylists";
import { cn } from "@/lib/utils";
import { isApiError } from "@/services/api/client";
import { getApiErrorMessage } from "@/services/api/error-message";
import { createPartylist, fetchPartylist, updatePartylist } from "@/services/partylists/partylists.service";
import type { Partylist } from "@/types/partylist.types";

const inputClassName = cn(fieldClassName, "rounded-[0.25rem] border-[#e2e8f0] dark:border-border");

const LOGO_MAX_BYTES = 1024 * 1024;
const BANNER_MAX_BYTES = 2 * 1024 * 1024;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not-found" }
  /** `loadId` changes on every load, so the form starts from what was just loaded. */
  | { status: "ready"; party: Partylist | null; loadId: number };

interface PartyListEditorPageProps {
  electionId: string;
  /** The party list to edit, or `null` for a new one. */
  partylistId: string | null;
}

/** `/elections/[id]/party-lists/new` and `/elections/[id]/party-lists/[partyId]`. */
export function PartyListEditorPage({ electionId, partylistId }: PartyListEditorPageProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loads = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const load = partylistId ? fetchPartylist(partylistId, { signal }) : Promise.resolve(null);
    load
      .then((party) => {
        if (signal.aborted) return;
        // A party list of another election isn't this page's to edit.
        if (party && party.electionId !== electionId) return setState({ status: "not-found" });
        loads.current += 1;
        setState({ status: "ready", party, loadId: loads.current });
      })
      .catch((error: unknown) => {
        if (signal.aborted) return;
        if (isApiError(error) && error.isNotFound) setState({ status: "not-found" });
        else setState({ status: "error", message: getApiErrorMessage(error) });
      });
    return () => controller.abort();
  }, [electionId, partylistId, attempt]);

  if (state.status === "loading") return <PageLoading label="Loading the party list…" />;
  if (state.status === "not-found") {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SearchX aria-hidden className="size-4.5" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-[0.9375rem] font-semibold text-foreground">{partylistId} wasn&apos;t found</p>
          <p className="mt-1 max-w-md text-[0.8125rem] leading-5 text-muted-foreground">It may have been deleted, or it belongs to another election.</p>
        </div>
        <Link href={partyListsHref(electionId)} className={cn(toolbarButtonClassName, "h-8 px-3.5 text-[0.8125rem]")}>
          Back to party lists
        </Link>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <PageError
        title="Couldn't load the party list"
        message={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  return <Editor key={state.loadId} electionId={electionId} party={state.party} />;
}

/* -------------------------------------------------------------------------- */
/*                                   Editor                                   */
/* -------------------------------------------------------------------------- */

/** A newly picked image: the file to upload on save, plus its preview URL. */
type PickedImage = { file: File; url: string } | null;

function usePickedImage(): [PickedImage, (file: File | null) => void] {
  const [image, setImage] = useState<PickedImage>(null);
  // Free the preview's object URL when it changes or the page closes.
  useEffect(() => (image ? () => URL.revokeObjectURL(image.url) : undefined), [image]);
  return [image, (file) => setImage(file ? { file, url: URL.createObjectURL(file) } : null)];
}

function Editor({ electionId, party }: { electionId: string; party: Partylist | null }) {
  const router = useRouter();
  const { elections } = useElectionsNav();
  const election = elections.find((e) => e.id === electionId);
  const listHref = partyListsHref(electionId);

  const [form, setForm] = useState<PartylistForm>(() => partylistToForm(party));
  const [errors, setErrors] = useState<PartylistErrors>({});
  const [logo, pickLogo] = usePickedImage();
  const [banner, pickBanner] = usePickedImage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notice, say } = useNotice();

  const color = normalizeHex(form.color);
  const colorStyle = partyColorStyle(color);
  const logoUrl = logo?.url ?? party?.logoUrl ?? null;
  const bannerUrl = banner?.url ?? party?.bannerUrl ?? null;
  const name = form.name.trim();
  const motto = mottoText(form.motto);

  function update(patch: Partial<PartylistForm>) {
    const next = { ...form, ...patch };
    setForm(next);
    // Re-check fields as they're fixed (only once errors are showing).
    if (Object.keys(errors).length) setErrors(validatePartylist(next));
    setError(null);
  }

  async function save() {
    const found = validatePartylist(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setError(null);
    try {
      const input = { name: form.name, electionId, motto, platform: form.platform.trim() || null, color };
      const images = { logo: logo?.file, banner: banner?.file };
      if (party) await updatePartylist(party.id, input, images);
      else await createPartylist(input, images);
      router.push(listHref);
    } catch (cause) {
      const message = getApiErrorMessage(cause);
      setError(message);
      say(message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pb-16 sm:px-6 lg:px-8">
      {/* Breadcrumb + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href={listHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-[0.875rem] text-brand-blue outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:text-[#7aa7e6]"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Party lists
          </Link>
          <span aria-hidden className="text-muted-foreground">/</span>
          <span className="truncate text-[0.9375rem] font-semibold text-foreground">{name || (party ? party.name : "New party list")}</span>
          {party ? <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">{party.id}</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Link href={listHref} className={cn(toolbarButtonClassName, "px-4 font-medium", saving && "pointer-events-none opacity-60")}>
            Discard
          </Link>
          <button type="button" onClick={() => void save()} disabled={saving} className={cn(primaryButtonClassName, "gap-2 disabled:pointer-events-none disabled:opacity-60")}>
            {saving ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
            Save party list
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mb-5 rounded-[0.25rem] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[0.8125rem] leading-5 text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23.75rem]">
        <div className="min-w-0 space-y-5">
          <SectionCard title="Identity" aside={party ? `partyID ${party.id} · auto` : "partyID is assigned on save"}>
            <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2">
              <div>
                <label htmlFor="party-name" className={labelClassName}>
                  Name
                </label>
                <input
                  id="party-name"
                  value={form.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="e.g. Ugnayan"
                  maxLength={100}
                  aria-invalid={!!errors.name || undefined}
                  aria-describedby={errors.name ? "party-name-error" : undefined}
                  className={inputClassName}
                />
                {errors.name ? (
                  <p id="party-name-error" className={errorClassName}>
                    {errors.name}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="party-motto" className={labelClassName}>
                  Motto
                </label>
                <input
                  id="party-motto"
                  value={form.motto}
                  onChange={(e) => update({ motto: e.target.value })}
                  placeholder="e.g. Sama-sama, Sulong STI!"
                  maxLength={200}
                  aria-invalid={!!errors.motto || undefined}
                  aria-describedby={errors.motto ? "party-motto-error" : undefined}
                  className={inputClassName}
                />
                {errors.motto ? (
                  <p id="party-motto-error" className={errorClassName}>
                    {errors.motto}
                  </p>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="party-election" className={labelClassName}>
                  Election
                </label>
                <input id="party-election" value={election ? `${election.title} · ${election.id}` : electionId} disabled readOnly className={inputClassName} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Party color" aside="used for tags, banner and ballot">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
              <div role="group" aria-label="Party color" className="flex flex-wrap items-center gap-2.5 pb-1">
                {PARTY_SWATCHES.map((swatch) => {
                  const active = color === swatch;
                  return (
                    <button
                      key={swatch}
                      type="button"
                      aria-label={`Use ${swatch}`}
                      aria-pressed={active}
                      title={swatch}
                      onClick={() => update({ color: swatch })}
                      style={{ backgroundColor: swatch }}
                      className={cn(
                        "size-7.5 cursor-pointer rounded-full outline-none transition-[box-shadow,scale] duration-150 hover:scale-108 focus-visible:ring-3 focus-visible:ring-brand-blue/30 motion-reduce:hover:scale-100",
                        active ? "shadow-[0_0_0_2px_var(--color-background),0_0_0_4px_var(--color-foreground)]" : "shadow-[inset_0_0_0_1px_rgb(15_23_42/0.08)]",
                      )}
                    />
                  );
                })}
              </div>
              <div className="w-36">
                <label htmlFor="party-color" className={labelClassName}>
                  Custom
                </label>
                <input
                  id="party-color"
                  value={form.color}
                  onChange={(e) => update({ color: e.target.value })}
                  onBlur={() => color && form.color !== color && update({ color })}
                  placeholder="#1E40AF"
                  maxLength={7}
                  spellCheck={false}
                  aria-invalid={!!errors.color || undefined}
                  aria-describedby={errors.color ? "party-color-error" : undefined}
                  className={cn(inputClassName, "font-mono text-[0.8125rem]")}
                />
              </div>
            </div>
            {errors.color ? (
              <p id="party-color-error" className={cn(errorClassName, "text-right")}>
                {errors.color}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="Logo & banner" aside="uploaded when you save">
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className={cn(
                  "flex size-16 shrink-0 items-center justify-center rounded-full bg-cover bg-center text-[1.375rem] font-semibold",
                  !colorStyle && partyColorFallbackClassName,
                )}
                style={{ ...colorStyle, ...(logoUrl ? { backgroundImage: `url("${logoUrl}")` } : null) }}
              >
                {logoUrl ? null : partyInitial(form.name)}
              </span>
              <ImageDropzone
                title={logoUrl ? "Replace logo" : "Add a logo"}
                hint="square · max 1 MB"
                maxBytes={LOGO_MAX_BYTES}
                picked={logo !== null}
                onPick={pickLogo}
                onError={(message) => say(message, "error")}
                className="min-w-0 flex-1"
              />
            </div>
            <ImageDropzone
              title={bannerUrl ? "Replace the banner image" : "Drop a banner image"}
              hint="3:1 · max 2 MB · shown at the top of the party card"
              maxBytes={BANNER_MAX_BYTES}
              previewUrl={bannerUrl}
              picked={banner !== null}
              onPick={pickBanner}
              onError={(message) => say(message, "error")}
              className="mt-3.5"
            />
          </SectionCard>

          <SectionCard title="Platform" aside="shown on the ballot">
            <label htmlFor="party-platform" className="sr-only">
              Platform
            </label>
            <textarea
              id="party-platform"
              value={form.platform}
              onChange={(e) => update({ platform: e.target.value })}
              placeholder="What the party will do if elected, one point per line."
              rows={4}
              maxLength={PLATFORM_MAX_LENGTH}
              className={cn(inputClassName, "h-auto min-h-24 resize-y py-2.5 leading-5.5")}
            />
            <p className="mt-2 font-mono text-[0.65625rem] text-muted-foreground tabular-nums">
              {form.platform.length} / {PLATFORM_MAX_LENGTH} characters
            </p>
          </SectionCard>
        </div>

        {/* Live preview */}
        <aside className="xl:sticky xl:top-6">
          <SectionCard title="Preview" aside="voter ballot" bodyClassName="px-5 pt-4.5 pb-5">
            <div
              className={cn("relative flex min-h-17 items-center gap-3.5 overflow-hidden rounded-[0.25rem] bg-cover bg-center px-3.5 py-3", !colorStyle && partyColorFallbackClassName)}
              style={{ ...colorStyle, ...(bannerUrl ? { backgroundImage: `url("${bannerUrl}")`, color: "#ffffff" } : null) }}
            >
              {bannerUrl ? <span aria-hidden className="absolute inset-0 bg-brand-navy/55" /> : null}
              <span
                aria-hidden
                className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-white bg-cover bg-center text-[0.9375rem] font-semibold text-brand-navy"
                style={logoUrl ? { backgroundImage: `url("${logoUrl}")` } : undefined}
              >
                {logoUrl ? null : partyInitial(form.name)}
              </span>
              <div className="relative min-w-0">
                <p className="truncate text-[1.0625rem] leading-6 font-semibold">{name || "Party name"}</p>
                {motto ? <p className="truncate text-[0.75rem] leading-4 opacity-85">“{motto}”</p> : null}
              </div>
            </div>

            {/* How a candidate of this party is tagged on the ballot. */}
            <div className={cn(cardClassName, "mt-3.5 flex items-center gap-3 px-3 py-2.5")}>
              <span aria-hidden className="size-8 shrink-0 rounded-full bg-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem] leading-4.5 text-foreground">Candidate name</p>
                <p className="truncate text-[0.75rem] leading-4 text-muted-foreground">Position</p>
              </div>
              <span
                className={cn("max-w-28 shrink-0 truncate rounded-[0.1875rem] px-1.5 py-0.5 font-mono text-[0.625rem] tracking-[0.04em] uppercase", !colorStyle && partyColorFallbackClassName)}
                style={colorStyle}
              >
                {name || "Party"}
              </span>
            </div>

            <p className="mt-4 font-mono text-[0.65625rem] tracking-[0.08em] text-muted-foreground uppercase">Platform</p>
            <p className="mt-1.5 text-[0.8125rem] leading-5 whitespace-pre-line text-foreground">
              {form.platform.trim() || <span className="text-muted-foreground">No platform yet.</span>}
            </p>
            <p className="mt-4 text-[0.75rem] leading-4 text-muted-foreground">Voters see this on the ballot and candidate pages.</p>
          </SectionCard>
        </aside>
      </div>

      <Toast notice={notice} />
    </div>
  );
}
