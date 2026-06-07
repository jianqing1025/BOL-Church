-- 0011: 把已开票/已入账从单一 status 字段拆成独立时间戳
-- 设计变更：审批是一个状态机（pending/approved/rejected）；
--           开票、入账是独立的「已完成/未完成」标记，用 invoiced_at / accounted_at 表示。
-- 任何历史上被设为 'invoiced' 或 'accounted' 的行，其审批状态本质都是 'approved'。
UPDATE expenses SET status = 'approved' WHERE status IN ('invoiced', 'accounted');
