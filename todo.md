# TODO

## 背景与当前真实状态

当前仓库处于“模块已抽离、App 集成回退”的中间状态：

- 已存在并可构建的模块：
  - `frontend/src/features/panel-orchestration/types.ts`
  - `frontend/src/features/panel-orchestration/panelController.ts`
  - `frontend/src/features/panel-orchestration/leftLane.ts`
  - `frontend/src/features/panel-orchestration/engine.ts`
- `frontend/src/App.tsx` 在之前尝试大块替换时被截断过，随后已经通过 git 恢复到仓库基线版本
- 因此，当前运行时仍主要依赖 `App.tsx` 内的旧版 lower separator 逻辑
- `README.md` 中关于 lower separator phase 重构的很多完成项，已经领先于当前实际代码状态
- `docs/CASCADE_DRAG_TASKS.md` 中的部分完成标记，也与当前真实集成状态不完全一致

这意味着：

1. 模块层工作并没有白做，代码文件还在
2. 但最关键的运行时接线没有保住
3. 所以下面所有 TODO 都必须以“重新、安全、小步集成 `App.tsx`”为核心

---

## 一、P0：必须优先完成的主线任务

### 1. 重新将 panel orchestration 模块接回 `frontend/src/App.tsx`

#### 目标
让 `App.tsx` 真正使用以下模块，而不是继续完全依赖旧的 lower separator 内联逻辑：

- `./features/panel-orchestration/types`
- `./features/panel-orchestration/engine`
- `./features/panel-orchestration/panelController`
- `./features/panel-orchestration/leftLane`

#### 当前状态
- 模块文件已存在
- 之前曾短暂接入过 `App.tsx`
- 但因 `App.tsx` 被恢复，所有接线已丢失

#### 未完成项
- [ ] 在 `App.tsx` 中重新加入必要 imports
- [ ] 重新梳理每个模块实际要承担的职责，避免再次在 `App.tsx` 内复制逻辑
- [ ] 确保接线方式是“小步替换”，避免一次性替换大函数导致文件损坏

#### 验收标准
- [ ] `App.tsx` 中已能看到对 orchestration 模块的实际引用
- [ ] 构建通过
- [ ] 没有新增未使用 import 或明显死代码

---

### 2. 重新接回 lower drag 真相源状态

#### 目标
让 lower separator 的状态不再由多个旧布尔 ref 拼出来，而是逐步迁移为：

- `lowerDragStateRef`
- `leftLowerDragContextRef`

#### 当前状态
- 对应类型与状态结构已经在模块层具备
- `App.tsx` 中恢复后，这两个 ref 并不存在于当前运行时主逻辑里

#### 未完成项
- [ ] 在 `App.tsx` 中重新加入 `lowerDragStateRef`
- [ ] 在 `App.tsx` 中重新加入 `leftLowerDragContextRef`
- [ ] 让它们在 pointer down / move / up 生命周期中被持续读写
- [ ] 明确哪些旧 ref 只是 compat mirror，哪些还临时保留为辅助采样

#### 验收标准
- [ ] lower drag 生命周期中，能通过这两个 ref 推断当前阶段
- [ ] 不必再依赖多个布尔 ref 猜测系统状态

---

### 3. 在 `App.tsx` 中恢复 engine 包装层函数

#### 目标
不要让 `App.tsx` 直接散落大量 phase 迁移与重置逻辑，而是通过 App 层包装函数调用 `engine.ts`

#### 需要恢复的包装层函数
- [ ] `transitionLowerDragPhase(...)`
- [ ] `resetLowerDragState()`
- [ ] `beginLowerSeparatorDrag()`
- [ ] `syncLowerDragCompatRefsFromState()`
- [ ] `finalizeLowerSeparatorDrag()`
- [ ] `maybeEnterSendLockedPhase(...)`
- [ ] `maybeEnterCascadeActivePhase(...)`
- [ ] `maybeEnterCascadeReleasingPhase(...)`
- [ ] `maybeReleaseCascadeToFreeDrag(...)`
- [ ] `isLowerCascadePhase()`

#### 当前状态
- 这些包装函数曾经在某次集成中存在过
- 当前因为 `App.tsx` 恢复，已经全部丢失

#### 未完成项
- [ ] 重新设计每个包装函数与 refs / React state / debug log 的交互方式
- [ ] 确保包装层本身很薄，只负责 bridge，不重复 engine 内的纯逻辑
- [ ] 确保 compat ref 同步只在必要地方发生

#### 验收标准
- [ ] `App.tsx` 中 phase 相关的状态迁移不再散落到多个匿名分支中
- [ ] 关键迁移具备统一日志入口

---

### 4. 将 lower separator drag start 重新接入 `beginLowerSeparatorDrag()`

#### 目标
在 lower separator 拖拽开始时，统一记录拖拽初始快照与 phase 起点

#### 需要记录的内容
- [ ] `sendCollapsedAtStart`
- [ ] `connectionCollapsedAtStart`
- [ ] `connectionSizeAtStart`
- [ ] `connectionPixelsAtStart`
- [ ] `lockedResponseSize = null`
- [ ] phase 初始进入 `dragging_free`

#### 当前状态
- `engine.ts` 已有 `beginLowerSeparatorDrag(...)`
- `App.tsx` 当前仍是旧 drag start 路径

#### 未完成项
- [ ] 找到当前 lower separator pointer down 入口
- [ ] 将其小步改接到新的 begin helper
- [ ] 补充 start log

#### 验收标准
- [ ] 每次拖拽开始都进入 `dragging_free`
- [ ] 每次拖拽开始都能得到干净的 start snapshot

---

### 5. 将 lower separator drag end / cleanup 重新接入统一 finalize + reset

#### 目标
把 pointer up、拖拽结束、异常中断、toggle 打断等收口逻辑统一起来

#### 需要接入
- [ ] `finalizeLowerSeparatorDrag(...)`
- [ ] `resetLowerDragState(...)`

#### 当前状态
- `engine.ts` 已有 finalize/reset 纯逻辑
- `App.tsx` 仍是旧版 cleanup 分支

#### 未完成项
- [ ] 在 pointer up 处理路径中接入 finalize 逻辑
- [ ] 在 finalize 后统一调用 reset
- [ ] 对“connection 是否在 pointer up 时物理折叠”做收尾判定
- [ ] 对 toggle / collapse button / drag cancel 路径复用统一 reset

#### 验收标准
- [ ] pointer up 后 phase 必定回到 `idle`
- [ ] 不残留 lock / cascade / pending 状态
- [ ] 下一轮拖拽从干净状态开始

---

### 6. 重新把 `onPointerMove` 改成 orchestrator 主入口

#### 目标
真正让 lower separator 拖拽在 pointer move 时由 WaveCat 主动编排，而不是主要依赖面板库或 `onResize` 的被动反馈

#### 需要完成的工作
- [ ] 在 move 时读取 left lane snapshot
- [ ] 用 `leftLane.ts` 的 upward/downward plan 计算目标
- [ ] 用 `engine.ts` 管理 phase 迁移
- [ ] 主动写回 send / connection / response 尺寸
- [ ] 控制 response lock / restore point / cascade releasing

#### 当前状态
- 这一步曾多次尝试
- 也是 `App.tsx` 截断事故的高风险区域
- 目前完全未稳定落地

#### 风险提示
- `onPointerMove` 体积大、分支多、极易因大块替换导致文件损坏
- 必须按极小 patch 逐段完成

#### 验收标准
- [ ] pointer move 成为主决策入口
- [ ] 级联行为不再主要依赖旧 `onResize` 推动
- [ ] 拖拽时没有明显跳变或鬼畜

---

### 7. 降级 `handleSendPanelResize` / `handleResponsePanelResize` 为同步层

#### 目标
从“onResize 主导交互”迁移到“pointer move 主导交互，onResize 只做同步”

#### 当前状态
- `App.tsx` 恢复后，这两个函数仍然承担较重的交互语义
- Phase 5 实际上还没真完成

#### 未完成项
- [ ] 重新审查 `handleSendPanelResize`
- [ ] 重新审查 `handleResponsePanelResize`
- [ ] 清理其中不该由 onResize 驱动的 cascade / lock / release 主逻辑
- [ ] 保留仅必要的 state 同步、collapsed 状态同步、lastExpandedSize 维护、debug 日志

#### 验收标准
- [ ] `onResize` 不再承担主流程决策
- [ ] pointer move 才是 lower separator 交互主入口

---

## 二、P1：旧 ref 清退与 phase 真相源迁移

### 8. 将旧布尔 ref 从主决策中退场

#### 目标
不再依赖多个布尔 ref 组合判断当前拖拽阶段，而是优先基于：

- `lowerDragStateRef.current.phase`

#### 当前仍需要重点替换的旧 ref
- [ ] `lowerSeparatorAllowConnectionCascadeRef`
- [ ] `lowerSeparatorCascadeTriggeredRef`
- [ ] `lowerSeparatorLockAfterSendCollapsedRef`
- [ ] `lowerSeparatorPendingConnectionExpandRef`（如果恢复后的 `App.tsx` 仍存在其主流程用途）

#### 未完成项
- [ ] 搜索这些 ref 在 `App.tsx` 中的全部使用点
- [ ] 标记哪些是“主判断”，哪些是“迁移兼容镜像”
- [ ] 逐个把主判断切到 phase-based 判断

#### 验收标准
- [ ] 阅读主逻辑时，不再需要靠多个布尔 ref 猜状态
- [ ] phase 成为真实语义入口

---

### 9. 清退 `lowerSeparatorPendingConnectionExpandRef` 及危险 auto-expand 语义

#### 目标
彻底移除“达到 restore point 后自动展开多个 panel”的高风险行为

#### 当前状态
- README 中写这部分很多已完成
- 但由于 `App.tsx` 已回退，代码现实需要重新核对

#### 未完成项
- [ ] 确认恢复后的 `App.tsx` 是否仍存在 `lowerSeparatorPendingConnectionExpandRef`
- [ ] 若仍存在，移除其驱动逻辑
- [ ] 删除 restore point 处自动 `expand()` send / connection 的分支
- [ ] 保持“释放级联后回到自由拖拽，由用户继续拖动自然展开”原则

#### 验收标准
- [ ] 到 restore point 时不再突然自动弹开 panel
- [ ] 不再出现临界点鬼畜跳变

---

### 10. 清退第二批、第三批旧 ref

#### 第二批
- [ ] `lowerSeparatorAllowConnectionCascadeRef`

#### 第三批
- [ ] `lowerSeparatorCascadeTriggeredRef`
- [ ] `lowerSeparatorLockAfterSendCollapsedRef`

#### 未完成项
- [ ] 在 phase 逻辑完全稳定后再删除这些 ref
- [ ] 删除时同步清理相关分支、注释、日志
- [ ] 确认删除后构建仍通过

#### 验收标准
- [ ] 主流程中不再出现这些旧 ref
- [ ] 删除后逻辑依然完整可读

---

### 11. 只保留真正必要的辅助 ref

#### 可能可保留的内容
- [ ] pointer 速度 / 时间 / last Y 采样 ref
- [ ] 某些 start snapshot ref（若尚有必要）
- [ ] 某些 collapsed 物理状态辅助缓存

#### 未完成项
- [ ] 区分“语义状态 ref”和“采样缓存 ref”
- [ ] 删除那些已经能由新状态机表达的冗余 ref
- [ ] 保留的 ref 要有明确用途说明

#### 验收标准
- [ ] `App.tsx` 内 lower separator refs 数量显著下降
- [ ] 留下的 ref 都能解释“为什么还需要它”

---

## 三、P1：模块职责真正落地

### 12. 让 `panelController.ts` 真正成为统一 panel 读写入口

#### 目标
避免在 `App.tsx` 中到处散落：
- `panelRef.current?.getSize()`
- `panelRef.current?.resize(...)`
- `collapse()` / `expand()`

#### 当前状态
- `panelController.ts` 文件存在
- 但未稳定接入当前 `App.tsx`

#### 未完成项
- [ ] 在 `App.tsx` 中创建 left lane controller
- [ ] 把 panel 尺寸读取迁移到 controller
- [ ] 把 resize / collapse / expand 调用迁移到 controller
- [ ] 让 snapshot 生成统一走 controller

#### 验收标准
- [ ] `App.tsx` 中直写 panel API 的地方显著减少
- [ ] left lane 相关 panel 操作更集中、更一致

---

### 13. 让 `leftLane.ts` 真正成为 upward/downward planner

#### 目标
将“怎么消费 delta、怎么决定 send/connection/response 的变化”交给 `leftLane.ts`

#### 当前状态
- `leftLane.ts` 已实现核心 planning 函数
- 但运行时尚未真正接入

#### 未完成项
- [ ] `onPointerMove` 上拖分支接入 `planLeftLowerSeparatorUpwardDrag(...)`
- [ ] `onPointerMove` 下拖分支接入 `planLeftLowerSeparatorDownwardDrag(...)`
- [ ] 对 planner 输出做统一应用
- [ ] 保留必要 debug 信息帮助核对 planner 行为

#### 验收标准
- [ ] 上拖 / 下拖的主要决策来自 planner，而非散落 if/else

---

### 14. 让 `engine.ts` 真正成为 phase 迁移与收尾入口

#### 目标
把 phase 切换和最终收尾统一收束到 `engine.ts`

#### 当前状态
- `engine.ts` 已包含：
  - `beginLowerSeparatorDrag(...)`
  - `maybeEnterSendLockedPhase(...)`
  - `maybeEnterCascadeActivePhase(...)`
  - `maybeEnterCascadeReleasingPhase(...)`
  - `maybeReleaseCascadeToFreeDrag(...)`
  - `isLowerCascadePhase(...)`
  - `finalizeLowerSeparatorDrag(...)`
  - `resetLowerDragState(...)`
- 但运行时尚未真正以其为主

#### 未完成项
- [ ] 在 `App.tsx` 内统一通过 engine wrapper 调用这些函数
- [ ] 不再在 `App.tsx` 中重复散写 phase 逻辑
- [ ] 让 compat snapshot 只作为迁移辅助，而不是长期主流程依赖

#### 验收标准
- [ ] phase 迁移路径集中可读
- [ ] reset/finalize 不再散落多处

---

## 四、P1：行为级验收与手测

### 15. 基础拖拽生命周期验证

#### 目标
验证最基础的 phase 生命周期和 reset 质量

#### 未完成项
- [ ] 验证 `idle -> dragging_free -> idle`
- [ ] 验证 pointer up 后无残留 lock / pending / cascade
- [ ] 验证下一轮拖拽能从干净状态重新开始

#### 验收标准
- [ ] 不存在“已经松手却仍卡在某 phase”的情况

---

### 16. Case 1：send 初始展开，connection 初始展开

#### 未完成项
- [ ] 上拖 response separator
- [ ] send 先折叠
- [ ] 继续明显上拖后 connection 才进入 cascade
- [ ] 下拖时 response 先恢复
- [ ] 到 restore point 后回到自由拖拽

#### 重点观察
- [ ] send 未折叠前不会直接 cascade connection
- [ ] 没有明显跳变

---

### 17. Case 2：send 初始折叠，connection 初始展开

#### 未完成项
- [ ] 上拖时 send 保持折叠
- [ ] response 正常调整
- [ ] connection 可继续被顶缩 / 折叠
- [ ] 下拖时不会错误自动展开 send

---

### 18. Case 3：send 初始展开，connection 初始折叠

#### 未完成项
- [ ] 先折叠 send
- [ ] 再触发 cascade 时不会错误重复处理 connection 初始已折叠状态
- [ ] 下拖时不会因 connection 初始折叠而产生异常跳变

#### 重点观察
- [ ] 不会把“connection 本来就折叠”误当成“本轮拖拽新触发的折叠”
- [ ] restore / release 逻辑仍然稳定

---

### 19. Case 4：send 初始折叠，connection 初始折叠

#### 未完成项
- [ ] 上拖时保持两个 panel 的初始折叠语义稳定
- [ ] response 仍可被正确拖拽调整
- [ ] 下拖释放 cascade 时不应立即自动展开两个 panel

#### 重点观察
- [ ] 不出现自动展开 send / connection
- [ ] 不出现 phase 混乱跳转

---

### 20. Case 5：快速上下来回抖动拖拽

#### 未完成项
- [ ] 高频率上下拖动测试
- [ ] 验证 phase 不会卡死
- [ ] 验证 panel 不会持续闪动
- [ ] 验证 React state 与 panel 实例状态不会失配

#### 重点观察
- [ ] 没有异常 stuck 状态
- [ ] 没有快速触发 collapse/expand 导致的抖动

---

### 21. Case 6：拖拽中松手，再立刻开始下一轮拖拽

#### 未完成项
- [ ] 在 `dragging_free` 阶段松手测试
- [ ] 在 `send_locked` 阶段松手测试
- [ ] 在 `cascade_active` 阶段松手测试
- [ ] 在 `cascade_releasing` 阶段松手测试
- [ ] 松手后立刻开始下一轮拖拽测试

#### 重点观察
- [ ] 能看到完整 reset
- [ ] 新一轮拖拽从 `idle -> dragging_free` 正常开始
- [ ] 不携带上一轮残留锁定状态

---

### 22. Case 7：窗口 resize 后再拖拽

#### 未完成项
- [ ] 改变窗口尺寸后重新开始 lower separator 拖拽
- [ ] 验证 restore point 判定不失真
- [ ] 验证不会因比例变化误触发 release / lock

#### 重点观察
- [ ] response locked size 判定依然合理
- [ ] connection / send 的恢复顺序不被窗口变化打乱

---

### 23. 验证首次打开应用后的第一轮拖拽

#### 未完成项
- [ ] 重启应用后直接进行第一轮 lower separator 拖拽
- [ ] 验证初始 snapshot 与实际 panel 状态一致
- [ ] 验证不会出现“首轮拖拽特殊异常”

#### 重点观察
- [ ] 首轮拖拽不会特别异常
- [ ] 初始化校准正常生效

---

## 五、P1：文档与真实代码状态同步

### 24. 修正 `README.md`，让其与当前实际实现一致

#### 目标
避免 README 继续描述一个“模块已完成且已接入运行时”的超前状态

#### 当前状态
- README 中大量 lower separator phase 重构项被标记为已完成
- 但当前真实情况是：模块存在，`App.tsx` 集成未保住

#### 未完成项
- [ ] 逐段审查 README 中的完成标记
- [ ] 区分“模块已实现”与“App 已完成集成”
- [ ] 修正文档中对当前进度的表述
- [ ] 明确标出 `App.tsx` 仍待重新接线

#### 验收标准
- [ ] README 描述与实际仓库状态一致
- [ ] 不再给人“已经全部接完”的错觉

---

### 25. 修正 `docs/CASCADE_DRAG_TASKS.md` 任务状态

#### 目标
让任务文档反映真实阶段，而不是只反映“模块代码曾经被写过”

#### 当前状态
- 文档中多个阶段已被标成 `[x]`
- 但真实集成、行为验收、回归测试并未全部完成

#### 未完成项
- [ ] 按“模块实现 / App 集成 / 行为验证”三类重新核对进度
- [ ] 回调不准确的 `[x]`
- [ ] 给尚未完成的部分明确剩余动作

#### 验收标准
- [ ] 文档能真实指导后续开发，而不是误导当前状态

---

### 26. 区分三类完成状态：模块完成 / 集成完成 / 验收完成

#### 目标
防止后续再次出现“模块写完了，所以文档提前勾掉”的偏差

#### 未完成项
- [ ] 在 README 或 tasks 文档中明确三层定义：
  - [ ] 模块完成
  - [ ] App 集成完成
  - [ ] 行为验收完成
- [ ] 以后更新 checklist 时按三层状态打勾

#### 验收标准
- [ ] 团队阅读文档时能明确知道“写出来”和“真跑起来”不是一回事

---

## 六、P2：代码质量与结构收尾

### 27. 降低 `frontend/src/App.tsx` 的复杂度

#### 目标
让 `App.tsx` 不再继续堆积大量 lower separator 级联细节

#### 未完成项
- [ ] 把 lower separator 相关逻辑按职责分区整理
- [ ] 避免在 `App.tsx` 中继续增加超长函数
- [ ] 把能通过 helper / controller / planner 表达的内容移出主文件

#### 验收标准
- [ ] lower separator 主流程在 `App.tsx` 中变得更短、更可读

---

### 28. 为关键 phase 迁移补齐统一 debug 日志

#### 目标
让调试信息足够清晰，帮助定位 phase 迁移与拖拽异常

#### 建议日志点
- [ ] drag start
- [ ] phase transition
- [ ] send collapse lock 建立
- [ ] cascade 触发
- [ ] cascade releasing 进入
- [ ] release 到 free drag
- [ ] pointer up finalize
- [ ] reset

#### 建议前缀
- [ ] `[lower-drag-start]`
- [ ] `[lower-drag-phase]`
- [ ] `[lower-drag-finalize]`
- [ ] `[lower-drag-reset]`

#### 验收标准
- [ ] 拖一轮就能在日志里看清主要生命周期

---

### 29. 清理注释与实现不一致的问题

#### 目标
避免代码中的注释还停留在旧逻辑语义上

#### 未完成项
- [ ] 清理 `App.tsx` 中过时注释
- [ ] 清理 lower separator 相关注释中的旧 ref 语义
- [ ] 确保模块注释与实际运行逻辑一致

#### 验收标准
- [ ] 注释不再误导维护者

---

### 30. 统一命名风格

#### 目标
降低阅读成本，避免 phase / drag helper / planner 命名混乱

#### 未完成项
- [ ] 统一 `begin... / maybeEnter... / maybeRelease... / finalize... / reset...` 命名风格
- [ ] 统一 phase 常量与日志用词
- [ ] 统一“lower drag / lower separator drag / left lower drag context”等术语

#### 验收标准
- [ ] 阅读代码时能快速看懂函数职责

---

## 七、P2：构建与回归安全线

### 31. 每个小步集成后都执行构建验证

#### 目标
避免再次发生大范围改完后才发现 `App.tsx` 被破坏

#### 未完成项
- [ ] 每次完成一个小 patch 后执行 `cd frontend && npm run build`
- [ ] 如 build 失败，先定位并恢复到最近安全状态，再继续下一小步
- [ ] 不在未构建验证前继续叠加大改动

#### 验收标准
- [ ] 任一阶段都能回到最近一次 build 通过的安全点

---

### 32. 避免再次对 `App.tsx` 做高风险大块替换

#### 目标
吸取前面文件截断的教训

#### 未完成项
- [ ] 不对 `onPointerMove` 做整段大替换
- [ ] 优先用小范围、单职责 patch
- [ ] 每次改动前先重新读取目标片段上下文
- [ ] 替换后立即检查文件尾部与关键函数闭合结构

#### 验收标准
- [ ] 不再出现 `App.tsx` 被截断或语法结构损坏的事故

---

### 33. 若再次发生文件损坏，使用明确恢复流程

#### 目标
确保出现事故时能快速回到安全状态

#### 未完成项
- [ ] 发现 parse error 后立即停止继续编辑
- [ ] 先检查 `App.tsx` 尾部是否被截断
- [ ] 必要时使用 git 恢复文件
- [ ] 恢复后重新 build 确认基线安全

#### 验收标准
- [ ] 文件损坏不会持续扩散到更多改动

---

## 八、P3：后续扩展任务（当前主线完成后再做）

### 34. 右侧 lane / 通用 lane 抽象

#### 目标
让当前 left lane 方案具备未来推广到右侧布局的可能性

#### 未完成项
- [ ] 抽象 `laneId`
- [ ] 抽象 `separatorId`
- [ ] 让 orchestrator 接受配置，而不是写死 `connection/send/response`
- [ ] 为右列预留 snapshot / planner 接口

#### 验收标准
- [ ] 左列方案不再是不可复用的硬编码

---

### 35. 进一步把集成层从 `App.tsx` 继续抽离

#### 目标
在集成稳定后，把 App 内 bridge 代码进一步瘦身

#### 未完成项
- [ ] 评估是否新增 hook 或 feature integration 模块
- [ ] 把 lower separator 专用桥接逻辑移出 `App.tsx`
- [ ] 保持 App 只负责装配，不负责细节决策

#### 验收标准
- [ ] `App.tsx` 更接近“组合层”而不是“算法层”

---

### 36. 为 planner / engine 增加可测试性或单元测试

#### 目标
降低未来继续重构时的回归风险

#### 未完成项
- [ ] 为 `engine.ts` 的 phase 迁移函数设计测试输入输出
- [ ] 为 `leftLane.ts` 的 upward/downward plan 设计关键场景测试
- [ ] 覆盖 send/connection 初始折叠组合 case

#### 验收标准
- [ ] 关键纯逻辑可独立验证
- [ ] 后续改 planner 不必完全依赖手拖验证

---

## 九、代码质量 Checklist

- [ ] phase 相关命名统一
- [ ] helper 命名清晰：`begin... / maybeEnter... / maybeRelease... / finalize... / reset...`
- [ ] 关键 phase transition 都带 reason log
- [ ] 没有新的“多布尔状态拼装”回流进主逻辑
- [ ] 注释与实际行为一致
- [ ] README / docs 与当前实现同步
- [ ] `App.tsx` 不再继续膨胀为更大的 lower separator 特例集合

---

## 十、Definition of Done

只有同时满足以下条件，才认为这轮 lower separator 重构真正完成：

### 架构层面
- [ ] `App.tsx` 已重新接入 `types.ts / engine.ts / panelController.ts / leftLane.ts`
- [ ] `lowerDragStateRef` / `leftLowerDragContextRef` 成为真实状态源
- [ ] pointer move 成为主决策入口
- [ ] `onResize` 已退居同步层

### 行为层面
- [ ] 上拖时 send 先折叠，再 cascade 到 connection
- [ ] 下拖时 response 先恢复，再释放回自由拖拽
- [ ] restore point 不会自动 expand 多个 panel
- [ ] pointer up 后状态完整 reset
- [ ] 快速抖动拖拽不会卡死或闪动

### 清理层面
- [ ] 主要危险旧 ref 已清退
- [ ] 仅保留必要辅助 ref
- [ ] `App.tsx` lower separator 逻辑显著瘦身

### 文档层面
- [ ] README 与真实实现一致
- [ ] `docs/CASCADE_DRAG_TASKS.md` 与真实进度一致
- [ ] “模块完成 / 集成完成 / 验收完成” 已明确区分

### 验证层面
- [ ] `cd frontend && npm run build` 稳定通过
- [ ] 主要手测 case 全部通过
- [ ] 发生异常时具备清晰的日志与恢复路径

---

## 十一、推荐执行顺序

### 第 1 轮：先恢复安全的最小集成骨架
- [ ] 重新加入 imports
- [ ] 重新加入 `lowerDragStateRef` / `leftLowerDragContextRef`
- [ ] 重新加入 `transitionLowerDragPhase()` / `resetLowerDragState()` / `beginLowerSeparatorDrag()` 包装层
- [ ] 先只接 pointer down / pointer up
- [ ] build 验证

### 第 2 轮：恢复 phase 迁移核心
- [ ] 接入 `maybeEnterSendLockedPhase(...)`
- [ ] 接入 `maybeEnterCascadeActivePhase(...)`
- [ ] 接入 `maybeEnterCascadeReleasingPhase(...)`
- [ ] 接入 `maybeReleaseCascadeToFreeDrag(...)`
- [ ] build 验证

### 第 3 轮：恢复 planner 驱动的 pointer move
- [ ] 小步接入 upward planner
- [ ] 小步接入 downward planner
- [ ] build 验证
- [ ] 手测 Case 1 / Case 2 / Case 3 / Case 4

### 第 4 轮：降级 onResize 与清退旧 ref
- [ ] 简化 `handleSendPanelResize`
- [ ] 简化 `handleResponsePanelResize`
- [ ] 删除危险 auto-expand
- [ ] 删除旧 ref 主流程依赖
- [ ] build 验证

### 第 5 轮：文档与收尾
- [ ] 修 README
- [ ] 修 `docs/CASCADE_DRAG_TASKS.md`
- [ ] 跑完整手测清单
- [ ] 整理 `App.tsx`

---

## 十二、当前一句话结论

当前最本质的未完成项不是“模块没写”，而是：

- [ ] **模块已存在，但 `frontend/src/App.tsx` 的运行时集成没有保住，必须重新、小步、安全地接回去。**