use std::path::Path;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;

pub type DbPool = Pool<SqliteConnectionManager>;

/// A connection manager wrapper that applies the schema + pragmas on every
/// checkout, so any new connection (pool grows, etc.) is always ready.
#[derive(Debug)]
struct InitConnection;

impl r2d2::CustomizeConnection<Connection, rusqlite::Error> for InitConnection {
    fn on_acquire(&self, conn: &mut Connection) -> Result<(), rusqlite::Error> {
        conn.execute_batch("PRAGMA journal_mode = WAL;")?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        crate::db::schema::apply_schema(conn)?;
        Ok(())
    }
}

/// Create a pooled connection to the SQLite database at `path`. Creates the
/// file and applies the schema if it doesn't exist.
pub fn init_db(path: &Path) -> anyhow::Result<DbPool> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let manager = SqliteConnectionManager::file(path);
    let pool = Pool::builder()
        .max_size(8)
        .connection_customizer(Box::new(InitConnection))
        .build(manager)?;
    Ok(pool)
}
