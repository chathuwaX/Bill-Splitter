import sqlite3
conn = sqlite3.connect(r"c:\Users\ASUS\Downloads\friendbill_2\backend\friendbill.db")
c = conn.cursor()
with open("db_out.txt", "w", encoding="utf-8") as f:
    c.execute("SELECT * FROM debts ORDER BY id DESC LIMIT 5")
    f.write("DEBTS:\n")
    for row in c.fetchall():
        f.write(str(row) + "\n")
    
    c.execute("SELECT * FROM bill_participants ORDER BY id DESC LIMIT 5")
    f.write("\nBILL PARTICIPANTS:\n")
    for row in c.fetchall():
        f.write(str(row) + "\n")
