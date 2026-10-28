// All browser and MCP writes use this service. A single SQLite statement and
// its triggers commit the record, replay receipt and audit together.
export type Data = Record<string, any>;
export interface Statement {
    bind(...args: any[]): Statement;
    first<T = Data>(): Promise<T | null>;
    all<T = Data>(): Promise<{
        results: T[];
    }>;
    run(): Promise<{
        meta?: {
            changes?: number;
        };
    }>;
}
export interface Database {
    prepare(sql: string): Statement;
}
export class CrmError extends Error {
    status: number;
    code: string;
    constructor(message: string, status = 422, code = 'invalid_request') { super(message); this.status = status; this.code = code; }
}
function fail(s: string, status = 422, code = 'invalid_request'): never { throw new CrmError(s, status, code); }
const plain = (x: unknown): x is Data => !!x && typeof x === 'object' && !Array.isArray(x);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export function canonical(x: any): string { if (Array.isArray(x))
    return '[' + x.map(canonical).join(',') + ']'; if (plain(x))
    return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}'; return JSON.stringify(x); }
export async function sha(x: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)))).map(b => b.toString(16).padStart(2, '0')).join(''); }
function text(x: unknown, name: string, max: number, nonempty = false): asserts x is string { if (typeof x !== 'string' || x.length > max || (nonempty && !x.trim()))
    fail('Invalid ' + name); }
function operation(x: unknown): asserts x is string { text(x, 'operationId', 200, true); if (!/^[A-Za-z0-9_.:-]+$/.test(x))
    fail('Invalid operationId'); }
function identifier(x: unknown): asserts x is string { text(x, 'identifier', 200, true); if (!/^[A-Za-z0-9_.:-]+$/.test(x))
    fail('Invalid identifier'); }
function dateOnly(x: unknown) { if (x === null)
    return; if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x) || !Number.isFinite(Date.parse(x + 'T00:00:00Z')) || new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) !== x)
    fail('Invalid due date'); }
function timestamp(x: unknown) { if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(x) || !Number.isFinite(Date.parse(x)))
    fail('Invalid communication date'); }
export function validatePatch(p: unknown): asserts p is Data {
    if (!plain(p) || !Object.keys(p).length)
        fail('Changes are required');
    const allowed = ['name', 'kind', 'website', 'fundingStages', 'industries', 'investmentRating', 'lastCommunication', 'notes', 'memberships', 'communicationType', 'replyStatus', 'replyDueAt', 'nextAction'];
    for (const k of Object.keys(p))
        if (!allowed.includes(k))
            fail('Unsupported field: ' + k);
    for (const k of ['name', 'website', 'notes', 'nextAction'])
        if (k in p)
            text(p[k], k, k === 'notes' ? 30000 : k === 'nextAction' ? 4000 : 2000, k === 'name');
    if ('kind' in p && !['company', 'person'].includes(p.kind))
        fail('Invalid kind');
    if (p.website) {
        try {
            const u = new URL(p.website);
            if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
                fail('Invalid website');
        }
        catch {
            fail('Invalid website');
        }
    }
    for (const k of ['fundingStages', 'industries'])
        if (k in p && (!Array.isArray(p[k]) || p[k].length > 50 || !p[k].every((x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= 100)))
            fail('Invalid ' + k);
    if ('investmentRating' in p && p.investmentRating !== null && (!Number.isInteger(p.investmentRating) || p.investmentRating < 1 || p.investmentRating > 5))
        fail('Invalid rating');
    if ('replyStatus' in p && ![null, 'needs_reply', 'waiting_on_them', 'done'].includes(p.replyStatus))
        fail('Invalid reply status');
    if ('communicationType' in p && ![null, 'email', 'call', 'video_call', 'meeting', 'message', 'other'].includes(p.communicationType))
        fail('Invalid communication type');
    if ('replyDueAt' in p)
        dateOnly(p.replyDueAt);
    if (p.lastCommunication !== undefined && p.lastCommunication !== null)
        timestamp(p.lastCommunication);
    if ('memberships' in p) {
        if (!plain(p.memberships))
            fail('Invalid memberships');
        for (const m of Object.values(p.memberships)) {
            if (!plain(m) || Object.keys(m).some(k => !['stage', 'order'].includes(k)) || typeof m.stage !== 'string' || typeof m.order !== 'number' || !Number.isFinite(m.order) || m.order < 0 || m.order > 1e12)
                fail('Invalid stage or order');
        }
    }
}
interface Row extends Data {
    id: string;
    type: string;
    data: string;
    revision: number;
    original: string;
    filename: string;
    source_hash: string;
}
export class CrmService {
    db: Database;
    actor: string;
    timezone: string;
    constructor(db: Database, actor: string, timezone = 'UTC') { if (!actor)
        fail('Authentication required', 401, 'unauthenticated'); this.db = db; this.actor = actor; this.timezone = timezone; }
    async row(id: string) { identifier(id); return this.db.prepare('SELECT * FROM documents WHERE id=?').bind(id).first<Row>(); }
    decode(r: Pick<Row, 'data' | 'revision'>) { return { ...JSON.parse(r.data), revision: String(r.revision) }; }
    async get(id: string) { const r = await this.row(id); if (!r || r.type !== 'record')
        fail('CRM record not found', 404, 'not_found'); return this.decode(r); }
    async boards() { const r = await this.row('boards'); return r ? { ...this.decode(r), boardsRevision: String(r.revision) } : { boards: [], boardsRevision: '0', revision: '0' }; }
    async receipt(id: string, digest: string) { const r = await this.db.prepare('SELECT * FROM operations WHERE id=?').bind(id).first(); if (!r)
        return null; if (r.digest !== digest)
        fail('Operation identifier reused for different content', 409, 'operation_reused'); return this.decode(r as Row); }
    async write(id: string, type: string, data: Data, expected: string | null, op: string, digest: string, source?: Data) {
        operation(op);
        const receipt = await this.receipt(op, digest);
        if (receipt)
            return receipt;
        if ((await this.setting('maintenance') ?? 'false') !== 'false')
            fail('CRM writes are paused for a consistent backup. Retry shortly.', 503, 'maintenance');
        const now = new Date().toISOString(), raw = JSON.stringify(data);
        if (raw.length > 800000)
            fail('Record is too large', 413);
        try {
            let result;
            if (expected === null) {
                result = await this.db.prepare('INSERT INTO documents(id,type,name,data,revision,original,filename,source_hash,operation_id,operation_digest,actor,updated_at) SELECT ?,?,?,?,1,?,?,?,?,?,?,? WHERE COALESCE((SELECT value FROM settings WHERE key=\'maintenance\'),\'false\')=\'false\'').bind(id, type, String(data.name ?? type), raw, source?.original ?? '', source?.filename ?? '', source?.sourceHash ?? '', op, digest, this.actor, now).run();
            }
            else {
                if (!/^\d+$/.test(expected))
                    fail('Invalid expected revision');
                result = await this.db.prepare('UPDATE documents SET name=?,data=?,revision=revision+1,operation_id=?,operation_digest=?,actor=?,updated_at=? WHERE id=? AND type=? AND revision=? AND COALESCE((SELECT value FROM settings WHERE key=\'maintenance\'),\'false\')=\'false\'').bind(String(data.name ?? type), raw, op, digest, this.actor, now, id, type, Number(expected)).run();
            }
            if (result.meta?.changes !== 1) {
                if ((await this.setting('maintenance') ?? 'false') !== 'false')
                    fail('CRM writes are paused for a consistent backup. Retry shortly.', 503, 'maintenance');
                fail('This record changed. Refresh and review before saving.', 409, 'revision_conflict');
            }
        }
        catch (e) {
            const replay = await this.receipt(op, digest);
            if (replay)
                return replay;
            if (e instanceof CrmError)
                throw e;
            if (String(e).includes('UNIQUE constraint failed: documents.id'))
                fail('Record already exists', 409, 'already_exists');
            throw e;
        }
        return (await this.receipt(op, digest))!;
    }
    async validateMemberships(p: Data) { if (!p.memberships)
        return; const { boards } = await this.boards(); for (const [id, m] of Object.entries(p.memberships)) {
        const b = boards.find((x: Data) => x.id === id);
        if (!b || !b.stages.includes((m as Data).stage))
            fail('Invalid board stage');
    } }
    async create(p: Data, op: string) { validatePatch(p); if (!p.name)
        fail('Name is required'); await this.validateMemberships(p); const digest = await sha(canonical({ type: 'create', p })); const replay = await this.receipt(op, digest); if (replay)
        return replay; const id = crypto.randomUUID(), now = new Date().toISOString(); const data = { schemaVersion: 1, id, kind: 'company', name: '', website: '', fundingStages: [], industries: [], investmentRating: null, lastCommunication: null, notes: '', memberships: {}, communicationType: null, replyStatus: null, replyDueAt: null, nextAction: '', source: { system: 'Company CRM', capturedAt: now }, additionalFields: {}, ...clone(p) }; this.manualEvidence(data, p); return this.write(id, 'record', data, null, op, digest); }
    manualEvidence(data: Data, p: Data) { const extra = data.additionalFields ??= {}; const fields = extra.fieldEvidence ??= {}; for (const k of Object.keys(p))
        fields[k] = { source: 'CRM user edit', basis: 'Explicit CRM edit', observedAt: new Date().toISOString(), actor: this.actor }; data.updatedAt = new Date().toISOString(); }
    async update(id: string, expected: string, op: string, p: Data) { validatePatch(p); const digest = await sha(canonical({ type: 'update', id, p })); const replay = await this.receipt(op, digest); if (replay)
        return replay; await this.validateMemberships(p); const data = clone(await this.get(id)); delete data.revision; Object.assign(data, clone(p)); this.manualEvidence(data, p); return this.write(id, 'record', data, expected, op, digest); }
    async move(id: string, rev: string, op: string, boardId: string, stage: string, order: number) { const digest = await sha(canonical({ type: 'move', id, boardId, stage, order })); const replay = await this.receipt(op, digest); if (replay)
        return replay; const r = clone(await this.get(id)); delete r.revision; const p = { memberships: { ...r.memberships, [boardId]: { stage, order } } }; validatePatch(p); await this.validateMemberships(p); Object.assign(r, p); this.manualEvidence(r, p); return this.write(id, 'record', r, rev, op, digest); }
    async appendNote(id: string, rev: string, op: string, note: string) { text(note, 'note', 10000, true); const digest = await sha(canonical({ type: 'append_note', id, note })); const replay = await this.receipt(op, digest); if (replay)
        return replay; const data = clone(await this.get(id)); delete data.revision; data.notes = (data.notes ? data.notes + '\n\n' : '') + note; if (data.notes.length > 30000)
        fail('Notes exceed 30,000 characters'); this.manualEvidence(data, { notes: data.notes }); return this.write(id, 'record', data, rev, op, digest); }
    async configureBoard(board: Data, rev: string, op: string) { const digest = await sha(canonical({ type: 'board', board })); const replay = await this.receipt(op, digest); if (replay)
        return { ...replay, boardsRevision: replay.revision }; identifier(board.id); text(board.name, 'board name', 100, true); if (!Array.isArray(board.stages) || !board.stages.length || board.stages.length > 40 || new Set(board.stages).size !== board.stages.length || !board.stages.every((s: unknown) => typeof s === 'string' && s.trim() && s.length <= 100))
        fail('Invalid stages'); const current = await this.boards(); const old = current.boards.find((b: Data) => b.id === board.id); if (old && old.stages.some((s: string) => !board.stages.includes(s)))
        fail('Existing stages cannot be removed or renamed'); const data = { schemaVersion: 1, boards: current.boards.map((b: Data) => b.id === board.id ? { ...b, ...board } : b) }; if (!old)
        data.boards.push(board); const r = await this.write('boards', 'boards', data, current.revision === '0' ? null : rev, op, digest); return { ...r, boardsRevision: r.revision }; }
    async search(args: Data = {}) { const limit = Math.min(200, Math.max(1, Number(args.limit) || 100)), offset = Number(args.cursor) || 0; if (!Number.isSafeInteger(offset) || offset < 0)
        fail('Invalid cursor'); const query = String(args.query ?? '').slice(0, 200); let where = "type='record'", bindings: any[] = []; if (query) {
        where += ' AND (instr(lower(data),lower(?))>0)';
        bindings.push(query);
    } if (args.kind) {
        where += " AND json_extract(data,'$.kind')=?";
        bindings.push(args.kind);
    } if (args.boardId) {
        where += " AND EXISTS(SELECT 1 FROM json_each(json_extract(documents.data,'$.memberships')) WHERE key=?)";
        bindings.push(args.boardId);
    } const total = await this.db.prepare('SELECT count(*) AS n FROM documents WHERE ' + where).bind(...bindings).first(); const r = await this.db.prepare('SELECT data,revision FROM documents WHERE ' + where + ' ORDER BY name COLLATE NOCASE,id LIMIT ? OFFSET ?').bind(...bindings, limit, offset).all(); return { records: r.results.map(r => this.decode(r as Row)), total: Number(total?.n ?? 0), nextCursor: offset + limit < Number(total?.n) ? String(offset + limit) : null }; }
    async state(args: Data = {}) { return { ...await this.boards(), ...await this.search(args) }; }
    async history(id: string) { await this.get(id); const r = await this.db.prepare('SELECT operation_id,actor,occurred_at,before,after FROM audit WHERE document_id=? ORDER BY id DESC LIMIT 50').bind(id).all(); return { entries: r.results.map(x => ({ ...x, before: x.before ? JSON.parse(x.before) : null, after: JSON.parse(x.after) })) }; }
    async saveView(v: Data, id: string | undefined, rev: string | undefined, op: string) { if (!plain(v))
        fail('Invalid view'); text(v.name, 'view name', 100, true); const view = { name: v.name, query: String(v.query ?? '').slice(0, 200), boardId: String(v.boardId ?? ''), kind: String(v.kind ?? ''), mode: v.mode === 'table' ? 'table' : 'board' }; const digest = await sha(canonical({ type: 'view', id: id ?? null, view })); const replay = await this.receipt(op, digest); if (replay)
        return replay; return this.write(id ?? crypto.randomUUID(), 'view', { id: id ?? null, view }, id ? String(rev ?? '') : null, op, digest); }
    async views() { const r = await this.db.prepare("SELECT id,data,revision FROM documents WHERE type='view' ORDER BY name,id LIMIT 100").all(); return { views: r.results.map(r => ({ ...this.decode(r as Row), id: r.id })) }; }
    async exportPage(cursor = '0') { const offset = Number(cursor); if (!Number.isSafeInteger(offset) || offset < 0)
        fail('Invalid cursor'); const r = await this.db.prepare('SELECT * FROM documents ORDER BY id LIMIT 100 OFFSET ?').bind(offset).all<Row>(); return { documents: r.results.map(r => ({ id: r.id, type: r.type, data: JSON.parse(r.data), revision: String(r.revision), original: r.original, filename: r.filename, sourceHash: r.source_hash })), nextCursor: r.results.length === 100 ? String(offset + 100) : null }; }
    async setMaintenance(enabled: boolean, token?: string, force = false) {
        if (typeof enabled !== 'boolean')
            fail('Invalid maintenance flag');
        if (enabled) {
            const backupToken = crypto.randomUUID();
            operation(backupToken);
            const result = await this.db.prepare("INSERT INTO settings(key,value) VALUES('maintenance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE settings.value='false'").bind(backupToken).run();
            if (result.meta?.changes !== 1)
                fail('Another backup is already running', 409);
            return { writesPaused: true, backupToken };
        }
        const current = await this.setting('maintenance');
        if (current === null || current === 'false')
            return { writesPaused: false };
        if (!force && current !== token)
            fail('Backup token does not own the write freeze', 409);
        await this.db.prepare("UPDATE settings SET value='false' WHERE key='maintenance' AND value=?").bind(current).run();
        return { writesPaused: false };
    }
    async snapshotPage(cursor = '0', token?: string) {
        if (!token || await this.setting('maintenance') !== token)
            fail('A matching backup token is required', 409);
        const offset = Number(cursor);
        if (!Number.isSafeInteger(offset) || offset < 0)
            fail('Invalid cursor');
        const tables: Record<string, Data[]> = {};
        let more = false;
        for (const table of ['documents', 'operations', 'audit', 'settings']) {
            const page = await this.db.prepare('SELECT * FROM ' + table + ' ORDER BY ' + (table === 'settings' ? 'key' : 'id') + ' LIMIT 100 OFFSET ?').bind(offset).all();
            tables[table] = page.results;
            if (page.results.length === 100)
                more = true;
        }
        if (await this.setting('maintenance') !== token)
            fail('Backup was interrupted; discard this capture and retry', 409);
        return { schemaVersion: 1, tables, nextCursor: more ? String(offset + 100) : null };
    }
    async setting(key: string) { return (await this.db.prepare('SELECT value FROM settings WHERE key=?').bind(key).first())?.value ?? null; }
    async lockMigration() { await this.db.prepare("INSERT INTO settings(key,value) VALUES('migration_locked','true') ON CONFLICT(key) DO UPDATE SET value='true'").run(); return { migrationLocked: true }; }
    async status() { const r = await this.db.prepare('SELECT type,count(*) AS count FROM documents GROUP BY type').all(); return { service: 'Company CRM', schemaVersion: 1, storage: 'SQLite', counts: r.results, migrationLocked: await this.setting('migration_locked') === 'true', writesPaused:(await this.setting('maintenance')??'false')!=='false', timezone: this.timezone }; }
}
