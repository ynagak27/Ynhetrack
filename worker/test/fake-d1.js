// Minimal in-memory stand-in for Cloudflare D1, built on Node's built-in node:sqlite.
// Supports the subset the Worker uses: prepare().bind().all()/run()/first() and batch().

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params);
  }
  _exec() {
    const stmt = this.db.prepare(this.sql);
    if (/^\s*(SELECT|WITH)/i.test(this.sql)) {
      return { results: stmt.all(...this.params).map((r) => ({ ...r })), success: true, meta: { changes: 0 } };
    }
    const info = stmt.run(...this.params);
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  }
  async all() {
    return this._exec();
  }
  async run() {
    return this._exec();
  }
  async first() {
    return this._exec().results[0] ?? null;
  }
}

export function createFakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => s._exec());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
