import sqlite3

def update_user_balance(user_id, new_balance):
    # 데이터베이스 연결
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()

    # 사용자 ID가 데이터베이스에 있는지 확인
    cursor.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
    user = cursor.fetchone()

    if user:
        # 사용자 ID가 존재하면 잔액 업데이트
        cursor.execute('UPDATE users SET balance = ? WHERE user_id = ?', (new_balance, user_id))
    else:
        # 사용자 ID가 존재하지 않으면 새 레코드 삽입
        cursor.execute('INSERT INTO users (user_id, balance) VALUES (?, ?)', (user_id, new_balance))

    # 변경사항 저장
    conn.commit()

    # 연결 종료
    conn.close()

    print(f"User {user_id} balance updated to {new_balance}.")

# 예시 사용법
user_id = 1263840246332915815
new_balance = 10000

update_user_balance(user_id, new_balance)
