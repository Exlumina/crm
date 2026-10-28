
import {api,APIError} from "./crm-api";
import type { CompanyConfig } from "./config";
import { RecordAvatar } from "./record-avatar";
import { readViewModes, viewMode, withViewMode, VIEW_MODES_KEY, type ViewMode, type ViewModes } from "./view-preferences";

import { appendMembershipOrder, insertMembershipOrder } from "./crm-order";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, Columns3, Download, ExternalLink, GripVertical, Plus, RefreshCw, Search, Settings2, Table2, X } from "lucide-react";

type Membership = { stage: string; order: number };
type CRMRecord = {
  id: string; revision: string; name: string; kind: "company" | "person";
  website?: string; description?: string; notes?: string; nextAction?: string;
  industries?: string[]; fundingStages?: string[]; investmentRating?: number | null;
  lastCommunication?: string | null; communicationType?: string | null;
  replyStatus?: string | null; replyDueAt?: string | null;
  memberships?: Record<string, Membership>; source?: unknown;
  additionalFields?: Record<string, unknown>; relationships?: unknown; audit?: unknown[];
  [key: string]: unknown;
};
type Board = { id: string; name: string; stages: string[]; stageDescriptions?: Record<string, string> };
type ViewFilter = { name: string; query: string; boardId: string; kind: string; mode: string };
type SavedView = ViewFilter & { id: string; revision?: string; view?: ViewFilter };
type StatePage = { boards: Board[]; boardsRevision: string; records: CRMRecord[]; total: number; nextCursor?: string | null };
type Draft = { name: string; kind: "company" | "person"; website: string; notes: string; industries: string; fundingStages: string; investmentRating: string; lastCommunication: string; communicationType: string; replyStatus: string; replyDueAt: string; nextAction: string; memberships: Record<string, Membership> };

const replyLabels: Record<string, string> = { needs_reply: "Needs reply", waiting_on_them: "Waiting for them", done: "Done" };
const commLabels: Record<string, string> = { email: "Email", call: "Call", video_call: "Video call", meeting: "Meeting", message: "Message", other: "Other" };
const emptyDraft: Draft = { name: "", kind: "company", website: "", notes: "", industries: "", fundingStages: "", investmentRating: "", lastCommunication: "", communicationType: "", replyStatus: "", replyDueAt: "", nextAction: "", memberships: {} };

function draftFrom(record: CRMRecord): Draft {
  return { name: record.name, kind: record.kind, website: record.website || "", notes: record.notes || "", industries: (record.industries || []).join(", "), fundingStages: (record.fundingStages || []).join(", "), investmentRating: record.investmentRating ? String(record.investmentRating) : "", lastCommunication: record.lastCommunication || "", communicationType: record.communicationType || "", replyStatus: record.replyStatus || "", replyDueAt: record.replyDueAt || "", nextAction: record.nextAction || "", memberships: structuredClone(record.memberships || {}) };
}
function patchFrom(draft: Draft): Record<string, unknown> {
  return { ...draft, name: draft.name.trim(), industries: draft.industries.split(",").map(x => x.trim()).filter(Boolean), fundingStages: draft.fundingStages.split(",").map(x => x.trim()).filter(Boolean), investmentRating: draft.investmentRating ? Number(draft.investmentRating) : null, lastCommunication: draft.lastCommunication || null, communicationType: draft.communicationType || null, replyStatus: draft.replyStatus || null, replyDueAt: draft.replyDueAt || null };
}
function safeURL(value?: string): string | null { try { const url = new URL(value || ""); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } }
function smallSource(value: unknown): string { if (typeof value === "string") return value; return JSON.stringify(value, null, 2); }

export default function CRMClient({config, onLogout, onExpired}: {config: CompanyConfig; onLogout: () => void; onExpired: () => void}) {
  const zone = config.timezone;
function localDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (part: string) => parts.find(p => p.type === part)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function isOverdue(record: CRMRecord): boolean { return record.replyStatus === "needs_reply" && !!record.replyDueAt && record.replyDueAt < localDate(); }
function dateLabel(value?: string | null): string {
  if (!value) return "Not recorded";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: zone }).format(date);
}

  const [records, setRecords] = useState<CRMRecord[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsRevision, setBoardsRevision] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [boardId, setBoardId] = useState(config.boards[0]?.id || "");
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [replyFilter, setReplyFilter] = useState("");
  const [viewModes, setViewModes] = useState<ViewModes>({});
  const [preferencesReady, setPreferencesReady] = useState(false);
  const mode = viewMode(viewModes, boardId);
  function setMode(value: ViewMode, targetBoardId = boardId) {
    setViewModes(current => withViewMode(current, targetBoardId, value));
  }
  const [showEmpty, setShowEmpty] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [selected, setSelected] = useState<CRMRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [note, setNote] = useState("");
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [configBoard, setConfigBoard] = useState<Board>({ id: "", name: "", stages: [] });
  const [stageName, setStageName] = useState("");
  const [configRevision, setConfigRevision] = useState("");
  const [configError, setConfigError] = useState("");
  const [dragTarget, setDragTarget] = useState("");
  const detailRef = useRef<HTMLDialogElement>(null);
  const boardRef = useRef<HTMLDialogElement>(null);
  const dragId = useRef("");
  const detailId = useRef("");
  const loadId = useRef(0);
  const pendingOperations = useRef(new Map<string, string>());
  const [history, setHistory] = useState<unknown[]>([]);

  async function mutate<T>(payload: Record<string, unknown>): Promise<T> {
    const { operationId: ignored, ...intent } = payload; void ignored;
    const key = JSON.stringify(intent);
    const operationId = pendingOperations.current.get(key) || crypto.randomUUID();
    pendingOperations.current.set(key, operationId);
    const result = await api<T>({ ...intent, operationId }, true);
    pendingOperations.current.delete(key);
    return result;
  }

  const load = useCallback(async () => {
    const requestId = ++loadId.current;
    setLoading(true); setError("");
    try {
      let cursor = ""; const all: CRMRecord[] = []; const seen = new Set<string>(); let first: StatePage | undefined;
      do {
        const page = await api<StatePage>({ op: "state", limit: "200", ...(cursor ? { cursor } : {}) });
        if (!first) first = page;
        for (const record of page.records || []) { if (seen.has(record.id)) throw new Error("The data changed while loading. Refresh to load a consistent list."); seen.add(record.id); all.push(record); }
        const next = page.nextCursor || "";
        if (next && next === cursor) throw new Error("The CRM returned a repeated page. Refresh to try again.");
        cursor = next;
      } while (cursor);
      if (requestId !== loadId.current) return;
      if (first && all.length !== first.total) throw new Error("The record count changed while loading. Refresh to load a complete list.");
      setBoards(first?.boards || []); setBoardsRevision(first?.boardsRevision || ""); setRecords(all); setTotal(first?.total ?? all.length); setUnauthorized(false);
      try { const saved = await api<{ views: SavedView[] }>({ op: "views" }); if (requestId === loadId.current) setViews(saved.views || []); } catch { /* Core records remain usable if saved views are unavailable. */ }
    } catch (failure) {
      if (requestId !== loadId.current) return;
      const expired = failure instanceof APIError && failure.status === 401; setUnauthorized(expired); if (expired) onExpired();
      setError(failure instanceof Error ? failure.message : "Could not load your CRM. Try refreshing.");
    } finally { if (requestId === loadId.current) setLoading(false); }
  }, [onExpired]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try { setViewModes(readViewModes(window.localStorage.getItem(VIEW_MODES_KEY))); }
    catch { /* Storage restrictions do not prevent in-session preferences. */ }
    setPreferencesReady(true);
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    try { window.localStorage.setItem(VIEW_MODES_KEY, JSON.stringify(viewModes)); }
    catch { /* Keep in-session choices when browser storage is unavailable. */ }
  }, [viewModes, preferencesReady]);
  useEffect(() => { if ((selected || creating) && detailRef.current && !detailRef.current.open) detailRef.current.showModal(); }, [selected, creating]);
  useEffect(() => { if (configuring && boardRef.current && !boardRef.current.open) boardRef.current.showModal(); }, [configuring]);
  const currentBoard = boards.find(board => board.id === boardId);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return records.filter(record => (!boardId || !!record.memberships?.[boardId]) && (!kind || record.kind === kind) && (!stageFilter || record.memberships?.[boardId]?.stage === stageFilter) && (!replyFilter || (replyFilter === "overdue" ? isOverdue(record) : record.replyStatus === replyFilter)) && (!search || [record.name, record.website, record.description, record.notes, record.nextAction, ...(record.industries || []), ...(record.fundingStages || [])].some(value => String(value || "").toLowerCase().includes(search))))
      .sort((a, b) => boardId ? (a.memberships?.[boardId]?.order ?? 0) - (b.memberships?.[boardId]?.order ?? 0) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  }, [records, boardId, kind, stageFilter, replyFilter, query]);

  function chooseBoard(id: string) { setBoardId(id); setKind(""); setStageFilter(""); setReplyFilter(""); }
  async function openRecord(record: CRMRecord) {
    detailId.current = record.id; setDetailLoading(true);
    setSelected(record); setCreating(false); setEditing(false); setNote(""); setDetailError(""); setHistory([]);
    try { const fresh = await api<CRMRecord>({ op: "get", id: record.id }); setSelected(current => current?.id === record.id ? fresh : current); const result = await api<{ entries: unknown[] }>({ op: "history", id: record.id }); if (detailId.current === record.id) setHistory(result.entries || []); }
    catch (failure) { if (detailId.current === record.id) setDetailError(failure instanceof Error ? failure.message : "Could not refresh this record."); }
    finally { if (detailId.current === record.id) setDetailLoading(false); }
  }
  function closeDetail() { if (busy) return; detailId.current = ""; setDetailLoading(false); detailRef.current?.close(); setSelected(null); setCreating(false); setEditing(false); setDetailError(""); setNote(""); }
  function newRecord() {
    detailId.current = ""; setDetailLoading(false);
    setSelected(null); setCreating(true); setEditing(true); setDetailError("");
    const memberships = currentBoard?.stages[0] ? { [currentBoard.id]: { stage: currentBoard.stages[0], order: appendMembershipOrder(records.flatMap(record => record.memberships?.[currentBoard.id] ? [record.memberships[currentBoard.id].order] : [])) } } : {};
    setDraft({ ...emptyDraft, memberships });
  }
  function startEditing() { if (!selected || detailLoading) return; setDraft(draftFrom(selected)); setEditing(true); setDetailError(""); }
  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(previous => ({ ...previous, [key]: value })); }
  function acceptRecord(record: CRMRecord, message: string) {
    setRecords(previous => previous.some(item => item.id === record.id) ? previous.map(item => item.id === record.id ? record : item) : [...previous, record]);
    if (creating) setTotal(previous => previous + 1);
    setSelected(record); setCreating(false); setEditing(false); setNotice(message);
  }
  async function saveRecord(event: FormEvent) {
    event.preventDefault(); setBusy(true); setDetailError("");
    try {
      const complete = patchFrom(draft);
      const baseline = selected ? patchFrom(draftFrom(selected)) : {};
      const changes = creating ? complete : Object.fromEntries(Object.entries(complete).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(baseline[key])));
      if (!creating && !Object.keys(changes).length) { setEditing(false); setNotice("No changes to save."); return; }
      const record = await mutate<CRMRecord>(creating ? { op: "create", operationId: crypto.randomUUID(), record: changes } : { op: "update", id: selected?.id, expectedRevision: selected?.revision, operationId: crypto.randomUUID(), changes });
      acceptRecord(record, creating ? "Record created." : "Changes saved.");
    } catch (failure) { setDetailError(failure instanceof Error ? failure.message : "Could not save. Your input is preserved."); }
    finally { setBusy(false); }
  }
  async function appendNote(event: FormEvent) {
    event.preventDefault(); if (!selected || !note.trim()) return; setBusy(true); setDetailError("");
    try { const record = await mutate<CRMRecord>({ op: "append_note", id: selected.id, expectedRevision: selected.revision, operationId: crypto.randomUUID(), text: note.trim() }); acceptRecord(record, "Note saved."); setNote(""); }
    catch (failure) { setDetailError(failure instanceof Error ? failure.message : "Could not save the note. Your input is preserved."); }
    finally { setBusy(false); }
  }
  async function moveRecord(record: CRMRecord, targetStage: string, beforeId?: string, board = currentBoard) {
    if (!board || busy) return;
    const others = records.filter(item => item.id !== record.id && item.memberships?.[board.id]?.stage === targetStage).sort((a, b) => (a.memberships?.[board.id]?.order || 0) - (b.memberships?.[board.id]?.order || 0));
    const index = beforeId ? others.findIndex(item => item.id === beforeId) : -1;
    const high = index >= 0 ? others[index].memberships![board.id].order : null;
    const low = index > 0 ? others[index - 1].memberships![board.id].order : index === 0 ? 0 : others.at(-1)?.memberships?.[board.id]?.order || 0;
    const order = high === null ? appendMembershipOrder(others.map(item => item.memberships![board.id].order)) : insertMembershipOrder(low, high);
    setBusy(true); setError(""); setDetailError("");
    try {
      const saved = await mutate<CRMRecord>({ op: "move", id: record.id, expectedRevision: record.revision, operationId: crypto.randomUUID(), boardId: board.id, stage: targetStage, order });
      setRecords(previous => previous.map(item => item.id === saved.id ? saved : item)); setSelected(previous => previous?.id === saved.id ? saved : previous); setNotice(`Moved to ${targetStage}.`);
    } catch (failure) { const message = failure instanceof Error ? failure.message : "Move failed. Refresh and try again."; setError(message); setDetailError(message); }
    finally { setBusy(false); setDragTarget(""); }
  }
  function dropRecord(stage: string, beforeId?: string) {
    const id = dragId.current; dragId.current = ""; setDragTarget("");
    const record = records.find(item => item.id === id); if (record && id !== beforeId) void moveRecord(record, stage, beforeId);
  }
  async function saveView(event: FormEvent) {
    event.preventDefault(); if (!viewName.trim()) return; setBusy(true); setError("");
    try { await mutate({ op: "save_view", operationId: crypto.randomUUID(), view: { name: viewName.trim(), query, boardId, kind, mode } }); const saved = await api<{ views: SavedView[] }>({ op: "views" }); setViews(saved.views || []); setViewName(""); setSavingView(false); setNotice("View saved."); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save this view."); } finally { setBusy(false); }
  }
  function applyView(saved: SavedView) { const view = saved.view || saved; setBoardId(view.boardId || ""); setKind(view.kind || ""); setQuery(view.query || ""); setMode(view.mode === "board" && view.boardId ? "board" : "table", view.boardId || ""); setStageFilter(""); setReplyFilter(""); }
  function openConfig(newBoard = false) { setConfigBoard(newBoard ? { id: "", name: "", stages: ["To review", "In conversation", "Waiting for them", "Closed"] } : structuredClone(currentBoard || boards[0] || { id: "", name: "", stages: [] })); setConfigRevision(boardsRevision); setStageName(""); setConfigError(""); setConfiguring(true); }
  async function saveBoard(event: FormEvent) {
    event.preventDefault(); if (!configBoard.name.trim() || !configBoard.stages.length) return; setBusy(true); setConfigError("");
    try {
      const board = { ...configBoard, id: configBoard.id || configBoard.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `board_${Date.now()}`, name: configBoard.name.trim() };
      const result = await mutate<{ boards: Board[]; revision: string }>({ op: "configure_board", expectedRevision: configRevision, operationId: crypto.randomUUID(), board });
      setBoards(result.boards); setBoardsRevision(result.revision); setBoardId(board.id); setKind(""); setStageFilter(""); boardRef.current?.close(); setConfiguring(false); setNotice("Board saved.");
    } catch (failure) { setConfigError(failure instanceof Error ? failure.message : "Could not save this board."); } finally { setBusy(false); }
  }
  function shiftStage(index: number, offset: number) { const next = [...configBoard.stages]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; setConfigBoard({ ...configBoard, stages: next }); }
  async function exportData() {
    setBusy(true); setError("");
    try {
      let cursor = ""; const documents: Record<string, unknown>[] = []; const seen = new Set<string>();
      do {
        const page = await api<{ documents: Record<string, unknown>[]; nextCursor?: string | null }>({ op: "export", ...(cursor ? { cursor } : {}) });
        for (const document of page.documents || []) { const id = String(document.id); if (seen.has(id)) throw new Error("The data changed while exporting. Retry the export before using this file."); seen.add(id); documents.push(document); }
        const next = page.nextCursor || "";
        if (next && next === cursor) throw new Error("The CRM returned a repeated export page. Try again.");
        cursor = next;
      } while (cursor);
      const data = { schemaVersion: 1, exportedAt: new Date().toISOString(), documents };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `CRM_Export_${localDate()}.json`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("Complete record export downloaded.");
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not export. Try again."); } finally { setBusy(false); }
  }

  const visibleStages = currentBoard?.stages.filter(stage => (!stageFilter || stage === stageFilter) && (showEmpty || filtered.some(record => record.memberships?.[boardId]?.stage === stage))) || [];
  return <main className="crm-shell">
    <a className="skip-link" href="#records">Skip to records</a>
    <header className="app-header">
      <div className="identity"><h1 className="brand-name">{config.name}</h1><span className="private-label">Private</span></div>
      <div className="header-actions"><button className="text-button" onClick={onLogout}>Sign out</button><span className="record-count">{loading ? "Loading records…" : `${total.toLocaleString()} records`}</span><button className="icon-button" aria-label="Refresh CRM" onClick={() => void load()} disabled={loading || busy}><RefreshCw size={16} className={loading ? "loading-icon" : ""}/></button><button className="primary-button" onClick={newRecord} disabled={loading || unauthorized || busy}><Plus size={16}/>New record</button></div>
    </header>
    <nav className="board-tabs" aria-label="CRM workspaces">
      {boards.map(board => <button key={board.id} className={boardId === board.id ? "tab active" : "tab"} onClick={() => chooseBoard(board.id)}>{board.name}<span>{records.filter(record => record.memberships?.[board.id]).length}</span></button>)}
      <button className={!boardId ? "tab active" : "tab"} onClick={() => chooseBoard("")}>Directory<span>{total}</span></button>
      <button className="icon-button add-board" aria-label="Create board" onClick={() => openConfig(true)} disabled={loading || unauthorized}><Plus size={16}/></button>
    </nav>
    <section className="workspace-heading"><div><h2>{currentBoard?.name || "Relationship directory"}</h2><p>{boardId ? "Track the relationship. Keep the next action clear." : "People and companies, with their original context preserved."}</p></div><div className="workspace-actions">{currentBoard && <button className="quiet-button" onClick={() => openConfig()} disabled={loading || busy}><Settings2 size={15}/>Configure board</button>}<a className="quiet-button transfer-link" href="/data">Data &amp; recovery</a><button className="quiet-button export-button" onClick={() => void exportData()} disabled={loading || unauthorized || busy}><Download size={15}/>Export</button></div></section>
    <section className="toolbar" aria-label="Record filters">
      <label className="search-field"><Search size={17}/><span className="sr-only">Search relationships</span><input type="search" placeholder="Search names, notes, next actions…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button className="icon-button" aria-label="Clear search" onClick={() => setQuery("")}><X size={14}/></button>}</label>
      <label><span className="sr-only">Record type</span><select value={kind} onChange={event => setKind(event.target.value)}><option value="">All types</option><option value="company">Companies</option><option value="person">People</option></select></label>
      {currentBoard && <label><span className="sr-only">Pipeline stage</span><select value={stageFilter} onChange={event => setStageFilter(event.target.value)}><option value="">All stages</option>{currentBoard.stages.map(stage => <option key={stage}>{stage}</option>)}</select></label>}
      <label><span className="sr-only">Reply status</span><select value={replyFilter} onChange={event => setReplyFilter(event.target.value)}><option value="">All reply statuses</option><option value="needs_reply">Needs reply</option><option value="overdue">Overdue</option><option value="waiting_on_them">Waiting for them</option><option value="done">Done</option></select></label>
      <div className="view-switch" aria-label="Display mode">{currentBoard && <button aria-label="Board view" aria-pressed={mode === "board"} className={mode === "board" ? "selected" : ""} onClick={() => setMode("board")}><Columns3 size={16}/></button>}<button aria-label="Table view" aria-pressed={mode === "table" || !currentBoard} className={mode === "table" || !currentBoard ? "selected" : ""} onClick={() => setMode("table")}><Table2 size={16}/></button></div>
    </section>
    <div className="view-bar"><span>{filtered.length.toLocaleString()} shown{query && ` for “${query}”`}</span><div className="saved-views">{views.length > 0 && <label><span className="sr-only">Open saved view</span><select value="" onChange={event => { const view = views.find(item => item.id === event.target.value); if (view) applyView(view); }}><option value="">Saved views</option>{views.map(view => <option key={view.id} value={view.id}>{(view.view || view).name}</option>)}</select></label>}{savingView ? <form className="save-view-form" onSubmit={saveView}><input aria-label="Saved view name" placeholder="View name" required maxLength={100} value={viewName} onChange={event => setViewName(event.target.value)} autoFocus/><button className="quiet-button" type="submit" disabled={busy}>Save</button><button className="icon-button" type="button" aria-label="Cancel saving view" onClick={() => setSavingView(false)}><X size={14}/></button></form> : <button className="text-button" onClick={() => setSavingView(true)} disabled={loading || unauthorized}>Save current view</button>}{currentBoard && mode === "board" && <label className="checkbox-label"><input type="checkbox" checked={showEmpty} onChange={event => setShowEmpty(event.target.checked)}/>Show empty stages</label>}</div></div>
    <div className="notice" role="status" aria-live="polite">{notice && <><Check size={14}/>{notice}<button className="icon-button" aria-label="Dismiss status" onClick={() => setNotice("")}><X size={13}/></button></>}</div>
    {error && <div className="error-banner" role="alert"><div><strong>{unauthorized ? "Sign in to your private CRM" : "Your CRM needs attention"}</strong><p>{unauthorized ? "Your session expired. Sign in again to continue." : error}</p></div>{unauthorized ? <button className="primary-button" onClick={onExpired}>Sign in</button> : <button className="quiet-button" onClick={() => void load()} disabled={loading}>Refresh</button>}</div>}
    <section id="records" aria-label="CRM records" aria-busy={loading} tabIndex={-1}>
      {loading && !records.length ? <div className="loading-state"><div className="skeleton-line"/><div className="skeleton-board">{[0,1,2].map(item => <div key={item} className="skeleton-column"><div/><div/><div/></div>)}</div><p>Loading your relationships…</p></div> : !unauthorized && filtered.length === 0 ? <div className="empty-state"><h3>{records.length ? "No matching relationships" : "Your CRM is ready for its first records"}</h3><p>{records.length ? "Try a different search, stage or reply status." : "Create your first company or person to start tracking relationships."}</p>{records.length ? <button className="quiet-button" onClick={() => { setQuery(""); setKind(""); setStageFilter(""); setReplyFilter(""); }}>Clear filters</button> : <button className="primary-button" onClick={newRecord} disabled={busy || loading}><Plus size={15}/>Create record</button>}</div> : !unauthorized && currentBoard && mode === "board" ? <div className="kanban" aria-label={`${currentBoard.name} board`}>
        {visibleStages.map(stage => { const inStage = filtered.filter(record => record.memberships?.[boardId]?.stage === stage); return <section key={stage} className={`stage-column ${dragTarget === stage ? "drop-active" : ""}`} aria-label={`${stage}, ${inStage.length} records`} onDragOver={event => { if (dragId.current) { event.preventDefault(); setDragTarget(stage); } }} onDrop={event => { event.preventDefault(); dropRecord(stage); }}><header className="stage-heading"><h3>{stage}</h3><span>{inStage.length}</span></header>{currentBoard.stageDescriptions?.[stage] && <p className="stage-description">{currentBoard.stageDescriptions[stage]}</p>}<div className="stage-records">{inStage.map(record => <article key={record.id} className="record-card" onDragOver={event => { if (dragId.current) { event.preventDefault(); event.stopPropagation(); setDragTarget(`${stage}:${record.id}`); } }} onDrop={event => { event.preventDefault(); event.stopPropagation(); dropRecord(stage, record.id); }} data-drop-target={dragTarget === `${stage}:${record.id}` || undefined}>
          <div className="record-card-top"><button className="record-name" onClick={() => void openRecord(record)}><RecordAvatar name={record.name} kind={record.kind} website={config.loadCompanyIcons ? record.website : undefined}/><span>{record.name}</span></button><span className="drag-grip" draggable={!busy} title="Drag to move. You can also open the record and choose a stage." onDragStart={event => { dragId.current = record.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", record.id); }} onDragEnd={() => { dragId.current = ""; setDragTarget(""); }} aria-hidden="true"><GripVertical size={15}/></span></div>
          <button className="card-content" onClick={() => void openRecord(record)} aria-label={`Open ${record.name}`}><span className="record-kind">{record.kind}{record.investmentRating ? ` · ${record.investmentRating}/5 rating` : ""}</span>{record.fundingStages?.length ? <span className="tag-row funding-tags">{record.fundingStages.slice(0,3).map(tag => <span className="tag" key={tag}>{tag}</span>)}</span> : null}{record.industries?.length ? <span className="tag-row">{record.industries.slice(0,3).map(tag => <span className="tag muted-tag" key={tag}>{tag}</span>)}{record.industries.length > 3 && <span className="extra-tags">+{record.industries.length - 3}</span>}</span> : null}{record.nextAction && <span className="next-action">{record.nextAction}</span>}{record.replyStatus && <span className={`reply-badge ${record.replyStatus === "needs_reply" ? "owed" : ""}`}>{isOverdue(record) ? "Overdue" : replyLabels[record.replyStatus] || record.replyStatus}{record.replyStatus === "needs_reply" && record.replyDueAt ? ` · ${dateLabel(record.replyDueAt)}` : ""}</span>}</button>
        </article>)}{!inStage.length && <p className="column-empty">Move a record here.</p>}</div></section>; })}
      </div> : !unauthorized && <div className="table-scroll"><table><thead><tr><th scope="col">Relationship</th><th scope="col">{currentBoard ? "Stage" : "Workflows"}</th><th scope="col">Reply status</th><th scope="col">Next action</th><th scope="col">Last communication</th></tr></thead><tbody>{filtered.map(record => <tr key={record.id}><th scope="row"><button className="table-name" onClick={() => void openRecord(record)}><RecordAvatar name={record.name} kind={record.kind} website={config.loadCompanyIcons ? record.website : undefined}/><span>{record.name}<small>{record.kind}{record.investmentRating ? ` · ${record.investmentRating}/5 rating` : ""}</small></span></button></th><td>{currentBoard ? record.memberships?.[boardId]?.stage : Object.keys(record.memberships || {}).map(id => boards.find(board => board.id === id)?.name || id).join(", ") || <span className="muted">No board</span>}</td><td>{record.replyStatus ? <span className={`reply-badge ${record.replyStatus === "needs_reply" ? "owed" : ""}`}>{isOverdue(record) ? "Overdue" : replyLabels[record.replyStatus] || record.replyStatus}</span> : <span className="muted">Not set</span>}{record.replyStatus === "needs_reply" && record.replyDueAt && <small className="cell-secondary">{dateLabel(record.replyDueAt)}</small>}</td><td className="action-cell">{record.nextAction || <span className="muted">Not set</span>}</td><td className="date-cell">{dateLabel(record.lastCommunication)}</td></tr>)}</tbody></table></div>}
    </section>
    <footer className="app-footer"><span>Shared records across your authorized sessions</span><span>Follow-up timezone: {config.timezone}</span></footer>

    <dialog ref={detailRef} className="detail-dialog" aria-labelledby="detail-title" onCancel={event => { if (busy) event.preventDefault(); else closeDetail(); }} onClose={() => { if (!busy) { setSelected(null); setCreating(false); setEditing(false); } }}>
      <header className="dialog-header"><div className="detail-identity">{selected && !creating && <RecordAvatar name={selected.name} kind={selected.kind} website={config.loadCompanyIcons ? selected.website : undefined}/>}<div><span className="record-kind">{creating ? "New relationship" : selected?.kind}</span><h2 id="detail-title">{creating ? "Create record" : selected?.name}</h2></div></div><div className="dialog-actions">{selected && !editing && <button className="quiet-button" onClick={startEditing} disabled={busy || detailLoading}>Edit record</button>}<button className="icon-button" aria-label="Close record" onClick={closeDetail} disabled={busy}><X size={20}/></button></div></header>
      {detailError && <div role="alert" className="inline-error">{detailError}{!editing && <button className="text-button" onClick={() => selected && void openRecord(selected)} disabled={busy}>Refresh record</button>}</div>}
      {editing ? <form onSubmit={saveRecord} className="record-form"><div className="form-grid"><label className="full-width">Name<input required maxLength={2000} value={draft.name} onChange={event => updateDraft("name", event.target.value)} autoFocus/></label><label>Type<select value={draft.kind} onChange={event => updateDraft("kind", event.target.value as Draft["kind"])}><option value="company">Company</option><option value="person">Person</option></select></label><label>Website<input type="url" placeholder="https://company.example" value={draft.website} maxLength={2000} onChange={event => updateDraft("website", event.target.value)}/></label><label>Tags<span className="field-hint">Separate tags with commas</span><input value={draft.fundingStages} onChange={event => updateDraft("fundingStages", event.target.value)}/></label><label>Industries<span className="field-hint">Separate tags with commas</span><input value={draft.industries} onChange={event => updateDraft("industries", event.target.value)}/></label><label>Rating<select value={draft.investmentRating} onChange={event => updateDraft("investmentRating", event.target.value)}><option value="">Not rated</option>{[1,2,3,4,5].map(rating => <option value={rating} key={rating}>{rating} / 5</option>)}</select></label><label>Communication type<select value={draft.communicationType} onChange={event => updateDraft("communicationType", event.target.value)}><option value="">Not set</option>{Object.entries(commLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="full-width">Last communication<span className="field-hint">Use a known date (YYYY-MM-DD) or an ISO timestamp. Leave unknown dates empty.</span><input placeholder="2026-01-01" value={draft.lastCommunication} onChange={event => updateDraft("lastCommunication", event.target.value)}/></label></div><fieldset><legend>Pipeline memberships</legend><p className="field-hint">Each board has its own stage. This does not change reply status.</p>{boards.map(board => <label key={board.id}>{board.name}<select value={draft.memberships[board.id]?.stage || ""} onChange={event => { const memberships = { ...draft.memberships }; if (event.target.value) memberships[board.id] = { stage: event.target.value, order: memberships[board.id]?.order ?? appendMembershipOrder(records.flatMap(record => record.memberships?.[board.id] ? [record.memberships[board.id].order] : [])) }; else delete memberships[board.id]; updateDraft("memberships", memberships); }}><option value="">Not on this board</option>{board.stages.map(stage => <option key={stage}>{stage}</option>)}</select></label>)}</fieldset><fieldset><legend>Reply and next action</legend><div className="form-grid"><label>Reply status<select value={draft.replyStatus} onChange={event => updateDraft("replyStatus", event.target.value)}><option value="">Not set</option>{Object.entries(replyLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Reply due date<input type="date" value={draft.replyDueAt} onChange={event => updateDraft("replyDueAt", event.target.value)}/><span className="field-hint">{config.timezone} calendar date. Overdue applies only to Needs reply.</span></label><label className="full-width">Next action<textarea rows={3} maxLength={4000} value={draft.nextAction} onChange={event => updateDraft("nextAction", event.target.value)}/></label></div></fieldset><label>Notes<textarea rows={7} maxLength={30000} value={draft.notes} onChange={event => updateDraft("notes", event.target.value)}/></label><div className="form-actions"><button type="button" className="quiet-button" disabled={busy} onClick={() => creating ? closeDetail() : setEditing(false)}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : creating ? "Create record" : "Save changes"}</button></div></form> : selected && <div className="record-detail">
        <div className="detail-summary">{safeURL(selected.website) && <a className="website-link" href={safeURL(selected.website)!} target="_blank" rel="noopener noreferrer">{selected.website}<ExternalLink size={13}/></a>}{selected.description && <p className="record-description">{selected.description}</p>}<div className="tag-row">{(selected.fundingStages || []).map(tag => <span className="tag" key={`funding:${tag}`}>{tag}</span>)}{(selected.industries || []).map(tag => <span className="tag muted-tag" key={`industry:${tag}`}>{tag}</span>)}</div></div>
        <section className="detail-section"><h3>Next action</h3><p className="next-action-detail">{selected.nextAction || "No next action recorded."}</p><dl className="detail-facts"><div><dt>Reply status</dt><dd className={selected.replyStatus === "needs_reply" ? "owed-text" : ""}>{isOverdue(selected) ? "Overdue · " : ""}{selected.replyStatus ? replyLabels[selected.replyStatus] || selected.replyStatus : "Not set"}</dd></div><div><dt>Reply due</dt><dd>{dateLabel(selected.replyDueAt)}</dd></div><div><dt>Last communication</dt><dd>{dateLabel(selected.lastCommunication)}</dd></div><div><dt>Communication type</dt><dd>{selected.communicationType ? commLabels[selected.communicationType] || selected.communicationType : "Not set"}</dd></div><div><dt>Rating</dt><dd>{selected.investmentRating ? `${selected.investmentRating} / 5` : "Not rated"}</dd></div></dl></section>
        <section className="detail-section"><h3>Workflows</h3>{Object.keys(selected.memberships || {}).length ? Object.entries(selected.memberships || {}).map(([id, membership]) => { const board = boards.find(item => item.id === id); return <div className="membership-row" key={id}><label>{board?.name || id}<select aria-label={`Stage in ${board?.name || id}`} value={membership.stage} disabled={busy || detailLoading} onChange={event => void moveRecord(selected, event.target.value, undefined, board)}>{(board?.stages || [membership.stage]).map(stage => <option key={stage}>{stage}</option>)}</select></label>{board?.stageDescriptions?.[membership.stage] && <p className="field-hint">{board.stageDescriptions[membership.stage]}</p>}</div>; }) : <p className="muted">No board membership. Edit the record to add one.</p>}</section>
        <section className="detail-section"><h3>Notes</h3><p className="preserved-text">{selected.notes || "No notes recorded."}</p><form className="append-note" onSubmit={appendNote}><label>Add a note<textarea rows={3} value={note} maxLength={4000} onChange={event => setNote(event.target.value)} placeholder="Record an outcome, source or next step…"/></label><button className="quiet-button" type="submit" disabled={busy || detailLoading || !note.trim()}>{busy ? "Saving…" : "Add note"}</button></form></section>
        {(selected.relationships || selected.additionalFields?.company || selected.additionalFields?.companies || selected.additionalFields?.people) ? <section className="detail-section"><h3>Relationships</h3><pre className="preserved-json">{smallSource(selected.relationships || { company: selected.additionalFields?.company, companies: selected.additionalFields?.companies, people: selected.additionalFields?.people })}</pre></section> : null}
        {history.length > 0 ? <details className="evidence-details"><summary>Change history ({history.length} recent)</summary><pre className="preserved-json">{smallSource(history)}</pre></details> : null}
        <details className="evidence-details"><summary>Source and field evidence</summary><p className="field-hint">Historical values remain historical. Review source dates before treating them as current business activity.</p><pre className="preserved-json">{smallSource({ source: selected.source, fieldEvidence: selected.additionalFields?.fieldEvidence, reconciliation: selected.reconciliation })}</pre></details>
        <details className="evidence-details"><summary>Preserved record data</summary><pre className="preserved-json">{smallSource(selected)}</pre></details>
        <div className="detail-bottom"><span className="muted">Record {selected.id}</span><button className="quiet-button" onClick={startEditing} disabled={busy || detailLoading}>Edit record</button></div>
      </div>}
    </dialog>

    <dialog ref={boardRef} className="board-dialog" aria-labelledby="board-title" onCancel={event => { if (busy) event.preventDefault(); else setConfiguring(false); }} onClose={() => setConfiguring(false)}><header className="dialog-header"><h2 id="board-title">{configBoard.id ? "Configure board" : "Create board"}</h2><button className="icon-button" aria-label="Close board settings" disabled={busy} onClick={() => { boardRef.current?.close(); setConfiguring(false); }}><X size={20}/></button></header><form className="board-form" onSubmit={saveBoard}>{configError && <div className="inline-error" role="alert">{configError}</div>}<label>Board name<input required maxLength={100} value={configBoard.name} onChange={event => setConfigBoard({ ...configBoard, name: event.target.value })} autoFocus/></label><fieldset><legend>Stages in order</legend><p className="field-hint">Reorder existing stages or add a stage. Existing stages remain preserved.</p><ol className="stage-list">{configBoard.stages.map((stage,index) => <li key={`${stage}:${index}`}><span>{stage}</span><button type="button" className="icon-button" aria-label={`Move ${stage} up`} disabled={index === 0 || busy} onClick={() => shiftStage(index, -1)}><ArrowUp size={15}/></button><button type="button" className="icon-button" aria-label={`Move ${stage} down`} disabled={index === configBoard.stages.length - 1 || busy} onClick={() => shiftStage(index, 1)}><ArrowDown size={15}/></button></li>)}</ol><div className="add-stage"><label className="sr-only" htmlFor="stage-name">New stage name</label><input id="stage-name" value={stageName} onChange={event => setStageName(event.target.value)} placeholder="New stage name" maxLength={100}/><button type="button" className="quiet-button" disabled={!stageName.trim() || configBoard.stages.includes(stageName.trim()) || busy} onClick={() => { setConfigBoard({ ...configBoard, stages: [...configBoard.stages, stageName.trim()] }); setStageName(""); }}><Plus size={15}/>Add stage</button></div></fieldset><div className="form-actions"><button type="button" className="quiet-button" disabled={busy} onClick={() => { boardRef.current?.close(); setConfiguring(false); }}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !configBoard.name.trim() || !configBoard.stages.length}>{busy ? "Saving…" : "Save board"}</button></div></form></dialog>
  </main>;
}
