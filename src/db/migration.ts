import Dexie from 'dexie';

/**
 * 清除旧的数据库（如果存在索引冲突?
 */
export async function clearOldDatabase(): Promise<void> {
  try {
    // 尝试删除旧数据库
    await Dexie.delete('HTTPulseDB');
    console.log('Old database cleared successfully');
  } catch (err) {
    console.warn('Failed to clear old database:', err);
  }
}

/**
 * 检查并处理数据库版本冲?
 */
export async function handleDatabaseMigration(): Promise<void> {
  try {
    // 检查是否存在旧数据?
    const databases = await Dexie.getDatabaseNames();
    
    if (databases.includes('HTTPulseDB')) {
      console.log('Found existing HTTPulseDB, checking for conflicts...');
      
      // 如果遇到索引冲突，清除数据库
      // 用户可以通过浏览器控制台手动调用 clearOldDatabase()
    }
  } catch (err) {
    console.warn('Database migration check failed:', err);
  }
}


