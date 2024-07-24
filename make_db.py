import sqlite3

def init_db():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            balance INTEGER
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS charge_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            amount INTEGER,
            timestamp TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS purchase_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            product_name TEXT,
            product_price INTEGER,
            timestamp TEXT
        )
    ''')
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
