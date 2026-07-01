-- 0008: 相薄访问密码(软门)
-- 给 photo_settings 增加 access_password 列,并把现有行 seed 为 110550。
-- 空字符串 = 关闭密码门;管理员可在后台相薄设置中修改。
ALTER TABLE photo_settings ADD COLUMN access_password TEXT NOT NULL DEFAULT '110550';
