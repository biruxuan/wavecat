# README

## About

This is the official Wails React-TS template.

You can configure the project by editing `wails.json`. More information about the project settings can be found
here: https://wails.io/docs/reference/project-config

## Live Development

To run in live development mode, run `wails dev` in the project directory. This will run a Vite development
server that will provide very fast hot reload of your frontend changes. If you want to develop in a browser
and have access to your Go methods, there is also a dev server that runs on http://localhost:34115. Connect
to this in your browser, and you can call your Go code from devtools.

## Building

To build a redistributable, production mode package, use `wails build`.


## 未解决的问题
### 拖拽Response分区时，send/connection 两个分区会鬼畜
#### 正确逻辑

1. 当send处于折叠状态，拖动response分割栏时，send保持折叠状态，response分区正常调整大小，顶着send实时收起connection直到其折叠。
2. 当send处于展开状态，拖动response分割栏时,先折叠send,当send折叠后需要加快速度或者松开鼠标(复用逻辑1)才能继续拖动
3. 若一直不松手，持续向上拖动至send和connection都折叠，此时向下拖动则response实时展开至折叠前大小，再实时展开send最低可致response折叠；如果其中任意一个在拖动前就已经处于折叠，则折叠谁就展开谁。

## Lower Separator 重构方案

### 背景
当前 `frontend/src/App.tsx` 中下方分隔条（lower separator）相关逻辑，依赖多个布尔 ref 共同表达拖拽状态，例如：

- `lowerSeparatorAllowConnectionCascadeRef`
- `lowerSeparatorCascadeTriggeredRef`
- `lowerSeparatorLockAfterSendCollapsedRef`
- `lowerSeparatorPendingConnectionExpandRef`
- 以及若干 lock / size / pointer 追踪 ref

这种实现方式的问题是：

1. 状态语义重叠，难以推断某一时刻系统真实处于哪个阶段。
2. 状态进入/退出分散在多个分支中，容易漏 reset。
3. 交互修一个 case，容易影响另一个 case。
4. 容易出现 React state、panel 实例状态、视觉尺寸三者不同步。

因此建议将该逻辑重构为：

- **单一 phase（阶段）作为真相源**
- 少量上下文快照数据
- 集中的阶段切换 helper
- 集中的 reset helper

---

### 设计目标
重构后应满足以下目标：

1. 任意时刻只有一个明确的 lower drag phase。
2. phase 迁移是单向、可追踪、可打日志的。
3. 不依赖多个布尔 ref 组合推断状态。
4. 向下回拖时，先恢复 response，再恢复自由拖拽。
5. 不在临界点自动 expand 多个 panel，避免跳变和鬼畜。
6. pointer up / toggle / 异常中断时有统一 reset 出口。

---

### 推荐状态机
建议将 lower separator 拖拽抽象为 5 个阶段：

#### 1. `idle`
无拖拽进行中。

#### 2. `dragging_free`
普通拖拽阶段：
- send 未进入锁定态
- connection 不允许 cascade
- 只是正常拖动 separator

#### 3. `send_locked`
send 因上拖进入折叠后，进入锁定态：
- response 当前尺寸被记录为恢复点（restore point）
- connection 暂不允许继续 cascade
- 对应“send 折叠后的临时锁定阶段”

#### 4. `cascade_active`
继续上拖达到阈值后：
- send 已折叠
- 允许拖拽继续传导到 connection
- connection 可被继续压缩/折叠

#### 5. `cascade_releasing`
用户明确向下回拖后：
- 先恢复 response 到锁定前大小
- 暂不立即自动 expand send / connection
- 达到 restore point 后回到 `dragging_free`

---

### 推荐状态结构
建议在 `frontend/src/App.tsx` 中新增：

```ts
// frontend/src/App.tsx
type LowerDragPhase =
    | "idle"
    | "dragging_free"
    | "send_locked"
    | "cascade_active"
    | "cascade_releasing";

type LowerDragState = {
    phase: LowerDragPhase;
    sendCollapsedAtStart: boolean;
    connectionCollapsedAtStart: boolean;
    lockedResponseSize: number | null;
    connectionSizeAtStart: number | null;
    connectionPixelsAtStart: number | null;
};
```

并使用：

```ts
// frontend/src/App.tsx
const lowerDragStateRef = useRef<LowerDragState>({
    phase: "idle",
    sendCollapsedAtStart: false,
    connectionCollapsedAtStart: false,
    lockedResponseSize: null,
    connectionSizeAtStart: null,
    connectionPixelsAtStart: null,
});
```

---

### 建议逐步淘汰的旧 ref
重构目标不是一次性删除所有 ref，而是先让新 phase 成为真相源，再逐步清退旧 ref。

#### 优先清退对象
- `lowerSeparatorAllowConnectionCascadeRef`
- `lowerSeparatorCascadeTriggeredRef`
- `lowerSeparatorLockAfterSendCollapsedRef`
- `lowerSeparatorPendingConnectionExpandRef`

#### 可暂时保留的辅助 ref
- `lowerSeparatorDragActiveRef`
- `lowerSeparatorLockedResponseSizeRef`
- `lowerSeparatorConnectionSizeAtStartRef`
- `lowerSeparatorConnectionPixelsAtStartRef`
- pointer 速度、位移、时间追踪相关 refs

第一阶段可以让新旧并存，避免一次性重写带来更大回归风险。

---

### 核心 helper 设计

#### 1. `resetLowerDragState()`
统一重置 lower separator 拖拽态。不要再让 reset 散落在多个 if/else 分支里。

```ts
// frontend/src/App.tsx
const resetLowerDragState = () => {
    lowerDragStateRef.current = {
        phase: "idle",
        sendCollapsedAtStart: false,
        connectionCollapsedAtStart: false,
        lockedResponseSize: null,
        connectionSizeAtStart: null,
        connectionPixelsAtStart: null,
    };

    lowerSeparatorDragActiveRef.current = false;

    // 迁移期内可同步清理旧 ref
    lowerSeparatorAllowConnectionCascadeRef.current = false;
    lowerSeparatorCascadeTriggeredRef.current = false;
    lowerSeparatorLockAfterSendCollapsedRef.current = false;
    lowerSeparatorHardLockedRef.current = false;
    lowerSeparatorPendingConnectionExpandRef.current = false;

    lowerSeparatorLockedResponseSizeRef.current = null;
    lowerSeparatorConnectionSizeAtStartRef.current = null;
    lowerSeparatorConnectionPixelsAtStartRef.current = null;
    lowerSeparatorConnectionCollapsedAtStartRef.current = false;
    lowerSeparatorSendCollapsedAtStartRef.current = false;

    lowerSeparatorLastPointerYRef.current = null;
    lowerSeparatorLastPointerTimeRef.current = null;
    lowerSeparatorUpwardTravelRef.current = 0;
    lowerSeparatorUpwardFastStreakRef.current = 0;
    lowerSeparatorSpeedEmaRef.current = 0;

    setConnectionLowerSeparatorMinPercent(null);
    setConnectionLowerSeparatorLockActive(false);
};
```

#### 2. `transitionLowerDragPhase(nextPhase, reason)`
集中做阶段迁移，并打调试日志。

```ts
// frontend/src/App.tsx
const transitionLowerDragPhase = (nextPhase: LowerDragPhase, reason: string) => {
    const prevPhase = lowerDragStateRef.current.phase;
    if (prevPhase === nextPhase) {
        return;
    }

    lowerDragStateRef.current = {
        ...lowerDragStateRef.current,
        phase: nextPhase,
    };

    console.debug("[lower-drag-phase]", {
        prevPhase,
        nextPhase,
        reason,
    });
};
```

#### 3. `isLowerCascadePhase()`
统一判断当前是否属于 cascade 阶段。

```ts
// frontend/src/App.tsx
const isLowerCascadePhase = () => {
    const phase = lowerDragStateRef.current.phase;
    return phase === "cascade_active" || phase === "cascade_releasing";
};
```

---

### Phase 迁移规则

#### A. Pointer Down：进入 `dragging_free`
拖拽开始时记录快照：
- send 是否一开始就折叠
- connection 是否一开始就折叠
- connection 初始 size / pixels
- `lockedResponseSize = null`

```ts
// frontend/src/App.tsx
const beginLowerSeparatorDrag = () => {
    const connectionPercent = connectionPanelRef.current?.getSize().asPercentage;
    const connectionPixels = connectionPanelRef.current?.getSize().inPixels;

    lowerDragStateRef.current = {
        phase: "dragging_free",
        sendCollapsedAtStart: sendPanelCollapsed,
        connectionCollapsedAtStart: isConnectionPhysicallyCollapsed(),
        lockedResponseSize: null,
        connectionSizeAtStart:
            typeof connectionPercent === "number" && Number.isFinite(connectionPercent)
                ? connectionPercent
                : null,
        connectionPixelsAtStart:
            typeof connectionPixels === "number" && Number.isFinite(connectionPixels)
                ? connectionPixels
                : null,
    };

    lowerSeparatorDragActiveRef.current = true;
    setLowerSeparatorDragInProgress(true);
};
```

---

#### B. `dragging_free -> send_locked`
条件：
- 当前正在 lower drag
- send 不是一开始就折叠
- 当前拖动已让 send 进入折叠点

动作：
- 记录当前 response 大小作为 restore point
- phase 进入 `send_locked`

```ts
// frontend/src/App.tsx
const maybeEnterSendLockedPhase = (isActuallyCollapsed: boolean) => {
    const lowerDrag = lowerDragStateRef.current;

    if (
        lowerDrag.phase === "dragging_free" &&
        !lowerDrag.sendCollapsedAtStart &&
        isActuallyCollapsed
    ) {
        const lockedResponse = responsePanelRef.current?.getSize().asPercentage ?? null;

        lowerDragStateRef.current = {
            ...lowerDrag,
            phase: "send_locked",
            lockedResponseSize:
                typeof lockedResponse === "number" && Number.isFinite(lockedResponse)
                    ? lockedResponse
                    : null,
        };

        transitionLowerDragPhase("send_locked", "send collapsed during lower drag");
    }
};
```

---

#### C. `send_locked -> cascade_active`
条件：
- 用户继续上拖
- 满足位移/速度阈值

动作：
- 允许拖拽继续传导到 connection
- phase 进入 `cascade_active`

```ts
// frontend/src/App.tsx
const maybeEnterCascadeActivePhase = (shouldTriggerCascade: boolean) => {
    const lowerDrag = lowerDragStateRef.current;

    if (lowerDrag.phase !== "send_locked") {
        return;
    }
    if (!shouldTriggerCascade) {
        return;
    }

    lowerDragStateRef.current = {
        ...lowerDrag,
        phase: "cascade_active",
    };

    transitionLowerDragPhase("cascade_active", "upward cascade threshold reached");
};
```

---

#### D. `cascade_active -> cascade_releasing`
条件：
- 用户明确向下回拖
- 向下位移达到 release threshold

动作：
- phase 进入 `cascade_releasing`
- **不要在这里立即 expand send / connection**

```ts
// frontend/src/App.tsx
const maybeEnterCascadeReleasingPhase = (deltaY: number) => {
    const lowerDrag = lowerDragStateRef.current;

    if (lowerDrag.phase !== "cascade_active") {
        return;
    }
    if (deltaY < LOWER_SEPARATOR_POINTER_MIN_DOWNWARD_RELEASE_DELTA_PX) {
        return;
    }

    lowerDragStateRef.current = {
        ...lowerDrag,
        phase: "cascade_releasing",
    };

    transitionLowerDragPhase("cascade_releasing", "clear downward release gesture");
};
```

---

#### E. `cascade_releasing -> dragging_free`
条件：
- response 已恢复到 `lockedResponseSize` 附近

动作：
- 解除锁定
- phase 回到 `dragging_free`
- **仍不自动 expand send / connection**

```ts
// frontend/src/App.tsx
const maybeReleaseCascadeToFreeDrag = (currentResponsePercent: number) => {
    const lowerDrag = lowerDragStateRef.current;

    if (lowerDrag.phase !== "cascade_releasing") {
        return;
    }

    const locked = lowerDrag.lockedResponseSize;
    if (typeof locked !== "number" || !Number.isFinite(locked)) {
        lowerDragStateRef.current = {
            ...lowerDrag,
            phase: "dragging_free",
            lockedResponseSize: null,
        };
        transitionLowerDragPhase("dragging_free", "cascade releasing without valid lock");
        return;
    }

    const reachedRestorePoint =
        currentResponsePercent <= locked + PANEL_DRAG_CLAMP_EPSILON_PERCENT;

    if (!reachedRestorePoint) {
        return;
    }

    lowerDragStateRef.current = {
        ...lowerDrag,
        phase: "dragging_free",
        lockedResponseSize: null,
    };

    setConnectionLowerSeparatorMinPercent(null);
    setConnectionLowerSeparatorLockActive(false);

    transitionLowerDragPhase("dragging_free", "response restored to locked size");
};
```

---

#### F. Pointer Up：统一 `reset`
pointer up、toggle、异常中断都应走统一 reset。

```ts
// frontend/src/App.tsx
const handleLowerSeparatorPointerUp = () => {
    resetLowerDragState();
};
```

---

### 关键实施原则

#### 原则 1：Phase 是真相源
所有大分支判断优先看：

- `lowerDragStateRef.current.phase === ...`

而不是再依赖多个布尔 ref 组合推断。

#### 原则 2：不在临界点自动 expand panel
尤其在 `cascade_releasing` 达到 restore point 时：

- 不要立即 `sendPanelRef.current?.expand()`
- 不要立即 `connectionPanelRef.current?.expand()`

应当：
- 只解除级联
- 回到自由拖拽
- 让用户继续向下拖时自然展开面板

这样最稳定，能显著减少跳变和鬼畜。

#### 原则 3：reset 必须统一
所有 lower separator 相关拖拽结束都尽量经过：
- `resetLowerDragState()`

不要在多个代码分支中各自只清一半状态。

#### 原则 4：区分“视觉折叠”和“语义折叠”
后续实现中应明确区分：

- panel 只是尺寸很小（visually collapsed）
- panel 真正执行过 `collapse()`（semantically collapsed）

不要让 React state、panel API 状态、视觉尺寸三者混用。

---

### 推荐迁移顺序

#### Step 1：引入新 phase 和新 state
新增：
- `LowerDragPhase`
- `LowerDragState`
- `lowerDragStateRef`
- `transitionLowerDragPhase`
- `resetLowerDragState`

#### Step 2：先改 pointer down / pointer up
使拖拽开始/结束有统一的阶段起点和 reset 出口。

#### Step 3：改 send collapse lock
把“send 折叠后锁住 response”的逻辑改成：
- `dragging_free -> send_locked`

#### Step 4：改 cascade trigger
把“继续上拖触发 connection cascade”的逻辑改成：
- `send_locked -> cascade_active`

#### Step 5：改 downward release / restore point
把“下拖释放级联”的逻辑改成：
- `cascade_active -> cascade_releasing -> dragging_free`

#### Step 6：删自动 expand 逻辑
移除：
- `pendingConnectionExpand`
- 达到 restore point 后自动 `expand()` send/connection 的逻辑

#### Step 7：清退旧 ref
最后再删：
- `lowerSeparatorAllowConnectionCascadeRef`
- `lowerSeparatorCascadeTriggeredRef`
- `lowerSeparatorLockAfterSendCollapsedRef`
- `lowerSeparatorPendingConnectionExpandRef`

---

### 推荐最终形态
建议最终保留的 lower separator 设计为：

- phase:
  - `idle`
  - `dragging_free`
  - `send_locked`
  - `cascade_active`
  - `cascade_releasing`
- 统一 reset helper
- 统一 transition helper
- 不自动 expand panel
- 大分支全部根据 phase 决策

这是当前最稳、最容易维护、最不容易继续长出“鬼畜分支”的方案。

---

## Lower Separator 重构开发 Checklist

> 目标：将 `frontend/src/App.tsx` 中 lower separator 相关逻辑，从“多布尔 ref 拼装状态”迁移为“phase 驱动状态机”。

### A. 准备阶段
- [ ] 确认当前 lower separator 相关逻辑主要集中在 `frontend/src/App.tsx`
- [ ] 标记当前参与状态表达的旧 ref
  - [ ] `lowerSeparatorAllowConnectionCascadeRef`
  - [ ] `lowerSeparatorCascadeTriggeredRef`
  - [ ] `lowerSeparatorLockAfterSendCollapsedRef`
  - [ ] `lowerSeparatorPendingConnectionExpandRef`
  - [ ] `lowerSeparatorLockedResponseSizeRef`
  - [ ] `lowerSeparatorConnectionSizeAtStartRef`
  - [ ] `lowerSeparatorConnectionPixelsAtStartRef`
  - [ ] `lowerSeparatorSendCollapsedAtStartRef`
  - [ ] `lowerSeparatorConnectionCollapsedAtStartRef`
- [ ] 先不删除旧 ref，采用“新旧并存、逐步迁移”的方式重构

#### 验收标准
- [ ] 已明确哪些 ref 属于“核心状态”，哪些 ref 属于“辅助采样/缓存”
- [ ] 明确本轮重构不追求一次性删除全部旧逻辑

---

### B. 引入新状态机骨架
- [ ] 在 `frontend/src/App.tsx` 中新增 `LowerDragPhase`
  - [ ] `idle`
  - [ ] `dragging_free`
  - [ ] `send_locked`
  - [ ] `cascade_active`
  - [ ] `cascade_releasing`
- [ ] 新增 `LowerDragState`
- [ ] 新增 `lowerDragStateRef`
- [ ] 新增 `transitionLowerDragPhase(nextPhase, reason)`
- [ ] 新增 `resetLowerDragState()`
- [ ] 新增 `isLowerCascadePhase()` 辅助判断

#### 验收标准
- [ ] 编译通过
- [ ] 不修改现有拖拽行为前提下，新 phase 骨架已经可用
- [ ] Console 中能看到 phase transition 日志

---

### C. 改造拖拽开始 / 结束
#### 拖拽开始
- [ ] 将 lower separator pointer down / drag start 统一接入 `beginLowerSeparatorDrag()`
- [ ] 在 drag start 时记录快照：
  - [ ] `sendCollapsedAtStart`
  - [ ] `connectionCollapsedAtStart`
  - [ ] `connectionSizeAtStart`
  - [ ] `connectionPixelsAtStart`
  - [ ] `lockedResponseSize = null`
- [ ] drag start 后 phase 进入 `dragging_free`

#### 拖拽结束
- [ ] pointer up 统一接入 `resetLowerDragState()`
- [ ] toggle / collapse button / 异常中断路径也尽量复用统一 reset

#### 验收标准
- [ ] 拖拽开始时 phase 必定为 `dragging_free`
- [ ] 拖拽结束后 phase 必定回到 `idle`
- [ ] pointer up 后不存在残留 lock / pending / cascade 状态

---

### D. 改造 send 折叠后的锁定逻辑
- [ ] 找到当前“send 被拖到折叠点”的逻辑分支
- [ ] 将其改造成：`dragging_free -> send_locked`
- [ ] 在进入 `send_locked` 时记录 `lockedResponseSize`
- [ ] 迁移期内允许同步写旧 ref，但新逻辑判断应优先依赖 phase

#### 验收标准
- [ ] 当 send 初始展开、上拖至折叠时，phase 从 `dragging_free` 变为 `send_locked`
- [ ] 进入 `send_locked` 后 response 恢复点被正确记录
- [ ] 没有因为 phase 改造导致 send 提前或重复折叠

---

### E. 改造 cascade 触发逻辑
- [ ] 保留现有速度/位移阈值计算逻辑
- [ ] 将“继续上拖触发 connection cascade”改造成：`send_locked -> cascade_active`
- [ ] 后续 connection 可继续被压缩/折叠的判断，优先看 phase，而不是 `allowConnectionCascadeRef`

#### 验收标准
- [ ] send 已折叠后，继续明显上拖可触发 `cascade_active`
- [ ] `cascade_active` 期间 connection 可继续响应级联压缩
- [ ] 没有出现 send 未进入锁定态却直接进入 cascade 的情况

---

### F. 改造向下回拖释放逻辑
- [ ] 将“明确向下回拖”改造成：`cascade_active -> cascade_releasing`
- [ ] 在 `cascade_releasing` 中，只负责恢复 response 到 restore point
- [ ] 达到 restore point 后，切换：`cascade_releasing -> dragging_free`
- [ ] **不要**在这个阶段立即自动 `expand()` send / connection

#### 验收标准
- [ ] connection/send 都被压缩后，向下拖时 response 会先恢复
- [ ] 达到恢复点后，phase 回到 `dragging_free`
- [ ] 不会在恢复临界点发生 panel 跳变
- [ ] 不会因为自动 expand 造成鬼畜或闪动

---

### G. 将主要分支判断改为 phase 驱动
- [ ] 搜索 lower separator 相关条件分支
- [ ] 逐步将判断从：
  - [ ] `lowerSeparatorAllowConnectionCascadeRef.current`
  - [ ] `lowerSeparatorCascadeTriggeredRef.current`
  - [ ] `lowerSeparatorLockAfterSendCollapsedRef.current`
  改为：
  - [ ] `lowerDragStateRef.current.phase === ...`
- [ ] 保留旧 ref 仅做迁移兼容或 debug，不再作为主判断依据

#### 验收标准
- [ ] 主要分支已经以 phase 为真相源
- [ ] 阅读代码时可以仅通过 phase 推断当前所处交互阶段
- [ ] 不再需要通过多个布尔组合猜测状态

---

### H. 删除危险的自动展开逻辑
- [ ] 删除/停用 `pendingConnectionExpand` 语义
- [ ] 删除达到 restore point 后自动 `expand()` send 的逻辑
- [ ] 删除达到 restore point 后自动 `expand()` connection 的逻辑
- [ ] 保持“释放级联后回到自由拖拽，由用户继续拖动自然展开”

#### 验收标准
- [ ] 不存在恢复临界点自动展开多个 panel 的行为
- [ ] panel 展开主要由用户持续拖动自然产生
- [ ] 交互更稳定，不出现“刚到恢复点就跳一下”

---

### I. 清退旧 ref
在 phase 逻辑稳定后，再分批删除旧 ref：

#### 第一批
- [ ] `lowerSeparatorPendingConnectionExpandRef`
- [ ] 与其绑定的展开逻辑

#### 第二批
- [ ] `lowerSeparatorAllowConnectionCascadeRef`

#### 第三批
- [ ] `lowerSeparatorCascadeTriggeredRef`
- [ ] `lowerSeparatorLockAfterSendCollapsedRef`

#### 可继续保留的辅助 ref
- [ ] pointer 速度 / 采样相关 refs
- [ ] 某些 size snapshot ref（如仍确有用途）

#### 验收标准
- [ ] 删除旧 ref 后编译通过
- [ ] 不存在“删 ref 后只能靠回忆补判断”的情况
- [ ] 主要控制逻辑依旧完整可读

---

### J. 回归测试 Checklist

#### Case 1：send 初始展开，connection 初始展开
- [ ] 上拖 response separator
- [ ] send 先折叠
- [ ] 继续上拖后 connection 才进入 cascade
- [ ] 下拖时 response 先恢复，再回到自由拖拽

#### Case 2：send 初始折叠，connection 初始展开
- [ ] 上拖时 send 保持折叠
- [ ] response 正常调整
- [ ] connection 可按预期继续被顶缩/折叠
- [ ] 下拖时不会错误自动展开 send

#### Case 3：send 初始展开，connection 初始折叠
- [ ] 先折叠 send
- [ ] 再触发 cascade 时不会错误重复处理 connection 初始状态
- [ ] 下拖不会因为 connection 初始折叠而产生异常跳变

#### Case 4：send 初始折叠，connection 初始折叠
- [ ] 上拖时保持两个初始状态语义稳定
- [ ] 下拖释放 cascade 时不应立即自动展开两个 panel

#### Case 5：快速上下抖动拖拽
- [ ] 不出现 phase 卡死
- [ ] 不出现 panel 闪动
- [ ] 不出现 React state 与 panel 实例状态错位

#### Case 6：拖拽中松手、再次拖拽
- [ ] pointer up 后状态完全 reset
- [ ] 下一次拖拽能从干净状态重新开始

#### Case 7：窗口 resize 后再拖拽
- [ ] restore point 判断不失真
- [ ] 不因比例波动误触发释放或锁定

---

### K. 代码质量 Checklist
- [ ] phase 相关命名统一
- [ ] helper 命名清晰：`begin... / maybeEnter... / maybeRelease... / reset...`
- [ ] 关键 phase transition 均带 reason log
- [ ] 没有新的“多布尔状态拼装”回流进主逻辑
- [ ] 注释与实际行为一致
- [ ] README 中的状态机描述与实现保持同步

---

### L. 完成定义（Definition of Done）
只有同时满足以下条件，才认为 lower separator 重构完成：

- [ ] 主逻辑已由 phase 驱动
- [ ] 主要危险旧 ref 已清退
- [ ] pointer down / move / up 的状态迁移清晰可追踪
- [ ] 不再在 restore 临界点自动 expand panel
- [ ] 回归测试 checklist 全部通过
- [ ] README 文档与当前实现一致

---

## 第一批实际改动任务（建议先做）

> 这一批任务的目标不是立刻完成全部 lower separator 重构，而是先把**状态机骨架搭起来**，并把最容易出错的“开始/结束/reset/日志”统一掉。这样风险最低，且能为后续改主逻辑提供稳定基础。

### 批次目标
本批次只做以下四件事：

1. 在 `frontend/src/App.tsx` 中引入 `LowerDragPhase` 与 `LowerDragState`
2. 新增 `lowerDragStateRef`
3. 新增 `transitionLowerDragPhase()` 与 `resetLowerDragState()`
4. 将 lower separator 的 drag start / drag end 接入新骨架

**本批次刻意不做：**
- 不立即重写所有 if/else 分支
- 不立即删除旧 ref
- 不立即修改 cascade / releasing 的核心行为
- 不立即删除自动 expand 逻辑

也就是说，这一批是“搭骨架 + 接线 + 可观察化”，不是“彻底重写行为”。

---

### Task 1：新增类型定义
在 `frontend/src/App.tsx` 中增加：

- [ ] `LowerDragPhase`
- [ ] `LowerDragState`

建议代码：

```ts
// frontend/src/App.tsx
type LowerDragPhase =
    | "idle"
    | "dragging_free"
    | "send_locked"
    | "cascade_active"
    | "cascade_releasing";

type LowerDragState = {
    phase: LowerDragPhase;
    sendCollapsedAtStart: boolean;
    connectionCollapsedAtStart: boolean;
    lockedResponseSize: number | null;
    connectionSizeAtStart: number | null;
    connectionPixelsAtStart: number | null;
};
```

#### 验收标准
- [ ] 类型定义加入后 TypeScript 编译通过
- [ ] 命名与 README 中设计保持一致

---

### Task 2：新增 `lowerDragStateRef`
在现有 hooks/ref 区域新增：

```ts
// frontend/src/App.tsx
const lowerDragStateRef = useRef<LowerDragState>({
    phase: "idle",
    sendCollapsedAtStart: false,
    connectionCollapsedAtStart: false,
    lockedResponseSize: null,
    connectionSizeAtStart: null,
    connectionPixelsAtStart: null,
});
```

- [ ] `lowerDragStateRef` 已加入 ref 区域
- [ ] 初始值为 `idle`

#### 验收标准
- [ ] 编译通过
- [ ] 初始加载时不会影响现有交互

---

### Task 3：新增 phase transition helper
新增：

```ts
// frontend/src/App.tsx
const transitionLowerDragPhase = (nextPhase: LowerDragPhase, reason: string) => {
    const prevPhase = lowerDragStateRef.current.phase;
    if (prevPhase === nextPhase) {
        return;
    }

    lowerDragStateRef.current = {
        ...lowerDragStateRef.current,
        phase: nextPhase,
    };

    console.debug("[lower-drag-phase]", {
        prevPhase,
        nextPhase,
        reason,
    });
};
```

- [ ] helper 已加入
- [ ] 有 `prevPhase -> nextPhase` 日志
- [ ] 支持携带 `reason`

#### 验收标准
- [ ] 不影响现有拖拽逻辑
- [ ] Console 可观察 phase 跳转

---

### Task 4：新增统一 reset helper
新增：

```ts
// frontend/src/App.tsx
const resetLowerDragState = () => {
    lowerDragStateRef.current = {
        phase: "idle",
        sendCollapsedAtStart: false,
        connectionCollapsedAtStart: false,
        lockedResponseSize: null,
        connectionSizeAtStart: null,
        connectionPixelsAtStart: null,
    };

    lowerSeparatorDragActiveRef.current = false;

    // 第一轮保留旧 ref，但统一在这里清理
    lowerSeparatorAllowConnectionCascadeRef.current = false;
    lowerSeparatorCascadeTriggeredRef.current = false;
    lowerSeparatorLockAfterSendCollapsedRef.current = false;
    lowerSeparatorHardLockedRef.current = false;
    lowerSeparatorPendingConnectionExpandRef.current = false;

    lowerSeparatorLockedResponseSizeRef.current = null;
    lowerSeparatorConnectionSizeAtStartRef.current = null;
    lowerSeparatorConnectionPixelsAtStartRef.current = null;
    lowerSeparatorConnectionCollapsedAtStartRef.current = false;
    lowerSeparatorSendCollapsedAtStartRef.current = false;

    lowerSeparatorLastPointerYRef.current = null;
    lowerSeparatorLastPointerTimeRef.current = null;
    lowerSeparatorUpwardTravelRef.current = 0;
    lowerSeparatorUpwardFastStreakRef.current = 0;
    lowerSeparatorSpeedEmaRef.current = 0;

    setConnectionLowerSeparatorMinPercent(null);
    setConnectionLowerSeparatorLockActive(false);
};
```

- [ ] helper 已加入
- [ ] 原本分散在多处的 reset 逻辑，优先改为调用该 helper

#### 第一批只要求接入这些出口
- [ ] lower separator pointer up
- [ ] lower separator drag cancel / pointer cleanup
- [ ] connection toggle 时中断 lower drag

#### 验收标准
- [ ] pointer up 后 phase 回到 `idle`
- [ ] 再次拖拽时不会携带上一次残留状态
- [ ] 不会出现“已松手但仍处于 cascade/lock”现象

---

### Task 5：接入 drag start
找到 lower separator drag start / pointer down 逻辑，改为初始化 `lowerDragStateRef.current`。

建议目标：

```ts
// frontend/src/App.tsx
const beginLowerSeparatorDrag = () => {
    const connectionPercent = connectionPanelRef.current?.getSize().asPercentage;
    const connectionPixels = connectionPanelRef.current?.getSize().inPixels;

    lowerDragStateRef.current = {
        phase: "dragging_free",
        sendCollapsedAtStart: sendPanelCollapsed,
        connectionCollapsedAtStart: isConnectionPhysicallyCollapsed(),
        lockedResponseSize: null,
        connectionSizeAtStart:
            typeof connectionPercent === "number" && Number.isFinite(connectionPercent)
                ? connectionPercent
                : null,
        connectionPixelsAtStart:
            typeof connectionPixels === "number" && Number.isFinite(connectionPixels)
                ? connectionPixels
                : null,
    };

    lowerSeparatorDragActiveRef.current = true;
    setLowerSeparatorDragInProgress(true);

    console.debug("[lower-drag-start]", lowerDragStateRef.current);
};
```

- [ ] drag start 接入 `beginLowerSeparatorDrag()`
- [ ] phase 在 drag start 时进入 `dragging_free`
- [ ] 记录 start snapshot

#### 验收标准
- [ ] 每次开始拖拽都能打印新的 start snapshot
- [ ] start snapshot 与实际 panel 状态一致
- [ ] 尚未修改主逻辑前，交互行为不应明显变化

---

### Task 6：接入 drag end
将 lower separator 的 pointer up / cleanup 逻辑尽量统一改为：

- [ ] `resetLowerDragState()`

必要时允许：
- 先保留原 cleanup 内容
- 再逐步收敛进 `resetLowerDragState()`

#### 验收标准
- [ ] 结束拖拽后 `phase === idle`
- [ ] 再次拖拽前状态干净
- [ ] 快速连续拖拽时不出现粘连状态

---

### Task 7：加入 phase 调试日志观察点
第一批建议加少量日志，不要太多，避免淹没有效信息。

建议观察点：
- [ ] drag start
- [ ] pointer up / reset
- [ ] phase transition
- [ ] 当前 lower drag phase 进入关键分支时的 debug log

建议日志前缀统一：
- [ ] `[lower-drag-start]`
- [ ] `[lower-drag-phase]`
- [ ] `[lower-drag-reset]`

#### 验收标准
- [ ] 本地拖拽一轮可看清 phase 生命周期
- [ ] 不需要再通过多个旧 ref 的 log 才能理解状态

---

### 第一批禁止事项
为避免第一轮改动过大，本批次禁止同时做以下改动：

- [ ] 不删除旧 ref
- [ ] 不重写 cascade trigger 条件
- [ ] 不重写 releasing 恢复逻辑
- [ ] 不删除自动 expand 行为
- [ ] 不修改 connection collapse/expand 的真实 API 调用时机

目的：确保第一批是**低风险、可验证、可回滚**的。

---

### 第一批完成定义（DoD）
只有满足以下条件，才认为第一批完成：

- [ ] `LowerDragPhase` / `LowerDragState` / `lowerDragStateRef` 已落地
- [ ] `transitionLowerDragPhase()` 已落地
- [ ] `resetLowerDragState()` 已落地
- [ ] drag start 已接入 `dragging_free`
- [ ] drag end 已接入统一 reset
- [ ] Console 可观察一轮完整的 `idle -> dragging_free -> idle`
- [ ] 编译通过
- [ ] 现有交互没有明显行为退化

---

### 第一批完成后的下一步
第一批完成后，再进入第二批：

1. `dragging_free -> send_locked`
2. `send_locked -> cascade_active`
3. `cascade_active -> cascade_releasing`
4. `cascade_releasing -> dragging_free`
5. 将主分支判断逐步从旧 ref 切到 phase