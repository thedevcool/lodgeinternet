"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { toHostelSlug } from "@/lib/hostelSlug";
import type { Hostel, HostelCollage, HostelSchool } from "@/types";

/**
 * Hostels, locations (collages/colleges) and schools — fetched once and shared
 * by Home, /hostels and the location pages.
 *
 * - Module-level cache: moving between those pages is instant (no spinner).
 *   After 60s the cached copy still shows while a fresh copy loads.
 * - Real error + retry instead of silently showing an empty page.
 * - Schools are optional: if that newer endpoint fails, everything else works.
 *
 * Each page keeps its own slug resolution / redirect rules.
 */
export type Directory = {
  hostels: Hostel[];
  collages: HostelCollage[];
  schools: HostelSchool[];
};

const TTL_MS = 60_000;
let cache: { data: Directory; at: number } | null = null;
let inflight: Promise<Directory> | null = null;

async function getJson(path: string) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

function loadDirectory(): Promise<Directory> {
  if (inflight) return inflight;
  inflight = Promise.all([
    getJson("/api/hostels"),
    getJson("/api/hostel-collages"),
    getJson("/api/hostel-schools").catch(() => ({ schools: [] })),
  ])
    .then(([h, c, s]) => {
      const data: Directory = {
        hostels: h.hostels || [],
        collages: c.collages || [],
        schools: s.schools || [],
      };
      cache = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useHostelDirectory() {
  const [data, setData] = useState<Directory | null>(() => cache?.data ?? null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const isFresh = cache && Date.now() - cache.at < TTL_MS;
    if (isFresh && attempt === 0) {
      setData(cache!.data);
      return;
    }
    loadDirectory()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        // Keep showing a cached copy if we have one; only error when we don't.
        if (!cancelled && !cache) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  const lookups = useMemo(() => buildLookups(data), [data]);

  return { data, loading: !data && !error, error, retry, ...lookups };
}

// ── Lookups & URL helpers ────────────────────────────────────────────────────

function buildLookups(data: Directory | null) {
  const collageById = new Map<string, HostelCollage>();
  const schoolById = new Map<string, HostelSchool>();
  const hostelsByCollage = new Map<string, Hostel[]>();
  const collagesBySchool = new Map<string, HostelCollage[]>();

  for (const s of data?.schools ?? []) schoolById.set(s.id, s);
  for (const c of data?.collages ?? []) {
    collageById.set(c.id, c);
    if (c.schoolId) collagesBySchool.set(c.schoolId, [...(collagesBySchool.get(c.schoolId) ?? []), c]);
  }
  for (const h of data?.hostels ?? []) {
    if (h.collageId) hostelsByCollage.set(h.collageId, [...(hostelsByCollage.get(h.collageId) ?? []), h]);
  }

  /** Plans URL for a hostel — the same URLs the site has always used. */
  const plansPathFor = (hostel: Hostel) => {
    const collage = hostel.collageId ? collageById.get(hostel.collageId) : undefined;
    return collage
      ? `/${collage.slug}/${toHostelSlug(hostel.name)}/plans`
      : `/${toHostelSlug(hostel.name)}/plans`;
  };

  /** Page URL for a location: colleges live under their school. */
  const locationPathFor = (collage: HostelCollage) => {
    const school = collage.schoolId ? schoolById.get(collage.schoolId) : undefined;
    return school ? `/${school.slug}/${collage.slug}` : `/${collage.slug}`;
  };

  return { collageById, schoolById, hostelsByCollage, collagesBySchool, plansPathFor, locationPathFor };
}
