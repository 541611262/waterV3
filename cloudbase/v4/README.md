# V4 数据库（PostgreSQL）

V4 把 V3 的"一个客户一整块 JSON"（`customers.data`）拆成关系型表。两套表**并存**：V4 的客户表叫 `clients`，V3 的 `customers` 表原样保留、只读不改，迁移和试用期间旧版照常使用，随时可以回退。

## 文件

| 文件 | 内容 |
|---|---|
| `../schema.sql` | V3 原有的表（成员、V3 客户、AI 次数），V4 依赖其中的 `members` 和 `is_admin()` |
| `001_schema.sql` | V4 业务表、触发器（版本号 / 操作日志 / client_id 自动填写）、行级权限 |
| `002_views.sql` | 查询视图：到期计算、欠款计算的唯一口径 |
| `003_migrate_from_v3.sql` | 从 V3 迁移、迁移核对报告 |
| `004_backup.sql` | 每日快照（pg_cron）、按客户恢复 |
| `tests/rls_test.sql` | 权限与规则自动测试（事务内执行后回滚） |
| `tests/backup_drill.sql` | 备份恢复演练（事务内执行后回滚） |

全部脚本都可以重复执行。按顺序执行：`schema.sql` → `001` → `002` → `003` → `004`。

```bash
tcb db execute -e <环境ID> --sql "$(cat cloudbase/v4/001_schema.sql)"
```

> 命令行一次最多传约 3 万字符；超过时分批执行，或在控制台的 SQL 窗口里粘贴执行。

## 表

| 表 | 内容 |
|---|---|
| `clients` | 客户：名称、省份、区域、长期合作、负责人 `owner_id` |
| `devices` | 装机记录：地址、联系人、电话、装机时间、型号、数量、安装位置、滤芯购买日期、周期、验水 |
| `filter_stages` | 滤芯分级：每台设备每一级滤芯各自的周期（可选，没有分级时按设备周期） |
| `replacements` | 换芯记录，`stage_id` 为空表示整机更换 |
| `follow_ups` | 跟踪记录 |
| `work_orders` | 工单：类型、状态、指派人、预约日期、处理结果；编号 `order_no` 从 1001 起 |
| `receivables` / `payments` | 应收款 / 每次收款；`amount` 为空表示"有欠款但金额未登记" |
| `audit_log` | 操作日志：谁、什么时间、改了哪些字段（旧值 → 新值） |
| `app_settings` | 系统设置：默认换芯周期、默认催款周期 |

所有业务表都有：

- `created_at / created_by / updated_at / updated_by`：由触发器维护，网页端无法伪造
- `version`：每次修改 +1。网页端更新时带上 `.eq('version', 原值)`，返回 0 行就说明别人刚改过（并发冲突），要提示刷新
- `deleted_at`：软删除（回收站）。普通成员只能软删除，彻底删除只有管理员能做
- `legacy_id`：迁移自 V3 的记录对应的旧 ID，便于核对

## 权限

| 角色 | 能看到 | 能修改 |
|---|---|---|
| 管理员 | 全部 | 全部，包括彻底删除、转移客户、改系统设置 |
| 客户负责人 | 自己负责的客户的全部数据 | 同左（不能把客户转给别人） |
| 工单被指派人 | 被派单客户的资料、设备、记录 | 登记换芯 / 跟踪 / 收款；更新自己工单的状态和结果（不能改标题、指派人，不能取消） |
| 未登录 | 无 | 无 |

工单取消后，被指派人随即失去该客户的访问权。

## 到期规则（`002_views.sql`）

- **上次服务日** = 装机日期、滤芯购买日期、换芯记录中最晚的一个
- **没有分级**：下次换芯 = 上次服务日 + 设备周期（没填用系统默认，初始 90 天）
- **有分级**：每一级单独计算（整机更换会让所有级重新计时），设备取最早到期的一级
- **催款**：从最近一次跟踪、收款、开单日、设备上次服务日中最晚的一个起，每隔 N 天（没填用默认 30 天）；收满或手动结清后不再提醒

"今天"一律按北京时间（`v4_today()`）。

## 迁移

```sql
SELECT public.v4_migrate_from_v3();            -- 增量：只迁移还没迁移过的客户
SELECT * FROM public.v4_migration_report();    -- 13 项核对，ok 必须全部为 true
SELECT * FROM public.v4_migration_anomalies(); -- V3 中无法识别、已按空值处理的字段
SELECT public.v4_migrate_from_v3(true);        -- 清掉迁移数据后重来（V4 中已有新操作时会拒绝）
```

核对内容：各类记录数量、换芯费用合计、每条记录的每个字段、按 V3 规则计算的下次换芯日期和下次催款日期。

测试环境的演练结果（用 5 个示例表格经 V3 导入生成的数据，外加故意构造的脏数据）：

- 13 项核对全部通过
- 另外用 V3 程序自己计算的到期日期逐台比对：43 台设备完全一致
- 唯一不同的 1 台是故意构造的脏数据：催款周期填的是 "abc"，V3 自己也算不出日期（得到 NaN），V4 按默认 30 天处理

## 备份

1. **平台备份**：云开发 PostgreSQL 自带自动备份，可在控制台按时间点恢复到一个新数据库（不覆盖当前数据），适合整库事故。
2. **每日快照**：每天北京时间 03:00 把所有业务表复制到 `backup` 模式。自动快照保留 30 天，手动快照保留 180 天。网页端完全无权访问。

```sql
SELECT backup.take_snapshot('上线前');          -- 手动快照
SELECT * FROM backup.list_snapshots();
SELECT * FROM backup.find_client('关键字');     -- 在快照中查找客户（包括已被彻底删除的）
SELECT backup.restore_client(<快照编号>, '<客户id>');  -- 恢复该客户到快照时的状态；快照之后新增的记录保留
```

恢复演练（`tests/backup_drill.sql`）：彻底删除记录最多的客户，再从快照恢复，逐字段比对，并确认没有影响其他客户。测试环境已通过。

## 测试

```bash
tcb db execute -e <测试环境ID> --sql "$(cat cloudbase/v4/tests/rls_test.sql)"      # 结果应为 ALL PASSED
tcb db execute -e <测试环境ID> --sql "$(cat cloudbase/v4/tests/backup_drill.sql)"  # 结果应为 DRILL PASSED
```

这两个测试用 `SET LOCAL ROLE authenticated` 加伪造的登录身份来模拟不同账号，权限判断和网页端的真实请求完全一样，结束时 ROLLBACK。**只在测试环境执行。**
