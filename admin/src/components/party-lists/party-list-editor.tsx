"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, SearchX } from "lucide-react";

import { useElectionsNav } from "@/components/elections/elections-nav";
import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { IMAGE_TYPES, checkImage } from "@/components/shared/image-dropzone";
import { PageError, PageLoading, Toast, useNotice } from "@/components/shared/page-feedback";
import { SectionCard } from "@/components/shared/section-card";
import { primaryButtonClassName, toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { sortPositions } from "@/lib/ballot";
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
import { getStudentInitials } from "@/lib/students";
import { cn } from "@/lib/utils";
import { isApiError } from "@/services/api/client";
import { getApiErrorMessage } from "@/services/api/error-message";
import { fetchCandidates, fetchPositions } from "@/services/ballot/ballot.service";
import { createPartylist, fetchPartylist, updatePartylist } from "@/services/partylists/partylists.service";
import { fetchStudents } from "@/services/students/students.service";
import type { Partylist } from "@/types/partylist.types";

const inputClassName = cn(fieldClassName, "rounded-md border-[#e4e8f0] text-[0.8125rem] dark:border-border");
const fieldLabelClassName = cn(labelClassName, "text-[0.6875rem]");

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

/** A candidate of this party list, for the preview. */
interface PreviewCandidate {
  name: string;
  initials: string;
  position: string;
}

/**
 * The party's first candidate (by position order), so the preview shows a real
 * ballot row. `null` for a new party list, one without candidates, or when
 * the ballot can't be loaded (the preview then shows a placeholder).
 */
function usePreviewCandidate(electionId: string, partylistId: string | null): PreviewCandidate | null {
  const [candidate, setCandidate] = useState<PreviewCandidate | null>(null);
  useEffect(() => {
    if (!partylistId) return;
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([fetchCandidates(electionId, { signal }), fetchPositions(electionId, { signal }), fetchStudents({ signal }).catch(() => null)])
      .then(([candidates, positions, students]) => {
        const mine = candidates.filter((c) => c.partylistId === partylistId);
        const position = sortPositions(positions).find((p) => mine.some((c) => c.positionId === p.id));
        const first = position ? mine.find((c) => c.positionId === position.id) : undefined;
        if (!first || !position) return;
        const student = students?.find((s) => s.studentNo === first.studentId);
        setCandidate({
          name: student ? `${student.firstName} ${student.lastName}`.trim() : first.studentId,
          initials: student ? getStudentInitials(student) : "?",
          position: position.title,
        });
      })
      .catch(() => {
        // Only the preview uses this; it falls back to a placeholder row.
      });
    return () => controller.abort();
  }, [electionId, partylistId]);
  return candidate;
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
  const previewCandidate = usePreviewCandidate(electionId, party?.id ?? null);

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

  const sayError = (message: string) => say(message, "error");

  return (
    <div className="px-4 pb-16 sm:px-6 lg:px-8">
      {/* Breadcrumb + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href={listHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-[0.8125rem] text-brand-blue outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:text-[#7aa7e6]"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Party lists
          </Link>
          <span aria-hidden className="text-[0.6875rem] text-muted-foreground">
            /
          </span>
          <span className="truncate text-[0.875rem] font-semibold text-foreground">{name || (party ? party.name : "New party list")}</span>
          {party ? <span className="shrink-0 text-[0.65625rem] text-muted-foreground">{party.id}</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Link href={listHref} className={cn(toolbarButtonClassName, "h-9 px-4 text-[0.8125rem] font-semibold text-foreground", saving && "pointer-events-none opacity-60")}>
            Discard
          </Link>
          <button type="button" onClick={() => void save()} disabled={saving} className={cn(primaryButtonClassName, "h-9 gap-2 text-[0.8125rem] disabled:pointer-events-none disabled:opacity-60")}>
            {saving ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
            Save party list
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mb-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[0.8125rem] leading-5 text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23.75rem]">
        <div className="min-w-0 space-y-5">
          <SectionCard title="Identity" aside={party ? `partyID ${party.id} · auto` : "partyID is assigned on save"} className={cardRadius} bodyClassName={cardBody}>
            <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2">
              <div>
                <label htmlFor="party-name" className={fieldLabelClassName}>
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
                <label htmlFor="party-motto" className={fieldLabelClassName}>
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

              <div>
                <label htmlFor="party-election" className={fieldLabelClassName}>
                  Election
                </label>
                <input id="party-election" value={election ? election.title : electionId} title={electionId} disabled readOnly className={inputClassName} />
              </div>

              {/* Party lists have no status of their own: they go live with their election. */}
              <div>
                <label htmlFor="party-status" className={fieldLabelClassName}>
                  Status
                </label>
                <input
                  id="party-status"
                  value={election ? `${election.status} · follows the election` : "Follows the election"}
                  disabled
                  readOnly
                  className={inputClassName}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Party color" aside="used for tags, banner and ballot" className={cardRadius} bodyClassName={cardBody}>
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
                        active && "ring-2 ring-foreground ring-inset",
                      )}
                    />
                  );
                })}
              </div>
              <div className="w-35">
                <label htmlFor="party-color" className={fieldLabelClassName}>
                  Custom
                </label>
                <input
                  id="party-color"
                  value={form.color}
                  onChange={(e) => update({ color: e.target.value })}
                  onBlur={() => color && form.color !== color && update({ color })}
                  placeholder="#FFC200"
                  maxLength={7}
                  spellCheck={false}
                  aria-invalid={!!errors.color || undefined}
                  aria-describedby={errors.color ? "party-color-error" : undefined}
                  className={inputClassName}
                />
              </div>
            </div>
            {errors.color ? (
              <p id="party-color-error" className={cn(errorClassName, "text-right")}>
                {errors.color}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="Logo & banner" aside="drag an image onto a row to replace it" className={cardRadius} bodyClassName={cn(cardBody, "space-y-4")}>
            <ImageRow
              label="Logo"
              hint="Square PNG, JPG or WebP · max 1 MB · shown on the ballot"
              maxBytes={LOGO_MAX_BYTES}
              hasImage={logoUrl !== null}
              picked={logo !== null}
              savedImage={party?.logoUrl != null}
              onPick={pickLogo}
              onError={sayError}
              media={
                <span
                  aria-hidden
                  className={cn("flex size-14 shrink-0 items-center justify-center rounded-full bg-cover bg-center text-[1.625rem] font-semibold", !colorStyle && partyColorFallbackClassName)}
                  style={{ ...colorStyle, ...(logoUrl ? { backgroundImage: `url("${logoUrl}")` } : null) }}
                >
                  {logoUrl ? null : partyInitial(form.name)}
                </span>
              }
            />
            <div aria-hidden className="h-px bg-[#e4e8f0] dark:bg-border" />
            <ImageRow
              label="Banner"
              hint="3:1 PNG, JPG or WebP · max 2 MB · top of the party card"
              maxBytes={BANNER_MAX_BYTES}
              hasImage={bannerUrl !== null}
              picked={banner !== null}
              savedImage={party?.bannerUrl != null}
              onPick={pickBanner}
              onError={sayError}
              stacked
              media={
                <div
                  className={cn("flex aspect-3/1 w-full items-center overflow-hidden rounded-lg bg-cover bg-center px-3.5", !colorStyle && partyColorFallbackClassName)}
                  style={{ ...colorStyle, ...(bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : null) }}
                >
                  {bannerUrl ? <span className="sr-only">Banner image</span> : <span className="truncate text-[0.8125rem] font-semibold">{name || "Party name"}</span>}
                </div>
              }
            />
          </SectionCard>

          <SectionCard title="Platform" aside="shown on the ballot" className={cardRadius} bodyClassName={cardBody}>
            <label htmlFor="party-platform" className="sr-only">
              Platform
            </label>
            <textarea
              id="party-platform"
              value={form.platform}
              onChange={(e) => update({ platform: e.target.value })}
              placeholder={"•  Free printing stations in every building.\n•  Monthly open forums with the council."}
              rows={4}
              maxLength={PLATFORM_MAX_LENGTH}
              className={cn(inputClassName, "h-auto min-h-24 resize-y rounded-lg py-2.5 leading-6")}
            />
            <p className="mt-3.5 text-[0.65625rem] text-muted-foreground tabular-nums">
              {form.platform.length} / {PLATFORM_MAX_LENGTH} characters
            </p>
          </SectionCard>
        </div>

        {/* Live preview */}
        <aside className="xl:sticky xl:top-6">
          <SectionCard title="Preview" aside="voter ballot" className={cardRadius} bodyClassName={cn(cardBody, "space-y-3.5")}>
            <div
              className={cn("relative flex items-center gap-2.5 overflow-hidden rounded-lg bg-cover bg-center p-3.5", !colorStyle && partyColorFallbackClassName)}
              style={{ ...colorStyle, ...(bannerUrl ? { backgroundImage: `url("${bannerUrl}")`, color: "#ffffff" } : null) }}
            >
              {bannerUrl ? <span aria-hidden className="absolute inset-0 bg-brand-navy/55" /> : null}
              <span
                aria-hidden
                className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-white bg-cover bg-center text-[1.125rem] font-semibold text-[#334155]"
                style={logoUrl ? { backgroundImage: `url("${logoUrl}")` } : undefined}
              >
                {logoUrl ? null : partyInitial(form.name)}
              </span>
              <div className="relative min-w-0 space-y-0.5">
                <p className="truncate text-[1.125rem] leading-5.5 font-semibold">{name || "Party name"}</p>
                {motto ? <p className="truncate text-[0.75rem] leading-4">“{motto}”</p> : null}
              </div>
            </div>

            {/* How a candidate of this party is tagged on the ballot. */}
            <div className="flex items-center gap-2.5 rounded-lg border border-[#e4e8f0] px-3 py-2.5 dark:border-border">
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e4e8f0] text-[0.65625rem] text-foreground dark:bg-white/10">
                {previewCandidate?.initials ?? null}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-[0.8125rem] font-medium text-foreground">{previewCandidate?.name ?? "Candidate name"}</p>
                <p className="truncate text-[0.65625rem] text-muted-foreground">{previewCandidate?.position ?? "Position"}</p>
              </div>
              <span
                className={cn("max-w-28 shrink-0 truncate rounded px-1.75 py-0.75 text-[0.65625rem] uppercase", !colorStyle && partyColorFallbackClassName)}
                style={colorStyle}
              >
                {name || "Party"}
              </span>
            </div>

            <div className="space-y-1 text-muted-foreground">
              <p className="text-[0.65625rem] uppercase">Platform</p>
              <p className="text-[0.75rem] leading-4.5 whitespace-pre-line">{form.platform.trim() || "No platform yet."}</p>
            </div>
            <p className="text-[0.75rem] leading-4.5 text-muted-foreground">Voters see this on the ballot and candidate pages.</p>
          </SectionCard>
        </aside>
      </div>

      <Toast notice={notice} />
    </div>
  );
}

const cardRadius = "rounded-[0.625rem] border-[#e4e8f0]";
const cardBody = "px-5 py-4.5";

/** Outlined Replace / Upload button. */
const replaceButtonClassName = cn(toolbarButtonClassName, "h-9 px-4 text-[0.8125rem] font-semibold text-foreground");

interface ImageRowProps {
  label: string;
  hint: string;
  maxBytes: number;
  /** The logo / banner preview. */
  media: ReactNode;
  /** An image is shown (saved or newly picked). */
  hasImage: boolean;
  /** The shown image was picked here and isn't saved yet. */
  picked: boolean;
  /** The party list already has a saved image. */
  savedImage: boolean;
  onPick: (file: File | null) => void;
  onError: (message: string) => void;
  /** Media on top with the details below (banner), instead of in one row (logo). */
  stacked?: boolean;
}

/**
 * One image of the party list: preview, name and hint, Replace and Remove.
 * Dropping an image anywhere on the row replaces it. The API keeps a saved
 * image until another one is uploaded, so Remove only undoes a pick.
 */
function ImageRow({ label, hint, maxBytes, media, hasImage, picked, savedImage, onPick, onError, stacked = false }: ImageRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function accept(file: File | undefined) {
    if (!file) return;
    const problem = checkImage(file, maxBytes);
    if (problem) return onError(problem);
    onPick(file);
  }

  const actions = (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={() => inputRef.current?.click()} aria-label={`${hasImage ? "Replace" : "Upload"} the ${label.toLowerCase()}`} className={replaceButtonClassName}>
        {hasImage ? "Replace" : "Upload"}
      </button>
      {picked || hasImage ? (
        <button
          type="button"
          onClick={() => onPick(null)}
          disabled={!picked}
          aria-label={picked ? `Remove the new ${label.toLowerCase()}` : `Remove the ${label.toLowerCase()}`}
          title={picked ? (savedImage ? "Go back to the saved image" : undefined) : "A saved image can only be replaced, not removed."}
          className="h-8.5 cursor-pointer rounded-lg px-2.5 text-[0.8125rem] font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          Remove
        </button>
      ) : null}
    </div>
  );

  const details = (
    <div className="min-w-0 flex-1 space-y-0.5">
      <p className="text-[0.8125rem] font-medium text-foreground">{label}</p>
      <p className="text-[0.75rem] text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <div
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        accept(e.dataTransfer.files[0]);
      }}
      className={cn("-m-1.5 rounded-lg p-1.5 transition-colors duration-200", dragging && "bg-brand-blue/6 outline-2 outline-brand-blue/40 outline-dashed")}
    >
      {stacked ? (
        <div className="space-y-3">
          {media}
          <div className="flex flex-wrap items-center gap-4">
            {details}
            {actions}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          {media}
          {details}
          {actions}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
