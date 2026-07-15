-- รันด้วยสิทธิ์ superuser เช่น:
--   psql -U postgres -f database/setup/create_database.sql
--
-- สร้างฐานข้อมูล pimpk สำหรับโปรเจกต์นี้
CREATE DATABASE pimpk;

-- ถ้าต้องการสร้าง user แยกสำหรับแอปนี้ (แนะนำสำหรับ production) ให้เอาคอมเมนต์ด้านล่างออก
-- และแก้ 'change_me' เป็นรหัสผ่านที่ต้องการ แล้วอัปเดต DB_USERNAME/DB_PASSWORD ใน .env ให้ตรงกัน
--
-- CREATE USER pimpk_user WITH PASSWORD 'change_me';
-- GRANT ALL PRIVILEGES ON DATABASE pimpk TO pimpk_user;
