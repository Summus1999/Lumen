use std::path::Path;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;

pub type DbPool = Pool<SqliteConnectionManager>;

/// 连接管理器包装，在每次取出连接时都会应用 schema + pragmas，
/// 因此任何新连接（连接池扩容等）都始终可用。
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

/// 创建到指定路径 SQLite 数据库的连接池。如果文件不存在则创建并应用 schema。
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
