"use client";

import { useState } from "react";
import { companyIconSources, recordInitials } from "./company-icon";

type Props = { name: string; kind: string; website?: string };

export function RecordAvatar({ name, kind, website }: Props) {
  const sources = companyIconSources(kind, website);
  return <AvatarImage key={sources.join('|')} name={name} sources={sources}/>;
}

function AvatarImage({ name, sources }: { name: string; sources: string[] }) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const src = sources[index];
  return <span className={`record-avatar${loaded ? " has-company-icon" : ""}`} aria-hidden="true">
    {!loaded && recordInitials(name)}
    {src && <img key={src} src={src} alt="" width={25} height={25}
      loading="lazy" decoding="async" referrerPolicy="no-referrer"
      className={loaded ? "company-icon" : "company-icon is-loading"}
      onLoad={() => setLoaded(true)}
      onError={() => { setLoaded(false); setIndex(value => value + 1); }}/> }
  </span>;
}
